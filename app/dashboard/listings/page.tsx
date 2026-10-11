'use client'

import { ChangeEvent, useState } from 'react'
import { OwnerShell, gear, GearCard, PageCard, OwnerHeading } from '@/components/owner-shell'

export default function ListingsPage() {
  const [showForm, setShowForm] = useState(false)
  const [photo, setPhoto] = useState('')
  const [saved, setSaved] = useState(false)

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) setPhoto(URL.createObjectURL(file))
  }

  return <OwnerShell title="My Listings" subtitle="Manage your demo inventory, daily rates, and availability in one place." onAddGear={() => setShowForm(true)}>
    <div className="owner-toolbar"><OwnerHeading eyebrow="EQUIPMENT INVENTORY" title="My Gear Vault & Public Listings" detail="Four demo listings are ready for marketplace review."/><button className="owner-button dark" type="button" onClick={() => setShowForm(true)}>+ Add gear</button></div>
    <div className="owner-gear-grid">{gear.map(item => <GearCard key={item.name} item={item}/>)}</div>
    {showForm && <div className="owner-modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setShowForm(false) }}><section className="owner-modal gear-modal" role="dialog" aria-modal="true" aria-labelledby="add-gear-title"><button className="modal-close" type="button" onClick={() => setShowForm(false)} aria-label="Close">×</button><OwnerHeading eyebrow="NEW DEMO LISTING" title="Add gear" detail="Upload a photo and enter the basics for your marketplace listing."/><div className="gear-photo-upload"><label htmlFor="gear-photo">{photo ? <img src={photo} alt="Selected gear preview"/> : <span>+ Upload gear photo</span>}<input id="gear-photo" type="file" accept="image/*" onChange={handlePhoto}/></label></div><div className="form-grid"><label>Equipment name<input placeholder="Sony FX30 Cinema Body"/></label><label>Brand & model<input placeholder="Sony · FX30"/></label><label>Category<select><option>Camera body</option><option>Lens</option><option>Lighting</option><option>Audio</option></select></label><label>Daily rate PHP<input placeholder="₱750"/></label><label className="wide">Description<textarea placeholder="Describe condition, accessories, and handoff notes."/></label></div><div className="modal-actions"><button className="owner-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="owner-button dark" type="button" onClick={() => setSaved(true)}>{saved ? 'Saved demo listing' : 'Save demo listing'}</button></div>{saved && <p className="demo-note">Demo saved locally for this screen. Connect storage to publish it.</p>}</section></div>}
  </OwnerShell>
}
