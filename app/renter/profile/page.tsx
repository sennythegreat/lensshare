'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RenterShell } from '@/components/renter-shell'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'
import { initialsOf } from '@/lib/types'
import '../renter.css'

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, loading } = useProfile()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) { setFullName(profile.full_name); setPhone(profile.phone ?? '') }
  }, [profile])

  async function handleSave() {
    if (!user) return
    setBusy(true); setError(''); setSaved(false)
    try {
      await updateProfile(user.id, { full_name: fullName, phone: phone || null })
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

  return <RenterShell title="My Profile" subtitle="Manage your renter identity and account preferences."><section className="renter-card profile-card"><div className="profile-avatar">{profile ? initialsOf(fullName || profile.full_name) : '…'}</div><div className="form-grid"><label>Full name<input value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} /></label><label>Email address<input value={user?.email ?? ''} readOnly /></label><label>Phone number<input value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} placeholder="+63 917 555 0148" /></label><label>Account role<input value={loading ? '…' : 'Verified renter'} readOnly /></label></div><button className="owner-button dark" disabled={busy} onClick={handleSave}>{busy ? 'Saving…' : 'Save profile changes'}</button>{saved && <p className="auth-success">Profile saved.</p>}{error && <p className="auth-error">{error}</p>}<div className="profile-actions"><button className="owner-button" disabled={busy} onClick={handleSwitchRole}>Switch to owner workspace</button><button className="owner-button" onClick={handleSignOut}>Sign out</button></div><p className="demo-note">Your account starts as a renter — switching roles unlocks the owner dashboard with the same login.</p></section><section className="renter-card"><p className="eyebrow">ACCOUNT SAFETY</p><h2>Verification and privacy</h2><p>Your identity documents are private and only shared with authorized LensShare reviewers.</p></section></RenterShell>
}
