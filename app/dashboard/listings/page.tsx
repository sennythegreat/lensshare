'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, ImagePlus, LocateFixed, MapPin, Trash2 } from 'lucide-react'
import { OwnerShell, GearCard, PageCard, OwnerHeading } from '@/components/owner-shell'
import { EmptyState, SectionSkeleton } from '@/components/states'
import { BlackoutCalendar } from '@/components/blackout-calendar'
import { useToast } from '@/components/toast'
import {
  checkListingServiceArea,
  deleteUnreferencedGearPhotos,
  fetchListingAsset,
  fetchServiceArea,
  fetchOwnerListings,
  gearPhotoPath,
  insertListing,
  saveListingAsset,
  setListingStatus,
  updateListing,
  uploadGearPhoto,
  type NewListing,
  type UploadedGearPhoto,
} from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { listingPhotos, type Listing, type ListingCategory, type ListingStatus } from '@/lib/types'
import { approximateCoordinates, pickupCoordinates, requestLocation, validCoordinates, type Coordinates, type LocationFix } from '@/lib/location'

const CATEGORIES: ListingCategory[] = ['Cameras', 'Lenses', 'Lighting', 'Support', 'Audio']
const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 8 * 1024 * 1024

type PhotoDraft = { id: string; url: string; file?: File }

function brandModelOf(listing: Listing) {
  const prefix = `${listing.category.toUpperCase()} · `
  return listing.meta?.startsWith(prefix) ? listing.meta.slice(prefix.length) : listing.brand
}

function photoDraftsOf(listing: Listing): PhotoDraft[] {
  return listingPhotos(listing).map((url, index) => ({ id: `saved-${index}-${url}`, url }))
}

