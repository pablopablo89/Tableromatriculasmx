import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'

const WIDTH = 640
const HEIGHT = 460

// Interpola un azul según la intensidad (0..1). Blanco -> azul intenso.
function color(t) {
  if (t <= 0) return '#eef2f7'
  const from = [219, 234, 254] // azul muy claro
  const to = [30, 58, 138] // azul intenso
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export default function Mapa({ conteos, estadoActivo, onHover }) {
  const [geo, setGeo] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    fetch('/mexico-estados.json')
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo('error'))
  }, [])

  const { paths, maxN } = useMemo(() => {
    if (!geo || geo === 'error') return { paths: [], maxN: 0 }
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
  }, [geo, conteos])

  if (geo === 'error')
    return <div className="mapa-error">No se pudo cargar el mapa de México.</div>
  if (!geo) return <div className="mapa-loading">Cargando mapa…</div>

  return (
    <div className="mapa-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mapa-svg">
        {paths.map((p) => {
          const activo = p.nombre === estadoActivo
          return (
            <path
              key={p.nombre}
              d={p.d}
              fill={color(p.n / maxN)}
              stroke={activo ? '#0f172a' : '#94a3b8'}
              strokeWidth={activo ? 1.6 : 0.5}
              className="estado-path"
              onMouseEnter={(e) => {
                onHover(p.nombre)
                setTooltip({ ...p, x: e.clientX, y: e.clientY })
              }}
              onMouseMove={(e) =>
                setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
              }
              onMouseLeave={() => {
                onHover(null)
                setTooltip(null)
              }}
            />
          )
        })}
        {/* Etiqueta con el número en los estados con matrículas */}
        {paths
          .filter((p) => p.n > 0 && p.centroid[0])
          .map((p) => (
            <text
              key={'t' + p.nombre}
              x={p.centroid[0]}
              y={p.centroid[1]}
              className="estado-num"
              fill={p.n / maxN > 0.5 ? '#fff' : '#1e3a8a'}
            >
              {p.n}
            </text>
          ))}
      </svg>

      <Leyenda maxN={maxN} />

      {tooltip && (
        <div
          className="tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <strong>{tooltip.nombre}</strong>
          <br />
          {tooltip.n} matrícula{tooltip.n === 1 ? '' : 's'}
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
