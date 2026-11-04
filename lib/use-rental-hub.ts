'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchRentalHub, subscribeToRentalHub } from '@/lib/data'
import type { RentalHubData, RentalHubParty } from '@/lib/types'
import { deriveRentalWorkflow } from '@/lib/rental-workflow'

export function useRentalHub(bookingId?: string, party: RentalHubParty | null = null) {
  const [data, setData] = useState<RentalHubData | null>(null)
  const [loading, setLoading] = useState(Boolean(bookingId))
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async (quiet = false) => {
    if (!bookingId) {
      setData(null)
      setError(null)
      setLoading(false)
      return null
    }
    if (!quiet) setLoading(true)
    try {
      const next = await fetchRentalHub(bookingId)
      setData(next)
      setError(null)
      return next
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('Could not load the rental hub.')
      setError(nextError)
      throw nextError
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    let active = true
    void refresh().catch(() => undefined)
    if (!bookingId) return () => { active = false }
    const unsubscribe = subscribeToRentalHub(bookingId, () => {
      if (active) void refresh(true).catch(() => undefined)
    })
    const onFocus = () => { if (active && document.visibilityState === 'visible') void refresh(true).catch(() => undefined) }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [bookingId, refresh])

  return {
    data,
    hub: data,
    workflow: data ? deriveRentalWorkflow(data, party) : null,
    loading,
    error,
    refresh,
  }
}
