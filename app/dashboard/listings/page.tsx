'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Check, LocateFixed, MapPin } from 'lucide-react'
import { OwnerShell, GearCard, PageCard, OwnerHeading } from '@/components/owner-shell'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { fetchOwnerListings, insertListing, setListingStatus, updateListing, uploadGearPhoto, type NewListing } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { Listing, ListingCategory } from '@/lib/types'
import { pickupCoordinates, requestLocation, validCoordinates, type Coordinates, type LocationFix } from '@/lib/location'

const CATEGORIES: ListingCategory[] = ['Cameras', 'Lenses', 'Lighting', 'Support', 'Audio']

function brandModelOf(listing: Listing) {
  const prefix = `${listing.category.toUpperCase()} · `
  return listing.meta?.startsWith(prefix) ? listing.meta.slice(prefix.length) : listing.brand
}

export default function ListingsPage() {
  const { user, loading } = useProfile()
  const [listings, setListings] = useState<Listing[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Listing | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [category, setCategory] = useState<ListingCategory>('Cameras')
  const [rate, setRate] = useState('')
  const [description, setDescription] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupPoint, setPickupPoint] = useState<Coordinates | null>(null)
  const [locationCandidate, setLocationCandidate] = useState<LocationFix | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const locationRequest = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')

  useEffect(() => {
    if (!user) return
    fetchOwnerListings(user.id).then(setListings).catch((e) => setError(e instanceof Error ? e.message : 'Could not load listings.'))
  }, [user])

  useEffect(() => () => { locationRequest.current += 1 }, [])
  useEffect(() => {
    if (!showForm) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) resetForm() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [showForm, busy])

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function resetForm() {
    locationRequest.current += 1
    setShowForm(false)
    setEditing(null)
    setPhotoPreview('')
    setPhotoFile(null)
    setName(''); setBrandModel(''); setCategory('Cameras'); setRate(''); setDescription('')
    setPickupAddress(''); setPickupPoint(null); setLocationCandidate(null)
    setLocationBusy(false); setLocationError(''); setError('')
  }

  function openForm(listing: Listing | null = null) {
    if (busy) return
    resetForm()
    setSavedNote('')
    if (listing) {
      setEditing(listing)
      setName(listing.name)
      setBrandModel(brandModelOf(listing))
      setCategory(listing.category)
      setRate(String(listing.daily_rate))
      setDescription(listing.description ?? '')
      setPhotoPreview(listing.image_url ?? '')
      setPickupAddress(listing.pickup_address ?? '')
      setPickupPoint(pickupCoordinates(listing))
    }
    setShowForm(true)
  }

  function clearPickupPoint() {
    locationRequest.current += 1
    setPickupPoint(null)
    setLocationCandidate(null)
    setLocationBusy(false)
    setLocationError('')
  }

  function changePickupAddress(value: string) {
    setPickupAddress(value)
    clearPickupPoint()
    setError('')
  }

  async function capturePickupPoint() {
    const request = ++locationRequest.current
    setLocationBusy(true)
    setLocationCandidate(null)
    setLocationError('')
    try {
      const fix = await requestLocation()
      if (request !== locationRequest.current) return
      if (fix.accuracy > 1000) {
        setLocationError('This location is too approximate to use as a pickup point. Try again while at the meeting point, or keep an address-only listing.')
        return
      }
      setLocationCandidate(fix)
    } catch (error) {
      if (request === locationRequest.current) setLocationError(error instanceof Error ? error.message : 'Could not find the pickup location.')
    } finally {
      if (request === locationRequest.current) setLocationBusy(false)
    }
  }

  function confirmPickupPoint() {
    if (!locationCandidate || !pickupAddress.trim()) return
    setPickupPoint({ latitude: locationCandidate.latitude, longitude: locationCandidate.longitude })
    setLocationCandidate(null)
    setLocationError('')
  }

  async function handleSave() {
    if (!user || busy) return
    const dailyRate = Number(rate)
    if (!name.trim() || !brandModel.trim() || !Number.isFinite(dailyRate) || dailyRate <= 0) {
      setError('Fill in the equipment name, brand, and a daily rate above zero.')
      return
    }
    if (locationBusy || locationCandidate) {
      setError('Confirm or discard the captured pickup point before saving.')
      return
    }
    if (pickupPoint && (!pickupAddress.trim() || !validCoordinates(pickupPoint.latitude, pickupPoint.longitude))) {
      setError('A confirmed pickup point needs a public address and valid coordinates.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const imageUrl = photoFile ? await uploadGearPhoto(user.id, photoFile) : undefined
      const brandChanged = !editing || brandModel.trim() !== brandModelOf(editing) || category !== editing.category
      const values: NewListing = {
        name: name.trim(),
        brand: editing && !brandChanged ? editing.brand : brandModel.split('·')[0].trim() || 'Various',
        category,
        daily_rate: dailyRate,
        description: description.trim() || null,
        ...(brandChanged ? { meta: `${category.toUpperCase()} · ${brandModel.trim()}` } : {}),
        ...(imageUrl ? { image_url: imageUrl } : {}),
        pickup_address: pickupAddress.trim() || null,
        pickup_latitude: pickupPoint?.latitude ?? null,
        pickup_longitude: pickupPoint?.longitude ?? null,
      }
      const saved = editing ? await updateListing(editing.id, user.id, values) : await insertListing(user.id, values)
      setListings((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
      setSavedNote(editing ? `“${saved.name}” has been updated.` : `“${saved.name}” is live on the marketplace.`)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving the listing failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(listing: Listing) {
    const next = listing.status === 'available' ? 'paused' : 'available'
    setListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: next } : item))
    try {
      await setListingStatus(listing.id, next)
    } catch {
      setListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: listing.status } : item))
    }
  }

  return <OwnerShell title="My Listings" subtitle="Manage your inventory, daily rates, and availability in one place." onAddGear={() => openForm()}>
    <div className="owner-toolbar"><span className="owner-toolbar-note">{loading ? 'Loading your listings…' : `${listings.filter((l) => l.status === 'available').length} of ${listings.length} listings are live on the marketplace.`}</span><button className="owner-button dark" type="button" onClick={() => openForm()}>+ Add gear</button></div>
    {savedNote && <PageCard><p className="auth-success">{savedNote}</p></PageCard>}
    {error && !showForm && <PageCard><p className="auth-error">{error}</p></PageCard>}
    {loading ? <PageCard><SectionSkeleton rows={3} /></PageCard> : <div className="owner-gear-grid">{listings.map((listing) => <GearCard key={listing.id} item={{ name: listing.name, category: listing.meta || `${listing.brand} · ${listing.category}`, price: `₱${Number(listing.daily_rate).toLocaleString()}`, status: listing.status.toUpperCase(), image: listing.image_url || '/lensshare-camera.png', pickupAddress: listing.pickup_address }} onStatusToggle={() => handleToggle(listing)} onEdit={() => openForm(listing)}/>)}</div>}
    {!loading && !listings.length && <PageCard><EmptyState title="No listings yet" hint="Add your first piece of gear to appear on the marketplace." /></PageCard>}
    {showForm && <div className="owner-modal-backdrop" role="presentation" onMouseDown={event => { if (!busy && event.currentTarget === event.target) resetForm() }}><section className="owner-modal gear-modal" role="dialog" aria-modal="true" aria-labelledby="add-gear-title"><button className="modal-close" type="button" onClick={resetForm} disabled={busy} aria-label="Close">×</button><OwnerHeading titleId="add-gear-title" eyebrow={editing ? 'EDIT LISTING' : 'NEW LISTING'} title={editing ? 'Edit gear' : 'Add gear'} detail="Add your equipment details and a public pickup point renters can find."/>
      <form onSubmit={(event) => { event.preventDefault(); handleSave() }}><fieldset className="owner-listing-fields" disabled={busy}>
      <div className="gear-photo-upload"><label htmlFor="gear-photo">{photoPreview ? <img src={photoPreview} alt="Selected gear preview"/> : <span>+ Upload gear photo</span>}<input id="gear-photo" type="file" accept="image/*" onChange={handlePhoto}/></label></div>
      <div className="form-grid"><label>Equipment name<input value={name} required autoFocus onChange={(e) => setName(e.target.value)} placeholder="Sony FX30 Cinema Body"/></label><label>Brand & model<input value={brandModel} required onChange={(e) => setBrandModel(e.target.value)} placeholder="Sony · FX30"/></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as ListingCategory)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Daily rate PHP<input value={rate} required onChange={(e) => setRate(e.target.value)} placeholder="750" inputMode="decimal"/></label><label className="wide">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe condition, accessories, and handoff notes."/></label>
        <div className="wide owner-location-field"><label htmlFor="gear-pickup-address">Public pickup address <span>Optional</span></label><input id="gear-pickup-address" value={pickupAddress} onChange={(e) => changePickupAddress(e.target.value)} placeholder="Public meeting point, street, barangay and city" maxLength={500} aria-describedby="gear-pickup-privacy"/><p id="gear-pickup-privacy">This address and any saved coordinates are public. Use a public meeting point or business address, not a private home address.</p></div>
      </div>
      <div className="owner-pickup-location"><div className="owner-pickup-heading"><MapPin size={18} aria-hidden="true"/><div><b>Help renters find nearby gear</b><p>Use your location only while at the pickup point. Typing an address does not add coordinates automatically.</p></div></div>
        <div className="owner-location-actions"><button className="owner-button" type="button" disabled={!pickupAddress.trim() || locationBusy} onClick={capturePickupPoint}><LocateFixed size={15} aria-hidden="true"/>{locationBusy ? 'Locating…' : 'Use my current location'}</button>{(pickupPoint || locationCandidate || locationBusy) && <button className="owner-button" type="button" onClick={clearPickupPoint}>{locationBusy ? 'Cancel location' : 'Remove coordinates'}</button>}</div>
        {locationCandidate && <div className="owner-location-confirm" role="status"><p><b>Confirm this pickup point</b><span>{locationCandidate.latitude.toFixed(5)}, {locationCandidate.longitude.toFixed(5)} · Approx. accuracy ±{Math.ceil(locationCandidate.accuracy)} m</span><span>Only confirm if you are at the address entered above.</span></p><button className="owner-button dark" type="button" onClick={confirmPickupPoint}>Confirm pickup point</button></div>}
        {pickupPoint && !locationCandidate && <p className="owner-location-status" role="status"><Check size={15} aria-hidden="true"/><span>Pickup point confirmed · {pickupPoint.latitude.toFixed(5)}, {pickupPoint.longitude.toFixed(5)}. Coordinates are included when you save this listing.</span></p>}
        {locationError && <p className="owner-location-error" role="status">{locationError}</p>}
      </div>
      <div className="modal-actions"><button className="owner-button" type="button" onClick={resetForm}>Cancel</button><button className="owner-button dark" type="submit" disabled={busy || locationBusy || Boolean(locationCandidate)}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}</button></div>{error && <p className="auth-error" role="alert">{error}</p>}
      </fieldset></form>
    </section></div>}
  </OwnerShell>
}
