'use client'

import './dashboard.css'
import Link from 'next/link'
import { useState } from 'react'
import { Bell, Camera, ChevronDown, CircleHelp, Grid2X2, Heart, LayoutDashboard, LogOut, Menu, MoreHorizontal, Search, Settings, SlidersHorizontal, WalletCards, X } from 'lucide-react'

const rentals = [
  ['Sony ZV-E10 & 16–50mm Kit', 'ACTIVE RENTAL', 'Oct 24 - 27 (4 Days)', '₱1,800.00', 'Renter: Paolo R. · Campus Journalist / Vlog Shoot', 'camera'],
  ['Fujifilm X-T30 II Silver Body', 'AWAITING HAND-OFF', 'Oct 28 - 30 (3 Days)', '₱1,800.00', 'Renter: Alyssa C. · Student Film Documentary', 'body'],
  ['Sigma 16mm f/1.4 Lens (Sony E)', 'COMPLETED', 'Oct 20 - 23 · Mint Ret.', '₱1,050.00', 'Renter: Marcus B. · Night Architecture Set', 'lens'],
  ['Godox SL60W Video Light Kit', 'RESERVED', 'Nov 01 - 03 (Weekend)', '₱900.00', 'Renter: Bicol Indie Lab · Studio Pack', 'light'],
]

const vault = [
  ['Sony ZV-E10 & 16–...', '₱450', 'VLOGGING · APS-C', 'camera'],
  ['Fujifilm X-T30 II Body', '₱600', 'HYBRID FILM · APS-C', 'body'],
  ['Sigma 16mm f/1.4 DC', '₱350', 'FAST PRIME · SONY E', 'lens'],
  ['Godox SL60W Light...', '₱300', '5600K DAYLIGHT · BOWENS', 'light'],
]

