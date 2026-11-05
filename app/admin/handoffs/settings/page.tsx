'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock3, Coins, MapPin, ShieldAlert, Smartphone } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { ErrorState } from '@/components/states'
import { useToast } from '@/components/toast'
import { fetchAdminHubSettings, saveAdminHubSettings } from '@/lib/data'
import { type HubSettings, type HubSettingsInput } from '@/lib/types'

const DEFAULT_DEPOSIT_AMOUNT = 2000
const NAGA_HUB_DEFAULTS = {
  latitude: 13.6218,
  longitude: 123.1948,
  serviceRadiusKm: 15,
} as const

type HubGeoForm = {
  latitude: string
  longitude: string
  serviceRadiusKm: string
}

const EMPTY_SETTINGS: HubSettingsInput = {
  exact_address: '',
  location_notes: '',
  operating_hours: '',
  gcash_account_name: '',
  gcash_mobile_number: '',
  deposit_amount: DEFAULT_DEPOSIT_AMOUNT,
  deposit_policy: '',
  hub_latitude: NAGA_HUB_DEFAULTS.latitude,
  hub_longitude: NAGA_HUB_DEFAULTS.longitude,
  service_radius_km: NAGA_HUB_DEFAULTS.serviceRadiusKm,
}

function geoFormFromSettings(settings: Pick<HubSettingsInput, 'hub_latitude' | 'hub_longitude' | 'service_radius_km'>): HubGeoForm {
  return {
    latitude: settings.hub_latitude?.toString() ?? '',
    longitude: settings.hub_longitude?.toString() ?? '',
    serviceRadiusKm: settings.service_radius_km.toString(),
  }
}

