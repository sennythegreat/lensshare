'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function UserMenu({ initials, name, subtitle, settingsHref, triggerClassName }: {
  initials: string
  name: string
  subtitle: string
  settingsHref?: string
  triggerClassName: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return <div className="user-menu" ref={ref}>
    <button type="button" className={triggerClassName} aria-label="Account menu" aria-expanded={open} onClick={() => setOpen(!open)}>{initials}</button>
    {open && <div className="user-menu-panel">
      <div className="user-menu-head"><b>{name}</b><small>{subtitle}</small></div>
      {settingsHref && <Link href={settingsHref} onClick={() => setOpen(false)}><UserRound size={14} /> Account settings</Link>}
      <button type="button" onClick={signOut}><LogOut size={14} /> Sign out</button>
    </div>}
  </div>
}
