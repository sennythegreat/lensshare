'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileSignature,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/states'
import { useToast } from '@/components/toast'
import {
  completeHubBooking,
  fetchAdminHubHandoffDetail,
  fetchRentalPaymentProofUrl,
  fetchSignedAdminHubFileUrl,
  resolveAdminHubDeposit,
  reviewAdminHubDepositProof,
  reviewAdminRentalPaymentProof,
  saveAdminHubInspection,
  setAdminHubIssueHold,
  subscribeToRentalHub,
  transitionAdminHubCustody,
} from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import {
  pesos,
  RENTAL_PAYMENT_STATUS_LABELS,
  type HubHandoffDetail,
  type HubInspection,
  type HubInspectionStage,
  type HubPhysicalAction,
} from '@/lib/types'

const CUSTODY_STEPS: { value: HubHandoffDetail['custody_state']; label: string }[] = [
  { value: 'awaiting_owner_dropoff', label: 'Owner drop-off' },
  { value: 'at_hub_for_pickup', label: 'Hub intake' },
  { value: 'with_renter', label: 'With renter' },
  { value: 'at_hub_for_return', label: 'Return intake' },
  { value: 'completed', label: 'Returned to owner' },
]

const ACTIONS: Record<HubPhysicalAction, { label: string; detail: string; confirm: string }> = {
  receive_from_owner: {
    label: 'Receive gear from owner',
    detail: 'Record that staff physically took this unit into Naga Hub custody.',
    confirm: 'Is the gear physically in front of you and now in Naga Hub custody?',
  },
  release_to_renter: {
    label: 'Release gear to renter',
    detail: 'Record that staff physically handed this unit to the named renter.',
    confirm: 'Is the named renter physically receiving this gear now?',
  },
  receive_from_renter: {
    label: 'Receive return from renter',
    detail: 'Record that the renter physically returned this unit to Naga Hub.',
    confirm: 'Is the returned gear physically in front of you and now back in Naga Hub custody?',
  },
  release_to_owner: {
    label: 'Release gear to owner',
    detail: 'Record that staff physically returned this unit to the named owner.',
    confirm: 'Is the named owner physically receiving this gear now?',
  },
}

const INSPECTION_CHECKS: Record<HubInspectionStage, { key: string; label: string }[]> = {
  pre_release: [
    { key: 'identity_match', label: 'Body, model, and mount match the booking' },
    { key: 'power_on', label: 'Power-on and core controls tested' },
    { key: 'optical_condition', label: 'Sensor, glass, and mount condition inspected' },
    { key: 'accessories_counted', label: 'Battery, charger, and listed accessories counted' },
  ],
  post_return: [
    { key: 'serial_match', label: 'Serial matches the pre-release record' },
    { key: 'power_on', label: 'Power-on and core controls tested after return' },
    { key: 'no_new_damage', label: 'New damage or wear is fully recorded in notes' },
    { key: 'accessories_returned', label: 'All listed accessories accounted for' },
  ],
}

