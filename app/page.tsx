'use client'

import { useState } from 'react'
import { ArrowUpRight, Camera, Check, ChevronRight, CircleHelp, Heart, LockKeyhole, Menu, Repeat2, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, Tag, X } from 'lucide-react'

const gear = [
  { tag: 'MIRRORLESS / SONY', name: 'Sony ZV-E10', detail: '4K vlog-ready camera with lens', price: '₱450', image: '/lensshare-camera.png' },
  { tag: 'DIGITAL SLR / CANON', name: 'Canon EOS R50', detail: 'Lightweight mirrorless body kit', price: '₱600', image: '/lensshare-camera.png' },
  { tag: 'OPTICS / SIGMA', name: 'Sigma 16mm f/1.4', detail: 'Ultra-wide prime for creators', price: '₱350', image: '/lensshare-camera.png' },
  { tag: 'LIGHTING / GODOX', name: 'Godox SL60W Video Light Kit', detail: 'Daylight-balanced continuous light', price: '₱300', image: '/lensshare-camera.png' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>
}

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState('All gear')

  return (
    <main>
      <nav className="nav shell">
        <a href="#top" className="brand"><span className="brand-mark"><Camera size={14} /></span> LensShare</a>
        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#how">How it works</a><a href="#gear">Browse gear</a><a href="#owners">Rent your gear</a><a href="#community">Monetization</a>
        </div>
        <div className="nav-actions"><button className="text-button">Sign up</button><button className="pill-button">Log in</button></div>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
      </nav>

      <section className="hero" id="top"><div className="shell hero-grid"><div className="hero-copy"><span className="kicker">Peer-to-peer camera & gear community</span><h1>LensShare</h1><p className="hero-lede">Stop letting expensive cameras sit idle. LensShare connects local creators, students, and hobbyists with insured cameras, lenses, and lighting — making creative projects, school outputs, and vlogs accessible to everyone.</p><div className="hero-actions"><a className="button dark" href="#gear">Find local gear <ArrowUpRight size={14} /></a><a className="button light" href="#owners">List your equipment <span>(earn ₱0–₱25k)</span></a></div><div className="trust-row"><span><LockKeyhole size={12} /> Locally insured equipment</span><span><ShieldCheck size={12} /> Identity-verified renters</span><span><Check size={12} /> Fresh 5% cancellation</span></div></div><div className="hero-visual"><img src="/lensshare-camera.png" alt="Black mirrorless camera on a pale blue surface" /><div className="floating-card community-card"><small>Local community</small><strong>Avg. ₱3,500/mo</strong><span>in owner payouts</span></div><div className="floating-card camera-card"><small>Featured today</small><strong>Sony ZV-E10</strong><span>₱450/day · 4.9 ★</span></div></div></div></section>

      <section className="section shell" id="community"><SectionLabel>Market friction · the paradigm shift</SectionLabel><h2>Rebalancing Creative Capital</h2><div className="split-cards"><article className="problem-card"><span className="card-tag red">The market bottleneck</span><h3>Idle Gear Meets Prohibitive Retail Costs</h3><p>“Thousands” sit unused in creator bags, while new creators face a high barrier to entry. LensShare makes ownership useful again.</p><div className="stat-row"><b>₱42,000 – ₱50,000<small>Avg. creator buy cost</small></b><b>78%<small>First year sits unused</small></b></div></article><article className="dark-card"><span className="card-tag">LensShare</span><h3>A Peer-to-Peer Camera Co-Op for Locals</h3><p>Share equipment, recover costs, and unlock the next generation of local storytellers.</p><div className="stat-row"><b>80–85%<small>Owner net take-home</small></b><b>From ₱300<small>Daily rental rate floor</small></b></div></article></div></section>

      <section className="cream-section"><div className="section shell" id="how"><div className="center-heading"><SectionLabel>Built for both sides of the lens</SectionLabel><h2>The Peer Advantage</h2><p>A community platform designed to democratize high-end production tools while protecting individual ownership.</p></div><div className="advantage-grid">{[['⌂','Rent Without the Hefty Price Tag','Get access to creator-grade cameras, lenses, and lighting without a huge upfront cost.'],['◌','Turn Idle Gear Into Passive Income','Earn on your camera while it is not in use. Set your price, stay in control.'],['✦','Beyond Phone Cameras','Step into professional-grade tools with local help and real reviews.'],['◈','Fair & Transparent 15–20% Cut','Know exactly what you earn. Simple pricing, protected payouts.']].map(([icon,title,copy])=><article className="advantage" key={title}><span className="adv-icon">{icon}</span><h3>{title}</h3><p>{copy}</p><a href="#gear">Learn more <ChevronRight size={12}/></a></article>)}</div></div></section>

      <section className="section shell" id="gear"><div className="section-heading"><div><SectionLabel>Tailored equipment packages</SectionLabel><h2>Engineered for Your Creative Horizon</h2></div><a href="#gear" className="inline-link">Explore community grants <ArrowUpRight size={13}/></a></div><div className="package-grid">{['Student Filmmakers & Video Outputs','Campus Journalists & Digital Creators','Freelance Photographers & UGCs','Travelers & Analog Hobbyists'].map((title,i)=><article className="package" key={title}><span className="card-tag">{['Academic tier','Fast turnaround','Commercial grade','Pure passion'][i]}</span><h3>{title}</h3><p>{['Lightweight cameras, quick access, and performance tools for student shoots.','Reliable cameras and audio for campus events and stories.','Production-ready bodies, lenses, and lighting for client work.','Compact, travel-ready equipment for slow, intentional photography.'][i]}</p><small>Typical kit:<br />• Sony ZV-E10 / Fujifilm X-T30 II<br />• 1–3 day rental from ₱450/day</small></article>)}</div></section>

      <section className="cream-section"><div className="section shell steps"><div className="center-heading"><SectionLabel>Protocol · secure exchange</SectionLabel><h2>Simplicity in Three Movements</h2></div><div className="steps-grid">{[['01 /','Browse & Reserve Locally','Explore cameras, prime lenses, and lighting right in your neighborhood.'],['02 /','Safe Hand-off or Hub Courier','Meet your vetted neighbor at a local campus pickup point or opt for quick local delivery.'],['03 /','Shoot, Return & Earn','Create your footage, photograph with full insurance peace of mind, then return to earn.']].map(([num,title,copy])=><article className="step" key={num}><b>{num}</b><h3>{title}</h3><p>{copy}</p><span><Check size={12}/> Verified by LensShare</span></article>)}</div></div></section>

      <section className="section shell" id="owners"><div className="section-heading"><div><SectionLabel>Curated inventory</SectionLabel><h2>Trending in Your Neighborhood</h2></div><div className="filters">{['All gear','Cameras','Lenses','Lighting'].map(item=><button key={item} className={active===item?'active':''} onClick={()=>setActive(item)}>{item}</button>)}</div></div><div className="gear-grid">{gear.map(item=><article className="gear-card" key={item.name}><div className="gear-image"><span>{item.tag}</span><button aria-label={`Save ${item.name}`}><Heart size={15}/></button><img src={item.image} alt={item.name}/></div><div className="gear-info"><small>{item.tag}</small><h3>{item.name}</h3><p>{item.detail}</p><div className="gear-meta"><span>{item.price}<small>/ day</small></span><button>Reserve</button></div></div></article>)}</div></section>

      <section className="owner-cta"><div className="shell owner-grid"><div><SectionLabel>Monetization</SectionLabel><h2>Got Gear Sitting on a Shelf?</h2><p>Stop your assets from depreciating. Earn a steady monthly return with full replacement coverage and local verified creators.</p><div className="tier-buttons"><button className="selected">Weekend tier</button><button>Mindless yield</button><button>Pro gear</button></div><p className="tiny">Days rented per month: <b>8 days</b></p></div><div className="earn-card"><small>Estimated monthly earnings</small><strong>₱3,400</strong><span>Before / day · net after 15% platform fee</span><div className="earn-lines"><span>Replacement coverage <b>Secured</b></span><span>Owner payout <b>₱2,890</b></span></div><button className="button dark">Start earning today</button></div></div></section>

      <section className="final-cta"><div className="shell center-heading"><SectionLabel>Local creatives marketplace</SectionLabel><h2>Bring Your Ideas to Life.<br/>Join LensShare Today.</h2><p>Whether you are shooting a campus documentary, filming a weekend vlog, or earning passive income on your camera — you belong in our community.</p><div className="hero-actions"><a className="button light" href="#gear">Find gear near you <ArrowUpRight size={14}/></a><a className="button outline-light" href="#owners">List your gear</a></div></div></section>

      <footer className="footer"><div className="shell footer-grid"><div><a className="brand" href="#top"><span className="brand-mark"><Camera size={14}/></span> LensShare</a><p>Protection-powered peer-to-peer access for creators, students, and essential gear.</p><small>© 2026 LensShare · Local creator peer network</small></div>{[['Marketplace','Browse Gear','Vlogging Kits','Lenses','Portable Lighting'],['For owners','List Equipment','Earnings Calculator','Coverage & Theft Policy','How it works'],['Community','Find Filmmakers','Student Journalists','Student Filmmakers','Create Blog'],['Security & care','LensShare','Every transaction is secured by payment screening and verified identity.']].map(([title,...items])=><div key={title}><b>{title}</b>{items.map(item=><a href="#top" key={item}>{item}</a>)}</div>)}</div></footer>
    </main>
  )
}
