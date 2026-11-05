'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { OwnerShell, PageCard, OwnerHeading, Status } from '@/components/owner-shell'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionSkeleton, EmptyState } from '@/components/states'
import { useToast } from '@/components/toast'
import { fetchOwnerBookings, fetchOwnerPayouts, markPayoutPaid } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingWithRelations, type Payout } from '@/lib/types'

type PayoutRow = Payout & { booking: BookingWithRelations }

export default function FinancePage() {
  const { user } = useProfile()
  const toast = useToast()
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmPayout, setConfirmPayout] = useState<PayoutRow | null>(null)

  function load() {
    if (!user) return
    setLoading(true)
    Promise.all([fetchOwnerPayouts(user.id), fetchOwnerBookings(user.id)])
      .then(([payoutRows, bookingRows]) => { setPayouts(payoutRows); setBookings(bookingRows) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [user])

  async function confirmMarkPaid() {
    if (!confirmPayout) return
    const payoutId = confirmPayout.id
    setBusyId(payoutId)
    // Optimistic update, rollback + visible error on failure.
    const previous = payouts
    setPayouts((rows) => rows.map((row) => row.id === payoutId ? { ...row, status: 'paid' as const, paid_at: new Date().toISOString() } : row))
    try {
      await markPayoutPaid(payoutId)
      toast.success(`Payout for booking #${payoutId.slice(0, 8).toUpperCase()} marked as paid — ${pesos(Number(confirmPayout.net))} net.`)
      setConfirmPayout(null)
    } catch (e) {
      setPayouts(previous)
      const message = e instanceof Error ? e.message : 'Could not mark the payout as paid.'
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  const paid = payouts.filter((row) => row.status === 'paid')
  const pendingPayouts = payouts.filter((row) => row.status === 'pending')
  const totalPaid = paid.reduce((sum, row) => sum + Number(row.net), 0)
  const pendingNet = pendingPayouts.reduce((sum, row) => sum + Number(row.net), 0)
  const totalCommission = payouts.reduce((sum, row) => sum + Number(row.commission), 0)
  const upcomingRentalValue = bookings
    .filter((b) => b.status === 'pending' || b.status === 'approved')
    .reduce((sum, b) => sum + Number(b.subtotal), 0)

  return <OwnerShell title="Revenue & Payouts" subtitle="Earnings from completed rentals. Each settled booking creates a payout entry — mark it paid once the money reaches you.">
    <div className="owner-stats">
      <PageCard><span className="owner-eyebrow">PAID OUT</span><strong>{pesos(totalPaid)}</strong><p>{paid.length} settled {paid.length === 1 ? 'payout' : 'payouts'} · owner net</p></PageCard>
      <PageCard><span className="owner-eyebrow">PENDING PAYOUT</span><strong>{pesos(pendingNet)}</strong><p>{pendingPayouts.length} awaiting settlement</p></PageCard>
      <PageCard><span className="owner-eyebrow">CO-OP COMMISSION</span><strong>{pesos(totalCommission)}</strong><p>15% across all settled bookings</p></PageCard>
      <PageCard><span className="owner-eyebrow">UPCOMING RENTAL VALUE</span><strong>{pesos(upcomingRentalValue)}</strong><p>Pending + approved subtotals · not a payment balance</p></PageCard>
    </div>
    <PageCard>
      <OwnerHeading eyebrow="PAYOUT LEDGER" title="Settled & awaiting payouts" detail="Payout rows are created automatically when a booking is completed."/>
      {loading ? <SectionSkeleton rows={3} /> : payouts.length ? <div className="owner-table">{payouts.map((row) => <div className="owner-row" key={row.id}>
        <div>
          <small>#{row.booking_id.slice(0, 8).toUpperCase()}</small>
          <h3>{row.booking?.listing?.name || 'Removed listing'}</h3>
          <p>{row.booking?.start_date} → {row.booking?.end_date} · gross {pesos(Number(row.gross))}</p>
        </div>
        <span>Commission <b>− {pesos(Number(row.commission))}</b><br/>Net <b>{pesos(Number(row.net))}</b></span>
        {row.status === 'paid'
          ? <Status>PAID</Status>
          : <button className="owner-button dark" disabled={busyId === row.id} onClick={() => setConfirmPayout(row)}>{busyId === row.id ? 'Saving…' : 'Mark as paid'}</button>}
      </div>)}</div> : <EmptyState title="No payouts yet" hint="Complete a rental from Manage Rentals and its payout will appear here." />}
    </PageCard>
    <PageCard><OwnerHeading eyebrow="SETTLEMENT FORMULA" title="15% co-op commission" detail="Gross uses the undiscounted rental subtotal. Saver Pass discounts are funded by LensShare and do not reduce your 85% share."/>
      <div className="finance-breakdown">
        <span>Gross rental revenue <b>{pesos(payouts.reduce((sum, row) => sum + Number(row.gross), 0))}</b></span>
        <span>Co-op commission (15%) <b>− {pesos(totalCommission)}</b></span>
        <span>Owner share <b>{pesos(totalPaid + pendingNet)}</b></span>
      </div>
    </PageCard>
    <ConfirmDialog
      open={Boolean(confirmPayout)}
      busy={busyId !== null}
      tone="danger"
      title="Mark this payout as paid?"
      description={confirmPayout && <>Confirm you have actually sent {pesos(Number(confirmPayout.net))} to your own account for booking #{confirmPayout.booking_id.slice(0, 8).toUpperCase()}. The ledger status cannot go back to pending afterwards.</>}
      confirmLabel="Mark as paid"
      onConfirm={() => void confirmMarkPaid()}
      onClose={() => setConfirmPayout(null)}
    />
  </OwnerShell>
}
