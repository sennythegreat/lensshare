'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Camera, FileUp, GraduationCap, IdCard } from 'lucide-react'
import { RenterShell, Status } from '@/components/renter-shell'
import { fetchMySubmissions, insertVerificationSubmission, uploadVerificationDoc } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { VerificationDocType, VerificationSubmission } from '@/lib/types'
import '../renter.css'

function tone(status: string) {
  if (status === 'pending') return 'pending'
  if (status === 'rejected') return 'rejected'
  return 'teal'
}

function label(status: string) {
  if (status === 'pending') return 'Pending review'
  if (status === 'rejected') return 'Rejected — re-upload'
  return 'Approved'
}

function DocSlot({
  docType, title, hint, submission, disabled, onFile,
}: {
  docType: VerificationDocType
  title: string
  hint: string
  submission?: VerificationSubmission
  disabled: boolean
  onFile: (docType: VerificationDocType, file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onFile(docType, file)
    event.target.value = ''
  }
  return <div className="doc-slot">
    <div className="doc-slot-head">
      <strong>{title}</strong>
      {submission
        ? <Status tone={tone(submission.status)}>{label(submission.status)}</Status>
        : <Status tone="pending">Not submitted</Status>}
    </div>
    <p>{hint}</p>
    {submission?.status === 'rejected' && submission.review_note && <p className="doc-note">Reviewer note: “{submission.review_note}”</p>}
    <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={handleChange} />
    <button className="owner-button" disabled={disabled} onClick={() => inputRef.current?.click()}>
      <FileUp size={14} /> {submission && submission.status !== 'rejected' ? 'Replace file' : 'Choose file'}
    </button>
  </div>
}

export default function VerificationPage() {
  const { user } = useProfile()
  const [submissions, setSubmissions] = useState<VerificationSubmission[]>([])
  const [uploading, setUploading] = useState<VerificationDocType | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  function load() {
    if (!user) return
    fetchMySubmissions(user.id)
      .then((rows) => { setSubmissions(rows); setLoaded(true) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your submissions.'))
  }
  useEffect(load, [user])

  const latest = useMemo(() => {
    const map = new Map<VerificationDocType, VerificationSubmission>()
    for (const row of submissions) {
      if (!map.has(row.doc_type)) map.set(row.doc_type, row)
    }
    return map
  }, [submissions])

  async function handleFile(docType: VerificationDocType, file: File) {
    if (!user) return
    setUploading(docType)
    setError('')
    try {
      const path = await uploadVerificationDoc(user.id, docType, file)
      await insertVerificationSubmission(user.id, docType, path)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(null)
    }
  }

  return <RenterShell title="Verification" subtitle="Complete your renter profile to unlock eligible deposit waivers.">
    <div className="verification-grid">
      <section className="renter-card">
        <p className="eyebrow"><IdCard size={13} /> IDENTITY REVIEW</p>
        <h2>Government ID + selfie</h2>
        <p>Upload a clear government-issued ID and a matching selfie. Approving these verifies your LensShare account.</p>
        <div className="doc-slots">
          <DocSlot docType="government_id" title="Government ID" hint="Driver's license, PhilSys ID, passport, or UMID." submission={latest.get('government_id')} disabled={!!uploading} onFile={handleFile} />
          <DocSlot docType="selfie" title="Selfie" hint="A clear photo of you — face fully visible." submission={latest.get('selfie')} disabled={!!uploading} onFile={handleFile} />
        </div>
      </section>
      <section className="renter-card">
        <p className="eyebrow"><GraduationCap size={13} /> STUDENT STATUS</p>
        <h2>Student verification</h2>
        <p>Provide a school ID and proof of enrollment. Approved students qualify for the <b>zero-cash deposit</b> scheme.</p>
        <div className="doc-slots">
          <DocSlot docType="student_id" title="School ID" hint="Current school year or semester validity." submission={latest.get('student_id')} disabled={!!uploading} onFile={handleFile} />
          <DocSlot docType="proof_of_enrollment" title="Proof of enrollment" hint="Registration form or certificate of enrollment." submission={latest.get('proof_of_enrollment')} disabled={!!uploading} onFile={handleFile} />
        </div>
      </section>
    </div>
    {uploading && <p className="demo-note">Uploading {uploading.replace(/_/g, ' ')}…</p>}
    {error && <p className="auth-error">{error}</p>}
    <p className="demo-note"><Camera size={12} /> Documents are stored privately and reviewed only by authorized LensShare admins. You can replace a file anytime — your latest upload is the one under review.</p>
    <p className="demo-note"><BadgeCheck size={12} /> Approval is manual: an admin reviews each document before your status changes.</p>
    {loaded && !submissions.length && <p className="demo-note">No submissions yet — start with your government ID.</p>}
  </RenterShell>
}
