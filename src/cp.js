// Utilidades para códigos postales: detección de columnas, extracción del
// primer CP de una celda, y agrupamiento de CPs por cercanía geográfica.

// Busca en los encabezados las columnas que parezcan de código postal.
// Devuelve los nombres en el orden en que aparecen (se usa el primero).
export function detectarColumnasCP(rows) {
  if (!rows.length) return []
  const re = /(c[oó]digo.?postal)|(codigo_?postal)|(^\s*c\.?\s*p\.?\s*$)|zip|postal|\bcp\b/i
  return Object.keys(rows[0]).filter((c) => re.test(c))
}

// Extrae el primer código postal (4–5 dígitos) de un valor. Si la celda trae
// varios ("06000, 06010") toma el primero. Rellena a 5 dígitos.
export function primerCP(valor) {
  if (valor == null) return null
  const m = String(valor).match(/\d{4,5}/)
  if (!m) return null
  return m[0].padStart(5, '0').slice(0, 5)
}

// Dado un registro y las columnas CP detectadas, devuelve el primer CP válido.
export function extraerCP(row, cols) {
  for (const c of cols) {
    const v = primerCP(row[c])
    if (v) return v
  }
  return null
}

// Distancia entre dos puntos (km).
export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371,
    toR = Math.PI / 180
  const dLat = (bLat - aLat) * toR,
    dLng = (bLng - aLng) * toR
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Radio de agrupamiento adaptado a la extensión de los puntos.
export function radioSugerido(puntos) {
  if (puntos.length < 2) return 2
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity
  for (const p of puntos) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  const diag = haversineKm(minLat, minLng, maxLat, maxLng)
  return Math.max(1.5, Math.min(60, diag * 0.06))
}

// Agrupa puntos {cp, lat, lng, n, muni} por cercanía (greedy, semilla por peso).
// Devuelve clusters con centroide ponderado, total, municipio dominante y CPs.
export function agrupar(puntos, radioKm) {
  const R = radioKm ?? radioSugerido(puntos)
  const usados = new Array(puntos.length).fill(false)
  const orden = [...puntos.keys()].sort((a, b) => puntos[b].n - puntos[a].n)
  const clusters = []
  for (const i of orden) {
    if (usados[i]) continue
    usados[i] = true
    const miembros = [puntos[i]]
    for (const j of orden) {
      if (usados[j]) continue
      if (haversineKm(puntos[i].lat, puntos[i].lng, puntos[j].lat, puntos[j].lng) <= R) {
        usados[j] = true
        miembros.push(puntos[j])
      }
    }
    const n = miembros.reduce((a, m) => a + m.n, 0)
    const lat = miembros.reduce((a, m) => a + m.lat * m.n, 0) / n
    const lng = miembros.reduce((a, m) => a + m.lng * m.n, 0) / n
    const mc = {}
    miembros.forEach((m) => (mc[m.muni] = (mc[m.muni] || 0) + m.n))
    const muni = Object.entries(mc).sort((a, b) => b[1] - a[1])[0][0]
    clusters.push({
      lat,
      lng,
      n,
      muni,
      cps: [...new Set(miembros.map((m) => m.cp))],
    })
  }
  return clusters.sort((a, b) => b.n - a.n)
}
