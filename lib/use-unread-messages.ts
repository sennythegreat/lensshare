'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchUnreadMessageCount } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'

// Unread direct-message count for the Messages nav badge. Refreshes on
// realtime message events, on route change (e.g. returning from a chat), and
// when the tab regains focus.
export function useUnreadMessages(): number {
  const { user } = useProfile()
  const pathname = usePathname()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) {
      setCount(0)
      return
    }
    let alive = true
    const refresh = () => {
      fetchUnreadMessageCount(user.id)
        .then((next) => { if (alive) setCount(next) })
        .catch(() => { /* badge is best-effort; ignore fetch errors */ })
    }
    refresh()

    const supabase = createClient()
    const channel = supabase
      .channel('unread-messages-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
      .subscribe()

    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
      void supabase.removeChannel(channel)
    }
  }, [user, pathname])

  return count
}
