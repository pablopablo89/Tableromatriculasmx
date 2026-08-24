// México: detección y extracción de códigos postales.
import { detectarEnFilas, SINONIMOS } from './campos.js'

// Detecta la columna de CP (reconoce cp, código postal, cod_post, C.P., zip…).
export function detectarColumnasCP(rows) {
  const c = detectarEnFilas(rows, SINONIMOS.cp)
  return c ? [c] : []
}

// Primer CP (4–5 dígitos) de una celda; si trae varios toma el primero.
export function primerCP(valor) {
  if (valor == null) return null
  const m = String(valor).match(/\d{4,5}/)
  if (!m) return null
  return m[0].padStart(5, '0').slice(0, 5)
}

export function extraerCP(row, cols) {
  for (const c of cols) {
    const v = primerCP(row[c])
    if (v) return v
  }
  return null
}