export default function AdminHubSettingsPage() {
  const toast = useToast()
  const [values, setValues] = useState<HubSettingsInput>(EMPTY_SETTINGS)
  const [geoForm, setGeoForm] = useState<HubGeoForm>(() => geoFormFromSettings(EMPTY_SETTINGS))
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
      const nextValues: HubSettingsInput = {
        exact_address: settings.exact_address ?? '',
        location_notes: settings.location_notes ?? '',
        operating_hours: settings.operating_hours ?? '',
        gcash_account_name: settings.gcash_account_name ?? '',
        gcash_mobile_number: settings.gcash_mobile_number ?? '',
        deposit_amount: Number.isFinite(settings.deposit_amount) && settings.deposit_amount >= 0 ? settings.deposit_amount : DEFAULT_DEPOSIT_AMOUNT,
        deposit_policy: settings.deposit_policy ?? '',
        hub_latitude: settings.hub_latitude ?? null,
        hub_longitude: settings.hub_longitude ?? null,
        service_radius_km: Number.isFinite(settings.service_radius_km) ? settings.service_radius_km : NAGA_HUB_DEFAULTS.serviceRadiusKm,
      }
      setValues(nextValues)
      setGeoForm(geoFormFromSettings(nextValues))
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

  function changeGeo(key: keyof HubGeoForm, value: string) {
    setSaved(false)
    setGeoForm((current) => ({ ...current, [key]: value }))
  }

  function resetGeoDefaults() {
    const defaults: HubGeoForm = {
      latitude: NAGA_HUB_DEFAULTS.latitude.toString(),
      longitude: NAGA_HUB_DEFAULTS.longitude.toString(),
      serviceRadiusKm: NAGA_HUB_DEFAULTS.serviceRadiusKm.toString(),
    }
    setGeoForm(defaults)
    setValues((current) => ({
      ...current,
      hub_latitude: NAGA_HUB_DEFAULTS.latitude,
      hub_longitude: NAGA_HUB_DEFAULTS.longitude,
      service_radius_km: NAGA_HUB_DEFAULTS.serviceRadiusKm,
    }))
    setSaved(false)
    setError('')
  }

  function clearGeoCoordinates() {
    setGeoForm((current) => ({ ...current, latitude: '', longitude: '' }))
    setValues((current) => ({ ...current, hub_latitude: null, hub_longitude: null }))
    setSaved(false)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.exact_address.trim() || !values.operating_hours.trim() || !values.gcash_account_name.trim() || !values.gcash_mobile_number.trim() || !values.deposit_policy.trim()) {
      setError('Complete the exact address, operating hours, GCash details, and deposit policy before saving.')
      return
    }
    if (!Number.isFinite(Number(values.deposit_amount)) || Number(values.deposit_amount) < 0 || Number(values.deposit_amount) > 1000000) {
      setError('The default hub deposit must be a number between ₱0 and ₱1,000,000.')
      return
    }
    const latitudeText = geoForm.latitude.trim()
    const longitudeText = geoForm.longitude.trim()
    const radiusText = geoForm.serviceRadiusKm.trim()
    const latitude = latitudeText === '' ? null : Number(latitudeText)
    const longitude = longitudeText === '' ? null : Number(longitudeText)
    const serviceRadiusKm = Number(radiusText)
    if (!radiusText || !Number.isFinite(serviceRadiusKm) || serviceRadiusKm < 0.5 || serviceRadiusKm > 200) {
      setError('The service radius must be a number between 0.5 and 200 km.')
      return
    }
    if ((latitude === null) !== (longitude === null)) {
      setError('Set both hub coordinates together, or leave both blank to disable service-area enforcement.')
      return
    }
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setError('Hub latitude must be a number between −90 and 90.')
      return
    }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setError('Hub longitude must be a number between −180 and 180.')
      return
    }
    const nextValues: HubSettingsInput = {
      ...values,
      hub_latitude: latitude,
      hub_longitude: longitude,
      service_radius_km: serviceRadiusKm,
    }
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await saveAdminHubSettings({
        ...nextValues,
        exact_address: nextValues.exact_address.trim(),
        location_notes: nextValues.location_notes.trim(),
        operating_hours: nextValues.operating_hours.trim(),
        gcash_account_name: nextValues.gcash_account_name.trim(),
        gcash_mobile_number: nextValues.gcash_mobile_number.trim(),
        deposit_amount: Number(nextValues.deposit_amount),
        deposit_policy: nextValues.deposit_policy.trim(),
      })
      await load(false)
      setSaved(true)
      toast.success('Naga Hub settings saved.')
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save the Naga Hub settings.'
      setError(message)
      toast.error(message)
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
              <label htmlFor="hub-latitude"><span>Hub latitude <b>Optional</b></span><input id="hub-latitude" name="hub_latitude" type="number" inputMode="decimal" step="any" min={-90} max={90} value={geoForm.latitude} onChange={(event) => changeGeo('latitude', event.target.value)} placeholder={NAGA_HUB_DEFAULTS.latitude.toString()} aria-describedby="hub-geo-help" /></label>
              <label htmlFor="hub-longitude"><span>Hub longitude <b>Optional</b></span><input id="hub-longitude" name="hub_longitude" type="number" inputMode="decimal" step="any" min={-180} max={180} value={geoForm.longitude} onChange={(event) => changeGeo('longitude', event.target.value)} placeholder={NAGA_HUB_DEFAULTS.longitude.toString()} aria-describedby="hub-geo-help" /></label>
              <label htmlFor="hub-radius"><span>Service radius (km) <b>Required</b></span><input id="hub-radius" name="service_radius_km" type="number" inputMode="decimal" step="0.5" min={0.5} max={200} required value={geoForm.serviceRadiusKm} onChange={(event) => changeGeo('serviceRadiusKm', event.target.value)} placeholder={NAGA_HUB_DEFAULTS.serviceRadiusKm.toString()} aria-describedby="hub-radius-help" /></label>
              <div className="admin-handoff-proof-actions wide"><button className="owner-button" type="button" onClick={resetGeoDefaults}>Use Naga defaults</button><button className="owner-button" type="button" onClick={clearGeoCoordinates}>Clear coordinates</button></div>
              <p id="hub-geo-help" className="wide admin-hub-geo-note">Naga defaults: {NAGA_HUB_DEFAULTS.latitude}, {NAGA_HUB_DEFAULTS.longitude}. Enter both coordinates or leave both blank. Blank coordinates are saved as null and disable coordinate-based service-area enforcement.</p>
              <p id="hub-radius-help" className="wide admin-hub-geo-note">The service radius remains configured even when coordinates are blank. Allowed range: 0.5–200 km; default: {NAGA_HUB_DEFAULTS.serviceRadiusKm} km.</p>
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
            <div className="admin-handoff-section-head"><div><span className="admin-eyebrow">DEPOSIT POLICY</span><h2>Default hub deposit</h2><p>Applied to bookings of listings that do not set their own security deposit. Owners set per-item deposits on each listing.</p></div><Coins size={18} /></div>
            <div className="admin-hub-settings-fields">
              <label htmlFor="hub-deposit-amount"><span>Default deposit amount (PHP) <b>Required</b></span><input id="hub-deposit-amount" name="deposit_amount" type="number" inputMode="decimal" min={0} max={1000000} step="0.01" required value={values.deposit_amount} onChange={(event) => change('deposit_amount', Number(event.target.value))} aria-describedby="hub-deposit-help" /></label>
              <p id="hub-deposit-help" className="wide admin-hub-geo-note">Existing bookings keep the deposit amount recorded at booking time. Verified students are always fully waived.</p>
              <label className="wide" htmlFor="hub-deposit-policy"><span>Deposit instructions and policy <b>Required</b></span><textarea id="hub-deposit-policy" required maxLength={1800} value={values.deposit_policy} onChange={(event) => change('deposit_policy', event.target.value)} placeholder="Explain when proof is due, waiver eligibility, manual review, release conditions, and the issue-resolution process. Do not describe the deposit as escrow." /></label>
            </div>
          </section>

          <div className="admin-hub-settings-actions"><p>Saving updates the centralized hub configuration used by the hand-off workflow. It does not perform or verify a payment.</p><button className="owner-button dark" type="submit" disabled={saving}>{saving ? 'Saving settings…' : 'Save hub settings'}</button></div>
        </form>}
  </AdminShell>
}

function SettingsSkeleton() {
  return <div className="admin-hub-settings-skeleton" aria-label="Loading hub settings" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i className="skeleton" /><i className="skeleton" /><i className="skeleton" /></div>)}</div>
}
