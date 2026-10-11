'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Camera, ChevronDown, LayoutDashboard, Menu, Settings, WalletCards, X } from 'lucide-react'
import '../app/dashboard/owner-pages.css'

export function OwnerShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const [open, setOpen] = useState(false)
  return <main className="owner-page"><aside className={`owner-sidebar ${open ? 'open' : ''}`}><div className="owner-logo"><span>◉</span><div><b>LensShare</b><small>STUDIO<br/>COLLECTIVE</small></div></div><Link className="owner-add" href="/dashboard/listings">+ Add gear</Link><nav><Link href="/dashboard"><LayoutDashboard/>Dashboard</Link><Link href="/dashboard/rentals"><WalletCards/>Manage Rentals</Link><Link href="/dashboard/listings"><Camera/>My Listings</Link><Link href="/dashboard/finance"><WalletCards/>Revenue & Payouts</Link><Link href="/dashboard/settings"><Settings/>Settings</Link></nav><div className="owner-profile"><span>●</span><div><b>Mateo Rossi</b><small>Demo verified owner</small></div><ChevronDown/></div></aside><section className="owner-main"><header className="owner-header"><button className="owner-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X/> : <Menu/>}</button><div className="owner-search">⌕ <input placeholder="Search rentals, gear serials, or creators..."/></div><span className="owner-demo">DEMO OWNER ACCOUNT</span><span>◌</span><span>?</span><b className="owner-avatar">M</b></header><div className="owner-content"><div className="owner-heading"><div><span className="owner-eyebrow">LENS SHARE · OWNER WORKSPACE</span><h1>{title}</h1><p>{subtitle}</p></div><Link className="owner-button dark" href="/dashboard/listings">+ Add listing</Link></div>{children}</div></section></main>
}

export const gear = [
  { name: 'Sony ZV-E10 & 16–50mm Kit', category: 'Vlogging · APS-C', price: '₱450', status: 'AVAILABLE', image: '/lensshare-camera.png' },
  { name: 'Fujifilm X-T30 II Silver Body', category: 'Hybrid film · APS-C', price: '₱600', status: 'AVAILABLE', image: '/camera-fujifilm.png' },
  { name: 'Sigma 16mm f/1.4 DC Lens', category: 'Fast prime · Sony E', price: '₱350', status: 'PAUSED', image: '/camera-lens.png' },
  { name: 'Godox SL60W Video Light Kit', category: '5600K daylight · Bowens', price: '₱300', status: 'AVAILABLE', image: '/camera-light.png' },
]

export function GearCard({ item }: { item: typeof gear[number] }) { return <article className="owner-gear-card"><div className="owner-gear-image"><img src={item.image} alt={item.name}/><span>{item.status}</span></div><small>{item.category}</small><h3>{item.name}</h3><p>● Naga City Hub · Demo listing</p><div className="owner-card-footer"><strong>{item.price}<small>/day</small></strong><button>EDIT</button><button>DATES</button></div></article> }

export function PageCard({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`owner-card ${className}`}>{children}</section> }

export function Status({ children }: { children: React.ReactNode }) { return <span className="owner-status">{children}</span> }

export function OwnerHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) { return <div className="owner-section-heading">{eyebrow && <span className="owner-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div> }

export function OwnerStats() { return <div className="owner-stats"><PageCard><span className="owner-eyebrow">ACTIVE RENTALS</span><strong>3 Active Units</strong><p>1 handoff scheduled</p></PageCard><PageCard><span className="owner-eyebrow">GEAR LISTED</span><strong>4 Listed Kits</strong><p>3 currently available</p></PageCard><PageCard><span className="owner-eyebrow">PENDING PAYOUTS</span><strong>₱2,850.00</strong><p>Demo estimate · not paid</p></PageCard></div> }

export function OwnerTable({ rows }: { rows: string[][] }) { return <div className="owner-table">{rows.map((row) => <div className="owner-row" key={row[0]}><div><Status>{row[1]}</Status><h3>{row[0]}</h3><p>{row[2]}</p></div><strong>{row[3]}</strong><button className="owner-button">{row[4]}</button></div>)}</div> }
