'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyMessages, fetchOwnerBookings, fetchRenterBookings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { EmptyState, ErrorState, SectionSkeleton } from '@/components/states'
import type { BookingWithRelations, Message } from '@/lib/types'
import './thread-list.css'

type ThreadListProps = {
  ownerActivityOnly?: boolean
}

export function ThreadList({ ownerActivityOnly = false }: ThreadListProps) {
  const { user, profile, loading: profileLoading } = useProfile()
  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    if (!user || !profile) return
    setLoading(true)
    const fetchBookings = profile.role === 'owner' ? fetchOwnerBookings : fetchRenterBookings
    Promise.all([fetchBookings(user.id), fetchMyMessages()])
      .then(([bookingRows, messageRows]) => { setBookings(bookingRows); setMessages(messageRows); setError('') })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load messages.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!user || !profile) return
    load()
    const supabase = createClient()
    const channel = supabase
      .channel(`message-index-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `${profile.role === 'owner' ? 'owner_id' : 'renter_id'}=eq.${user.id}`,
      }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, profile])

  const threads = useMemo(() => bookings
    .filter((booking) => {
      const hasMessages = messages.some((message) => message.booking_id === booking.id)
      return ownerActivityOnly ? hasMessages : booking.status !== 'declined'
    })
    .map((booking) => {
      const rows = messages.filter((message) => message.booking_id === booking.id)
      const last = rows.at(-1)
      const unread = user ? rows.filter((message) => message.sender_id !== user.id && !message.read_at).length : 0
      return { booking, last, unread }
    })
    .sort((a, b) => (b.last?.created_at ?? b.booking.updated_at).localeCompare(a.last?.created_at ?? a.booking.updated_at)), [bookings, messages, ownerActivityOnly, user])

  if (profileLoading || loading) return <SectionSkeleton rows={4} />
  if (error) return <ErrorState title="Could not load messages" hint={error} retry={load} />
  if (!threads.length) return <EmptyState icon={MessageCircle} title={ownerActivityOnly ? 'No messages yet' : 'No booking conversations yet'} hint={ownerActivityOnly ? 'Bookings appear here after you or a renter sends the first message.' : 'A message thread becomes available after you have a booking.'} />

  const renterLocked = profile?.role === 'renter' && profile.verification_status !== 'verified'
  return <div className="thread-list">{threads.map(({ booking, last, unread }) => {
    const counterpart = profile?.role === 'owner' ? booking.renter?.full_name : booking.owner?.full_name
    const lastAttachmentCount = last?.attachments?.length ?? 0
    const preview = last?.body?.trim() || (lastAttachmentCount ? `${lastAttachmentCount} attachment${lastAttachmentCount === 1 ? '' : 's'}` : 'No messages yet — start the conversation.')
    return <Link
      href={renterLocked ? '/renter/verification' : `/chat?id=${booking.id}`}
      className={`thread-row ${unread ? 'unread' : ''}`}
      key={booking.id}
    >
      <img src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" />
      <div className="thread-main"><small>{booking.listing?.name || 'Removed listing'} · {booking.status}</small><h3>{counterpart || 'Booking participant'}</h3><p>{renterLocked ? 'Verify your account to open this conversation.' : preview}</p></div>
      <div className="thread-meta">{unread > 0 && <b>{unread}</b>}<span>{last ? new Date(last.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : `#${booking.id.slice(0, 6).toUpperCase()}`}</span></div>
    </Link>
  })}</div>
}
