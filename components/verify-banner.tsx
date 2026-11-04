'use client'

import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { useProfile } from '@/lib/use-profile'

export function VerifyBanner({ compact = false }: { compact?: boolean }) {
  const { profile, loading } = useProfile()
  if (loading || profile?.role !== 'renter' || profile.verification_status === 'verified') return null

  const state = profile.verification_status === 'pending' ? 'Verification is being reviewed' : 'Verify your renter account'
  const detail = profile.verification_status === 'pending'
    ? 'Booking and messaging unlock after an admin approves your documents.'
    : 'Upload your government ID to unlock booking and messaging.'

  return <aside className={`verify-banner ${compact ? 'compact' : ''}`} role="status">
    <BadgeCheck size={17} />
    <div><b>{state}</b><span>{detail}</span></div>
    <Link href="/renter/verification">{profile.verification_status === 'pending' ? 'Check status' : 'Verify now'} →</Link>
  </aside>
}
