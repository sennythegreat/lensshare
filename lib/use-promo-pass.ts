'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchMyPromoPasses } from '@/lib/data'
import type { PromoPass } from '@/lib/types'

export function usePromoPass(renterId?: string) {
  const [passes, setPasses] = useState<PromoPass[]>([])
  const [loading, setLoading] = useState(Boolean(renterId))
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!renterId) {
      setPasses([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setPasses(await fetchMyPromoPasses(renterId))
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not load your Saver Pass.')
    } finally {
      setLoading(false)
    }
  }, [renterId])

  useEffect(() => { void refresh() }, [refresh])

  return { passes, loading, error, refresh }
}
