'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronDown, Download, FileText, MessageCircle, Paperclip, Send, X } from 'lucide-react'
import { RentalAgreementSheet } from '@/components/rental-agreement-sheet'
import { VerifyBanner } from '@/components/verify-banner'
import { EmptyState, ErrorState, SectionSkeleton } from '@/components/states'
import { useToast } from '@/components/toast'
import {
  fetchBookingById,
  fetchBookingHandoffs,
  fetchBookingMessages,
  fetchCounterpartyVerificationProofs,
  fetchMessageAttachmentUrl,
  fetchRentalHub,
  fetchSignedDocUrl,
  markMessagesRead,
  sendMessage,
  updateBookingStatus,
  validateMessageAttachments,
} from '@/lib/data'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/use-profile'
import { ownerVerificationLabel, pesos, renterVerificationLabel } from '@/lib/types'
import { isHubWorkflow } from '@/lib/rental-workflow'
import type { BookingHandoff, BookingStatus, BookingWithRelations, CounterpartyVerificationProof, Message, MessageAttachment, RentalHubData } from '@/lib/types'
import './chat.css'

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'

export default function ChatPage() {
  const toast = useToast()
  return <Suspense fallback={<main className="chat-page"><SectionSkeleton rows={5} /></main>}><ChatContent /></Suspense>
}

