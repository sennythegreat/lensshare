'use client'

import '../../dashboard/dashboard.css'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchRole } from '@/lib/data'

const CODE_LENGTH = 6
const emptyCode = () => Array<string>(CODE_LENGTH).fill('')

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [digits, setDigits] = useState<string[]>(emptyCode)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  async function verify(code: string) {
    if (busy || code.length !== CODE_LENGTH) return
    setError('')
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
    if (error) {
      setError(error.message)
      setDigits(emptyCode())
      setBusy(false)
      inputsRef.current[0]?.focus()
      return
    }
    const role = data.user ? await fetchRole(data.user.id) : null
    router.replace(role === 'admin' ? '/admin' : role === 'owner' ? '/dashboard' : '/browse')
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus()
    if (next.every((d) => d)) void verify(next.join(''))
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      inputsRef.current[index - 1]?.focus()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return
    const next = emptyCode()
    pasted.split('').forEach((digit, i) => { next[i] = digit })
    setDigits(next)
    if (pasted.length === CODE_LENGTH) void verify(pasted)
    else inputsRef.current[pasted.length]?.focus()
  }

  async function resend() {
    setError('')
    setNotice('')
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setBusy(false)
    if (error) setError(error.message)
    else setNotice('New code sent — check your inbox again in a few seconds.')
  }

  return (
    <main className="auth-page">
      <div className="auth-panel auth-brand-panel">
        <Link href="/" className="brand auth-brand"><span className="brand-mark"><img src="/lensshare-logo.png" alt="" /></span> LensShare</Link>
        <div className="auth-brand-copy">
          <span className="kicker">Local creatives marketplace</span>
          <h1>One last check.</h1>
          <p>Your code is waiting in your inbox — type it in and your LensShare workspace opens right up.</p>
        </div>
        <p className="auth-note"><MailCheck size={13} /> Insured rentals. Verified people. Clear payouts.</p>
      </div>
      <div className="auth-panel auth-form-panel">
        <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to LensShare</Link>
        <div className="auth-form-wrap">
          <span className="eyebrow">Confirm your email</span>
          <h2>Enter your 6-digit code</h2>
          {email ? (
            <p className="auth-subtitle">We sent a code to <b>{email}</b>. Enter it below to activate your account.</p>
          ) : (
            <p className="auth-subtitle">This screen verifies an email you just signed up with. <Link href="/signup">Start at sign up</Link>.</p>
          )}
          {email && (
            <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void verify(digits.join('')) }}>
              <div className="auth-otp-row">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputsRef.current[index] = el }}
                    className="auth-otp-box"
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    aria-label={`Digit ${index + 1}`}
                    value={digit}
                    disabled={busy}
                    onChange={(event) => handleChange(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={handlePaste}
                  />
                ))}
              </div>
              <button className="auth-submit" type="submit" disabled={busy || digits.some((d) => !d)}>
                {busy ? 'Checking…' : 'Verify & continue'} <ArrowLeft size={14} className="rotate-arrow" />
              </button>
              <p className="auth-resend">
                Didn&apos;t get it?
                <button type="button" onClick={() => void resend()} disabled={busy}>Send a new code</button>
              </p>
              {error && <p className="auth-error">{error}</p>}
              {notice && <p className="auth-success">{notice}</p>}
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

export default function VerifyPage() {
  return <Suspense><VerifyForm /></Suspense>
}
