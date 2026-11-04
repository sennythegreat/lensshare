'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Camera, Check, CircleAlert, FileUp, GraduationCap, IdCard } from 'lucide-react'
import { RenterHeadbar, Status } from '@/components/renter-headbar'
import { fetchMySubmissions, replaceVerificationSubmission } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { VerificationDocType, VerificationSubmission } from '@/lib/types'
import '../renter.css'

const IDENTITY_DOCS: VerificationDocType[] = ['government_id', 'selfie']
const STUDENT_DOCS: VerificationDocType[] = ['student_id', 'proof_of_enrollment']
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const ACCEPTED_DOCUMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const ACCEPTED_DOCUMENTS = 'image/jpeg,image/png,image/webp,application/pdf'

const DOC_LABELS: Record<VerificationDocType, string> = {
  government_id: 'Government ID',
  selfie: 'Selfie',
  student_id: 'School ID',
  proof_of_enrollment: 'Proof of enrollment',
}

type AggregateState = 'not_started' | 'incomplete' | 'pending' | 'approved' | 'needs_attention'

function tone(status: VerificationSubmission['status']) {
  if (status === 'pending') return 'pending'
  if (status === 'rejected') return 'rejected'
  return 'teal'
}

function label(status: VerificationSubmission['status']) {
  if (status === 'pending') return 'Pending review'
  if (status === 'rejected') return 'Rejected — replace file'
  return 'Approved'
}

function aggregateState(types: VerificationDocType[], latest: Map<VerificationDocType, VerificationSubmission>): AggregateState {
  const rows = types.map((type) => latest.get(type))
  if (rows.some((row) => row?.status === 'rejected')) return 'needs_attention'
  if (!rows.some(Boolean)) return 'not_started'
  if (rows.some((row) => !row)) return 'incomplete'
  if (rows.every((row) => row?.status === 'approved')) return 'approved'
  return 'pending'
}

function aggregateLabel(state: AggregateState) {
  if (state === 'approved') return 'Complete'
  if (state === 'pending') return 'In review'
  if (state === 'needs_attention') return 'Needs attention'
  if (state === 'incomplete') return 'More documents needed'
  return 'Not started'
}

function aggregateTone(state: AggregateState) {
  if (state === 'approved') return 'teal'
  if (state === 'needs_attention') return 'rejected'
  return 'pending'
}

function validateDocument(file: File): string | null {
  if (!ACCEPTED_DOCUMENT_TYPES.has(file.type)) return `“${file.name}” is not supported. Upload a JPG, PNG, WEBP, or PDF file.`
  if (!file.size) return `“${file.name}” is empty. Choose a file that contains your document.`
  if (file.size > MAX_DOCUMENT_BYTES) return `“${file.name}” is larger than 10 MB. Choose a smaller file.`
  return null
}

function latestByType(submissions: VerificationSubmission[]) {
  const latest = new Map<VerificationDocType, VerificationSubmission>()
  for (const row of submissions) {
    const current = latest.get(row.doc_type)
    if (!current || new Date(row.created_at).getTime() > new Date(current.created_at).getTime()) latest.set(row.doc_type, row)
  }
  return latest
}

