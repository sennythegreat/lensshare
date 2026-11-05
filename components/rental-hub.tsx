'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  History,
  MapPin,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Signature,
  Upload,
  UserCheck,
} from 'lucide-react'
import { ErrorState, SectionSkeleton } from '@/components/states'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { AgreementSignatureDialog, type SignatureCaptureMethod } from '@/components/agreement-signature-dialog'
import { useToast } from '@/components/toast'
import { RentalAgreementSheet } from '@/components/rental-agreement-sheet'
import {
  confirmRentalStep,
  decideRentalRequest,
  fetchInspectionPhotoUrl,
  HUB_PAYMENT_PROOF_ACCEPT,
  HUB_PAYMENT_PROOF_MAX_BYTES,
  signRentalAgreement,
  submitDepositProof,
  submitRentalPaymentProof,
} from '@/lib/data'
import { participantConfirmationKinds, participantConfirmationReadiness } from '@/lib/rental-workflow'
import { pesos, RENTAL_PAYMENT_STATUS_LABELS } from '@/lib/types'
import { useRentalHub } from '@/lib/use-rental-hub'
import type {
  BookingWithRelations,
  RentalConfirmationKind,
  RentalHubData,
  RentalHubEvent,
  RentalHubParty,
  RentalInspection,
  RentalInspectionPhoto,
  RentalWorkflowBlocker,
} from '@/lib/types'
import './rental-hub.css'

const CUSTODY_STEPS = [
  { state: 'with_owner', label: 'With owner', detail: 'Owner prepares the complete kit.' },
  { state: 'at_hub_pre_rental', label: 'At Naga Hub', detail: 'Drop-off and pre-rental inspection.' },
  { state: 'with_renter', label: 'With renter', detail: 'Renter has collected the inspected kit.' },
  { state: 'at_hub_post_rental', label: 'Returned to hub', detail: 'Post-rental inspection and deposit resolution.' },
  { state: 'returned_to_owner', label: 'Owner collected', detail: 'Kit custody has returned to the owner.' },
] as const

const CONFIRMATION_COPY: Record<string, { label: string; description: string }> = {
  owner_dropoff: { label: 'Confirm owner drop-off', description: 'I handed the listed kit to the assigned Naga Hub operator.' },
  pre_inspection: { label: 'Confirm pre-rental inspection', description: 'I reviewed the finalized pre-rental inspection and private photos.' },
  renter_pickup: { label: 'Confirm renter pickup', description: 'I collected the inspected kit from the Naga Hub operator.' },
  renter_return: { label: 'Confirm renter return', description: 'I returned the complete kit to the Naga Hub operator.' },
  post_inspection: { label: 'Confirm post-rental inspection', description: 'I reviewed the finalized return inspection and private photos.' },
  owner_collection: { label: 'Confirm owner collection', description: 'I collected the returned kit from the Naga Hub operator.' },
}

type RentalHubProps = {
  bookingId: string
  party: RentalHubParty
}

