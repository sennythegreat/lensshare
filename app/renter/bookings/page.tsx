'use client'
import { useEffect, useMemo, useState } from 'react'
import { Eye, Search } from 'lucide-react'
import { RenterShell, Status } from '@/components/renter-shell'
import { createClient } from '@/lib/supabase/client'
import { fetchRenterBookings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingWithRelations } from '@/lib/types'
import '../renter.css'

const TABS = ['All Bookings', 'Pending', 'Approved', 'Active', 'Completed']

function label(status: string) { return status[0].toUpperCase() + status.slice(1) }
function shortId(id: string) { return `#${id.slice(0, 8).toUpperCase()}` }
function dateLabel(booking: BookingWithRelations) {
  const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(booking.start_date)} – ${fmt(booking.end_date)}`
}

export default function BookingsPage() {
  const { user } = useProfile()
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [filter, setFilter] = useState('All Bookings')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<BookingWithRelations | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    function load() {
      fetchRenterBookings(user!.id)
        .then((rows) => { if (!cancelled) { setBookings(rows); setLoaded(true) } })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load bookings.') })
    }
    load()

    // Realtime: owner approvals and status changes appear without a refresh.
    const supabase = createClient()
    const channel = supabase
      .channel(`renter-bookings-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `renter_id=eq.${user.id}` }, () => load())
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [user])

  const list = useMemo(() => bookings.filter((b) => (filter === 'All Bookings' || label(b.status) === filter) && `${b.listing?.name ?? ''} ${b.owner?.full_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [bookings, filter, query])

  return <RenterShell title="My Bookings" subtitle="Track your rental requests, handoffs, and completed shoots."><div className="renter-toolbar"><div className="renter-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bookings..." /></div><div className="renter-tabs">{TABS.map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div>{error && <section className="renter-card"><p className="auth-error">{error}</p></section>}<section className="renter-list">{list.map(booking => <article className="renter-booking" key={booking.id}><img src={booking.listing?.image_url || '/lensshare-camera.png'} alt=""/><div><p className="eyebrow">{shortId(booking.id)} · {booking.owner?.full_name || 'Owner'}</p><h2>{booking.listing?.name || 'Removed listing'}</h2><p>{dateLabel(booking)} · {booking.days} rental {booking.days === 1 ? 'day' : 'days'}</p><strong>{pesos(Number(booking.total))}</strong></div><div className="renter-booking-actions"><Status tone={booking.status === 'pending' ? 'pending' : 'teal'}>{label(booking.status)}</Status><button onClick={() => setSelected(booking)}><Eye size={14}/> View details</button></div></article>)}{loaded && !list.length && <div className="owner-empty"><h3>No bookings found</h3><p>Try another status or browse verified equipment.</p></div>}</section>{selected && <div className="owner-modal-backdrop" onClick={() => setSelected(null)}><section className="owner-modal" role="dialog" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">BOOKING DETAILS · {shortId(selected.id)}</p><h2>{selected.listing?.name || 'Removed listing'}</h2><p>{dateLabel(selected)} · owner {selected.owner?.full_name || 'Owner'}</p><div className="modal-grid"><div><small>Status</small><strong><Status tone={selected.status === 'pending' ? 'pending' : 'teal'}>{label(selected.status)}</Status></strong></div><div><small>Rental total</small><strong>{pesos(Number(selected.total))}</strong></div><div><small>Shoot description</small><strong>{selected.shoot_description || 'No description provided.'}</strong></div><div><small>Handoff</small><strong>Naga City Hub · 09:00 AM morning call</strong></div></div><p className="demo-note">Statuses update live: when the owner approves your request, this booking changes without a refresh.</p></section></div>}</RenterShell> }
