import { useEffect, useState } from 'react'
import { loadMask } from '../lib/nycMask'

export default function useNycMask() {
  const [mask, setMask] = useState(null)
  useEffect(() => {
    let cancelled = false
    loadMask()
      .then((m) => { if (!cancelled) setMask(m) })
      .catch(() => { /* keep null; consumers fall back to "render nothing" */ })
    return () => { cancelled = true }
  }, [])
  return mask
}
