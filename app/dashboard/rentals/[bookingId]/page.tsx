'use client'

import { useParams } from 'next/navigation'
import { OwnerShell } from '@/components/owner-shell'
import { RentalHub } from '@/components/rental-hub'

export default function OwnerRentalHubPage() {
  const params = useParams<{ bookingId: string }>()
  return <OwnerShell title="Rental Hub" subtitle="Follow the Naga Hub custody record, agreement, inspections, deposit, and participant confirmations.">
    <RentalHub bookingId={params.bookingId} party="owner" />
  </OwnerShell>
}
