'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/admin-shell'
import { PageCard, OwnerHeading, Status } from '@/components/owner-shell'
import { fetchSignedDocUrl, fetchVerificationQueue, reviewSubmission, updateProfile } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { VerificationDocType, VerificationSubmissionWithUser } from '@/lib/types'

const DOC_LABELS: Record<VerificationDocType, string> = {
  government_id: 'Government ID',
  selfie: 'Selfie',
  student_id: 'School ID',
  proof_of_enrollment: 'Proof of enrollment',
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function VerificationsPage() {
  const { user, profile, loading } = useProfile()
  const [queue, setQueue] = useState<VerificationSubmissionWithUser[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  function load() {
    fetchVerificationQueue()
      .then((rows) => { setQueue(rows); setLoaded(true) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the queue.'))
  }
  useEffect(load, [])

  const pending = useMemo(() => queue.filter((row) => row.status === 'pending'), [queue])
  const reviewed = useMemo(() => queue.filter((row) => row.status !== 'pending').slice(0, 12), [queue])

  const grouped = useMemo(() => {
    const byUser = new Map<string, { name: string; email: string; verification: string; isStudent: boolean; docs: VerificationSubmissionWithUser[] }>()
    for (const row of pending) {
      const entry = byUser.get(row.user_id) ?? {
        name: row.user?.full_name || 'Unknown user',
        email: row.user?.email || '—',
        verification: row.user?.verification_status || 'unverified',
        isStudent: row.user?.is_student ?? false,
        docs: [],
      }
      entry.docs.push(row)
      byUser.set(row.user_id, entry)
    }
    return Array.from(byUser.entries())
  }, [pending])

  async function viewDoc(row: VerificationSubmissionWithUser) {
    try {
      const url = await fetchSignedDocUrl(row.file_path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the document.')
    }
  }

  async function review(row: VerificationSubmissionWithUser, status: 'approved' | 'rejected') {
    if (!user) return
    let note: string | null = null
    if (status === 'rejected') {
      note = window.prompt('Reason for rejection (shown to the renter):') ?? null
      if (note === null) return
    }
    setBusyId(row.id)
    setError('')
    try {
      await reviewSubmission(row.id, status, note, user.id)
      if (status === 'approved') {
        if (row.doc_type === 'government_id') {
          await updateProfile(row.user_id, { verification_status: 'verified' })
        }
        if (row.doc_type === 'student_id' || row.doc_type === 'proof_of_enrollment') {
          await updateProfile(row.user_id, { is_student: true })
        }
      }
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review action failed.')
    } finally {
      setBusyId(null)
    }
  }

  return <AdminShell title="Verification queue" subtitle="Review identity documents and student proof, then approve or reject each submission.">
    {error && <PageCard><p className="auth-error">{error}</p></PageCard>}
    <PageCard>
      <OwnerHeading eyebrow="PENDING REVIEW" title={`${pending.length} submission${pending.length === 1 ? '' : 's'} waiting`} detail="Approving a government ID verifies the account. Approving school documents unlocks student (zero-deposit) eligibility."/>
      {grouped.length ? grouped.map(([userId, entry]) => <div className="admin-user-card" key={userId}>
        <div className="owner-section-heading" style={{ display: 'block', borderBottom: 0, paddingBottom: 0, marginBottom: 4 }}>
          <h2 style={{ margin: '10px 0 2px', font: '18px Georgia,serif' }}>{entry.name}</h2>
          <p style={{ margin: 0, fontSize: 11, color: '#69716e' }}>{entry.email} · account <Status>{entry.verification.toUpperCase()}</Status> {entry.isStudent && <Status>STUDENT</Status>}</p>
        </div>
        {entry.docs.map((row) => <div className="admin-doc-row" key={row.id}>
          <div>
            <strong>{DOC_LABELS[row.doc_type]}</strong>
            <small> · uploaded {dateLabel(row.created_at)}</small>
          </div>
          <div className="admin-doc-actions">
            <button className="owner-button" onClick={() => viewDoc(row)}>View document</button>
            <button className="owner-button dark" disabled={busyId === row.id} onClick={() => review(row, 'approved')}>Approve</button>
            <button className="owner-button" disabled={busyId === row.id} onClick={() => review(row, 'rejected')}>Reject</button>
          </div>
        </div>)}
      </div>) : <div className="owner-empty"><h3>{loaded ? 'Queue is clear' : 'Loading the queue…'}</h3><p>{loaded ? 'No documents are waiting for review. New submissions appear here instantly after refresh.' : 'Fetching pending submissions.'}</p></div>}
    </PageCard>
    <PageCard>
      <OwnerHeading eyebrow="RECENTLY REVIEWED" title="Latest decisions" detail="Approved and rejected submissions, newest first."/>
      {reviewed.length ? <div className="owner-table">{reviewed.map((row) => <div className="owner-row" key={row.id}>
        <div>
          <Status>{row.status.toUpperCase()}</Status>
          <h3>{DOC_LABELS[row.doc_type]} · {row.user?.full_name || 'Unknown user'}</h3>
          <p>Reviewed {row.reviewed_at ? dateLabel(row.reviewed_at) : '—'}{row.review_note ? ` · “${row.review_note}”` : ''}</p>
        </div>
        <button className="owner-button" onClick={() => viewDoc(row)}>View document</button>
      </div>)}</div> : <div className="owner-empty"><h3>No decisions yet</h3><p>Reviewed submissions will appear here.</p></div>}
    </PageCard>
  </AdminShell>
}
