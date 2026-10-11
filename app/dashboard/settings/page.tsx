'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OwnerShell, PageCard, OwnerHeading } from '@/components/owner-shell'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'

export default function SettingsPage() {
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
      await updateProfile(user.id, { role: 'renter' })
      router.push('/renter/bookings')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Role switch failed.')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return <OwnerShell title="Owner Settings" subtitle="Keep your profile, notifications, and listing defaults up to date.">
    <div className="settings-grid">
      <PageCard><OwnerHeading eyebrow="PROFILE" title="Personal information"/>
        <div className="form-grid">
          <label>Full name<input value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} /></label>
          <label>Email<input value={user?.email ?? ''} readOnly /></label>
          <label>Phone<input value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} placeholder="+63 917 000 0000" /></label>
          <label>Account role<input value={loading ? '…' : 'Owner'} readOnly /></label>
        </div>
        <button className="owner-button dark" disabled={busy} onClick={handleSave}>{busy ? 'Saving…' : 'Save profile'}</button>
        {saved && <p className="auth-success">Profile saved.</p>}
        {error && <p className="auth-error">{error}</p>}
      </PageCard>
      <PageCard><OwnerHeading eyebrow="PREFERENCES" title="Workspace settings"/>
        <label className="setting-row"><span><b>Booking notifications</b><small>Get reminders for requests and returns.</small></span><input type="checkbox" defaultChecked /></label>
        <label className="setting-row"><span><b>Public availability</b><small>Allow renters to discover your listings.</small></span><input type="checkbox" defaultChecked /></label>
        <hr />
        <button className="owner-button" disabled={busy} onClick={handleSwitchRole}>Switch to renter workspace</button>
        <button className="owner-button" onClick={handleSignOut}>Sign out</button>
      </PageCard>
    </div>
  </OwnerShell>
}
