import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { formatoMoneda } from './comun.js'

const WIDTH = 640
const HEIGHT = 480

function color(t) {
  if (t <= 0) return '#eef2f7'
  const from = [207, 250, 254]
  const to = [14, 116, 144]
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

// Ajusta una proyección Mercator a un conjunto de features usando los límites
// PLANARES de sus coordenadas proyectadas. Es inmune al orden de vértices
// (winding) del GeoJSON, a diferencia de fitExtent (que usa límites esféricos y
// puede romperse con datos mal orientados).
function ajustarProyeccion(features, w, h, pad = 30) {
  const proj = geoMercator().scale(1).translate([0, 0])
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  const each = (coord) => {
    const p = proj(coord)
    if (p && isFinite(p[0]) && isFinite(p[1])) {
      if (p[0] < x0) x0 = p[0]
      if (p[0] > x1) x1 = p[0]
      if (p[1] < y0) y0 = p[1]
      if (p[1] > y1) y1 = p[1]
    }
  }
  const walk = (a) => {
    if (typeof a[0] === 'number') each(a)
    else a.forEach(walk)
  }
  for (const f of features) if (f.geometry) walk(f.geometry.coordinates)
  const dx = x1 - x0,
    dy = y1 - y0
  if (!(dx > 0) || !(dy > 0)) return proj
  const s = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy)
  return proj.scale(s).translate([(w - s * (x0 + x1)) / 2, (h - s * (y0 + y1)) / 2])
}

// Recorre los anillos (arrays de pares [lng,lat]) de una geometría sin importar
// la profundidad de anidado ni el `type` declarado (tolera GeoJSON malformado).
function porAnillo(node, cb) {
  if (!Array.isArray(node)) return
  if (Array.isArray(node[0]) && typeof node[0][0] === 'number') {
    cb(node)
    return
  }
  for (const child of node) porAnillo(child, cb)
}

// Ajusta la proyección al conjunto de PUNTOS (para meterse a nivel ciudad
// cuando ubicamos por dirección). Usa un mínimo de extensión para no sobre-zoomear.
function ajustarAPuntosProj(puntos, w, h, pad = 40) {
  const proj = geoMercator().scale(1).translate([0, 0])
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const p of puntos) {
    const q = proj([p.lng, p.lat])
    if (!q || !isFinite(q[0]) || !isFinite(q[1])) continue
    if (q[0] < x0) x0 = q[0]
    if (q[0] > x1) x1 = q[0]
    if (q[1] < y0) y0 = q[1]
    if (q[1] > y1) y1 = q[1]
  }
  if (!isFinite(x0)) return null
  let cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2
  const min = 0.0009 // ~evita zoom infinito con 1 solo punto
  let dx = Math.max(x1 - x0, min),
    dy = Math.max(y1 - y0, min)
  const s = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy)
  return proj.scale(s).translate([w / 2 - s * cx, h / 2 - s * cy])
}

// Construye el path SVG proyectando cada vértice (planar). No usa geoPath, así
// que es inmune al winding y al anidado del GeoJSON.
function pathPlanar(feature, proj) {
  const g = feature.geometry
  if (!g) return ''
  let d = ''
  porAnillo(g.coordinates, (ring) => {
    let s = ''
    let started = false
    for (const c of ring) {
      const p = proj(c)
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue
      s += (started ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)
      started = true
    }
    if (started) d += s + 'Z'
  })
  return d
}