export function RentalHub({ bookingId, party }: RentalHubProps) {
  const { data: hubData, loading, error: loadError, refresh } = useRentalHub(bookingId, party)
  const toast = useToast()
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [rentalReference, setRentalReference] = useState('')
  const [rentalFile, setRentalFile] = useState<File | null>(null)
  const [depositReference, setDepositReference] = useState('')
  const [depositFile, setDepositFile] = useState<File | null>(null)
  const [notice, setNotice] = useState('')
  const [confirmAction, setConfirmAction] = useState<'decline' | null>(null)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const paymentRecipientReady = Boolean(hubData?.hub?.gcash_recipient_name?.trim() && hubData?.hub?.gcash_recipient_number?.trim())
  const canSubmitRentalPayment = party === 'renter' && hubData?.booking.status === 'approved' && ['awaiting_payment', 'rejected'].includes(hubData.rental_payment?.status ?? '')
  const canSubmitDeposit = party === 'renter' && hubData?.booking.status === 'approved' && ['proof_required', 'rejected'].includes(hubData.deposit?.status ?? '')

  async function perform(action: string, operation: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusyAction(action)
    setActionError('')
    setNotice('')
    try {
      await operation()
      await refresh(true)
      setNotice(success)
      toast.success(success)
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That action could not be completed.'
      setActionError(message)
      toast.error(message)
      return false
    } finally {
      setBusyAction('')
    }
  }

  async function confirmParticipantStep(kind: RentalConfirmationKind) {
    if (!hubData) return
    const readiness = participantConfirmationReadiness(hubData, party, kind)
    if (!readiness.ready) {
      const message = readiness.reason || 'This confirmation is not available yet.'
      setNotice('')
      setActionError(message)
      toast.error(message)
      return
    }
    const copy = CONFIRMATION_COPY[kind]
    await perform(`confirm-${kind}`, () => confirmRentalStep(bookingId, kind), `${copy.label} recorded.`)
  }

  async function submitSignature(file: File, captureMethod: SignatureCaptureMethod) {
    if (!hubData?.agreement) return
    setBusyAction('sign')
    setActionError('')
    setNotice('')
    try {
      await signRentalAgreement(bookingId, hubData.agreement, file, captureMethod)
      const success = 'Your immutable agreement signature was recorded.'
      setNotice(success)
      toast.success(success)
      await refresh(true)
      setSignatureOpen(false)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That signature could not be saved.'
      setActionError(message)
      toast.error(message)
      throw cause
    } finally {
      setBusyAction('')
    }
  }

  async function submitRentalPayment(): Promise<boolean> {
    if (!canSubmitRentalPayment || !paymentRecipientReady || busyAction || !rentalFile || !rentalReference.trim()) return false
    const submitted = await perform('rental-payment', async () => {
      const payment = await submitRentalPaymentProof(bookingId, rentalReference.trim(), rentalFile)
      if (!payment) throw new Error('Rental-payment submission was not confirmed. Your receipt and reference have been kept; contact the hub operator before trying again.')
    }, 'Rental-payment receipt submitted for manual review.')
    if (submitted) {
      setRentalFile(null)
      setRentalReference('')
    }
    return submitted
  }

  async function submitDeposit(): Promise<boolean> {
    if (!canSubmitDeposit || !paymentRecipientReady || busyAction || !depositFile || !depositReference.trim()) return false
    const submitted = await perform('deposit', async () => {
      const deposit = await submitDepositProof(bookingId, depositReference.trim(), depositFile)
      if (!deposit) throw new Error('Deposit submission was not confirmed. Your receipt and reference have been kept; contact the hub operator before trying again.')
    }, 'Deposit receipt submitted for manual review.')
    if (submitted) {
      setDepositFile(null)
      setDepositReference('')
    }
    return submitted
  }

  if (loading) return <div className="hub-loading"><SectionSkeleton rows={6} /></div>
  if (!hubData) return <ErrorState title="Rental hub not available" hint={loadError?.message || 'This booking does not exist, is not a hub rental, or you are not a participant.'} retry={() => { void refresh() }} />

  const { booking } = hubData
  const backHref = party === 'owner' ? '/dashboard/rentals' : '/renter/bookings'
  const counterpart = party === 'owner' ? booking.renter?.full_name : booking.owner?.full_name
  const isPending = booking.status === 'pending'
  const isDeclined = booking.status === 'declined'
  const ownerSigned = Boolean(hubData.agreement?.owner_signed_at)
  const renterSigned = Boolean(hubData.agreement?.renter_signed_at)
  const ownSigned = party === 'owner' ? ownerSigned : renterSigned
  const canSign = Boolean(hubData.agreement && !ownSigned && booking.status === 'approved')
  const operatorAssigned = Boolean(hubData.operation?.assigned_operator_id)
  const confirmationSet = new Set((hubData.confirmations ?? []).map((confirmation) => `${confirmation.party}:${confirmation.kind}`))

  return <div className="rental-hub">
    <div className="hub-topbar">
      <Link href={backHref} className="hub-back"><ArrowLeft size={15} /> Back to {party === 'owner' ? 'rentals' : 'bookings'}</Link>
      <div className="hub-top-actions">
        <button type="button" className="hub-text-button" onClick={() => { void refresh(true) }} disabled={Boolean(busyAction)}><RefreshCw size={13} /> Refresh</button>
        {!isDeclined && <Link href={`/chat?id=${booking.id}`} className="hub-text-button"><MessageCircle size={13} /> Messages</Link>}
        <Link href={`/agreement?id=${booking.id}`} className="hub-text-button"><FileCheck2 size={13} /> Agreement</Link>
      </div>
    </div>

    <header className="hub-hero">
      <div className="hub-gear-photo"><img src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" /></div>
      <div className="hub-hero-copy">
        <p className="hub-kicker">RENTAL HUB · BOOKING #{shortId(booking.id)}</p>
        <div className="hub-title-row"><h1>{agreementEquipmentName(hubData) || booking.listing?.name || 'Rental equipment'}</h1><HubBadge value={booking.status} /></div>
        <p>{dateRange(booking)} · {booking.days} {booking.days === 1 ? 'day' : 'days'} · with {counterpart || (party === 'owner' ? 'renter' : 'owner')}</p>
        <div className="hub-hero-meta"><span><PackageCheck size={14} /> {custodyLabel(hubData.operation?.custody_display_state)}</span><span><MapPin size={14} /> {hubData.hub?.name || 'Naga City Hub'}</span></div>
      </div>
    </header>

    {isPending && party === 'owner' && <section className="hub-decision-panel">
      <div><p className="hub-kicker">OWNER DECISION</p><h2>Review this rental request</h2><p>{operatorAssigned ? 'Approval creates the immutable version-2 equipment, hub, pricing, deposit, and agreement snapshot. Hub safeguards then control every physical hand-off.' : 'A platform admin must assign a Naga Hub operator before you can approve this request. You can still decline it now.'}</p></div>
      <div><button type="button" className="hub-button primary" disabled={!operatorAssigned || Boolean(busyAction)} title={!operatorAssigned ? 'Waiting for a platform admin to assign a Naga Hub operator.' : undefined} onClick={() => perform('approve', () => decideRentalRequest(booking.id, 'approved'), 'Request approved. The hub workflow is ready.')}>{busyAction === 'approve' ? 'Approving…' : operatorAssigned ? 'Approve request' : 'Waiting for operator'}</button><button type="button" className="hub-button danger" disabled={Boolean(busyAction)} onClick={() => setConfirmAction('decline')}>{busyAction === 'decline' ? 'Declining…' : 'Decline request'}</button></div>
    </section>}

    {isPending && party === 'renter' && <section className="hub-waiting"><Clock3 size={17} /><div><strong>Waiting for owner approval</strong><span>Your price request is recorded. Hub operations, rental-payment and deposit receipts, and agreement signatures open only after approval creates an immutable booking snapshot.</span></div></section>}
    {isDeclined && <section className="hub-waiting declined"><AlertCircle size={17} /><div><strong>This request was declined</strong><span>The hub record is retained as a read-only booking history.</span></div></section>}
    {notice && <p className="hub-notice" role="status"><CheckCircle2 size={15} /> {notice}</p>}
    {actionError && <p className="hub-error" role="alert"><AlertCircle size={15} /> {actionError}</p>}

    <div className="hub-layout">
      <div className="hub-main-column">
        <HubSection eyebrow="CUSTODY" title="Where the equipment is now" icon={<PackageCheck size={17} />}>
          <CustodyTimeline data={hubData} />
        </HubSection>

        <HubSection eyebrow="RENTAL PAYMENT & DEPOSIT" title="Two separate booking amounts" icon={<Banknote size={17} />}>
          <PriceAndDeposit
            data={hubData}
            rentalForm={canSubmitRentalPayment && <PaymentProofForm
              purpose="rental"
              amount={hubData.rental_payment?.amount ?? Number(booking.total)}
              hub={hubData.hub}
              reference={rentalReference}
              file={rentalFile}
              onReferenceChange={setRentalReference}
              onFileChange={setRentalFile}
              onSubmit={submitRentalPayment}
              busy={busyAction === 'rental-payment'}
              disabled={Boolean(busyAction)}
            />}
            depositForm={canSubmitDeposit && <PaymentProofForm
              purpose="deposit"
              amount={depositAmount(hubData)}
              hub={hubData.hub}
              reference={depositReference}
              file={depositFile}
              onReferenceChange={setDepositReference}
              onFileChange={setDepositFile}
              onSubmit={submitDeposit}
              busy={busyAction === 'deposit'}
              disabled={Boolean(busyAction)}
            />}
          />
        </HubSection>

        <HubSection eyebrow="AGREEMENT" title="One immutable set of terms" icon={<Signature size={17} />}>
          <div className="hub-agreement-summary">
            <div><strong>{hubData.agreement ? `Version ${hubData.agreement.version}` : 'Created after approval'}</strong><p>{hubData.agreement ? `Terms fingerprint ${shortHash(hubData.agreement.terms_hash)}` : 'The owner must approve before the immutable agreement is created.'}</p></div>
            <Link className="hub-button secondary" href={`/agreement?id=${booking.id}`}>Read full agreement</Link>
          </div>
          <div className="hub-signature-grid">
            <SignatureStatus label="Owner" name={booking.owner?.full_name} signedAt={hubData.agreement?.owner_signed_at} />
            <SignatureStatus label="Renter" name={booking.renter?.full_name} signedAt={hubData.agreement?.renter_signed_at} />
          </div>
          {canSign && <div className="hub-action-callout"><div><strong>Your signature is required</strong><p>Review the full agreement, then draw or upload your signature to accept this booking’s immutable equipment, Naga Hub, rental-price, and security-deposit snapshot.</p></div><button type="button" className="hub-button primary" disabled={Boolean(busyAction)} onClick={() => setSignatureOpen(true)}>{busyAction === 'sign' ? 'Signing…' : 'Add your signature'}</button></div>}
        </HubSection>

        <HubSection eyebrow="PRIVATE INSPECTIONS" title="Finalized condition evidence" icon={<Camera size={17} />}>
          <div className="hub-privacy-note"><ShieldCheck size={15} /><span>Formal inspection evidence is private to booking participants and authorized hub staff. Chat attachments are not inspection evidence.</span></div>
          <div className="hub-inspections">
            {(['pre_rental', 'post_rental'] as const).map((kind) => <InspectionCard key={kind} inspection={(hubData.inspections ?? []).find((item) => item.kind === kind)} kind={kind} />)}
          </div>
        </HubSection>

        <HubSection eyebrow="PARTICIPANT CONFIRMATIONS" title="Your part of the custody record" icon={<UserCheck size={17} />}>
          <div className="hub-confirmations">
            {participantConfirmationKinds(party).map((kind) => {
              const copy = CONFIRMATION_COPY[kind] ?? { label: humanize(kind), description: 'Confirm this recorded rental step.' }
              const done = confirmationSet.has(`${party}:${kind}`)
              const readiness = participantConfirmationReadiness(hubData, party, kind)
              return <article className={`hub-confirmation ${done ? 'done' : readiness.ready ? 'ready' : 'waiting'}`} key={kind}>
                <span className="hub-confirmation-check">{done ? <Check size={14} /> : null}</span>
                <div><strong>{copy.label}</strong><p>{copy.description}</p>{!done && !readiness.ready && <p className="hub-confirmation-reason"><Clock3 size={12} /> Not ready — {readiness.reason}</p>}</div>
                {done ? <small>Recorded</small> : <button type="button" className="hub-button secondary" disabled={Boolean(busyAction)} onClick={() => { void confirmParticipantStep(kind) }}>{busyAction === `confirm-${kind}` ? 'Saving…' : 'Confirm'}</button>}
              </article>
            })}
          </div>
        </HubSection>
      </div>

      <aside className="hub-side-column">
        <HubSection eyebrow="NAGA CITY HUB" title={hubData.hub?.name || 'Configured hub'} icon={<MapPin size={17} />} compact>
          <address className="hub-address"><strong>{hubData.hub?.address || 'Hub address is being configured'}</strong>{hubData.hub?.hours && <span>{hubData.hub.hours}</span>}{hubData.hub?.contact_phone && <a href={`tel:${hubData.hub.contact_phone}`}>{hubData.hub.contact_phone}</a>}</address>
          <p className="hub-fine-print">All version-2 custody transfers happen through this configured hub and its assigned operator—not through an unrecorded private hand-off.</p>
        </HubSection>

        <HubSection eyebrow="CURRENT BLOCKERS" title="What must happen next" icon={<AlertCircle size={17} />} compact>
          <BlockerList blockers={hubData.blockers ?? []} />
        </HubSection>

        <HubSection eyebrow="IMMUTABLE HISTORY" title="Booking events" icon={<History size={17} />} compact>
          <EventList events={hubData.events ?? []} />
        </HubSection>
      </aside>
    </div>

    <ConfirmDialog
      open={confirmAction === 'decline'}
      busy={busyAction === 'decline'}
      tone="danger"
      title="Decline this rental request?"
      description="The request will be turned down permanently and the hub record becomes read-only history. The other party would need to book again."
      confirmLabel="Decline request"
      onConfirm={() => { setConfirmAction(null); void perform('decline', () => decideRentalRequest(booking.id, 'declined'), 'Request declined.') }}
      onClose={() => setConfirmAction(null)}
    />
    <AgreementSignatureDialog
      open={signatureOpen}
      busy={busyAction === 'sign'}
      signerParty={party}
      signerName={party === 'owner' ? booking.owner?.full_name || 'Owner' : booking.renter?.full_name || 'Renter'}
      onSubmit={submitSignature}
      onClose={() => { if (busyAction !== 'sign') setSignatureOpen(false) }}
    />
  </div>
}

