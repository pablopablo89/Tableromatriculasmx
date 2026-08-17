import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'

const WIDTH = 640
const HEIGHT = 460

// Interpola un azul según la intensidad (0..1). Blanco -> azul intenso.
function color(t) {
  if (t <= 0) return '#eef2f7'
  const from = [219, 234, 254]
  const to = [30, 58, 138]
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export default function Mapa({
  conteos,
  estadoActivo,
  onHover,
  onSelect,
  seleccion, // null = nacional; {titulo, estados:[...]} = modo ciudad
  clusters,
  sinUbicar,
  onBack,
}) {
  const [geo, setGeo] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    fetch('/mexico-estados.json')
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo('error'))
  }, [])

  // ---------- Modo nacional ----------
  const nacional = useMemo(() => {
    if (!geo || geo === 'error' || seleccion) return null
    const projection = geoMercator().fitSize([WIDTH, HEIGHT], geo)
    const path = geoPath(projection)
    const maxN = Math.max(1, ...Object.values(conteos))
    const paths = geo.features.map((f) => ({
      nombre: f.properties.name,
      d: path(f),
      centroid: path.centroid(f),
      n: conteos[f.properties.name] || 0,
    }))
    return { paths, maxN }
  }, [geo, conteos, seleccion])

  // ---------- Modo ciudad (zoom + burbujas) ----------
  const ciudad = useMemo(() => {
    if (!geo || geo === 'error' || !seleccion) return null
    const feats = geo.features.filter((f) =>
      seleccion.estados.includes(f.properties.name)
    )
    if (!feats.length) return null
    const fc = { type: 'FeatureCollection', features: feats }
    const projection = geoMercator().fitExtent(
      [
        [26, 26],
        [WIDTH - 26, HEIGHT - 26],
      ],
      fc
    )
    const path = geoPath(projection)
    const paths = feats.map((f) => ({ nombre: f.properties.name, d: path(f) }))
    const maxN = Math.max(1, ...(clusters || []).map((c) => c.n))
    const puntos = (clusters || []).map((c) => {
      const xy = projection([c.lng, c.lat])
      return { ...c, x: xy ? xy[0] : null, y: xy ? xy[1] : null }
    })
    return { paths, puntos, maxN }
  }, [geo, seleccion, clusters])

  if (geo === 'error')
    return <div className="mapa-error">No se pudo cargar el mapa de México.</div>
  if (!geo) return <div className="mapa-loading">Cargando mapa…</div>

  // ============ RENDER CIUDAD ============
  if (seleccion && ciudad) {
    return (
      <div className="mapa-wrap">
        <div className="drill-head">
          <button className="btn-sec chico" onClick={onBack}>
            ← Volver a México
          </button>
          <span className="drill-titulo">{seleccion.titulo}</span>
        </div>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mapa-svg">
          {ciudad.paths.map((p) => (
            <path
              key={p.nombre}
              d={p.d}
              fill="#eef2f7"
              stroke="#94a3b8"
              strokeWidth={0.7}
            />
          ))}
          {ciudad.puntos
            .filter((c) => c.x != null)
            .map((c, i) => {
              const r = 7 + 22 * Math.sqrt(c.n / ciudad.maxN)
              return (
                <g key={i}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={r}
                    fill={color(0.35 + 0.55 * (c.n / ciudad.maxN))}
                    fillOpacity={0.78}
                    stroke="#1e3a8a"
                    strokeWidth={1}
                    className="cluster"
                    onMouseEnter={(e) =>
                      setTooltip({
                        titulo: c.muni,
                        detalle: `${c.n} matrícula${c.n === 1 ? '' : 's'} · ${
                          c.cps.length
                        } CP${c.cps.length === 1 ? '' : 's'}`,
                        cps: c.cps.slice(0, 8).join(', '),
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {c.n / ciudad.maxN > 0.15 && (
                    <text x={c.x} y={c.y} className="cluster-num">
                      {c.n}
                    </text>
                  )}
                </g>
              )
            })}
        </svg>

        <p className="drill-nota">
          Cada burbuja agrupa códigos postales cercanos · tamaño = matrículas.
          {sinUbicar > 0 && (
            <> {sinUbicar} matrícula(s) sin CP o con CP no reconocido.</>
          )}
        </p>

        {tooltip && (
          <div className="tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <strong>{tooltip.titulo}</strong>
            <br />
            {tooltip.detalle}
            <br />
            <span className="tooltip-cps">CP: {tooltip.cps}</span>
          </div>
        )}
      </div>
    )
  }

  // ============ RENDER NACIONAL ============
  return (
    <div className="mapa-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mapa-svg">
        {nacional.paths.map((p) => {
          const activo = p.nombre === estadoActivo
          return (
            <path
              key={p.nombre}
              d={p.d}
              fill={color(p.n / nacional.maxN)}
              stroke={activo ? '#0f172a' : '#94a3b8'}
              strokeWidth={activo ? 1.6 : 0.5}
              className={'estado-path' + (p.n > 0 ? ' clickable' : '')}
              onMouseEnter={(e) => {
                onHover(p.nombre)
                setTooltip({ titulo: p.nombre, detalle: `${p.n} matrícula${p.n === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })
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
              fill={p.n / nacional.maxN > 0.5 ? '#fff' : '#1e3a8a'}
            >
              {p.n}
            </text>
          ))}
      </svg>

      <Leyenda maxN={nacional.maxN} />
      <p className="drill-nota">Hacé clic en un estado con matrículas para ver el detalle por código postal.</p>

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
