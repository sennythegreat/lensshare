'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/admin-shell'
import { fetchAdminListings, setListingStatus } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type ListingWithOwner } from '@/lib/types'

export default function AdminEquipmentPage() {
  const { profile } = useProfile()
  const [listings, setListings] = useState<ListingWithOwner[]>([])
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  function load() {
    fetchAdminListings()
      .then((rows) => { setListings(rows); setLoaded(true) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load equipment.'))
  }
  useEffect(load, [])

  const visible = useMemo(() => listings
    .filter((l) => `${l.name} ${l.brand} ${l.category} ${l.owner?.full_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [listings, query])

  async function toggle(listing: ListingWithOwner) {
    const next = listing.status === 'available' ? 'paused' : 'available'
    setBusyId(listing.id)
    setError('')
    setListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: next } : item))
    try {
      await setListingStatus(listing.id, next)
      setBusyId(null)
    } catch (e) {
      setListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: listing.status } : item))
      setError(e instanceof Error ? e.message : 'Moderation action failed.')
      setBusyId(null)
    }
  }

  return <AdminShell title="Equipment" subtitle="Every listing on the marketplace. Pause a listing if it breaks the hub rules; the owner can re-activate it.">
    <div className="admin-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 18px' }}>
      <input className="owner-button" style={{ width: 280, background: '#fff' }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search gear, brand, or owner..." />
      <span className="admin-tag" style={{ marginLeft: 'auto' }}>{visible.length} of {listings.length} listings</span>
    </div>
    {error && <div className="admin-table"><div className="admin-row"><p className="auth-error">{error}</p></div></div>}
    <div className="admin-table">
      {visible.map((listing) => <div className="admin-row" key={listing.id}>
        <img className="admin-thumb" src={listing.image_url || '/lensshare-camera.png'} alt="" />
        <div className="admin-row-main">
          <h3>{listing.name}</h3>
          <small>{listing.owner?.full_name || 'Unknown owner'} · {listing.category} · {listing.brand}</small>
        </div>
        <div className="admin-chips">
          <strong>{pesos(Number(listing.daily_rate))}<small style={{ fontSize: 10, color: '#69716e' }}>/day</small></strong>
          <span className={`admin-pill ${listing.status}`}>{listing.status}</span>
          <button className="owner-button" disabled={busyId === listing.id} onClick={() => toggle(listing)}>
            {listing.status === 'available' ? 'Pause' : 'Activate'}
          </button>
        </div>
      </div>)}
      {loaded && !visible.length && <div className="admin-empty"><h3>No equipment found</h3><p>Try another search term.</p></div>}
      {!loaded && <div className="admin-row"><p>Loading listings…</p></div>}
    </div>
  </AdminShell>
}
