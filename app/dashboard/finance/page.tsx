'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OwnerShell, PageCard, OwnerHeading, Status } from '@/components/owner-shell'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionSkeleton, EmptyState } from '@/components/states'
import { useToast } from '@/components/toast'
import { fetchOwnerFinance, markPayoutPaid, subscribeToOwnerFinance } from '@/lib/data'
import { isHubWorkflow } from '@/lib/rental-workflow'
import { useProfile } from '@/lib/use-profile'
import { pesos, RENTAL_PAYMENT_STATUS_LABELS, type RentalPayment } from '@/lib/types'

type FinanceData = Awaited<ReturnType<typeof fetchOwnerFinance>>
type PayoutRow = FinanceData['payouts'][number]

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : fallback
}

function paymentLabel(payment: RentalPayment | undefined, setupPending: boolean) {
  if (!payment) return setupPending ? 'Payment records unavailable' : 'Not recorded'
  if (payment.status === 'not_required') {
    if (payment.not_required_reason === 'pre_feature_released') return 'Not recorded · historical rental'
    return payment.not_required_reason === 'zero_total' ? 'Not required · zero total' : 'Not required · not recorded'
  }
  return RENTAL_PAYMENT_STATUS_LABELS[payment.status]
}

function paymentNote(payment: RentalPayment | undefined, setupPending: boolean) {
  if (!payment) return setupPending ? 'Rental-payment setup is pending.' : 'No rental payment recorded; not counted as accepted.'
  if (payment.status === 'not_required') return payment.not_required_reason === 'pre_feature_released'
    ? 'Released or closed before payment recording was introduced; not counted as an accepted payment.'
    : 'No accepted rental payment recorded.'
  if (payment.status === 'rejected') return payment.review_note || 'Proof rejected; the renter must resubmit.'
  if (payment.status === 'pending_review') return 'Proof submitted; awaiting manual admin review.'
  if (payment.status === 'awaiting_payment') return 'The renter has not submitted payment proof.'
  return 'Proof accepted by manual admin review.'
}

export default function FinancePage() {
  const { user, loading } = useProfile()
  // Remount account-local state immediately when the signed-in account changes.
  return <OwnerFinance key={user?.id ?? 'signed-out'} ownerId={user?.id ?? null} profileLoading={loading} />
}

