'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/admin-shell'
import { fetchAdminUsers } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { AdminUserRow } from '@/lib/types'

const TABS = ['All', 'Owners', 'Renters'] as const

function chips(user: AdminUserRow) {
  return <>
    <span className={`admin-pill ${user.role}`}>{user.role}</span>
    <span className={`admin-pill ${user.verification_status}`}>{user.verification_status}</span>
    {user.is_student && <span className="admin-pill student">student</span>}
    {user.role === 'admin' && <span className="admin-pill admin">admin</span>}
  </>
}

export default function AdminUsersPage() {
  const { profile } = useProfile()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    fetchAdminUsers()
      .then((rows) => { setUsers(rows); setLoaded(true) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load users.'))
  }, [profile])

  const visible = useMemo(() => users
    .filter((u) => tab === 'All' || u.role === tab.toLowerCase())
    .filter((u) => `${u.full_name} ${u.email ?? ''}`.toLowerCase().includes(query.toLowerCase())), [users, tab, query])

  return <AdminShell title="Owners & Renters" subtitle="Every account on the platform, with their verification standing and activity.">
    <div className="admin-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 18px' }}>
      {TABS.map((item) => <button key={item} className="owner-button" style={tab === item ? { background: '#dcebe7', borderColor: '#bcd6cf', color: '#244b43' } : undefined} onClick={() => setTab(item)}>{item}</button>)}
      <input className="owner-button" style={{ marginLeft: 'auto', width: 240, background: '#fff' }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email..." />
    </div>
    {error && <div className="admin-table"><div className="admin-row"><p className="auth-error">{error}</p></div></div>}
    <div className="admin-table">
      {visible.map((user) => <div className="admin-row" key={user.id}>
        <div className="admin-row-main">
          <h3>{user.full_name}{user.role === 'admin' ? ' · Admin' : ''}</h3>
          <small>{user.email || 'No email on record'} · joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small>
        </div>
        <div className="admin-chips">
          <small>{user.role === 'owner' ? `${user.gear_listings[0]?.count ?? 0} listings` : `${user.bookings[0]?.count ?? 0} bookings`}</small>
          {chips(user)}
        </div>
      </div>)}
      {loaded && !visible.length && <div className="admin-empty"><h3>No accounts found</h3><p>Try another tab or search term.</p></div>}
      {!loaded && <div className="admin-row"><p>Loading accounts…</p></div>}
    </div>
  </AdminShell>
}
