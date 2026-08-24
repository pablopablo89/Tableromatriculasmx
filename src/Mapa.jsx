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
    const fc = { type: 'FeatureCollection', features: feats }
    const projection = geoMercator().fitExtent(
      [
        [30, 30],
        [WIDTH - 30, HEIGHT - 30],
      ],
      fc
    )
    const path = geoPath(projection)
    const paths = feats.map((f) => ({ nombre: nombre(f), d: path(f) }))
    const maxN = Math.max(1, ...(puntos || []).map((p) => p.n))
    const pts = (puntos || []).map((p) => {
      const xy = projection([p.lng, p.lat])
      return { ...p, x: xy ? xy[0] : null, y: xy ? xy[1] : null }
    })
    return { paths, pts, maxN }
  }, [geo, seleccion, puntos])

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
                    <text x={p.x} y={p.y} className="punto-num">
                      {p.n}
                    </text>
                  )}
                  {grande && (
                    <text x={p.x + r + 3} y={p.y + 3} className="punto-label">
                      {p.label}
                    </text>
                  )}
                </g>
              )
            })}
        </svg>
        <p className="drill-nota">
          Cada punto es {etiquetaFina === 'código postal' ? 'un' : 'una'}{' '}
          {etiquetaFina}, en su ubicación real · tamaño = matrículas.
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