function ChatContent() {
  const bookingId = useSearchParams().get('id') ?? ''
  const router = useRouter()
  const toast = useToast()
  const { user, profile, loading: profileLoading } = useProfile()
  const [booking, setBooking] = useState<BookingWithRelations | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [confirmingDecline, setConfirmingDecline] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [agreementState, setAgreementState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [handoffs, setHandoffs] = useState<BookingHandoff[]>([])
  const [agreementHub, setAgreementHub] = useState<RentalHubData | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [proofs, setProofs] = useState<CounterpartyVerificationProof[]>([])
  const [proofsState, setProofsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function loadThread() {
    if (!bookingId || !user) return
    setLoading(true)
    Promise.all([fetchBookingById(bookingId), fetchBookingMessages(bookingId)])
      .then(([bookingRow, messageRows]) => {
        setBooking(bookingRow)
        setMessages(messageRows)
        setError('')
        if (bookingRow) markMessagesRead(bookingId, user.id).catch(() => {})
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this conversation.'))
      .finally(() => setLoading(false))
  }

  function refreshMessages() {
    if (!bookingId || !user) return
    fetchBookingMessages(bookingId)
      .then((rows) => {
        setMessages(rows)
        markMessagesRead(bookingId, user.id).catch(() => {})
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not refresh messages.'))
  }

  function refreshBooking() {
    if (!bookingId) return
    fetchBookingById(bookingId)
      .then((row) => setBooking(row))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not refresh this booking.'))
  }

  useEffect(() => {
    if (!bookingId || !user) return
    loadThread()
    const supabase = createClient()
    const channel = supabase
      .channel(`booking-chat-${bookingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` }, refreshMessages)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` }, refreshBooking)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bookingId, user])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  useEffect(() => {
    if (!agreementOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAgreementOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [agreementOpen])

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    try {
      const next = [...files, ...selected]
      validateMessageAttachments(next)
      setFiles(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Those files could not be attached.')
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    if (!user || !booking || (!body.trim() && !files.length)) return
    setBusy(true)
    setError('')
    try {
      await sendMessage(booking.id, user.id, body, files)
      setBody('')
      setFiles([])
      refreshMessages()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDecision(status: Extract<BookingStatus, 'approved' | 'declined'>) {
    if (!booking || !user || user.id !== booking.owner_id || booking.status !== 'pending') return
    setDecisionBusy(true)
    setError('')
    try {
      const updated = await updateBookingStatus(booking.id, status)
      setBooking((current) => current ? { ...current, status: updated.status, updated_at: updated.updated_at } : current)
      setConfirmingDecline(false)
      toast.success(status === 'approved' ? 'Request approved — the renter has been notified.' : 'Request declined.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Booking status could not be updated.'
      setError(message)
      toast.error(message)
      refreshBooking()
    } finally {
      setDecisionBusy(false)
    }
  }

  function openAgreement() {
    if (!booking) return
    setAgreementOpen(true)
    setAgreementState('loading')
    setHandoffs([])
    setAgreementHub(null)
    const hubWorkflow = isHubWorkflow(booking)
    Promise.all([
      fetchBookingHandoffs(booking.id),
      hubWorkflow ? fetchRentalHub(booking.id) : Promise.resolve(null),
    ])
      .then(([rows, hub]) => {
        setHandoffs(rows)
        setAgreementHub(hub)
        setAgreementState('ready')
      })
      .catch(() => setAgreementState('error'))
  }

  const renterLocked = profile?.role === 'renter' && profile.verification_status !== 'verified'
  const backHref = profile?.role === 'owner' ? '/dashboard/messages' : '/renter/messages'
  const counterpart = profile?.role === 'owner' ? booking?.renter?.full_name : booking?.owner?.full_name
  const counterpartInfo = profile?.role === 'owner' ? booking?.renter : booking?.owner
  const counterpartRole = profile?.role === 'owner' ? 'renter' : 'owner'
  const counterpartVerificationLabel = profile?.role === 'owner'
    ? renterVerificationLabel(booking?.renter)
    : ownerVerificationLabel(booking?.owner)
  const isOwner = Boolean(booking && user && profile?.role === 'owner' && booking.owner_id === user.id)
  const conversationClosed = booking?.status === 'declined'
  const bookingHref = booking && isHubWorkflow(booking)
    ? profile?.role === 'owner' ? `/dashboard/rentals/${booking.id}` : `/renter/bookings/${booking.id}`
    : profile?.role === 'owner' ? '/dashboard/rentals' : '/renter/bookings'
  const canSend = Boolean(body.trim() || files.length)

  function toggleAbout() {
    setAboutOpen((open) => {
      const next = !open
      if (next && proofsState === 'idle') {
        setProofsState('loading')
        fetchCounterpartyVerificationProofs(bookingId)
          .then((rows) => { setProofs(rows); setProofsState('ready') })
          .catch(() => setProofsState('error'))
      }
      return next
    })
  }

  if (!bookingId) return <main className="chat-page"><EmptyState icon={MessageCircle} title="Choose a booking conversation" hint="Open Messages from your workspace to choose a thread." /></main>
  if (profileLoading || loading) return <main className="chat-page"><SectionSkeleton rows={5} /></main>
  if (!booking) return <main className="chat-page"><ErrorState title="Conversation not available" hint={error || 'This booking does not exist or you are not a participant.'} /></main>

  return <main className="chat-page" onClick={() => router.push(backHref)}>
    <section className="chat-shell" onClick={(event) => event.stopPropagation()}>
      <header className="chat-header">
        <Link href={backHref} aria-label="Back to messages"><ArrowLeft size={18} /></Link>
        <img src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" />
        <div><small>{booking.listing?.name || 'Removed listing'} · {booking.status}</small><h1>{counterpart || 'Booking participant'}</h1><p>{booking.start_date} → {booking.end_date} · #{booking.id.slice(0, 8).toUpperCase()}</p></div>
        <div className="chat-header-actions">
          <button type="button" onClick={openAgreement}>Rental agreement</button>
          <Link href={bookingHref}>{isHubWorkflow(booking) ? 'Open rental hub' : 'View booking'}</Link>
        </div>
      </header>
      {counterpartInfo && <section className="chat-about" aria-label={`About ${counterpart || 'the other party'}`}>
        <button type="button" className="chat-about-toggle" aria-expanded={aboutOpen} onClick={toggleAbout}>
          <div>
            <span>About your {counterpartRole}</span>
            <strong>{counterpart} · {counterpartVerificationLabel}</strong>
          </div>
          <ChevronDown size={16} className={aboutOpen ? 'open' : ''} />
        </button>
        {aboutOpen && <div className="chat-about-details">
          <div className="chat-about-cell"><small>Role</small><strong>{counterpartRole === 'renter' ? 'Renter' : 'Owner'}</strong></div>
          <div className="chat-about-cell"><small>Contact</small><strong>{counterpartInfo.phone || 'No phone on file'}</strong><small className="chat-about-note">Coordinate the hand-off by phone or here in messages.</small></div>
          <div className="chat-about-cell"><small>Verification</small><strong>{counterpartVerificationLabel}</strong><small className="chat-about-note">Reviewed by LensShare admins — not self-declared.</small></div>
          <div className="chat-about-proofs">
            <small>Identity documents</small>
            {proofsState === 'loading' && <p>Loading documents…</p>}
            {proofsState === 'error' && <p>Documents could not be loaded. Try expanding again.</p>}
            {proofsState === 'ready' && !proofs.length && <p>No identity documents submitted yet.</p>}
            {proofsState === 'ready' && !!proofs.length && <div className="chat-about-proof-list">{proofs.map((proof) => <ProofDocRow proof={proof} key={proof.doc_type} />)}</div>}
          </div>
        </div>}
      </section>}
      <div className="chat-notices">
        {renterLocked && <div className="chat-banner"><VerifyBanner compact /></div>}
        {isOwner && booking.status === 'pending' && <section className="chat-decision" aria-label="Pending rental request">
          <div><span>Pending rental request</span><strong>{booking.start_date} → {booking.end_date} · {pesos(Number(booking.total))}</strong><p>{renterVerificationLabel(booking.renter)}{booking.shoot_description ? ` · ${booking.shoot_description}` : ''}</p></div>
          {confirmingDecline
            ? <div className="chat-decision-confirm"><p>Decline this request? The dates will be released and this conversation will become read-only.</p><button type="button" className="danger" disabled={decisionBusy} onClick={() => handleDecision('declined')}>{decisionBusy ? 'Declining…' : 'Yes, decline'}</button><button type="button" disabled={decisionBusy} onClick={() => setConfirmingDecline(false)}>Cancel</button></div>
            : <div className="chat-decision-actions"><button type="button" className="primary" disabled={decisionBusy} onClick={() => handleDecision('approved')}>{decisionBusy ? 'Approving…' : 'Approve request'}</button><button type="button" disabled={decisionBusy} onClick={() => setConfirmingDecline(true)}>Decline</button></div>}
        </section>}
        {conversationClosed && <p className="chat-closed">This request was declined. The conversation and its files remain available as a read-only record.</p>}
        {error && <p className="chat-error">{error}</p>}
      </div>
      <div className="chat-messages" aria-live="polite">
        {!messages.length && <EmptyState icon={MessageCircle} title="Start the conversation" hint="Coordinate the hand-off, time, and equipment details here." />}
        {messages.map((message) => <article className={`chat-message ${message.sender_id === user?.id ? 'mine' : ''}`} key={message.id}>
          {message.body && <p>{message.body}</p>}
          {!!message.attachments?.length && <div className="chat-attachments">{message.attachments.map((attachment) => <ChatAttachment attachment={attachment} key={attachment.path} />)}</div>}
          <small>{new Date(message.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{message.sender_id === user?.id && message.read_at ? ' · Read' : ''}</small>
        </article>)}
        <div ref={endRef} />
      </div>
      <form className="chat-compose" onSubmit={handleSend}>
        {!!files.length && <div className="chat-file-queue">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`}><FileText size={14} /><span><b>{file.name}</b><small>{formatBytes(file.size)}</small></span><button type="button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}</div>}
        <div className="chat-compose-row">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={renterLocked ? 'Verification required before messaging' : conversationClosed ? 'This conversation is closed' : 'Write a message…'} maxLength={2000} disabled={renterLocked || conversationClosed || busy} />
          <input ref={fileInputRef} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={handleFiles} />
          <button type="button" className="chat-attach-button" aria-label="Attach files" title="Attach up to 5 files" disabled={renterLocked || conversationClosed || busy} onClick={() => fileInputRef.current?.click()}><Paperclip size={16} /><span>Attach</span></button>
          <button type="submit" className="chat-send-button" disabled={!canSend || renterLocked || conversationClosed || busy}><Send size={16} /> {busy ? 'Sending…' : 'Send'}</button>
        </div>
        <p className="chat-compose-note">Up to 5 files, 10 MB each: images, PDF, Word, Excel, TXT, or CSV. Sent messages and files are a permanent booking record.</p>
      </form>
      {agreementOpen && <div className="chat-agreement-backdrop" onClick={() => setAgreementOpen(false)}>
        <section className="chat-agreement-modal" role="dialog" aria-modal="true" aria-label="Rental agreement" onClick={(event) => event.stopPropagation()}>
          <div className="chat-agreement-toolbar"><div><span>Booking agreement</span><p>Read-only preview · {isHubWorkflow(booking) ? 'sign both parties’ immutable terms in the rental hub' : 'signing remains in the booking agreement flow'}</p></div><button type="button" aria-label="Close rental agreement" onClick={() => setAgreementOpen(false)}><X size={18} /></button></div>
          {agreementState === 'loading' && <SectionSkeleton rows={5} />}
          {agreementState === 'error' && <ErrorState title="Agreement not available" hint="The signature record could not be loaded. Try again from the booking page." />}
          {agreementState === 'ready' && <RentalAgreementSheet booking={booking} handoffs={handoffs} rentalHub={agreementHub} />}
        </section>
      </div>}
    </section>
  </main>
}

function ProofDocRow({ proof }: { proof: CounterpartyVerificationProof }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const approved = proof.status === 'approved'

  useEffect(() => {
    if (!approved) return
    let active = true
    setFailed(false)
    fetchSignedDocUrl(proof.file_path)
      .then((signedUrl) => { if (active) setUrl(signedUrl) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [approved, proof.file_path])

  const title = proof.doc_type === 'government_id' ? 'Government ID' : 'Selfie'
  return <div className="chat-about-proof">
    <span><b>{title}</b><small>Uploaded {new Date(proof.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</small></span>
    <div className="chat-about-proof-actions">
      <em className={`chat-about-proof-status ${proof.status}`}>{approved ? 'Approved' : proof.status === 'pending' ? 'Pending review' : 'Rejected'}</em>
      {approved && (url
        ? <a href={url} target="_blank" rel="noreferrer">View document</a>
        : <span className="chat-about-proof-view">{failed ? 'Preview unavailable' : '…'}</span>)}
    </div>
    {proof.status === 'rejected' && proof.review_note && <p>Reviewer note: “{proof.review_note}”</p>}
  </div>
}

function ChatAttachment({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const image = attachment.type.startsWith('image/')

  useEffect(() => {
    let active = true
    setFailed(false)
    fetchMessageAttachmentUrl(attachment.path)
      .then((signedUrl) => { if (active) setUrl(signedUrl) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attachment.path])

  if (image) return <a className="chat-attachment-image" href={url || undefined} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.name}`} onClick={(event) => { if (!url) event.preventDefault() }}>
    {url ? <img src={url} alt={attachment.name} /> : <span>{failed ? 'Preview unavailable' : 'Loading preview…'}</span>}
    <small>{attachment.name}</small>
  </a>

  return <a className={`chat-attachment-file ${failed ? 'failed' : ''}`} href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url} onClick={(event) => { if (!url) event.preventDefault() }}>
    <FileText size={20} /><span><b>{attachment.name}</b><small>{failed ? 'Download unavailable' : `${formatBytes(attachment.size)} · ${fileTypeLabel(attachment.type)}`}</small></span><Download size={15} />
  </a>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeLabel(type: string): string {
  if (type === 'application/pdf') return 'PDF'
  if (type.includes('word')) return 'Word'
  if (type.includes('excel') || type.includes('spreadsheet')) return 'Excel'
  if (type === 'text/csv') return 'CSV'
  if (type === 'text/plain') return 'Text'
  return 'File'
}
