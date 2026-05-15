export interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  address?: string
}

export async function getCurrentLocation(timeout = 10000): Promise<LocationData> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste dispositivo'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        const address = await reverseGeocode(latitude, longitude).catch(() => undefined)
        resolve({ latitude, longitude, accuracy, address })
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    )
  })
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TaxiVoucher/1.0 (jouberthnoe200@gmail.com)' },
    })
    if (!res.ok) return undefined
    const data = await res.json()
    const addr = data.address ?? {}
    const place = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? ''
    const state = addr.state ?? ''
    if (place || state) return [place, state].filter(Boolean).join(' - ')
    const display: string = data.display_name ?? ''
    return display.split(',').slice(0, 2).join(',').trim() || undefined
  } catch {
    return undefined
  }
}