function HubSection({ eyebrow, title, icon, children, compact = false }: { eyebrow: string; title: string; icon: React.ReactNode; children: React.ReactNode; compact?: boolean }) {
  return <section className={`hub-section ${compact ? 'compact' : ''}`}>
    <header><span className="hub-icon-box">{icon}</span><div><p className="hub-kicker">{eyebrow}</p><h2>{title}</h2></div></header>
    <div className="hub-section-body">{children}</div>
  </section>
}

function CustodyTimeline({ data }: { data: RentalHubData }) {
  const currentState = data.operation?.custody_display_state ?? 'with_owner'
  const currentIndex = CUSTODY_STEPS.findIndex((step) => step.state === currentState)
  const issueHold = currentState === 'issue_hold'
  const timestamps: Record<string, string | null | undefined> = {
    at_hub_pre_rental: data.operation?.owner_dropoff_at,
    with_renter: data.operation?.renter_pickup_at,
    at_hub_post_rental: data.operation?.renter_return_at,
    returned_to_owner: data.operation?.owner_collection_at,
  }

  return <>
    {issueHold && <p className="hub-issue-hold"><AlertCircle size={14} /> Custody is on issue hold at the hub. See blockers and inspection evidence before the workflow can continue.</p>}
    <ol className="hub-custody-timeline">
      {CUSTODY_STEPS.map((step, index) => {
        const complete = currentIndex > index || Boolean(timestamps[step.state])
        const current = step.state === currentState || (issueHold && step.state === 'at_hub_post_rental')
        return <li className={`${complete ? 'complete' : ''} ${current ? 'current' : ''}`} key={step.state}>
          <span className="hub-timeline-dot">{complete ? <Check size={12} /> : index + 1}</span>
          <div><strong>{step.label}</strong><p>{step.detail}</p>{timestamps[step.state] && <small>{dateTime(timestamps[step.state]!)}</small>}</div>
        </li>
      })}
    </ol>
    {data.operation?.assigned_operator_name && <p className="hub-operator"><UserCheck size={14} /> Assigned operator · <strong>{data.operation.assigned_operator_name}</strong></p>}
  </>
}

