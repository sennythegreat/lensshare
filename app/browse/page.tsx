'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Camera, Check, Heart, LocateFixed, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import './browse.css'
import { bookingErrorMessage, checkAvailability, createBooking, fetchListings, fetchUnavailableListingIds } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { SiteHeadbar } from '@/components/site-headbar'
import { EmptyState, ErrorState, SectionSkeleton } from '@/components/states'
import { VerifyBanner } from '@/components/verify-banner'
import { initialsOf, rentalDays, type ListingWithOwner } from '@/lib/types'
import { distanceKm, formatDistance, pickupCoordinates, requestLocation, type LocationFix } from '@/lib/location'

const categories = ['All equipment', 'Cameras', 'Lenses', 'Lighting', 'Support', 'Audio']

function isoDate(offsetDays: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const date = new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(value.getTime())) return undefined
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

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
  const [userLocation, setUserLocation] = useState<LocationFix | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const locationRequest = useRef(0)
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set())
  const [availabilityOnly, setAvailabilityOnly] = useState(false)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityRange, setAvailabilityRange] = useState('')
  const [shootDescription, setShootDescription] = useState('')

  const dateError = !startDate || !endDate ? 'Choose both a pick-up and return date.'
    : !Number.isFinite(new Date(startDate).getTime()) || !Number.isFinite(new Date(endDate).getTime()) ? 'Choose valid rental dates.'
      : endDate <= startDate ? 'Return must be after pick-up.' : ''
  const datesInvalid = Boolean(dateError)
  const days = datesInvalid ? 0 : rentalDays(startDate, endDate)
  const returnMin = nextDate(startDate)
  const availabilityReady = !datesInvalid && !availabilityLoading && !availabilityError && availabilityRange === `${startDate}/${endDate}`

  function load() {
    setLoading(true)
    setLoadError('')
    fetchListings()
      .then((rows) => { setListings(rows); setLoading(false) })
      .catch((error) => { setLoadError(error instanceof Error ? error.message : 'Could not load listings.'); setLoading(false) })
  }
  useEffect(load, [])
  useEffect(() => () => { locationRequest.current += 1 }, [])
  useEffect(() => {
    if (datesInvalid) {
      setUnavailableIds(new Set())
      setAvailabilityLoading(false)
      setAvailabilityError('')
      setAvailabilityRange('')
      return
    }
    let cancelled = false
    setAvailabilityLoading(true)
    setAvailabilityError('')
    setAvailabilityRange('')
    fetchUnavailableListingIds(startDate, endDate)
      .then((ids) => {
        if (!cancelled) {
          setUnavailableIds(new Set(ids))
          setAvailabilityRange(`${startDate}/${endDate}`)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailableIds(new Set())
          setAvailabilityError('Calendar unavailable · checked when booking')
        }
      })
      .finally(() => { if (!cancelled) setAvailabilityLoading(false) })
    return () => { cancelled = true }
  }, [startDate, endDate, datesInvalid])

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

  const distances = useMemo(() => {
    const values = new Map<string, number>()
    if (userLocation) for (const item of listings) {
      const point = pickupCoordinates(item)
      if (point && item.pickup_address?.trim()) values.set(item.id, distanceKm(userLocation, point))
    }
    return values
  }, [listings, userLocation])

  const filtered = useMemo(() => listings.filter((item) => {
    const text = `${item.name} ${item.brand} ${item.category} ${item.owner?.full_name ?? ''} ${item.pickup_address ?? ''}`.toLowerCase()
    return (!query.trim() || text.includes(query.trim().toLowerCase()))
      && (category === 'All equipment' || item.category === category)
      && (brand === 'All brands' || item.brand === brand)
      && Number(item.daily_rate) <= rateCap
      && Number(item.rating) >= minRating
      && (!availabilityOnly || !availabilityReady || !unavailableIds.has(item.id))
  }).sort((a, b) => {
    if (sort === 'Nearest pickup' && userLocation) {
      const aDistance = distances.get(a.id) ?? Infinity
      const bDistance = distances.get(b.id) ?? Infinity
      if (aDistance !== bDistance) return aDistance - bDistance
    }
    const availabilityOrder = availabilityReady ? Number(unavailableIds.has(a.id)) - Number(unavailableIds.has(b.id)) : 0
    if (availabilityOrder) return availabilityOrder
    return sort === 'Price: low to high' ? a.daily_rate - b.daily_rate : sort === 'Price: high to low' ? b.daily_rate - a.daily_rate : b.rating - a.rating
  }), [listings, query, category, brand, sort, rateCap, minRating, availabilityOnly, unavailableIds, availabilityReady, distances, userLocation])

  const needsVerification = Boolean(user) && profile?.role === 'renter' && profile.verification_status !== 'verified'

  function resetFilters() {
    setCategory('All equipment')
    setBrand('All brands')
    setQuery('')
    setMaxRate(Number.POSITIVE_INFINITY)
    setMinRating(0)
    setAvailabilityOnly(false)
  }

  const dateRangeLabel = useMemo(() => {
    if (!startDate || !endDate) return 'selected dates'
    const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return `${fmt(startDate)}–${fmt(endDate)}`
  }, [startDate, endDate])

  async function useMyLocation() {
    const request = ++locationRequest.current
    setLocationBusy(true)
    setLocationError('')
    try {
      const location = await requestLocation()
      if (request !== locationRequest.current) return
      if (location.accuracy > 1000) {
        setLocationError('Your location is too approximate for nearby sorting. Try again or search a pickup area.')
        return
      }
      setUserLocation(location)
      setSort('Nearest pickup')
    } catch (error) {
      if (request === locationRequest.current) setLocationError(error instanceof Error ? error.message : 'Could not find your location. Search a pickup area instead.')
    } finally {
      if (request === locationRequest.current) setLocationBusy(false)
    }
  }

  function clearLocation() {
    locationRequest.current += 1
    setUserLocation(null)
    setLocationBusy(false)
    setLocationError('')
    if (sort === 'Nearest pickup') setSort('Most Popular in Naga')
  }

  function changeDate(kind: 'start' | 'end', value: string) {
    if (kind === 'start') setStartDate(value)
    else setEndDate(value)
    setBooked(false)
    setBookingError('')
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
    if (datesInvalid) { setBookingError(dateError); return }
    setBookingBusy(true)
    setBookingError('')
    try {
      const available = await checkAvailability(selected.id, startDate, endDate)
      if (!available) {
        setBookingError('Those dates are already booked for this gear. Please pick a different range.')
        setBookingBusy(false)
        return
      }
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
      setBookingError(bookingErrorMessage(error))
    } finally {
      setBookingBusy(false)
    }
  }

  return <main className="browse-page">
    <SiteHeadbar />
    <div className="browse-verify-wrap"><VerifyBanner /></div>
    <section className="browse-planner" aria-labelledby="browse-planner-title">
      <div className="browse-planner-top">
        <div className="browse-planner-heading"><p className="browse-planner-eyebrow">PLAN YOUR NEXT SHOOT</p><h1 id="browse-planner-title">Good gear. Closer to you.</h1><p>Choose your rental dates and find a pickup that works for you.</p></div>
        <div className="browse-planner-location">
          <span className="browse-planner-pin"><MapPin size={19} aria-hidden="true" /></span>
          <div className="browse-planner-location-copy"><b>{userLocation ? 'Using your location' : 'Pickup near you'}</b><span role="status">{userLocation ? `Approx. accuracy ±${Math.ceil(userLocation.accuracy)} m · not saved` : 'Each item has its own pickup point.'}</span></div>
          <div className="browse-planner-location-actions"><button className="browse-location-button" type="button" onClick={useMyLocation} disabled={locationBusy}><LocateFixed size={15} aria-hidden="true" />{locationBusy ? 'Locating…' : userLocation ? 'Update location' : 'Use my location'}</button>
          {(userLocation || locationBusy) && <button className="browse-location-clear" type="button" onClick={clearLocation} aria-label="Clear location"><X size={16} aria-hidden="true" /></button>}</div>
        </div>
      </div>
      <form className="browse-planner-form" onSubmit={(event) => { event.preventDefault(); document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' }) }}>
        <label className="browse-planner-query"><span className="browse-planner-label">Gear or pickup area</span><span className="browse-planner-query-input"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Gear or pickup area" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Camera, lens, brand or pickup address" /></span></label>
        <fieldset className="browse-planner-dates"><legend><span className="browse-planner-label">Rental dates</span><span className="browse-planner-duration" role="status">{datesInvalid ? 'Choose dates' : `${days} day${days === 1 ? '' : 's'}`}</span></legend><div className="browse-planner-date-pair"><label><span>Pick-up</span><input type="date" aria-label="Pick-up date" value={startDate} required onChange={(event) => changeDate('start', event.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-date-error' : undefined} /></label><span className="browse-planner-date-arrow"><ArrowRight size={16} aria-hidden="true" /></span><label><span>Return</span><input type="date" aria-label="Return date" value={endDate} required min={returnMin} onChange={(event) => changeDate('end', event.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-date-error' : undefined} /></label></div></fieldset>
        <button className="browse-planner-submit" type="submit">Find gear <ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <div className="browse-planner-footer"><span className="browse-planner-privacy">Location is optional. You can search an area instead.</span></div>
      {dateError && <p className="browse-planner-message error" id="browse-date-error" role="status">{dateError}</p>}
      {locationError && <p className="browse-planner-message error" role="status">{locationError}</p>}
      {userLocation && <p className="browse-planner-message" role="status">{distances.size ? 'Distances are approximate, not travel distances. Items without pickup coordinates appear after located items.' : 'No pickup coordinates have been added yet. You can still browse gear or search an address.'}</p>}
    </section>
    <div className="browse-layout" id="catalog">
      <aside className="filters">
        <div className="filter-title"><h2><SlidersHorizontal size={16} /> Filter equipment</h2><button className="reset" onClick={resetFilters}>Reset all</button></div>
        <label className="availability-toggle"><input type="checkbox" checked={availabilityOnly} disabled={!availabilityReady} onChange={(e) => setAvailabilityOnly(e.target.checked)} /><span><b>Available for my dates</b><small>{datesInvalid ? 'Choose a valid rental period' : availabilityLoading || (!availabilityError && !availabilityReady) ? 'Checking calendar…' : availabilityError || `${listings.filter((item) => !unavailableIds.has(item.id)).length} units clear · ${dateRangeLabel}`}</small></span></label>
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
            <h2>Local gear: <span>{filtered.length} Listings</span></h2>
            <p>All units include the automatic ₱100k LensCare™ co-op policy &amp; ₱0 deductible. Check each item’s pickup address and confirm hand-off details with the owner.</p>
          </div>
          <label className="sort">Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option>Most Popular in Naga</option><option>Price: low to high</option><option>Price: high to low</option><option disabled={!userLocation}>Nearest pickup</option></select></label>
        </div>
        {loading ? <SectionSkeleton rows={4} /> : loadError ? <ErrorState title="Could not load listings" hint={loadError} retry={load} /> : filtered.length ? filtered.map((item) => {
          const unavailable = availabilityReady && unavailableIds.has(item.id)
          const distance = distances.get(item.id)
          return <article className={`gear-result ${unavailable ? 'date-unavailable' : ''}`} key={item.id}>
          <div className="catalog-image"><span className={unavailable ? 'unavailable-badge' : ''}>{unavailable ? `BOOKED · ${dateRangeLabel}` : availabilityReady ? `AVAILABLE · ${dateRangeLabel}` : 'LISTED GEAR'}</span><button aria-label="Save listing" className={saved.includes(item.id) ? 'saved' : ''} onClick={() => toggleSaved(item.id)}><Heart size={16} fill={saved.includes(item.id) ? 'currentColor' : 'none'} /></button><img src={item.image_url || '/lensshare-camera.png'} alt={item.name} /></div>
          <div className="result-copy"><small>{item.brand}　★ {item.rating} <em>{item.owner?.full_name || 'Verified owner'}</em></small><h3>{item.name}</h3><p>▣ {item.specs}</p>{item.included && <p>▤ {item.included}</p>}<p><ShieldCheck size={13} /> ₱0 deductible · Student escrow covered</p><p className="browse-pickup-address"><MapPin size={13} aria-hidden="true" /><span>{item.pickup_address?.trim() || 'Confirm pickup point with owner'}{distance !== undefined && <em className="browse-pickup-distance">Approx. {formatDistance(distance)} to pickup</em>}</span></p>{unavailable && <p>Unavailable {dateRangeLabel}</p>}</div>
          <div className="rate-card"><small className="rate-tier">{tierOf(Number(item.daily_rate))}</small><strong>₱{Number(item.daily_rate).toLocaleString()}<em>/ day</em></strong><span>Owner rating ★ {item.rating}</span>{profile?.is_student && <span className="rate-student">STUDENT · DEPOSIT WAIVED</span>}<button disabled={unavailable} onClick={() => openDetails(item)}>{unavailable ? 'Booked for these dates' : 'Rent now'}</button><button className="secondary-action" onClick={() => openDetails(item)}>Quick details</button></div>
        </article>}) : <EmptyState icon={Camera} title="No gear matches these filters" hint="Try another category, brand, date range, or search term." action={<button onClick={resetFilters}>Clear filters</button>} />}
        <div className="pagination">Showing {filtered.length} verified local equipment units in Naga City</div>
      </section>
    </div>
    <section className="browse-benefits"><span><b>Maxim / Lalamove Hub Couriers</b><small>Coordinate delivery or a direct hand-off with the owner.</small></span><span><b>Zero Cash Deposit for Students</b><small>Validated student IDs qualify for deposit waiver.</small></span><span><b>Optical Sensor Guaranteed Clean</b><small>Every camera is inspected before pick-up.</small></span></section>
    <footer className="browse-footer"><div><span className="browse-brand"><span className="logo-mark"><img src="/lensshare-logo.png" alt="" /></span><strong>LensShare</strong></span><p>A peer-to-peer optical cooperative connecting creators across Naga City.</p></div><div><b>MARKETPLACE</b><span>Mirrorless bodies</span><span>Fast primes & zooms</span><span>Production lighting</span></div><div><b>TRUST & PROTOCOL</b><span>Peer verification</span><span>Sensor cleaning standards</span><span>Damage dispute support</span></div><div><b>LENScare coverage</b><span>₱100,000 replacement guarantee</span><span>Auto-activated on every rental</span></div></footer>
    {selected && <div className="detail-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Equipment details" onClick={(e) => e.stopPropagation()}><button className="close-modal" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button><img src={selected.image_url || '/lensshare-camera.png'} alt={selected.name} /><div className="detail-content"><p className="eyebrow">{selected.meta || selected.brand}</p><h2>{selected.name}</h2><p className="detail-price">₱{Number(selected.daily_rate).toLocaleString()}<small>/ day</small></p><p>{selected.specs}</p>{selected.included && <p>{selected.included}</p>}{selected.owner && <div className="detail-owner"><span>{initialsOf(selected.owner.full_name)}</span><div><b>{selected.owner.full_name}</b><small>Verified owner · ★ {selected.rating}</small></div></div>}<div className="browse-detail-pickup"><MapPin size={17} aria-hidden="true" /><div><b>Pickup point</b><span>{selected.pickup_address?.trim() || 'Confirm pickup point with owner'}</span>{distances.has(selected.id) && <small>Approx. {formatDistance(distances.get(selected.id)!)} to pickup · straight-line distance</small>}</div></div><label>Shoot description<textarea value={shootDescription} onChange={(e) => setShootDescription(e.target.value)} placeholder="Tell the owner what you are filming..." /></label><div className="detail-dates"><label>Pick-up date<input type="date" value={startDate} required disabled={bookingBusy} onChange={(e) => changeDate('start', e.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-detail-date-error' : undefined} /></label><label>Return date<input type="date" value={endDate} required min={returnMin} disabled={bookingBusy} onChange={(e) => changeDate('end', e.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-detail-date-error' : undefined} /></label></div>{dateError && <p className="browse-date-feedback" id="browse-detail-date-error" role="status">{dateError}</p>}{booked ? <div className="booking-success"><Check size={16} /> Booking request sent. The owner will confirm your hub handoff. <Link href="/renter/bookings">Track it in My Bookings →</Link></div> : needsVerification ? <div className="booking-verify"><ShieldCheck size={15} /><div><b>Identity verification required</b><span>Verify your government ID before your first rental — approvals usually take less than a day.</span><Link href="/renter/verification">Complete verification →</Link></div></div> : <button className="primary-booking" disabled={bookingBusy || datesInvalid} onClick={handleBooking}>{bookingBusy ? 'Sending request…' : datesInvalid ? 'Choose valid rental dates' : user ? `Request booking · ₱${(days * Number(selected.daily_rate)).toLocaleString()} (${days} day${days === 1 ? '' : 's'})` : 'Log in to request booking'}</button>}{bookingError && <p className="demo-note">{bookingError}</p>}</div></section></div>}
  </main>
}

function FilterGroup({ title, items, value, onChange, counts, allCount }: { title: string; items: string[]; value: string; onChange: (value: string) => void; counts?: Map<string, number>; allCount?: number }) {
  return <fieldset className="filter-group"><legend>{title}</legend>{items.map((item) => {
    const count = item === 'All equipment' || item === 'All brands' ? allCount : counts?.get(item)
    return <label key={item}><input type="radio" name={title} checked={value === item} onChange={() => onChange(item)} />{item}{count !== undefined && <b className="filter-count">{count}</b>}</label>
  })}</fieldset>
}
