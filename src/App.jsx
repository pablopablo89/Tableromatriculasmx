import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Mapa from './Mapa.jsx'
import { normalizarEstado, SIN_DATO } from './estados.js'
import { detectarColumnasCP, extraerCP, agrupar } from './cp.js'

// Ciudades que se interpretan como una sola (misma zona metropolitana).
// CDMX y Estado de México forman el Valle de México.
const MERGE = { 'Ciudad de México': 'valle', México: 'valle' }
const GRUPOS = {
  valle: {
    titulo: 'Valle de México (CDMX + Edo. de México)',
    estados: ['Ciudad de México', 'México'],
  },
}
function grupoDe(estado) {
  const g = MERGE[estado]
  return g ? GRUPOS[g] : { titulo: estado, estados: [estado] }
}

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const nombreHoja =
          wb.SheetNames.find((n) => /matricul/i.test(n)) || wb.SheetNames[0]
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: null }))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function detectarColumnaEstado(rows) {
  if (!rows.length) return null
  const cols = Object.keys(rows[0])
  for (const c of ['provincia', 'estado', 'estado_facturacion']) {
    if (cols.includes(c)) return c
  }
  return cols.find((c) => /estado|provincia|entidad/i.test(c)) || null
}

const money = (n) =>
  n == null || isNaN(n)
    ? '—'
    : n.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0,
      })