/** The booking's recorded deposit amount, falling back to the hub default. */
function depositAmount(data: RentalHubData): number {
  return data.deposit?.amount ?? data.agreement?.snapshot?.deposit?.amount ?? data.hub?.deposit_amount ?? 2000
}

function PriceAndDeposit({ data, rentalForm, depositForm }: { data: RentalHubData; rentalForm: React.ReactNode; depositForm: React.ReactNode }) {
  const booking = data.booking
  const payment = data.rental_payment
  const deposit = data.deposit
  const snapshot = data.agreement?.snapshot
  const subtotal = snapshot?.pricing?.subtotal ?? Number(booking.subtotal)
  const discount = snapshot?.pricing?.discount_amount ?? Number(booking.discount_amount)
  const total = payment?.amount ?? Number(booking.total)
  const amount = depositAmount(data)
  const waived = deposit ? deposit.status === 'waived' : Boolean(snapshot?.deposit?.waived)
  const historicalPayment = payment?.status === 'not_required' && payment.not_required_reason === 'pre_feature_released'
  const zeroTotal = payment?.status === 'not_required' && payment.not_required_reason === 'zero_total'
  const paymentLabel = !payment ? 'Rental-payment setup pending' : historicalPayment ? 'Payment not recorded in LensShare' : zeroTotal ? 'No rental fee due' : RENTAL_PAYMENT_STATUS_LABELS[payment.status]

  return <>
    <p className="hub-payment-separation">Use separate GCash transactions and references for the rental payment and security deposit. Do not combine them in one transfer.</p>
    <div className="hub-money-grid">
      <article className="hub-money-card rental">
        <h3 className="hub-money-title">Rental payment</h3>
        <dl className="hub-price-breakdown"><div><dt>Rental subtotal</dt><dd>{pesos(subtotal)}</dd></div>{discount > 0 && <div className="saving"><dt>Saver Pass saving</dt><dd>− {pesos(discount)}</dd></div>}<div className="total"><dt>Renter total</dt><dd>{pesos(total)}</dd></div></dl>
        <HubBadge value={payment?.status || 'setup_pending'} label={paymentLabel} />
        {!payment ? <p>Rental-payment tracking is not ready for this booking. This does not mean the rental is paid or waived. Contact the hub operator for setup.</p>
          : historicalPayment ? <p>This booking was already released or closed before rental-payment tracking. No new payment is requested.</p>
          : zeroTotal ? <p>No rental fee is due because the recorded rental total after discounts is zero.</p>
          : payment.status === 'not_required' ? <p>No rental-payment proof is required for this booking.</p>
          : payment.status === 'pending_review' ? <p>Your rental receipt is awaiting manual review by the assigned hub operator. Uploading a receipt does not confirm payment.</p>
          : payment.status === 'proof_accepted' ? <p>The assigned hub operator accepted the rental-payment proof. Deposit status is recorded separately.</p>
          : payment.status === 'rejected' ? <p>The rental-payment proof was rejected. Review the operator’s note before submitting a corrected receipt.</p>
          : <p>Rental-payment proof has not yet been accepted in LensShare. This status does not mean no money was received.</p>}
        <p>Saver Pass changes only the rental price. A verified-student waiver applies only to the security deposit, not the rental fee.</p>
        {payment?.gcash_reference && <small>Rental receipt reference · {payment.gcash_reference}</small>}
        {payment?.submitted_at && <small>Submitted · {dateTime(payment.submitted_at)}</small>}
        {payment?.reviewed_at && <small>Reviewed · {dateTime(payment.reviewed_at)}</small>}
        {payment?.review_note && <small className="hub-review-note">Review note · {payment.review_note}</small>}
        {rentalForm}
      </article>
      <article className={`hub-money-card deposit ${waived ? 'waived' : ''}`}>
        <h3 className="hub-money-title">Security deposit</h3>
        <strong>{waived ? 'Waived' : pesos(amount)}</strong>
        <HubBadge value={deposit?.status || (waived ? 'waived' : 'created after approval')} />
        {waived ? <p>Booking-level verified-student waiver{deposit?.waiver_reason || snapshot?.deposit?.waiver_reason ? ` · ${deposit?.waiver_reason || snapshot?.deposit?.waiver_reason}` : ''}. This waives only the deposit, not the rental payment, and is separate from Saver Pass.</p> : <p>Manually verified GCash security deposit. It is separate from and not included in the rental total.</p>}
        {deposit?.gcash_reference && <small>Deposit receipt reference · {deposit.gcash_reference}</small>}
        {deposit?.submitted_at && <small>Submitted · {dateTime(deposit.submitted_at)}</small>}
        {deposit?.reviewed_at && <small>Reviewed · {dateTime(deposit.reviewed_at)}</small>}
        {deposit?.review_note && <small className="hub-review-note">Review note · {deposit.review_note}</small>}
        {deposit?.refund_reference && <small>Refund reference · {deposit.refund_reference}</small>}
        {!waived && depositForm}
      </article>
    </div>
  </>
}

