'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, RotateCcw, XCircle } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PageCard, OwnerHeading } from '@/components/owner-shell'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { useToast } from '@/components/toast'
import {
  fetchSignedDocUrl,
  fetchVerificationQueue,
  reviewVerificationSubmission,
  revokeVerificationGroup,
} from '@/lib/data'
import type { VerificationDocType, VerificationSubmissionWithUser } from '@/lib/types'

const DOC_LABELS: Record<VerificationDocType, string> = {
  government_id: 'Government ID',
  selfie: 'Selfie',
  student_id: 'School ID',
  proof_of_enrollment: 'Proof of enrollment',
}

const GROUPS = {
  identity: {
    label: 'Identity verification',
    requirement: 'Government ID + selfie',
    docs: ['government_id', 'selfie'] as VerificationDocType[],
  },
  student: {
    label: 'Student eligibility',
    requirement: 'School ID + proof of enrollment',
    docs: ['student_id', 'proof_of_enrollment'] as VerificationDocType[],
  },
} as const

type VerificationGroup = keyof typeof GROUPS
type Completeness = 'not_started' | 'incomplete' | 'pending' | 'approved' | 'needs_attention'
type UserEntry = {
  userId: string
  name: string
  email: string
  role: string
  verification: string
  isStudent: boolean
  latest: Map<VerificationDocType, VerificationSubmissionWithUser>
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function completenessOf(types: readonly VerificationDocType[], latest: Map<VerificationDocType, VerificationSubmissionWithUser>): Completeness {
  const rows = types.map((type) => latest.get(type))
  if (rows.some((row) => row?.status === 'rejected')) return 'needs_attention'
  if (!rows.some(Boolean)) return 'not_started'
  if (rows.some((row) => !row)) return 'incomplete'
  if (rows.every((row) => row?.status === 'approved')) return 'approved'
  return 'pending'
}

function completenessLabel(state: Completeness) {
  if (state === 'approved') return '2 of 2 approved'
  if (state === 'pending') return 'Review in progress'
  if (state === 'needs_attention') return 'Needs replacement'
  if (state === 'incomplete') return 'Incomplete'
  return 'Not started'
}

function statusClass(status: string) {
  if (status === 'approved' || status === 'verified') return 'verified'
  if (status === 'rejected' || status === 'needs_attention') return 'rejected'
  if (status === 'pending') return 'pending'
  return 'unverified'
}

function buildEntries(rows: VerificationSubmissionWithUser[]): UserEntry[] {
  const byUser = new Map<string, UserEntry>()
  for (const row of rows) {
    const entry = byUser.get(row.user_id) ?? {
      userId: row.user_id,
      name: row.user?.full_name || 'Unknown user',
      email: row.user?.email || 'No email on profile',
      role: row.user?.role || '',
      verification: row.user?.verification_status || 'unverified',
      isStudent: row.user?.is_student ?? false,
      latest: new Map<VerificationDocType, VerificationSubmissionWithUser>(),
    }
    const current = entry.latest.get(row.doc_type)
    if (!current || new Date(row.created_at).getTime() > new Date(current.created_at).getTime()) entry.latest.set(row.doc_type, row)
    byUser.set(row.user_id, entry)
  }
  return Array.from(byUser.values()).sort((a, b) => {
    const aTime = Math.max(...Array.from(a.latest.values(), (row) => new Date(row.created_at).getTime()))
    const bTime = Math.max(...Array.from(b.latest.values(), (row) => new Date(row.created_at).getTime()))
    return bTime - aTime
  })
}

function ReviewBadge({ status }: { status: string }) {
  return <span className={`admin-pill ${statusClass(status)}`}>{status.replace(/_/g, ' ')}</span>
}

export default function VerificationsPage() {
  const toast = useToast()
  const [queue, setQueue] = useState<VerificationSubmissionWithUser[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [viewing, setViewing] = useState<{ row: VerificationSubmissionWithUser; url: string } | null>(null)
  const [reviewModal, setReviewModal] = useState<{ row: VerificationSubmissionWithUser; decision: 'approved' | 'rejected'; note: string; noteError?: string } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ entry: UserEntry; group: VerificationGroup } | null>(null)

  function load() {
    return fetchVerificationQueue()
      .then((rows) => { setQueue(rows); setLoaded(true) })
      .catch((loadError) => {
        setLoaded(true)
        setError(loadError instanceof Error ? loadError.message : 'Could not load the queue.')
      })
  }

  useEffect(() => { void load() }, [])

  const entries = useMemo(() => buildEntries(queue), [queue])
  const pendingCount = useMemo(() => entries.reduce((count, entry) => count + Array.from(entry.latest.values()).filter((row) => row.status === 'pending').length, 0), [entries])
  const reviewed = useMemo(() => queue.filter((row) => row.status !== 'pending').slice(0, 12), [queue])

  async function viewDoc(row: VerificationSubmissionWithUser) {
    setError('')
    try {
      const url = await fetchSignedDocUrl(row.file_path)
      setViewing({ row, url })
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : 'Could not open the document.')
    }
  }

  function openReviewModal(row: VerificationSubmissionWithUser, decision: 'approved' | 'rejected') {
    setError('')
    setReviewModal({ row, decision, note: '' })
  }

  async function confirmReview() {
    if (!reviewModal) return
    const { row, decision, note } = reviewModal
    const trimmed = note.trim()
    if (decision === 'rejected' && !trimmed) {
      setReviewModal({ ...reviewModal, noteError: 'Add a rejection reason so the user knows what to replace.' })
      return
    }

    setBusyKey(`review:${row.id}`)
    setError('')
    setNotice('')
    try {
      await reviewVerificationSubmission(row.id, decision, decision === 'rejected' ? trimmed : null)
      setReviewModal(null)
      await load()
      setNotice(`${DOC_LABELS[row.doc_type]} ${decision}. The aggregate status was recalculated from both required documents.`)
      toast.success(`${DOC_LABELS[row.doc_type]} ${decision} for ${row.user?.full_name || 'the user'}.`)
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : 'Review action failed.'
      setError(message)
      toast.error(message)
    } finally {
      setBusyKey(null)
    }
  }

  function revoke(entry: UserEntry, group: VerificationGroup) {
    setError('')
    setRevokeTarget({ entry, group })
  }

  async function confirmRevoke(note: string) {
    if (!revokeTarget) return
    const { entry, group } = revokeTarget
    const groupLabel = GROUPS[group].label.toLowerCase()
    const key = `revoke:${entry.userId}:${group}`
    setBusyKey(key)
    setError('')
    setNotice('')
    try {
      await revokeVerificationGroup(entry.userId, group, note)
      await load()
      setNotice(`${entry.name}’s ${groupLabel} was revoked.`)
      toast.success(`${entry.name}’s ${groupLabel} was revoked.`)
      setRevokeTarget(null)
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : 'Could not revoke verification.'
      setError(message)
      toast.error(message)
    } finally {
      setBusyKey(null)
    }
  }

  function renderGroup(entry: UserEntry, group: VerificationGroup) {
    const config = GROUPS[group]
    const state = completenessOf(config.docs, entry.latest)
    const approvedCount = config.docs.filter((type) => entry.latest.get(type)?.status === 'approved').length
    const aggregateActive = group === 'identity' ? entry.verification === 'verified' : entry.isStudent
    const revokeKey = `revoke:${entry.userId}:${group}`

    return <section className="admin-verification-group" key={group}>
      <header className="admin-verification-group-head">
        <div>
          <span className="admin-eyebrow">{group === 'identity' ? 'REQUIRED' : 'OPTIONAL'}</span>
          <h3>{config.label}</h3>
          <p>{config.requirement} · {approvedCount}/2 latest documents approved</p>
        </div>
        <div className="admin-verification-group-status">
          <ReviewBadge status={state === 'not_started' || state === 'incomplete' ? 'incomplete' : state} />
          <small>{completenessLabel(state)}</small>
        </div>
      </header>

      {aggregateActive && state !== 'approved' && <p className="admin-verification-warning"><AlertTriangle size={14} /> The profile flag is active, but the latest document set is not 2 of 2 approved. Review or revoke this legacy/inconsistent status.</p>}

      <div className="admin-verification-docs">
        {config.docs.map((docType) => {
          const row = entry.latest.get(docType)
          const reviewKey = row ? `review:${row.id}` : ''
          return <div className={`admin-verification-doc ${row ? '' : 'missing'}`} key={docType}>
            <div className="admin-verification-doc-main">
              {row?.status === 'approved' ? <CheckCircle2 size={16} /> : row?.status === 'rejected' ? <XCircle size={16} /> : <span className="admin-doc-marker" />}
              <div>
                <strong>{DOC_LABELS[docType]}</strong>
                {row ? <small>Latest upload · {dateLabel(row.created_at)}</small> : <small>No document submitted</small>}
                {row?.review_note && <p>Note: “{row.review_note}”</p>}
              </div>
            </div>
            <div className="admin-doc-actions">
              {row && <ReviewBadge status={row.status} />}
              {row && <button className="owner-button" type="button" onClick={() => viewDoc(row)}><Eye size={13} /> View</button>}
              {row?.status === 'pending' && <>
                <button className="owner-button dark" type="button" disabled={busyKey === reviewKey} onClick={() => openReviewModal(row, 'approved')}>Approve document</button>
                <button className="owner-button danger" type="button" disabled={busyKey === reviewKey} onClick={() => openReviewModal(row, 'rejected')}>Reject</button>
              </>}
            </div>
          </div>
        })}
      </div>

      {aggregateActive && <footer className="admin-verification-group-foot">
        <span>{group === 'identity' ? 'Account identity is currently verified.' : 'Student eligibility is currently active.'}</span>
        <button className="owner-button danger" type="button" disabled={busyKey === revokeKey} onClick={() => revoke(entry, group)}><RotateCcw size={13} /> {busyKey === revokeKey ? 'Revoking…' : `Revoke ${group === 'identity' ? 'identity' : 'student status'}`}</button>
      </footer>}
    </section>
  }

  return <AdminShell title="Verification queue" subtitle="Review each latest document; identity and student checks each require both documents to be approved.">
    {error && <PageCard><p className="auth-error admin-verification-feedback" role="alert">{error}</p></PageCard>}
    {notice && <PageCard><p className="auth-success admin-verification-feedback" role="status">{notice}</p></PageCard>}
    <PageCard className="admin-verification-card">
      <OwnerHeading eyebrow="LATEST DOCUMENT SETS" title={`${pendingCount} document${pendingCount === 1 ? '' : 's'} waiting`} detail="Only the newest upload for each document type is actionable. Approving one document never completes a two-document check." />
      {!loaded ? <SectionSkeleton rows={3} /> : entries.length ? <div className="admin-verification-users">{entries.map((entry) => <article className="admin-user-card admin-verification-user" key={entry.userId}>
        <header className="admin-verification-user-head">
          <div><h2>{entry.name}{entry.role && <span className={`admin-pill ${entry.role}`}>{entry.role}</span>}</h2><p>{entry.email}</p></div>
          <div className="admin-verification-profile-flags"><span>Profile flags</span><ReviewBadge status={entry.verification} />{entry.isStudent && <span className="admin-pill student">student</span>}</div>
        </header>
        <div className="admin-verification-groups">{renderGroup(entry, 'identity')}{renderGroup(entry, 'student')}</div>
      </article>)}</div> : <EmptyState title="Queue is clear" hint="No latest documents are waiting and no active verification flags need management." />}
    </PageCard>
    <PageCard>
      <OwnerHeading eyebrow="RECENTLY REVIEWED" title="Latest document decisions" detail="These are individual document decisions, not aggregate identity or student approval." />
      {reviewed.length ? <div className="admin-reviewed-list">{reviewed.map((row) => <div className="admin-reviewed-row" key={row.id}>
        <div>
          <ReviewBadge status={row.status} />
          <h3>{DOC_LABELS[row.doc_type]} · {row.user?.full_name || 'Unknown user'}</h3>
          <p>Reviewed {row.reviewed_at ? dateLabel(row.reviewed_at) : '—'}{row.review_note ? ` · “${row.review_note}”` : ''}</p>
        </div>
        <button className="owner-button" type="button" onClick={() => viewDoc(row)}><Eye size={13} /> View document</button>
      </div>)}</div> : <EmptyState title="No decisions yet" hint="Reviewed documents will appear here." />}
    </PageCard>
    {viewing && <div className="admin-doc-modal" role="dialog" aria-modal="true" aria-label={`${DOC_LABELS[viewing.row.doc_type]} document`} onClick={() => setViewing(null)}>
      <div className="admin-doc-modal-panel" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <header className="admin-doc-modal-head">
          <div>
            <h3>{DOC_LABELS[viewing.row.doc_type]}</h3>
            <p>{viewing.row.user?.full_name || 'Unknown user'} · uploaded {dateLabel(viewing.row.created_at)}</p>
          </div>
          <div className="admin-doc-modal-actions">
            <a className="owner-button" href={viewing.url} target="_blank" rel="noopener,noreferrer">Open in new tab</a>
            <button className="owner-button dark" type="button" onClick={() => setViewing(null)}>Close</button>
          </div>
        </header>
        <div className="admin-doc-modal-body">
          {viewing.row.file_path.toLowerCase().endsWith('.pdf')
            ? <iframe src={viewing.url} title={`${DOC_LABELS[viewing.row.doc_type]} document`} />
            : <img src={viewing.url} alt={`${DOC_LABELS[viewing.row.doc_type]} from ${viewing.row.user?.full_name || 'user'}`} />}
        </div>
      </div>
    </div>}
    {reviewModal && <div className="admin-doc-modal" role="dialog" aria-modal="true" aria-label="Confirm document decision" onClick={() => setReviewModal(null)}>
      <div className="admin-doc-modal-panel admin-review-modal-panel" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <header className="admin-doc-modal-head">
          <div>
            <h3>{reviewModal.decision === 'approved' ? 'Approve document' : 'Reject document'}</h3>
            <p>{DOC_LABELS[reviewModal.row.doc_type]} · {reviewModal.row.user?.full_name || 'Unknown user'}</p>
          </div>
        </header>
        <div className="admin-review-modal-body">
          {reviewModal.decision === 'approved'
            ? <p>Approve this {DOC_LABELS[reviewModal.row.doc_type]} only? The related check is complete only when both required documents are approved.</p>
            : <p>The user will replace this document. Explain below what is wrong so they know what to upload.</p>}
          {reviewModal.decision === 'rejected' && <>
            <label className="admin-review-note-label" htmlFor="review-note">Reason for rejection (shown to the user)</label>
            <textarea
              id="review-note"
              className="admin-review-note"
              rows={3}
              value={reviewModal.note}
              autoFocus
              placeholder="e.g. The ID photo is blurry — retake it in good light."
              onChange={(noteEvent) => setReviewModal({ ...reviewModal, note: noteEvent.target.value, noteError: undefined })}
            />
            {reviewModal.noteError && <p className="auth-error admin-review-note-error" role="alert">{reviewModal.noteError}</p>}
          </>}
        </div>
        <footer className="admin-review-modal-foot">
          <button className="owner-button" type="button" disabled={busyKey === `review:${reviewModal.row.id}`} onClick={() => setReviewModal(null)}>Cancel</button>
          <button
            className={`owner-button ${reviewModal.decision === 'approved' ? 'dark' : 'danger'}`}
            type="button"
            disabled={busyKey === `review:${reviewModal.row.id}`}
            onClick={() => void confirmReview()}
          >
            {busyKey === `review:${reviewModal.row.id}` ? 'Saving…' : reviewModal.decision === 'approved' ? 'Approve document' : 'Reject document'}
          </button>
        </footer>
      </div>
    </div>}
    <ConfirmDialog
      open={Boolean(revokeTarget)}
      busy={busyKey?.startsWith('revoke:') ?? false}
      tone="danger"
      title={revokeTarget ? `Revoke ${GROUPS[revokeTarget.group].label.toLowerCase()} for ${revokeTarget.entry.name}?` : 'Revoke verification?'}
      description="They will need both required documents approved again before the flag is restored."
      confirmLabel="Revoke"
      requireReason
      reasonLabel="Reason for revocation (kept in the audit record)"
      reasonPlaceholder="e.g. Reported duplicate ID — status rolled back pending re-upload."
      onConfirm={(note) => void confirmRevoke(note)}
      onClose={() => setRevokeTarget(null)}
    />
  </AdminShell>
}
