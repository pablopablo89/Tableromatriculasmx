import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Mapa from './Mapa.jsx'
import { normalizarEstado, SIN_DATO } from './estados.js'

// Lee el archivo Excel/CSV y devuelve las filas de la hoja de matrículas.
function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        // Preferimos una hoja llamada "Matriculas"; si no, la primera.
        const nombreHoja =
          wb.SheetNames.find((n) => /matricul/i.test(n)) || wb.SheetNames[0]
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], {
          defval: null,
        })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Detecta la columna de estado disponible en las filas.
function detectarColumnaEstado(rows) {
  if (!rows.length) return null
  const cols = Object.keys(rows[0])
  const candidatas = ['provincia', 'estado', 'estado_facturacion']
  for (const c of candidatas) {
    if (cols.includes(c)) return c
  }
  return cols.find((c) => /estado|provincia|entidad/i.test(c)) || null
}

const money = (n) =>
  n == null || isNaN(n)
    ? '—'
    : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

export default function App() {
  const [rows, setRows] = useState(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [error, setError] = useState('')
  const [colEstado, setColEstado] = useState(null)
  const [filtroPrograma, setFiltroPrograma] = useState('Todos')
  const [filtroEstatus, setFiltroEstatus] = useState('Todos')
  const [estadoActivo, setEstadoActivo] = useState(null)
  const inputRef = useRef(null)

  async function cargar(file) {
    if (!file) return
    setError('')
    try {
      const data = await leerArchivo(file)
      if (!data.length) {
        setError('El archivo no tiene filas de datos.')
        return
      }
      const col = detectarColumnaEstado(data)
      if (!col) {
        setError('No encontré una columna de estado/provincia en el archivo.')
        return
      }
      setColEstado(col)
      setRows(data)
      setNombreArchivo(file.name)
      setFiltroPrograma('Todos')
      setFiltroEstatus('Todos')
      setEstadoActivo(null)
    } catch (err) {
      setError('No pude leer el archivo: ' + err.message)
    }
  }

  // Opciones de filtro derivadas de los datos.
  const opciones = useMemo(() => {
    if (!rows) return { programas: [], estatus: [] }
    const uniq = (col) =>
      [...new Set(rows.map((r) => r[col]).filter((v) => v != null && v !== ''))].sort()
    return {
      programas: rows[0].tipo_programa !== undefined ? uniq('tipo_programa') : [],
      estatus: rows[0].Estatus !== undefined ? uniq('Estatus') : [],
    }
  }, [rows])

  // Filas tras aplicar los filtros activos.
  const filas = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (filtroPrograma !== 'Todos' && r.tipo_programa !== filtroPrograma) return false
      if (filtroEstatus !== 'Todos' && r.Estatus !== filtroEstatus) return false
      return true
    })
  }, [rows, filtroPrograma, filtroEstatus])

  // Agregado por estado: conteo e ingresos.
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

  // KPIs
  const total = filas.length
  const identificadas = porEstado
    .filter((e) => e.estado !== SIN_DATO)
    .reduce((a, b) => a + b.n, 0)
  const sinDato = total - identificadas
  const estadosDistintos = porEstado.filter((e) => e.estado !== SIN_DATO).length
  const ingresoTotal = porEstado.reduce((a, b) => a + b.ingresos, 0)
  const lider = porEstado.find((e) => e.estado !== SIN_DATO)

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
            Cargá tu base y mirá de qué estados vienen las matrículas. Todo se
            procesa en tu navegador — nada se sube a internet.
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
            <p className="drop-hint">
              Acepta .xlsx, .xls o .csv. Buscá tu archivo de matrículas.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="filtros">
            <span className="archivo">📄 {nombreArchivo} · {rows.length} filas</span>
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
              sub={lider ? `${lider.n} matrículas (${Math.round((lider.n / total) * 100)}%)` : ''}
            />
            <Kpi label="Ingresos (con descuento)" valor={money(ingresoTotal)} />
            {sinDato > 0 && (
              <Kpi label="Sin estado identificado" valor={sinDato} alerta />
            )}
          </div>

          <div className="grid">
            <div className="card mapa-card">
              <h2>Distribución geográfica</h2>
              <Mapa
                conteos={conteoPorEstado}
                estadoActivo={estadoActivo}
                onHover={setEstadoActivo}
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
                          (e.estado === SIN_DATO ? 'sindato' : '')
                        }
                        onMouseEnter={() => setEstadoActivo(e.estado)}
                        onMouseLeave={() => setEstadoActivo(null)}
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
            Consejo: si ves muchas en «No identificado», revisá cómo están
            escritos los estados en esa columna del Excel.
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
