'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, UserRound, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function UserMenu({ initials, name, subtitle, links, settingsHref, triggerClassName }: {
  initials: string
  name: string
  subtitle: string
  links?: Array<{ href: string; label: string; icon?: LucideIcon }>
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
    <button type="button" className="user-menu-trigger" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="user-menu-name"><b>{name}</b><small>{subtitle}</small></span>
      <span className={triggerClassName}>{initials}</span>
    </button>
    {open && <div className="user-menu-panel">
      <div className="user-menu-head"><b>{name}</b><small>{subtitle}</small></div>
      {links?.map(({ href, label, icon: Icon = UserRound }) => <Link key={href} href={href} onClick={() => setOpen(false)}><Icon size={14} /> {label}</Link>)}
      {settingsHref && <Link href={settingsHref} onClick={() => setOpen(false)}><UserRound size={14} /> Account settings</Link>}
      <button type="button" onClick={signOut}><LogOut size={14} /> Sign out</button>
    </div>}
  </div>
}
