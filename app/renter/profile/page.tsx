'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RenterHeadbar } from '@/components/renter-headbar'
import { createClient } from '@/lib/supabase/client'
import { fetchReviewsOfUser, updateProfile } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { initialsOf, PRIMARY_RENTAL_USE_OPTIONS, type PrimaryRentalUse, type ReviewWithNames } from '@/lib/types'
import '../renter.css'

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, loading } = useProfile()
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
      await updateProfile(user.id, {
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
      await updateProfile(user.id, { role: 'owner' })
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

  return <RenterHeadbar title="My Profile" subtitle="Manage your renter identity and account preferences."><section className="renter-card profile-card"><div className="profile-avatar">{profile ? initialsOf(fullName || profile.full_name) : '…'}</div><div className="form-grid"><label>Full name<input value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} /></label><label>Email address<input value={user?.email ?? ''} readOnly /></label><label>Phone number<input value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} placeholder="+63 917 555 0148" /></label><label>Account role<input value={loading ? '…' : 'Verified renter'} readOnly /></label><label className="profile-use-field">Primary rental use<select value={primaryRentalUse} onChange={(e) => { setPrimaryRentalUse(e.target.value as PrimaryRentalUse | ''); setSaved(false) }}><option value="">Not specified</option>{PRIMARY_RENTAL_USE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Optional and self-reported. Choose the main reason you rent gear, or leave this unanswered.</small></label></div><button className="owner-button dark" disabled={busy} onClick={handleSave}>{busy ? 'Saving…' : 'Save profile changes'}</button>{saved && <p className="auth-success">Profile saved.</p>}{error && <p className="auth-error">{error}</p>}<div className="profile-actions"><button className="owner-button" disabled={busy} onClick={handleSwitchRole}>Switch to owner workspace</button><button className="owner-button" onClick={handleSignOut}>Sign out</button></div><p className="demo-note">Your account starts as a renter — switching roles unlocks the owner dashboard with the same login.</p></section><section className="renter-card"><p className="eyebrow">ACCOUNT SAFETY</p><h2>Verification and privacy</h2><p>Your identity documents are private and only shared with authorized LensShare reviewers.</p></section><section className="renter-card"><p className="eyebrow">TRUST RECORD</p><h2>Reviews received</h2>{reviews.length ? <div className="renter-reviews">{reviews.map((review) => <div className="renter-review" key={review.id}><div className="renter-review-head"><b>{review.reviewer?.full_name || 'LensShare member'}</b><span className="review-stars-inline">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>{review.listing && <small>About the {review.listing.name} rental</small>}{review.comment && <p>{review.comment}</p>}</div>)}</div> : <p>Owners rate you after each completed rental. Complete your first shoot to build your trust record.</p>}</section></RenterHeadbar>
}
