'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RenterHeadbar } from '@/components/renter-headbar'
import { createClient } from '@/lib/supabase/client'
import { fetchReviewsOfUser, switchWorkspaceRole, updateProfile } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { usePromoPass } from '@/lib/use-promo-pass'
import { initialsOf, pesos, PRIMARY_RENTAL_USE_OPTIONS, type PrimaryRentalUse, type ReviewWithNames } from '@/lib/types'
import '../renter.css'

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, loading } = useProfile()
  const { passes } = usePromoPass(user?.id)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [primaryRentalUse, setPrimaryRentalUse] = useState<PrimaryRentalUse | ''>('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviews, setReviews] = useState<ReviewWithNames[]>([])

  useEffect(() => {
    if (user) fetchReviewsOfUser(user.id).then(setReviews).catch(() => {})
  }, [user])

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name)
      setPhone(profile.phone ?? '')
      setPrimaryRentalUse(profile.primary_rental_use ?? '')
    }
  }, [profile])

  async function handleSave() {
    if (!user) return
    setBusy(true); setError(''); setSaved(false)
    try {
      await updateProfile({
        full_name: fullName,
        phone: phone || null,
        primary_rental_use: primaryRentalUse || null,
      })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSwitchRole() {
    if (!user) return
    setBusy(true)
    try {
      await switchWorkspaceRole('owner')
      router.push('/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Role switch failed.')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  const latestPass = passes[0]
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  const activePass = latestPass?.status === 'active' && Boolean(latestPass.valid_until_exclusive && today < latestPass.valid_until_exclusive)
  const remainingPassDiscount = latestPass ? Math.max(0, Number(latestPass.discount_cap) - Number(latestPass.reserved_amount) - Number(latestPass.redeemed_amount)) : 0
  const verificationLabel = loading ? '…' : profile?.verification_status === 'verified' ? 'Verified renter' : profile?.verification_status === 'pending' ? 'Verification pending' : 'Unverified renter'

  return <RenterHeadbar title="My Profile" subtitle="Manage your renter identity and account preferences."><section className="renter-card profile-card"><div className="profile-avatar">{profile ? initialsOf(fullName || profile.full_name) : '…'}</div><div className="form-grid"><label>Full name<input value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} /></label><label>Email address<input value={user?.email ?? ''} readOnly /></label><label>Phone number<input value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} placeholder="+63 917 555 0148" /></label><label>Account role<input value={verificationLabel} readOnly /></label><label className="profile-use-field">Primary rental use<select value={primaryRentalUse} onChange={(e) => { setPrimaryRentalUse(e.target.value as PrimaryRentalUse | ''); setSaved(false) }}><option value="">Not specified</option>{PRIMARY_RENTAL_USE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Optional and self-reported. Choose the main reason you rent gear, or leave this unanswered.</small></label></div><button className="owner-button dark" disabled={busy} onClick={handleSave}>{busy ? 'Saving…' : 'Save profile changes'}</button>{saved && <p className="auth-success">Profile saved.</p>}{error && <p className="auth-error">{error}</p>}<div className="profile-actions"><button className="owner-button" disabled={busy} onClick={handleSwitchRole}>Switch to owner workspace</button><button className="owner-button" onClick={handleSignOut}>Sign out</button></div><p className="demo-note">Your account starts as a renter. An active Saver Pass keeps expiring while you use the owner workspace and applies again only after you switch back.</p></section><section className="renter-card renter-pass-summary"><div><p className="eyebrow">30-DAY SAVER PASS</p><h2>{activePass ? 'Your Saver Pass is active' : latestPass?.status === 'pending_review' ? 'Payment under review' : 'Save on your next month of rentals'}</h2><p>{activePass ? `${pesos(remainingPassDiscount)} of your ₱500 discount cap remains. Your pass expires after ${latestPass.valid_until_exclusive}.` : latestPass?.status === 'pending_review' ? 'An admin must match your GCash reference and receipt before the 30-day period begins.' : 'Avail the ₱99 pass for 5% off eligible bookings, up to ₱500 total savings.'}</p></div><Link className="owner-button dark" href="/renter/saver-pass">{activePass ? 'Manage Saver Pass' : latestPass?.status === 'pending_review' ? 'View review status' : 'View Saver Pass'}</Link></section><section className="renter-card"><p className="eyebrow">ACCOUNT SAFETY</p><h2>Verification and privacy</h2><p>Your identity documents are private and only shared with authorized LensShare reviewers.</p></section><section className="renter-card"><p className="eyebrow">TRUST RECORD</p><h2>Reviews received</h2>{reviews.length ? <div className="renter-reviews">{reviews.map((review) => <div className="renter-review" key={review.id}><div className="renter-review-head"><b>{review.reviewer?.full_name || 'LensShare member'}</b><span className="review-stars-inline">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>{review.listing && <small>About the {review.listing.name} rental</small>}{review.comment && <p>{review.comment}</p>}</div>)}</div> : <p>Owners rate you after each completed rental. Complete your first shoot to build your trust record.</p>}</section></RenterHeadbar>
}
