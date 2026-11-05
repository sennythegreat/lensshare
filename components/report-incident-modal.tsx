'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Siren } from 'lucide-react'
import { useToast } from '@/components/toast'
import { createIncident, validateIncidentPhotos } from '@/lib/data'
import type { IncidentCategory } from '@/lib/types'

const CATEGORIES: { key: IncidentCategory; label: string }[] = [
  { key: 'damage', label: 'Damage' },
  { key: 'loss', label: 'Loss / theft' },
  { key: 'accessory_missing', label: 'Missing accessory' },
  { key: 'late_return', label: 'Late return' },
  { key: 'misconduct', label: 'Misconduct' },
  { key: 'other', label: 'Other' },
]

function isoDate(daysFromNow = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function ReportIncidentModal({ bookingId, onClose, onReported }: {
  bookingId: string
  onClose: () => void
  onReported: () => void
}) {
  const toast = useToast()
  const [category, setCategory] = useState<IncidentCategory>('damage')
  const [description, setDescription] = useState('')
  const [incidentDate, setIncidentDate] = useState(isoDate())
  const [files, setFiles] = useState<{ file: File; url: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const previewUrls = useRef(new Set<string>())

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current.clear()
  }, [])

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!chosen.length) return
    try {
      validateIncidentPhotos(chosen)
      setFiles((current) => [...current, ...chosen.map((file) => {
        const url = URL.createObjectURL(file)
        previewUrls.current.add(url)
        return { file, url }
      })])
      setError('')
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : 'Those photos are not supported.')
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => {
      if (fileIndex !== index) return true
      previewUrls.current.delete(current[fileIndex].url)
      URL.revokeObjectURL(current[fileIndex].url)
      return false
    }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!description.trim()) {
      setError('Describe what happened.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createIncident({ booking_id: bookingId, category, description: description.trim(), incident_date: incidentDate }, files.map((entry) => entry.file))
      toast.success('Incident report filed — admins will review it shortly.')
      onReported()
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Could not file the incident report.'
      setError(message)
      toast.error(message)
      setBusy(false)
    }
  }

  return <div className="owner-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) onClose() }}>
    <section className="owner-modal report-incident-modal" role="dialog" aria-modal="true" aria-labelledby="report-incident-title">
      <button className="modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
      <header className="report-incident-head">
        <Siren size={18} aria-hidden="true" />
        <div>
          <h2 id="report-incident-title">Report an incident</h2>
          <p>Booking #{bookingId.slice(0, 8).toUpperCase()} · the report goes straight to the LensShare admin queue and places the rental on hold.</p>
        </div>
      </header>
      <form onSubmit={submit}>
        <label><span>What happened?</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as IncidentCategory)}>
            {CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label><span>Incident date</span>
          <input type="date" required max={isoDate()} value={incidentDate} onChange={(event) => setIncidentDate(event.target.value)} />
        </label>
        <label><span>Description <b>Required</b></span>
          <textarea required maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the damage or dispute, when it happened, and anything the admin should check." />
        </label>
        <div className="report-incident-photos">
          <button type="button" className="owner-button" disabled={files.length >= 10} onClick={() => fileInput.current?.click()}><ImagePlus size={14} /> Add photos</button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={chooseFiles} />
          <span>{files.length} of 10 · JPG, PNG or WebP · 10 MB each</span>
        </div>
        {files.length > 0 && <div className="report-incident-thumbs">
          {files.map((entry, index) => <figure key={entry.url}>
            <img src={entry.url} alt={entry.file.name} />
            <button type="button" aria-label={`Remove ${entry.file.name}`} onClick={() => removeFile(index)}>×</button>
          </figure>)}
        </div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="owner-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="owner-button dark" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
        </div>
      </form>
    </section>
  </div>
}
