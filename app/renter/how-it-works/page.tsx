import { RenterHeadbar } from '@/components/renter-headbar'
import '../renter.css'

const steps = [
  ['01', 'Browse & request', 'Compare owner-listed gear, choose your dates, and send a booking request. The displayed booking value is not money held in escrow.'],
  ['02', 'Complete the deposit step', 'If the booking is approved and not waived, send the ₱2,000 deposit by GCash and submit proof for manual review. It is not an escrow account or provider hold.'],
  ['03', 'Use the configured hub', 'Complete handoff and return at the configured Naga City Hub, following the in-app agreement and checklists.'],
  ['04', 'Apply eligible savings', 'Approved student status makes each booking eligible for a deposit waiver. An eligible Saver Pass discount can be used alongside that waiver because it applies to the rental total.'],
] as const

export default function HowItWorksPage() {
  return <RenterHeadbar title="How It Works" subtitle="A clear, local booking and hub handoff workflow.">
    <div className="steps-grid">
      {steps.map(([number, title, copy]) => <section className="renter-card" key={number}>
        <span className="step-number">{number}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </section>)}
    </div>
  </RenterHeadbar>
}
