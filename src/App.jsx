import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Mapa from './Mapa.jsx'
import { PAISES } from './paises.js'
import { SIN_DATO, formatoMoneda } from './comun.js'
import { detectarEnFilas, SINONIMOS } from './campos.js'
import { generarReportePDF } from './reporte.js'

function resolvePrecio(row, col) {
  if (!col || row[col] == null || row[col] === '') return 0
  const v = Number(row[col])
  return isNaN(v) ? 0 : v
}

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const hoja = wb.SheetNames.find((n) => /matricul/i.test(n)) || wb.SheetNames[0]
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null }))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export default function App() {
  const [paisId, setPaisId] = useState('mx')
  const pais = PAISES[paisId]

  const [rows, setRows] = useState(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [error, setError] = useState('')
  const [colMayor, setColMayor] = useState(null)
  const [finoCols, setFinoCols] = useState(null)
  const [finoData, setFinoData] = useState(null)
  const [filtroPrograma, setFiltroPrograma] = useState('Todos')
  const [filtroEstatus, setFiltroEstatus] = useState('Todos')
  const [activo, setActivo] = useState(null)
  const [seleccion, setSeleccion] = useState(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const inputRef = useRef(null)

  // Al cambiar de país: reiniciar todo y cargar su dataset fino.
  useEffect(() => {
    setRows(null)
    setNombreArchivo('')
    setError('')
    setSeleccion(null)
    setActivo(null)
    setFinoData(null)
    let vivo = true
    const entradas = Object.entries(pais.fino.datasets)
    Promise.all(
      entradas.map(([k, url]) =>
        fetch(url)
          .then((r) => r.json())
          .then((d) => [k, d])
      )
    )
      .then((pares) => {
        if (vivo) setFinoData({ pais: pais.id, data: Object.fromEntries(pares) })
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [paisId])

  // El geocodificador solo se arma si el dataset cargado es el del país actual
  // (evita mezclar datos de un país con la lógica de otro durante el cambio).
  const geocoder = useMemo(
    () =>
      finoData && finoData.pais === paisId ? pais.fino.preparar(finoData.data) : null,
    [finoData, paisId]
  )

  async function cargar(file) {
    if (!file) return
    setError('')
    try {
      const data = await leerArchivo(file)
      if (!data.length) return setError('El archivo no tiene filas de datos.')
      const col = pais.detectarColumnaMayor(data)
      if (!col)
        return setError(
          `No encontré una columna de ${pais.unidadMayor} en el archivo.`
        )
      setColMayor(col)
      setFinoCols(pais.fino.detectar(data))
      setRows(data)
      setNombreArchivo(file.name)
      setFiltroPrograma('Todos')
      setFiltroEstatus('Todos')
      setSeleccion(null)
      setActivo(null)
    } catch (err) {
      setError('No pude leer el archivo: ' + err.message)
    }
  }

  // Detección inteligente de columnas de programa, estatus y precio.
  const campos = useMemo(() => {
    if (!rows) return { programa: null, estatus: null, precio: null }
    return {
      programa: detectarEnFilas(rows, SINONIMOS.programa),
      estatus: detectarEnFilas(rows, SINONIMOS.estatus),
      precio: detectarEnFilas(rows, SINONIMOS.precio),
    }
  }, [rows])

  const opciones = useMemo(() => {
    if (!rows) return { programas: [], estatus: [] }
    const uniq = (col) =>
      [...new Set(rows.map((r) => r[col]).filter((v) => v != null && v !== ''))].sort()
    return {
      programas: campos.programa ? uniq(campos.programa) : [],
      estatus: campos.estatus ? uniq(campos.estatus) : [],
    }
  }, [rows, campos])

  const filas = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (filtroPrograma !== 'Todos' && r[campos.programa] !== filtroPrograma) return false
      if (filtroEstatus !== 'Todos' && r[campos.estatus] !== filtroEstatus) return false
      return true
    })
  }, [rows, filtroPrograma, filtroEstatus, campos])

  const porMayor = useMemo(() => {
    const m = new Map()
    for (const r of filas) {
      const est = pais.normalizar(r[colMayor])
      const prev = m.get(est) || { estado: est, n: 0, ingresos: 0 }
      prev.n += 1
      prev.ingresos += resolvePrecio(r, campos.precio)
      m.set(est, prev)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [filas, colMayor, paisId, campos])

  const conteos = useMemo(() => {
    const o = {}
    for (const e of porMayor) o[e.estado] = e.n
    return o
  }, [porMayor])

  const hayFino = finoCols ? pais.fino.hayCols(finoCols) : false

  const conFino = useMemo(() => {
    if (!hayFino || !geocoder) return 0
    let c = 0
    for (const r of filas) if (geocoder.geocode(r, finoCols)) c++
    return c
  }, [filas, finoCols, geocoder, hayFino])

  // Puntos del zoom (cada CP/ciudad su propio punto, en su ubicación real).
  const puntos = useMemo(() => {
    if (!seleccion || !geocoder || !hayFino) return null
    const m = new Map()
    for (const r of filas) {
      if (!seleccion.provincias.includes(pais.normalizar(r[colMayor]))) continue
      const g = geocoder.geocode(r, finoCols)
      if (!g) continue
      const prev =
        m.get(g.key) || {
          label: g.label,
          subtitulo: g.subtitulo,
          lat: g.lat,
          lng: g.lng,
          n: 0,
          ingresos: 0,
        }
      prev.n += 1
      prev.ingresos += resolvePrecio(r, campos.precio)
      m.set(g.key, prev)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [seleccion, geocoder, finoCols, filas, colMayor, paisId, campos])

  const total = filas.length
  const identificadas = porMayor
    .filter((e) => e.estado !== SIN_DATO)
    .reduce((a, b) => a + b.n, 0)
  const sinDato = total - identificadas
  const distintos = porMayor.filter((e) => e.estado !== SIN_DATO).length
  const ingresoTotal = porMayor.reduce((a, b) => a + b.ingresos, 0)
  const lider = porMayor.find((e) => e.estado !== SIN_DATO)
  const tienePrecio = !!campos.precio

  const drillTotal = seleccion
    ? porMayor
        .filter((e) => seleccion.provincias.includes(e.estado))
        .reduce((a, b) => a + b.n, 0)
    : 0
  const drillUbicadas = puntos ? puntos.reduce((a, p) => a + p.n, 0) : 0
  const sinUbicar = drillTotal - drillUbicadas

  function abrirDrill(nombre) {
    if (nombre === SIN_DATO) return
    setSeleccion(pais.grupo(nombre))
  }

  async function descargarPDF() {
    setGenerandoPdf(true)
    try {
      await generarReportePDF({
        pais,
        nombreArchivo,
        filtros: { programa: filtroPrograma, estatus: filtroEstatus },
        total,
        distintos,
        sinDato,
        ingresoTotal,
        tienePrecio,
        conFino: hayFino ? conFino : null,
        lider,
        porMayor,
        seleccion,
        puntos,
      })
    } catch (err) {
      setError('No pude generar el PDF: ' + err.message)
    } finally {
      setGenerandoPdf(false)
    }
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
          <h1>🗺️ Tablero de Matrículas</h1>
          <p className="sub">
            Elegí el país, cargá tu base y mirá de qué zonas vienen las
            matrículas. Hacé clic en {pais.unidadMayor === 'estado' ? 'un' : 'una'}{' '}
            {pais.unidadMayor} para bajar a nivel de {pais.etiquetaFina}. Todo se
            procesa en tu navegador.
          </p>
        </div>
        <div className="pais-sel">
          {Object.values(PAISES).map((p) => (
            <button
              key={p.id}
              className={'pais-btn' + (p.id === paisId ? ' activo' : '')}
              onClick={() => setPaisId(p.id)}
            >
              <span className="pais-bandera">{p.bandera}</span> {p.nombre}
            </button>
          ))}
        </div>
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
            <p className="drop-title">
              Arrastrá tu Excel de {pais.bandera} {pais.nombre} o hacé clic
            </p>
            <p className="drop-hint">Acepta .xlsx, .xls o .csv.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="filtros">
            <button className="btn-sec" onClick={() => inputRef.current?.click()}>
              Cambiar archivo
            </button>
            <button
              className="btn-pdf"
              onClick={descargarPDF}
              disabled={generandoPdf}
            >
              {generandoPdf ? 'Generando…' : '📄 Descargar PDF'}
            </button>
            <span className="archivo">
              📄 {nombreArchivo} · {rows.length} filas
              {hayFino && (
                <> · {pais.etiquetaFina} en «{pais.fino.colMostrar(finoCols)}»</>
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
            <Kpi label={`${cap(pais.unidadMayor)}s con matrículas`} valor={distintos} />
            <Kpi
              label={`${cap(pais.unidadMayor)} líder`}
              valor={lider ? lider.estado : '—'}
              sub={
                lider ? `${lider.n} matrículas (${Math.round((lider.n / total) * 100)}%)` : ''
              }
            />
            {tienePrecio && (
              <Kpi label="Ingresos" valor={formatoMoneda(ingresoTotal, pais.moneda)} />
            )}
            {hayFino && (
              <Kpi
                label="Ubicadas en el mapa"
                valor={`${conFino} / ${total}`}
                sub={conFino === 0 ? 'no pude ubicar ninguna' : ''}
                alerta={conFino === 0}
              />
            )}
            {sinDato > 0 && (
              <Kpi label={`Sin ${pais.unidadMayor} identificado`} valor={sinDato} alerta />
            )}
          </div>

          <div className="grid">
            <div className="card mapa-card">
              <h2>
                {seleccion
                  ? `Detalle por ${pais.etiquetaFina}`
                  : 'Distribución geográfica'}
              </h2>
              <Mapa
                mapaUrl={pais.mapa}
                propNombre={pais.propNombre}
                moneda={pais.moneda}
                etiquetaFina={pais.etiquetaFina}
                conteos={conteos}
                activo={activo}
                onHover={setActivo}
                onSelect={abrirDrill}
                seleccion={seleccion}
                puntos={puntos}
                sinUbicar={sinUbicar}
                onBack={() => setSeleccion(null)}
              />
            </div>

            <div className="card tabla-card">
              <h2>Ranking por {pais.unidadMayor}</h2>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{cap(pais.unidadMayor)}</th>
                      <th className="num">Matrículas</th>
                      <th className="num">%</th>
                      {tienePrecio && <th className="num">Ingresos</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {porMayor.map((e, i) => (
                      <tr
                        key={e.estado}
                        className={
                          (e.estado === activo ? 'activo ' : '') +
                          (e.estado === SIN_DATO ? 'sindato ' : 'clickable')
                        }
                        onMouseEnter={() => setActivo(e.estado)}
                        onMouseLeave={() => setActivo(null)}
                        onClick={() => abrirDrill(e.estado)}
                      >
                        <td>{e.estado === SIN_DATO ? '—' : i + 1}</td>
                        <td>{e.estado}</td>
                        <td className="num">{e.n}</td>
                        <td className="num">{Math.round((e.n / total) * 100)}%</td>
                        {tienePrecio && (
                          <td className="num">{formatoMoneda(e.ingresos, pais.moneda)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="pie">
            {!hayFino
              ? `Tip: si tu base tiene una columna de ciudad, ${pais.etiquetaFina} o dirección, el tablero la detecta sola y habilita el detalle por zonas al hacer clic.`
              : `Tip: hacé clic en ${
                  pais.unidadMayor === 'estado' ? 'un estado' : 'una provincia'
                } (mapa o tabla) para ver el detalle por ${pais.etiquetaFina}.`}
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
