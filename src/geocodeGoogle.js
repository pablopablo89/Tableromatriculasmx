// Geocodificación de direcciones con el SDK JavaScript de Google Maps.
// Corre 100% en el navegador con la API key del usuario: las direcciones van
// directo del navegador del usuario a Google, nunca pasan por otro servidor.
import { detectarEnFilas, SINONIMOS } from './campos.js'

const PAIS_NOMBRE = { EC: 'Ecuador', MX: 'México' }
const norm = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Carga el SDK de Google Maps una sola vez.
export function cargarGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps && window.google.maps.Geocoder) return resolve()
    const viejo = document.getElementById('gmaps-sdk')
    if (viejo) viejo.remove()
    window.gm_authFailure = () =>
      reject(new Error('La API key fue rechazada por Google (revisá que la clave y la facturación estén bien).'))
    const s = document.createElement('script')
    s.id = 'gmaps-sdk'
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async`
    s.async = true
    s.onload = () => setTimeout(resolve, 400)
    s.onerror = () => reject(new Error('No se pudo cargar Google Maps (¿sin conexión o clave inválida?).'))
    document.head.appendChild(s)
  })
}

// ¿La base tiene con qué geocodificar (dirección o ciudad)?
export function puedeGeocodificar(rows) {
  return !!(detectarEnFilas(rows, SINONIMOS.direccion) || detectarEnFilas(rows, SINONIMOS.ciudad))
}

// Geocodifica las direcciones únicas y devuelve las filas enriquecidas con
// columnas Latitud/Longitud. onProgress({done,total,ok}) para la barra.
export async function geocodeDirecciones({ rows, codigoPais, onProgress }) {
  const colDir = detectarEnFilas(rows, SINONIMOS.direccion)
  const colCiu = detectarEnFilas(rows, SINONIMOS.ciudad)
  const colProv = detectarEnFilas(rows, SINONIMOS.mayor)
  if (!colDir && !colCiu) throw new Error('No encontré columna de dirección ni ciudad para geocodificar.')
  if (!(window.google && window.google.maps)) throw new Error('Google Maps no está cargado.')
  const geocoder = new window.google.maps.Geocoder()

  const claveDe = (r) => (norm(r[colDir]) + '|' + norm(r[colCiu])).toLowerCase()
  const unicas = new Map()
  for (const r of rows) {
    const dir = norm(r[colDir])
    const ciu = norm(r[colCiu])
    if (!dir && !ciu) continue
    const k = claveDe(r)
    if (!unicas.has(k)) unicas.set(k, { dir, ciu, prov: norm(colProv ? r[colProv] : '') })
  }

  const cache = new Map()
  let done = 0,
    ok = 0
  const total = unicas.size
  onProgress && onProgress({ done, total, ok })

  for (const [k, v] of unicas) {
    const address = [v.dir, v.ciu, v.prov, PAIS_NOMBRE[codigoPais] || '']
      .filter(Boolean)
      .join(', ')
    let intento = 0,
      hit = null
    while (intento < 4) {
      const r = await new Promise((resolve) => {
        try {
          geocoder.geocode(
            { address, componentRestrictions: { country: codigoPais } },
            (res, status) => {
              if (status === 'OK' && res && res[0]) {
                const l = res[0].geometry.location
                resolve({ lat: l.lat(), lng: l.lng() })
              } else if (status === 'OVER_QUERY_LIMIT') resolve('retry')
              else resolve(null)
            }
          )
        } catch {
          resolve(null)
        }
      })
      if (r === 'retry') {
        intento++
        await sleep(1200 * (intento + 1))
        continue
      }
      hit = r
      break
    }
    cache.set(k, hit || null)
    if (hit) ok++
    done++
    if (onProgress && (done % 5 === 0 || done === total)) onProgress({ done, total, ok })
    await sleep(60)
  }

  const out = rows.map((r) => {
    const tiene = norm(r[colDir]) || norm(r[colCiu])
    const hit = tiene ? cache.get(claveDe(r)) : null
    return {
      ...r,
      Latitud: hit ? Math.round(hit.lat * 1e6) / 1e6 : '',
      Longitud: hit ? Math.round(hit.lng * 1e6) / 1e6 : '',
    }
  })
  return { rows: out, stats: { total, ok } }
}