export default function App() {
  const [rows, setRows] = useState(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [error, setError] = useState('')
  const [colEstado, setColEstado] = useState(null)
  const [cpCols, setCpCols] = useState([])
  const [cpCoords, setCpCoords] = useState(null)
  const [filtroPrograma, setFiltroPrograma] = useState('Todos')
  const [filtroEstatus, setFiltroEstatus] = useState('Todos')
  const [estadoActivo, setEstadoActivo] = useState(null)
  const [seleccion, setSeleccion] = useState(null)
  const inputRef = useRef(null)

  // Carga diferida de coordenadas de CP (solo si la base trae códigos postales).
  useEffect(() => {
    if (cpCols.length && !cpCoords) {
      fetch('/cp-coords.json')
        .then((r) => r.json())
        .then(setCpCoords)
        .catch(() => {})
    }
  }, [cpCols, cpCoords])

  async function cargar(file) {
    if (!file) return
    setError('')
    try {
      const data = await leerArchivo(file)
      if (!data.length) return setError('El archivo no tiene filas de datos.')
      const col = detectarColumnaEstado(data)
      if (!col)
        return setError('No encontré una columna de estado/provincia en el archivo.')
      setColEstado(col)
      setCpCols(detectarColumnasCP(data))
      setRows(data)
      setNombreArchivo(file.name)
      setFiltroPrograma('Todos')
      setFiltroEstatus('Todos')
      setEstadoActivo(null)
      setSeleccion(null)
    } catch (err) {
      setError('No pude leer el archivo: ' + err.message)
    }
  }

  const opciones = useMemo(() => {
    if (!rows) return { programas: [], estatus: [] }
    const uniq = (col) =>
      [...new Set(rows.map((r) => r[col]).filter((v) => v != null && v !== ''))].sort()
    return {
      programas: rows[0].tipo_programa !== undefined ? uniq('tipo_programa') : [],
      estatus: rows[0].Estatus !== undefined ? uniq('Estatus') : [],
    }
  }, [rows])

  const filas = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (filtroPrograma !== 'Todos' && r.tipo_programa !== filtroPrograma) return false
      if (filtroEstatus !== 'Todos' && r.Estatus !== filtroEstatus) return false
      return true
    })
  }, [rows, filtroPrograma, filtroEstatus])

  const porEstado = useMemo(() => {
    const m = new Map()
    for (const r of filas) {
      const est = normalizarEstado(r[colEstado])
      const prev = m.get(est) || { estado: est, n: 0, ingresos: 0 }
      prev.n += 1
      const precio = Number(r.precio_con_descuento ?? r.precio_full ?? 0)
      if (!isNaN(precio)) prev.ingresos += precio
      m.set(est, prev)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [filas, colEstado])

  const conteoPorEstado = useMemo(() => {
    const o = {}
    for (const e of porEstado) o[e.estado] = e.n
    return o
  }, [porEstado])

  // CPs (ya extraídos y agregados) por estado normalizado.
  const cpsPorEstado = useMemo(() => {
    const m = new Map()
    if (!cpCols.length) return m
    for (const r of filas) {
      const cp = extraerCP(r, cpCols)
      if (!cp) continue
      const est = normalizarEstado(r[colEstado])
      if (!m.has(est)) m.set(est, new Map())
      const mm = m.get(est)
      mm.set(cp, (mm.get(cp) || 0) + 1)
    }
    return m
  }, [filas, cpCols, colEstado])

  const conCP = useMemo(() => {
    if (!cpCols.length) return 0
    let c = 0
    for (const r of filas) if (extraerCP(r, cpCols)) c++
    return c
  }, [filas, cpCols])

  // Clusters para el modo ciudad (agrupados por cercanía).
  const clusters = useMemo(() => {
    if (!seleccion || !cpCoords) return null
    const puntos = []
    for (const est of seleccion.estados) {
      const mm = cpsPorEstado.get(est)
      if (!mm) continue
      for (const [cp, n] of mm) {
        const rec = cpCoords.cp[cp]
        if (!rec) continue
        puntos.push({ cp, n, lat: rec[0], lng: rec[1], muni: cpCoords.munis[rec[2]] })
      }
    }
    return agrupar(puntos)
  }, [seleccion, cpCoords, cpsPorEstado])

  const total = filas.length
  const identificadas = porEstado
    .filter((e) => e.estado !== SIN_DATO)
    .reduce((a, b) => a + b.n, 0)
  const sinDato = total - identificadas
  const estadosDistintos = porEstado.filter((e) => e.estado !== SIN_DATO).length
  const ingresoTotal = porEstado.reduce((a, b) => a + b.ingresos, 0)
  const lider = porEstado.find((e) => e.estado !== SIN_DATO)

  // Estadísticas del drill actual.
  const drillTotal = seleccion
    ? porEstado
        .filter((e) => seleccion.estados.includes(e.estado))
        .reduce((a, b) => a + b.n, 0)
    : 0
  const drillUbicadas = clusters ? clusters.reduce((a, c) => a + c.n, 0) : 0
  const sinUbicar = drillTotal - drillUbicadas

  function abrirDrill(nombre) {
    if (nombre === SIN_DATO) return
    setSeleccion(grupoDe(nombre))
  }

  function onDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) cargar(f)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>🗺️ Tablero de Matrículas · México</h1>
          <p className="sub">
            Cargá tu base y mirá de qué estados vienen las matrículas. Hacé clic en
            un estado para bajar a nivel de código postal. Todo se procesa en tu
            navegador.
          </p>
        </div>
        {rows && (
          <button className="btn-sec" onClick={() => inputRef.current?.click()}>
            Cambiar archivo
          </button>
        )}
      </header>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => cargar(e.target.files?.[0])}
      />

      {error && <div className="error">{error}</div>}

      {!rows ? (
        <div
          className="dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="drop-inner">
            <div className="drop-icon">📂</div>
            <p className="drop-title">Arrastrá tu Excel acá o hacé clic</p>
            <p className="drop-hint">Acepta .xlsx, .xls o .csv.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="filtros">
            <span className="archivo">
              📄 {nombreArchivo} · {rows.length} filas
              {cpCols.length > 0 && (
                <> · CP en columna «{cpCols[0]}»</>
              )}
            </span>
            {opciones.programas.length > 0 && (
              <label>
                Programa
                <select
                  value={filtroPrograma}
                  onChange={(e) => setFiltroPrograma(e.target.value)}
                >
                  <option>Todos</option>
                  {opciones.programas.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
            {opciones.estatus.length > 0 && (
              <label>
                Estatus
                <select
                  value={filtroEstatus}
                  onChange={(e) => setFiltroEstatus(e.target.value)}
                >
                  <option>Todos</option>
                  {opciones.estatus.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="kpis">
            <Kpi label="Matrículas (filtradas)" valor={total} />
            <Kpi label="Estados distintos" valor={estadosDistintos} />
            <Kpi
              label="Estado líder"
              valor={lider ? lider.estado : '—'}
              sub={
                lider
                  ? `${lider.n} matrículas (${Math.round((lider.n / total) * 100)}%)`
                  : ''
              }
            />
            <Kpi label="Ingresos (con descuento)" valor={money(ingresoTotal)} />
            {cpCols.length > 0 && (
              <Kpi
                label="Con código postal"
                valor={`${conCP} / ${total}`}
                sub={conCP === 0 ? 'la columna CP está vacía' : ''}
                alerta={conCP === 0}
              />
            )}
            {sinDato > 0 && <Kpi label="Sin estado identificado" valor={sinDato} alerta />}
          </div>

          <div className="grid">
            <div className="card mapa-card">
              <h2>
                {seleccion ? 'Detalle por código postal' : 'Distribución geográfica'}
              </h2>
              <Mapa
                conteos={conteoPorEstado}
                estadoActivo={estadoActivo}
                onHover={setEstadoActivo}
                onSelect={abrirDrill}
                seleccion={seleccion}
                clusters={clusters}
                sinUbicar={sinUbicar}
                onBack={() => setSeleccion(null)}
              />
            </div>

            <div className="card tabla-card">
              <h2>Ranking por estado</h2>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Estado</th>
                      <th className="num">Matrículas</th>
                      <th className="num">%</th>
                      <th className="num">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porEstado.map((e, i) => (
                      <tr
                        key={e.estado}
                        className={
                          (e.estado === estadoActivo ? 'activo ' : '') +
                          (e.estado === SIN_DATO ? 'sindato ' : 'clickable')
                        }
                        onMouseEnter={() => setEstadoActivo(e.estado)}
                        onMouseLeave={() => setEstadoActivo(null)}
                        onClick={() => abrirDrill(e.estado)}
                      >
                        <td>{e.estado === SIN_DATO ? '—' : i + 1}</td>
                        <td>{e.estado}</td>
                        <td className="num">{e.n}</td>
                        <td className="num">{Math.round((e.n / total) * 100)}%</td>
                        <td className="num">{money(e.ingresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="pie">
            {cpCols.length === 0
              ? 'Tip: si tu base incluye una columna de código postal, el tablero la detecta sola y habilita el mapa por zonas al hacer clic en un estado.'
              : 'Tip: hacé clic en un estado (mapa o tabla) para ver las zonas por código postal.'}
          </p>
        </>
      )}
    </div>
  )
}

function Kpi({ label, valor, sub, alerta }) {
  return (
    <div className={'kpi' + (alerta ? ' kpi-alerta' : '')}>
      <div className="kpi-valor">{valor}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
