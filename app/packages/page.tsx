'use client'

import Link from 'next/link'
import { ArrowRight, BadgePercent, Camera, CheckCircle2, ShieldCheck, Sparkles, WalletCards } from 'lucide-react'
import { SiteHeadbar } from '@/components/site-headbar'
import { useProfile } from '@/lib/use-profile'
import './packages.css'

const creatorGuides = [
  { tag: 'Student productions', title: 'Student Filmmakers & Video Outputs', kit: 'Sony ZV-E10 / Fujifilm X-T30 II · 1–3 day rentals from ₱450/day', copy: 'Lightweight cameras, quick access, and performance tools for student shoots. Approved student status makes each booking eligible for a deposit waiver.' },
  { tag: 'Fast turnaround', title: 'Campus Journalists & Digital Creators', kit: 'Rode Wireless GO II · Godox SL60W · scheduled hub handoffs', copy: 'Reliable cameras and audio for campus events and stories, with approved rentals handed off and returned at the configured Naga City Hub.' },
  { tag: 'Commercial grade', title: 'Freelance Photographers & UGCs', kit: 'Full-frame bodies, fast primes, and lighting for client work', copy: 'Owner-listed bodies, lenses, and lighting for client work. Review each listing’s specifications, inclusions, and availability before requesting.' },
  { tag: 'Pure passion', title: 'Travelers & Analog Hobbyists', kit: 'DJI RS3 Mini · Sigma 16mm f/1.4 · compact travel kits', copy: 'Compact equipment suggestions for slow, intentional photography, booked through the same verified request and hub handoff workflow.' },
]

const rates = [
  { label: 'Daily rate', value: 'From ₱300/day', copy: 'Every listing shows its own owner-set daily rate up front — no hidden booking fees.' },
  { label: 'Booking total', value: 'Daily rate × days', copy: 'Your total is based on the listing rate and selected rental dates, and is shown before you request a booking.' },
  { label: 'Student benefit', value: 'Waiver eligible', copy: 'Approved student status is assessed at the booking level for the cash deposit waiver.' },
]

export default function PackagesPage() {
  const { user, profile, loading } = useProfile()

  return <main className="packages-page">
    <SiteHeadbar />
    <section className="packages-hero">
      <p className="eyebrow packages-eyebrow">CREATOR GUIDES · NAGA CITY CO-OP</p>
      <h1>Find a kit for the way you create.</h1>
      <p>Start with the creator path closest to your project, then shape the setup around your shoot. These are suggested routes through owner-listed gear — <b>not fixed bundles or purchasable tiers.</b></p>
    </section>
    <div className="packages-shell">
      <section className="packages-grid" aria-label="Suggested creator paths">
        {creatorGuides.map((guide) => <article className="packages-card" key={guide.title}>
          <span className="packages-tag">{guide.tag}</span>
          <h3>{guide.title}</h3>
          <p>{guide.copy}</p>
          <small>Suggested kit<br />{guide.kit}</small>
        </article>)}
      </section>

      <section className="packages-pass" aria-labelledby="packages-pass-title">
        <div className="packages-pass-heading">
          <span className="packages-pass-kicker"><BadgePercent size={14} aria-hidden="true" /> RENT MORE, SAVE SIMPLY</span>
          <h2 id="packages-pass-title">30-Day Saver Pass</h2>
          <p>A compact savings pass for renters with eligible bookings planned in the next month. Its rental discount can be used alongside an eligible student deposit waiver because they apply to different amounts.</p>
          <p className="packages-pass-price"><strong>₱99</strong><span>once</span></p>
        </div>
        <dl className="packages-pass-details">
          <div><dt>Booking discount</dt><dd>5% off</dd><small>Eligible bookings</small></div>
          <div><dt>Active window</dt><dd>30 days</dd><small>After admin approval</small></div>
          <div><dt>Savings limit</dt><dd>₱500</dd><small>Total discount cap</small></div>
        </dl>
        <div className="packages-pass-action">
          <p><WalletCards size={17} aria-hidden="true" /><span><b>GCash, manually verified</b>The ₱99 pass fee is checked by an admin before the 30-day pass activates; it is separate from the ₱2,000 booking deposit.</span></p>
          <div className="packages-pass-access" aria-live="polite">
            {loading
              ? <span className="packages-pass-checking">Checking account access…</span>
              : !user
                ? <Link className="packages-pass-link" href="/login?redirect=%2Frenter%2Fsaver-pass">Sign in for Saver Pass <ArrowRight size={14} aria-hidden="true" /></Link>
                : profile?.role === 'renter'
                  ? <Link className="packages-pass-link" href="/renter/saver-pass">View Saver Pass <ArrowRight size={14} aria-hidden="true" /></Link>
                  : profile?.role === 'owner'
                    ? <div className="packages-pass-role"><span>Saver Pass is for renter accounts.</span><Link href="/dashboard">Open owner dashboard <ArrowRight size={13} aria-hidden="true" /></Link></div>
                    : profile?.role === 'admin'
                      ? <div className="packages-pass-role"><span>Saver Pass is for renter accounts.</span><Link href="/admin">Open admin console <ArrowRight size={13} aria-hidden="true" /></Link></div>
                      : <span className="packages-pass-checking">Saver Pass requires a renter profile.</span>}
          </div>
        </div>
      </section>

      <section className="packages-rates" aria-label="How rental pricing works">
        {rates.map((rate) => <article className="packages-rate" key={rate.label}>
          <span className="packages-rate-label"><Sparkles size={13} /> {rate.label}</span>
          <strong>{rate.value}</strong>
          <p>{rate.copy}</p>
        </article>)}
      </section>
      <section className="packages-coverage">
        <div>
          <p className="eyebrow">BOOKING DEPOSIT</p>
          <h2>Manual proof, clearly tracked.</h2>
          <p>For bookings without a waiver, the renter sends the ₱2,000 deposit by GCash and submits proof for manual review. This is not an escrow account or a provider-authorized card hold.</p>
        </div>
        <div className="packages-coverage-item"><ShieldCheck size={18} /><b>Booking-level student waiver</b><span>Approved student status makes a booking eligible for the deposit waiver; the booking record confirms whether it applies.</span></div>
        <div className="packages-coverage-item"><CheckCircle2 size={18} /><b>Configured hub exchange</b><span>Approved rentals are handed off and returned at the configured Naga City Hub, with booking checklists recorded in the app.</span></div>
      </section>
      <section className="packages-cta">
        <Link className="packages-button dark" href="/browse"><Camera size={15} /> Browse verified gear</Link>
        <Link className="packages-button" href="/dashboard">List your gear <ArrowRight size={15} /></Link>
      </section>
    </div>
  </main>
}
