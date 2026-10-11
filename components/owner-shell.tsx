'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Camera, ChevronDown, LayoutDashboard, Menu, Settings, WalletCards, X } from 'lucide-react'
import { useProfile } from '@/lib/use-profile'
import { initialsOf } from '@/lib/types'
import '../app/dashboard/owner-pages.css'

export type GearCardItem = { name: string; category: string; price: string; status: string; image: string }

const navLinks = [
  ['/dashboard', LayoutDashboard, 'Dashboard'],
  ['/dashboard/rentals', WalletCards, 'Manage Rentals'],
  ['/dashboard/listings', Camera, 'My Listings'],
  ['/dashboard/finance', WalletCards, 'Revenue & Payouts'],
  ['/dashboard/settings', Settings, 'Settings'],
] as const

export function OwnerShell({ children, title, subtitle, onAddGear }: { children: React.ReactNode; title: string; subtitle: string; onAddGear?: () => void }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { profile } = useProfile()
  const name = profile?.full_name || 'Owner'
  const initials = profile ? initialsOf(name) : '…'
  return <main className="owner-page"><aside className={`owner-sidebar ${open ? 'open' : ''}`}><div className="owner-logo"><span>◉</span><div><b>LensShare</b><small>STUDIO<br/>COLLECTIVE</small></div></div><button className="owner-add" type="button" onClick={onAddGear}>+ Add gear</button><nav>{navLinks.map(([href, Icon, label]) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} onClick={() => setOpen(false)}><Icon/> {label}</Link>)}</nav><div className="owner-profile"><span>●</span><div><b>{name}</b><small>Verified owner</small></div><ChevronDown/></div></aside><section className="owner-main"><header className="owner-header"><button className="owner-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X/> : <Menu/>}</button><div className="owner-search">⌕ <input placeholder="Search rentals, gear serials, or creators..."/></div><span className="owner-demo">OWNER WORKSPACE</span><span>◌</span><span>?</span><b className="owner-avatar">{initials}</b></header><div className="owner-content"><div className="owner-heading"><div><span className="owner-eyebrow">LENS SHARE · OWNER WORKSPACE</span><h1>{title}</h1><p>{subtitle}</p></div></div>{children}</div></section></main>
}

export function GearCard({ item, onStatusToggle }: { item: GearCardItem; onStatusToggle?: () => void }) { return <article className="owner-gear-card"><div className="owner-gear-image"><img src={item.image} alt={item.name}/><span>{item.status}</span></div><small>{item.category}</small><h3>{item.name}</h3><p>● Naga City Hub · Listed gear</p><div className="owner-card-footer"><strong>{item.price}<small>/day</small></strong><button>EDIT</button><button onClick={onStatusToggle}>{onStatusToggle ? (item.status === 'AVAILABLE' ? 'PAUSE' : 'ACTIVATE') : 'DATES'}</button></div></article> }

export function PageCard({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`owner-card ${className}`}>{children}</section> }

export function Status({ children }: { children: React.ReactNode }) { return <span className="owner-status">{children}</span> }

export function OwnerHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) { return <div className="owner-section-heading">{eyebrow && <span className="owner-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div> }

export function OwnerTable({ rows }: { rows: string[][] }) { return <div className="owner-table">{rows.map((row) => <div className="owner-row" key={row[0]}><div><Status>{row[1]}</Status><h3>{row[0]}</h3><p>{row[2]}</p></div><strong>{row[3]}</strong><button className="owner-button">{row[4]}</button></div>)}</div> }
