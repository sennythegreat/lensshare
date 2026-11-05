'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarOff, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useToast } from '@/components/toast'
import { fetchListingBlackouts, saveListingBlackouts } from '@/lib/data'

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function firstDayOfMonthGrid(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7 // Monday-first
}

export function BlackoutCalendar({ listingId }: { listingId: string }) {
  const toast = useToast()
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchListingBlackouts(listingId)
      .then((dates) => { if (!cancelled) setBlocked(new Set(dates)) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load blocked dates.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [listingId])

  const grid = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const startPad = firstDayOfMonthGrid(year, month)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: startPad }, () => null)
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(isoDate(new Date(year, month, day)))
    return { label: `${MONTH_LABELS[month]} ${year}`, cells, todayIso: isoDate(new Date()) }
  }, [cursor])

  function toggle(dateIso: string) {
    if (dateIso < grid.todayIso || saving || loading) return
    setError('')
    setBlocked((current) => {
      const next = new Set(current)
      if (next.has(dateIso)) next.delete(dateIso)
      else next.add(dateIso)
      return next
    })
  }

  async function persist() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await saveListingBlackouts(listingId, [...blocked].sort())
      setNote('Blocked dates saved. Renters cannot book this gear on them.')
      toast.success('Blocked dates saved.')
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save blocked dates.'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="owner-blackout" role="group" aria-label="Blocked availability dates">
    <div className="owner-blackout-head">
      <CalendarOff size={17} aria-hidden="true" />
      <div><b>Availability calendar</b><span>Tap a date to block or unblock it. Blocked dates are hidden from renters.</span></div>
    </div>
    {loading ? <p className="owner-blackout-status"><Loader2 size={14} className="owner-spin" aria-hidden="true" /> Loading blocked dates…</p>
      : <>
        <div className="owner-blackout-nav">
          <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <span>{grid.label}</span>
          <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        </div>
        <div className="owner-blackout-grid">
          {WEEKDAY_LABELS.map((day) => <span className="owner-blackout-weekday" key={day}>{day}</span>)}
          {grid.cells.map((dateIso, index) => dateIso === null
            ? <span key={`pad-${index}`} />
            : <button
                key={dateIso}
                type="button"
                disabled={dateIso < grid.todayIso}
                className={[
                  'owner-blackout-day',
                  blocked.has(dateIso) ? 'blocked' : '',
                  dateIso === grid.todayIso ? 'today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggle(dateIso)}
              >{Number(dateIso.slice(8))}</button>)}
        </div>
        <div className="owner-blackout-foot">
          <span>{blocked.size} blocked date{blocked.size === 1 ? '' : 's'}</span>
          <button className="owner-button dark" type="button" disabled={saving || loading} onClick={persist}>{saving ? 'Saving…' : 'Save blocked dates'}</button>
        </div>
        {note && !error && <p className="owner-blackout-status" role="status">{note}</p>}
      </>}
    {error && <p className="owner-blackout-status error" role="alert">{error}</p>}
  </div>
}
