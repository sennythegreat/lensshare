'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export function useProfile() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)
  const requestRef = useRef(0)
  const userIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (nextUser?: User | null, quiet = false) => {
    const request = ++requestRef.current
    if (!quiet && mountedRef.current) setLoading(true)
    const supabase = createClient()

    try {
      let activeUser = nextUser
      if (activeUser === undefined) {
        const { data, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        activeUser = data.user ?? null
      }
      if (!mountedRef.current || request !== requestRef.current) return

      userIdRef.current = activeUser?.id ?? null
      setUser(activeUser ?? null)
      if (!activeUser) {
        setProfile(null)
        setError(null)
        return
      }

      const { data: row, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', activeUser.id)
        .maybeSingle()
      if (profileError) throw profileError
      if (!mountedRef.current || request !== requestRef.current) return
      setProfile((row as Profile | null) ?? null)
      setError(null)
    } catch (cause) {
      if (!mountedRef.current || request !== requestRef.current) return
      setError(cause instanceof Error ? cause : new Error('Could not load your profile.'))
    } finally {
      if (mountedRef.current && request === requestRef.current) setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => loadProfile(undefined, true), [loadProfile])

  useEffect(() => {
    mountedRef.current = true
    const supabase = createClient()
    void loadProfile()

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null
      if (event === 'TOKEN_REFRESHED' && nextUser?.id === userIdRef.current) {
        setUser(nextUser)
        return
      }
      void loadProfile(nextUser, event !== 'SIGNED_OUT')
    })

    const profileChannel = supabase
      .channel(`own-profile:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const changedId = (payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id
        if (changedId && changedId === userIdRef.current) void loadProfile(undefined, true)
      })
      .subscribe()

    function refreshOnFocus() {
      if (document.visibilityState === 'visible') void loadProfile(undefined, true)
    }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      mountedRef.current = false
      requestRef.current += 1
      authSubscription.subscription.unsubscribe()
      void supabase.removeChannel(profileChannel)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [loadProfile])

  return { user, profile, loading, error, refresh }
}
