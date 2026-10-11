'use client'

import { useMemo, useState } from 'react'
import { OwnerShell, OwnerStats, PageCard, OwnerHeading, Status } from '@/components/owner-shell'

type RentalStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'RETURNED' | 'COMPLETED' | 'DECLINED'
type Rental = { id: string; name: string; brand: string; renter: string; dates: string; start: number; price: number; status: RentalStatus; image: string; description: string; duration: string }

const initialRentals: Rental[] = [
  { id: 'LS-2401', name: 'Sony ZV-E10 & 16–50mm Kit', brand: 'Sony · APS-C', renter: 'Paolo R.', dates: 'Oct 24–27, 2025', start: 4, price: 1800, status: 'ACTIVE', image: '/lensshare-camera.png', description: 'Campus journalism and vlog shoot.', duration: '4 days' },
  { id: 'LS-2402', name: 'Fujifilm X-T30 II Silver Body', brand: 'Fujifilm · APS-C', renter: 'Alyssa C.', dates: 'Oct 28–30, 2025', start: 5, price: 1800, status: 'PENDING', image: '/camera-fujifilm.png', description: 'Student film documentary.', duration: '3 days' },
  { id: 'LS-2403', name: 'Sigma 16mm f/1.4 Lens', brand: 'Sigma · Sony E', renter: 'Marcus B.', dates: 'Oct 20–23, 2025', start: 2, price: 1050, status: 'COMPLETED', image: '/camera-lens.png', description: 'Night architecture set.', duration: '4 days' },
  { id: 'LS-2404', name: 'Godox SL60W Video Light Kit', brand: 'Godox · Bowens', renter: 'Bicol Indie Lab', dates: 'Nov 01–03, 2025', start: 8, price: 900, status: 'APPROVED', image: '/camera-light.png', description: 'Short film lighting package.', duration: '3 days' },
]
const filters = ['ALL', 'PENDING', 'APPROVED', 'ACTIVE', 'RETURNED', 'COMPLETED', 'DECLINED'] as const

export default function RentalsPage() {
  const [rentals, setRentals] = useState(initialRentals)
  const [filter, setFilter] = useState<(typeof filters)[number]>('ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('start')
  const [selected, setSelected] = useState<Rental | null>(null)
  const [checklist, setChecklist] = useState<Rental | null>(null)
  const [saved, setSaved] = useState(false)

  const visible = useMemo(() => rentals.filter((r) => (filter === 'ALL' || r.status === filter) && `${r.name} ${r.brand} ${r.renter} ${r.id}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'price' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : sort === 'recent' ? b.id.localeCompare(a.id) : b.start - a.start), [rentals, filter, query, sort])
  const decide = (status: RentalStatus) => { if (!selected) return; setRentals((items) => items.map((item) => item.id === selected.id ? { ...item, status } : item)); setSelected(null) }

  return <OwnerShell title="Manage Rentals" subtitle="Review requests, coordinate handoffs, and keep every booking moving.">
    <OwnerStats />
    <div className="owner-toolbar rentals-toolbar"><div><OwnerHeading eyebrow="BOOKING OPERATIONS · DEMO DATA" title="Rental requests & active bookings" detail={`${visible.length} of ${rentals.length} demo bookings shown`} /></div><div className="rental-tools"><input aria-label="Search rentals" placeholder="Search gear, renter, or booking..." value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Sort rentals" value={sort} onChange={(e) => setSort(e.target.value)}><option value="start">Sort: start date</option><option value="price">Sort: rental price</option><option value="name">Sort: equipment name</option><option value="recent">Sort: recent booking</option></select></div></div>
    <div className="owner-filters rental-filters">{filters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item === 'ALL' ? 'All Rentals' : item[0] + item.slice(1).toLowerCase()}</button>)}</div>
    <PageCard>{visible.length ? <div className="owner-table">{visible.map((row) => <div className="owner-row" key={row.id}><div><Status>{row.status}</Status><h3>{row.name}</h3><p>{row.dates} · {row.renter} · {row.id}</p></div><strong>₱{row.price.toLocaleString()}</strong><div className="rental-actions"><button className="owner-button" onClick={() => setSelected(row)}>View details</button>{row.status === 'ACTIVE' || row.status === 'APPROVED' ? <button className="owner-button" onClick={() => { setChecklist(row); setSaved(false) }}>View checklist</button> : null}</div></div>)}</div> : <div className="owner-empty"><h3>No matching rentals</h3><p>Try another status or search term.</p></div>}</PageCard>
    {selected && <div className="owner-modal-backdrop" onClick={() => setSelected(null)}><section className="owner-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}>×</button><img src={selected.image} alt="" /><span className="owner-eyebrow">BOOKING {selected.id} · {selected.status}</span><h2>{selected.name}</h2><p>{selected.brand} · rented by {selected.renter}</p><div className="modal-grid"><div><small>Rental dates</small><strong>{selected.dates} ({selected.duration})</strong></div><div><small>Rental price</small><strong>₱{selected.price.toLocaleString()} · demo estimate</strong></div><div><small>Shoot description</small><strong>{selected.description}</strong></div><div><small>Handoff</small><strong>Naga City Hub · 09:00 AM morning call</strong></div></div><div className="modal-actions">{selected.status === 'PENDING' && <><button className="owner-button dark" onClick={() => decide('APPROVED')}>Approve request</button><button className="owner-button" onClick={() => decide('DECLINED')}>Decline</button></>}<button className="owner-button" onClick={() => { setChecklist(selected); setSelected(null); setSaved(false) }}>View checklist</button></div><p className="demo-note">Demo behavior only. No booking or payment is persisted.</p></section></div>}
    {checklist && <div className="owner-modal-backdrop" onClick={() => setChecklist(null)}><section className="owner-modal checklist-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setChecklist(null)}>×</button><span className="owner-eyebrow">CHECKLIST · {checklist.id}</span><h2>{checklist.name}</h2><p>{checklist.renter} · {checklist.status}</p>{['Confirm equipment identity and model','Inspect equipment condition','Verify included accessories','Record condition notes','Confirm scheduled Naga City Hub handoff','Confirm equipment has been returned','Record missing or damaged items','Add post-rental inspection notes'].map((item) => <label className="check-item" key={item}><input type="checkbox" />{item}</label>)}<div className="modal-actions"><button className="owner-button dark" onClick={() => setSaved(true)}>Save checklist</button><button className="owner-button" onClick={() => setChecklist(null)}>Cancel</button></div>{saved && <p className="auth-success">Checklist saved as demo data. Physical inspection is not confirmed.</p>}</section></div>}
  </OwnerShell>
}
