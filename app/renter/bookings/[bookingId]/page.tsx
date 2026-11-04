'use client'

import { useParams } from 'next/navigation'
import { RenterHeadbar } from '@/components/renter-headbar'
import { RentalHub } from '@/components/rental-hub'
import '../../renter.css'

export default function RenterRentalHubPage() {
  const params = useParams<{ bookingId: string }>()
  return <RenterHeadbar title="Rental Hub" subtitle="Follow your Naga Hub custody record, agreement, inspections, deposit, and confirmations.">
    <RentalHub bookingId={params.bookingId} party="renter" />
  </RenterHeadbar>
}
