'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { OwnerShell, PageCard, OwnerHeading, Status } from '@/components/owner-shell'
import { fetchOwnerBookings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingWithRelations } from '@/lib/types'

export default function FinancePage() {
  const { user } = useProfile()
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])

  useEffect(() => {
    if (!user) return
    fetchOwnerBookings(user.id).then(setBookings).catch(() => {})
  }, [user])

  const completed = bookings.filter((b) => b.status === 'completed')
  const gross = completed.reduce((sum, b) => sum + Number(b.total), 0)
  const commission = Math.round(gross * 0.15)
  const net = gross - commission
  const pending = bookings.filter((b) => b.status === 'pending' || b.status === 'approved').reduce((sum, b) => sum + Number(b.total), 0)

  return <OwnerShell title="Revenue & Payouts" subtitle="Separate estimated earnings from money actually received. No payment integration is connected.">
    <div className="owner-stats">
      <PageCard><span className="owner-eyebrow">COMPLETED RENTALS</span><strong>{pesos(gross)}</strong><p>{completed.length} settled {completed.length === 1 ? 'booking' : 'bookings'} · gross</p></PageCard>
      <PageCard><span className="owner-eyebrow">PENDING IN ESCROW</span><strong>{pesos(pending)}</strong><p>Pending + approved bookings</p></PageCard>
      <PageCard><span className="owner-eyebrow">OWNER NET (85%)</span><strong>{pesos(net)}</strong><p>After {pesos(commission)} co-op commission</p></PageCard>
    </div>
    <div className="finance-grid"><PageCard><OwnerHeading eyebrow="SETTLEMENT FORMULA" title="15% co-op commission" detail="Gross rental revenue minus the co-op share equals your owner net."/><div className="finance-breakdown"><span>Gross rental revenue <b>{pesos(gross)}</b></span><span>Co-op commission (15%) <b>− {pesos(commission)}</b></span><span>Owner share <b>{pesos(net)}</b></span></div></PageCard><PageCard><OwnerHeading eyebrow="PAYOUT STATUS" title="Not connected" detail="Connect a payment provider before showing real settlements or bank details."/><Status>COMPUTED FROM BOOKINGS</Status></PageCard></div>
    <PageCard><OwnerHeading eyebrow="TRANSACTION HISTORY" title="Rental earnings ledger"/><div className="owner-table">{bookings.map((booking) => <div className="owner-row" key={booking.id}><div><small>#{booking.id.slice(0, 8).toUpperCase()}</small><h3>{booking.listing?.name || 'Removed listing'}</h3><p>{booking.start_date} → {booking.end_date} · <Status>{booking.status.toUpperCase()}</Status></p></div><span>Gross <b>{pesos(Number(booking.total))}</b><br/>Net <b>{pesos(Math.round(Number(booking.total) * 0.85))}</b></span><Link className="owner-button" href="/dashboard/rentals">Details</Link></div>)}</div>{!bookings.length && <div className="owner-empty"><h3>No transactions yet</h3><p>Completed bookings will appear here as they settle.</p></div>}</PageCard>
  </OwnerShell>
}
