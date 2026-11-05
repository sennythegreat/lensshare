'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Printer, Signature } from 'lucide-react'
import './agreement.css'
import { RentalAgreementSheet } from '@/components/rental-agreement-sheet'
import { AgreementSignatureDialog, type SignatureCaptureMethod } from '@/components/agreement-signature-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionSkeleton, ErrorState } from '@/components/states'
import { useToast } from '@/components/toast'
import { fetchBookingById, fetchBookingHandoffs, fetchRentalHub, saveHandoff, signRentalAgreement } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { BookingHandoff, BookingWithRelations, HandoffParty, RentalHubData } from '@/lib/types'

export default function AgreementPage() {
  return <Suspense fallback={<main className="agreement-page"><SectionSkeleton rows={5} /></main>}>
    <AgreementContent />
  </Suspense>
}

function AgreementContent() {
  const params = useSearchParams()
  const toast = useToast()
  const bookingId = params.get('id') ?? ''
  const { user, profile, loading: profileLoading } = useProfile()
  const [booking, setBooking] = useState<BookingWithRelations | null>(null)
  const [handoffs, setHandoffs] = useState<BookingHandoff[]>([])
  const [rentalHub, setRentalHub] = useState<RentalHubData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [confirmSign, setConfirmSign] = useState(false)

  const load = useCallback(async () => {
    if (!bookingId || !user) return
    setState('loading')
    try {
      const [bookingRow, handoffRows] = await Promise.all([fetchBookingById(bookingId), fetchBookingHandoffs(bookingId)])
      if (!bookingRow) throw new Error('Agreement not found.')
      const workflowVersion = Number((bookingRow as BookingWithRelations & { workflow_version?: number }).workflow_version ?? 1)
      const hubRow = workflowVersion >= 2 ? await fetchRentalHub(bookingId) : null
      setBooking(bookingRow)
      setHandoffs(handoffRows)
      setRentalHub(hubRow)
      setState('ready')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'This agreement could not be loaded.')
      setState('error')
    }
  }, [bookingId, user])

  useEffect(() => { void load() }, [load])

  const signerParty: HandoffParty | null = booking && user
    ? booking.renter_id === user.id
      ? 'renter'
      : booking.owner_id === user.id ? 'owner' : null
    : null
  const workflowVersion = Number((booking as (BookingWithRelations & { workflow_version?: number }) | null)?.workflow_version ?? 1)
  const isHubWorkflow = workflowVersion >= 2
  const ownerSigned = rentalHub?.agreement?.owner_signed_at
    ? true
    : handoffs.some((row) => row.party === 'owner' && row.stage === 'agreement')
  const renterSigned = rentalHub?.agreement?.renter_signed_at
    ? true
    : handoffs.some((row) => row.party === 'renter' && row.stage === 'agreement')
  const ownSigned = signerParty === 'owner' ? ownerSigned : signerParty === 'renter' ? renterSigned : false
  const canSign = Boolean(
    booking
    && signerParty
    && !ownSigned
    && (isHubWorkflow
      ? booking.status === 'approved' && rentalHub?.agreement
      : signerParty === 'renter' && booking.status !== 'pending' && booking.status !== 'declined'),
  )

  async function handleAccept(file: File, captureMethod: SignatureCaptureMethod) {
    if (!booking || !user || !signerParty || !canSign || !rentalHub?.agreement) return
    setBusy(true)
    setMessage('')
    try {
      await signRentalAgreement(booking.id, rentalHub.agreement, file, captureMethod)
      await load()
      setSignatureOpen(false)
      toast.success('Your signature was recorded — the agreement is immutable.')
    } catch (cause) {
      const signingError = cause instanceof Error ? cause.message : 'Could not save the signature.'
      setMessage(signingError)
      toast.error(signingError)
      throw cause
    } finally {
      setBusy(false)
    }
  }

  async function handleLegacyAccept() {
    if (!booking || !user || signerParty !== 'renter' || isHubWorkflow || !canSign) return
    setConfirmSign(false)
    setBusy(true)
    setMessage('')
    try {
      await saveHandoff(booking.id, user.id, signerParty, 'agreement', {})
      await load()
      toast.success('Your agreement acceptance was recorded.')
    } catch (cause) {
      const signingError = cause instanceof Error ? cause.message : 'Could not save the agreement acceptance.'
      setMessage(signingError)
      toast.error(signingError)
    } finally {
      setBusy(false)
    }
  }

  if (!bookingId) return <main className="agreement-page"><p className="agreement-muted">Missing booking reference. Open this page from a booking.</p></main>
  if (profileLoading || state === 'loading') return <main className="agreement-page"><SectionSkeleton rows={5} /></main>
  if (state === 'error' || !booking) return <main className="agreement-page"><ErrorState title="Agreement not available" hint={message || 'This booking could not be loaded, or you are not a participant in it.'} retry={() => void load()} /></main>

  const backHref = isHubWorkflow
    ? profile?.role === 'admin'
      ? `/admin/handoffs/${booking.id}`
      : signerParty === 'owner' ? `/dashboard/rentals/${booking.id}` : `/renter/bookings/${booking.id}`
    : profile?.role === 'owner' ? '/dashboard/rentals' : '/renter/bookings'

  return <main className="agreement-page">
    <div className="agreement-toolbar no-print">
      <Link href={backHref}>← Back to {isHubWorkflow ? 'rental hub' : 'bookings'}</Link>
      <div className="agreement-toolbar-actions">
        <button className="button light" onClick={() => window.print()}><Printer size={14} /> Print / save PDF</button>
        {canSign && <button className="button dark" disabled={busy} onClick={() => isHubWorkflow ? setSignatureOpen(true) : setConfirmSign(true)}><Signature size={14} /> {busy ? 'Signing…' : isHubWorkflow ? 'Add your signature' : `Sign as ${signerParty}`}</button>}
      </div>
    </div>
    {message && <p className="agreement-error no-print">{message}</p>}
    {ownSigned && <p className="agreement-signed-banner no-print">Your immutable {signerParty} signature is recorded.</p>}
    <RentalAgreementSheet booking={booking} handoffs={handoffs} rentalHub={rentalHub} />
    <AgreementSignatureDialog
      open={signatureOpen}
      busy={busy}
      signerParty={signerParty === 'owner' ? 'owner' : 'renter'}
      signerName={signerParty === 'owner' ? booking.owner?.full_name || 'Owner' : booking.renter?.full_name || 'Renter'}
      onSubmit={handleAccept}
      onClose={() => { if (!busy) setSignatureOpen(false) }}
    />
    <ConfirmDialog
      open={confirmSign && !isHubWorkflow}
      busy={busy}
      tone="danger"
      title="Accept this rental agreement?"
      description="Your authenticated acceptance is permanent and cannot be withdrawn afterwards."
      confirmLabel="Accept agreement"
      onConfirm={() => void handleLegacyAccept()}
      onClose={() => setConfirmSign(false)}
    />
  </main>
}