function DocSlot({
  docType,
  title,
  hint,
  submission,
  disabled,
  uploading,
  error,
  onFile,
}: {
  docType: VerificationDocType
  title: string
  hint: string
  submission?: VerificationSubmission
  disabled: boolean
  uploading: boolean
  error?: string
  onFile: (docType: VerificationDocType, file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onFile(docType, file)
    event.target.value = ''
  }

  return <div className={`doc-slot ${submission?.status === 'rejected' ? 'needs-attention' : ''}`}>
    <div className="doc-slot-head">
      <div>
        <strong>{title}</strong>
        {submission && <small>Latest upload · {new Date(submission.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</small>}
      </div>
      {submission
        ? <Status tone={tone(submission.status)}>{label(submission.status)}</Status>
        : <Status tone="pending">Not submitted</Status>}
    </div>
    <p>{hint}</p>
    {submission?.status === 'rejected' && submission.review_note && <p className="doc-note">Reviewer note: “{submission.review_note}”</p>}
    {submission?.status === 'approved' && <p className="doc-replacement-note">Replacing an approved file sends the latest version back for review.</p>}
    {error && <p className="doc-validation-error" role="alert">{error}</p>}
    <input ref={inputRef} type="file" accept={ACCEPTED_DOCUMENTS} hidden onChange={handleChange} />
    <button className="owner-button" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
      <FileUp size={14} /> {uploading ? 'Uploading…' : submission ? 'Replace latest file' : 'Choose file'}
    </button>
  </div>
}

export default function VerificationPage() {
  const { user } = useProfile()
  const [submissions, setSubmissions] = useState<VerificationSubmission[]>([])
  const [uploading, setUploading] = useState<VerificationDocType | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VerificationDocType, string>>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loaded, setLoaded] = useState(false)

  function load() {
    if (!user) return Promise.resolve()
    return fetchMySubmissions(user.id)
      .then((rows) => { setSubmissions(rows); setLoaded(true) })
      .catch((loadError) => {
        setLoaded(true)
        setError(loadError instanceof Error ? loadError.message : 'Could not load your submissions.')
      })
  }

  useEffect(() => { void load() }, [user])

  const latest = useMemo(() => latestByType(submissions), [submissions])
  const identityState = useMemo(() => aggregateState(IDENTITY_DOCS, latest), [latest])
  const studentState = useMemo(() => aggregateState(STUDENT_DOCS, latest), [latest])
  const identitySubmitted = IDENTITY_DOCS.filter((type) => latest.has(type)).length
  const identityApproved = IDENTITY_DOCS.filter((type) => latest.get(type)?.status === 'approved').length
  const studentSubmitted = STUDENT_DOCS.filter((type) => latest.has(type)).length
  const studentApproved = STUDENT_DOCS.filter((type) => latest.get(type)?.status === 'approved').length

  async function handleFile(docType: VerificationDocType, file: File) {
    if (!user) return
    const validationError = validateDocument(file)
    setFieldErrors((current) => ({ ...current, [docType]: validationError ?? undefined }))
    setError('')
    setSuccess('')
    if (validationError) return

    setUploading(docType)
    try {
      await replaceVerificationSubmission(user.id, docType, file)
      await load()
      setSuccess(`${DOC_LABELS[docType]} submitted. This latest file is now the version awaiting review.`)
    } catch (uploadError) {
      setFieldErrors((current) => ({
        ...current,
        [docType]: uploadError instanceof Error ? uploadError.message : 'Upload failed. Please try again.',
      }))
    } finally {
      setUploading(null)
    }
  }

  return <RenterHeadbar title="Verification" subtitle="Complete both identity documents to verify your account; student eligibility is a separate, optional review.">
    <section className="verification-overview" aria-labelledby="verification-progress-title">
      <div className="verification-overview-copy">
        <p className="eyebrow"><BadgeCheck size={13} /> VERIFICATION PROGRESS</p>
        <h2 id="verification-progress-title">Two checks, reviewed document by document</h2>
        <p>Your identity check requires both a government ID and selfie. Student eligibility separately requires both a school ID and proof of enrollment.</p>
      </div>
      <div className="verification-track-list">
        <div className="verification-track">
          <div><span>Required identity</span><Status tone={aggregateTone(identityState)}>{aggregateLabel(identityState)}</Status></div>
          <progress max={2} value={identityApproved} aria-label={`${identityApproved} of 2 identity documents approved`} />
          <small>{identitySubmitted}/2 submitted · {identityApproved}/2 approved</small>
        </div>
        <div className="verification-track">
          <div><span>Optional student eligibility</span><Status tone={aggregateTone(studentState)}>{aggregateLabel(studentState)}</Status></div>
          <progress max={2} value={studentApproved} aria-label={`${studentApproved} of 2 student documents approved`} />
          <small>{studentSubmitted}/2 submitted · {studentApproved}/2 approved</small>
        </div>
      </div>
    </section>

    {success && <p className="auth-success verification-feedback" role="status"><Check size={15} /> {success}</p>}
    {error && <p className="auth-error verification-feedback" role="alert"><CircleAlert size={15} /> {error}</p>}

    <div className="verification-grid">
      <section className="renter-card verification-card">
        <div className="verification-card-head">
          <p className="eyebrow"><IdCard size={13} /> REQUIRED · IDENTITY</p>
          <Status tone={aggregateTone(identityState)}>{aggregateLabel(identityState)}</Status>
        </div>
        <h2>Government ID + selfie</h2>
        <p>Both latest documents must be approved before your LensShare account is verified. One approval alone does not complete identity verification.</p>
        <div className="doc-slots">
          <DocSlot docType="government_id" title="Government ID" hint="Driver’s license, PhilSys ID, passport, or UMID." submission={latest.get('government_id')} disabled={!!uploading} uploading={uploading === 'government_id'} error={fieldErrors.government_id} onFile={handleFile} />
          <DocSlot docType="selfie" title="Selfie" hint="A recent, clear photo of you with your face fully visible." submission={latest.get('selfie')} disabled={!!uploading} uploading={uploading === 'selfie'} error={fieldErrors.selfie} onFile={handleFile} />
        </div>
      </section>
      <section className="renter-card verification-card">
        <div className="verification-card-head">
          <p className="eyebrow"><GraduationCap size={13} /> OPTIONAL · STUDENT</p>
          <Status tone={aggregateTone(studentState)}>{aggregateLabel(studentState)}</Status>
        </div>
        <h2>School ID + enrollment proof</h2>
        <p>Both latest documents must be approved for student eligibility and the <b>zero-cash deposit</b> scheme. This does not replace identity verification.</p>
        <div className="doc-slots">
          <DocSlot docType="student_id" title="School ID" hint="A current school ID showing the active school year or semester." submission={latest.get('student_id')} disabled={!!uploading} uploading={uploading === 'student_id'} error={fieldErrors.student_id} onFile={handleFile} />
          <DocSlot docType="proof_of_enrollment" title="Proof of enrollment" hint="A current registration form or certificate of enrollment." submission={latest.get('proof_of_enrollment')} disabled={!!uploading} uploading={uploading === 'proof_of_enrollment'} error={fieldErrors.proof_of_enrollment} onFile={handleFile} />
        </div>
      </section>
    </div>
    <p className="demo-note verification-file-rules"><FileUp size={12} /> Accepted files: JPG, PNG, WEBP, or PDF, up to 10 MB each.</p>
    <p className="demo-note"><Camera size={12} /> Documents are stored privately and reviewed only by authorized LensShare admins. Replacing a document makes the new upload the latest version under review.</p>
    <p className="demo-note"><BadgeCheck size={12} /> Approval is manual and per document. A check becomes complete only after both of its required documents are approved.</p>
    {loaded && !submissions.length && <p className="demo-note">No submissions yet — start with your government ID and selfie.</p>}
  </RenterHeadbar>
}
