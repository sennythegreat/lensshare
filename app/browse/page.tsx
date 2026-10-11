'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Camera, Check, Heart, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import './browse.css'
import { createBooking, fetchListings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { initialsOf, rentalDays, type ListingWithOwner } from '@/lib/types'

const categories = ['All equipment', 'Cameras', 'Lenses', 'Lighting', 'Support', 'Audio']

function isoDate(offsetDays: number) { return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10) }
function prettyDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

export default function BrowsePage() {
  const router = useRouter()
  const { user, profile } = useProfile()
  const [listings, setListings] = useState<ListingWithOwner[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All equipment')
  const [brand, setBrand] = useState('All brands')
  const [sort, setSort] = useState('Popular')
  const [selected, setSelected] = useState<ListingWithOwner | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [booked, setBooked] = useState(false)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [startDate, setStartDate] = useState(() => isoDate(1))
  const [endDate, setEndDate] = useState(() => isoDate(4))
  const [shootDescription, setShootDescription] = useState('')

  function load() {
    setLoading(true)
    setLoadError('')
    fetchListings()
      .then((rows) => { setListings(rows); setLoading(false) })
      .catch((error) => { setLoadError(error instanceof Error ? error.message : 'Could not load listings.'); setLoading(false) })
  }
  useEffect(load, [])

  const brands = useMemo(() => ['All brands', ...Array.from(new Set(listings.map((item) => item.brand)))], [listings])
  const filtered = useMemo(() => listings.filter((item) => {
    const text = `${item.name} ${item.brand} ${item.category} ${item.owner?.full_name ?? ''}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (category === 'All equipment' || item.category === category) && (brand === 'All brands' || item.brand === brand)
  }).sort((a, b) => sort === 'Price: low to high' ? a.daily_rate - b.daily_rate : sort === 'Price: high to low' ? b.daily_rate - a.daily_rate : b.rating - a.rating), [listings, query, category, brand, sort])

  const days = useMemo(() => (selected ? rentalDays(startDate, endDate) : 0), [selected, startDate, endDate])
  const datesInvalid = useMemo(() => new Date(endDate) <= new Date(startDate), [startDate, endDate])

  function toggleSaved(id: string) { setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }

  function openDetails(item: ListingWithOwner) {
    setSelected(item)
    setBooked(false)
    setBookingError('')
    setShootDescription('')
    setStartDate(isoDate(1))
    setEndDate(isoDate(4))
  }

  async function handleBooking() {
    if (!selected) return
    if (!user) { router.push('/login?redirect=%2Fbrowse'); return }
    if (profile?.role !== 'renter') { setBookingError('Only renter accounts can book gear. Switch your role from your workspace settings.'); return }
    if (datesInvalid) { setBookingError('The return date must be after the start date.'); return }
    setBookingBusy(true)
    setBookingError('')
    try {
      await createBooking({
        listing_id: selected.id,
        renter_id: user.id,
        owner_id: selected.owner_id,
        start_date: startDate,
        end_date: endDate,
        days,
        total: days * Number(selected.daily_rate),
        shoot_description: shootDescription || null,
      })
      setBooked(true)
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Booking failed. Please try again.')
    } finally {
      setBookingBusy(false)
    }
  }

  return <main className="browse-page">
    <header className="browse-nav"><Link href="/" className="browse-brand"><span className="logo-mark"><img src="/lensshare-logo.png" alt="" /></span><strong>LensShare</strong><small>/ ARCHIVE<br />P2P OPTICAL CO-OP</small></Link><nav><Link className="active" href="/browse">Browse Equipment</Link><Link href="/renter/how-it-works">How It Works</Link><Link href="/renter/bookings">My Bookings</Link></nav><div className="browse-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search equipment or brand..." /></div><Link className="earn-button" href="/dashboard">+ List Gear / Earn</Link><div className="account"><span>{profile ? initialsOf(profile.full_name) : 'LS'}</span><div>{profile?.full_name || 'Guest'}<small>{profile ? 'VERIFIED RENTER' : 'Browsing as guest'}</small></div></div></header>
    <div className="browse-subnav"><span>Home / Bicol Hub Network / Naga City Region / <b>Browse Equipment</b></span><span>● {listings.length} Verified Gear Units Active　•　◉ LensCare coverage included</span></div>
    <section className="catalog-hero"><div><p className="eyebrow">NAGA CITY HUB · LOCAL CREATOR MARKETPLACE</p><h1>Find the Right Gear<br />for Your Next Shoot</h1><p>Rent camera equipment from local creators in Naga City. Compare verified kits, flexible daily rates, and handoff options through the designated hub.</p></div><div className="hub-note"><MapPin size={17} /><div><b>Naga City Hub</b><span>Handoff and returns coordinated at Centro, Magsaysay, and Pili partner points.</span></div></div></section>
    <section className="rental-bar"><label>Search equipment<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try Sony, Fujifilm, lens..." /></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>All equipment</option><option>Cameras</option><option>Lenses</option><option>Lighting</option><option>Support</option><option>Audio</option></select></label><label>Rental dates<strong><CalendarDays size={14} /> {prettyDate(startDate)} – {prettyDate(endDate)}</strong></label><button onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}><Search size={14} /> Search gear</button></section>
    <div className="browse-layout" id="catalog"><aside className="filters"><div className="filter-title"><h2><SlidersHorizontal size={16} /> Filter equipment</h2><button className="reset" onClick={() => { setCategory('All equipment'); setBrand('All brands'); setQuery('') }}>Reset</button></div><FilterGroup title="Category" items={categories} value={category} onChange={setCategory} /><FilterGroup title="Brand" items={brands} value={brand} onChange={setBrand} /><div className="filter-group"><h3>Daily rate <b>₱300 — ₱1,500</b></h3><input type="range" min="300" max="1500" defaultValue="900" /><small>Prices shown per rental day</small></div><div className="filter-trust"><ShieldCheck size={16} /><div><b>LensCare protected</b><span>Every listed item includes ₱100,000 replacement coverage.</span></div></div></aside>
      <section className="results"><div className="results-heading"><div><p className="eyebrow">VERIFIED LOCAL EQUIPMENT</p><h2>Naga City Hub: <span>{filtered.length} units available</span></h2><p>All units are checked by LensShare and include a clear handoff protocol.</p></div><label className="sort">Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option>Popular</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div>{loading ? <div className="empty-state"><Camera size={28} /><h3>Loading verified gear…</h3></div> : loadError ? <div className="empty-state"><Camera size={28} /><h3>Could not load listings</h3><p>{loadError}</p><button onClick={load}>Retry</button></div> : filtered.length ? filtered.map((item) => <article className="gear-result" key={item.id}><div className="catalog-image"><span>AVAILABLE TODAY</span><button aria-label="Save listing" className={saved.includes(item.id) ? 'saved' : ''} onClick={() => toggleSaved(item.id)}><Heart size={16} fill={saved.includes(item.id) ? 'currentColor' : 'none'} /></button><img src={item.image_url || '/lensshare-camera.png'} alt={item.name} /></div><div className="result-copy"><small>{item.meta || item.brand}　★ {item.rating} <em>{item.owner?.full_name || 'Verified owner'}</em></small><h3>{item.name}</h3><p>▣ {item.specs}</p>{item.included && <p>▤ {item.included}</p>}<p><ShieldCheck size={13} /> ₱0 deductible · Student escrow covered</p><p><MapPin size={13} /> Naga City Hub · handoff available</p></div><div className="rate-card"><small>{item.brand.toUpperCase()} RENTAL</small><strong>₱{Number(item.daily_rate).toLocaleString()}<em>/ day</em></strong><span>Owner rating ★ {item.rating}</span><button onClick={() => openDetails(item)}>View details</button><button className="secondary-action" onClick={() => openDetails(item)}>Rent now</button></div></article>) : <div className="empty-state"><Camera size={28} /><h3>No gear matches these filters</h3><p>Try another category, brand, or search term.</p><button onClick={() => { setCategory('All equipment'); setBrand('All brands'); setQuery('') }}>Clear filters</button></div>}<div className="pagination">Showing {filtered.length} verified local equipment units in Naga City</div></section></div>
    <section className="browse-benefits"><span><b>Maxim / Lalamove Hub Couriers</b><small>Direct hand-off or safe dispatch from partner lockers.</small></span><span><b>Zero Cash Deposit for Students</b><small>Validated student IDs qualify for deposit waiver.</small></span><span><b>Optical Sensor Guaranteed Clean</b><small>Every camera is inspected before pick-up.</small></span></section>
    <footer className="browse-footer"><div><span className="browse-brand"><span className="logo-mark"><img src="/lensshare-logo.png" alt="" /></span><strong>LensShare</strong></span><p>A peer-to-peer optical cooperative connecting creators across Naga City.</p></div><div><b>MARKETPLACE</b><span>Mirrorless bodies</span><span>Fast primes & zooms</span><span>Production lighting</span></div><div><b>TRUST & PROTOCOL</b><span>Peer verification</span><span>Sensor cleaning standards</span><span>Damage dispute support</span></div><div><b>LENScare coverage</b><span>₱100,000 replacement guarantee</span><span>Auto-activated on every rental</span></div></footer>
    {selected && <div className="detail-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Equipment details" onClick={(e) => e.stopPropagation()}><button className="close-modal" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button><img src={selected.image_url || '/lensshare-camera.png'} alt={selected.name} /><div className="detail-content"><p className="eyebrow">{selected.meta || selected.brand}</p><h2>{selected.name}</h2><p className="detail-price">₱{Number(selected.daily_rate).toLocaleString()}<small>/ day</small></p><p>{selected.specs}</p>{selected.included && <p>{selected.included}</p>}{selected.owner && <div className="detail-owner"><span>{initialsOf(selected.owner.full_name)}</span><div><b>{selected.owner.full_name}</b><small>Verified owner · ★ {selected.rating}</small></div></div>}<label>Shoot description<textarea value={shootDescription} onChange={(e) => setShootDescription(e.target.value)} placeholder="Tell the owner what you are filming..." /></label><div className="detail-dates"><label>Start date<input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setBooked(false) }} /></label><label>Return date<input type="date" value={endDate} min={startDate} onChange={(e) => { setEndDate(e.target.value); setBooked(false) }} /></label></div>{booked ? <div className="booking-success"><Check size={16} /> Booking request sent. The owner will confirm your hub handoff. <Link href="/renter/bookings">Track it in My Bookings →</Link></div> : <button className="primary-booking" disabled={bookingBusy} onClick={handleBooking}>{bookingBusy ? 'Sending request…' : user ? `Request booking · ₱${(days * Number(selected.daily_rate)).toLocaleString()} (${days} day${days === 1 ? '' : 's'})` : 'Log in to request booking'}</button>}{bookingError && <p className="demo-note">{bookingError}</p>}</div></section></div>}
  </main>
}

function FilterGroup({ title, items, value, onChange }: { title: string; items: string[]; value: string; onChange: (value: string) => void }) { return <fieldset className="filter-group"><legend>{title}</legend>{items.map((item) => <label key={item}><input type="radio" name={title} checked={value === item} onChange={() => onChange(item)} />{item}</label>)}</fieldset> }
