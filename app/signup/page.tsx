'use client'

import '../dashboard/dashboard.css'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/lib/types'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<Role>('renter')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    if (data.session) {
      router.push(role === 'owner' ? '/dashboard' : '/browse')
      return
    }
    router.push(`/signup/verify?email=${encodeURIComponent(email)}`)
  }

  return (
    <main className="auth-page">
      <div className="auth-panel auth-brand-panel">
        <Link href="/" className="brand auth-brand"><span className="brand-mark"><img src="/lensshare-logo.png" alt="" /></span> LensShare</Link>
        <div className="auth-brand-copy">
          <span className="kicker">Local creatives marketplace</span>
          <h1>Join the co-op.</h1>
          <p>Pick how you start — borrow verified gear for your next shoot, or put the equipment on your shelf to work.</p>
        </div>
        <p className="auth-note"><LockKeyhole size={13} /> Insured rentals. Verified people. Clear payouts.</p>
      </div>
      <div className="auth-panel auth-form-panel">
        <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to LensShare</Link>
        <div className="auth-form-wrap">
          <span className="eyebrow">Create account</span>
          <h2>Set up your LensShare account</h2>
          <p className="auth-subtitle">You can add the other role later from your workspace settings.</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="full-name">Full name<input id="full-name" type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Juan Dela Cruz" required /></label>
            <label htmlFor="email">Email address<input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label htmlFor="password">Password<div className="password-field"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <fieldset className="role-picker" style={{ border: 0, padding: 0, margin: '4px 0 0' }}>
              <legend className="sr-only" style={{ position: 'absolute', left: -9999 }}>Account role</legend>
              <label className={role === 'renter' ? 'selected' : ''}>
                <input type="radio" name="role" checked={role === 'renter'} onChange={() => setRole('renter')} />
                <b>Renter</b>
                <small>Browse and book verified gear for your shoots.</small>
              </label>
              <label className={role === 'owner' ? 'selected' : ''}>
                <input type="radio" name="role" checked={role === 'owner'} onChange={() => setRole('owner')} />
                <b>Owner</b>
                <small>List your equipment and earn from every rental.</small>
              </label>
            </fieldset>
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowLeft size={14} className="rotate-arrow" /></button>
            {error && <p className="auth-error">{error}</p>}
          </form>
          <p className="auth-switch">Already have an account? <Link href="/login">Log in</Link></p>
        </div>
      </div>
    </main>
  )
}
