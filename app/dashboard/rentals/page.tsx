'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchOwnerBookings, fetchOwnerListings, updateBookingStatus } from '@/lib/data'
import { OwnerShell, PageCard, Status } from '@/components/owner-shell'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingStatus, type BookingWithRelations } from '@/lib/types'

const filters = ['ALL', 'PENDING', 'APPROVED', 'ACTIVE', 'RETURNED', 'COMPLETED', 'DECLINED'] as const

const NEXT_ACTION: Partial<Record<BookingStatus, { label: string; next: BookingStatus }>> = {
  approved: { label: 'Confirm hand-off · start rental', next: 'active' },
  active: { label: 'Mark returned', next: 'returned' },
  returned: { label: 'Complete & settle', next: 'completed' },
}

function shortId(id: string) { return `#${id.slice(0, 8).toUpperCase()}` }
function dateLabel(booking: BookingWithRelations) {
  const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(booking.start_date)} – ${fmt(booking.end_date)}, ${new Date(`${booking.end_date}T00:00:00`).getFullYear()}`
}

export default function RentalsPage() {
  const { user, loading: profileLoading } = useProfile()
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [listedCount, setListedCount] = useState(0)
  const [filter, setFilter] = useState<(typeof filters)[number]>('ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('start')
  const [selected, setSelected] = useState<BookingWithRelations | null>(null)
  const [checklist, setChecklist] = useState<BookingWithRelations | null>(null)
  const [checklistSaved, setChecklistSaved] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    function load() {
      fetchOwnerBookings(user!.id)
        .then((rows) => { if (!cancelled) { setBookings(rows); setLoaded(true) } })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load bookings.') })
    }
    load()
    fetchOwnerListings(user.id).then((rows) => { if (!cancelled) setListedCount(rows.length) }).catch(() => {})

    // Realtime: renter requests and status changes appear without a refresh.
    const supabase = createClient()
    const channel = supabase
      .channel(`owner-bookings-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `owner_id=eq.${user.id}` }, () => load())
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [user])

  function patchStatus(id: string, status: BookingStatus) {
    setBookings((current) => current.map((item) => item.id === id ? { ...item, status } : item))
    setSelected((current) => current && current.id === id ? { ...current, status } : current)
  }

  async function decide(booking: BookingWithRelations, status: BookingStatus) {
    patchStatus(booking.id, status)
    setSelected(null)
    try {
      await updateBookingStatus(booking.id, status)
    } catch (e) {
      patchStatus(booking.id, booking.status)
      setError(e instanceof Error ? e.message : 'Status update failed.')
    }
  }

  const visible = useMemo(() => bookings
    .filter((r) => (filter === 'ALL' || r.status.toUpperCase() === filter) && `${r.listing?.name ?? ''} ${r.listing?.brand ?? ''} ${r.renter?.full_name ?? ''} ${shortId(r.id)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'price' ? b.total - a.total : sort === 'name' ? (a.listing?.name ?? '').localeCompare(b.listing?.name ?? '') : sort === 'recent' ? a.created_at.localeCompare(b.created_at) : a.start_date.localeCompare(b.start_date)), [bookings, filter, query, sort])

  const activeCount = bookings.filter((b) => b.status === 'active').length
  const pendingEscrow = bookings.filter((b) => b.status === 'pending' || b.status === 'approved').reduce((sum, b) => sum + Number(b.total), 0)

  return <OwnerShell title="Manage Rentals" subtitle="Review requests, coordinate handoffs, and keep every booking moving.">
    <div className="owner-stats">
      <PageCard><span className="owner-eyebrow">ACTIVE RENTALS</span><strong>{activeCount} Active {activeCount === 1 ? 'Unit' : 'Units'}</strong><p>Handoffs at Naga City Hub</p></PageCard>
      <PageCard><span className="owner-eyebrow">GEAR LISTED</span><strong>{listedCount} Listed {listedCount === 1 ? 'Kit' : 'Kits'}</strong><p>Live on the marketplace</p></PageCard>
      <PageCard><span className="owner-eyebrow">PENDING IN ESCROW</span><strong>{pesos(pendingEscrow)}</strong><p>Pending + approved bookings</p></PageCard>
    </div>
    <div className="owner-toolbar rentals-toolbar"><span className="owner-toolbar-note">{visible.length} of {bookings.length} bookings shown · realtime updates on</span><div className="rental-tools"><input aria-label="Search rentals" placeholder="Search gear, renter, or booking..." value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Sort rentals" value={sort} onChange={(e) => setSort(e.target.value)}><option value="start">Sort: start date</option><option value="price">Sort: rental price</option><option value="name">Sort: equipment name</option><option value="recent">Sort: recent booking</option></select></div></div>
    <div className="owner-filters rental-filters">{filters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item === 'ALL' ? 'All Rentals' : item[0] + item.slice(1).toLowerCase()}</button>)}</div>
    {error && <PageCard><p className="auth-error">{error}</p></PageCard>}
    <PageCard>{visible.length ? <div className="owner-table">{visible.map((row) => <div className="owner-row" key={row.id}><div><Status>{row.status.toUpperCase()}</Status><h3>{row.listing?.name || 'Removed listing'}</h3><p>{dateLabel(row)} · {row.renter?.full_name || 'Renter'} · {shortId(row.id)}</p></div><strong>{pesos(Number(row.total))}</strong><div className="rental-actions"><button className="owner-button" onClick={() => setSelected(row)}>View details</button>{row.status === 'active' || row.status === 'approved' ? <button className="owner-button" onClick={() => { setChecklist(row); setChecklistSaved(false) }}>View checklist</button> : null}</div></div>)}</div> : <div className="owner-empty"><h3>{profileLoading || !loaded ? 'Loading bookings…' : 'No matching rentals'}</h3><p>{profileLoading || !loaded ? 'Fetching your live booking data.' : 'Try another status or search term.'}</p></div>}</PageCard>
    {selected && <div className="owner-modal-backdrop" onClick={() => setSelected(null)}><section className="owner-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}>×</button><img src={selected.listing?.image_url || '/lensshare-camera.png'} alt="" /><span className="owner-eyebrow">BOOKING {shortId(selected.id)} · {selected.status.toUpperCase()}</span><h2>{selected.listing?.name || 'Removed listing'}</h2><p>{selected.listing?.brand} · rented by {selected.renter?.full_name || 'renter'}</p><div className="modal-grid"><div><small>Rental dates</small><strong>{dateLabel(selected)} ({selected.days} {selected.days === 1 ? 'day' : 'days'})</strong></div><div><small>Rental price</small><strong>{pesos(Number(selected.total))}</strong></div><div><small>Shoot description</small><strong>{selected.shoot_description || 'No description provided.'}</strong></div><div><small>Handoff</small><strong>Naga City Hub · 09:00 AM morning call</strong></div></div><div className="modal-actions">{selected.status === 'pending' && <><button className="owner-button dark" onClick={() => decide(selected, 'approved')}>Approve request</button><button className="owner-button" onClick={() => decide(selected, 'declined')}>Decline</button></>}{NEXT_ACTION[selected.status] && <button className="owner-button dark" onClick={() => decide(selected, NEXT_ACTION[selected.status]!.next)}>{NEXT_ACTION[selected.status]!.label}</button>}{selected.status === 'active' || selected.status === 'approved' ? <button className="owner-button" onClick={() => { setChecklist(selected); setSelected(null); setChecklistSaved(false) }}>View checklist</button> : null}</div><p className="demo-note">Status changes are saved to the database instantly and appear in the renter's workspace in real time.</p></section></div>}
    {checklist && <div className="owner-modal-backdrop" onClick={() => setChecklist(null)}><section className="owner-modal checklist-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setChecklist(null)}>×</button><span className="owner-eyebrow">CHECKLIST · {shortId(checklist.id)}</span><h2>{checklist.listing?.name}</h2><p>{checklist.renter?.full_name} · {checklist.status.toUpperCase()}</p>{['Confirm equipment identity and model','Inspect equipment condition','Verify included accessories','Record condition notes','Confirm scheduled Naga City Hub handoff','Confirm equipment has been returned','Record missing or damaged items','Add post-rental inspection notes'].map((item) => <label className="check-item" key={item}><input type="checkbox" />{item}</label>)}<div className="modal-actions"><button className="owner-button dark" onClick={() => setChecklistSaved(true)}>Save checklist</button><button className="owner-button" onClick={() => setChecklist(null)}>Cancel</button></div>{checklistSaved && <p className="auth-success">Checklist noted. Physical inspection should be confirmed in person at the hub.</p>}</section></div>}
  </OwnerShell>
}
