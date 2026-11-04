'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchBookingHandoffs, fetchBookingReviews, fetchOwnerBookings, fetchOwnerListings, saveHandoff, submitReview, updateBookingStatus } from '@/lib/data'
import { isHubWorkflow } from '@/lib/rental-workflow'
import { OwnerShell, PageCard, Status } from '@/components/owner-shell'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { ReportIncidentModal } from '@/components/report-incident-modal'
import { useProfile } from '@/lib/use-profile'
import { pesos, renterVerificationLabel, type BookingHandoff, type BookingStatus, type BookingWithRelations, type HandoffStage, type Review } from '@/lib/types'

const filters = ['ALL', 'PENDING', 'APPROVED', 'ACTIVE', 'RETURNED', 'COMPLETED', 'DECLINED'] as const

const NEXT_ACTION: Partial<Record<BookingStatus, { label: string; next: BookingStatus }>> = {
  approved: { label: 'Confirm hand-off · start rental', next: 'active' },
  active: { label: 'Mark returned', next: 'returned' },
  returned: { label: 'Complete & settle', next: 'completed' },
}

const PICKUP_CHECKLIST = [
  'Confirm equipment identity and model',
  'Inspect equipment condition together',
  'Verify included accessories',
  'Record condition notes',
  'Confirm the exact handoff time and place with the renter in Messages',
]

