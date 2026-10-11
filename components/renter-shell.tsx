"use client"

import Link from 'next/link'
import { Camera, ClipboardList, CircleHelp, IdCard, Menu, Settings, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import './renter-shell.css'

export function RenterShell({ children, active = 'browse' }: { children: React.ReactNode; active?: string }) {
  const [open, setOpen] = useState(false)
  const links = [['browse','Browse Equipment','/browse',Camera],['bookings','My Bookings','/bookings',ClipboardList],['profile','My Profile','/profile',UserRound],['verification','Verification','/verification',IdCard],['help','How It Works','#how',CircleHelp]] as const
  return <div className="renter-shell"><aside className={open ? 'renter-sidebar open' : 'renter-sidebar'}><div className="renter-logo"><span><Camera /></span><div><b>LensShare</b><small>/ ARCHIVE<br/>P2P OPTICAL CO-OP</small></div></div><nav>{links.map(([key,label,href,Icon]) => <Link key={key} className={active === key ? 'active' : ''} href={href} onClick={() => setOpen(false)}><Icon />{label}</Link>)}</nav><div className="renter-account"><span>JV</span><div><b>Julian V.</b><small>VERIFIED RENTER</small></div><Settings /></div></aside><main className="renter-main"><header className="renter-header"><button className="renter-menu" onClick={() => setOpen(!open)} aria-label="Toggle renter menu">{open ? <X /> : <Menu />}</button><div className="renter-search"><Camera /><input placeholder="Search cameras, lenses, and gear..." /></div><span className="coverage">◉ LensCare™ ₱100,000 insured</span><Link href="/login" className="renter-avatar">JV</Link></header>{children}</main></div>
}

export function RenterPage({ title, subtitle, active, children }: { title: string; subtitle: string; active: string; children: React.ReactNode }) { return <RenterShell active={active}><section className="renter-content"><div className="renter-heading"><div><p className="renter-eyebrow">NAGA CITY HUB · RENTER WORKSPACE</p><h1>{title}</h1><p>{subtitle}</p></div><span className="hub-badge">● NAGA HUB · ACTIVE</span></div>{children}</section></RenterShell> }

export function Status({ children, tone = 'teal' }: { children: React.ReactNode; tone?: string }) { return <span className={`renter-status ${tone}`}>{children}</span> }

export function RenterCard({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`renter-card ${className}`}>{children}</section> }

export function RenterButtons() { return null }

export function DemoNote() { return <p className="demo-note">DEMO WORKSPACE · Connect a backend to persist renter data and bookings.</p> }

export function RenterFooter() { return null }

export function RenterLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="renter-button">{children}</Link> }
