'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, Check, Heart, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import './browse.css'
import { createBooking, fetchListings } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { SiteHeadbar } from '@/components/site-headbar'
import { initialsOf, rentalDays, type ListingWithOwner } from '@/lib/types'

const categories = ['All equipment', 'Cameras', 'Lenses', 'Lighting', 'Support', 'Audio']

function isoDate(offsetDays: number) { return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10) }

// Presentational rate tiers derived from the listing's own daily rate.
function tierOf(rate: number) {
  if (rate <= 350) return 'Essential tier'
  if (rate <= 550) return 'Standard tier'
  return 'Pro tier'
}

export default function BrowsePage() {
  const router = useRouter()
  const { user, profile } = useProfile()
  const [listings, setListings] = useState<ListingWithOwner[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All equipment')
  const [brand, setBrand] = useState('All brands')
  const [maxRate, setMaxRate] = useState(Number.POSITIVE_INFINITY)
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState('Most Popular in Naga')
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

  const rateBounds = useMemo(() => {
    if (!listings.length) return { min: 0, max: 1500 }
    const rates = listings.map((item) => Number(item.daily_rate))
    return { min: Math.min(...rates), max: Math.max(...rates) }
  }, [listings])
  const rateCap = Math.min(maxRate, rateBounds.max)

  const brands = useMemo(() => ['All brands', ...Array.from(new Set(listings.map((item) => item.brand)))], [listings])
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of listings) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    return counts
  }, [listings])
  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of listings) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1)
    return counts
  }, [listings])
  const ratingCounts = useMemo(() => ({
    four5: listings.filter((item) => Number(item.rating) >= 4.5).length,
    four0: listings.filter((item) => Number(item.rating) >= 4.0).length,
  }), [listings])

  const filtered = useMemo(() => listings.filter((item) => {
    const text = `${item.name} ${item.brand} ${item.category} ${item.owner?.full_name ?? ''}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase()))
      && (category === 'All equipment' || item.category === category)
      && (brand === 'All brands' || item.brand === brand)
      && Number(item.daily_rate) <= rateCap
      && Number(item.rating) >= minRating
  }).sort((a, b) => sort === 'Price: low to high' ? a.daily_rate - b.daily_rate : sort === 'Price: high to low' ? b.daily_rate - a.daily_rate : b.rating - a.rating), [listings, query, category, brand, sort, rateCap, minRating])

  const days = useMemo(() => (selected ? rentalDays(startDate, endDate) : 0), [selected, startDate, endDate])
  const datesInvalid = useMemo(() => new Date(endDate) <= new Date(startDate), [startDate, endDate])
  const needsVerification = Boolean(user) && profile?.role === 'renter' && profile.verification_status !== 'verified'

  function resetFilters() {
    setCategory('All equipment')
    setBrand('All brands')
    setQuery('')
    setMaxRate(Number.POSITIVE_INFINITY)
    setMinRating(0)
  }

  function toggleSaved(id: string) { setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }

  function openDetails(item: ListingWithOwner) {
    setSelected(item)
    setBooked(false)
    setBookingError('')
    setShootDescription('')
  }

  async function handleBooking() {
    if (!selected) return
    if (!user) { router.push('/login?redirect=%2Fbrowse'); return }
    if (profile?.role !== 'renter') { setBookingError('Only renter accounts can book gear. Switch your role from your workspace settings.'); return }
    if (profile.verification_status !== 'verified') { setBookingError('Identity verification is required before booking gear — upload your government ID in the Verification page.'); return }
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
      const message = error instanceof Error ? error.message : 'Booking failed. Please try again.'
      setBookingError(message.includes('row-level security') ? 'Identity verification is required before booking gear — complete it from the Verification page.' : message)
    } finally {
      setBookingBusy(false)
    }
  }

  return <main className="browse-page">
    <SiteHeadbar searchValue={query} onSearchChange={setQuery} />
    <section className="browse-pickup">
      <div className="pickup-field"><small>Pickup hub / local area</small><b>Naga City (Centro, Magsaysay, Pili)</b></div>
      <label className="pickup-field"><small>Pick-up date</small><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
      <label className="pickup-field"><small>Drop-off date</small><input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      <div className="pickup-field"><small>Hand-off time</small><b>09:00 AM (Morning call)</b></div>
      <button className="pickup-search" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}><Search size={14} /> Search gear</button>
    </section>
    <div className="browse-layout" id="catalog">
      <aside className="filters">
        <div className="filter-title"><h2><SlidersHorizontal size={16} /> Filter equipment</h2><button className="reset" onClick={resetFilters}>Reset all</button></div>
        <FilterGroup title="Gear type & category" items={categories} value={category} onChange={setCategory} counts={categoryCounts} allCount={listings.length} />
        <FilterGroup title="Brand" items={brands} value={brand} onChange={setBrand} counts={brandCounts} allCount={listings.length} />
        <div className="filter-group">
          <h3>Daily rate <b>₱{rateBounds.min} — ₱{rateBounds.max}</b></h3>
          <input type="range" min={rateBounds.min} max={rateBounds.max} step={50} value={rateCap} onChange={(e) => setMaxRate(Number(e.target.value))} />
          <span className="rate-caption">Showing up to <b>₱{rateCap}/day</b> · drag to cap the rate</span>
        </div>
        <fieldset className="filter-group">
          <legend>Lender rating</legend>
          {([
            [0, 'All ratings', listings.length],
            [4.5, '★ 4.5 & above', ratingCounts.four5],
            [4, '★ 4.0 & above', ratingCounts.four0],
          ] as const).map(([value, label, count]) => <label key={label}><input type="radio" name="rating" checked={minRating === value} onChange={() => setMinRating(value)} />{label}<b className="filter-count">{count}</b></label>)}
        </fieldset>
        <div className="filter-trust"><ShieldCheck size={16} /><div><b>LensCare protected</b><span>Every listed item includes ₱100,000 replacement coverage and ₱0 deductible.</span><span>Verified students rent with a deposit waiver.</span></div></div>
      </aside>
      <section className="results">
        <div className="results-heading">
          <div>
            <p className="eyebrow">VERIFIED LOCAL EQUIPMENT</p>
            <h2>Naga City Hub: <span>{filtered.length} Units Available</span></h2>
            <p>All units include the automatic ₱100k LensCare™ co-op policy &amp; ₱0 deductible. Handoffs at Centro, Magsaysay, and Pili partner points.</p>
          </div>
          <label className="sort">Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option>Most Popular in Naga</option><option>Price: low to high</option><option>Price: high to low</option></select></label>
        </div>
        {loading ? <div className="empty-state"><Camera size={28} /><h3>Loading verified gear…</h3></div> : loadError ? <div className="empty-state"><Camera size={28} /><h3>Could not load listings</h3><p>{loadError}</p><button onClick={load}>Retry</button></div> : filtered.length ? filtered.map((item) => <article className="gear-result" key={item.id}>
          <div className="catalog-image"><span>AVAILABLE TODAY</span><button aria-label="Save listing" className={saved.includes(item.id) ? 'saved' : ''} onClick={() => toggleSaved(item.id)}><Heart size={16} fill={saved.includes(item.id) ? 'currentColor' : 'none'} /></button><img src={item.image_url || '/lensshare-camera.png'} alt={item.name} /></div>
          <div className="result-copy"><small>{item.brand}　★ {item.rating} <em>{item.owner?.full_name || 'Verified owner'}</em></small><h3>{item.name}</h3><p>▣ {item.specs}</p>{item.included && <p>▤ {item.included}</p>}<p><ShieldCheck size={13} /> ₱0 deductible · Student escrow covered</p><p><MapPin size={13} /> Naga City Hub · handoff available</p></div>
          <div className="rate-card"><small className="rate-tier">{tierOf(Number(item.daily_rate))}</small><strong>₱{Number(item.daily_rate).toLocaleString()}<em>/ day</em></strong><span>Owner rating ★ {item.rating}</span>{profile?.is_student && <span className="rate-student">STUDENT · DEPOSIT WAIVED</span>}<button onClick={() => openDetails(item)}>Rent now</button><button className="secondary-action" onClick={() => openDetails(item)}>Quick details</button></div>
        </article>) : <div className="empty-state"><Camera size={28} /><h3>No gear matches these filters</h3><p>Try another category, brand, or search term.</p><button onClick={resetFilters}>Clear filters</button></div>}
        <div className="pagination">Showing {filtered.length} verified local equipment units in Naga City</div>
      </section>
    </div>
    <section className="browse-benefits"><span><b>Maxim / Lalamove Hub Couriers</b><small>Direct hand-off or safe dispatch from partner lockers.</small></span><span><b>Zero Cash Deposit for Students</b><small>Validated student IDs qualify for deposit waiver.</small></span><span><b>Optical Sensor Guaranteed Clean</b><small>Every camera is inspected before pick-up.</small></span></section>
    <footer className="browse-footer"><div><span className="browse-brand"><span className="logo-mark"><img src="/lensshare-logo.png" alt="" /></span><strong>LensShare</strong></span><p>A peer-to-peer optical cooperative connecting creators across Naga City.</p></div><div><b>MARKETPLACE</b><span>Mirrorless bodies</span><span>Fast primes & zooms</span><span>Production lighting</span></div><div><b>TRUST & PROTOCOL</b><span>Peer verification</span><span>Sensor cleaning standards</span><span>Damage dispute support</span></div><div><b>LENScare coverage</b><span>₱100,000 replacement guarantee</span><span>Auto-activated on every rental</span></div></footer>
    {selected && <div className="detail-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Equipment details" onClick={(e) => e.stopPropagation()}><button className="close-modal" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button><img src={selected.image_url || '/lensshare-camera.png'} alt={selected.name} /><div className="detail-content"><p className="eyebrow">{selected.meta || selected.brand}</p><h2>{selected.name}</h2><p className="detail-price">₱{Number(selected.daily_rate).toLocaleString()}<small>/ day</small></p><p>{selected.specs}</p>{selected.included && <p>{selected.included}</p>}{selected.owner && <div className="detail-owner"><span>{initialsOf(selected.owner.full_name)}</span><div><b>{selected.owner.full_name}</b><small>Verified owner · ★ {selected.rating}</small></div></div>}<label>Shoot description<textarea value={shootDescription} onChange={(e) => setShootDescription(e.target.value)} placeholder="Tell the owner what you are filming..." /></label><div className="detail-dates"><label>Start date<input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setBooked(false) }} /></label><label>Return date<input type="date" value={endDate} min={startDate} onChange={(e) => { setEndDate(e.target.value); setBooked(false) }} /></label></div>{booked ? <div className="booking-success"><Check size={16} /> Booking request sent. The owner will confirm your hub handoff. <Link href="/renter/bookings">Track it in My Bookings →</Link></div> : needsVerification ? <div className="booking-verify"><ShieldCheck size={15} /><div><b>Identity verification required</b><span>Verify your government ID before your first rental — approvals usually take less than a day.</span><Link href="/renter/verification">Complete verification →</Link></div></div> : <button className="primary-booking" disabled={bookingBusy} onClick={handleBooking}>{bookingBusy ? 'Sending request…' : user ? `Request booking · ₱${(days * Number(selected.daily_rate)).toLocaleString()} (${days} day${days === 1 ? '' : 's'})` : 'Log in to request booking'}</button>}{bookingError && <p className="demo-note">{bookingError}</p>}</div></section></div>}
  </main>
}

function FilterGroup({ title, items, value, onChange, counts, allCount }: { title: string; items: string[]; value: string; onChange: (value: string) => void; counts?: Map<string, number>; allCount?: number }) {
  return <fieldset className="filter-group"><legend>{title}</legend>{items.map((item) => {
    const count = item === 'All equipment' || item === 'All brands' ? allCount : counts?.get(item)
    return <label key={item}><input type="radio" name={title} checked={value === item} onChange={() => onChange(item)} />{item}{count !== undefined && <b className="filter-count">{count}</b>}</label>
  })}</fieldset>
}