const RETURN_CHECKLIST = [
  'Confirm equipment has been returned',
  'Inspect for damage beyond normal wear',
  'Verify all accessories returned',
  'Record missing or damaged items',
  'Add post-rental inspection notes',
]

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
  const [reporting, setReporting] = useState(false)
  const [checklistBooking, setChecklistBooking] = useState<BookingWithRelations | null>(null)
  const [checklistStage, setChecklistStage] = useState<HandoffStage>('pickup')
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({})
  const [checklistState, setChecklistState] = useState<'loading' | 'ready' | 'saved' | 'error'>('ready')
  const [reviewBooking, setReviewBooking] = useState<BookingWithRelations | null>(null)
  const [reviewedBookings, setReviewedBookings] = useState<string[]>([])
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewState, setReviewState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
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

  function openChecklist(booking: BookingWithRelations, stage: HandoffStage) {
    setChecklistBooking(booking)
    setChecklistStage(stage)
    setChecklistState('loading')
    setChecklistItems({})
    if (!user) return
    fetchBookingHandoffs(booking.id)
      .then((rows) => {
        const own = rows.find((row) => row.party === 'owner' && row.stage === stage)
        setChecklistItems(own?.checklist ?? {})
        setChecklistState('ready')
      })
      .catch(() => setChecklistState('error'))
  }

  async function saveChecklist() {
    if (!checklistBooking || !user) return
    try {
      await saveHandoff(checklistBooking.id, user.id, 'owner', checklistStage, checklistItems)
      setChecklistState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the checklist.')
      setChecklistState('error')
    }
  }

  async function openReview(booking: BookingWithRelations) {
    setReviewBooking(booking)
    setReviewRating(5)
    setReviewComment('')
    setReviewState('idle')
    try {
      const rows: Review[] = await fetchBookingReviews(booking.id)
      if (user && rows.some((row) => row.reviewer_id === user.id)) setReviewState('done')
    } catch { /* treat as not yet reviewed */ }
  }

  async function handleReview() {
    if (!reviewBooking || !user) return
    setReviewState('busy')
    try {
      await submitReview({
        booking_id: reviewBooking.id,
        listing_id: reviewBooking.listing_id,
        reviewer_id: user.id,
        reviewee_id: reviewBooking.renter_id,
        rating: reviewRating,
        comment: reviewComment || null,
      })
      setReviewedBookings((current) => [...current, reviewBooking.id])
      setReviewState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the review.')
      setReviewState('error')
    }
  }

  const visible = useMemo(() => bookings
    .filter((r) => (filter === 'ALL' || r.status.toUpperCase() === filter) && `${r.listing?.name ?? ''} ${r.listing?.brand ?? ''} ${r.renter?.full_name ?? ''} ${shortId(r.id)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'price' ? b.subtotal - a.subtotal : sort === 'name' ? (a.listing?.name ?? '').localeCompare(b.listing?.name ?? '') : sort === 'recent' ? b.created_at.localeCompare(a.created_at) : a.start_date.localeCompare(b.start_date)), [bookings, filter, query, sort])

  const activeCount = bookings.filter((b) => b.status === 'active').length
  const pendingSettlement = bookings.filter((b) => b.status === 'pending' || b.status === 'approved').reduce((sum, b) => sum + Number(b.subtotal), 0)

  return <OwnerShell title="Manage Rentals" subtitle="Review requests, coordinate handoffs, and keep every booking moving.">
    <div className="owner-stats">
      <PageCard><span className="owner-eyebrow">ACTIVE RENTALS</span><strong>{activeCount} Active {activeCount === 1 ? 'Unit' : 'Units'}</strong><p>Version-2 custody transfers are recorded at Naga Hub</p></PageCard>
      <PageCard><span className="owner-eyebrow">GEAR LISTED</span><strong>{listedCount} Listed {listedCount === 1 ? 'Kit' : 'Kits'}</strong><p>Live on the marketplace</p></PageCard>
      <PageCard><span className="owner-eyebrow">PENDING SETTLEMENT BASIS</span><strong>{pesos(pendingSettlement)}</strong><p>Rental subtotals for pending + approved bookings</p></PageCard>
    </div>
    <div className="owner-toolbar rentals-toolbar"><span className="owner-toolbar-note">{visible.length} of {bookings.length} bookings shown · realtime updates on</span><div className="rental-tools"><input aria-label="Search rentals" placeholder="Search gear, renter, or booking..." value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Sort rentals" value={sort} onChange={(e) => setSort(e.target.value)}><option value="start">Sort: start date</option><option value="price">Sort: rental price</option><option value="name">Sort: equipment name</option><option value="recent">Sort: latest request</option></select></div></div>
    <div className="owner-filters rental-filters">{filters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => { setFilter(item); if (item === 'PENDING') setSort('recent') }}>{item === 'ALL' ? 'All Rentals' : item[0] + item.slice(1).toLowerCase()}</button>)}</div>
    {error && <PageCard><p className="auth-error">{error}</p></PageCard>}
    <PageCard>{profileLoading || !loaded ? <SectionSkeleton rows={4} /> : visible.length ? <div className="owner-table">{visible.map((row) => <div className="owner-row" key={row.id}><div className="rental-id"><img className="rental-thumb" src={row.listing?.image_url || '/lensshare-camera.png'} alt="" /><div><Status>{row.status.toUpperCase()}</Status><h3>{row.listing?.name || 'Removed listing'}</h3><p>{dateLabel(row)} · {row.renter?.full_name || 'Renter'} · {shortId(row.id)}</p>{row.renter && <span className={`renter-flag ${row.renter.verification_status}`}>{renterVerificationLabel(row.renter)}</span>}</div></div><strong>{pesos(Number(row.subtotal))}</strong><div className="rental-actions">{isHubWorkflow(row) ? <Link className="owner-button dark" href={`/dashboard/rentals/${row.id}`}>Open rental hub</Link> : <button className="owner-button" onClick={() => setSelected(row)}>View details</button>}{row.status !== 'declined' && <Link className="owner-button" href={`/chat?id=${row.id}`}>Message</Link>}{!isHubWorkflow(row) && (row.status === 'approved' || row.status === 'active' || row.status === 'returned') ? <button className="owner-button" onClick={() => openChecklist(row, row.status === 'returned' ? 'return' : 'pickup')}>Checklist</button> : null}{!isHubWorkflow(row) && row.status === 'completed' && !reviewedBookings.includes(row.id) ? <button className="owner-button" onClick={() => openReview(row)}>Review renter</button> : null}</div></div>)}</div> : <EmptyState title="No matching rentals" hint="Try another status or search term." />}</PageCard>
    {selected && <div className="owner-modal-backdrop" onClick={() => setSelected(null)}><section className="owner-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}>×</button><img src={selected.listing?.image_url || '/lensshare-camera.png'} alt="" /><span className="owner-eyebrow">BOOKING {shortId(selected.id)} · {selected.status.toUpperCase()}</span><h2>{selected.listing?.name || 'Removed listing'}</h2><p>{selected.listing?.brand} · rented by {selected.renter?.full_name || 'renter'}</p>{selected.renter && <span className={`renter-flag ${selected.renter.verification_status}`}>{renterVerificationLabel(selected.renter)}</span>}<div className="modal-grid"><div><small>Rental dates</small><strong>{dateLabel(selected)} ({selected.days} {selected.days === 1 ? 'day' : 'days'})</strong></div><div><small>Owner settlement basis</small><strong>{pesos(Number(selected.subtotal))}</strong>{Number(selected.discount_amount) > 0 && <small>Renter pays {pesos(Number(selected.total))} after a {pesos(Number(selected.discount_amount))} LensShare-funded Saver Pass discount.</small>}</div><div><small>Renter verification</small><strong>{selected.renter?.verification_status === 'verified' ? '✓ Identity verified' : selected.renter?.verification_status === 'pending' ? '✓ Documents pending review' : 'Not verified yet'}</strong></div><div><small>Renter contact</small><strong>{selected.renter?.phone || 'No phone on file'}</strong></div><div><small>Shoot description</small><strong>{selected.shoot_description || 'No description provided.'}</strong></div><div><small>Availability area</small><strong>{selected.listing?.pickup_address?.trim() || 'Availability area not added'}</strong><small>Arrange the exact handoff time and place privately in Messages.</small></div></div><div className="modal-actions">{selected.status === 'pending' && <><button className="owner-button dark" onClick={() => decide(selected, 'approved')}>Approve request</button><button className="owner-button" onClick={() => decide(selected, 'declined')}>Decline</button></>}{NEXT_ACTION[selected.status] && <button className="owner-button dark" onClick={() => decide(selected, NEXT_ACTION[selected.status]!.next)}>{NEXT_ACTION[selected.status]!.label}</button>}{selected.status === 'approved' || selected.status === 'active' || selected.status === 'returned' ? <button className="owner-button" onClick={() => { setSelected(null); openChecklist(selected, selected.status === 'returned' ? 'return' : 'pickup') }}>Checklist</button> : null}{selected.status === 'completed' && !reviewedBookings.includes(selected.id) && <button className="owner-button" onClick={() => { setSelected(null); openReview(selected) }}>Review renter</button>}<Link className="owner-button" href={`/agreement?id=${selected.id}`} target="_blank">Rental agreement</Link>{selected.status !== 'declined' && <Link className="owner-button" href={`/chat?id=${selected.id}`}>Message renter</Link>}{['active', 'returned', 'completed'].includes(selected.status) && <button className="owner-button" onClick={() => setReporting(true)}>Report an issue</button>}</div><p className="demo-note">Status changes are saved to the database instantly and appear in the renter's workspace in real time.</p></section></div>}
    {reporting && selected && <ReportIncidentModal bookingId={selected.id} onClose={() => setReporting(false)} onReported={() => setSelected(null)} />}
    {checklistBooking && <div className="owner-modal-backdrop" onClick={() => setChecklistBooking(null)}><section className="owner-modal checklist-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setChecklistBooking(null)}>×</button><span className="owner-eyebrow">{checklistStage === 'return' ? 'RETURN CHECKLIST' : 'PICKUP CHECKLIST'} · {shortId(checklistBooking.id)}</span><h2>{checklistBooking.listing?.name}</h2><p>{checklistBooking.renter?.full_name} · {checklistBooking.status.toUpperCase()}</p>{(checklistStage === 'return' ? RETURN_CHECKLIST : PICKUP_CHECKLIST).map((item) => <label className="check-item" key={item}><input type="checkbox" checked={Boolean(checklistItems[item])} disabled={checklistState === 'loading'} onChange={(e) => setChecklistItems((current) => ({ ...current, [item]: e.target.checked }))} />{item}</label>)}<div className="modal-actions"><button className="owner-button dark" disabled={checklistState === 'loading' || checklistState === 'saved'} onClick={saveChecklist}>{checklistState === 'saved' ? 'Saved ✓' : 'Save checklist'}</button><button className="owner-button" onClick={() => setChecklistBooking(null)}>Cancel</button></div>{checklistState === 'saved' && <p className="auth-success">Checklist saved to the booking record — it is part of the shared hand-off history now.</p>}{checklistState === 'error' && <p className="auth-error">Could not save the checklist. Try again.</p>}</section></div>}
    {reviewBooking && <div className="owner-modal-backdrop" onClick={() => setReviewBooking(null)}><section className="owner-modal review-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setReviewBooking(null)}>×</button><span className="owner-eyebrow">REVIEW RENTER · {shortId(reviewBooking.id)}</span><h2>{reviewBooking.renter?.full_name || 'Renter'}</h2><p>{reviewBooking.listing?.name} · {dateLabel(reviewBooking)}</p>{reviewState === 'done' ? <p className="auth-success">Review submitted — thank you. Ratings build the co-op's trust record.</p> : <>
      <div className="review-stars">{[1, 2, 3, 4, 5].map((star) => <button key={star} className={star <= reviewRating ? 'star on' : 'star'} aria-label={`${star} star${star === 1 ? '' : 's'}`} onClick={() => setReviewRating(star)}>★</button>)}</div>
      <textarea className="review-comment" placeholder="How was the renter? Condition of the gear on return, communication, punctuality…" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
      <div className="modal-actions"><button className="owner-button dark" disabled={reviewState === 'busy'} onClick={handleReview}>{reviewState === 'busy' ? 'Submitting…' : 'Submit review'}</button><button className="owner-button" onClick={() => setReviewBooking(null)}>Cancel</button></div>
    </>}</section></div>}
  </OwnerShell>
}
