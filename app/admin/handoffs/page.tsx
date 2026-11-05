'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Clock3, RefreshCw, Search, Settings, UserRoundCheck } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ErrorState } from '@/components/states'
import { useToast } from '@/components/toast'
import {
  assignAdminHubHandoff,
  fetchAdminHubHandoffQueue,
  fetchAdminUsers,
  subscribeToAdminHubHandoffs,
} from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { pesos, RENTAL_PAYMENT_STATUS_LABELS, type AdminUserRow, type HubHandoffQueueItem } from '@/lib/types'

const FILTERS = [
  { value: 'mine', label: 'Mine' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'pickup_due', label: 'Pickup due' },
  { value: 'return_due', label: 'Return due' },
  { value: 'issue_hold', label: 'Issue hold' },
  { value: 'completed', label: 'Completed' },
] as const

type QueueFilter = (typeof FILTERS)[number]['value']

const CUSTODY_LABELS: Record<HubHandoffQueueItem['custody_state'], string> = {
  awaiting_owner_dropoff: 'Awaiting owner drop-off',
  at_hub_for_pickup: 'At hub · for renter pickup',
  with_renter: 'With renter',
  at_hub_for_return: 'At hub · for owner release',
  completed: 'Custody completed',
}

const DEPOSIT_LABELS: Record<HubHandoffQueueItem['deposit_status'], string> = {
  not_submitted: 'Not submitted',
  pending_review: 'Proof to review',
  accepted: 'Proof accepted',
  rejected: 'Proof rejected',
  waived: 'Waived',
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dueLabel(value: string | null | undefined) {
  const date = parseDate(value)
  if (!date) return 'Schedule pending'
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return `${sameDay ? 'Today' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
}

export default function AdminHubHandoffsPage() {
  const { user, profile, loading: profileLoading } = useProfile()
  const toast = useToast()
  const [rows, setRows] = useState<HubHandoffQueueItem[]>([])
  const [admins, setAdmins] = useState<AdminUserRow[]>([])
  const [filter, setFilter] = useState<QueueFilter>('mine')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState('loading')
    setError('')
    try {
      const [queue, users] = await Promise.all([fetchAdminHubHandoffQueue(), fetchAdminUsers()])
      setRows(queue)
      setAdmins(users.filter((candidate) => candidate.role === 'admin'))
      setLastUpdated(new Date())
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the Naga Hub hand-off queue.')
      if (!quiet) setState('error')
    }
  }, [])

  useEffect(() => {
    if (profileLoading || profile?.role !== 'admin') return
    void load()
  }, [profileLoading, profile?.role, load])

  useEffect(() => {
    if (profile?.role !== 'admin') return
    return subscribeToAdminHubHandoffs(() => void load(true))
  }, [profile?.role, load])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(({ value }) => [value, rows.filter((row) => {
    if (value === 'mine') return Boolean(user && row.assigned_admin_id === user.id)
    if (value === 'unassigned') return !row.assigned_admin_id
    return row.queue_bucket === value
  }).length])) as Record<QueueFilter, number>, [rows, user])

  const visible = useMemo(() => rows
    .filter((row) => {
      if (filter === 'mine') return Boolean(user && row.assigned_admin_id === user.id)
      if (filter === 'unassigned') return !row.assigned_admin_id
      return row.queue_bucket === filter
    })
    .filter((row) => {
      const booking = row.booking
      const search = `${booking.listing?.name ?? ''} ${booking.owner?.full_name ?? ''} ${booking.renter?.full_name ?? ''} ${booking.id}`.toLowerCase()
      return search.includes(query.trim().toLowerCase())
    }), [filter, query, rows, user])

  async function changeAssignment(row: HubHandoffQueueItem, adminId: string | null) {
    setBusyId(row.booking_id)
    setError('')
    const previousId = row.assigned_admin_id
    const assignee = admins.find((admin) => admin.id === adminId) ?? null
    setRows((current) => current.map((item) => item.booking_id === row.booking_id
      ? { ...item, assigned_admin_id: adminId, assigned_admin: assignee ? { id: assignee.id, full_name: assignee.full_name } : null }
      : item))
    try {
      await assignAdminHubHandoff(row.booking_id, adminId)
      toast.success(assignee ? `Booking #${row.booking_id.slice(0, 8).toUpperCase()} assigned to ${assignee.full_name}.` : 'Hand-off set back to unassigned.')
      setLastUpdated(new Date())
    } catch (assignmentError) {
      setRows((current) => current.map((item) => item.booking_id === row.booking_id
        ? { ...item, assigned_admin_id: previousId, assigned_admin: row.assigned_admin }
        : item))
      const message = assignmentError instanceof Error ? assignmentError.message : 'Could not update the hand-off assignment.'
      setError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  const initialLoading = profileLoading || state === 'loading'

  return <AdminShell title="Naga Hub hand-offs" subtitle="Run each physical custody exchange from owner drop-off through final owner release.">
    <div className="admin-handoff-toolbar">
      <div className="admin-handoff-live" aria-live="polite"><span aria-hidden="true" /> Live queue{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}</div>
      <div className="admin-handoff-toolbar-actions">
        <button className="owner-button" type="button" disabled={initialLoading} onClick={() => void load()}><RefreshCw size={13} /> Refresh</button>
        <Link className="owner-button" href="/admin/handoffs/settings"><Settings size={13} /> Hub settings</Link>
      </div>
    </div>

    {error && state !== 'error' && <div className="admin-handoff-alert error" role="alert">{error}</div>}

    <section className="admin-handoff-summary" aria-label="Queue summary">
      {FILTERS.slice(1).map(({ value, label }) => <button type="button" key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}><span>{label}</span><strong>{counts[value]}</strong></button>)}
    </section>

    <div className="admin-handoff-controls">
      <div className="admin-handoff-filters" role="group" aria-label="Filter hand-offs">
        {FILTERS.map(({ value, label }) => <button type="button" className={filter === value ? 'selected' : ''} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{label} <span>{counts[value]}</span></button>)}
      </div>
      <label className="admin-handoff-search"><Search size={14} /><span className="sr-only">Search hand-offs</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gear, person, or booking…" /></label>
    </div>

    {state === 'error' ? <div className="admin-handoff-state"><ErrorState title="Hand-off queue unavailable" hint={error || 'The queue could not be loaded.'} retry={() => void load()} /></div>
      : initialLoading ? <QueueSkeleton />
        : visible.length ? <div className="admin-handoff-queue">{visible.map((row) => {
          const booking = row.booking
          const dueAt = row.queue_bucket === 'return_due' || row.custody_state === 'with_renter' || row.custody_state === 'at_hub_for_return' ? row.return_due_at : row.pickup_due_at
          return <article className={`admin-handoff-card ${row.queue_bucket === 'issue_hold' ? 'issue' : ''}`} key={row.booking_id}>
            <div className="admin-handoff-card-main">
              <img src={booking.listing?.image_url || '/lensshare-camera.png'} alt="" />
              <div className="admin-handoff-card-copy">
                <div className="admin-handoff-card-meta"><span className={`admin-handoff-badge ${row.queue_bucket}`}>{row.queue_bucket.replaceAll('_', ' ')}</span><span>{shortId(row.booking_id)}</span></div>
                <h2>{booking.listing?.name || 'Removed listing'}</h2>
                <p>{booking.owner?.full_name || 'Owner'} <ArrowRight size={11} aria-label="to" /> {booking.renter?.full_name || 'Renter'}</p>
                <div className="admin-handoff-card-facts">
                  <span><Clock3 size={13} /> {dueLabel(dueAt)}</span>
                  <span>{CUSTODY_LABELS[row.custody_state]}</span>
                  <span className={`deposit-${row.deposit_status}`}>Deposit · {DEPOSIT_LABELS[row.deposit_status]}</span>
                  <span className={`admin-rental-payment-${row.rental_payment_status ?? 'missing'}`}>Rent · {row.rental_payment_status ? RENTAL_PAYMENT_STATUS_LABELS[row.rental_payment_status] : 'Setup pending'}</span>
                </div>
                {row.issue_hold_reason && <p className="admin-handoff-issue-note">Hold: {row.issue_hold_reason}</p>}
              </div>
            </div>
            <div className="admin-handoff-card-side">
              <div className="admin-handoff-value"><small>Renter total</small><strong>{pesos(Number(booking.total))}</strong></div>
              <label className="admin-handoff-assign"><span>Assigned hub admin</span><select value={row.assigned_admin_id ?? ''} disabled={busyId === row.booking_id} onChange={(event) => void changeAssignment(row, event.target.value || null)}><option value="">Unassigned</option>{admins.map((admin) => <option value={admin.id} key={admin.id}>{admin.full_name}</option>)}</select></label>
              {!row.assigned_admin_id && user && <button className="owner-button" type="button" disabled={busyId === row.booking_id} onClick={() => void changeAssignment(row, user.id)}><UserRoundCheck size={13} /> Assign to me</button>}
              {row.blocker_count > 0 && <span className="admin-handoff-blocker-count">{row.blocker_count} open blocker{row.blocker_count === 1 ? '' : 's'}</span>}
              <Link className="owner-button dark" href={`/admin/handoffs/${row.booking_id}`}>Open desk <ArrowRight size={13} /></Link>
            </div>
          </article>
        })}</div>
          : <div className="admin-handoff-empty"><h2>{query ? 'No matching hand-offs' : `${FILTERS.find((item) => item.value === filter)?.label} is clear`}</h2><p>{query ? 'Try another person, gear name, or booking reference.' : 'New or updated hub exchanges will appear here automatically.'}</p></div>}
  </AdminShell>
}

function QueueSkeleton() {
  return <div className="admin-handoff-queue" aria-label="Loading hand-off queue" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div className="admin-handoff-card admin-handoff-card-skeleton" key={index}><span className="skeleton" /><div><i className="skeleton" /><i className="skeleton short" /><i className="skeleton" /></div></div>)}</div>
}
