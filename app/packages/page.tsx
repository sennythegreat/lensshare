'use client'

import Link from 'next/link'
import { ArrowRight, BadgeCheck, Camera, ShieldCheck, Sparkles } from 'lucide-react'
import { SiteHeadbar } from '@/components/site-headbar'
import './packages.css'

const tiers = [
  { tag: 'Academic tier', title: 'Student Filmmakers & Video Outputs', kit: 'Sony ZV-E10 / Fujifilm X-T30 II · 1–3 day rentals from ₱450/day', copy: 'Lightweight cameras, quick access, and performance tools for student shoots. Verified students rent with the deposit waived.' },
  { tag: 'Fast turnaround', title: 'Campus Journalists & Digital Creators', kit: 'Rode Wireless GO II · Godox SL60W · same-day hub handoffs', copy: 'Reliable cameras and audio for campus events and stories, with hand-offs coordinated at Centro, Magsaysay, and Pili.' },
  { tag: 'Commercial grade', title: 'Freelance Photographers & UGCs', kit: 'Full-frame bodies, fast primes, and lighting for client work', copy: 'Production-ready bodies, lenses, and lighting for client work — every unit is inspected and sensor-clean before pick-up.' },
  { tag: 'Pure passion', title: 'Travelers & Analog Hobbyists', kit: 'DJI RS3 Mini · Sigma 16mm f/1.4 · compact travel kits', copy: 'Compact, travel-ready equipment for slow, intentional photography, backed by the same coverage as every other tier.' },
]

const rates = [
  { label: 'Daily rate', value: 'From ₱300/day', copy: 'Every listing shows its own owner-set daily rate up front — no hidden booking fees.' },
  { label: 'Multi-day rate', value: 'Priced by the block', copy: 'Consecutive-day rentals price better than single days; the total updates live in the booking panel.' },
  { label: 'Student rate', value: '₱0 deposit', copy: 'Verified students rent with the cash deposit waived — LensCare coverage stays switched on.' },
]

export default function PackagesPage() {
  return <main className="packages-page">
    <SiteHeadbar />
    <section className="packages-hero">
      <p className="eyebrow packages-eyebrow">PACKAGES &amp; TIERS · NAGA CITY CO-OP</p>
      <h1>One co-op. Four ways to shoot.</h1>
      <p>LensShare is a peer-to-peer optical cooperative. Renters pick the tier that matches the job; owners keep <b>85%</b> of every rental — the 15% co-op share funds replacement coverage, verified people, and hub hand-offs.</p>
    </section>
    <div className="packages-shell">
      <section className="packages-grid">
        {tiers.map((tier) => <article className="packages-card" key={tier.title}>
          <span className="packages-tag">{tier.tag}</span>
          <h3>{tier.title}</h3>
          <p>{tier.copy}</p>
          <small>Typical kit<br />{tier.kit}</small>
        </article>)}
      </section>
      <section className="packages-rates">
        {rates.map((rate) => <article className="packages-rate" key={rate.label}>
          <span className="packages-rate-label"><Sparkles size={13} /> {rate.label}</span>
          <strong>{rate.value}</strong>
          <p>{rate.copy}</p>
        </article>)}
      </section>
      <section className="packages-coverage">
        <div>
          <p className="eyebrow">LENSCARE COVERAGE</p>
          <h2>Every tier rents protected.</h2>
          <p>Coverage activates automatically on every booking — no opt-in, no paperwork at the hand-off.</p>
        </div>
        <div className="packages-coverage-item"><ShieldCheck size={18} /><b>₱100,000 replacement guarantee</b><span>Accidental damage on covered units is handled by the co-op, not out of pocket.</span></div>
        <div className="packages-coverage-item"><BadgeCheck size={18} /><b>₱0 deductible · verified people</b><span>Every renter and owner passes identity review before a hand-off is confirmed.</span></div>
      </section>
      <section className="packages-cta">
        <Link className="packages-button dark" href="/browse"><Camera size={15} /> Browse verified gear</Link>
        <Link className="packages-button" href="/dashboard">List your gear <ArrowRight size={15} /></Link>
      </section>
    </div>
  </main>
}
