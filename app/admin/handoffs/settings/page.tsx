'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock3, LockKeyhole, MapPin, ShieldAlert, Smartphone } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ErrorState } from '@/components/states'
import { fetchAdminHubSettings, saveAdminHubSettings } from '@/lib/data'
import { pesos, type HubSettings, type HubSettingsInput } from '@/lib/types'

const FIXED_DEPOSIT_AMOUNT = 2000

const EMPTY_SETTINGS: HubSettingsInput = {
  exact_address: '',
  location_notes: '',
  operating_hours: '',
  gcash_account_name: '',
  gcash_mobile_number: '',
  deposit_amount: FIXED_DEPOSIT_AMOUNT,
  deposit_policy: '',
}

export default function AdminHubSettingsPage() {
  const [values, setValues] = useState<HubSettingsInput>(EMPTY_SETTINGS)
  const [savedSettings, setSavedSettings] = useState<HubSettings | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setState('loading')
    setError('')
    try {
      const settings = await fetchAdminHubSettings()
      setSavedSettings(settings)
      setValues({
        exact_address: settings.exact_address ?? '',
        location_notes: settings.location_notes ?? '',
        operating_hours: settings.operating_hours ?? '',
        gcash_account_name: settings.gcash_account_name ?? '',
        gcash_mobile_number: settings.gcash_mobile_number ?? '',
        deposit_amount: FIXED_DEPOSIT_AMOUNT,
        deposit_policy: settings.deposit_policy ?? '',
      })
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the Naga Hub settings.')
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function change<Key extends keyof HubSettingsInput>(key: Key, value: HubSettingsInput[Key]) {
    setSaved(false)
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.exact_address.trim() || !values.operating_hours.trim() || !values.gcash_account_name.trim() || !values.gcash_mobile_number.trim() || !values.deposit_policy.trim()) {
      setError('Complete the exact address, operating hours, GCash details, and deposit policy before saving.')
      return
    }
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await saveAdminHubSettings({
        ...values,
        exact_address: values.exact_address.trim(),
        location_notes: values.location_notes.trim(),
        operating_hours: values.operating_hours.trim(),
        gcash_account_name: values.gcash_account_name.trim(),
        gcash_mobile_number: values.gcash_mobile_number.trim(),
        deposit_amount: FIXED_DEPOSIT_AMOUNT,
        deposit_policy: values.deposit_policy.trim(),
      })
      await load(false)
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the Naga Hub settings.')
    } finally {
      setSaving(false)
    }
  }

  return <AdminShell title="Naga Hub settings" subtitle="Maintain the exact desk location, operating hours, and manual deposit instructions used for hub hand-offs.">
    <div className="admin-handoff-detail-nav"><Link href="/admin/handoffs"><ArrowLeft size={13} /> Back to hand-off queue</Link>{savedSettings?.updated_at && <span>Last saved {new Date(savedSettings.updated_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</span>}</div>

    {state === 'error' ? <div className="admin-handoff-state"><ErrorState title="Hub settings unavailable" hint={error || 'The configured Naga Hub details could not be loaded.'} retry={() => void load()} /></div>
      : state === 'loading' && !saving ? <SettingsSkeleton />
        : <form className="admin-hub-settings" onSubmit={submit}>
          {error && <div className="admin-handoff-alert error" role="alert">{error}</div>}
          {saved && <div className="admin-handoff-alert success" role="status">Naga Hub settings saved.</div>}

          <section className="admin-handoff-panel">
            <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">PUBLIC MEETING POINT</span><h2>Exact Naga Hub location</h2><p>Only approved hub bookings should receive this exact address.</p></div><MapPin size={18} /></div>
            <div className="admin-hub-settings-fields">
              <label className="wide" htmlFor="hub-address"><span>Exact street address <b>Required</b></span><textarea id="hub-address" required maxLength={500} value={values.exact_address} onChange={(event) => change('exact_address', event.target.value)} placeholder="Building, street, barangay, Naga City, Camarines Sur" /></label>
              <label className="wide" htmlFor="hub-location-notes"><span>Arrival and landmark notes</span><textarea id="hub-location-notes" maxLength={700} value={values.location_notes} onChange={(event) => change('location_notes', event.target.value)} placeholder="Landmark, floor or unit, entrance, parking, and who to ask for." /></label>
            </div>
          </section>

          <section className="admin-handoff-panel">
            <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">DESK COVERAGE</span><h2>Operating hours</h2><p>Use exact days and staffed windows, including closure or appointment notes.</p></div><Clock3 size={18} /></div>
            <div className="admin-hub-settings-fields"><label className="wide" htmlFor="hub-hours"><span>Naga Hub hours <b>Required</b></span><textarea id="hub-hours" required maxLength={700} value={values.operating_hours} onChange={(event) => change('operating_hours', event.target.value)} placeholder={'Monday–Friday: 9:00 AM–6:00 PM\nSaturday: 10:00 AM–4:00 PM\nSunday: Closed'} /></label></div>
          </section>

          <section className="admin-handoff-panel">
            <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">MANUAL GCASH CHECK</span><h2>Deposit receiving details</h2><p>Staff compare renter-uploaded proof against these configured details.</p></div><Smartphone size={18} /></div>
            <div className="admin-handoff-proof-warning" role="note"><ShieldAlert size={18} /><p><strong>No provider confirmation or escrow.</strong> LensShare only stores staff’s manual visual review of submitted proof. The interface does not query GCash, guarantee settlement, hold funds, or provide an escrow service.</p></div>
            <div className="admin-hub-settings-fields">
              <label htmlFor="hub-gcash-name"><span>GCash account name <b>Required</b></span><input id="hub-gcash-name" required maxLength={160} autoComplete="off" value={values.gcash_account_name} onChange={(event) => change('gcash_account_name', event.target.value)} placeholder="Registered receiving name" /></label>
              <label htmlFor="hub-gcash-number"><span>GCash mobile number <b>Required</b></span><input id="hub-gcash-number" required maxLength={30} inputMode="tel" autoComplete="off" value={values.gcash_mobile_number} onChange={(event) => change('gcash_mobile_number', event.target.value)} placeholder="09XX XXX XXXX" /></label>
            </div>
          </section>

          <section className="admin-handoff-panel">
            <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">FIXED HUB POLICY</span><h2>{pesos(FIXED_DEPOSIT_AMOUNT)} deposit</h2><p>The configured hand-off deposit is fixed at ₱2,000 for this approved hub flow.</p></div><LockKeyhole size={18} /></div>
            <div className="admin-hub-deposit-lock"><div><small>Configured amount</small><strong>{pesos(FIXED_DEPOSIT_AMOUNT)}</strong><span>Locked for consistent queue and proof-review rules</span></div><input type="hidden" name="deposit_amount" value={FIXED_DEPOSIT_AMOUNT} /></div>
            <div className="admin-hub-settings-fields"><label className="wide" htmlFor="hub-deposit-policy"><span>Deposit instructions and policy <b>Required</b></span><textarea id="hub-deposit-policy" required maxLength={1800} value={values.deposit_policy} onChange={(event) => change('deposit_policy', event.target.value)} placeholder="Explain when proof is due, waiver eligibility, manual review, release conditions, and the issue-resolution process. Do not describe the deposit as escrow." /></label></div>
          </section>

          <div className="admin-hub-settings-actions"><p>Saving updates the centralized hub configuration used by the hand-off workflow. It does not perform or verify a payment.</p><button className="owner-button dark" type="submit" disabled={saving}>{saving ? 'Saving settings…' : 'Save hub settings'}</button></div>
        </form>}
  </AdminShell>
}

function SettingsSkeleton() {
  return <div className="admin-hub-settings-skeleton" aria-label="Loading hub settings" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i className="skeleton" /><i className="skeleton" /><i className="skeleton" /></div>)}</div>
}
