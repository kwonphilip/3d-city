// Map-based LRU: re-inserting a key moves it to end of insertion order,
// so eviction via keys().next() always drops the oldest entry.

export function lruGet(map, key) {
  if (!map.has(key)) return null
  const v = map.get(key)
  map.delete(key)
  map.set(key, v)
  return v
}

export function lruSet(map, key, value, limit) {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    map.delete(map.keys().next().value)
  }
}
