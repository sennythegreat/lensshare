'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Camera, LayoutDashboard, Menu, Package, ShieldCheck, Users, X } from 'lucide-react'
import { useProfile } from '@/lib/use-profile'
import { initialsOf } from '@/lib/types'
import { UserMenu } from '@/components/user-menu'
import '../app/admin/admin.css'

const navLinks = [
  ['/admin', LayoutDashboard, 'Dashboard'],
  ['/admin/verifications', ShieldCheck, 'Verification'],
  ['/admin/users', Users, 'Owners & Renters'],
  ['/admin/equipment', Package, 'Equipment'],
] as const

export function AdminShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { profile, loading } = useProfile()
  const name = profile?.full_name || 'Admin'
  const initials = profile ? initialsOf(name) : '…'

  if (!loading && profile?.role !== 'admin') {
    return <main className="admin-page"><section className="admin-main"><div className="admin-content"><div className="admin-empty"><h3>Not authorized</h3><p>Your account does not have platform admin access. An existing admin can enable it on your profile.</p></div></div></section></main>
  }

  return <main className="admin-page">
    <aside className={`admin-sidebar ${open ? 'open' : ''}`}>
      <div className="admin-logo"><span className="admin-logo-mark"><Camera size={14} /></span><div><b>LensShare</b><small>ADMIN<br />CONSOLE</small></div></div>
      <nav>{navLinks.map(([href, Icon, label]) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} onClick={() => setOpen(false)}><Icon size={15} /> {label}</Link>)}</nav>
      <div className="admin-profile"><span className="admin-initials">{initials}</span><div><b>{name}</b><small>Platform admin</small></div></div>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar">
        <button className="admin-menu" onClick={() => setOpen(!open)} aria-label="Toggle admin menu">{open ? <X size={18} /> : <Menu size={18} />}</button>
        <span className="admin-tag">BACKSTAGE · NAGA CITY HUB</span>
        <UserMenu initials={initials} name={name} subtitle="Platform admin" triggerClassName="admin-avatar" />
      </header>
      <div className="admin-content">
        <div className="admin-heading"><span className="admin-eyebrow">LENS SHARE · ADMIN CONSOLE</span><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
      </div>
    </section>
  </main>
}
