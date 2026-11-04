import { CheckCircle2, MapPin, ShieldCheck, X } from 'lucide-react'
import '@/app/agreement/agreement.css'
import { pesos } from '@/lib/types'
import type { BookingHandoff, BookingWithRelations, RentalHubData } from '@/lib/types'

type RentalAgreementSheetProps = {
  booking: BookingWithRelations
  handoffs?: BookingHandoff[]
  rentalHub?: RentalHubData | null
}

export function RentalAgreementSheet({ booking, handoffs = [], rentalHub = null }: RentalAgreementSheetProps) {
  const agreement = rentalHub?.agreement
  const snapshot = agreement?.snapshot
  const gear = snapshot?.equipment
  const hub = snapshot?.hub ?? rentalHub?.hub
  const pricing = snapshot?.pricing
  const depositSnapshot = snapshot?.deposit
  const deposit = rentalHub?.deposit
  const isHubWorkflow = Number((booking as BookingWithRelations & { workflow_version?: number }).workflow_version ?? 1) >= 2
  const renterHandoff = handoffs.find((row) => row.party === 'renter' && row.stage === 'agreement')
  const ownerHandoff = handoffs.find((row) => row.party === 'owner' && row.stage === 'agreement')
  const renterSignedAt = agreement?.renter_signed_at ?? renterHandoff?.created_at ?? null
  const ownerSignedAt = agreement?.owner_signed_at ?? ownerHandoff?.created_at ?? null
  const subtotal = pricing?.subtotal ?? Number(booking.subtotal)
  const discount = pricing?.discount_amount ?? Number(booking.discount_amount)
  const total = pricing?.total ?? Number(booking.total)
  const depositAmount = deposit?.amount ?? depositSnapshot?.amount ?? 2000
  const depositWaived = deposit?.status === 'waived' || Boolean(depositSnapshot?.waived)
  const waiverReason = deposit?.waiver_reason ?? depositSnapshot?.waiver_reason ?? null
  const equipmentName = gear?.name || booking.listing?.name || 'Removed listing'
  const equipmentBrand = gear?.brand || booking.listing?.brand || '—'
  const equipmentCategory = gear?.category || booking.listing?.category || '—'
  const included = gear?.included || booking.listing?.included || 'As listed in the booking record'

  return <article className="agreement-sheet">
    <header className="agreement-head">
      <div><p className="agreement-eyebrow">LENSHARE · NAGA CITY HUB</p><h1>Equipment Rental Agreement</h1><p className="agreement-ref">Booking #{booking.id.slice(0, 8).toUpperCase()} · {booking.status.toUpperCase()}{agreement?.version ? ` · TERMS V${agreement.version}` : ''}</p></div>
      <span className="agreement-logo"><img src="/lensshare-logo.png" alt="LensShare" /></span>
    </header>

    {agreement && <div className="agreement-lock"><ShieldCheck size={15} /><div><b>Immutable booking terms</b><span>This document is the version signed by both participants. Fingerprint {shortHash(agreement.terms_hash)}.</span></div></div>}

    <section className="agreement-parties">
      <div><small>OWNER (LENDER)</small><b>{booking.owner?.full_name || '—'}</b></div>
      <div><small>RENTER</small><b>{booking.renter?.full_name || '—'}</b>{booking.renter && <span className={`agreement-verified ${booking.renter.verification_status === 'verified' ? 'ok' : ''}`}>{booking.renter.verification_status === 'verified' ? '✓ Identity verified' : 'Verification pending'}</span>}</div>
      <div><small>EQUIPMENT</small><b>{equipmentName}</b><span>{equipmentBrand} · {equipmentCategory}</span>{gear?.serial_number && <span className="agreement-serial">Serial · {gear.serial_number}</span>}</div>
      <div><small>PERIOD</small><b>{booking.start_date} → {booking.end_date}</b><span>{booking.days} {booking.days === 1 ? 'day' : 'days'}</span></div>
    </section>

    {isHubWorkflow && <section className="agreement-hub"><MapPin size={16} /><div><small>CONFIGURED HAND-OFF LOCATION</small><b>{hub?.name || 'Naga City Hub'}</b><span>{hub?.address || 'Hub address is recorded in the rental hub'}{hub?.hours ? ` · ${hub.hours}` : ''}</span></div></section>}

    <section className="agreement-price">
      <h2>Rental price</h2>
      <div><span>Rental subtotal</span><b>{pesos(subtotal)}</b></div>
      {discount > 0 && <div className="discount"><span>Saver Pass rental discount</span><b>− {pesos(discount)}</b></div>}
      <div className="total"><span>Renter rental total</span><b>{pesos(total)}</b></div>
      <p className="agreement-price-note">The Saver Pass changes only the rental price. It does not waive or pay the security deposit.</p>
    </section>

    <section className="agreement-deposit">
      <div><small>SECURITY DEPOSIT · SEPARATE FROM RENTAL PRICE</small><strong>{depositWaived ? 'Waived for this booking' : pesos(depositAmount)}</strong><span>{depositWaived ? `Verified-student waiver${waiverReason ? ` · ${waiverReason}` : ''}` : 'Authorized Naga Hub staff manually review the GCash receipt. Receipt submission alone is not payment-provider confirmation.'}</span></div>
      <span className={`agreement-deposit-status ${depositWaived ? 'waived' : ''}`}>{humanize(deposit?.status || (depositWaived ? 'waived' : 'proof required'))}</span>
    </section>

    <section className="agreement-terms">
      <h2>1 · Hub hand-off and custody</h2>
      <p>Physical custody follows the booking&apos;s recorded Naga City Hub workflow. The assigned operator records owner drop-off, renter pickup, renter return, and owner collection. Neither participant may treat an unrecorded transfer as completion of a required hub step.</p>
      <h2>2 · Condition evidence</h2>
      <p>The assigned operator records pre-rental and post-rental inspections, including condition notes, structured checks, the equipment serial, accessories, and private inspection photos. Finalized inspections and participant confirmations form part of this booking record.</p>
      <h2>3 · Care, damage, and loss</h2>
      <p>The renter agrees to use the equipment only for the stated rental purpose, keep it secure and dry, prevent sub-leasing or unauthorized third-party use, and return the complete kit in the recorded pre-rental condition except for ordinary wear. Documented damage, loss, or missing accessories may be charged up to verified repair or replacement cost after the issue-review process.</p>
      <h2>4 · Security deposit</h2>
      <p>{depositWaived ? `The fixed ${pesos(depositAmount)} security deposit is waived for this booking based on verified-student eligibility at approval. Eligibility is rechecked before pickup; if it is no longer valid, deposit proof becomes required without changing an eligible Saver Pass discount.` : `The renter must submit proof of the fixed ${pesos(depositAmount)} security deposit to the configured GCash recipient. Authorized staff manually review the receipt. A clean return proceeds to refund processing; a documented issue may place the deposit on hold until a reasoned resolution is recorded.`}</p>
      <h2>5 · Late return</h2>
      <p>A return after the agreed hub return time may result in an additional rental-day charge at the booked daily rate and may delay deposit resolution. Any adjustment must be recorded against this booking.</p>
      <h2>6 · Rental settlement</h2>
      <p>The rental subtotal is {pesos(subtotal)}. {discount > 0 ? `LensShare applies a ${pesos(discount)} Saver Pass discount, so the renter rental total is ${pesos(total)}. ` : `The renter rental total is ${pesos(total)}. `}The security deposit shown above is separate from that rental total. The owner settlement basis remains the rental subtotal, subject to LensShare&apos;s recorded platform commission.</p>
      <h2>7 · Acceptance</h2>
      <p>Each participant&apos;s signature accepts the same immutable equipment, price, security-deposit, Naga Hub, and term snapshot for this booking. A signature is append-only and cannot be edited, reassigned, or withdrawn.</p>
    </section>

    <section className="agreement-signatures">
      <SignatureBlock label="OWNER" name={booking.owner?.full_name ?? '—'} signedAt={ownerSignedAt} />
      <SignatureBlock label="RENTER" name={booking.renter?.full_name ?? '—'} signedAt={renterSignedAt} />
    </section>
    <footer className="agreement-foot"><ShieldCheck size={13} /> This agreement and its signatures are attached to booking #{booking.id.slice(0, 8).toUpperCase()}.</footer>
  </article>
}

function SignatureBlock({ label, name, signedAt }: { label: string; name: string; signedAt: string | null }) {
  return <div className="agreement-signature">
    <small>{label}</small>
    {signedAt
      ? <><span className="agreement-signed-name">{name}</span><span className="agreement-signature-state"><CheckCircle2 size={13} /> Signed immutably · {new Date(signedAt).toLocaleString('en-PH')}</span></>
      : <><span className="agreement-unsigned"><X size={14} /> Not yet signed</span><small>{name}</small></>}
  </div>
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortHash(value: string): string {
  return value ? `${value.slice(0, 14)}…` : 'not available'
}
