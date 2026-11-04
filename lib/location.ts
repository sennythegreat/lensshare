export type Coordinates = { latitude: number; longitude: number }
export type LocationFix = Coordinates & { accuracy: number }

export function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}

export function pickupCoordinates(item: { pickup_latitude?: number | null; pickup_longitude?: number | null }): Coordinates | null {
  const { pickup_latitude: latitude, pickup_longitude: longitude } = item
  return typeof latitude === 'number' && typeof longitude === 'number' && validCoordinates(latitude, longitude)
    ? { latitude, longitude } : null
}

export function requestLocation(): Promise<LocationFix> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return Promise.reject(new Error('Location access needs HTTPS or localhost. You can still search by pickup area.'))
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('This browser does not support location access. You can still enter a pickup address or search an area.'))
  }
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (!validCoordinates(coords.latitude, coords.longitude) || !Number.isFinite(coords.accuracy) || coords.accuracy < 0) {
        reject(new Error('Your location could not be determined reliably. Please try again or enter an address.'))
        return
      }
      resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy })
    },
    (error) => reject(new Error(error.code === 1
      ? 'Location permission was not granted. You can still search by pickup area.'
      : error.code === 3
        ? 'Finding your location timed out. Try again or search by pickup area.'
        : 'Your location is unavailable. Try again or search by pickup area.')),
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
  ))
}

export function distanceKm(from: Coordinates, to: Coordinates): number {
  const radians = Math.PI / 180
  const latitudeDelta = (to.latitude - from.latitude) * radians
  const longitudeDelta = (to.longitude - from.longitude) * radians
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))))
}

export function formatDistance(km: number): string {
  if (km < 0.1) return 'under 100 m'
  return `${km.toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`
}
