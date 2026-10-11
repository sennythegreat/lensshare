'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { OwnerShell, GearCard, PageCard, OwnerHeading } from '@/components/owner-shell'
import { fetchOwnerListings, insertListing, setListingStatus, uploadGearPhoto } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import type { Listing, ListingCategory } from '@/lib/types'

const CATEGORIES: ListingCategory[] = ['Cameras', 'Lenses', 'Lighting', 'Support', 'Audio']

export default function ListingsPage() {
  const { user, profile, loading } = useProfile()
  const [listings, setListings] = useState<Listing[]>([])
  const [showForm, setShowForm] = useState(false)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [category, setCategory] = useState<ListingCategory>('Cameras')
  const [rate, setRate] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')

  useEffect(() => {
    if (!user) return
    fetchOwnerListings(user.id).then(setListings).catch((e) => setError(e instanceof Error ? e.message : 'Could not load listings.'))
  }, [user])

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function resetForm() {
    setShowForm(false)
    setPhotoPreview('')
    setPhotoFile(null)
    setName(''); setBrandModel(''); setCategory('Cameras'); setRate(''); setDescription('')
    setSavedNote(''); setError('')
  }

  async function handleSave() {
    if (!user) return
    const dailyRate = Number(rate)
    if (!name.trim() || !brandModel.trim() || !Number.isFinite(dailyRate) || dailyRate <= 0) {
      setError('Fill in the equipment name, brand, and a daily rate above zero.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const imageUrl = photoFile ? await uploadGearPhoto(user.id, photoFile) : null
      const created = await insertListing(user.id, {
        name: name.trim(),
        brand: brandModel.split('·')[0].trim() || 'Various',
        category,
        daily_rate: dailyRate,
        description: description.trim() || null,
        meta: `${category.toUpperCase()} · ${brandModel.trim()}`,
        image_url: imageUrl,
      })
      setListings((current) => [...current, created])
      setSavedNote(`“${created.name}” is live on the marketplace.`)
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

  return <OwnerShell title="My Listings" subtitle="Manage your inventory, daily rates, and availability in one place." onAddGear={() => setShowForm(true)}>
    <div className="owner-toolbar"><span className="owner-toolbar-note">{loading ? 'Loading your listings…' : `${listings.filter((l) => l.status === 'available').length} of ${listings.length} listings are live on the marketplace.`}</span><button className="owner-button dark" type="button" onClick={() => setShowForm(true)}>+ Add gear</button></div>
    {savedNote && <PageCard><p className="auth-success">{savedNote}</p></PageCard>}
    {error && !showForm && <PageCard><p className="auth-error">{error}</p></PageCard>}
    <div className="owner-gear-grid">{listings.map((listing) => <GearCard key={listing.id} item={{ name: listing.name, category: listing.meta || `${listing.brand} · ${listing.category}`, price: `₱${Number(listing.daily_rate).toLocaleString()}`, status: listing.status.toUpperCase(), image: listing.image_url || '/lensshare-camera.png' }} onStatusToggle={() => handleToggle(listing)}/>)}</div>
    {!loading && !listings.length && <PageCard><div className="owner-empty"><h3>No listings yet</h3><p>Add your first piece of gear to appear on the marketplace.</p></div></PageCard>}
    {showForm && <div className="owner-modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) resetForm() }}><section className="owner-modal gear-modal" role="dialog" aria-modal="true" aria-labelledby="add-gear-title"><button className="modal-close" type="button" onClick={resetForm} aria-label="Close">×</button><OwnerHeading eyebrow="NEW LISTING" title="Add gear" detail="Upload a photo and enter the basics for your marketplace listing."/><div className="gear-photo-upload"><label htmlFor="gear-photo">{photoPreview ? <img src={photoPreview} alt="Selected gear preview"/> : <span>+ Upload gear photo</span>}<input id="gear-photo" type="file" accept="image/*" onChange={handlePhoto}/></label></div><div className="form-grid"><label>Equipment name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sony FX30 Cinema Body"/></label><label>Brand & model<input value={brandModel} onChange={(e) => setBrandModel(e.target.value)} placeholder="Sony · FX30"/></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as ListingCategory)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Daily rate PHP<input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="₱750" inputMode="decimal"/></label><label className="wide">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe condition, accessories, and handoff notes."/></label></div><div className="modal-actions"><button className="owner-button" type="button" onClick={resetForm}>Cancel</button><button className="owner-button dark" type="button" disabled={busy} onClick={handleSave}>{busy ? 'Publishing…' : 'Publish listing'}</button></div>{error && <p className="auth-error">{error}</p>}</section></div>}
  </OwnerShell>
}
