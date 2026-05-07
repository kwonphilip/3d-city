import { useCallback, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { dataUrl } from '../lib/dataPaths'

/**
 * Camera-proximity tile streaming loop.
 *
 * Manages the per-frame "which tiles are in range" cycle:
 * - Computes the in-range tile set from camera position + radius.
 * - Aborts fetches for tiles that drifted out of range (freeing HTTP/1 lanes).
 * - Fetches and caches raw tile JSON, then calls onDispatch.
 * - Calls onRemove when tiles leave range.
 * - Prefetches tile JSON slightly ahead of range in the camera-forward direction
 *   so that when the camera moves forward, those tiles skip the network wait.
 *
 * The caller owns loadedRef / inFlightRef / tileDataRef / abortersRef so it can
 * reset them independently (e.g. on a borough toggle) without re-mounting the hook.
 *
 * onDispatch / onRemove / tryGeomCache are stored in refs so the caller does
 * not need to stabilise them with useCallback — inline functions are fine.
 *
 * @returns {Function} forceTick — call to make the next frame run the full
 *   in-range check immediately (e.g. after manifest load or worker init).
 */

const _fwdVec = new THREE.Vector3()
const _prevLook = new THREE.Vector3(0, 0, -1)
const _prevPos = new THREE.Vector3(NaN, NaN, NaN)
// XZ-plane EMA of camera velocity (m/s). Used in steady mode to bias the
// prefetch ellipse toward where the camera is actually drifting, not just
// where it's looking.
const _velEMA = { x: 0, z: 0 }
const VEL_EMA_ALPHA = 0.5  // short half-life so reversals are seen quickly

// Burst mode: triggered by sudden camera changes (fast drag, orbit, zoom,
// minimap teleport). We can't predict where the user is heading, so we drop
// the look-direction bias, fill an omnidirectional ring, and lift throughput
// caps for a short cooldown.
const BURST_THRESHOLD = 0.4
const BURST_COOLDOWN_FRAMES = 30   // ~0.5s @ 60fps after last trigger

export function useTileStreamer({
  checkEvery = 5,
  maxInFlight,
  getManifest,   // () => manifest | null
  camera,
  getRadius,     // () => number — base render radius; hook adds camera-height scaling
  getMask,       // optional () => mask with .bboxIntersects() — skips tiles outside visible world
  loadedRef,     // Set ref owned by caller
  inFlightRef,   // Set ref owned by caller
  tileDataRef,   // Map ref owned by caller — raw tile JSON cache
  abortersRef,   // Map ref owned by caller — AbortControllers for in-flight fetches
  tryGeomCache,  // optional (tileId) => boolean — return true if served from cache + state updated
  onDispatch,    // (tileId, tileData) => void — called when raw tile data is ready
  onRemove,      // (tileIds: string[]) => void — called when tiles leave range
}) {
  // Sync callbacks into refs on every render so useFrame always calls the
  // current version without stale-closure issues.
  const onDispatchRef = useRef(onDispatch)
  onDispatchRef.current = onDispatch

  const onRemoveRef = useRef(onRemove)
  onRemoveRef.current = onRemove

  const tryGeomCacheRef = useRef(tryGeomCache)
  tryGeomCacheRef.current = tryGeomCache

  const frameRef = useRef(0)
  const burstUntilRef = useRef(0)

  useFrame((_, delta) => {
    // Motion detection runs every frame (never gated) so a burst trigger
    // doesn't get missed in the 4-out-of-5 frames the streamer normally skips.
    const cx0 = camera.position.x, cy0 = camera.position.y, cz0 = camera.position.z
    camera.getWorldDirection(_fwdVec)
    let motionScore = 0
    if (Number.isFinite(_prevPos.x)) {
      const dposSq = (cx0 - _prevPos.x) ** 2 + (cy0 - _prevPos.y) ** 2 + (cz0 - _prevPos.z) ** 2
      const dpos = Math.sqrt(dposSq)
      const dotLook = Math.max(-1, Math.min(1, _fwdVec.dot(_prevLook)))
      const dlook = Math.acos(dotLook)
      const dyrel = Math.abs(cy0 - _prevPos.y) / Math.max(1, cy0)
      // Weights tuned so a fast drag (~50–200m/frame) or noticeable orbit
      // (~0.05 rad/frame) crosses the 0.4 threshold but slow drift does not.
      motionScore = dpos / 50 + dlook * 2 + dyrel * 5
      // EMA the XZ velocity for steady-mode prefetch bias. Per-frame velocity
      // is too noisy; a short EMA is responsive enough to track reversals.
      if (delta > 0) {
        const vx = (cx0 - _prevPos.x) / delta
        const vz = (cz0 - _prevPos.z) / delta
        _velEMA.x = _velEMA.x * (1 - VEL_EMA_ALPHA) + vx * VEL_EMA_ALPHA
        _velEMA.z = _velEMA.z * (1 - VEL_EMA_ALPHA) + vz * VEL_EMA_ALPHA
      }
    }
    _prevPos.set(cx0, cy0, cz0)
    _prevLook.copy(_fwdVec)

    if (motionScore > BURST_THRESHOLD) {
      burstUntilRef.current = frameRef.current + BURST_COOLDOWN_FRAMES
    }
    const isBurst = frameRef.current < burstUntilRef.current
    // In burst mode, run the streaming check every frame so newly-near tiles
    // dispatch immediately instead of waiting up to 5 frames (~80ms).
    const tickEvery = isBurst ? 1 : checkEvery

    if (++frameRef.current % tickEvery !== 0) return
    const manifest = getManifest()
    if (!manifest) return

    const { x, y, z } = camera.position
    // Scale radius with camera height so the city stays populated when zoomed
    // out (the slider sets the floor, altitude raises the ceiling).
    const radius = Math.max(getRadius(), y * 1.5)
    const mask = getMask?.()

    // Camera forward direction (already computed above).
    const fmag = Math.hypot(_fwdVec.x, _fwdVec.z) || 1e-6
    let ux = _fwdVec.x / fmag
    let uz = _fwdVec.z / fmag
    // pitch: 0 = straight down (overhead), 1 = fully horizontal (horizon).
    const pitch = Math.min(1, fmag)

    // Steady-mode velocity bias: when the camera is drifting (slow continuous
    // pan, below burst threshold), tilt the bias direction toward motion so
    // the ellipse and prefetch lean where the camera is actually heading,
    // not just where it's looking. Skipped in burst (already omnidirectional).
    if (!isBurst) {
      const speed = Math.hypot(_velEMA.x, _velEMA.z)
      if (speed > 10) {  // m/s — quieter than walking pace; ignore noise
        const w = Math.min(0.5, speed / 400)  // blend weight, capped at 50%
        const bx = ux * (1 - w) + (_velEMA.x / speed) * w
        const bz = uz * (1 - w) + (_velEMA.z / speed) * w
        const bmag = Math.hypot(bx, bz) || 1
        ux = bx / bmag
        uz = bz / bmag
      }
    }

    // Ellipse radii: stretch forward, tighten behind, keep sides at base radius.
    // In burst mode collapse to a circle of radius*1.3 — we don't know which
    // way the user is heading, so fill the disk evenly.
    const forwardR = isBurst ? radius * 1.3 : radius * (1 + pitch * 1.5)
    const backR    = isBurst ? radius * 1.3 : radius * Math.max(0.5, 1 - pitch * 0.4)
    const sideR    = isBurst ? radius * 1.3 : radius
    const prefetchR = forwardR * 1.4

    // Burst lifts throughput caps so the wider ring fills before the cooldown
    // expires. Workers stay capped (CPU-bound) but the fetch pipeline doesn't.
    const effectiveMaxInFlight = isBurst ? maxInFlight * 2 : maxInFlight
    const effectivePrefetchCap = isBurst ? 8 : 3

    // --- Compute which tiles are in range (elliptical test) ---
    const inRange = new Set()
    const inPrefetch = new Set()
    const distById = new Map()
    for (const t of manifest.tiles) {
      if (mask && !mask.bboxIntersects(t.bounds)) continue
      const tcx = (t.bounds.minX + t.bounds.maxX) / 2
      const tcz = (t.bounds.minZ + t.bounds.maxZ) / 2
      const dx = tcx - x, dz = tcz - z
      const along = dx * ux + dz * uz       // signed forward component
      const cross = -dx * uz + dz * ux      // perpendicular component

      const longR = along >= 0 ? forwardR : backR
      const ellipseD2 = (along * along) / (longR * longR) + (cross * cross) / (sideR * sideR)
      if (ellipseD2 < 1) {
        inRange.add(t.id)
        // Store approximate Euclidean d² for nearest-first sort.
        distById.set(t.id, dx * dx + dz * dz)
      } else if (isBurst || along > 0) {
        // Outside in-range ellipse — candidate for prefetch. In burst mode
        // prefetch in all directions; otherwise only ahead of look.
        const prefetchD2 = (along * along) / (prefetchR * prefetchR) + (cross * cross) / (sideR * sideR)
        if (prefetchD2 < 1) inPrefetch.add(t.id)
      }
    }

    // --- Abort fetches for tiles that drifted out of range ---
    // Freeing the HTTP/1 connection lane immediately lets the new nearby tiles
    // dispatch on this same tick instead of queueing behind stale fetches.
    for (const id of inFlightRef.current) {
      if (inRange.has(id)) continue
      const ac = abortersRef.current.get(id)
      if (ac) { ac.abort(); abortersRef.current.delete(id) }
      inFlightRef.current.delete(id)
    }

    // --- Sort candidates nearest-first so the maxInFlight cap clips far tiles ---
    // Camera-move re-prioritisation is implicit — each tick rebuilds this list.
    const candidates = []
    for (const t of manifest.tiles) {
      if (!inRange.has(t.id)) continue
      if (loadedRef.current.has(t.id) || inFlightRef.current.has(t.id)) continue
      candidates.push(t)
    }
    candidates.sort((a, b) => distById.get(a.id) - distById.get(b.id))

    for (const t of candidates) {
      if (inFlightRef.current.size >= effectiveMaxInFlight) break
      inFlightRef.current.add(t.id)

      // Geom-cache hit: caller updates render state and returns true; the hook
      // promotes the tile from in-flight to loaded and skips fetch + dispatch.
      if (tryGeomCacheRef.current?.(t.id)) {
        inFlightRef.current.delete(t.id)
        loadedRef.current.add(t.id)
        continue
      }

      // Tile-data cache hit: skip the fetch and dispatch the cached JSON directly.
      const cached = tileDataRef.current.get(t.id)
      if (cached) {
        onDispatchRef.current(t.id, cached)
        continue
      }

      // Fresh fetch.
      const ac = new AbortController()
      abortersRef.current.set(t.id, ac)
      fetch(dataUrl(t.file), { signal: ac.signal })
        .then((r) => r.json())
        .then((data) => {
          abortersRef.current.delete(t.id)
          tileDataRef.current.set(t.id, data)
          // Tick may have evicted this tile while the fetch was in flight.
          // The data is cached for return visits; skip dispatch if unwanted.
          if (!inFlightRef.current.has(t.id)) return
          onDispatchRef.current(t.id, data)
        })
        .catch((err) => {
          abortersRef.current.delete(t.id)
          if (err?.name !== 'AbortError') inFlightRef.current.delete(t.id)
        })
    }

    // --- Prefetch tile JSON for tiles just ahead of the in-range ellipse ---
    // Cap is lifted in burst mode so a sudden direction change has warm JSON
    // ready when those tiles enter range. These go only into tileDataRef,
    // never into inFlightRef/loadedRef, so they don't render.
    let prefetchCount = 0
    for (const t of manifest.tiles) {
      if (prefetchCount >= effectivePrefetchCap) break
      if (!inPrefetch.has(t.id)) continue
      if (loadedRef.current.has(t.id)) continue
      if (inFlightRef.current.has(t.id)) continue
      if (tileDataRef.current.has(t.id)) continue
      prefetchCount++
      fetch(dataUrl(t.file))
        .then((r) => r.json())
        .then((data) => { tileDataRef.current.set(t.id, data) })
        .catch(() => {})
    }

    // --- Remove tiles that left range ---
    const toRemove = []
    for (const id of loadedRef.current) {
      if (!inRange.has(id)) toRemove.push(id)
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) loadedRef.current.delete(id)
      onRemoveRef.current(toRemove)
    }
  })

  // Stable across renders since checkEvery is a constant. Callers include this
  // in effect deps to force the next frame to run the full in-range check
  // (e.g. after manifest loads or worker pool is ready).
  const forceTick = useCallback(() => { frameRef.current = checkEvery - 1 }, [checkEvery])

  // Warm tileDataRef for tiles within `radius` of (x, z) without rendering
  // them. Called for known destinations (minimap clicks, address search) so
  // the network fetch completes during the camera flight, leaving only the
  // worker extrude when the streamer's burst tick picks them up on arrival.
  const prefetchAround = useCallback((x, z, radius) => {
    const manifest = getManifest()
    if (!manifest) return
    const r2 = radius * radius
    for (const t of manifest.tiles) {
      const cx = (t.bounds.minX + t.bounds.maxX) / 2
      const cz = (t.bounds.minZ + t.bounds.maxZ) / 2
      const dx = cx - x, dz = cz - z
      if (dx * dx + dz * dz > r2) continue
      if (tileDataRef.current.has(t.id)) continue
      if (inFlightRef.current.has(t.id)) continue
      fetch(dataUrl(t.file))
        .then((r) => r.json())
        .then((data) => { tileDataRef.current.set(t.id, data) })
        .catch(() => {})
    }
  }, [getManifest, tileDataRef, inFlightRef])

  return { forceTick, prefetchAround }
}
