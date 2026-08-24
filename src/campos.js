// Detección inteligente de columnas: reconoce distintos nombres para el mismo
// campo ("cp", "Código Postal", "Cod_Post", "C.P." → todos = código postal),
// ignorando acentos, mayúsculas, guiones, puntos y espacios.

// Normaliza un encabezado a tokens comparables.
export function normHeader(h) {
  return String(h || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Sinónimos por campo lógico, en orden de prioridad (el primero que matchea gana).
export const SINONIMOS = {
  mayor: [
    'provincia', 'provincia facturacion', 'estado', 'entidad',
    'entidad federativa', 'departamento', 'depto', 'edo', 'state', 'region',
  ],
  ciudad: [
    'ciudad', 'canton', 'localidad', 'municipio', 'poblacion',
    'ciudad facturacion', 'ciudad residencia', 'canton residencia', 'city',
  ],
  cp: [
    'codigo postal', 'cod postal', 'cod post', 'codpostal', 'codigo cp',
    'cp', 'zip', 'zipcode', 'postal code', 'postal', 'c p',
  ],
  precio: [
    'precio con descuento', 'precio final', 'precio neto', 'monto pagado',
    'precio', 'monto', 'importe', 'valor', 'total pagado', 'total', 'price',
    'amount',
  ],
  programa: [
    'tipo programa', 'tipo de programa', 'programa', 'curso', 'carrera',
    'nivel', 'program',
  ],
  estatus: [
    'estatus', 'status', 'situacion', 'estado matricula',
    'estado de matricula', 'estado inscripcion', 'estado del alumno',
  ],
  lat: ['latitud', 'lat', 'latitude', 'y'],
  lng: ['longitud', 'lng', 'lon', 'long', 'longitude', 'x'],
  direccion: [
    'direccion facturacion', 'direccion', 'domicilio', 'address', 'calle',
    'direccion completa', 'street',
  ],
}

// Devuelve el nombre ORIGINAL de la columna que mejor matchea la lista de
// sinónimos, o null. Prioriza: match exacto > token exacto > inclusión.
export function detectarCampo(headers, sinonimos) {
  const norm = headers.map((h) => {
    const n = normHeader(h)
    return { orig: h, n, sinEsp: n.replace(/ /g, ''), tokens: n.split(' ') }
  })
  const syn = sinonimos.map((s) => normHeader(s))

  // 1) Igualdad exacta (con o sin espacios), en orden de prioridad de sinónimos.
  for (const s of syn) {
    const sinEsp = s.replace(/ /g, '')
    const hit = norm.find((h) => h.n === s || h.sinEsp === sinEsp)
    if (hit) return hit.orig
  }
  // 2) El sinónimo aparece como token completo del encabezado.
  for (const s of syn) {
    const hit = norm.find((h) => h.tokens.includes(s))
    if (hit) return hit.orig
  }
  // 3) Inclusión de subcadena (para sinónimos de 3+ letras).
  for (const s of syn) {
    if (s.length < 3) continue
    const hit = norm.find((h) => h.n.includes(s) || (s.includes(h.n) && h.n.length >= 3))
    if (hit) return hit.orig
  }
  return null
}

// Atajo: detecta un campo directamente desde las filas.
export function detectarEnFilas(rows, sinonimos) {
  if (!rows || !rows.length) return null
  return detectarCampo(Object.keys(rows[0]), sinonimos)
}
