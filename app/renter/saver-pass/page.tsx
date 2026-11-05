'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgePercent, CalendarDays, CheckCircle2, Clock3, CreditCard, ShieldCheck } from 'lucide-react'
import { RenterHeadbar, Status } from '@/components/renter-headbar'
import { useToast } from '@/components/toast'
import { fetchMyPromoPasses, submitPromoPassPayment, uploadPromoPaymentProof } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, type PromoPass } from '@/lib/types'
import '../renter.css'

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
const GCASH_NAME = process.env.NEXT_PUBLIC_GCASH_ACCOUNT_NAME?.trim() || ''
const GCASH_NUMBER = process.env.NEXT_PUBLIC_GCASH_ACCOUNT_NUMBER?.trim() || ''

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toTime(value: string | null | undefined) {
  return parseDate(value)?.getTime() ?? Number.NEGATIVE_INFINITY
}

function dateLabel(value: string | null | undefined) {
  const date = parseDate(value)
  return date ? date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
}

function latestPass(passes: PromoPass[], now: number) {
  const sorted = [...passes].sort((a, b) => {
    const updated = toTime(b.updated_at) - toTime(a.updated_at)
    return updated || toTime(b.created_at) - toTime(a.created_at)
  })
  return sorted.find((pass) => pass.status === 'active' && (!pass.valid_until_exclusive || toTime(pass.valid_until_exclusive) > now))
    ?? sorted.find((pass) => pass.status === 'pending_review')
    ?? sorted[0]
    ?? null
}

function isExpired(pass: PromoPass, now: number) {
  return pass.status === 'active' && Boolean(pass.valid_until_exclusive) && toTime(pass.valid_until_exclusive) <= now
}

function remainingOf(pass: PromoPass) {
  return Math.max(0, Number(pass.discount_cap) - Number(pass.reserved_amount) - Number(pass.redeemed_amount))
}

