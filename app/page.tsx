'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchListings, fetchPlatformStats } from '@/lib/data'
import { listingPhotos, pesos, type ListingWithOwner, type PlatformStats } from '@/lib/types'
import { ArrowUpRight, Check, ChevronRight, LockKeyhole, Menu, ShieldCheck, X } from 'lucide-react'

const categories = ['All gear', 'Cameras', 'Lenses', 'Lighting'] as const

type LandingCategory = (typeof categories)[number]

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>
}

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState<LandingCategory>('All gear')
  const [listings, setListings] = useState<ListingWithOwner[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState('')
  const [stats, setStats] = useState<PlatformStats | null>(null)

  function loadListings() {
    setListingsLoading(true)
    setListingsError('')
    fetchListings()
      .then(setListings)
      .catch((error) => setListingsError(errorMessage(error, 'Could not load the available equipment.')))
      .finally(() => setListingsLoading(false))
  }

  useEffect(loadListings, [])
  useEffect(() => {
    fetchPlatformStats().then(setStats).catch(() => {})
  }, [])

  const featuredListing = listings[0] ?? null
  const visibleListings = useMemo(() => listings
    .filter((listing) => active === 'All gear' || listing.category === active)
    .slice(0, 4), [active, listings])
  const rateRange = useMemo(() => {
    if (!listings.length) return null
    const rates = listings.map((listing) => Number(listing.daily_rate))
    return { min: Math.min(...rates), max: Math.max(...rates) }
  }, [listings])
  const heroImage = featuredListing ? listingPhotos(featuredListing)[0] || '/lensshare-camera.png' : '/lensshare-camera.png'
  const availableCount = stats?.availableListings ?? listings.length
  const availableCountLabel = stats || (!listingsLoading && !listingsError) ? availableCount.toLocaleString() : '—'
  const rateRangeLabel = rateRange
    ? rateRange.min === rateRange.max
      ? pesos(rateRange.min)
      : `${pesos(rateRange.min)} – ${pesos(rateRange.max)}`
    : '—'

  return (
    <main>
      <nav className="nav shell">
        <a href="#top" className="brand"><span className="brand-mark"><img src="/lensshare-logo.png" alt="" /></span> LensShare</a>
        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#how">How it works</a><a href="#inventory">Browse gear</a><a href="/signup">List your gear</a>
        </div>
        <div className="nav-actions"><a className="text-button" href="/signup">Sign up</a><a className="pill-button" href="/login">Log in</a></div>
        <button className="menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
      </nav>

      <section className="hero" id="top">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="kicker">Peer-to-peer camera & gear community</span>
            <h1>LensShare</h1>
            <p className="hero-lede">Stop letting expensive cameras sit idle. LensShare connects local creators, students, and hobbyists with cameras, lenses, and lighting — making creative projects, school outputs, and vlogs accessible to everyone.</p>
            <div className="hero-actions"><a className="button dark" href="/browse">Find local gear <ArrowUpRight size={14} /></a><a className="button light" href="/signup">List your equipment</a></div>
            <div className="trust-row"><span><LockKeyhole size={12} /> Protected hub handoffs</span><span><ShieldCheck size={12} /> Identity-verified renters</span><span><Check size={12} /> Clear booking totals</span></div>
          </div>
          <div className="hero-visual">
            <img src={heroImage} alt={featuredListing ? featuredListing.name : 'Camera equipment available through LensShare'} />
            <div className="floating-card community-card"><small>Local marketplace</small><strong>{availableCountLabel} available</strong><span>gear listing{availableCount === 1 ? '' : 's'}</span></div>
            {featuredListing && <div className="floating-card camera-card"><small>Featured today</small><strong>{featuredListing.name}</strong><span>{pesos(Number(featuredListing.daily_rate))}/day · {Number(featuredListing.rating).toFixed(1)} ★</span></div>}
          </div>
        </div>
      </section>

      <section className="section shell" id="community">
        <SectionLabel>Local access · active marketplace</SectionLabel>
        <h2>Creative Gear, Put Back to Work</h2>
        <div className="live-stats" aria-label="LensShare platform activity">
          <div><strong>{availableCountLabel}</strong><span>Available gear listings</span></div>
          <div><strong>{stats ? stats.verifiedMembers.toLocaleString() : '—'}</strong><span>Verified local members</span></div>
          <div><strong>{stats ? stats.completedBookings.toLocaleString() : '—'}</strong><span>Completed rentals</span></div>
        </div>
        <div className="split-cards">
          <article className="problem-card">
            <span className="card-tag red">The access gap</span>
            <h3>Useful Equipment Should Spend More Time Creating</h3>
            <p>Owner-listed gear can support local shoots instead of sitting unused, while creators get access without buying every tool they need.</p>
            <div className="stat-row"><b>{availableCountLabel}<small>Available owner listings</small></b><b>{rateRangeLabel}<small>Current daily-rate range</small></b></div>
          </article>
          <article className="dark-card">
            <span className="card-tag">LensShare in Naga</span>
            <h3>A Local Marketplace with a Structured Handoff</h3>
            <p>Browse current equipment, send a booking request, and use the configured Naga City Hub for approved handoffs and returns.</p>
            <div className="stat-row"><b>Naga City<small>Configured local hub</small></b><b>Verified<small>Identity-led booking flow</small></b></div>
          </article>
        </div>
      </section>

      <section className="cream-section">
        <div className="section shell" id="how">
          <div className="center-heading"><SectionLabel>Built for both sides of the lens</SectionLabel><h2>The Peer Advantage</h2><p>A community platform designed to widen access to production tools while keeping owners in control of their equipment.</p></div>
          <div className="advantage-grid">
            {[
              ['⌂', 'Rent Without the Hefty Price Tag', 'Get access to creator-grade cameras, lenses, lighting, and support gear without a huge upfront cost.'],
              ['◌', 'Put Idle Gear to Work', 'List equipment you already own, set its daily rate, and manage every request from your workspace.'],
              ['✦', 'Choose from Current Inventory', 'See the photos, specifications, rates, and availability areas owners have added to LensShare.'],
              ['◈', 'Clear, Protected Handoffs', 'Follow identity checks, booking totals, inspections, and configured hub steps in one workflow.'],
            ].map(([icon, title, copy]) => <article className="advantage" key={title}><span className="adv-icon">{icon}</span><h3>{title}</h3><p>{copy}</p><a href={title === 'Put Idle Gear to Work' ? '/signup' : '/browse'}>Learn more <ChevronRight size={12} /></a></article>)}
          </div>
        </div>
      </section>

      <section className="section shell" id="guides">
        <div className="section-heading"><div><SectionLabel>Plan around the work</SectionLabel><h2>Gear for Different Creative Projects</h2></div><a href="/browse" className="inline-link">Browse current equipment <ArrowUpRight size={13} /></a></div>
        <div className="package-grid">
          {[
            ['Academic projects', 'Student Filmmakers & Video Outputs', 'Build a practical kit for class films, interviews, and school requirements from equipment available now.'],
            ['Fast turnaround', 'Campus Journalists & Digital Creators', 'Find cameras, audio, and support gear suited to events, reports, and quick social edits.'],
            ['Client work', 'Freelance Photographers & UGCs', 'Compare owner-listed bodies, lenses, lighting, and accessories for your next production.'],
            ['Personal projects', 'Travelers & Analog Hobbyists', 'Explore compact and specialized gear without relying on a fixed catalog or package.'],
          ].map(([tag, title, copy]) => <article className="package" key={title}><span className="card-tag">{tag}</span><h3>{title}</h3><p>{copy}</p><small>Inventory and rates update from current owner listings.</small></article>)}
        </div>
      </section>

      <section className="cream-section">
        <div className="section shell steps">
          <div className="center-heading"><SectionLabel>Protocol · secure exchange</SectionLabel><h2>Simplicity in Three Movements</h2></div>
          <div className="steps-grid">
            {[
              ['01 /', 'Browse & Request Locally', 'Compare available equipment and send the owner a request for your project dates.'],
              ['02 /', 'Complete the Hub Handoff', 'After approval, follow the deposit, agreement, inspection, and configured Naga City Hub steps.'],
              ['03 /', 'Shoot, Return & Complete', 'Use the gear, return it through the tracked workflow, and complete the final condition check.'],
            ].map(([num, title, copy]) => <article className="step" key={num}><b>{num}</b><h3>{title}</h3><p>{copy}</p><span><Check size={12} /> Tracked by LensShare</span></article>)}
          </div>
        </div>
      </section>

      <section className="section shell" id="inventory">
        <div className="section-heading">
          <div><SectionLabel>Current owner listings</SectionLabel><h2>Trending in Your Neighborhood</h2></div>
          <div className="inventory-heading-actions">
            <div className="filters" aria-label="Filter featured equipment">{categories.map((item) => <button type="button" key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</div>
            <a href="/browse" className="inline-link">View full catalog <ArrowUpRight size={13} /></a>
          </div>
        </div>
        {listingsLoading ? <div className="landing-listings-state" role="status" aria-live="polite"><b>Loading current equipment…</b><p>Checking the latest available owner listings.</p></div>
          : listingsError ? <div className="landing-listings-state error" role="alert"><b>Could not load the current equipment.</b><p>{listingsError}</p><button type="button" onClick={loadListings}>Try again</button></div>
            : visibleListings.length ? <div className="gear-grid">{visibleListings.map((item) => {
              const tag = `${item.category} / ${item.brand}`
              return <article className="gear-card" key={item.id}>
                <div className="gear-image"><span>{tag}</span><img src={listingPhotos(item)[0] || '/lensshare-camera.png'} alt={item.name} /></div>
                <div className="gear-info"><small>{tag}</small><h3>{item.name}</h3><p>{item.description || item.specs || item.meta || 'Owner-listed equipment available through LensShare.'}</p><div className="gear-meta"><span>{pesos(Number(item.daily_rate))}<small>/ day</small></span><span className="gear-rating">★ {Number(item.rating).toFixed(1)}</span></div></div>
              </article>
            })}</div>
              : <div className="landing-listings-state"><b>{active === 'All gear' ? 'No equipment is available right now.' : `No ${active.toLowerCase()} are available right now.`}</b><p>{active === 'All gear' ? 'Check back as owners add or reactivate their listings.' : 'Choose another category or browse the complete catalog.'}</p>{active !== 'All gear' && <button type="button" onClick={() => setActive('All gear')}>Show all gear</button>}</div>}
      </section>

      <section className="final-cta">
        <div className="shell center-heading"><SectionLabel>Local creatives marketplace</SectionLabel><h2>Bring Your Ideas to Life.<br />Join LensShare Today.</h2><p>Whether you are shooting a campus documentary, filming a weekend vlog, or listing equipment for local creators, you belong in our community.</p><div className="hero-actions"><a className="button light" href="/browse">Find gear near you <ArrowUpRight size={14} /></a><a className="button outline-light" href="/signup">List your gear</a></div></div>
      </section>

      <footer className="footer">
        <div className="shell footer-grid">
          <div><a className="brand" href="#top"><span className="brand-mark"><img src="/lensshare-logo.png" alt="" /></span> LensShare</a><p>Protected peer-to-peer access for creators, students, and essential gear.</p><small>© 2026 LensShare · Local creator peer network</small></div>
          {[
            ['Marketplace', ['Browse gear', '/browse'], ['Creator guides', '/packages'], ['How it works', '#how']],
            ['For owners', ['List equipment', '/signup'], ['Owner workspace', '/dashboard'], ['Owner verification', '/dashboard/verification']],
            ['Community', ['Join LensShare', '/signup'], ['Current inventory', '#inventory'], ['Naga City workflow', '#how']],
            ['Security & care', ['Identity verification', '/signup'], ['Hub handoffs', '#how'], ['Clear booking records', '/browse']],
          ].map(([title, ...items]) => <div key={title as string}><b>{title}</b>{items.map(([label, href]) => <a href={href} key={label}>{label}</a>)}</div>)}
        </div>
      </footer>
    </main>
  )
}
