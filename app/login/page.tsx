'use client'

import '../dashboard/dashboard.css'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, FormEvent, useState } from 'react'
import { ArrowLeft, Camera, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchRole } from '@/lib/data'

const DEMO_PASSWORD = 'demo1234'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function routeAfterLogin(userId: string, fallback?: string) {
    const role = await fetchRole(userId)
    router.push(fallback || (role === 'admin' ? '/admin' : role === 'owner' ? '/dashboard' : '/browse'))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    if (data.user) await routeAfterLogin(data.user.id, searchParams.get('redirect') || undefined)
    setBusy(false)
  }

  async function handleDemo(kind: 'owner' | 'renter') {
    const demoEmail = kind === 'owner' ? 'lensshare.owner@example.com' : 'lensshare.renter@example.com'
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setError('')
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: DEMO_PASSWORD })
    if (error) {
      setError(`Demo account not ready: ${error.message}. Sign it up first or apply supabase/seed.sql.`)
      setBusy(false)
      return
    }
    if (data.user) await routeAfterLogin(data.user.id)
    setBusy(false)
  }

  return (
    <main className="auth-page">
      <div className="auth-panel auth-brand-panel">
        <Link href="/" className="brand auth-brand"><span className="brand-mark"><Camera size={14} /></span> LensShare</Link>
        <div className="auth-brand-copy">
          <span className="kicker">Local creatives marketplace</span>
          <h1>Make room for the next story.</h1>
          <p>Rent trusted gear from your neighborhood or turn the equipment on your shelf into a protected source of income.</p>
        </div>
        <p className="auth-note"><LockKeyhole size={13} /> Insured rentals. Verified people. Clear payouts.</p>
      </div>
      <div className="auth-panel auth-form-panel">
        <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to LensShare</Link>
        <div className="auth-form-wrap">
          <span className="eyebrow">Welcome back</span>
          <h2>Log in to your studio</h2>
          <p className="auth-subtitle">Access your gear vault, rentals, and community payouts.</p>
          <div className="demo-accounts"><span>Demo accounts</span><button type="button" disabled={busy} onClick={() => handleDemo('renter')}>Renter / customer</button><button type="button" disabled={busy} onClick={() => handleDemo('owner')}>Owner dashboard</button></div>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="email">Email address<input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label htmlFor="password">Password<div className="password-field"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <div className="auth-options"><label className="checkbox-label"><input type="checkbox" /> Remember me</label><button type="button" className="forgot-button">Forgot password?</button></div>
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'} <ArrowLeft size={14} className="rotate-arrow" /></button>
            {error && <p className="auth-error">{error}</p>}
          </form>
          <p className="auth-switch">New to LensShare? <Link href="/signup">Create an account</Link></p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
