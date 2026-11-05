'use client'

import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { useProfile } from '@/lib/use-profile'

export function VerifyBanner({ compact = false }: { compact?: boolean }) {
  const { profile, loading } = useProfile()
  if (loading || !profile || profile.verification_status === 'verified') return null
  if (profile.role !== 'renter' && profile.role !== 'owner') return null

  const owner = profile.role === 'owner'
  const state = profile.verification_status === 'pending' ? 'Verification is being reviewed' : owner ? 'Verify your owner account' : 'Verify your renter account'
  const detail = profile.verification_status === 'pending'
    ? owner
      ? 'Your verified badge appears on your listings once an admin approves your documents.'
      : 'Booking and messaging unlock after an admin approves your documents.'
    : owner
      ? 'Upload your government ID and selfie so renters see a verified badge on your listings.'
      : 'Upload your government ID to unlock booking and messaging.'

  return <aside className={`verify-banner ${compact ? 'compact' : ''}`} role="status">
    <BadgeCheck size={17} />
    <div><b>{state}</b><span>{detail}</span></div>
    <Link href={owner ? '/dashboard/verification' : '/renter/verification'}>{profile.verification_status === 'pending' ? 'Check status' : 'Verify now'} →</Link>
  </aside>
}