export default function ListingsPage() {
  const toast = useToast()
  const { user, loading } = useProfile()
  const [listings, setListings] = useState<Listing[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Listing | null>(null)
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [name, setName] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [category, setCategory] = useState<ListingCategory>('Cameras')
  const [status, setStatus] = useState<ListingStatus>('available')
  const [rate, setRate] = useState('')
  const [deposit, setDeposit] = useState('')
  const [description, setDescription] = useState('')
  const [specs, setSpecs] = useState('')
  const [included, setIncluded] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [serialLoading, setSerialLoading] = useState(false)
  const [serialLoadError, setSerialLoadError] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupPoint, setPickupPoint] = useState<Coordinates | null>(null)
  const [locationCandidate, setLocationCandidate] = useState<LocationFix | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const locationRequest = useRef(0)
  const [serviceRadius, setServiceRadius] = useState<number | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const previewUrls = useRef(new Set<string>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')

  useEffect(() => {
    if (!user) return
    fetchOwnerListings(user.id).then(setListings).catch((e) => setError(e instanceof Error ? e.message : 'Could not load listings.'))
  }, [user])

  useEffect(() => {
    fetchServiceArea()
      .then((area) => setServiceRadius(area.latitude !== null && area.longitude !== null ? area.radius_km : null))
      .catch(() => setServiceRadius(null))
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('add') !== '1') return
    openForm()
    url.searchParams.delete('add')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  useEffect(() => () => {
    locationRequest.current += 1
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current.clear()
  }, [])

  useEffect(() => {
    if (!showForm) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) resetForm() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [showForm, busy])

  function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Add up to ${MAX_PHOTOS} photos per listing.`)
      return
    }
    const unsupported = files.find((file) => !file.type.startsWith('image/'))
    if (unsupported) {
      setError(`“${unsupported.name}” is not a supported image file.`)
      return
    }
    const oversized = files.find((file) => file.size > MAX_PHOTO_BYTES)
    if (oversized) {
      setError(`“${oversized.name}” is larger than 8 MB.`)
      return
    }
    const drafts = files.map((file) => {
      const url = URL.createObjectURL(file)
      previewUrls.current.add(url)
      return { id: `new-${crypto.randomUUID()}`, url, file }
    })
    setPhotos((current) => [...current, ...drafts])
    setError('')
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const target = current[index]
      if (target?.file) {
        URL.revokeObjectURL(target.url)
        previewUrls.current.delete(target.url)
      }
      return current.filter((_, photoIndex) => photoIndex !== index)
    })
    setError('')
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setPhotos((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  function resetForm() {
    locationRequest.current += 1
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current.clear()
    setShowForm(false)
    setEditing(null)
    setPhotos([])
    setName(''); setBrandModel(''); setCategory('Cameras'); setStatus('available'); setRate(''); setDeposit('')
    setDescription(''); setSpecs(''); setIncluded(''); setSerialNumber('')
    setSerialLoading(false); setSerialLoadError('')
    setPickupAddress(''); setPickupPoint(null); setLocationCandidate(null)
    setLocationBusy(false); setLocationError(''); setError('')
  }

  async function openForm(listing: Listing | null = null) {
    if (busy) return
    resetForm()
    setSavedNote('')
    if (listing) {
      setEditing(listing)
      setPhotos(photoDraftsOf(listing))
      setName(listing.name)
      setBrandModel(brandModelOf(listing))
      setCategory(listing.category)
      setStatus(listing.status)
      setRate(String(listing.daily_rate))
      setDeposit(listing.security_deposit === null || listing.security_deposit === undefined ? '' : String(listing.security_deposit))
      setDescription(listing.description ?? '')
      setSpecs(listing.specs ?? '')
      setIncluded(listing.included ?? '')
      setPickupAddress(listing.pickup_address ?? '')
      const point = pickupCoordinates(listing)
      setPickupPoint(point ? approximateCoordinates(point) : null)
      setSerialLoading(true)
      try {
        const asset = await fetchListingAsset(listing.id)
        setSerialNumber(asset?.serial_number ?? '')
      } catch (assetError) {
        setSerialLoadError(assetError instanceof Error ? assetError.message : 'Could not load this listing’s private serial number.')
      } finally {
        setSerialLoading(false)
      }
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
        setLocationError('This location is too approximate for nearby sorting. Try again, or keep an area-only listing.')
        return
      }
      setLocationCandidate(fix)
    } catch (captureError) {
      if (request === locationRequest.current) setLocationError(captureError instanceof Error ? captureError.message : 'Could not find this area.')
    } finally {
      if (request === locationRequest.current) setLocationBusy(false)
    }
  }

  function confirmPickupPoint() {
    if (!locationCandidate || !pickupAddress.trim()) return
    setPickupPoint(approximateCoordinates(locationCandidate))
    setLocationCandidate(null)
    setLocationError('')
  }

  async function handleSave() {
    if (busy) return
    if (!user) {
      setError(loading ? 'Preparing your owner account. Please wait a moment.' : 'Sign in with an owner account before publishing gear.')
      return
    }
    const dailyRate = Number(rate)
    if (!name.trim() || !brandModel.trim() || !Number.isFinite(dailyRate) || dailyRate <= 0) {
      setError('Fill in the equipment name, brand and model, and a daily rate above zero.')
      return
    }
    const depositAmount = deposit.trim() === '' ? null : Number(deposit)
    if (depositAmount !== null && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
      setError('Enter a security deposit of zero or more, or leave it blank to use the hub default.')
      return
    }
    if (serialLoading) {
      setError('Wait for the private serial record to finish loading before saving.')
      return
    }
    if (serialLoadError) {
      setError('The private serial record could not be loaded. Close this editor and try again before saving.')
      return
    }
    if (!serialNumber.trim()) {
      setError(editing ? 'Add the equipment serial number before saving this legacy listing.' : 'Add the equipment serial number before publishing this listing.')
      return
    }
    if (serialNumber.trim().length > 160) {
      setError('The serial number must be 160 characters or fewer.')
      return
    }
    if (photos.length > MAX_PHOTOS) {
      setError(`Add up to ${MAX_PHOTOS} photos per listing.`)
      return
    }
    if (locationBusy || locationCandidate) {
      setError('Confirm or discard the captured area before saving.')
      return
    }
    if (pickupPoint && (!pickupAddress.trim() || !validCoordinates(pickupPoint.latitude, pickupPoint.longitude))) {
      setError('Nearby sorting needs an availability area and valid approximate coordinates.')
      return
    }

    setBusy(true)
    setError('')
    const uploadedPhotos: UploadedGearPhoto[] = []
    try {
      if (pickupPoint) {
        const inServiceArea = await checkListingServiceArea(pickupPoint.latitude, pickupPoint.longitude).catch(() => true)
        if (!inServiceArea) {
          throw new Error(`This pickup point is outside the ${serviceRadius ?? 15} km Naga City service area. Choose an availability area closer to Naga City, or remove nearby sorting.`)
        }
      }
      const photoUrls: string[] = []
      for (const photo of photos) {
        if (!photo.file) {
          photoUrls.push(photo.url)
          continue
        }
        const uploaded = await uploadGearPhoto(user.id, photo.file)
        uploadedPhotos.push(uploaded)
        photoUrls.push(uploaded.url)
      }

      const brandChanged = !editing || brandModel.trim() !== brandModelOf(editing) || category !== editing.category
      const values: NewListing = {
        name: name.trim(),
        brand: editing && !brandChanged ? editing.brand : brandModel.split('·')[0].trim() || 'Various',
        category,
        status,
        daily_rate: dailyRate,
        security_deposit: depositAmount,
        description: description.trim() || null,
        specs: specs.trim() || null,
        included: included.trim() || null,
        ...(brandChanged ? { meta: `${category.toUpperCase()} · ${brandModel.trim()}` } : {}),
        image_url: photoUrls[0] ?? null,
        image_urls: photoUrls,
      }
      const hadLocation = Boolean(editing?.pickup_address?.trim() || (editing && pickupCoordinates(editing)))
      if (pickupAddress.trim() || pickupPoint || hadLocation) {
        const point = pickupPoint ? approximateCoordinates(pickupPoint) : null
        values.pickup_address = pickupAddress.trim() || null
        values.pickup_latitude = point?.latitude ?? null
        values.pickup_longitude = point?.longitude ?? null
      }

      const saved = editing ? await updateListing(editing.id, user.id, values) : await insertListing(user.id, values)
      try {
        await saveListingAsset(saved.id, serialNumber.trim())
      } catch (assetError) {
        let recoverableListing = saved
        let rollbackMessage = ' The public listing changes were saved; retry Save changes after the private asset issue is resolved.'
        if (!editing) {
          try {
            await setListingStatus(saved.id, 'paused')
            recoverableListing = { ...saved, status: 'paused' }
            rollbackMessage = ' The new listing was paused so it is not publicly bookable without its private serial record. Retry Save changes after the private asset issue is resolved.'
          } catch {
            rollbackMessage = ' The listing could not be paused automatically; pause it now and contact an administrator.'
          }
        }
        for (const url of previewUrls.current) URL.revokeObjectURL(url)
        previewUrls.current.clear()
        setPhotos(photoUrls.map((url, index) => ({ id: `saved-${index}-${url}`, url })))
        setEditing(recoverableListing)
        setStatus(recoverableListing.status)
        setListings((current) => current.some((item) => item.id === recoverableListing.id)
          ? current.map((item) => item.id === recoverableListing.id ? recoverableListing : item)
          : [...current, recoverableListing])
        const setupMessage = assetError instanceof Error ? assetError.message : 'The private serial record could not be saved.'
        throw new Error(`${setupMessage}${rollbackMessage}`)
      }
      let cleanupWarning = ''
      if (editing) {
        const kept = new Set(photoUrls)
        const removedPhotos = listingPhotos(editing)
          .filter((url) => !kept.has(url))
          .map((url) => ({ url, path: gearPhotoPath(url, user.id) }))
          .filter((photo): photo is UploadedGearPhoto => Boolean(photo.path))
        if (removedPhotos.length) {
          try {
            await deleteUnreferencedGearPhotos(user.id, removedPhotos)
          } catch {
            cleanupWarning = ' The listing was saved, but an old photo could not be removed from storage.'
          }
        }
      }
      setListings((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
      resetForm()
      setSavedNote(`${editing ? `“${saved.name}” has been updated.` : `“${saved.name}” is live on the marketplace.`}${cleanupWarning}`)
      toast.success(editing ? `“${saved.name}” has been updated.` : `“${saved.name}” is live on the marketplace.`)
    } catch (saveError) {
      let cleanupFailed = false
      if (uploadedPhotos.length) {
        try { await deleteUnreferencedGearPhotos(user.id, uploadedPhotos) } catch { cleanupFailed = true }
      }
      const message = saveError instanceof Error ? saveError.message : 'Saving the listing failed.'
      setError(`${message}${cleanupFailed ? ' Newly uploaded photos could not be cleaned up automatically.' : ''}`)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(listing: Listing) {
    const next = listing.status === 'available' ? 'paused' : 'available'
    setListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: next } : item))
    setError('')
    try {
      await setListingStatus(listing.id, next)
      toast.success(next === 'paused' ? `“${listing.name}” is paused and hidden from browse.` : `“${listing.name}” is live on the marketplace again.`)
    } catch (toggleError) {
      setListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: listing.status } : item))
      const message = toggleError instanceof Error ? toggleError.message : 'Could not update listing availability.'
      setError(message)
      toast.error(message)
    }
  }

  return <OwnerShell title="My Listings" subtitle="Manage your inventory, daily rates, and availability in one place." onAddGear={() => openForm()}>
    <div className="owner-toolbar"><span className="owner-toolbar-note">{loading ? 'Loading your listings…' : `${listings.filter((listing) => listing.status === 'available').length} of ${listings.length} listings are live on the marketplace.`}</span><button className="owner-button dark" type="button" onClick={() => openForm()}>+ Add gear</button></div>
    {savedNote && <PageCard><p className="auth-success owner-listing-notice" role="status">{savedNote}</p></PageCard>}
    {error && !showForm && <PageCard><p className="auth-error owner-listing-notice" role="alert">{error}</p></PageCard>}
    {loading ? <PageCard><SectionSkeleton rows={3} /></PageCard> : <div className="owner-gear-grid">{listings.map((listing) => <GearCard key={listing.id} item={{ name: listing.name, category: listing.meta || `${listing.brand} · ${listing.category}`, price: `₱${Number(listing.daily_rate).toLocaleString()}`, status: listing.status.toUpperCase(), image: listingPhotos(listing)[0] || '/lensshare-camera.png', pickupAddress: listing.pickup_address }} onStatusToggle={() => handleToggle(listing)} onEdit={() => openForm(listing)}/>)}</div>}
    {!loading && !listings.length && <PageCard><EmptyState title="No listings yet" hint="Add your first piece of gear to appear on the marketplace." /></PageCard>}
    {showForm && <div className="owner-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) resetForm() }}><section className="owner-modal gear-modal" role="dialog" aria-modal="true" aria-labelledby="add-gear-title"><button className="modal-close" type="button" onClick={resetForm} disabled={busy} aria-label="Close">×</button><OwnerHeading titleId="add-gear-title" eyebrow={editing ? 'EDIT LISTING' : 'NEW LISTING'} title={editing ? 'Edit gear' : 'Add gear'} detail="Describe your equipment and the optional city or municipality where it is available."/>
      <form onSubmit={(event) => { event.preventDefault(); handleSave() }}><fieldset className="owner-listing-fields" disabled={busy}>
        <div className="gear-photo-editor">
          <div className="gear-photo-editor-head"><div><b>Listing photos</b><span>{photos.length} of {MAX_PHOTOS} · The first photo is the cover.</span></div><button className="owner-button" type="button" disabled={photos.length >= MAX_PHOTOS} onClick={() => photoInput.current?.click()}><ImagePlus size={15} aria-hidden="true" /> Add photos</button></div>
          <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={handlePhotos}/>
          {photos.length ? <div className="gear-photo-grid">{photos.map((photo, index) => <article className="gear-photo-item" key={photo.id}><img src={photo.url} alt={`Listing photo ${index + 1}`}/>{index === 0 && <span className="gear-photo-cover">Cover</span>}<div className="gear-photo-actions"><button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} aria-label={`Move photo ${index + 1} left`}><ArrowLeft size={14}/></button><button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} aria-label={`Move photo ${index + 1} right`}><ArrowRight size={14}/></button><button type="button" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`}><Trash2 size={14}/></button></div></article>)}</div> : <button className="gear-photo-empty" type="button" onClick={() => photoInput.current?.click()}><ImagePlus size={22}/><span>Add up to five clear photos</span><small>JPG, PNG or another browser-supported image · 8 MB each</small></button>}
        </div>
        <div className="form-grid"><label>Equipment name<input value={name} required autoFocus onChange={(event) => setName(event.target.value)} placeholder="Sony FX30 Cinema Body"/></label><label>Brand &amp; model<input value={brandModel} required onChange={(event) => setBrandModel(event.target.value)} placeholder="Sony · FX30"/></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value as ListingCategory)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Listing status<select value={status} onChange={(event) => setStatus(event.target.value as ListingStatus)}><option value="available">Available</option><option value="paused">Paused</option></select></label><label>Daily rate PHP<input value={rate} required onChange={(event) => setRate(event.target.value)} placeholder="750" inputMode="decimal"/></label><label>Security deposit PHP (optional)<input value={deposit} onChange={(event) => setDeposit(event.target.value)} placeholder="Hub default" inputMode="decimal"/><small>Leave blank to use the hub default. Refundable after return.</small></label><div className="owner-serial-field"><label htmlFor="gear-serial-number">Equipment serial number</label><input id="gear-serial-number" value={serialNumber} required maxLength={160} autoComplete="off" spellCheck={false} disabled={serialLoading || Boolean(serialLoadError)} onChange={(event) => { setSerialNumber(event.target.value); setError('') }} placeholder={serialLoading ? 'Loading private serial…' : 'Enter the manufacturer serial'}/><p>This inventory identifier is stored in a private owner/admin record. It is never shown on the public listing.</p>{editing && !serialLoading && !serialLoadError && !serialNumber.trim() && <p className="owner-serial-warning" role="status"><CircleAlert size={14}/> Legacy listing: add a serial number before you can save changes.</p>}{serialLoadError && <p className="owner-serial-warning" role="alert"><CircleAlert size={14}/> {serialLoadError}</p>}</div><label className="wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the condition and anything renters should know."/></label><label className="wide">Specifications<textarea value={specs} onChange={(event) => setSpecs(event.target.value)} placeholder="Sensor, mount, resolution, dimensions, or other key specifications."/></label><label className="wide">Included accessories<textarea value={included} onChange={(event) => setIncluded(event.target.value)} placeholder="Batteries, charger, case, cables, stands, or other included items."/></label>
          <div className="wide owner-location-field"><label htmlFor="gear-pickup-address">Availability area <span>Optional</span></label><input id="gear-pickup-address" value={pickupAddress} onChange={(event) => changePickupAddress(event.target.value)} placeholder="City or municipality, e.g. Naga City" maxLength={120} aria-describedby="gear-pickup-privacy"/><p id="gear-pickup-privacy">Share only the broad city or municipality where this gear is available. Arrange the exact handoff place privately with the renter in Messages.</p></div>
        </div>
        <div className="owner-pickup-location"><div className="owner-pickup-heading"><MapPin size={18} aria-hidden="true"/><div><b>Help renters find nearby gear</b><p>Optional GPS is rounded to an approximate area before saving. Your raw coordinates are not displayed.</p></div></div>
          <div className="owner-location-actions"><button className="owner-button" type="button" disabled={!pickupAddress.trim() || locationBusy} onClick={capturePickupPoint}><LocateFixed size={15} aria-hidden="true"/>{locationBusy ? 'Locating…' : 'Use my current area'}</button>{(pickupPoint || locationCandidate || locationBusy) && <button className="owner-button" type="button" onClick={clearPickupPoint}>{locationBusy ? 'Cancel location' : 'Remove nearby sorting'}</button>}</div>
          {locationCandidate && <div className="owner-location-confirm" role="status"><p><b>Use this approximate area?</b><span>Browser accuracy: about ±{Math.ceil(locationCandidate.accuracy)} m.</span><span>LensShare will round the point before it is saved.</span></p><button className="owner-button dark" type="button" onClick={confirmPickupPoint}>Use approximate area</button></div>}
          {pickupPoint && !locationCandidate && <p className="owner-location-status" role="status"><Check size={15} aria-hidden="true"/><span>Approximate nearby-search area added. Exact coordinates will not be shown.</span></p>}
          {locationError && <p className="owner-location-error" role="status">{locationError}</p>}
          {pickupPoint && serviceRadius !== null && <p className="owner-location-status" role="note"><MapPin size={14} aria-hidden="true" /><span>LensShare serves pickup points within {serviceRadius} km of the Naga City Hub. Points outside it are rejected.</span></p>}
        </div>
        {editing && <div className="owner-blackout-field"><BlackoutCalendar listingId={editing.id} /></div>}
        <div className="modal-actions"><button className="owner-button" type="button" onClick={resetForm}>Cancel</button><button className="owner-button dark" type="submit" disabled={busy || loading || !user || serialLoading || Boolean(serialLoadError) || locationBusy || Boolean(locationCandidate)}>{busy ? 'Saving…' : loading ? 'Preparing account…' : serialLoading ? 'Loading private record…' : editing ? 'Save changes' : 'Publish listing'}</button></div>{error && <p className="auth-error owner-listing-form-error" role="alert">{error}</p>}
      </fieldset></form>
    </section></div>}
  </OwnerShell>
}
