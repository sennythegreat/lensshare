import { ShieldCheck, X } from 'lucide-react'
import '@/app/agreement/agreement.css'
import { pesos, type BookingHandoff, type BookingWithRelations } from '@/lib/types'

type RentalAgreementSheetProps = {
  booking: BookingWithRelations
  handoffs: BookingHandoff[]
}

export function RentalAgreementSheet({ booking, handoffs }: RentalAgreementSheetProps) {
  const gear = booking.listing
  const renterSigned = handoffs.some((row) => row.party === 'renter' && row.stage === 'agreement')
  const ownerSigned = handoffs.some((row) => row.party === 'owner' && row.stage === 'agreement')

  return <article className="agreement-sheet">
    <header className="agreement-head">
      <div><p className="agreement-eyebrow">LENSHARE CO-OP · NAGA CITY</p><h1>Equipment Rental Agreement</h1><p className="agreement-ref">Booking #{booking.id.slice(0, 8).toUpperCase()} · {booking.status.toUpperCase()}</p></div>
      <span className="agreement-logo"><img src="/lensshare-logo.png" alt="LensShare" /></span>
    </header>

    <section className="agreement-parties">
      <div><small>OWNER (Lender)</small><b>{booking.owner?.full_name || '—'}</b></div>
      <div><small>RENTER</small><b>{booking.renter?.full_name || '—'}</b>{booking.renter && <span className={`agreement-verified ${booking.renter.verification_status === 'verified' ? 'ok' : ''}`}>{booking.renter.verification_status === 'verified' ? '✓ Identity verified' : 'Verification pending'}</span>}</div>
      <div><small>EQUIPMENT</small><b>{gear?.name || 'Removed listing'}</b><span>{gear?.brand} · {gear?.category}</span></div>
      <div><small>PERIOD</small><b>{booking.start_date} → {booking.end_date}</b><span>{booking.days} {booking.days === 1 ? 'day' : 'days'} · {pesos(Number(booking.total))} renter total</span></div>
    </section>

    <section className="agreement-price">
      <div><span>Rental subtotal</span><b>{pesos(Number(booking.subtotal))}</b></div>
      {Number(booking.discount_amount) > 0 && <div className="discount"><span>30-Day Saver Pass · LensShare funded</span><b>− {pesos(Number(booking.discount_amount))}</b></div>}
      <div className="total"><span>Renter total</span><b>{pesos(Number(booking.total))}</b></div>
    </section>

    <section className="agreement-terms">
      <h2>1 · Hand-off & return</h2>
      <p>The listing&apos;s general availability area is {gear?.pickup_address?.trim() || 'not specified'}. This is not an exact pickup address. The owner and renter must agree on the precise handoff and return time and place privately through the booking&apos;s Messages before the rental starts. The renter receives the equipment listed above, inspected by both parties at hand-off.</p>
      <h2>2 · Care of equipment</h2>
      <p>The renter agrees to operate the equipment only for the stated shoot purpose, to keep it secure and dry, and to return it clean and complete with all included accessories by the end date. No sub-leasing or third-party use.</p>
      <h2>3 · Damage & loss</h2>
      <p>Damage discovered at return beyond normal wear is the renter&apos;s responsibility up to the repair or replacement cost. LensCare™ co-op coverage (₱100,000 replacement, ₱0 deductible) applies to covered incidents; verified students receive the standard deposit waiver.</p>
      <h2>4 · Late return</h2>
      <p>Returns later than the agreed drop-off time may be charged an additional day at the listed daily rate, at the owner&apos;s discretion.</p>
      <h2>5 · Settlement</h2>
      <p>The renter total of {pesos(Number(booking.total))}{Number(booking.discount_amount) > 0 ? ` includes a ${pesos(Number(booking.discount_amount))} LensShare-funded Saver Pass discount from the ${pesos(Number(booking.subtotal))} rental subtotal` : ''}. The owner settlement remains based on the rental subtotal, from which LensShare retains its 15% platform commission.</p>
    </section>

    <section className="agreement-signatures">
      <SignatureBlock
        label="RENTER"
        name={booking.renter?.full_name ?? '—'}
        signed={renterSigned}
        timestamp={handoffs.find((row) => row.party === 'renter' && row.stage === 'agreement')?.updated_at}
      />
      <SignatureBlock
        label="OWNER"
        name={booking.owner?.full_name ?? '—'}
        signed={ownerSigned}
        timestamp={handoffs.find((row) => row.party === 'owner' && row.stage === 'agreement')?.updated_at}
      />
    </section>
    <footer className="agreement-foot"><ShieldCheck size={13} /> This agreement is recorded on the LensShare platform and attached to booking #{booking.id.slice(0, 8).toUpperCase()}.</footer>
  </article>
}

function SignatureBlock({ label, name, signed, timestamp }: { label: string; name: string; signed: boolean; timestamp?: string }) {
  return <div className="agreement-signature">
    <small>{label}</small>
    {signed
      ? <><span className="agreement-signed-name">{name}</span><small>Signed{timestamp ? ` · ${new Date(timestamp).toLocaleString()}` : ''}</small></>
      : <><span className="agreement-unsigned"><X size={14} /> Not yet signed</span><small>{name}</small></>}
  </div>
}
