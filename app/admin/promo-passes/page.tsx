'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, ReceiptText, ShieldAlert } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { OwnerHeading, PageCard, Status } from '@/components/owner-shell'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { useToast } from '@/components/toast'
import { fetchPromoPassQueue, fetchSignedPromoProofUrl, reviewPromoPass } from '@/lib/data'
import { pesos, type PromoPassWithRenter } from '@/lib/types'

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateTimeLabel(value: string | null | undefined) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function dateLabel(value: string | null | undefined) {
  const date = parseDate(value)
  return date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

function statusLabel(status: PromoPassWithRenter['status']) {
  if (status === 'pending_review') return 'Pending review'
  if (status === 'active') return 'Active'
  return 'Rejected'
}

export default function PromoPassesPage() {
  const toast = useToast()
  const [passes, setPasses] = useState<PromoPassWithRenter[]>([])
  const [viewed, setViewed] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<{ pass: PromoPassWithRenter; decision: 'approved' | 'rejected' } | null>(null)

  function load() {
    setError('')
    fetchPromoPassQueue()
      .then((rows) => { setPasses(rows); setLoaded(true) })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Could not load Saver Pass reviews.'); setLoaded(true) })
  }
  useEffect(load, [])

  const pending = useMemo(() => passes.filter((pass) => pass.status === 'pending_review'), [passes])
  const reviewed = useMemo(() => passes.filter((pass) => pass.status !== 'pending_review').slice(0, 20), [passes])

  async function viewReceipt(pass: PromoPassWithRenter) {
    setError('')
    const receiptWindow = window.open('', '_blank')
    if (!receiptWindow) {
      setError('The receipt could not open. Allow pop-ups for LensShare, then try again.')
      return
    }
    receiptWindow.opener = null
    try {
      const url = await fetchSignedPromoProofUrl(pass.proof_path)
      receiptWindow.location.href = url
      setViewed((current) => ({ ...current, [pass.id]: true }))
    } catch (e) {
      receiptWindow.close()
      setError(e instanceof Error ? e.message : 'Could not open the receipt.')
    }
  }

  function review(pass: PromoPassWithRenter, decision: 'approved' | 'rejected') {
    setError('')
    if (decision === 'approved' && !viewed[pass.id]) {
      setError('Open the receipt and confirm the account match before approving this payment.')
      return
    }
    setConfirmTarget({ pass, decision })
  }

  async function confirmReview(note: string) {
    if (!confirmTarget) return
    const { pass, decision } = confirmTarget
    setBusyId(pass.id)
    setError('')
    try {
      await reviewPromoPass(pass.id, decision, decision === 'rejected' ? note : null)
      await fetchPromoPassQueue().then(setPasses)
      toast.success(decision === 'approved'
        ? `Saver Pass payment from ${pass.renter?.full_name || 'the renter'} approved.`
        : `Saver Pass payment rejected — the renter will see the reason.`)
      setConfirmTarget(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save the review decision.'
      setError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  return <AdminShell title="Saver Pass reviews" subtitle="Verify GCash receipts before activating the renter’s 30-day discount window.">
    <div className="admin-pass-warning" role="note"><ShieldAlert size={18} /><div><strong>Approval confirms real payment.</strong><p>Open each receipt and match the amount, reference, recipient name, and recipient number against the actual receiving GCash account—not only the details typed by the renter.</p></div></div>
    {error && <PageCard><p className="auth-error" role="alert">{error}</p></PageCard>}

    <PageCard className="admin-pass-section">
      <OwnerHeading eyebrow="PENDING REVIEW" title={`${pending.length} payment${pending.length === 1 ? '' : 's'} waiting`} detail="Receipt viewing is required before approval. Rejections require a reason visible to the renter." />
      {!loaded ? <SectionSkeleton rows={3} /> : pending.length ? <div className="admin-pass-list">{pending.map((pass) => <article className="admin-pass-card" key={pass.id}>
        <div className="admin-pass-card-head">
          <div><Status>PENDING REVIEW</Status><h3>{pass.renter?.full_name || 'Unknown renter'}</h3><p>{pass.renter?.email || 'No email on file'} · account {pass.renter?.verification_status || 'unknown'}</p></div>
          <strong>{pesos(Number(pass.fee_amount))}</strong>
        </div>
        <dl className="admin-pass-facts"><div><dt>GCash reference</dt><dd>{pass.gcash_reference}</dd></div><div><dt>Submitted</dt><dd>{dateTimeLabel(pass.created_at)}</dd></div><div><dt>Offer</dt><dd>{Number(pass.discount_rate) * 100}% · {pesos(Number(pass.discount_cap))} cap</dd></div><div><dt>Receipt check</dt><dd>{viewed[pass.id] ? 'Opened in this session' : 'Not viewed yet'}</dd></div></dl>
        <label className="admin-pass-confirm"><input type="checkbox" checked={Boolean(viewed[pass.id])} disabled /> Receipt opened for comparison with the actual LensShare GCash account</label>
        <div className="admin-pass-actions">
          <button className="owner-button" type="button" onClick={() => viewReceipt(pass)}><ReceiptText size={13} /> View receipt <ExternalLink size={11} /></button>
          <button className="owner-button dark" type="button" disabled={busyId === pass.id || !viewed[pass.id]} onClick={() => review(pass, 'approved')}>{busyId === pass.id ? 'Saving…' : 'Approve payment'}</button>
          <button className="owner-button" type="button" disabled={busyId === pass.id} onClick={() => review(pass, 'rejected')}>Reject</button>
        </div>
      </article>)}</div> : <EmptyState title="Queue is clear" hint="New Saver Pass payment submissions will appear here." />}
    </PageCard>

    <PageCard className="admin-pass-section">
      <OwnerHeading eyebrow="RECENTLY REVIEWED" title="Latest decisions" detail="Active and rejected Saver Pass submissions, newest first." />
      {reviewed.length ? <div className="admin-pass-reviewed">{reviewed.map((pass) => <div className="admin-pass-reviewed-row" key={pass.id}>
        <div className="admin-pass-reviewed-main"><span className={`admin-pill ${pass.status === 'active' ? 'active' : 'rejected'}`}>{statusLabel(pass.status)}</span><h3>{pass.renter?.full_name || 'Unknown renter'} · {pesos(Number(pass.fee_amount))}</h3><p>Reference {pass.gcash_reference} · reviewed {dateTimeLabel(pass.reviewed_at)}</p>{pass.status === 'active' ? <><p>Approved {dateTimeLabel(pass.approved_at)} · valid {dateLabel(pass.valid_from)} to {dateLabel(pass.valid_until_exclusive)} (end date exclusive)</p><p>{pesos(Number(pass.redeemed_amount))} redeemed · {pesos(Number(pass.reserved_amount))} reserved · {pesos(Math.max(0, Number(pass.discount_cap) - Number(pass.redeemed_amount) - Number(pass.reserved_amount)))} remaining</p></> : <p>Reason: {pass.review_note || 'No reviewer note recorded.'}</p>}</div>
        <button className="owner-button" type="button" onClick={() => viewReceipt(pass)}>View receipt</button>
      </div>)}</div> : loaded ? <EmptyState title="No decisions yet" hint="Approved and rejected payments will appear here." /> : <SectionSkeleton rows={2} />}
    </PageCard>

    <ConfirmDialog
      open={Boolean(confirmTarget)}
      busy={busyId !== null}
      tone={confirmTarget?.decision === 'approved' ? 'default' : 'danger'}
      title={confirmTarget?.decision === 'approved'
        ? `Approve Saver Pass payment?`
        : 'Reject Saver Pass payment?'}
      description={confirmTarget?.decision === 'approved'
        ? <>Confirm the receipt shows {pesos(Number(confirmTarget.pass.fee_amount))} received by the actual LensShare GCash account. Approving activates the renter’s 30-day discount window.</>
        : <>The payment from {confirmTarget?.pass.renter?.full_name || 'this renter'} stays inactive and the reason is shown to the renter.</>}
      confirmLabel={confirmTarget?.decision === 'approved' ? 'Approve payment' : 'Reject payment'}
      requireReason={confirmTarget?.decision === 'rejected'}
      reasonLabel="Reason for rejection (shown to the renter)"
      reasonPlaceholder="e.g. The reference number could not be found in the GCash account history."
      onConfirm={(note) => void confirmReview(note)}
      onClose={() => setConfirmTarget(null)}
    />
  </AdminShell>
}
