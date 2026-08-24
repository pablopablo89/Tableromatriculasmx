// Detección de columnas y geocodificación por cantón/ciudad para Ecuador.
import { slug } from './provincias.js'
import { detectarEnFilas, SINONIMOS } from './campos.js'

// Busca la columna de provincia (detección inteligente por sinónimos).
export function detectarColumnaProvincia(rows) {
  return detectarEnFilas(rows, SINONIMOS.mayor)
}

// Busca la columna de ciudad / cantón (la unidad fina para el zoom).
export function detectarColumnaCiudad(rows) {
  return detectarEnFilas(rows, SINONIMOS.ciudad)
}

// Construye un índice de cantones: slug -> {n, provincia, lat, lng}.
export function construirIndiceCantones(data) {
  const porSlug = new Map()
  for (const c of data.cantones) {
    porSlug.set(c.s, {
      n: c.n,
      provincia: c.p >= 0 ? data.provincias[c.p] : null,
      lat: c.lat,
      lng: c.lng,
    })
  }
  return porSlug
}

// Geocodifica un valor de ciudad/cantón. Si trae varios ("Guayaquil / Durán")
// toma el primero. Devuelve el cantón o null.
export function geocodificar(valor, indice) {
  if (valor == null) return null
  const bruto = String(valor).split(/[\/;,|]/)[0]
  const s = slug(bruto)
  if (!s) return null
  if (indice.has(s)) return indice.get(s)
  // Intento por inclusión (ej. "Cantón Guayaquil", "Guayaquil - Norte")
  for (const [clave, cant] of indice) {
    if (clave.length > 3 && (s.includes(clave) || clave.includes(s))) return cant
  }
  return null
}
