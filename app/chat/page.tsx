'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, MessageCircle, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchBookingById, fetchBookingMessages, markMessagesRead, sendMessage } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { VerifyBanner } from '@/components/verify-banner'
import { EmptyState, ErrorState, SectionSkeleton } from '@/components/states'
import type { BookingWithRelations, Message } from '@/lib/types'
import './chat.css'

export default function ChatPage() {
  return <Suspense fallback={<main className="chat-page"><SectionSkeleton rows={5} /></main>}><ChatContent /></Suspense>
}

function ChatContent() {
  const bookingId = useSearchParams().get('id') ?? ''
  const router = useRouter()
  const { user, profile, loading: profileLoading } = useProfile()
  const [booking, setBooking] = useState<BookingWithRelations | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  function loadThread() {
    if (!bookingId || !user) return
    Promise.all([fetchBookingById(bookingId), fetchBookingMessages(bookingId)])
      .then(([bookingRow, messageRows]) => {
        setBooking(bookingRow)
        setMessages(messageRows)
        setError('')
        if (bookingRow) markMessagesRead(bookingId, user.id).catch(() => {})
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this conversation.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!bookingId || !user) return
    loadThread()
    const supabase = createClient()
    const channel = supabase
      .channel(`booking-chat-${bookingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` }, loadThread)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bookingId, user])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function handleSend(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !booking || !body.trim()) return
    setBusy(true)
    setError('')
    try {
      await sendMessage(booking.id, user.id, body)
      setBody('')
      loadThread()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const renterLocked = profile?.role === 'renter' && profile.verification_status !== 'verified'
  const backHref = profile?.role === 'owner' ? '/dashboard/messages' : '/renter/messages'
  const counterpart = profile?.role === 'owner' ? booking?.renter?.full_name : booking?.owner?.full_name

  if (!bookingId) return <main className="chat-page"><EmptyState icon={MessageCircle} title="Choose a booking conversation" hint="Open Messages from your workspace to choose a thread." /></main>
  if (profileLoading || loading) return <main className="chat-page"><SectionSkeleton rows={5} /></main>
  if (!booking) return <main className="chat-page"><ErrorState title="Conversation not available" hint={error || 'This booking does not exist or you are not a participant.'} /></main>

  return <main className="chat-page" onClick={() => router.push(backHref)}>
    <section className="chat-shell" onClick={(event) => event.stopPropagation()}>
      <header className="chat-header">
        <Link href={backHref} aria-label="Back to messages"><ArrowLeft size={18} /></Link>
        <img src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" />
        <div><small>{booking.listing?.name || 'Removed listing'} · {booking.status}</small><h1>{counterpart || 'Booking participant'}</h1><p>{booking.start_date} → {booking.end_date} · #{booking.id.slice(0, 8).toUpperCase()}</p></div>
        <Link href={profile?.role === 'owner' ? '/dashboard/rentals' : '/renter/bookings'} className="chat-booking-link">View booking</Link>
      </header>
      {renterLocked && <div className="chat-banner"><VerifyBanner compact /></div>}
      {error && <p className="chat-error">{error}</p>}
      <div className="chat-messages" aria-live="polite">
        {!messages.length && <EmptyState icon={MessageCircle} title="Start the conversation" hint="Coordinate the hand-off, time, and equipment details here." />}
        {messages.map((message) => <article className={`chat-message ${message.sender_id === user?.id ? 'mine' : ''}`} key={message.id}>
          <p>{message.body}</p><small>{new Date(message.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{message.sender_id === user?.id && message.read_at ? ' · Read' : ''}</small>
        </article>)}
        <div ref={endRef} />
      </div>
      <form className="chat-compose" onSubmit={handleSend}>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={renterLocked ? 'Verification required before messaging' : booking.status === 'declined' ? 'This conversation is closed' : 'Write a message…'} maxLength={2000} disabled={renterLocked || booking.status === 'declined' || busy} />
        <button type="submit" disabled={!body.trim() || renterLocked || booking.status === 'declined' || busy}><Send size={16} /> {busy ? 'Sending…' : 'Send'}</button>
      </form>
    </section>
  </main>
}
