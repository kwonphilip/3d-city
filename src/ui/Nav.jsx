import { useState } from 'react'
import { useSelectionStore } from '../context/SelectionContext'
import useGeocode from '../hooks/useGeocode'
import './Nav.css'

export default function Nav() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(null) // null | 'searching' | 'notfound'
  const { fly } = useSelectionStore()
  const geocode = useGeocode()

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setStatus('searching')
    try {
      const result = await geocode(query)
      if (!result) { setStatus('notfound'); return }
      fly(result.label, result.lon, result.lat)
      setStatus(null)
      setQuery('')
    } catch {
      setStatus('notfound')
    }
  }

  return (
    <nav className="nav">
      <form className="nav-search" onSubmit={handleSearch}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setStatus(null) }}
          placeholder="Search address…"
          className={status === 'notfound' ? 'error' : ''}
          aria-label="Address search"
        />
        <button type="submit" disabled={status === 'searching'}>
          {status === 'searching' ? '…' : '→'}
        </button>
      </form>
      {status === 'notfound' && <p className="nav-error">No results found</p>}
    </nav>
  )
}