function OwnerFinance({ ownerId, profileLoading }: { ownerId: string | null; profileLoading: boolean }) {
  const toast = useToast()
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(Boolean(ownerId))
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmPayout, setConfirmPayout] = useState<PayoutRow | null>(null)
  const [payoutError, setPayoutError] = useState('')
  const mounted = useRef(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    if (!ownerId || !mounted.current) return
    const request = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const next = await fetchOwnerFinance(ownerId)
      if (mounted.current && request === requestId.current) setData(next)
    } catch (e) {
      if (mounted.current && request === requestId.current) setError(errorMessage(e, 'Could not load finance records.'))
    } finally {
      if (mounted.current && request === requestId.current) setLoading(false)
    }
  }, [ownerId])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false; requestId.current += 1 }
  }, [load])

  // A sorted primitive key avoids resubscribing when only amounts/statuses change.
  const bookingIdsKey = data?.bookings.map((booking) => booking.id).sort().join(',') ?? ''
  useEffect(() => {
    if (!ownerId) return
    return subscribeToOwnerFinance(ownerId, bookingIdsKey ? bookingIdsKey.split(',') : [], () => { void load() })
  }, [ownerId, bookingIdsKey, load])

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [load])

  async function confirmMarkPaid() {
    if (!confirmPayout || busyId || !ownerId) return
    const payout = confirmPayout
    setBusyId(payout.id)
    setPayoutError('')
    try {
      await markPayoutPaid(payout.id)
      if (!mounted.current) return
      // Record the paid state only after the server accepts the separate payout action.
      setData((current) => current && ({ ...current, payouts: current.payouts.map((row) => row.id === payout.id ? { ...row, status: 'paid' as const } : row) }))
      setConfirmPayout(null)
      toast.success(`Receipt recorded for booking #${payout.booking_id.slice(0, 8).toUpperCase()} — ${pesos(Number(payout.net))} owner net.`)
      await load()
    } catch (e) {
      if (!mounted.current) return
      const message = errorMessage(e, 'Could not record payout receipt.')
      setPayoutError(message)
      toast.error(message)
    } finally {
      if (mounted.current) setBusyId(null)
    }
  }

  const bookings = data?.bookings ?? []
  const payments = data?.payments ?? []
  const payouts = data?.payouts ?? []
  const setupPending = data?.payment_setup_pending ?? false
  const paymentByBooking = new Map(payments.map((payment) => [payment.booking_id, payment]))
  const payoutByBooking = new Map(payouts.map((payout) => [payout.booking_id, payout]))
  const paid = payouts.filter((row) => row.status === 'paid')
  const pendingPayouts = payouts.filter((row) => row.status === 'pending')
  const acceptedPayments = payments.filter((payment) => payment.status === 'proof_accepted')
  const totalAccepted = acceptedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const totalPaid = paid.reduce((sum, row) => sum + Number(row.net), 0)
  const pendingNet = pendingPayouts.reduce((sum, row) => sum + Number(row.net), 0)
  const totalCommission = payouts.reduce((sum, row) => sum + Number(row.commission), 0)
  const upcomingRentalValue = bookings
    .filter((booking) => booking.status === 'pending' || booking.status === 'approved')
    .reduce((sum, booking) => sum + Number(booking.subtotal), 0)
  const metric = (amount: number) => data ? pesos(amount) : '—'
  const initialLoading = profileLoading || (loading && !data)

  return <OwnerShell title="Revenue & Payouts" subtitle="Renter payments and owner payouts are separate records. Complete the rental before settlement, and confirm payout receipt only when the money reaches you.">
    <div className="owner-toolbar">
      <span className="owner-toolbar-note" role="status">{loading ? 'Refreshing finance records…' : 'Refreshes on booking, payment and payout changes, and when you return to this page.'}</span>
      <button className="owner-button" disabled={loading || !ownerId} onClick={() => { void load() }}>Refresh finance</button>
    </div>
    {error && <div className="finance-notice finance-error" role="alert"><b>Finance refresh failed.</b><p>{error}</p>{data && <p>Showing the last successful records. Totals may be out of date; refresh to try again.</p>}</div>}
    {setupPending && <div className="finance-notice" role="status"><b>Rental-payment setup is pending.</b><p>Ask an admin to finish payment setup, then refresh. Booking and payout records remain available, but missing payment records are not counted as accepted revenue.</p></div>}
    <div className="owner-stats">
      <PageCard><span className="owner-eyebrow">ACCEPTED RENTAL PAYMENTS</span><strong>{setupPending ? 'Unavailable' : metric(totalAccepted)}</strong><p>{data && !setupPending ? `${acceptedPayments.length} accepted proofs · ` : ''}Discounted rental amounts only, not owner payouts</p></PageCard>
      <PageCard><span className="owner-eyebrow">PAID OUT</span><strong>{metric(totalPaid)}</strong><p>{data ? `${paid.length} paid payouts · ` : ''}Owner net received</p></PageCard>
      <PageCard><span className="owner-eyebrow">PENDING PAYOUT</span><strong>{metric(pendingNet)}</strong><p>{data ? `${pendingPayouts.length} awaiting settlement · ` : ''}Not paid by proof acceptance</p></PageCard>
      <PageCard><span className="owner-eyebrow">CO-OP COMMISSION</span><strong>{metric(totalCommission)}</strong><p>15% of completed rental subtotals with payout records</p></PageCard>
      <PageCard><span className="owner-eyebrow">UPCOMING RENTAL VALUE</span><strong>{metric(upcomingRentalValue)}</strong><p>Pending + approved subtotals · not a payment balance</p></PageCard>
    </div>
    <PageCard>
      <OwnerHeading eyebrow="RENTER PAYMENT LEDGER" title="Rental payments" detail="Rental-only amounts after discounts; security deposits are excluded. Proof acceptance is manual admin review, not automated GCash verification. Payments and owner payouts must not be added together as revenue." />
      {initialLoading ? <SectionSkeleton rows={3} /> : !data ? <EmptyState title={ownerId ? 'Finance records unavailable' : 'Sign in to view finance'} hint={ownerId ? 'Use Refresh finance to retry. No payment totals can be confirmed until records load.' : 'Your owner account is required to view payment records.'} /> : bookings.length ? <div className="finance-payment-ledger">{bookings.map((booking) => {
        const payment = paymentByBooking.get(booking.id)
        const payout = payoutByBooking.get(booking.id)
        const settlement = booking.status === 'declined' ? 'No payout · booking declined'
          : booking.status !== 'completed' ? 'Awaiting rental completion'
          : payout?.status === 'paid' ? 'Paid payout'
          : payout?.status === 'pending' ? 'Pending payout' : 'Payout not recorded'
        return <article className="finance-payment-row" key={booking.id}>
          <div>
            <span className="owner-eyebrow">BOOKING #{booking.id.slice(0, 8).toUpperCase()}</span>
            <h3><Link href={isHubWorkflow(booking) ? `/dashboard/rentals/${booking.id}` : '/dashboard/rentals'}>{booking.listing?.name || 'Removed listing'}</Link></h3>
            <p>{booking.renter?.full_name || 'Renter'} · {booking.start_date} → {booking.end_date}</p>
            <span className="finance-field-label">Booking status</span><Status>{booking.status.toUpperCase()}</Status>
          </div>
          <div>
            <span className="finance-field-label">{payment ? 'Renter rental amount' : 'Quoted rental amount · not a payment record'}</span>
            <strong className="finance-amount">{pesos(Number(payment?.amount ?? booking.total))}</strong>
            {Number(booking.discount_amount) > 0 && <p>Includes {pesos(Number(booking.discount_amount))} LensShare-funded discount.</p>}
            <span className="finance-field-label">GCash reference</span><span className="finance-reference">{payment?.gcash_reference || (setupPending ? 'Unavailable' : 'Not recorded')}</span>
            <span className="finance-field-label">Payment proof status</span><span className="finance-proof" data-status={payment?.status ?? 'unrecorded'}>{paymentLabel(payment, setupPending)}</span>
            <p>{paymentNote(payment, setupPending)}</p>
          </div>
          <div>
            <span className="finance-field-label">Owner settlement stage</span><strong className="finance-settlement">{settlement}</strong>
            {booking.status === 'completed' && payout ? <p>{pesos(Number(payout.net))} owner net · 85% of the rental subtotal</p> : <p>{booking.status === 'completed' ? 'No owner payout entry is available. Refresh if this rental was just completed.' : 'Payment proof acceptance does not complete the rental or pay the owner.'}</p>}
          </div>
        </article>
      })}</div> : <EmptyState title="No rental bookings yet" hint="Rental payment records and settlement stages will appear here when you receive bookings." />}
    </PageCard>
    <PageCard>
      <OwnerHeading eyebrow="OWNER PAYOUT LEDGER" title="Paid & pending owner payouts" detail="Completing a rental creates a pending payout. Renter proof acceptance does not mark this payout paid." />
      {initialLoading ? <SectionSkeleton rows={3} /> : !data ? <EmptyState title="Payout records unavailable" hint="Load finance records before reviewing owner payouts." /> : payouts.length ? <div className="owner-table">{payouts.map((row) => <div className="owner-row finance-payout-row" key={row.id}>
        <div>
          <small>#{row.booking_id.slice(0, 8).toUpperCase()}</small>
          <h3>{row.booking?.listing?.name || 'Removed listing'}</h3>
          <p>{row.booking?.renter?.full_name || 'Renter'} · {row.booking?.start_date} → {row.booking?.end_date}</p>
          <p>Rental subtotal {pesos(Number(row.gross))}</p>
        </div>
        <span>Commission <b>− {pesos(Number(row.commission))}</b><br />Owner net <b>{pesos(Number(row.net))}</b></span>
        <div className="finance-payout-action"><Status>{row.status.toUpperCase()}</Status>{row.status === 'pending' && <button className="owner-button dark" disabled={busyId !== null || loading} onClick={() => { setPayoutError(''); setConfirmPayout(row) }}>Mark payout received</button>}</div>
      </div>)}</div> : <EmptyState title="No owner payouts yet" hint="Mark a returned rental as done in Manage Rentals to create its pending payout. Accepted rental proofs alone do not create a paid payout." />}
    </PageCard>
    <PageCard><OwnerHeading eyebrow="SETTLEMENT FORMULA" title="15% co-op commission" detail="Gross uses the undiscounted rental subtotal. Saver Pass discounts are funded by LensShare and do not reduce your 85% share. Rental payments above are a separate ledger, not additional owner earnings." />
      <div className="finance-breakdown">
        <span>Completed rental subtotals with payout records <b>{metric(payouts.reduce((sum, row) => sum + Number(row.gross), 0))}</b></span>
        <span>Co-op commission (15%) <b>{data ? `− ${pesos(totalCommission)}` : '—'}</b></span>
        <span>Owner share (85% · paid + pending payouts) <b>{metric(totalPaid + pendingNet)}</b></span>
      </div>
    </PageCard>
    <ConfirmDialog
      open={Boolean(confirmPayout)}
      busy={busyId !== null}
      tone="danger"
      title="Confirm this payout was received?"
      description={confirmPayout && <>Confirm that {pesos(Number(confirmPayout.net))} has actually reached your account for booking #{confirmPayout.booking_id.slice(0, 8).toUpperCase()}. This records receipt only; it does not transfer money. The payout cannot go back to pending afterwards.{payoutError && <span className="owner-decision-error" role="alert">{payoutError}</span>}</>}
      confirmLabel="Mark payout received"
      onConfirm={() => { void confirmMarkPaid() }}
      onClose={() => { if (!busyId) setConfirmPayout(null) }}
    />
  </OwnerShell>
}
