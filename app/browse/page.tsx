'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Check, Heart, LocateFixed, MapPin, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import './browse.css'
import { bookingErrorMessage, checkAvailability, createBooking, fetchHubDepositDefault, fetchListings, fetchUnavailableListingIds, quoteBooking } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { SiteHeadbar } from '@/components/site-headbar'
import { EmptyState, ErrorState, SectionSkeleton } from '@/components/states'
import { VerifyBanner } from '@/components/verify-banner'
import { useToast } from '@/components/toast'
import { availabilityArea, initialsOf, listingPhotos, ownerVerificationLabel, pesos, rentalDays, type BookingQuote, type ListingWithOwner } from '@/lib/types'
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
  const toast = useToast()
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
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [detailStep, setDetailStep] = useState<'details' | 'booking'>('details')
  const [quoteAttempt, setQuoteAttempt] = useState(0)
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
  const [bookingQuote, setBookingQuote] = useState<BookingQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [hubDeposit, setHubDeposit] = useState(2000)

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
    if (new URLSearchParams(window.location.search).has('dialog-preview')) {
      const preview: ListingWithOwner = {
        id: 'dialog-preview',
        owner_id: 'preview-owner',
        name: 'RØDE Wireless PRO',
        brand: 'RØDE',
        category: 'Audio',
        meta: 'DUAL-CHANNEL WIRELESS MICROPHONE',
        specs: '32-bit float onboard recording, timecode sync, intelligent GainAssist, and up to 260 m line-of-sight range.',
        included: '2 transmitters, receiver, charging case, lavalier microphones, windscreens, cables, and carry pouch.',
        description: 'A complete wireless audio kit for interviews, documentaries, events, and two-person creator shoots.',
        daily_rate: 350,
        security_deposit: null,
        image_url: '/lensshare-camera.png',
        image_urls: ['/lensshare-camera.png'],
        pickup_address: 'Naga City, Camarines Sur',
        pickup_latitude: null,
        pickup_longitude: null,
        status: 'available',
        rating: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner: { id: 'preview-owner', full_name: 'Mark Anthony Cruz', verification_status: 'unverified' },
      }
      setListings([preview])
      setSelected(preview)
      setLoading(false)
      return
    }
    fetchListings()
      .then((rows) => { setListings(rows); setLoading(false) })
      .catch((error) => { setLoadError(error instanceof Error ? error.message : 'Could not load listings.'); setLoading(false) })
  }
  useEffect(load, [])
  useEffect(() => {
    fetchHubDepositDefault().then(setHubDeposit).catch(() => setHubDeposit(2000))
  }, [])
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

  useEffect(() => {
    if (!selected || datesInvalid || !user || profile?.role !== 'renter' || profile.verification_status !== 'verified') {
      setBookingQuote(null)
      setQuoteLoading(false)
      setQuoteError('')
      return
    }
    let cancelled = false
    setQuoteLoading(true)
    setQuoteError('')
    quoteBooking(selected.id, startDate, endDate)
      .then((value) => { if (!cancelled) setBookingQuote(value) })
      .catch((error) => {
        if (!cancelled) {
          setBookingQuote(null)
          setQuoteError(error instanceof Error ? error.message : 'Could not calculate the booking total.')
        }
      })
      .finally(() => { if (!cancelled) setQuoteLoading(false) })
    return () => { cancelled = true }
  }, [selected, startDate, endDate, datesInvalid, user, profile, quoteAttempt])

  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selected])

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
    if (sort === 'Nearest area' && userLocation) {
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
        setLocationError('Your location is too approximate for nearby sorting. Try again or search an availability area.')
        return
      }
      setUserLocation(location)
      setSort('Nearest area')
    } catch (error) {
      if (request === locationRequest.current) setLocationError(error instanceof Error ? error.message : 'Could not find your location. Search an availability area instead.')
    } finally {
      if (request === locationRequest.current) setLocationBusy(false)
    }
  }

  function clearLocation() {
    locationRequest.current += 1
    setUserLocation(null)
    setLocationBusy(false)
    setLocationError('')
    if (sort === 'Nearest area') setSort('Most Popular in Naga')
  }

  function changeDate(kind: 'start' | 'end', value: string) {
    if (kind === 'start') setStartDate(value)
    else setEndDate(value)
    setBooked(false)
    setBookingError('')
    setBookingQuote(null)
    setQuoteError('')
  }

  function toggleSaved(id: string) { setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }

  function openDetails(item: ListingWithOwner) {
    setSelected(item)
    setSelectedPhoto(0)
    setDetailStep('details')
    setQuoteAttempt(0)
    setBooked(false)
    setBookingError('')
    setBookingQuote(null)
    setQuoteError('')
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
      const booking = await createBooking({
        listing_id: selected.id,
        start_date: startDate,
        end_date: endDate,
        expected_daily_rate: Number(selected.daily_rate),
        shoot_description: shootDescription || null,
      })
      setBookingQuote((current) => current ? {
        ...current,
        daily_rate: Number(booking.daily_rate_snapshot ?? current.daily_rate),
        days: booking.days,
        subtotal: Number(booking.subtotal),
        discount_amount: Number(booking.discount_amount),
        total: Number(booking.total),
        promo_pass_id: booking.promo_pass_id,
      } : current)
      setBooked(true)
      toast.success('Booking request sent — the owner has been notified.')
    } catch (error) {
      setBookingError(bookingErrorMessage(error))
      toast.error(bookingErrorMessage(error))
    } finally {
      setBookingBusy(false)
    }
  }

  const selectedPhotos = selected ? listingPhotos(selected) : []
  const activeSelectedPhoto = selectedPhotos[selectedPhoto] || selected?.image_url || '/lensshare-camera.png'
  const fallbackSubtotal = selected && !datesInvalid ? days * Number(selected.daily_rate) : 0
  const quotedSubtotal = bookingQuote ? Number(bookingQuote.subtotal) : fallbackSubtotal
  const quotedDiscount = bookingQuote ? Number(bookingQuote.discount_amount) : 0
  const quotedTotal = bookingQuote ? Number(bookingQuote.total) : fallbackSubtotal
  const quotedDeposit = selected ? Number(selected.security_deposit ?? hubDeposit) : null
  const quoteReason = bookingQuote?.eligibility_reason
  const quoteRequired = Boolean(user) && profile?.role === 'renter' && profile.verification_status === 'verified' && !datesInvalid
  const quoteUnavailable = quoteRequired && !quoteLoading && !bookingQuote

  return <main className="browse-page">
    <SiteHeadbar />
    <div className="browse-verify-wrap"><VerifyBanner /></div>
    <section className="browse-planner" aria-labelledby="browse-planner-title">
      <div className="browse-planner-top">
        <div className="browse-planner-heading"><p className="browse-planner-eyebrow">PLAN YOUR NEXT SHOOT</p><h1 id="browse-planner-title">Good gear. Closer to you.</h1><p>Choose your rental dates and find gear available in an area that works for you.</p></div>
        <div className="browse-planner-location">
          <span className="browse-planner-pin"><MapPin size={19} aria-hidden="true" /></span>
          <div className="browse-planner-location-copy"><b>{userLocation ? 'Using your location' : 'Gear near you'}</b><span role="status">{userLocation ? `Approx. accuracy ±${Math.ceil(userLocation.accuracy)} m · not saved` : 'Owners may share a broad availability area.'}</span></div>
          <div className="browse-planner-location-actions"><button className="browse-location-button" type="button" onClick={useMyLocation} disabled={locationBusy}><LocateFixed size={15} aria-hidden="true" />{locationBusy ? 'Locating…' : userLocation ? 'Update location' : 'Use my location'}</button>
          {(userLocation || locationBusy) && <button className="browse-location-clear" type="button" onClick={clearLocation} aria-label="Clear location"><X size={16} aria-hidden="true" /></button>}</div>
        </div>
      </div>
      <form className="browse-planner-form" onSubmit={(event) => { event.preventDefault(); document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' }) }}>
        <label className="browse-planner-query"><span className="browse-planner-label">Gear or availability area</span><span className="browse-planner-query-input"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Gear or availability area" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Camera, brand, city or town" /></span></label>
        <fieldset className="browse-planner-dates"><legend><span className="browse-planner-label">Rental dates</span><span className="browse-planner-duration" role="status">{datesInvalid ? 'Choose dates' : `${days} day${days === 1 ? '' : 's'}`}</span></legend><div className="browse-planner-date-pair"><label><span>Pick-up</span><input type="date" aria-label="Pick-up date" value={startDate} required onChange={(event) => changeDate('start', event.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-date-error' : undefined} /></label><span className="browse-planner-date-arrow"><ArrowRight size={16} aria-hidden="true" /></span><label><span>Return</span><input type="date" aria-label="Return date" value={endDate} required min={returnMin} onChange={(event) => changeDate('end', event.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-date-error' : undefined} /></label></div></fieldset>
        <button className="browse-planner-submit" type="submit">Find gear <ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <div className="browse-planner-footer"><span className="browse-planner-privacy">Location is optional. You can search an area instead.</span></div>
      {dateError && <p className="browse-planner-message error" id="browse-date-error" role="status">{dateError}</p>}
      {locationError && <p className="browse-planner-message error" role="status">{locationError}</p>}
      {userLocation && <p className="browse-planner-message" role="status">{distances.size ? 'Distances use approximate area points, not exact addresses or travel distance. Items without coordinates appear after located items.' : 'No approximate coordinates have been added yet. You can still browse gear or search a city or municipality.'}</p>}
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
        <div className="filter-trust"><ShieldCheck size={16} /><div><b>Verified booking flow</b><span>Identity-verified renters can send booking requests.</span><span>Approved student status makes each booking eligible for a deposit waiver.</span></div></div>
      </aside>
      <section className="results">
        <div className="results-heading">
          <div>
            <p className="eyebrow">VERIFIED LOCAL EQUIPMENT</p>
            <h2>Local gear: <span>{filtered.length} Listings</span></h2>
            <p>Browse owner-listed gear and check availability for your dates. Approved rentals are handed off and returned at the configured Naga City Hub.</p>
          </div>
          <label className="sort">Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option>Most Popular in Naga</option><option>Price: low to high</option><option>Price: high to low</option><option disabled={!userLocation}>Nearest area</option></select></label>
        </div>
        {loading ? <SectionSkeleton rows={4} /> : loadError ? <ErrorState title="Could not load listings" hint={loadError} retry={load} /> : filtered.length ? filtered.map((item) => {
          const unavailable = availabilityReady && unavailableIds.has(item.id)
          const distance = distances.get(item.id)
          return <article className={`gear-result ${unavailable ? 'date-unavailable' : ''}`} key={item.id}>
          <div className="catalog-image"><span className={unavailable ? 'unavailable-badge' : ''}>{unavailable ? `BOOKED · ${dateRangeLabel}` : availabilityReady ? `AVAILABLE · ${dateRangeLabel}` : 'LISTED GEAR'}</span><button aria-label="Save listing" className={saved.includes(item.id) ? 'saved' : ''} onClick={() => toggleSaved(item.id)}><Heart size={16} fill={saved.includes(item.id) ? 'currentColor' : 'none'} /></button><img src={listingPhotos(item)[0] || '/lensshare-camera.png'} alt={item.name} /></div>
          <div className="result-copy"><small>{item.brand}　★ {item.rating} <em>{item.owner?.full_name || 'Owner'}</em></small><h3>{item.name}</h3>{(item.specs || item.description) && <p>▣ {item.specs || item.description}</p>}{item.included && <p>▤ {item.included}</p>}<p><ShieldCheck size={13} /> Verified booking · Hub handoff</p><p className="browse-pickup-address"><MapPin size={13} aria-hidden="true" /><span>{item.pickup_address?.trim() ? `Available in ${item.pickup_address.trim()}` : 'Availability area not added'}{distance !== undefined && <em className="browse-pickup-distance">Approx. {formatDistance(distance)} away</em>}</span></p>{unavailable && <p>Unavailable {dateRangeLabel}</p>}</div>
          <div className="rate-card"><small className="rate-tier">{tierOf(Number(item.daily_rate))}</small><strong>₱{Number(item.daily_rate).toLocaleString()}<em>/ day</em></strong><span>Owner rating ★ {item.rating}</span>{profile?.is_student && <span className="rate-student">STUDENT · WAIVER ELIGIBLE</span>}<button disabled={unavailable} onClick={() => openDetails(item)}>{unavailable ? 'Booked for these dates' : 'Rent now'}</button><button className="secondary-action" onClick={() => openDetails(item)}>Quick details</button></div>
        </article>}) : <EmptyState icon={Camera} title="No gear matches these filters" hint="Try another category, brand, date range, or search term." action={<button onClick={resetFilters}>Clear filters</button>} />}
        <div className="pagination">Showing {filtered.length} verified local equipment units in Naga City</div>
      </section>
    </div>
    <section className="browse-benefits"><span><b>Configured Naga City Hub</b><small>Approved rentals use the designated hub for handoff and return.</small></span><span><b>Student Deposit Waiver Eligibility</b><small>Approved student status is checked for each booking.</small></span><span><b>Clear Booking Totals</b><small>See the rental total and any Saver Pass discount before requesting.</small></span></section>
    <footer className="browse-footer"><div><span className="browse-brand"><span className="logo-mark"><img src="/lensshare-logo.png" alt="" /></span><strong>LensShare</strong></span><p>A peer-to-peer optical cooperative connecting creators across Naga City.</p></div><div><b>MARKETPLACE</b><span>Mirrorless bodies</span><span>Fast primes & zooms</span><span>Production lighting</span></div><div><b>TRUST & PROTOCOL</b><span>Identity verification</span><span>Booking checklists</span><span>Configured hub handoffs</span></div><div><b>PAYMENT PROCESS</b><span>Manual GCash deposit proof</span><span>Booking status tracked in-app</span></div></footer>
    {selected && <div className="detail-backdrop" role="presentation" onClick={() => setSelected(null)}>
      <section className={`detail-modal detail-step-${detailStep}`} role="dialog" aria-modal="true" aria-label={`${selected.name} equipment details`} onClick={(event) => event.stopPropagation()}>
        <button className="close-modal" type="button" onClick={() => setSelected(null)} aria-label="Close equipment details"><X size={18} /></button>

        <div className="browse-detail-gallery">
          <div className="browse-detail-photo">
            <img src={activeSelectedPhoto} alt={`${selected.name} photo ${selectedPhoto + 1}`} />
            <span>{selected.category} · {selectedPhotos.length || 1} photo{selectedPhotos.length === 1 ? '' : 's'}</span>
          </div>
          {selectedPhotos.length > 1 && <div className="browse-detail-thumbs">{selectedPhotos.map((photo, index) => <button className={selectedPhoto === index ? 'selected' : ''} type="button" key={photo} onClick={() => setSelectedPhoto(index)} aria-label={`View photo ${index + 1}`}><img src={photo} alt="" /></button>)}</div>}
        </div>

        <div className="detail-information">
          <header className="detail-heading">
            <p className="eyebrow">{selected.meta || `${selected.brand} · ${tierOf(Number(selected.daily_rate))}`}</p>
            <h2>{selected.name}</h2>
            <p className="detail-price">{pesos(Number(selected.daily_rate))}<small>/ day</small></p>
          </header>

          <dl className="detail-facts">
            <div><dt>Brand</dt><dd>{selected.brand}</dd></div>
            <div><dt>Category</dt><dd>{selected.category}</dd></div>
          </dl>

          {(selected.description || selected.specs || selected.included) && <div className="detail-copy-grid">
            {selected.description && <section><b>Overview</b><p>{selected.description}</p></section>}
            {selected.specs && <section><b>Specifications</b><p>{selected.specs}</p></section>}
            {selected.included && <section><b>Included in the kit</b><p>{selected.included}</p></section>}
          </div>}

          <div className="detail-owner">
            <span>{initialsOf(selected.owner?.full_name || 'LensShare owner')}</span>
            <div><b>{selected.owner?.full_name || 'LensShare owner'}</b><small>{selected.owner ? ownerVerificationLabel(selected.owner) : 'Owner profile'} · ★ {selected.rating}</small></div>
          </div>

          <div className="browse-detail-pickup"><MapPin size={17} aria-hidden="true" /><div><b>Availability area</b><span>{availabilityArea(selected)}</span>{distances.has(selected.id) && <small>Approx. {formatDistance(distances.get(selected.id)!)} away · based on a rounded area point</small>}<small>Handoff and return take place at the configured Naga City Hub after approval.</small></div></div>

          <button className="detail-continue" type="button" onClick={() => setDetailStep('booking')}>Continue to booking <ArrowRight size={15} /></button>
        </div>

        <div className="detail-booking-panel">
          <div className="detail-stepbar"><button type="button" onClick={() => setDetailStep('details')}><ArrowLeft size={14} /> Back to details</button><span>{selected.name}</span></div>
          <div className="detail-booking-summary"><img src={activeSelectedPhoto} alt="" /><div><small>{selected.brand} · {selected.category}</small><b>{selected.name}</b><span>{pesos(Number(selected.daily_rate))} / day · {days} day{days === 1 ? '' : 's'}</span></div></div>
          <div className="detail-form-head"><p className="eyebrow">REQUEST THIS EQUIPMENT</p><b>Booking request</b><span>Choose your dates and tell the owner what you are filming. Every request is reviewed before approval.</span></div>

          <label className="detail-shoot-label">Shoot description<textarea value={shootDescription} onChange={(event) => setShootDescription(event.target.value)} placeholder="Tell the owner what you are filming..." /></label>
          <div className="detail-dates"><label>Pick-up date<input type="date" value={startDate} required disabled={bookingBusy} onChange={(event) => changeDate('start', event.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-detail-date-error' : undefined} /></label><label>Return date<input type="date" value={endDate} required min={returnMin} disabled={bookingBusy} onChange={(event) => changeDate('end', event.target.value)} aria-invalid={datesInvalid} aria-describedby={dateError ? 'browse-detail-date-error' : undefined} /></label></div>
          {dateError && <p className="browse-date-feedback" id="browse-detail-date-error" role="status">{dateError}</p>}

          {user && profile?.role === 'renter' && profile.verification_status === 'verified' && !datesInvalid && <div className={`browse-price-breakdown ${quoteUnavailable ? 'unconfirmed' : ''}`} aria-live="polite">
            {quoteLoading ? <p className="browse-quote-state">Calculating and confirming your booking total…</p> : <>
              <div><span>{bookingQuote ? 'Rental subtotal' : 'Estimated rental subtotal'}</span><b>{pesos(quotedSubtotal)}</b></div>
              {quotedDiscount > 0 && <div className="discount"><span>30-Day Saver Pass · 5%</span><b>− {pesos(quotedDiscount)}</b></div>}
              <div className="total"><span>{bookingQuote ? 'Booking total' : 'Estimated rental total'}</span><b>{pesos(quotedTotal)}</b></div>
              {quotedDeposit !== null && <div className="deposit"><span>Refundable security deposit <small>{selected.security_deposit == null ? 'Hub default' : 'Set for this item'}</small></span><b>{pesos(quotedDeposit)}</b></div>}
              {quotedDeposit !== null && <p className="browse-pass-note">Paid separately via GCash after owner approval and refundable after return. Waived for verified students; Saver Pass does not cover it.</p>}
              {quoteReason === 'applied' && <p className="browse-pass-note applied">Saver Pass applied to the rental total. {pesos(Number(bookingQuote?.remaining_cap ?? 0))} remains before this reservation.</p>}
              {quoteReason === 'outside_pass_window' && <p className="browse-pass-note">Your active pass does not cover this complete rental period. <Link href="/renter/saver-pass">View pass dates</Link></p>}
              {quoteReason === 'discount_cap_reached' && <p className="browse-pass-note">Your Saver Pass discount cap has been reached. <Link href="/renter/saver-pass">View pass</Link></p>}
              {quoteReason === 'no_active_pass' && <p className="browse-pass-note">No active Saver Pass. <Link href="/renter/saver-pass">Save 5% with a ₱99 pass</Link></p>}
              {quoteError && <div className="browse-quote-error" role="alert"><AlertCircle size={16} /><div><b>Total not confirmed</b><span>{quoteError}</span></div><button type="button" onClick={() => setQuoteAttempt((attempt) => attempt + 1)}><RefreshCw size={13} /> Retry</button></div>}
            </>}
          </div>}

          {booked ? <div className="booking-success"><Check size={16} /> Booking request sent. The displayed amount is a booking value, not money held in escrow. If approved, follow the manual deposit and configured hub instructions in My Bookings. <Link href="/renter/bookings">Track it in My Bookings →</Link></div> : needsVerification ? <div className="booking-verify"><ShieldCheck size={15} /><div><b>Identity verification required</b><span>Verify your government ID before your first rental — approvals usually take less than a day.</span><Link href="/renter/verification">Complete verification →</Link></div></div> : <button className="primary-booking" disabled={bookingBusy || datesInvalid || (Boolean(user) && profile?.role === 'renter' && profile.verification_status === 'verified' && (quoteLoading || !bookingQuote))} onClick={handleBooking}>{bookingBusy ? 'Sending request…' : quoteLoading ? 'Calculating total…' : datesInvalid ? 'Choose valid rental dates' : quoteUnavailable ? 'Total unavailable — retry quote' : user ? `Request booking · ${pesos(quotedTotal)} (${days} day${days === 1 ? '' : 's'})` : 'Log in to request booking'}</button>}
          {bookingError && <p className="demo-note detail-booking-error" role="alert">{bookingError}</p>}
        </div>
      </section>
    </div>}
  </main>
}

function FilterGroup({ title, items, value, onChange, counts, allCount }: { title: string; items: string[]; value: string; onChange: (value: string) => void; counts?: Map<string, number>; allCount?: number }) {
  return <fieldset className="filter-group"><legend>{title}</legend>{items.map((item) => {
    const count = item === 'All equipment' || item === 'All brands' ? allCount : counts?.get(item)
    return <label key={item}><input type="radio" name={title} checked={value === item} onChange={() => onChange(item)} />{item}{count !== undefined && <b className="filter-count">{count}</b>}</label>
  })}</fieldset>
}
