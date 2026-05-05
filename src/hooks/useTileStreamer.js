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

  useFrame(() => {
    if (++frameRef.current % checkEvery !== 0) return
    const manifest = getManifest()
    if (!manifest) return

    const { x, y, z } = camera.position
    // Scale radius with camera height so the city stays populated when zoomed
    // out (the slider sets the floor, altitude raises the ceiling).
    const radius = Math.max(getRadius(), y * 1.5)
    const mask = getMask?.()

    // Camera forward direction projected onto the XZ plane.
    // Used to elongate the in-range test forward (more tiles where the camera
    // looks) and to prefetch tiles just outside range in that direction.
    camera.getWorldDirection(_fwdVec)
    const fmag = Math.hypot(_fwdVec.x, _fwdVec.z) || 1e-6
    const ux = _fwdVec.x / fmag
    const uz = _fwdVec.z / fmag
    // pitch: 0 = straight down (overhead), 1 = fully horizontal (horizon).
    const pitch = Math.min(1, fmag)

    // Ellipse radii: stretch forward, tighten behind, keep sides at base radius.
    const forwardR = radius * (1 + pitch * 1.5)   // up to 2.5× ahead at horizon
    const backR    = radius * Math.max(0.5, 1 - pitch * 0.4)
    const sideR    = radius
    const prefetchR = forwardR * 1.4               // prefetch ring edge in front

    // --- Compute which tiles are in range (elliptical test) ---
    const inRange = new Set()
    const inPrefetch = new Set()
    const distById = new Map()
    for (const t of manifest.tiles) {
      if (mask && !mask.bboxIntersects(t.bounds)) continue
      const cx = (t.bounds.minX + t.bounds.maxX) / 2
      const cz = (t.bounds.minZ + t.bounds.maxZ) / 2
      const dx = cx - x, dz = cz - z
      const along = dx * ux + dz * uz       // signed forward component
      const cross = -dx * uz + dz * ux      // perpendicular component

      const longR = along >= 0 ? forwardR : backR
      const ellipseD2 = (along * along) / (longR * longR) + (cross * cross) / (sideR * sideR)
      if (ellipseD2 < 1) {
        inRange.add(t.id)
        // Store approximate Euclidean d² for nearest-first sort.
        distById.set(t.id, dx * dx + dz * dz)
      } else if (along > 0) {
        // Outside in-range ellipse but in front — candidate for prefetch.
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
      if (inFlightRef.current.size >= maxInFlight) break
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
    // Capped at 3 per tick to avoid flooding the network. These go only into
    // tileDataRef, never into inFlightRef/loadedRef, so they don't render.
    let prefetchCount = 0
    for (const t of manifest.tiles) {
      if (prefetchCount >= 3) break
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
  return useCallback(() => { frameRef.current = checkEvery - 1 }, [checkEvery])
}