function PaymentProofForm({ purpose, amount, hub, reference, file, onReferenceChange, onFileChange, onSubmit, busy, disabled }: {
  purpose: 'rental' | 'deposit'
  amount: number
  hub: RentalHubData['hub']
  reference: string
  file: File | null
  onReferenceChange: (value: string) => void
  onFileChange: (value: File | null) => void
  onSubmit: () => Promise<boolean>
  busy: boolean
  disabled: boolean
}) {
  const id = useId()
  const label = purpose === 'rental' ? 'rental-payment' : 'security-deposit'
  const recipientReady = Boolean(hub?.gcash_recipient_name?.trim() && hub?.gcash_recipient_number?.trim())

  if (!recipientReady) return <div className="hub-payment-unconfigured" role="status"><AlertCircle size={15} /><div><strong>GCash recipient not configured</strong><p>Contact the hub operator before sending this {label} payment or uploading proof. Both the recipient name and GCash number must be configured.</p>{hub?.contact_phone && <a href={`tel:${hub.contact_phone}`}>Contact hub operator · {hub.contact_phone}</a>}</div></div>

  return <form className="hub-payment-form" aria-labelledby={`${id}-heading`} onSubmit={async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (await onSubmit()) form.reset()
  }}>
    <div><p className="hub-kicker">MANUAL GCASH VERIFICATION</p><h4 id={`${id}-heading`}>Submit the {pesos(amount)} {label} receipt</h4><p>Send only this amount to the configured recipient below. Use a separate GCash transaction and reference for each purpose; do not combine rental and deposit payments. The assigned hub operator reviews each receipt manually.</p>{purpose === 'rental' && <p>If you already paid outside LensShare, submit your existing rental receipt rather than pay again.</p>}</div>
    <dl className="hub-payment-recipient"><div><dt>Recipient</dt><dd>{hub?.gcash_recipient_name}</dd></div><div><dt>GCash number</dt><dd>{hub?.gcash_recipient_number}</dd></div></dl>
    <label htmlFor={`${id}-reference`}>{purpose === 'rental' ? 'Rental-payment' : 'Security-deposit'} GCash reference<input id={`${id}-reference`} name={`${purpose}-reference`} value={reference} onChange={(event) => onReferenceChange(event.target.value)} maxLength={80} placeholder="Enter this receipt’s reference" required disabled={disabled} /></label>
    <label htmlFor={`${id}-proof`}>{purpose === 'rental' ? 'Rental-payment' : 'Security-deposit'} receipt image or PDF<input id={`${id}-proof`} name={`${purpose}-proof`} type="file" accept={HUB_PAYMENT_PROOF_ACCEPT} aria-describedby={`${id}-file-help`} onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} required disabled={disabled} /></label>
    <small id={`${id}-file-help`}>JPEG, PNG, WebP or PDF · up to {HUB_PAYMENT_PROOF_MAX_BYTES / (1024 * 1024)} MB.</small>
    {file && <small>{file.name} · {formatBytes(file.size)}</small>}
    <button type="submit" className="hub-button primary" disabled={!reference.trim() || !file || disabled}><Upload size={14} /> {busy ? 'Uploading…' : purpose === 'rental' ? 'Submit rental receipt' : 'Submit deposit receipt'}</button>
  </form>
}

