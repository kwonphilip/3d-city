import { useCallback, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { dataUrl } from '../lib/dataPaths'

/**
 * Camera-proximity tile streaming loop.
 *
 * Manages the per-frame "which tiles are in range" cycle:
 * - Computes the in-range tile set from camera position + radius.
 * - Aborts fetches for tiles that drifted out of range (freeing HTTP/1 lanes).
 * - Fetches and caches raw tile JSON, then calls onDispatch.
 * - Calls onRemove when tiles leave range.
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
export function useTileStreamer({
  checkEvery = 15,
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
    const r2 = radius * radius
    const mask = getMask?.()

    // --- Compute which tiles are in range ---
    const inRange = new Set()
    const distById = new Map()
    for (const t of manifest.tiles) {
      // Skip tiles whose bbox lies entirely outside the visible world (saves
      // fetches for far Long Island / NJ tiles when using the NYC mask).
      if (mask && !mask.bboxIntersects(t.bounds)) continue
      const cx = (t.bounds.minX + t.bounds.maxX) / 2
      const cz = (t.bounds.minZ + t.bounds.maxZ) / 2
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz)
      if (d2 < r2) {
        inRange.add(t.id)
        distById.set(t.id, d2)
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