function GearThumb({ kind }: { kind: string }) { return <div className={`gear-thumb thumb-${kind}`}><Camera size={34} /></div> }

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return <main className="dashboard-page">
    <aside className={`dashboard-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="studio-logo"><span className="brand-mark"><Camera size={13} /></span><div><b>LensShare</b><small>STUDIO<br />COLLECTIVE</small></div></div>
      <button className="add-gear-button"><span>+</span> Add gear</button>
      <nav className="dashboard-nav"><Link className="active" href="/dashboard"><LayoutDashboard size={16} /> Dashboard</Link><Link href="#rentals"><Grid2X2 size={16} /> Manage Rentals</Link><Link href="#vault"><Camera size={16} /> My Listings</Link><Link href="#settlement"><WalletCards size={16} /> Revenue & Payouts</Link><Link href="#settings"><Settings size={16} /> Settings</Link></nav>
      <div className="profile-chip"><span className="profile-icon">●</span><div><b>Mateo Rossi</b><small>Verified Creator</small></div><ChevronDown size={15} /></div>
    </aside>
    <section className="dashboard-main">
      <header className="dashboard-header"><button className="dashboard-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle dashboard sidebar">{sidebarOpen ? <X /> : <Menu />}</button><div className="search-box"><Search size={16} /><input placeholder="Search rentals, gear serials, or creators..." /></div><span className="guarantee">◉ LensCare™ Guarantee ₱100,000 Insured</span><Bell size={17} /><CircleHelp size={17} /><span className="header-avatar">●</span></header>
      <div className="dashboard-content"><div className="dashboard-title-row"><div><h1>Studio Dashboard <span className="status-pill">● Hub Naga · Active</span></h1><p>Overview of vault inventory, active peer escrow, and courier dispatch handoffs.</p></div><div className="title-actions"><button><SlidersHorizontal size={14} /> Filter period</button><button className="dark-action">⊕ Add listing</button></div></div>
      <div className="dashboard-top-grid"><article className="hub-card"><span className="eyebrow">◉ ₱100,000 LensCare™ reserve active</span><h2>Explore your gear vault & rental co-op hub.</h2><p>Respond to verified student creators, schedule instant hub courier dispatches via Maxim or Lalamove, and review automated 24h bank escrow payouts.</p><div className="hub-actions"><button className="dark-action">How escrow works →</button><button>▣ View hub guidelines</button></div></article><article className="net-card"><span className="eyebrow">Monthly owner net take-home</span><strong>₱3,400 <small>↗ +18.4% MoM</small></strong><p>8 Days Rented · 85% Net Share</p><div className="mini-chart"><span /><span /><span /><span /><i /></div><div className="chart-labels"><small>WK 01</small><small>WK 02</small><small>WK 03</small><small>WK 04 (CURR)</small></div></article></div>
      <div className="metric-grid"><Metric title="Active rentals" value="3 Active Units" detail="● 1 Dispatch Scheduled" kind="wave" /><Metric title="Vault gear online" value="4 Listed Kits" detail="◉ 100% Insured Verified" kind="wave short" /><Metric title="Pending in escrow" value="₱2,850.00" detail="ϟ Auto 24h Bank/GCash Release" kind="wave" /></div>
      <div className="dashboard-columns"><div id="rentals"><SectionHeading title="Manage Active Bookings" sub="Real-time custody state and digital checklist verifications" link="See all rentals →" /> <div className="rental-list">{rentals.map((item) => <article className="rental-row" key={item[0]}><GearThumb kind={item[5]} /><div className="rental-copy"><div><span className="rental-status">{item[1]}</span><small>{item[2]}</small></div><h3>{item[0]}</h3><p>{item[4]}</p></div><div className="rental-price"><strong>{item[3]}</strong><button>{item[1] === 'ACTIVE RENTAL' ? 'Checklist' : item[1] === 'AWAITING HAND-OFF' ? 'Confirm hand-off' : item[1] === 'COMPLETED' ? '◉ Paid out' : 'Pre-pack kit'}</button></div></article>)}</div></div><div className="side-widgets"><Widget title="Rental Demographics"><div className="donut"><span>100%<small>Verified</small></span></div><div className="legend"><span>■ Student Filmmakers <b>60%</b></span><span>■ Campus Journalists <b>25%</b></span><span>■ Freelance DPs <b>15%</b></span></div></Widget><Widget title="Recent Community Reviews"><Review initials="AM" name="Alan Marti" time="Yesterday" text="Outstanding camera kit. Sony ZV-E10 was cleanly packed, sensor spotless, battery at 100%. Great pickup at Ateneo Ave hub." /><Review initials="OL" name="Onyama Limba" time="3d ago" text="Fujifilm X-T30 II colors were amazing for our short doc. Smooth handoff via Maxim courier and digital gear checklist." /></Widget></div></div>
      <div className="vault-section" id="vault"><SectionHeading title="My Gear Vault & Public Listings" sub="Active equipment in the LensShare local marketplace" link="4 Kits Online · ⋯" /><div className="vault-grid">{vault.map(item => <article className="vault-card" key={item[0]}><div className="vault-image"><span>AVAILABLE TODAY</span><GearThumb kind={item[3]} /></div><small>{item[2]}</small><h3>{item[0]}</h3><p>⌖ Ateneo Ave Hub · 1.5 km</p><div className="vault-price"><strong>{item[1]}<small>/day</small></strong><button>Edit</button><button>Dates</button></div></article>)}</div></div>
      <section className="settlement" id="settlement"><div className="section-heading"><div><span className="eyebrow">Settlement protocol</span><h2>Transparent Earnings & Escrow Splits</h2></div><span className="auto-pill">Auto-Payout Trigger: ACTIVE (24H)</span></div><div className="settlement-grid"><div><span>Owner net take-home (85%)</span><strong>₱3,400.00</strong><p>No hidden deductions or platform markups.</p></div><div><span>LensCare co-op pool (15%)</span><strong className="muted-price">₱600.00</strong><p>Funds ₱100k gear replacement insurance & ID vetting.</p></div><div><span>Connected payout ledger</span><p>GCash (••921) <b>₱1,050.00 · Settled</b></p><p>BPI Savings (••3042) <b>₱1,400.00 · Settled</b></p><a href="#settlement">View detailed statement →</a></div></div></section>
      </div>
    </section>
  </main>
}

function Metric({ title, value, detail, kind }: { title: string; value: string; detail: string; kind: string }) { return <article className="metric-card"><span className="eyebrow">{title}</span><strong>{value}</strong><p>{detail}</p><div className={`metric-wave ${kind}`} /></article> }
function SectionHeading({ title, sub, link }: { title: string; sub: string; link: string }) { return <div className="section-heading dashboard-section-heading"><div><h2>{title}</h2><p>{sub}</p></div><a href="#rentals">{link}</a></div> }
function Widget({ title, children }: { title: string; children: React.ReactNode }) { return <article className="widget"><h2>{title}</h2>{children}</article> }
function Review({ initials, name, time, text }: { initials: string; name: string; time: string; text: string }) { return <div className="review"><span>{initials}</span><div><b>{name}</b><small>{time}</small><p>“{text}”</p></div></div> }
