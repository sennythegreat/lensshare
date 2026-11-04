'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import './agreement.css'
import { RentalAgreementSheet } from '@/components/rental-agreement-sheet'
import { SectionSkeleton, ErrorState } from '@/components/states'
import { fetchBookingById, fetchBookingHandoffs, saveHandoff } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { BookingWithRelations, BookingHandoff, HandoffParty } from '@/lib/types'

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

  const signerParty: HandoffParty | null = booking && user
    ? booking.renter_id === user.id
      ? 'renter'
      : booking.owner_id === user.id ? 'owner' : null
    : null
  const isRenter = signerParty === 'renter'
  const renterSigned = handoffs.some((row) => row.party === 'renter' && row.stage === 'agreement')

  async function handleAccept() {
    if (!booking || !user || !signerParty) return
    setBusy(true)
    setMessage('')
    try {
      await saveHandoff(booking.id, user.id, signerParty, 'agreement', {})
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

  return <main className="agreement-page">
    <div className="agreement-toolbar no-print">
      <Link href={profile?.role === 'owner' ? '/dashboard/rentals' : '/renter/bookings'}>← Back to bookings</Link>
      <div className="agreement-toolbar-actions">
        <button className="button light" onClick={() => window.print()}><Printer size={14} /> Print / save PDF</button>
        {!renterSigned && isRenter && <button className="button dark" disabled={busy} onClick={handleAccept}>{busy ? 'Signing…' : 'I accept this agreement'}</button>}
      </div>
    </div>
    {message && <p className="agreement-error no-print">{message}</p>}
    <RentalAgreementSheet booking={booking} handoffs={handoffs} />
  </main>
}