export default function SaverPassPage() {
  const { user, profile, loading: profileLoading } = useProfile()
  const toast = useToast()
  const [passes, setPasses] = useState<PromoPass[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!user) return
    try {
      const rows = await fetchMyPromoPasses(user.id)
      setPasses(rows)
      setLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your Saver Pass.')
      setLoaded(true)
    }
  }, [user])

  useEffect(() => { void load() }, [load])

  const current = useMemo(() => latestPass(passes, now), [passes, now])
  const expired = current ? isExpired(current, now) : false
  const remaining = current ? remainingOf(current) : 0
  const exhausted = Boolean(current && current.status === 'active' && !expired && remaining <= 0)
  const canPurchase = Boolean(profile?.verification_status === 'verified' && (!current || current.status === 'rejected' || expired))
  const gcashConfigured = Boolean(GCASH_NAME && GCASH_NUMBER)
  const validThrough = current?.valid_until_exclusive && Number.isFinite(toTime(current.valid_until_exclusive))
    ? dateLabel(new Date(toTime(current.valid_until_exclusive) - 1).toISOString())
    : 'the stated final day'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!user) {
      setError('Your session is still loading. Please try again.')
      return
    }
    if (!gcashConfigured) {
      setError('Saver Pass payments are not configured yet.')
      return
    }
    const cleanReference = reference.trim()
    if (!cleanReference) {
      setError('Enter the GCash reference number from your payment receipt.')
      return
    }
    if (!receipt) {
      setError('Choose an image of your GCash receipt.')
      return
    }
    if (!receipt.type.startsWith('image/')) {
      setError('The receipt must be an image file.')
      return
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      setError('The receipt image must be 5 MB or smaller.')
      return
    }

    setBusy(true)
    try {
      const proofPath = await uploadPromoPaymentProof(user.id, receipt)
      await submitPromoPassPayment(cleanReference, proofPath)
      setReference('')
      setReceipt(null)
      const input = document.getElementById('saver-pass-receipt') as HTMLInputElement | null
      if (input) input.value = ''
      setNotice('Payment proof submitted. LensShare will manually verify the receipt before your pass starts.')
      toast.success('Payment proof submitted — an admin will verify your receipt.')
      await load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not submit your payment proof. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return <RenterHeadbar title="Saver Pass" subtitle="A LensShare-funded rental discount for verified renters.">
    <section className="saver-hero" aria-labelledby="saver-pass-summary">
      <div>
        <p className="eyebrow"><BadgePercent size={13} /> SAVER PASS · MANUAL GCASH REVIEW</p>
        <h2 id="saver-pass-summary">Pay {pesos(99)}. Save 5% on eligible rentals.</h2>
        <p>One approved pass covers up to {pesos(500)} in total discounts over 30 days. Payment is checked by a LensShare admin—it is not an instant checkout.</p>
      </div>
      <div className="saver-rate" aria-label="Saver Pass offer"><strong>5%</strong><span>OFF · {pesos(500)} CAP</span></div>
    </section>

    {!profileLoading && profile?.verification_status !== 'verified' && <section className="saver-state-card saver-state-attention">
      <div className="saver-state-icon"><ShieldCheck size={22} /></div>
      <div><Status tone="pending">Verification required</Status><h2>Verify your renter account first</h2><p>Saver Pass is available to verified renters. Complete identity verification, then return here to submit payment.</p><Link className="owner-button dark" href="/renter/verification">Go to verification</Link></div>
    </section>}

    {profile?.verification_status === 'verified' && !loaded && <section className="saver-state-card" aria-live="polite"><Clock3 size={20} /><p>Loading your Saver Pass…</p></section>}

    {profile?.verification_status === 'verified' && loaded && current?.status === 'pending_review' && <section className="saver-state-card">
      <div className="saver-state-icon"><Clock3 size={22} /></div>
      <div><Status tone="pending">Pending review</Status><h2>Your receipt is in the queue</h2><p>Submitted {dateLabel(current.created_at)} with GCash reference <b>{current.gcash_reference}</b>. An admin will compare it with the actual receiving GCash account before deciding.</p><p className="saver-fine-print">Your 30 days do not begin while this is pending. They begin only if and when LensShare approves the payment.</p></div>
    </section>}

    {profile?.verification_status === 'verified' && loaded && current?.status === 'active' && !expired && <section className={`saver-state-card saver-active-card${exhausted ? ' exhausted' : ''}`}>
      <div className="saver-state-icon">{exhausted ? <BadgePercent size={22} /> : <CheckCircle2 size={22} />}</div>
      <div className="saver-state-body">
        <Status>{exhausted ? 'Cap exhausted' : 'Active'}</Status>
        <h2>{exhausted ? 'You have used the full discount cap' : `${pesos(remaining)} in discount value remains`}</h2>
        <p><CalendarDays size={14} /> Valid from {dateLabel(current.valid_from)} through the end of {validThrough}.</p>
        <div className="saver-progress" aria-label={`${pesos(remaining)} remaining of ${pesos(Number(current.discount_cap))}`}><span style={{ width: `${Math.min(100, Math.max(0, ((Number(current.reserved_amount) + Number(current.redeemed_amount)) / Math.max(1, Number(current.discount_cap))) * 100))}%` }} /></div>
        <div className="saver-progress-labels"><span>{pesos(Number(current.redeemed_amount))} redeemed</span><span>{pesos(Number(current.reserved_amount))} reserved</span><strong>{pesos(remaining)} remaining</strong></div>
        <p className="saver-fine-print">Pending reservations use part of the cap too, so the available amount can be lower before a rental is completed.</p>
      </div>
    </section>}

    {profile?.verification_status === 'verified' && loaded && expired && <section className="saver-state-card saver-state-attention">
      <div className="saver-state-icon"><CalendarDays size={22} /></div>
      <div><Status tone="pending">Expired</Status><h2>Your Saver Pass ended on {validThrough}</h2><p>You may renew with a new {pesos(99)} payment. A renewed pass starts its own 30-day window only after manual approval.</p></div>
    </section>}

    {profile?.verification_status === 'verified' && loaded && current?.status === 'rejected' && <section className="saver-state-card saver-state-rejected">
      <div className="saver-state-icon"><CreditCard size={22} /></div>
      <div><Status tone="rejected">Rejected</Status><h2>Your payment could not be approved</h2><p>{current.review_note ? <>Reviewer note: “{current.review_note}”</> : 'No reviewer note was provided. Check the reference and receipt before resubmitting.'}</p><p className="saver-fine-print">Resubmitting creates a new payment review; it does not activate the rejected pass.</p></div>
    </section>}

    {canPurchase && loaded && <section className="saver-purchase-grid">
      <div className="renter-card saver-payment-card">
        <p className="eyebrow">1 · SEND THE EXACT FEE</p>
        <h2>{current?.status === 'rejected' ? 'Resubmit a Saver Pass payment' : expired ? 'Renew your Saver Pass' : 'Get a Saver Pass'}</h2>
        {gcashConfigured ? <dl className="saver-gcash-details"><div><dt>Amount</dt><dd>{pesos(99)}</dd></div><div><dt>GCash account name</dt><dd>{GCASH_NAME}</dd></div><div><dt>GCash number</dt><dd>{GCASH_NUMBER}</dd></div></dl> : <div className="saver-config-notice" role="status"><strong>Payment setup unavailable</strong><p>LensShare has not configured the receiving GCash account. Submission is disabled until an administrator adds it.</p></div>}
        <p className="saver-fine-print">Send the payment in GCash first. Keep the successful receipt and reference number for manual verification.</p>
      </div>
      <form className="renter-card saver-payment-form" onSubmit={submit} noValidate>
        <p className="eyebrow">2 · SUBMIT PAYMENT PROOF</p>
        <label htmlFor="saver-pass-reference">GCash reference number</label>
        <input id="saver-pass-reference" autoComplete="off" inputMode="numeric" maxLength={80} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter the reference shown in GCash" disabled={busy || !gcashConfigured} required />
        <label htmlFor="saver-pass-receipt">Receipt image <span>JPG, PNG, WEBP · up to 5 MB</span></label>
        <input id="saver-pass-receipt" type="file" accept="image/*" onChange={(event) => { setReceipt(event.target.files?.[0] ?? null); setError('') }} disabled={busy || !gcashConfigured} required />
        {receipt && <p className="saver-file-note">Selected: {receipt.name}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="saver-success" role="status">{notice}</p>}
        <button className="owner-button dark" type="submit" disabled={busy || !gcashConfigured}>{busy ? 'Uploading receipt…' : 'Submit for manual review'}</button>
        <p className="saver-fine-print">Submitting proof does not confirm payment or activate the offer. LensShare reviews it manually.</p>
      </form>
    </section>}

    {error && !canPurchase && <section className="renter-card"><p className="auth-error" role="alert">{error}</p></section>}

    <section className="renter-card saver-terms" aria-labelledby="saver-terms-title">
      <p className="eyebrow">THE PLAIN TERMS</p><h2 id="saver-terms-title">How the 30-day pass works</h2>
      <div className="saver-terms-grid">
        <div><strong>{pesos(99)}</strong><span>one manually verified pass fee</span></div>
        <div><strong>5%</strong><span>discount on eligible rental value</span></div>
        <div><strong>{pesos(500)}</strong><span>maximum combined discount</span></div>
        <div><strong>30 days</strong><span>beginning on admin approval</span></div>
      </div>
      <ul>
        <li>The full selected rental period must fit inside the active window. The end boundary is exclusive, so the pass stops at the start of the date after the last valid day.</li>
        <li>LensShare funds the discount; the equipment owner is not asked to absorb it.</li>
        <li>Only one pass may be active at a time, and Saver Pass cannot be stacked with another offer.</li>
        <li>The {pesos(500)} cap counts discounts already redeemed and amounts held for pending reservations. A declined or released reservation may return its held amount.</li>
      </ul>
    </section>
  </RenterHeadbar>
}