function SignatureStatus({ label, name, signedAt }: { label: string; name?: string | null; signedAt?: string | null }) {
  return <article className={`hub-signature ${signedAt ? 'signed' : ''}`}><span>{signedAt ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}</span><div><small>{label.toUpperCase()}</small><strong>{name || label}</strong><p>{signedAt ? `Signed immutably · ${dateTime(signedAt)}` : 'Signature required before pickup'}</p></div></article>
}

function InspectionCard({ inspection, kind }: { inspection?: RentalInspection; kind: 'pre_rental' | 'post_rental' }) {
  const title = kind === 'pre_rental' ? 'Pre-rental inspection' : 'Post-rental inspection'
  return <article className={`hub-inspection-card ${inspection?.result === 'issue' ? 'issue' : ''}`}>
    <div className="hub-inspection-head"><div><p className="hub-kicker">{kind === 'pre_rental' ? 'BEFORE PICKUP' : 'AFTER RETURN'}</p><h3>{title}</h3></div><HubBadge value={inspection?.status || 'not started'} /></div>
    {!inspection ? <p className="hub-muted">The assigned hub operator has not finalized this inspection yet.</p> : <>
      <div className="hub-inspection-result"><strong>Result · {inspection.result ? humanize(inspection.result) : 'Pending'}</strong>{inspection.finalized_at && <small>Finalized {dateTime(inspection.finalized_at)}</small>}</div>
      <ChecklistSummary checklist={inspection.checklist} />
      <div className="hub-condition-notes"><small>CONDITION NOTES</small><p>{inspection.condition_notes || 'No condition note supplied.'}</p>{inspection.issue_notes && <><small>ISSUE NOTES</small><p>{inspection.issue_notes}</p></>}</div>
      <div className="hub-photo-grid">{(inspection.photos ?? []).map((photo) => <InspectionPhoto key={photo.id} photo={photo} />)}{!inspection.photos?.length && <p className="hub-muted">No participant-visible inspection photos.</p>}</div>
    </>}
  </article>
}

