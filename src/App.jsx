import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Mapa from './Mapa.jsx'
import { PAISES } from './paises.js'
import { SIN_DATO, formatoMoneda } from './comun.js'
import { detectarEnFilas, SINONIMOS } from './campos.js'
import { generarReportePDF } from './reporte.js'
import { cargarGoogleMaps, geocodeDirecciones, puedeGeocodificar } from './geocodeGoogle.js'

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
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem('googleApiKey') || ''
    } catch {
      return ''
    }
  })
  const [panelKey, setPanelKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [geoProg, setGeoProg] = useState(null)
  const [geoErr, setGeoErr] = useState('')
  const [geoRows, setGeoRows] = useState(null)
  const inputRef = useRef(null)

  // Al cambiar de país: reiniciar todo y cargar su dataset fino.
  useEffect(() => {
    setRows(null)
    setNombreArchivo('')
    setError('')
    setSeleccion(null)
    setActivo(null)
    setFinoData(null)
    setGeoProg(null)
    setGeoErr('')
    setGeoRows(null)
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
      setGeoProg(null)
      setGeoErr('')
      setGeoRows(null)
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
      lat: detectarEnFilas(rows, SINONIMOS.lat),
      lng: detectarEnFilas(rows, SINONIMOS.lng),
    }
  }, [rows])

  // ¿La base trae coordenadas ya geocodificadas? (máxima precisión, intra-ciudad)
  const modoCoord = !!(campos.lat && campos.lng)

  // Geocodificador unificado por fila: si la base trae coordenadas, las usa
  // (máxima precisión); si no, cae al geocodificador del país (CP/ciudad).
  const geocodeFila = useMemo(() => {
    return (r) => {
      if (modoCoord) {
        const la = Number(r[campos.lat])
        const lo = Number(r[campos.lng])
        if (r[campos.lat] !== '' && r[campos.lng] !== '' && isFinite(la) && isFinite(lo)) {
          // Agrupa por celda de ~1 km (nivel barrio) para leer la concentración.
          return { key: la.toFixed(2) + ',' + lo.toFixed(2), label: '', subtitulo: '', lat: la, lng: lo }
        }
      }
      return geocoder ? geocoder.geocode(r, finoCols) : null
    }
  }, [modoCoord, campos.lat, campos.lng, geocoder, finoCols])

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

  const hayFino = modoCoord || (finoCols ? pais.fino.hayCols(finoCols) : false)

  const conFino = useMemo(() => {
    if (!hayFino) return 0
    let c = 0
    for (const r of filas) if (geocodeFila(r)) c++
    return c
  }, [filas, geocodeFila, hayFino])

  // Puntos del zoom. Con coordenadas: bubbles por cercanía (concentración
  // intra-ciudad). Sin coordenadas: un punto por CP/ciudad.
  const puntos = useMemo(() => {
    if (!seleccion || !hayFino) return null
    const m = new Map()
    for (const r of filas) {
      if (!seleccion.provincias.includes(pais.normalizar(r[colMayor]))) continue
      const g = geocodeFila(r)
      if (!g) continue
      const prev =
        m.get(g.key) || {
          label: g.label,
          subtitulo: g.subtitulo,
          sumLat: 0,
          sumLng: 0,
          n: 0,
          ingresos: 0,
        }
      prev.sumLat += g.lat
      prev.sumLng += g.lng
      prev.n += 1
      prev.ingresos += resolvePrecio(r, campos.precio)
      m.set(g.key, prev)
    }
    return [...m.values()]
      .map((p) => ({ ...p, lat: p.sumLat / p.n, lng: p.sumLng / p.n }))
      .sort((a, b) => b.n - a.n)
  }, [seleccion, geocodeFila, hayFino, filas, colMayor, paisId, campos])

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

  async function geocodificar(clave) {
    const k = clave || apiKey
    if (!k) {
      setKeyInput(apiKey)
      setPanelKey(true)
      return
    }
    setGeoErr('')
    setGeoRows(null)
    setGeoProg({ done: 0, total: 0, ok: 0 })
    try {
      await cargarGoogleMaps(k)
      const { rows: enr, stats } = await geocodeDirecciones({
        rows,
        codigoPais: pais.codigoPais,
        onProgress: setGeoProg,
      })
      setRows(enr)
      setGeoRows(enr)
      setSeleccion(null)
      setGeoProg({ ...stats, done: stats.total })
    } catch (err) {
      setGeoErr(err.message)
      setGeoProg(null)
    }
  }

  function guardarKey() {
    const k = keyInput.trim()
    if (!k) return
    try {
      localStorage.setItem('googleApiKey', k)
    } catch {}
    setApiKey(k)
    setPanelKey(false)
    geocodificar(k)
  }

  function descargarBaseGeocodificada() {
    if (!geoRows) return
    const ws = XLSX.utils.json_to_sheet(geoRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Matriculas')
    const csv = XLSX.write(wb, { type: 'array', bookType: 'csv' })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = (nombreArchivo.replace(/\.[^.]+$/, '') || 'base') + '_geocodificado.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const puedeGeo = rows && !modoCoord && puedeGeocodificar(rows)

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
            {puedeGeo && (
              <button
                className="btn-geo"
                onClick={() => geocodificar()}
                disabled={!!geoProg && geoProg.done < geoProg.total}
              >
                {geoProg && geoProg.done < geoProg.total
                  ? `🌐 Geocodificando… ${geoProg.done}/${geoProg.total}`
                  : '🌐 Geocodificar direcciones'}
              </button>
            )}
            {geoRows && (
              <button className="btn-sec" onClick={descargarBaseGeocodificada}>
                ⬇️ Descargar base geocodificada
              </button>
            )}
            <span className="archivo">
              📄 {nombreArchivo} · {rows.length} filas
              {modoCoord ? (
                <> · ubicación por dirección (coordenadas)</>
              ) : (
                hayFino && (
                  <> · {pais.etiquetaFina} en «{pais.fino.colMostrar(finoCols)}»</>
                )
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

          {panelKey && (
            <div className="geo-panel">
              <div className="geo-panel-titulo">Pegá tu API key de Google Maps</div>
              <p className="geo-panel-sub">
                Se guarda solo en este navegador. Las direcciones van directo de acá a
                Google (nunca a otro servidor).
              </p>
              <div className="geo-panel-fila">
                <input
                  type="password"
                  className="geo-input"
                  placeholder="AIza..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && guardarKey()}
                />
                <button className="btn-geo" onClick={guardarKey}>
                  Guardar y geocodificar
                </button>
                <button className="btn-sec" onClick={() => setPanelKey(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {geoErr && <div className="error">Geocodificación: {geoErr}</div>}
          {geoProg && (
            <div className="geo-status">
              {geoProg.done < geoProg.total ? (
                <>Geocodificando direcciones con Google… {geoProg.done}/{geoProg.total} ({geoProg.ok} ubicadas)</>
              ) : (
                <>✅ Listo: {geoProg.ok} de {geoProg.total} direcciones ubicadas. El mapa ahora muestra la concentración por dirección.</>
              )}
            </div>
          )}

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
                etiquetaFina={modoCoord ? 'por dirección' : pais.etiquetaFina}
                conteos={conteos}
                activo={activo}
                onHover={setActivo}
                onSelect={abrirDrill}
                seleccion={seleccion}
                puntos={puntos}
                ajustarAPuntos={modoCoord}
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
