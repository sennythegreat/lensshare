'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchUnseenBookingCount } from '@/lib/data'
import { useProfile } from '@/lib/use-profile'

// Count of the renter's bookings that changed since they last opened the
// bookings page — drives the My Bookings nav badge. Refreshes on realtime
// booking events (own rows only), on route change, and on window focus.
export function useUnseenBookings(): number {
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
      fetchUnseenBookingCount(user.id)
        .then((next) => { if (alive) setCount(next) })
        .catch(() => { /* badge is best-effort; ignore fetch errors */ })
    }
    refresh()

    const supabase = createClient()
    const channel = supabase
      .channel('unseen-bookings-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `renter_id=eq.${user.id}` },
        refresh,
      )
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