function ChecklistSummary({ checklist }: { checklist: Record<string, boolean> }) {
  const items = Object.entries(checklist ?? {})
  if (!items.length) return null
  return <ul className="hub-check-summary">{items.map(([name, checked]) => <li className={checked ? 'checked' : ''} key={name}>{checked ? <Check size={12} /> : <AlertCircle size={12} />} {humanize(name)}</li>)}</ul>
}

function InspectionPhoto({ photo }: { photo: RentalInspectionPhoto }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    fetchInspectionPhotoUrl(photo.path).then((value) => { if (active) setUrl(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [photo.path])

  return <a className="hub-inspection-photo" href={url || undefined} target="_blank" rel="noreferrer" onClick={(event) => { if (!url) event.preventDefault() }}>
    {url ? <img src={url} alt={humanize(photo.kind)} /> : <span>{failed ? 'Preview unavailable' : 'Loading private photo…'}</span>}
    <small>{humanize(photo.kind)}</small>
  </a>
}

function BlockerList({ blockers }: { blockers: RentalWorkflowBlocker[] }) {
  if (!blockers.length) return <p className="hub-all-clear"><CheckCircle2 size={15} /> No current blockers. The assigned operator can perform the next guarded hub action.</p>
  const grouped = blockers.reduce<Record<string, RentalWorkflowBlocker[]>>((result, blocker) => {
    const action = blocker.action || 'next step'
    result[action] = [...(result[action] ?? []), blocker]
    return result
  }, {})
  return <div className="hub-blocker-list">{Object.entries(grouped).map(([action, rows]) => <div key={action}><strong>{humanize(action)}</strong><ul>{rows.map((row) => <li key={`${row.code}-${row.message}`}><AlertCircle size={12} /> <span>{row.message}</span></li>)}</ul></div>)}</div>
}

function EventList({ events }: { events: RentalHubEvent[] }) {
  const sorted = useMemo(() => [...events].sort((a, b) => b.created_at.localeCompare(a.created_at)), [events])
  if (!sorted.length) return <p className="hub-muted">No hub events have been recorded yet.</p>
  return <ol className="hub-event-list">{sorted.map((event) => <li key={event.id}><span /><div><strong>{event.summary || humanize(event.event_type)}</strong>{event.details && <p>{event.details}</p>}<small>{dateTime(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</small></div></li>)}</ol>
}

function HubBadge({ value, label }: { value: string; label?: string }) {
  return <span className={`hub-badge ${value.replaceAll('_', '-')}`}>{label ?? humanize(value)}</span>
}

function agreementEquipmentName(data: RentalHubData): string | null {
  return data.agreement?.snapshot?.equipment?.name ?? null
}

function custodyLabel(value?: string | null): string {
  if (!value) return 'Awaiting custody setup'
  if (value === 'issue_hold') return 'Issue hold at Naga Hub'
  return humanize(value)
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortId(id: string): string { return id.slice(0, 8).toUpperCase() }
function shortHash(hash: string): string { return hash ? `${hash.slice(0, 12)}…` : 'not available' }
function dateRange(booking: BookingWithRelations): string { return `${dateOnly(booking.start_date)} – ${dateOnly(booking.end_date)}` }
function dateOnly(value: string): string { return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) }
function dateTime(value: string): string { return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }
function formatBytes(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }

export function RentalHubAgreementPreview({ data }: { data: RentalHubData }) {
  return <RentalAgreementSheet booking={data.booking} handoffs={[]} rentalHub={data} />
}
