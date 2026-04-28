import { useRef } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

export default function useGeocode() {
  const cache = useRef(new Map())

  async function geocode(query) {
    const key = query.trim().toLowerCase()
    if (cache.current.has(key)) return cache.current.get(key)

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
      viewbox: '-74.05,40.68,-73.87,40.88',
      bounded: '1',
    })
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': '3d-city-viewer' },
    })
    const data = await res.json()
    if (!data.length) return null
    const result = { lon: parseFloat(data[0].lon), lat: parseFloat(data[0].lat), label: data[0].display_name.split(',')[0] }
    cache.current.set(key, result)
    return result
  }

  return geocode
}