export default function Mapa({
  mapaUrl,
  propNombre,
  moneda,
  conteos,
  activo,
  onHover,
  onSelect,
  seleccion, // null = nacional; {titulo, provincias:[...]} = zoom
  puntos,
  ajustarAPuntos,
  sinUbicar,
  etiquetaFina,
  onBack,
}) {
  const [geo, setGeo] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    setGeo(null)
    fetch(mapaUrl)
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo('error'))
  }, [mapaUrl])

  const nombre = (f) => f.properties[propNombre]

  const nacional = useMemo(() => {
    if (!geo || geo === 'error' || seleccion) return null
    const projection = geoMercator().fitSize([WIDTH, HEIGHT], geo)
    const path = geoPath(projection)
    const maxN = Math.max(1, ...Object.values(conteos))
    const paths = geo.features.map((f) => ({
      nombre: nombre(f),
      d: path(f),
      centroid: path.centroid(f),
      n: conteos[nombre(f)] || 0,
    }))
    return { paths, maxN }
  }, [geo, conteos, seleccion])

  const zoom = useMemo(() => {
    if (!geo || geo === 'error' || !seleccion) return null
    const feats = geo.features.filter((f) => seleccion.provincias.includes(nombre(f)))
    if (!feats.length) return null
    // Con coordenadas por dirección, hacemos zoom a los puntos (nivel ciudad);
    // si no, ajustamos a la provincia/estado.
    let projection = null
    if (ajustarAPuntos && puntos && puntos.length) {
      projection = ajustarAPuntosProj(puntos, WIDTH, HEIGHT, 40)
    }
    if (!projection) projection = ajustarProyeccion(feats, WIDTH, HEIGHT, 30)
    const paths = feats.map((f) => ({ nombre: nombre(f), d: pathPlanar(f, projection) }))
    const maxN = Math.max(1, ...(puntos || []).map((p) => p.n))
    const pts = (puntos || []).map((p) => {
      const xy = projection([p.lng, p.lat])
      return { ...p, x: xy ? xy[0] : null, y: xy ? xy[1] : null }
    })
    return { paths, pts, maxN }
  }, [geo, seleccion, puntos, ajustarAPuntos])

  if (geo === 'error')
    return <div className="mapa-error">No se pudo cargar el mapa.</div>
  if (!geo) return <div className="mapa-loading">Cargando mapa…</div>

  // ===== ZOOM =====
  if (seleccion && zoom) {
    return (
      <div className="mapa-wrap">
        <div className="drill-head">
          <button className="btn-sec chico" onClick={onBack}>
            ← Volver al mapa nacional
          </button>
          <span className="drill-titulo">{seleccion.titulo}</span>
        </div>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mapa-svg">
          {zoom.paths.map((p) => (
            <path key={p.nombre} d={p.d} fill="#eef2f7" stroke="#94a3b8" strokeWidth={0.7} />
          ))}
          {zoom.pts
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            .map((p, i) => {
              const r = 5 + 20 * Math.sqrt(p.n / zoom.maxN)
              const grande = p.n / zoom.maxN > 0.18
              return (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={color(0.4 + 0.55 * (p.n / zoom.maxN))}
                    fillOpacity={0.8}
                    stroke="#0e7490"
                    strokeWidth={1}
                    className="punto"
                    onMouseEnter={(e) =>
                      setTooltip({
                        titulo: p.label,
                        detalle: `${p.n} matrícula${p.n === 1 ? '' : 's'}`,
                        sub: [p.subtitulo, formatoMoneda(p.ingresos, moneda)]
                          .filter(Boolean)
                          .join(' · '),
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {grande && (
                    <text
                      x={p.x}
                      y={p.y}
                      className="punto-num"
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                    >
                      {p.n}
                    </text>
                  )}
                  {grande && (
                    <text
                      x={p.x + r + 3}
                      y={p.y + 3}
                      className="punto-label"
                      fontSize={11}
                      fontWeight="600"
                      fill="#0f172a"
                      stroke="#fff"
                      strokeWidth={2.5}
                      paintOrder="stroke"
                    >
                      {p.label}
                    </text>
                  )}
                </g>
              )
            })}
        </svg>
        <p className="drill-nota">
          Cada punto es una zona ({etiquetaFina}), en su ubicación real · tamaño =
          matrículas.
          {sinUbicar > 0 && <> {sinUbicar} sin ubicar (dato faltante o no reconocido).</>}
        </p>
        {tooltip && (
          <div className="tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <strong>{tooltip.titulo}</strong>
            <br />
            {tooltip.detalle}
            {tooltip.sub && (
              <>
                <br />
                <span className="tooltip-sub">{tooltip.sub}</span>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // En transición (cambio de país con selección o mapa aún cargando) esperamos.
  if (seleccion || !nacional)
    return <div className="mapa-loading">Cargando…</div>

  // ===== NACIONAL =====
  return (
    <div className="mapa-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mapa-svg">
        {nacional.paths.map((p) => {
          const act = p.nombre === activo
          return (
            <path
              key={p.nombre}
              d={p.d}
              fill={color(p.n / nacional.maxN)}
              stroke={act ? '#0f172a' : '#94a3b8'}
              strokeWidth={act ? 1.6 : 0.5}
              className={'estado-path' + (p.n > 0 ? ' clickable' : '')}
              onMouseEnter={(e) => {
                onHover(p.nombre)
                setTooltip({
                  titulo: p.nombre,
                  detalle: `${p.n} matrícula${p.n === 1 ? '' : 's'}`,
                  x: e.clientX,
                  y: e.clientY,
                })
              }}
              onMouseMove={(e) =>
                setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
              }
              onMouseLeave={() => {
                onHover(null)
                setTooltip(null)
              }}
              onClick={() => p.n > 0 && onSelect(p.nombre)}
            />
          )
        })}
        {nacional.paths
          .filter((p) => p.n > 0 && p.centroid[0])
          .map((p) => (
            <text
              key={'t' + p.nombre}
              x={p.centroid[0]}
              y={p.centroid[1]}
              className="estado-num"
              fontSize={10}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="central"
              fill={p.n / nacional.maxN > 0.5 ? '#fff' : '#0e7490'}
            >
              {p.n}
            </text>
          ))}
      </svg>
      <Leyenda maxN={nacional.maxN} />
      <p className="drill-nota">
        Hacé clic en una zona con matrículas para ver el detalle por {etiquetaFina}.
      </p>
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <strong>{tooltip.titulo}</strong>
          <br />
          {tooltip.detalle}
        </div>
      )}
    </div>
  )
}

function Leyenda({ maxN }) {
  const pasos = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div className="leyenda">
      <span className="leyenda-label">Menos</span>
      {pasos.map((t) => (
        <span key={t} className="leyenda-caja" style={{ background: color(t) }} />
      ))}
      <span className="leyenda-label">Más ({maxN})</span>
    </div>
  )
}
