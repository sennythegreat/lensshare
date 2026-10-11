'use client'

import '../dashboard/dashboard.css'
import Link from 'next/link'
import { ArrowLeft, Camera, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    router.push(email.includes('renter') || email.includes('customer') ? '/browse' : '/dashboard')
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
          <div className="demo-accounts"><span>Demo accounts</span><button type="button" onClick={() => setEmail('renter@lensshare.demo')}>Renter / customer</button><button type="button" onClick={() => setEmail('owner@lensshare.demo')}>Owner dashboard</button></div>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="email">Email address<input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label htmlFor="password">Password<div className="password-field"><input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <div className="auth-options"><label className="checkbox-label"><input type="checkbox" /> Remember me</label><button type="button" className="forgot-button">Forgot password?</button></div>
            <button className="auth-submit" type="submit">Log in <ArrowLeft size={14} className="rotate-arrow" /></button>
            {submitted && <p className="auth-success">Demo login ready — continue to your studio dashboard.</p>}
          </form>
          <p className="auth-switch">New to LensShare? <Link href="/login">Create an account</Link></p>
        </div>
      </div>
    </main>
  )
}
