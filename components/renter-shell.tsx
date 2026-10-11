'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BadgeCheck, BookOpen, Camera, CircleHelp, Menu, ShieldCheck, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useProfile } from '@/lib/use-profile'
import { initialsOf } from '@/lib/types'
import { UserMenu } from '@/components/user-menu'
import '../app/dashboard/owner-pages.css'

const links = [
  ['/browse', 'Browse Equipment', Camera],
  ['/renter/bookings', 'My Bookings', BookOpen],
  ['/renter/profile', 'My Profile', UserRound],
  ['/renter/verification', 'Verification', BadgeCheck],
  ['/renter/how-it-works', 'How It Works', CircleHelp],
] as const

export function RenterShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false)
  const { profile } = useProfile()
  const name = profile?.full_name || 'Renter'
  const initials = profile ? initialsOf(name) : '…'
  return <div className="owner-page renter-page"><aside className={`owner-sidebar ${open ? 'open' : ''}`}><div className="owner-logo"><span className="logo-mark"><img src="/lensshare-camera.png" alt="" /></span><strong>LensShare</strong><small>RENTER WORKSPACE</small></div><button className="owner-add"><Camera size={14} /> BROWSE GEAR</button><nav className="owner-nav">{links.map(([href, label, Icon]) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} onClick={() => setOpen(false)}><Icon size={16} /> {label}</Link>)}{profile?.role === 'admin' && <Link href="/admin" className={pathname.startsWith('/admin') ? 'active' : ''} onClick={() => setOpen(false)}><ShieldCheck size={16} /> Admin</Link>}</nav><div className="owner-user"><span>{initials}</span><div><b>{name}</b><small>Verified renter</small></div></div></aside><main className="owner-main"><header className="owner-header"><button className="owner-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X size={18} /> : <Menu size={18} />}</button><div className="owner-search">⌕ <input placeholder="Search cameras, lenses, and gear..." /></div><span className="owner-demo">RENTER · NAGA CITY HUB</span><UserMenu initials={initials} name={name} subtitle="Renter workspace" settingsHref="/renter/profile" triggerClassName="owner-avatar" /></header><div className="owner-content"><div className="owner-heading"><div><p className="eyebrow">RENTER WORKSPACE · NAGA CITY HUB</p><h1>{title}</h1><p>{subtitle}</p></div></div>{children}</div></main></div>
}

export function Status({ children, tone = 'teal' }: { children: React.ReactNode; tone?: string }) { return <span className={`status ${tone}`}>{children}</span> }
