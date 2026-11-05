'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/admin-shell'
import { Status } from '@/components/owner-shell'
import { useToast } from '@/components/toast'
import { fetchAdminBookings, fetchAdminListings, fetchAdminUsers, fetchVerificationQueue, sendQueuedNotifications } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type BookingWithRelations, type ListingWithOwner, type AdminUserRow, type VerificationSubmissionWithUser } from '@/lib/types'

function shortId(id: string) { return `#${id.slice(0, 8).toUpperCase()}` }
function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminDashboardPage() {
  const { profile, loading } = useProfile()
  const toast = useToast()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [listings, setListings] = useState<ListingWithOwner[]>([])
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [submissions, setSubmissions] = useState<VerificationSubmissionWithUser[]>([])
  const [error, setError] = useState('')
  const [mailState, setMailState] = useState<'idle' | 'sending'>('idle')
  const [mailNote, setMailNote] = useState('')

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    Promise.all([fetchAdminUsers(), fetchAdminListings(), fetchAdminBookings(), fetchVerificationQueue()])
      .then(([u, l, b, s]) => { setUsers(u); setListings(l); setBookings(b); setSubmissions(s) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load platform stats.'))
  }, [profile])

  const owners = users.filter((u) => u.role === 'owner').length
  const renters = users.filter((u) => u.role === 'renter').length
  const pendingVerifications = submissions.filter((s) => s.status === 'pending').length
  const liveListings = listings.filter((l) => l.status === 'available').length
  const pendingBookings = bookings.filter((b) => b.status === 'pending').length
  const activeBookings = bookings.filter((b) => b.status === 'active' || b.status === 'approved').length
  const grossValue = useMemo(() => bookings.filter((b) => b.status !== 'declined').reduce((sum, b) => sum + Number(b.subtotal), 0), [bookings])
  const recent = useMemo(() => bookings.slice(0, 5), [bookings])

  async function flushNotifications() {
    setMailState('sending')
    setMailNote('')
    try {
      const result = await sendQueuedNotifications()
      const failed = result.failures?.length ?? 0
      setMailNote(failed ? `${result.sent} email${result.sent === 1 ? '' : 's'} sent; ${failed} stayed queued for retry.` : `${result.sent} queued email${result.sent === 1 ? '' : 's'} sent.`)
      toast.success(failed ? `${result.sent} sent, ${failed} stayed queued for retry.` : `${result.sent} queued email${result.sent === 1 ? '' : 's'} sent.`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not invoke the email function. Check its deployment and secrets.'
      setMailNote(message)
      toast.error(message)
    } finally {
      setMailState('idle')
    }
  }

  return <AdminShell title="Platform Dashboard" subtitle="Everything happening across the LensShare co-op — people, gear, and bookings.">
    {error && <div className="admin-table"><div className="admin-row"><p className="auth-error">{error}</p></div></div>}
    <div className="admin-mail-bar"><div><span className="admin-eyebrow">EMAIL QUEUE</span><p>Send booking and verification updates queued by database triggers.</p>{mailNote && <small>{mailNote}</small>}</div><button className="owner-button dark" disabled={mailState === 'sending'} onClick={flushNotifications}>{mailState === 'sending' ? 'Sending…' : 'Send queued notifications'}</button></div>
    <div className="admin-grid four">
      <div className="admin-card"><span className="admin-eyebrow">REGISTERED USERS</span><strong>{users.length}</strong><p>{owners} owners · {renters} renters</p></div>
      <div className="admin-card"><span className="admin-eyebrow">PENDING VERIFICATIONS</span><strong>{pendingVerifications}</strong><p>Documents waiting for review</p></div>
      <div className="admin-card"><span className="admin-eyebrow">LISTED EQUIPMENT</span><strong>{listings.length}</strong><p>{liveListings} live · {listings.length - liveListings} paused</p></div>
      <div className="admin-card"><span className="admin-eyebrow">BOOKING VALUE</span><strong>{pesos(grossValue)}</strong><p>All non-declined bookings</p></div>
    </div>
    <div className="admin-grid four">
      <div className="admin-card"><span className="admin-eyebrow">PENDING REQUESTS</span><strong>{pendingBookings}</strong><p>Awaiting owner decision</p></div>
      <div className="admin-card"><span className="admin-eyebrow">IN CIRCULATION</span><strong>{activeBookings}</strong><p>Approved + active rentals</p></div>
      <div className="admin-card"><span className="admin-eyebrow">COMPLETED RENTALS</span><strong>{bookings.filter((b) => b.status === 'completed').length}</strong><p>Lifecycle finished</p></div>
      <div className="admin-card"><span className="admin-eyebrow">DECLINED</span><strong>{bookings.filter((b) => b.status === 'declined').length}</strong><p>Requests turned down</p></div>
    </div>
    <div className="admin-table">
      <div className="admin-row"><div><span className="admin-eyebrow">RECENT BOOKINGS · PLATFORM-WIDE</span></div></div>
      {recent.map((booking) => <div className="admin-row" key={booking.id}>
        <img className="admin-thumb" src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" />
        <div className="admin-row-main">
          <h3>{booking.listing?.name || 'Removed listing'}</h3>
          <small>{booking.renter?.full_name || 'Renter'} → {booking.owner?.full_name || 'Owner'} · {booking.start_date} → {booking.end_date} · {shortId(booking.id)}</small>
        </div>
        <div className="admin-chips">
          <Status>{booking.status.toUpperCase()}</Status>
          <strong>{pesos(Number(booking.subtotal))}</strong>
        </div>
      </div>)}
      {!recent.length && <div className="admin-row"><p>{loading ? 'Loading bookings…' : 'No bookings on the platform yet.'}</p></div>}
    </div>
  </AdminShell>
}
