'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Printer, ShieldCheck, X } from 'lucide-react'
import './agreement.css'
import { SectionSkeleton, ErrorState } from '@/components/states'
import { fetchBookingById, fetchBookingHandoffs, saveHandoff } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingWithRelations, type BookingHandoff } from '@/lib/types'

export default function AgreementPage() {
  return <Suspense fallback={<main className="agreement-page"><SectionSkeleton rows={5} /></main>}>
    <AgreementContent />
  </Suspense>
}

function AgreementContent() {
  const params = useSearchParams()
  const bookingId = params.get('id') ?? ''
  const { user, profile } = useProfile()
  const [booking, setBooking] = useState<BookingWithRelations | null>(null)
  const [handoffs, setHandoffs] = useState<BookingHandoff[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    if (!bookingId || !user) return
    Promise.all([fetchBookingById(bookingId), fetchBookingHandoffs(bookingId)])
      .then(([bookingRow, handoffRows]) => {
        setBooking(bookingRow)
        setHandoffs(handoffRows)
        setState('ready')
      })
      .catch(() => { setState('error') })
  }
  useEffect(load, [bookingId, user])

  const isRenter = Boolean(booking && user && booking.renter_id === user.id)
  const renterSigned = handoffs.some((row) => row.party === 'renter' && row.stage === 'agreement')
  const ownerSigned = handoffs.some((row) => row.party === 'owner' && row.stage === 'agreement')

  async function handleAccept() {
    if (!booking || !user) return
    setBusy(true)
    setMessage('')
    try {
      await saveHandoff(booking.id, user.id, profile?.role === 'owner' ? 'owner' : 'renter', 'agreement', {})
      load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the signature.')
    } finally {
      setBusy(false)
    }
  }

  if (!bookingId) return <main className="agreement-page"><p className="agreement-muted">Missing booking reference. Open this page from a booking.</p></main>
  if (state === 'loading') return <main className="agreement-page"><SectionSkeleton rows={5} /></main>
  if (state === 'error' || !booking) return <main className="agreement-page"><ErrorState title="Agreement not available" hint="This booking could not be loaded, or you are not a participant in it." /></main>

  const gear = booking.listing

  return <main className="agreement-page">
    <div className="agreement-toolbar no-print">
      <Link href={profile?.role === 'owner' ? '/dashboard/rentals' : '/renter/bookings'}>← Back to bookings</Link>
      <div className="agreement-toolbar-actions">
        <button className="button light" onClick={() => window.print()}><Printer size={14} /> Print / save PDF</button>
        {!renterSigned && isRenter && <button className="button dark" disabled={busy} onClick={handleAccept}>{busy ? 'Signing…' : 'I accept this agreement'}</button>}
      </div>
    </div>
    {message && <p className="agreement-error no-print">{message}</p>}
    <article className="agreement-sheet">
      <header className="agreement-head">
        <div><p className="agreement-eyebrow">LENSHARE CO-OP · NAGA CITY</p><h1>Equipment Rental Agreement</h1><p className="agreement-ref">Booking #{booking.id.slice(0, 8).toUpperCase()} · {booking.status.toUpperCase()}</p></div>
        <span className="agreement-logo"><img src="/lensshare-logo.png" alt="LensShare" /></span>
      </header>

      <section className="agreement-parties">
        <div><small>OWNER (Lender)</small><b>{booking.owner?.full_name || '—'}</b></div>
        <div><small>RENTER</small><b>{booking.renter?.full_name || '—'}</b>{booking.renter && <span className={`agreement-verified ${booking.renter.verification_status === 'verified' ? 'ok' : ''}`}>{booking.renter.verification_status === 'verified' ? '✓ Identity verified' : 'Verification pending'}</span>}</div>
        <div><small>EQUIPMENT</small><b>{gear?.name || 'Removed listing'}</b><span>{gear?.brand} · {gear?.category}</span></div>
        <div><small>PERIOD</small><b>{booking.start_date} → {booking.end_date}</b><span>{booking.days} {booking.days === 1 ? 'day' : 'days'} · {pesos(Number(booking.total))} total</span></div>
      </section>

      <section className="agreement-terms">
        <h2>1 · Hand-off & return</h2>
        <p>Hand-off occurs at the agreed pickup point on the start date. Current listing pickup address: {gear?.pickup_address?.trim() || 'Confirm pickup point with owner'}. Default pickup: 9:00 AM · Confirm with owner. The renter receives the equipment listed above, inspected by both parties at hand-off.</p>
        <h2>2 · Care of equipment</h2>
        <p>The renter agrees to operate the equipment only for the stated shoot purpose, to keep it secure and dry, and to return it clean and complete with all included accessories by the end date. No sub-leasing or third-party use.</p>
        <h2>3 · Damage & loss</h2>
        <p>Damage discovered at return beyond normal wear is the renter&apos;s responsibility up to the repair or replacement cost. LensCare™ co-op coverage (₱100,000 replacement, ₱0 deductible) applies to covered incidents; verified students receive the standard deposit waiver.</p>
        <h2>4 · Late return</h2>
        <p>Returns later than the agreed drop-off time may be charged an additional day at the listed daily rate, at the owner&apos;s discretion.</p>
        <h2>5 · Settlement</h2>
        <p>The rental total of {pesos(Number(booking.total))} is settled through the LensShare co-op, which retains a 15% platform commission from the owner&apos;s earnings.</p>
      </section>

      <section className="agreement-signatures">
        <SignatureBlock
          label="RENTER"
          name={booking.renter?.full_name ?? '—'}
          signed={renterSigned}
          timestamp={handoffs.find((row) => row.party === 'renter' && row.stage === 'agreement')?.updated_at}
        />
        <SignatureBlock
          label="OWNER"
          name={booking.owner?.full_name ?? '—'}
          signed={ownerSigned}
          timestamp={handoffs.find((row) => row.party === 'owner' && row.stage === 'agreement')?.updated_at}
        />
      </section>
      <footer className="agreement-foot"><ShieldCheck size={13} /> This agreement is recorded on the LensShare platform and attached to booking #{booking.id.slice(0, 8).toUpperCase()}.</footer>
    </article>
  </main>
}

function SignatureBlock({ label, name, signed, timestamp }: { label: string; name: string; signed: boolean; timestamp?: string }) {
  return <div className="agreement-signature">
    <small>{label}</small>
    {signed
      ? <><span className="agreement-signed-name">{name}</span><small>Signed{timestamp ? ` · ${new Date(timestamp).toLocaleString()}` : ''}</small></>
      : <><span className="agreement-unsigned"><X size={14} /> Not yet signed</span><small>{name}</small></>}
  </div>
}
