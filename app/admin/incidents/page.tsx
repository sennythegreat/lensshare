'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, RefreshCw, Siren } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { useToast } from '@/components/toast'
import { fetchAdminIncidents, fetchIncidentPhotoUrl, updateIncidentStatus } from '@/lib/data'
import { type Incident, type IncidentStatus } from '@/lib/types'
import '../../admin/admin.css'

const STATUS_FILTERS: { key: IncidentStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'resolved', label: 'Resolved' },
]

const CATEGORY_LABELS: Record<string, string> = {
  damage: 'Damage',
  loss: 'Loss',
  accessory_missing: 'Missing accessory',
  late_return: 'Late return',
  misconduct: 'Misconduct',
  other: 'Other',
}

export default function AdminIncidentsPage() {
  const toast = useToast()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filter, setFilter] = useState<IncidentStatus | 'all'>('all')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolveTarget, setResolveTarget] = useState<Incident | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setState('loading')
    setError('')
    try {
      setIncidents(await fetchAdminIncidents('all'))
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the incident queue.')
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function toggleExpand(incident: Incident) {
    setExpanded((current) => {
      const next = current === incident.id ? null : incident.id
      setResolutionNote(incident.resolution_note ?? '')
      setNotice('')
      return next
    })
  }

  async function loadPhoto(incidentId: string, path: string) {
    setPhotoUrls((current) => ({ ...current, [path]: current[path] ?? '' }))
    try {
      const url = await fetchIncidentPhotoUrl(path)
      setPhotoUrls((current) => ({ ...current, [path]: url }))
    } catch {
      setPhotoUrls((current) => ({ ...current, [path]: '' }))
    }
  }

  async function move(incident: Incident, status: IncidentStatus) {
    if (busyId) return
    if (status === 'resolved' && !resolutionNote.trim()) {
      setError('Add resolution notes before resolving this incident.')
      return
    }
    if (status === 'resolved') {
      setResolveTarget(incident)
      return
    }
    setBusyId(incident.id)
    setError('')
    setNotice('')
    try {
      await updateIncidentStatus(incident.id, status, null)
      setNotice('Incident moved to review.')
      toast.success('Incident moved to review.')
      await load(false)
    } catch (moveError) {
      const message = moveError instanceof Error ? moveError.message : 'Could not update the incident.'
      setError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmResolve() {
    if (!resolveTarget) return
    const incident = resolveTarget
    setBusyId(incident.id)
    setError('')
    setNotice('')
    try {
      await updateIncidentStatus(incident.id, 'resolved', resolutionNote)
      setNotice('Incident resolved.')
      toast.success(`Incident resolved for booking #${incident.booking_id.slice(0, 8).toUpperCase()}.`)
      setResolveTarget(null)
      await load(false)
    } catch (moveError) {
      const message = moveError instanceof Error ? moveError.message : 'Could not resolve the incident.'
      setError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  const visible = filter === 'all' ? incidents : incidents.filter((incident) => incident.status === filter)
  const openCount = incidents.filter((incident) => incident.status !== 'resolved').length

  return <AdminShell title="Incident queue" subtitle="Damage reports and disputes. Reporting auto-holds the booking until you resolve it.">
    <div className="admin-handoff-detail-nav"><span>{openCount} open incident{openCount === 1 ? '' : 's'}</span><button className="owner-button" type="button" onClick={() => void load(false)}><RefreshCw size={13} /> Refresh</button></div>
    {notice && <div className="admin-handoff-alert success" role="status">{notice}</div>}
    {error && <div className="admin-handoff-alert error" role="alert">{error}</div>}

    <div className="admin-incident-filters" role="tablist" aria-label="Filter incidents by status">
      {STATUS_FILTERS.map((option) => (
        <button key={option.key} type="button" className={filter === option.key ? 'active' : ''} onClick={() => setFilter(option.key)}>{option.label}</button>
      ))}
    </div>

    {state === 'loading' ? <SectionSkeleton rows={4} />
      : state === 'error' ? <EmptyState title="Incident queue unavailable" hint={error} />
        : !visible.length ? <EmptyState title="No incidents here" hint="Damage and dispute reports filed by owners and renters will appear in this queue." />
          : <div className="admin-incident-list">
            {visible.map((incident) => (
              <article className={`admin-incident-card status-${incident.status}`} key={incident.id}>
                <header className="admin-incident-head">
                  <span className="admin-incident-icon"><Siren size={16} /></span>
                  <div>
                    <b>{CATEGORY_LABELS[incident.category] ?? incident.category} · booking #{incident.booking_id.slice(0, 8).toUpperCase()}</b>
                    <small>Reported {new Date(incident.created_at).toLocaleString('en-PH')} by the {incident.reporter_role} · incident date {incident.incident_date}</small>
                  </div>
                  <span className={`admin-incident-status s-${incident.status}`}>{incident.status.replace('_', ' ')}</span>
                </header>
                <p className="admin-incident-description">{incident.description}</p>
                <div className="admin-incident-actions">
                  <Link href={`/admin/handoffs/${incident.booking_id}`} className="admin-incident-link">Open booking workflow →</Link>
                  {incident.status !== 'resolved' && <button className="owner-button" type="button" onClick={() => toggleExpand(incident)}>{expanded === incident.id ? 'Close review' : 'Review / resolve'}</button>}
                  {incident.photo_paths.length > 0 && <span className="admin-incident-photos-count"><ImageIcon size={13} /> {incident.photo_paths.length} photo{incident.photo_paths.length === 1 ? '' : 's'}</span>}
                </div>

                {expanded === incident.id && incident.status !== 'resolved' && <div className="admin-incident-review">
                  {incident.photo_paths.map((path) => (
                    <IncidentPhoto key={path} path={path} url={photoUrls[path]} onNeedUrl={() => loadPhoto(incident.id, path)} />
                  ))}
                  <label htmlFor={`incident-note-${incident.id}`}><span>Review and resolution notes <b>Required to resolve</b></span>
                    <textarea id={`incident-note-${incident.id}`} value={resolutionNote} maxLength={4000} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Findings, charges against the deposit, repair or replacement outcomes, and what was communicated to both parties." />
                  </label>
                  <div className="admin-incident-review-actions">
                    {incident.status === 'submitted' && <button className="owner-button" type="button" disabled={busyId === incident.id} onClick={() => void move(incident, 'under_review')}>{busyId === incident.id ? 'Saving…' : 'Start review'}</button>}
                    <button className="owner-button dark" type="button" disabled={busyId === incident.id} onClick={() => void move(incident, 'resolved')}>{busyId === incident.id ? 'Saving…' : <><CheckCircle2 size={14} /> Resolve with notes</>}</button>
                  </div>
                  <p className="admin-incident-hint"><AlertTriangle size={13} /> Resolving clears the booking issue hold once no open incidents remain.</p>
                </div>}

                {incident.status === 'resolved' && <div className="admin-incident-resolution">
                  <b>Resolution</b>
                  <p>{incident.resolution_note}</p>
                  <small>Resolved {incident.resolved_at ? new Date(incident.resolved_at).toLocaleString('en-PH') : ''} · immutable once recorded</small>
                </div>}
              </article>
            ))}
          </div>}

    <ConfirmDialog
      open={Boolean(resolveTarget)}
      busy={busyId !== null}
      tone="danger"
      title="Resolve this incident?"
      description={<>The resolution notes are recorded permanently and cannot be edited afterwards. The booking issue hold clears once no open incidents remain.</>}
      confirmLabel="Resolve incident"
      onConfirm={() => void confirmResolve()}
      onClose={() => setResolveTarget(null)}
    />
  </AdminShell>
}

function IncidentPhoto({ path, url, onNeedUrl }: { path: string; url: string | undefined; onNeedUrl: () => void }) {
  useEffect(() => { if (url === undefined) onNeedUrl() }, [url, onNeedUrl])
  return <figure className="admin-incident-photo">
    {url ? <img src={url} alt={`Incident evidence ${path.split('/').pop()}`} /> : <span className="admin-incident-photo-loading"><Loader2 size={14} className="owner-spin" aria-hidden="true" /></span>}
    <figcaption>{path.split('/').pop()}</figcaption>
  </figure>
}