const DEPOSIT_LABELS: Record<HubHandoffDetail['deposit_status'], string> = {
  not_submitted: 'Not submitted',
  pending_review: 'Pending manual proof review',
  accepted: 'Proof accepted by staff',
  rejected: 'Proof rejected',
  waived: 'Waived for this booking',
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return `${date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

type ViewedProof = { bookingId: string; path: string }

type ProofReview = {
  bookingId: string
  proofPath: string
  decision: 'accepted' | 'rejected'
  reviewNote: string | null
}

type DepositResolution = {
  bookingId: string
  decision: 'refund' | 'confirm_refund' | 'forfeit'
  note: string
  rawStatus: NonNullable<HubHandoffDetail['deposit']>['raw_status']
  amount: number
}

type ConfirmAction =
  | ({ type: 'deposit' | 'rental-payment' } & ProofReview)
  | ({ type: 'deposit-resolution' } & DepositResolution)
  | { type: 'complete'; bookingId: string }
  | { type: 'clear-hold' }
  | { type: 'transition'; action: HubPhysicalAction }

export default function AdminHubHandoffDetailPage() {
  const params = useParams<{ bookingId: string }>()
  const { user, profile } = useProfile()
  const toast = useToast()
  const bookingId = params.bookingId
  const [detail, setDetail] = useState<HubHandoffDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [viewedDepositProof, setViewedDepositProof] = useState<ViewedProof | null>(null)
  const [proofNote, setProofNote] = useState('')
  const [depositResolutionNote, setDepositResolutionNote] = useState('')
  const [refundReference, setRefundReference] = useState('')
  const [viewedRentalProof, setViewedRentalProof] = useState<ViewedProof | null>(null)
  const [rentalProofNote, setRentalProofNote] = useState('')
  const [holdReason, setHoldReason] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!bookingId) return
    if (!quiet) setState('loading')
    setError('')
    try {
      const next = await fetchAdminHubHandoffDetail(bookingId)
      setDetail(next)
      setHoldReason(next.issue_hold_reason ?? '')
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this hand-off desk.')
      if (!quiet) setState('error')
    }
  }, [bookingId])

  useEffect(() => { void load() }, [bookingId])
  useEffect(() => {
    if (!bookingId) return
    const unsubscribe = subscribeToRentalHub(bookingId, () => void load(true))
    return unsubscribe
  }, [bookingId, load])

  const booking = detail?.booking
  const bookingCompleted = booking?.status === 'completed'
  const custodyComplete = detail?.custody_state === 'completed'
  const completionBlockers = detail?.completion_blockers ?? []
  const canComplete = Boolean(user && profile?.role === 'admin' && detail?.assigned_admin_id === user.id)
  const depositSettlementAvailable = Boolean(profile?.role === 'admin' && detail?.booking_id === bookingId && booking?.status === 'returned' && (detail?.deposit?.raw_status === 'held' || detail?.deposit?.raw_status === 'refund_pending'))
  const rentalPayment = detail?.rental_payment ?? null
  const rentalPaymentStatus = detail?.rental_payment_status ?? rentalPayment?.status ?? null
  const depositProofPath = detail?.deposit?.proof_path ?? null
  const rentalProofPath = rentalPayment?.proof_path ?? null
  const proofViewed = Boolean(depositProofPath && detail?.booking_id === bookingId && viewedDepositProof?.bookingId === bookingId && viewedDepositProof.path === depositProofPath)
  const rentalProofViewed = Boolean(rentalProofPath && detail?.booking_id === bookingId && rentalPayment?.booking_id === bookingId && viewedRentalProof?.bookingId === bookingId && viewedRentalProof.path === rentalProofPath)
  const rentalReviewAvailable = detail?.booking_id === bookingId && rentalPayment?.booking_id === bookingId && rentalPayment.status === 'pending_review' && booking?.status === 'approved'
  const currentCustodyIndex = detail ? CUSTODY_STEPS.findIndex((step) => step.value === detail.custody_state) : -1
  const preInspection = detail?.inspections.find((inspection) => inspection.stage === 'pre_release')
  const postInspection = detail?.inspections.find((inspection) => inspection.stage === 'post_return')

  useEffect(() => {
    setViewedDepositProof(null)
    setProofNote('')
    setConfirmAction((current) => current?.type === 'deposit' ? null : current)
  }, [bookingId, depositProofPath])

  useEffect(() => {
    setViewedRentalProof(null)
    setRentalProofNote('')
    setConfirmAction((current) => current?.type === 'rental-payment' ? null : current)
  }, [bookingId, rentalProofPath])

  useEffect(() => {
    setDepositResolutionNote('')
    setRefundReference('')
    setConfirmAction((current) => current?.type === 'deposit-resolution' || current?.type === 'complete' ? null : current)
  }, [bookingId, detail?.deposit?.raw_status, booking?.status])

  useEffect(() => {
    if (!rentalReviewAvailable) setConfirmAction((current) => current?.type === 'rental-payment' ? null : current)
  }, [rentalReviewAvailable])

  async function openPrivateFile(path: string, label: string, markViewed = false) {
    const proofBookingId = detail?.booking_id
    setError('')
    const fileWindow = window.open('', '_blank')
    if (!fileWindow) {
      setError(`The ${label.toLowerCase()} could not open. Allow pop-ups for LensShare, then try again.`)
      return
    }
    fileWindow.opener = null
    try {
      const url = await fetchSignedAdminHubFileUrl(path)
      if (fileWindow.closed) throw new Error(`The ${label.toLowerCase()} window was closed. Open it again before reviewing.`)
      fileWindow.location.href = url
      if (markViewed && proofBookingId) setViewedDepositProof({ bookingId: proofBookingId, path })
    } catch (fileError) {
      fileWindow.close()
      setError(fileError instanceof Error ? fileError.message : `Could not open the ${label.toLowerCase()}.`)
    }
  }

  async function openRentalReceipt() {
    if (!rentalPayment?.proof_path || rentalPayment.booking_id !== bookingId) return
    const viewedProof = { bookingId: rentalPayment.booking_id, path: rentalPayment.proof_path }
    setError('')
    const fileWindow = window.open('', '_blank')
    if (!fileWindow) {
      setError('The rental receipt could not open. Allow pop-ups for LensShare, then try again.')
      return
    }
    fileWindow.opener = null
    try {
      const url = await fetchRentalPaymentProofUrl(viewedProof.path)
      if (fileWindow.closed) throw new Error('The rental receipt window was closed. Open it again before reviewing.')
      fileWindow.location.href = url
      setViewedRentalProof(viewedProof)
    } catch (fileError) {
      fileWindow.close()
      setError(fileError instanceof Error ? fileError.message : 'Could not open the private rental receipt.')
    }
  }

  function reviewRentalPayment(decision: 'accepted' | 'rejected') {
    if (busy) return
    if (!rentalReviewAvailable) {
      setError('Rental-payment proof can only be reviewed while the booking is approved and the proof is pending review.')
      return
    }
    if (!rentalProofViewed || !viewedRentalProof) {
      setError('Open the current rental receipt before recording a manual proof-review decision.')
      return
    }
    const reviewNote = rentalProofNote.trim() || null
    if (decision === 'rejected' && !reviewNote) {
      setError('Enter a reason for rejecting the rental receipt so the renter can correct the proof.')
      return
    }
    setConfirmAction({ type: 'rental-payment', bookingId: viewedRentalProof.bookingId, proofPath: viewedRentalProof.path, decision, reviewNote })
  }

  async function confirmRentalPaymentReview(review: ProofReview) {
    if (busy) return
    if (!rentalReviewAvailable || review.bookingId !== bookingId || !rentalProofViewed || viewedRentalProof?.path !== review.proofPath || rentalProofPath !== review.proofPath || (review.decision === 'rejected' && !review.reviewNote?.trim())) {
      const message = 'The booking or rental receipt changed. Open the current receipt and review it again.'
      setConfirmAction(null)
      setError(message)
      toast.error(message)
      return
    }
    setBusy(`rental-payment-${review.decision}`)
    setError('')
    setNotice('')
    try {
      await reviewAdminRentalPaymentProof(review.bookingId, review.decision, review.reviewNote, review.proofPath)
      const message = review.decision === 'accepted' ? 'Rental receipt accepted after manual staff review.' : 'Rental receipt rejected — the reason was recorded for the renter.'
      setNotice(message)
      toast.success(message)
      setRentalProofNote('')
      setViewedRentalProof(null)
      setConfirmAction(null)
      await load(true)
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : 'Could not save the rental-payment proof review.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  function reviewDeposit(decision: 'accepted' | 'rejected') {
    if (!detail || busy || detail.deposit?.status !== 'pending_review') return
    if (!detail.deposit.proof_path) {
      setError('No deposit proof is attached to this booking.')
      return
    }
    if (!proofViewed || !viewedDepositProof) {
      setError('Open the current deposit receipt before recording a manual proof-review decision.')
      return
    }
    const reviewNote = proofNote.trim() || null
    if (decision === 'rejected' && !reviewNote) {
      setError('Enter a rejection reason that staff can use to resolve the proof issue.')
      return
    }
    setConfirmAction({ type: 'deposit', bookingId: viewedDepositProof.bookingId, proofPath: viewedDepositProof.path, decision, reviewNote })
  }

  async function confirmDepositReview(review: ProofReview) {
    if (busy) return
    if (!detail || detail.booking_id !== review.bookingId || review.bookingId !== bookingId || detail.deposit?.status !== 'pending_review' || !proofViewed || viewedDepositProof?.path !== review.proofPath || depositProofPath !== review.proofPath || (review.decision === 'rejected' && !review.reviewNote?.trim())) {
      const message = 'The deposit receipt changed. Open the current receipt and review it again.'
      setConfirmAction(null)
      setError(message)
      toast.error(message)
      return
    }
    setBusy(`deposit-${review.decision}`)
    setError('')
    setNotice('')
    try {
      await reviewAdminHubDepositProof(review.bookingId, review.decision, review.reviewNote)
      setNotice(review.decision === 'accepted' ? 'Manual deposit proof review recorded.' : 'Deposit proof rejection and review note recorded.')
      toast.success(review.decision === 'accepted' ? 'Deposit proof check accepted.' : 'Deposit proof rejected — the note was recorded.')
      setProofNote('')
      setViewedDepositProof(null)
      setConfirmAction(null)
      await load(true)
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : 'Could not save the deposit proof review.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  function resolveDeposit(decision: DepositResolution['decision']) {
    if (busy || !depositSettlementAvailable || !detail?.deposit) return
    if (((decision === 'refund' || decision === 'forfeit') && detail.deposit.raw_status !== 'held') || (decision === 'confirm_refund' && detail.deposit.raw_status !== 'refund_pending')) return
    const note = (decision === 'confirm_refund' ? refundReference : depositResolutionNote).trim()
    if (!note) {
      setError(decision === 'confirm_refund' ? 'Enter the actual external refund transaction reference.' : 'Enter a reason for this deposit decision.')
      return
    }
    setConfirmAction({ type: 'deposit-resolution', bookingId, decision, note, rawStatus: detail.deposit.raw_status, amount: Number(detail.deposit.amount) })
  }

  async function confirmDepositResolution(resolution: DepositResolution) {
    if (busy) return
    if (!depositSettlementAvailable || !detail?.deposit || resolution.bookingId !== bookingId || resolution.rawStatus !== detail.deposit.raw_status || resolution.amount !== Number(detail.deposit.amount) || !resolution.note.trim()) {
      const message = 'The booking or deposit changed. Review the current deposit before recording a decision.'
      setConfirmAction(null)
      setError(message)
      toast.error(message)
      return
    }
    setBusy(`deposit-resolution-${resolution.decision}`)
    setError('')
    setNotice('')
    try {
      await resolveAdminHubDeposit(resolution.bookingId, resolution.decision, resolution.note, resolution.decision === 'forfeit' ? resolution.amount : undefined)
      const message = resolution.decision === 'refund'
        ? 'Refund pending recorded. No money was sent. Complete the refund externally, then record its transaction reference.'
        : resolution.decision === 'confirm_refund'
          ? 'External refund confirmation and reference recorded. LensShare did not transfer money.'
          : 'Full-deposit forfeiture recorded. No money was transferred.'
      setNotice(message)
      toast.success(message)
      setDepositResolutionNote('')
      setRefundReference('')
      setConfirmAction(null)
      await load(true)
    } catch (resolutionError) {
      const message = resolutionError instanceof Error ? resolutionError.message : 'Could not record the deposit decision.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  async function confirmCompletion(completionBookingId: string) {
    if (busy) return
    if (!detail || detail.booking_id !== completionBookingId || completionBookingId !== bookingId || booking?.status !== 'returned' || !canComplete || completionBlockers.length) {
      const message = 'Completion is not available. The assigned admin must review the current booking and clear all completion blockers.'
      setConfirmAction(null)
      setError(message)
      toast.error(message)
      return
    }
    setBusy('complete')
    setError('')
    setNotice('')
    try {
      await completeHubBooking(completionBookingId)
      const message = 'Booking marked as done. This action did not transfer money.'
      setNotice(message)
      toast.success(message)
      setConfirmAction(null)
      await load(true)
    } catch (completionError) {
      const message = completionError instanceof Error ? completionError.message : 'Could not mark this booking as done.'
      setError(message)
      toast.error(message)
      setConfirmAction(null)
      await load(true)
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  async function saveHold() {
    if (!detail || busy || bookingCompleted) return
    const reason = holdReason.trim()
    if (!reason) {
      setError('Describe the issue before placing this exchange on hold.')
      return
    }
    setBusy('hold')
    setError('')
    setNotice('')
    try {
      await setAdminHubIssueHold(detail.booking_id, reason)
      setNotice('Issue hold placed. Physical transitions remain blocked until it is cleared.')
      toast.success('Issue hold placed — physical transitions are blocked until it is cleared.')
      await load(true)
    } catch (holdError) {
      const message = holdError instanceof Error ? holdError.message : 'Could not place the issue hold.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  function clearHold() {
    if (!detail || busy || bookingCompleted) return
    setConfirmAction({ type: 'clear-hold' })
  }

  async function confirmClearHold() {
    if (!detail || busy || bookingCompleted) return
    setBusy('hold')
    setError('')
    setNotice('')
    try {
      await setAdminHubIssueHold(detail.booking_id, null)
      setHoldReason('')
      setNotice('Issue hold cleared.')
      toast.success('Issue hold cleared — physical transitions are available again.')
      setConfirmAction(null)
      await load(true)
    } catch (holdError) {
      const message = holdError instanceof Error ? holdError.message : 'Could not clear the issue hold.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  function transition(action: HubPhysicalAction) {
    if (!detail || busy || bookingCompleted) return
    setConfirmAction({ type: 'transition', action })
  }

  async function confirmTransition(action: HubPhysicalAction) {
    if (!detail || busy || bookingCompleted) return
    setBusy(action)
    setError('')
    setNotice('')
    try {
      await transitionAdminHubCustody(detail.booking_id, action)
      const message = action === 'release_to_owner'
        ? 'Returned to owner recorded. Wait for both return confirmations and resolve the deposit, then explicitly select Mark as done.'
        : `${ACTIONS[action].label} recorded in the custody timeline.`
      setNotice(message)
      toast.success(message)
      setConfirmAction(null)
      await load(true)
    } catch (transitionError) {
      const message = transitionError instanceof Error ? transitionError.message : 'Could not record the physical custody transition.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  async function inspectionSaved() {
    setNotice('Inspection saved to the hand-off record.')
    toast.success('Inspection saved to the hand-off record.')
    await load(true)
  }

  if (state === 'loading') return <AdminShell title="Hand-off desk" subtitle="Loading the physical custody record for this booking."><DetailSkeleton /></AdminShell>
  if (state === 'error' || !detail || !booking) return <AdminShell title="Hand-off desk" subtitle="Review a Naga Hub booking exchange."><div className="admin-handoff-state"><ErrorState title="Hand-off record unavailable" hint={error || 'This booking does not have a hub exchange record, or it could not be loaded.'} retry={() => void load()} /></div></AdminShell>

  return <AdminShell title={booking.listing?.name || 'Hub hand-off'} subtitle={`${shortId(booking.id)} · ${booking.owner?.full_name || 'Owner'} to ${booking.renter?.full_name || 'Renter'}`}>
    <div className="admin-handoff-detail-nav"><Link href="/admin/handoffs"><ArrowLeft size={13} /> Back to live queue</Link><button className="owner-button" type="button" onClick={() => { void load(); toast.success('Record refreshed.') }}><RefreshCw size={13} /> Refresh record</button></div>
    {error && <div className="admin-handoff-alert error" role="alert">{error}</div>}
    {notice && <div className="admin-handoff-alert success" role="status">{notice}</div>}

    <section className="admin-handoff-hero">
      <img src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" />
      <div className="admin-handoff-hero-copy"><div><span className={`admin-handoff-badge ${detail.queue_bucket}`}>{detail.queue_bucket.replaceAll('_', ' ')}</span>{booking.status === 'returned' && <span className="admin-handoff-badge awaiting-completion">Awaiting completion</span>}<span className="admin-handoff-ref">{shortId(booking.id)}</span></div><h2>{booking.listing?.name || 'Removed listing'}</h2><p>{booking.listing?.brand || 'Gear'} · {dateLabel(booking.start_date)} to {dateLabel(booking.end_date)} · {booking.days} {booking.days === 1 ? 'day' : 'days'}</p></div>
      <dl><div><dt>Owner</dt><dd>{booking.owner?.full_name || 'Not available'}</dd></div><div><dt>Renter</dt><dd>{booking.renter?.full_name || 'Not available'}</dd></div><div><dt>Renter total</dt><dd>{pesos(Number(booking.total))}</dd></div><div><dt>Assigned admin</dt><dd>{detail.assigned_admin?.full_name || 'Unassigned'}</dd></div></dl>
    </section>

    <section className="admin-handoff-custody" aria-labelledby="custody-heading">
      <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">PHYSICAL CUSTODY</span><h2 id="custody-heading">Where the gear is now</h2></div><span className="admin-handoff-live"><span aria-hidden="true" /> Live record</span></div>
      <ol>{CUSTODY_STEPS.map((step, index) => <li className={`${index < currentCustodyIndex ? 'done' : ''} ${index === currentCustodyIndex ? 'current' : ''}`} key={step.value}><span>{index < currentCustodyIndex ? <Check size={13} /> : index + 1}</span><b>{step.label}</b></li>)}</ol>
    </section>

    <div className="admin-handoff-payments-grid">
      <section className="admin-handoff-panel" aria-labelledby="rental-payment-heading">
        <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">RENTAL PAYMENT · SEPARATE FROM DEPOSIT</span><h2 id="rental-payment-heading">Rental-payment proof review</h2></div><span className={`admin-handoff-badge admin-rental-payment-${rentalPaymentStatus ?? 'missing'}`}>{rentalPaymentStatus ? RENTAL_PAYMENT_STATUS_LABELS[rentalPaymentStatus] : 'Setup pending'}</span></div>
        <div className="admin-handoff-proof-warning" role="note"><ShieldAlert size={18} /><p><strong>Manual receipt review, not provider verification.</strong> Staff compare the rental receipt with the configured GCash receiving details. Acceptance does not confirm settlement or create escrow. Deposit review is separate; a student deposit waiver does not waive rent.</p></div>
        {!rentalPayment ? <div className="admin-handoff-inline-state muted"><CircleAlert size={18} /><div><b>Rental-payment setup pending</b><p>No rental-payment record is available. Do not treat the missing record as payment received or ask for a repeat payment; resolve setup first.</p></div></div>
          : rentalPayment.status === 'not_required' ? <div className={`admin-handoff-inline-state ${rentalPayment.not_required_reason === 'zero_total' ? '' : 'muted'}`}><CheckCircle2 size={18} /><div><b>{rentalPayment.not_required_reason === 'zero_total' ? 'No rent due' : rentalPayment.not_required_reason === 'pre_feature_released' ? 'Historical booking — no rental payment recorded' : 'Rental payment not required'}</b><p>{rentalPayment.not_required_reason === 'zero_total' ? 'The recorded rental total is ₱0. No rental receipt is required; any deposit requirement remains separate.' : rentalPayment.not_required_reason === 'pre_feature_released' ? 'This booking was already released or closed before rental-payment tracking. This is not a paid receipt; no new payment is requested.' : 'No rental receipt review is required for this booking. This status does not record a received payment.'}</p></div></div>
            : <>
              <dl className="admin-handoff-facts"><div><dt>Rental amount (PHP)</dt><dd>{pesos(Number(rentalPayment.amount))}</dd></div><div><dt>GCash reference</dt><dd>{rentalPayment.gcash_reference || 'Not supplied'}</dd></div><div><dt>Submitted</dt><dd>{dateTimeLabel(rentalPayment.submitted_at)}</dd></div><div><dt>Reviewed</dt><dd>{dateTimeLabel(rentalPayment.reviewed_at)}</dd></div></dl>
              {rentalPayment.review_note && <p className="admin-handoff-review-note"><b>Rental review note:</b> {rentalPayment.review_note}</p>}
              {rentalPayment.proof_path ? <div className="admin-handoff-proof-actions"><button className="owner-button" type="button" onClick={() => void openRentalReceipt()}>View private rental receipt <ExternalLink size={12} /></button><span>{rentalProofViewed ? 'Current rental receipt opened' : 'Open rental receipt before deciding'}</span></div> : <div className="admin-handoff-inline-state muted"><Clock3 size={18} /><div><b>No rental receipt attached</b><p>The renter’s rental receipt and GCash reference will appear here after submission.</p></div></div>}
              {rentalReviewAvailable ? <div className="admin-handoff-review-form"><label htmlFor="rental-payment-review-note">Rental reviewer note <span>{rentalProofNote.length}/500</span></label><textarea id="rental-payment-review-note" maxLength={500} value={rentalProofNote} disabled={Boolean(busy)} onChange={(event) => setRentalProofNote(event.target.value)} placeholder="Required for rejection so the renter can correct the proof; optional for acceptance." /><div><button className="owner-button dark" type="button" disabled={!rentalProofViewed || Boolean(busy)} onClick={() => reviewRentalPayment('accepted')}>{busy === 'rental-payment-accepted' ? 'Saving…' : 'Accept rental proof check'}</button><button className="owner-button" type="button" disabled={!rentalProofViewed || !rentalProofNote.trim() || Boolean(busy)} onClick={() => reviewRentalPayment('rejected')}>{busy === 'rental-payment-rejected' ? 'Saving…' : 'Reject rental proof'}</button></div></div> : rentalPayment.status === 'pending_review' && <p className="admin-handoff-review-note">Rental proof review is only available while the booking is approved.</p>}
            </>}
      </section>

      <section className="admin-handoff-panel" aria-labelledby="deposit-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">SECURITY DEPOSIT</span><h2 id="deposit-heading">Deposit proof review</h2></div><span className={`admin-handoff-badge deposit-${detail.deposit_status}`}>{DEPOSIT_LABELS[detail.deposit_status]}</span></div>
          <div className="admin-handoff-proof-warning" role="note"><ShieldAlert size={18} /><p><strong>Manual visual review only.</strong> Accepting a receipt checks the submitted image against the configured LensShare GCash details. It does not confirm the GCash provider transaction, place funds in LensShare custody, or create escrow.</p></div>
          {detail.deposit_status === 'waived' ? <div className="admin-handoff-inline-state"><CheckCircle2 size={18} /><div><b>Deposit waived for this booking</b><p>No receipt review is required. Continue only when all other hand-off blockers are clear.</p></div></div>
            : detail.deposit ? <>
              <dl className="admin-handoff-facts"><div><dt>Required amount</dt><dd>{pesos(Number(detail.deposit.amount))}</dd></div><div><dt>GCash reference</dt><dd>{detail.deposit.reference || 'Not supplied'}</dd></div><div><dt>Submitted</dt><dd>{dateTimeLabel(detail.deposit.submitted_at)}</dd></div><div><dt>Reviewed</dt><dd>{dateTimeLabel(detail.deposit.reviewed_at)}</dd></div></dl>
              {detail.deposit.review_note && <p className="admin-handoff-review-note"><b>Review note:</b> {detail.deposit.review_note}</p>}
              {detail.deposit.proof_path ? <div className="admin-handoff-proof-actions"><button className="owner-button" type="button" onClick={() => void openPrivateFile(detail.deposit!.proof_path!, 'Deposit receipt', true)}>View private receipt <ExternalLink size={12} /></button><span>{proofViewed ? 'Opened in this session' : 'Open before deciding'}</span></div> : <div className="admin-handoff-inline-state muted"><CircleAlert size={18} /><div><b>No receipt attached</b><p>A proof-review decision cannot be recorded until a receipt is submitted.</p></div></div>}
              {detail.deposit.status === 'pending_review' && <div className="admin-handoff-review-form"><label htmlFor="deposit-review-note">Reviewer note <span>{proofNote.length}/500</span></label><textarea id="deposit-review-note" maxLength={500} value={proofNote} onChange={(event) => setProofNote(event.target.value)} placeholder="Required for rejection; optional internal context for acceptance." /><div><button className="owner-button dark" type="button" disabled={!proofViewed || Boolean(busy)} onClick={() => void reviewDeposit('accepted')}>{busy === 'deposit-accepted' ? 'Saving…' : 'Accept proof check'}</button><button className="owner-button" type="button" disabled={!proofViewed || Boolean(busy)} onClick={() => void reviewDeposit('rejected')}>{busy === 'deposit-rejected' ? 'Saving…' : 'Reject proof'}</button></div></div>}
            </> : <div className="admin-handoff-inline-state muted"><CircleAlert size={18} /><div><b>Deposit not submitted</b><p>The renter’s proof and GCash reference will appear here after submission.</p></div></div>}
          {detail.deposit && detail.deposit_status !== 'waived' && <div className="admin-handoff-settlement">
            <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">ADMIN · MANUAL SETTLEMENT</span><h3>Deposit resolution</h3></div><span className="admin-handoff-badge">{detail.deposit.raw_status.replaceAll('_', ' ')}</span></div>
            <dl className="admin-handoff-facts"><div><dt>Refund reference</dt><dd>{detail.deposit.refund_reference || 'Not recorded'}</dd></div><div><dt>Refund recorded</dt><dd>{dateTimeLabel(detail.deposit.refunded_at)}</dd></div><div><dt>Forfeited amount</dt><dd>{pesos(Number(detail.deposit.forfeited_amount))}</dd></div><div><dt>Full deposit</dt><dd>{pesos(Number(detail.deposit.amount))}</dd></div></dl>
            {depositSettlementAvailable ? <>
              <div className="admin-handoff-proof-warning" role="note"><ShieldAlert size={18} /><p><strong>No automatic refund or money transfer.</strong> These controls record an admin decision only. Make any refund externally and use its actual transaction reference. Final refund confirmation and full forfeiture cannot be undone here.</p></div>
              {detail.deposit.raw_status === 'refund_pending' && <div className="admin-handoff-settlement-form">
                <label htmlFor="deposit-refund-reference">Actual external refund reference <span>Required</span></label>
                <input id="deposit-refund-reference" value={refundReference} maxLength={500} disabled={Boolean(busy)} onChange={(event) => setRefundReference(event.target.value)} placeholder="Reference from the completed external refund" />
                <button className="owner-button dark" type="button" disabled={Boolean(busy) || !refundReference.trim()} onClick={() => resolveDeposit('confirm_refund')}>{busy === 'deposit-resolution-confirm_refund' ? 'Recording…' : 'Confirm external refund'}</button>
              </div>}
              {detail.deposit.raw_status === 'held' && <div className="admin-handoff-settlement-form">
                <label htmlFor="deposit-resolution-note">Refund or forfeiture reason <span>Required</span></label>
                <textarea id="deposit-resolution-note" value={depositResolutionNote} maxLength={500} disabled={Boolean(busy)} onChange={(event) => setDepositResolutionNote(event.target.value)} placeholder="Record the reason and relevant supporting context." />
                <p className="admin-handoff-permission-note">Forfeiture applies to the full deposit of {pesos(Number(detail.deposit.amount))} only. Do not forfeit a deposit that has already been refunded externally.</p>
                <div className="admin-handoff-settlement-actions">
                  <button className="owner-button dark" type="button" disabled={Boolean(busy) || !depositResolutionNote.trim()} onClick={() => resolveDeposit('refund')}>{busy === 'deposit-resolution-refund' ? 'Recording…' : 'Start refund record'}</button>
                  <button className="owner-button danger" type="button" disabled={Boolean(busy) || !depositResolutionNote.trim()} onClick={() => resolveDeposit('forfeit')}>{busy === 'deposit-resolution-forfeit' ? 'Recording…' : `Forfeit full deposit · ${pesos(Number(detail.deposit.amount))}`}</button>
                </div>
              </div>}
              <p className="admin-handoff-permission-note">Any admin may resolve the deposit. Only the owner or assigned hub admin may mark the booking as done.</p>
            </> : <p className="admin-handoff-permission-note">Settlement controls are available to admins only while the booking is returned and the deposit is held or refund pending. Rental-payment proof review remains separate.</p>}
          </div>}
      </section>
    </div>

    <div className="admin-handoff-detail-grid">
      <div className="admin-handoff-detail-primary">
        <section className="admin-handoff-panel" aria-labelledby="agreement-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">PARTICIPANT AGREEMENT</span><h2 id="agreement-heading">Rental agreement</h2></div><Link className="owner-button" href={`/agreement?id=${booking.id}`} target="_blank">Open agreement <ExternalLink size={12} /></Link></div>
          <div className="admin-handoff-signatures"><Signature name={booking.owner?.full_name || 'Owner'} party="Owner" signedAt={detail.agreement.owner_signed_at} /><Signature name={booking.renter?.full_name || 'Renter'} party="Renter" signedAt={detail.agreement.renter_signed_at} /></div>
        </section>

        <InspectionForm bookingId={booking.id} stage="pre_release" inspection={preInspection} onOpenPhoto={openPrivateFile} onSaved={inspectionSaved} />
        <InspectionForm bookingId={booking.id} stage="post_return" inspection={postInspection} onOpenPhoto={openPrivateFile} onSaved={inspectionSaved} />
      </div>

      <aside className="admin-handoff-detail-side">
        <section className="admin-handoff-panel" aria-labelledby="confirmation-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">PARTICIPANTS</span><h2 id="confirmation-heading">Confirmations</h2></div></div>
          <div className="admin-handoff-confirmations">{(['pickup', 'return'] as const).map((stage) => <div key={stage}><h3>{stage === 'pickup' ? 'Pickup' : 'Return'}</h3>{(['owner', 'renter'] as const).map((party) => {
            const confirmation = detail.participant_confirmations.find((row) => row.stage === stage && row.party === party)
            return <div className={`admin-handoff-confirmation ${confirmation?.blocker_reason ? 'blocked' : confirmation?.confirmed_at ? 'confirmed' : ''}`} key={party}><span>{confirmation?.blocker_reason ? <CircleAlert size={14} /> : confirmation?.confirmed_at ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}</span><div><b>{party}</b><p>{confirmation?.blocker_reason || (confirmation?.confirmed_at ? `Confirmed ${dateTimeLabel(confirmation.confirmed_at)}` : 'Waiting for participant')}</p></div></div>
          })}</div>)}</div>
        </section>

        <section className="admin-handoff-panel" aria-labelledby="blocker-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">SAFETY GATE</span><h2 id="blocker-heading">Blockers & issue hold</h2></div></div>
          {bookingCompleted ? <div className="admin-handoff-clear"><CheckCircle2 size={17} /> Booking completed.</div> : detail.blockers.length ? <ul className="admin-handoff-blockers">{detail.blockers.map((blocker) => <li key={blocker}><X size={13} /> {blocker}</li>)}</ul> : <div className="admin-handoff-clear"><CheckCircle2 size={17} /> {custodyComplete ? 'Physical custody finished. Review the separate completion requirements below.' : 'No system blockers. The assigned operator can perform the next guarded hub action.'}</div>}
          {!bookingCompleted && <><label className="admin-handoff-hold-field" htmlFor="issue-hold-reason"><span>Hub issue note</span><textarea id="issue-hold-reason" value={holdReason} maxLength={800} disabled={Boolean(busy)} onChange={(event) => setHoldReason(event.target.value)} placeholder="Describe damage, identity mismatch, missing accessories, or another reason to stop the exchange." /></label>
          {detail.issue_hold_reason ? <button className="owner-button" type="button" disabled={Boolean(busy)} onClick={() => void clearHold()}>{busy === 'hold' ? 'Clearing…' : 'Clear resolved hold'}</button> : <button className="owner-button" type="button" disabled={Boolean(busy) || !holdReason.trim()} onClick={() => void saveHold()}>{busy === 'hold' ? 'Placing hold…' : 'Place issue hold'}</button>}</>}
        </section>

        <section className="admin-handoff-panel admin-handoff-transition-panel" aria-labelledby="transition-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">STAFF WITNESS</span><h2 id="transition-heading">Physical transition</h2></div><LockKeyhole size={17} /></div>
          {custodyComplete ? <div className="admin-handoff-inline-state"><CheckCircle2 size={18} /><div><b>Returned to owner</b><p>{bookingCompleted ? 'The gear has been returned to the owner and this booking is completed.' : 'Physical custody is finished, but the booking is not completed. Wait for both return confirmations and resolve the deposit, then select Mark as done.'}</p></div></div> : <><p className="admin-handoff-panel-intro">Use these controls only while witnessing the physical exchange. They record custody; they do not confirm payment or escrow.</p>
          {detail.allowed_transitions.length ? detail.allowed_transitions.map((action) => <div className="admin-handoff-transition" key={action}><PackageCheck size={18} /><div><b>{ACTIONS[action].label}</b><p>{ACTIONS[action].detail}</p><button className="owner-button dark" type="button" disabled={Boolean(busy) || detail.blockers.length > 0} onClick={() => void transition(action)}>{busy === action ? 'Recording…' : ACTIONS[action].label} <ArrowRight size={12} /></button></div></div>) : <div className="admin-handoff-inline-state muted"><Clock3 size={18} /><div><b>No transition available</b><p>Complete the required records or wait for the next physical exchange.</p></div></div>}</>}
        </section>

        <section className="admin-handoff-panel admin-handoff-completion-panel" aria-labelledby="completion-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">SEPARATE FROM PHYSICAL CUSTODY</span><h2 id="completion-heading">Booking completion</h2></div><span className={`admin-handoff-badge ${bookingCompleted ? 'completed' : 'awaiting-completion'}`}>{bookingCompleted ? 'Completed' : booking.status === 'returned' ? 'Awaiting completion' : booking.status.replaceAll('_', ' ')}</span></div>
          {bookingCompleted ? <div className="admin-handoff-inline-state"><CheckCircle2 size={18} /><div><b>Booking marked as done</b><p>The booking record is completed. This status does not mean LensShare automatically transferred money.</p></div></div> : <>
            <p className="admin-handoff-panel-intro">Returning gear to the owner does not finish the booking. Both participants must confirm the return, the deposit must be resolved, and all completion blockers must be cleared.</p>
            {completionBlockers.length ? <ul className="admin-handoff-blockers">{completionBlockers.map((blocker) => <li key={blocker}><X size={13} /> {blocker}</li>)}</ul> : booking.status === 'returned' && <div className="admin-handoff-clear"><CheckCircle2 size={17} /> No completion blockers recorded. The server rechecks all requirements when you mark this booking as done.</div>}
            <p className="admin-handoff-permission-note">Only the owner or assigned hub admin may complete this booking. {canComplete ? 'You are the assigned hub admin.' : 'You are not the assigned hub admin; ask the assigned operator or owner to complete it.'} Other admins may still resolve the deposit.</p>
            {booking.status === 'returned' ? <button className="owner-button dark" type="button" disabled={Boolean(busy) || !canComplete || completionBlockers.length > 0} onClick={() => setConfirmAction({ type: 'complete', bookingId: booking.id })}>{busy === 'complete' ? 'Marking as done…' : 'Mark as done'} <CheckCircle2 size={13} /></button> : <p className="admin-handoff-permission-note">Mark as done becomes available only when the booking status is returned.</p>}
          </>}
        </section>

        <section className="admin-handoff-panel" aria-labelledby="timeline-heading">
          <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">AUDIT TRAIL</span><h2 id="timeline-heading">Custody timeline</h2></div></div>
          {detail.timeline.length ? <ol className="admin-handoff-timeline">{detail.timeline.map((event) => <li key={event.id}><span /><div><b>{event.label}</b><p>{event.detail}</p><small>{dateTimeLabel(event.occurred_at)}{event.actor ? ` · ${event.actor.full_name}` : ''}</small></div></li>)}</ol> : <div className="admin-handoff-inline-state muted"><Clock3 size={18} /><div><b>No custody events yet</b><p>The first witnessed physical transition will start this timeline.</p></div></div>}
        </section>
      </aside>
    </div>

    <ConfirmDialog
      open={confirmAction?.type === 'rental-payment'}
      busy={busy === 'rental-payment-accepted' || busy === 'rental-payment-rejected'}
      tone={confirmAction?.type === 'rental-payment' && confirmAction.decision === 'rejected' ? 'danger' : 'default'}
      title={confirmAction?.type === 'rental-payment' && confirmAction.decision === 'accepted' ? 'Accept this rental receipt after manual review?' : 'Reject this rental-payment proof?'}
      description={<>
        <p>{confirmAction?.type === 'rental-payment' && confirmAction.decision === 'accepted' ? 'This records a manual visual check of the exact rental receipt you opened. It does not verify the GCash transaction, guarantee settlement, create escrow, or accept the separate deposit proof.' : 'Your reason will be recorded so the renter can correct and resubmit the rental receipt. The separate deposit review is unchanged.'}</p>
        {confirmAction?.type === 'rental-payment' && confirmAction.reviewNote && <p><strong>Rental reviewer note:</strong> {confirmAction.reviewNote}</p>}
      </>}
      confirmLabel={confirmAction?.type === 'rental-payment' && confirmAction.decision === 'accepted' ? 'Accept rental proof check' : 'Reject rental proof'}
      onConfirm={() => { if (confirmAction?.type === 'rental-payment') void confirmRentalPaymentReview(confirmAction) }}
      onClose={() => setConfirmAction(null)}
    />
    <ConfirmDialog
      open={confirmAction?.type === 'deposit'}
      busy={busy === 'deposit-accepted' || busy === 'deposit-rejected'}
      tone={confirmAction?.type === 'deposit' && confirmAction.decision === 'rejected' ? 'danger' : 'default'}
      title={confirmAction?.type === 'deposit' && confirmAction.decision === 'accepted'
        ? 'Record this proof check as passed?'
        : 'Reject this deposit proof?'}
      description={confirmAction?.type === 'deposit' && confirmAction.decision === 'accepted'
        ? 'This records that the receipt image passed the manual visual check. It does not confirm the GCash provider transaction and is not escrow.'
        : 'The renter will be asked to submit a new proof, and your reviewer note is kept on the record.'}
      confirmLabel={confirmAction?.type === 'deposit' && confirmAction.decision === 'accepted' ? 'Accept proof check' : 'Reject proof'}
      onConfirm={() => { if (confirmAction?.type === 'deposit') void confirmDepositReview(confirmAction) }}
      onClose={() => setConfirmAction(null)}
    />
    <ConfirmDialog
      open={confirmAction?.type === 'deposit-resolution'}
      busy={confirmAction?.type === 'deposit-resolution' ? busy === `deposit-resolution-${confirmAction.decision}` : false}
      tone={confirmAction?.type === 'deposit-resolution' && confirmAction.decision === 'forfeit' ? 'danger' : 'default'}
      title={confirmAction?.type === 'deposit-resolution' && confirmAction.decision === 'forfeit' ? 'Irrevocably forfeit the full deposit?' : confirmAction?.type === 'deposit-resolution' && confirmAction.decision === 'confirm_refund' ? 'Confirm the refund was completed externally?' : 'Start a manual refund record?'}
      description={confirmAction?.type === 'deposit-resolution' ? <>
        <p>{confirmAction.decision === 'refund' ? 'This records refund pending only. No money is sent or refunded automatically. Refund externally, then confirm using the actual transaction reference.' : confirmAction.decision === 'confirm_refund' ? 'Confirm only after the renter has actually received the full refund outside LensShare. This final record is irrevocable here. It does not send money or verify the payment provider.' : 'This irrevocably records forfeiture of the entire deposit, not a partial amount. Confirm only when the reason supports keeping the full deposit and no external refund has been made. No money is transferred automatically.'}</p>
        <p><strong>Full deposit:</strong> {pesos(confirmAction.amount)}</p>
        <p><strong>{confirmAction.decision === 'confirm_refund' ? 'Actual external refund reference:' : 'Reason:'}</strong> {confirmAction.note}</p>
      </> : undefined}
      confirmLabel={confirmAction?.type === 'deposit-resolution' && confirmAction.decision === 'forfeit' ? 'Forfeit full deposit' : confirmAction?.type === 'deposit-resolution' && confirmAction.decision === 'confirm_refund' ? 'Record completed external refund' : 'Record refund pending'}
      onConfirm={() => { if (confirmAction?.type === 'deposit-resolution') void confirmDepositResolution(confirmAction) }}
      onClose={() => setConfirmAction(null)}
    />
    <ConfirmDialog
      open={confirmAction?.type === 'complete'}
      busy={busy === 'complete'}
      title="Mark this booking as done?"
      description="This completes the booking only after the server verifies the physical return, both return confirmations, deposit resolution, and all other completion requirements. It does not send a payout, refund, or any other money transfer."
      confirmLabel="Mark as done"
      onConfirm={() => { if (confirmAction?.type === 'complete') void confirmCompletion(confirmAction.bookingId) }}
      onClose={() => setConfirmAction(null)}
    />
    <ConfirmDialog
      open={confirmAction?.type === 'clear-hold'}
      busy={busy === 'hold'}
      tone="danger"
      title="Clear this issue hold?"
      description="Only continue if the recorded issue is resolved. Physical transitions become available again immediately."
      confirmLabel="Clear hold"
      onConfirm={() => void confirmClearHold()}
      onClose={() => setConfirmAction(null)}
    />
    <ConfirmDialog
      open={confirmAction?.type === 'transition'}
      busy={confirmAction?.type === 'transition' ? busy === confirmAction.action : false}
      title={confirmAction?.type === 'transition' ? ACTIONS[confirmAction.action].confirm : 'Confirm physical transition?'}
      description={confirmAction?.type === 'transition' ? ACTIONS[confirmAction.action].detail : undefined}
      confirmLabel={confirmAction?.type === 'transition' ? ACTIONS[confirmAction.action].label : 'Confirm'}
      onConfirm={() => { if (confirmAction?.type === 'transition') void confirmTransition(confirmAction.action) }}
      onClose={() => setConfirmAction(null)}
    />
  </AdminShell>
}

function Signature({ name, party, signedAt }: { name: string; party: string; signedAt: string | null }) {
  return <div className={signedAt ? 'signed' : ''}><span>{signedAt ? <CheckCircle2 size={16} /> : <FileSignature size={16} />}</span><div><small>{party}</small><b>{name}</b><p>{signedAt ? `Signed ${dateTimeLabel(signedAt)}` : 'Signature still required'}</p></div></div>
}

function InspectionForm({ bookingId, stage, inspection, onOpenPhoto, onSaved }: {
  bookingId: string
  stage: HubInspectionStage
  inspection?: HubInspection
  onOpenPhoto: (path: string, label: string) => Promise<void>
  onSaved: () => Promise<void>
}) {
  const toast = useToast()
  const [serial, setSerial] = useState(inspection?.serial_number ?? '')
  const [notes, setNotes] = useState(inspection?.notes ?? '')
  const [checks, setChecks] = useState<Record<string, boolean>>(inspection?.checks ?? {})
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checksForStage = INSPECTION_CHECKS[stage]
  const title = stage === 'pre_release' ? 'Pre-release inspection' : 'Post-return inspection'
  const eyebrow = stage === 'pre_release' ? 'BEFORE RENTER RELEASE' : 'AFTER RENTER RETURN'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const missingCheck = checksForStage.some((check) => !checks[check.key])
    if (!serial.trim() || !notes.trim() || missingCheck || (!inspection?.photo_paths.length && !files.length)) {
      setError('Serial, condition notes, every check, and at least one inspection photo are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveAdminHubInspection(bookingId, {
        stage,
        serial_number: serial.trim(),
        notes: notes.trim(),
        checks,
      }, files)
      setFiles([])
      await onSaved()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save this inspection.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-handoff-panel" aria-labelledby={`${stage}-heading`}>
    <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">{eyebrow}</span><h2 id={`${stage}-heading`}>{title}</h2></div>{inspection && <span className="admin-handoff-badge complete">Saved {dateTimeLabel(inspection.submitted_at)}</span>}</div>
    <form className="admin-handoff-inspection" onSubmit={submit}>
      <label><span>Equipment serial number <b>Required</b></span><input required value={serial} maxLength={120} onChange={(event) => setSerial(event.target.value)} placeholder="Enter the serial printed on the unit" /></label>
      <fieldset><legend>Required physical checks</legend>{checksForStage.map((check) => <label className="admin-handoff-check" key={check.key}><input type="checkbox" checked={Boolean(checks[check.key])} onChange={(event) => setChecks((current) => ({ ...current, [check.key]: event.target.checked }))} /><span><Check size={12} />{check.label}</span></label>)}</fieldset>
      <label><span>Condition notes <b>Required</b></span><textarea required maxLength={1500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={stage === 'pre_release' ? 'Record existing marks, optical condition, battery count, and accessories.' : 'Compare against pre-release condition; record wear, damage, missing items, or “no change.”'} /></label>
      {inspection?.photo_paths.length ? <div className="admin-handoff-existing-photos"><span>Saved inspection photos</span><div>{inspection.photo_paths.map((path, index) => <button className="owner-button" type="button" key={path} onClick={() => void onOpenPhoto(path, `Inspection photo ${index + 1}`)}><Camera size={12} /> Photo {index + 1} <ExternalLink size={11} /></button>)}</div></div> : null}
      <label className="admin-handoff-upload"><Upload size={18} /><span>{files.length ? `${files.length} new photo${files.length === 1 ? '' : 's'} selected` : inspection?.photo_paths.length ? 'Add more inspection photos' : 'Upload at least one inspection photo'}<small>JPG, PNG, HEIC, or WEBP · clear serial and condition evidence</small></span><input type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple required={!inspection?.photo_paths.length} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
      {error && <p className="admin-handoff-form-error" role="alert">{error}</p>}
      <button className="owner-button dark" type="submit" disabled={busy}>{busy ? 'Saving inspection…' : inspection ? 'Update inspection' : 'Save inspection'}</button>
    </form>
  </section>
}

function DetailSkeleton() {
  return <div className="admin-handoff-detail-skeleton" aria-label="Loading hand-off record" aria-busy="true"><div className="skeleton" /><div><i className="skeleton" /><i className="skeleton" /><i className="skeleton" /></div></div>
}
