'use client'
import { useEffect, useMemo, useState } from 'react'
import { Eye, MessageCircle, Search, Siren } from 'lucide-react'
import Link from 'next/link'
import { RenterHeadbar, Status } from '@/components/renter-headbar'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { ReportIncidentModal } from '@/components/report-incident-modal'
import { useToast } from '@/components/toast'
import { createClient } from '@/lib/supabase/client'
import { fetchBookingHandoffs, fetchBookingReviews, fetchRenterBookings, markRenterBookingsSeen, saveHandoff, submitReview } from '@/lib/data'
import { isHubWorkflow } from '@/lib/rental-workflow'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingHandoff, type BookingWithRelations, type Review } from '@/lib/types'
import '../renter.css'

const TABS = ['All Bookings', 'Pending', 'Approved', 'Active', 'Completed']

const RETURN_CHECKLIST = [
  'Pack all accessories included at pickup',
  'Clean the equipment as received',
  'Confirm exact return time and place with the owner in Messages',
  'Note any issues encountered during the shoot',
]

function label(status: string) { return status[0].toUpperCase() + status.slice(1) }
function shortId(id: string) { return `#${id.slice(0, 8).toUpperCase()}` }
function dateLabel(booking: BookingWithRelations) {
  const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(booking.start_date)} – ${fmt(booking.end_date)}`
}

export default function BookingsPage() {
  const toast = useToast()
  const { user, profile } = useProfile()
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [filter, setFilter] = useState('All Bookings')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<BookingWithRelations | null>(null)
  const [agreementSigned, setAgreementSigned] = useState(false)
  const [agreementBusy, setAgreementBusy] = useState(false)
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({})
  const [checklistSaved, setChecklistSaved] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [modalNote, setModalNote] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [reporting, setReporting] = useState(false)

  // Viewing the page is what "reads" the bookings — clear the nav badge.
  // The resulting UPDATE event also refreshes the unseen-bookings hook.
  useEffect(() => {
    if (!user) return
    markRenterBookingsSeen().catch(() => { /* badge clearing is best-effort */ })
  }, [user])

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

  async function openDetails(booking: BookingWithRelations) {
    setSelected(booking)
    setAgreementSigned(false)
    setAgreementBusy(false)
    setChecklistItems({})
    setChecklistSaved(false)
    setReviewed(false)
    setReviewRating(5)
    setReviewComment('')
    setModalNote('')
    if (!user) return
    try {
      const [handoffRows, reviewRows] = await Promise.all([fetchBookingHandoffs(booking.id), fetchBookingReviews(booking.id)])
      const agreement = handoffRows.find((row: BookingHandoff) => row.party === 'renter' && row.stage === 'agreement')
      setAgreementSigned(Boolean(agreement))
      const returnRow = handoffRows.find((row: BookingHandoff) => row.party === 'renter' && row.stage === 'return')
      if (returnRow) setChecklistItems(returnRow.checklist)
      if (user && reviewRows.some((row: Review) => row.reviewer_id === user.id)) setReviewed(true)
    } catch {
      // details still open; hand-off data just stays empty
    }
  }

  async function acceptAgreement() {
    if (!selected || !user) return
    setAgreementBusy(true)
    setModalNote('')
    try {
      await saveHandoff(selected.id, user.id, 'renter', 'agreement', {})
      setAgreementSigned(true)
      toast.success('Agreement signed — it is part of the shared booking record.')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not sign the agreement.'
      setModalNote(message)
      toast.error(message)
    } finally {
      setAgreementBusy(false)
    }
  }

  async function saveReturnChecklist() {
    if (!selected || !user) return
    setModalNote('')
    try {
      await saveHandoff(selected.id, user.id, 'renter', 'return', checklistItems)
      setChecklistSaved(true)
      toast.success('Return confirmed — the owner has been updated.')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save the checklist.'
      setModalNote(message)
      toast.error(message)
    }
  }

  async function submitMyReview() {
    if (!selected || !user) return
    setReviewBusy(true)
    setModalNote('')
    try {
      await submitReview({
        booking_id: selected.id,
        listing_id: selected.listing_id,
        reviewer_id: user.id,
        reviewee_id: selected.owner_id,
        rating: reviewRating,
        comment: reviewComment || null,
      })
      setReviewed(true)
      toast.success('Review submitted — thank you!')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not submit the review.'
      setModalNote(message)
      toast.error(message)
    } finally {
      setReviewBusy(false)
    }
  }

  const list = useMemo(() => bookings.filter((b) => (filter === 'All Bookings' || label(b.status) === filter) && `${b.listing?.name ?? ''} ${b.owner?.full_name ?? ''} ${b.listing?.pickup_address ?? ''}`.toLowerCase().includes(query.toLowerCase())), [bookings, filter, query])

  return <RenterHeadbar title="My Bookings" subtitle="Track your rental requests, handoffs, and completed shoots."><div className="renter-toolbar"><div className="renter-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bookings..." /></div><div className="renter-tabs">{TABS.map(item => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div>{error && <section className="renter-card"><p className="auth-error">{error}</p></section>}<section className="renter-list">{!loaded ? <SectionSkeleton rows={4} /> : list.map(booking => <article className="renter-booking" key={booking.id}><img src={booking.listing?.image_url || '/lensshare-camera.png'} alt=""/><div><p className="eyebrow">{shortId(booking.id)} · {booking.owner?.full_name || 'Owner'}</p><h2>{booking.listing?.name || 'Removed listing'}</h2><p>{dateLabel(booking)} · {booking.days} rental {booking.days === 1 ? 'day' : 'days'}</p><p className="renter-booking-area">{booking.listing?.pickup_address?.trim() ? `Available in ${booking.listing.pickup_address.trim()}` : 'Availability area not added'}</p><strong>{pesos(Number(booking.total))}</strong>{Number(booking.discount_amount) > 0 && <small className="renter-pass-saving">Saver Pass saved {pesos(Number(booking.discount_amount))}</small>}</div><div className="renter-booking-actions"><Status tone={booking.status === 'pending' ? 'pending' : 'teal'}>{label(booking.status)}</Status>{isHubWorkflow(booking) ? <Link className="renter-message-link renter-hub-link" href={`/renter/bookings/${booking.id}`}><Eye size={14}/> Open rental hub</Link> : <button onClick={() => openDetails(booking)}><Eye size={14}/> View details</button>}{booking.status !== 'declined' && <Link className="renter-message-link" href={profile?.verification_status === 'verified' ? `/chat?id=${booking.id}` : '/renter/verification'}><MessageCircle size={14}/> Message</Link>}</div></article>)}{loaded && !list.length && <EmptyState title="No bookings found" hint="Try another status or browse verified equipment." />}</section>{selected && <div className="owner-modal-backdrop" onClick={() => setSelected(null)}><section className="owner-modal" role="dialog" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">BOOKING DETAILS · {shortId(selected.id)}</p><h2>{selected.listing?.name || 'Removed listing'}</h2><p>{dateLabel(selected)} · owner {selected.owner?.full_name || 'Owner'}</p><div className="modal-grid"><div><small>Status</small><strong><Status tone={selected.status === 'pending' ? 'pending' : 'teal'}>{label(selected.status)}</Status></strong></div><div><small>Rental price</small><strong>{pesos(Number(selected.subtotal))}</strong>{Number(selected.discount_amount) > 0 && <small className="renter-price-discount">Saver Pass · − {pesos(Number(selected.discount_amount))}<br />You pay {pesos(Number(selected.total))}</small>}</div><div><small>Shoot description</small><strong>{selected.shoot_description || 'No description provided.'}</strong></div><div><small>Availability area</small><strong>{selected.listing?.pickup_address?.trim() || 'Availability area not added'}</strong><small>Arrange the exact handoff time and place privately with the owner in Messages.</small></div></div>
  <div className="renter-agreement-row">
    <a className="owner-button" href={`/agreement?id=${selected.id}`} target="_blank" rel="noreferrer">View rental agreement</a>
    {selected.status !== 'declined' && <Link className="owner-button" href={profile?.verification_status === 'verified' ? `/chat?id=${selected.id}` : '/renter/verification'}>Message owner</Link>}
    {['active', 'returned', 'completed'].includes(selected.status) && <button className="owner-button" onClick={() => setReporting(true)}><Siren size={14} /> Report an issue</button>}
    {!agreementSigned && selected.status !== 'pending'
      ? <button className="owner-button dark" disabled={agreementBusy} onClick={acceptAgreement}>{agreementBusy ? 'Signing…' : 'Accept agreement'}</button>
      : agreementSigned ? <span className="auth-success">Agreement signed ✓</span> : null}
  </div>
  {selected.status === 'returned' && <div className="renter-return-box">
    <p className="eyebrow">RETURN CONFIRMATION</p>
    {RETURN_CHECKLIST.map((item) => <label className="check-item" key={item}><input type="checkbox" checked={Boolean(checklistItems[item])} onChange={(e) => { setChecklistItems((current) => ({ ...current, [item]: e.target.checked })); setChecklistSaved(false) }} />{item}</label>)}
    <button className="owner-button dark" disabled={checklistSaved} onClick={saveReturnChecklist}>{checklistSaved ? 'Saved ✓' : 'Confirm return'}</button>
  </div>}
  {selected.status === 'completed' && (reviewed
    ? <p className="auth-success">You reviewed this rental — thank you!</p>
    : <div className="renter-review-box">
        <p className="eyebrow">REVIEW THIS RENTAL</p>
        <div className="review-stars">{[1, 2, 3, 4, 5].map((star) => <button key={star} className={star <= reviewRating ? 'star on' : 'star'} aria-label={`${star} star${star === 1 ? '' : 's'}`} onClick={() => setReviewRating(star)}>★</button>)}</div>
        <textarea className="review-comment" placeholder="How was the gear and the owner? Condition, accuracy of the listing, handoff experience…" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
        <button className="owner-button dark" disabled={reviewBusy} onClick={submitMyReview}>{reviewBusy ? 'Submitting…' : 'Submit review'}</button>
      </div>)}
  {modalNote && <p className="auth-error">{modalNote}</p>}
  <p className="demo-note">Statuses update live: when the owner approves your request, this booking changes without a refresh.</p></section></div>}
  {reporting && selected && <ReportIncidentModal bookingId={selected.id} onClose={() => setReporting(false)} onReported={() => { setModalNote('Incident reported. LensShare admins will review it shortly.'); toast.success('Incident reported — admins will review it shortly.') }} />}
  </RenterHeadbar> }
