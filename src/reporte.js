// Genera un reporte PDF del tablero, 100% en el navegador (offline).
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SIN_DATO, formatoMoneda } from './comun.js'

// Rasteriza un <svg> del DOM a PNG (para incrustar el mapa en el PDF).
function svgAPng(svg, escala = 2) {
  return new Promise((resolve) => {
    try {
      const xml = new XMLSerializer().serializeToString(svg)
      const vb = svg.viewBox && svg.viewBox.baseVal
      const w = (vb && vb.width) || svg.clientWidth || 640
      const h = (vb && vb.height) || svg.clientHeight || 480
      const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = w * escala
        canvas.height = h * escala
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), w, h })
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch {
      resolve(null)
    }
  })
}

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0)

// Genera los hallazgos automáticos (insights geográficos) como bullets.
function construirInsights(ctx) {
  const { porMayor, total, distintos, sinDato, pais, seleccion, puntos, conFino } = ctx
  const out = []
  const con = porMayor.filter((e) => e.estado !== SIN_DATO)
  const lider = con[0]
  const u = pais.unidadMayor

  if (lider) {
    out.push(
      `Concentración: ${lider.estado} reúne ${lider.n} matrículas (${pct(
        lider.n,
        total
      )}% del total), el ${u} con más demanda.`
    )
  }
  if (con.length >= 3) {
    const top3 = con.slice(0, 3)
    const s = top3.reduce((a, b) => a + b.n, 0)
    out.push(
      `Las 3 zonas principales (${top3
        .map((e) => e.estado)
        .join(', ')}) concentran el ${pct(s, total)}% de las matrículas.`
    )
  }
  out.push(
    `Cobertura: hay matrículas en ${distintos} ${u}${distintos === 1 ? '' : 's'} distinto${
      distintos === 1 ? '' : 's'
    }.`
  )
  const colaN = con.slice(3).reduce((a, b) => a + b.n, 0)
  if (colaN > 0) {
    out.push(
      `Oportunidad: ${colaN} matrículas (${pct(
        colaN,
        total
      )}%) están repartidas fuera del top 3 — mercados con potencial poco explotado.`
    )
  }
  if (conFino != null && total) {
    out.push(
      `${conFino} de ${total} matrículas se pudieron ubicar en el mapa por su ciudad/zona.`
    )
  }
  if (sinDato > 0) {
    out.push(
      `Calidad de datos: ${sinDato} matrículas (${pct(
        sinDato,
        total
      )}%) no traen ${u} identificable — conviene completarlo en el origen.`
    )
  }
  if (seleccion && puntos && puntos.length) {
    const totalZona = puntos.reduce((a, p) => a + p.n, 0)
    const top = puntos[0]
    out.push(
      `Dentro de ${seleccion.titulo}: ${top.label} lidera con ${top.n} (${pct(
        top.n,
        totalZona
      )}% de la zona), sobre ${puntos.length} zonas detectadas.`
    )
  }
  return out
}

export async function generarReportePDF(ctx) {
  const { pais, nombreArchivo, filtros, total, ingresoTotal, tienePrecio } = ctx
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  let y = M

  const teal = [14, 116, 144]
  const gris = [100, 116, 139]

  // ---- Encabezado ----
  doc.setFillColor(...teal)
  doc.rect(0, 0, W, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(15, 23, 42)
  doc.text('Reporte de Matrículas', M, (y += 24))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...gris)
  doc.text(`${pais.nombre}`, W - M, y, { align: 'right' })

  y += 16
  const fecha = new Date().toLocaleDateString('es', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const filtroTxt = [
    filtros.programa && filtros.programa !== 'Todos' ? `Programa: ${filtros.programa}` : null,
    filtros.estatus && filtros.estatus !== 'Todos' ? `Estatus: ${filtros.estatus}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  doc.setFontSize(9)
  doc.text(
    `Generado: ${fecha}${nombreArchivo ? ' · Archivo: ' + nombreArchivo : ''}${
      filtroTxt ? ' · ' + filtroTxt : ''
    }`,
    M,
    (y += 4)
  )

  // ---- Resumen (KPIs) ----
  y += 22
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  const kpis = [
    ['Matrículas', String(total)],
    [`${pais.unidadMayor}s con matrículas`, String(ctx.distintos)],
    ['Zona líder', ctx.lider ? `${ctx.lider.estado} (${pct(ctx.lider.n, total)}%)` : '—'],
  ]
  if (tienePrecio) kpis.push(['Ingresos', formatoMoneda(ingresoTotal, pais.moneda)])
  const bw = (W - 2 * M - (kpis.length - 1) * 10) / kpis.length
  kpis.forEach((k, i) => {
    const x = M + i * (bw + 10)
    doc.roundedRect(x, y, bw, 48, 5, 5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(15, 23, 42)
    doc.text(String(k[1]), x + 10, y + 22, { maxWidth: bw - 16 })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...gris)
    doc.text(String(k[0]), x + 10, y + 38, { maxWidth: bw - 16 })
  })
  y += 48 + 24

  // ---- Hallazgos ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('Hallazgos', M, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  for (const ins of construirInsights(ctx)) {
    const lines = doc.splitTextToSize(ins, W - 2 * M - 14)
    if (y + lines.length * 13 > H - M) {
      doc.addPage()
      y = M
    }
    doc.setFillColor(...teal)
    doc.circle(M + 3, y - 3, 1.6, 'F')
    doc.text(lines, M + 14, y)
    y += lines.length * 13 + 4
  }

  // ---- Mapa ----
  const svg = document.querySelector('.mapa-svg')
  if (svg) {
    const png = await svgAPng(svg)
    if (png) {
      const maxW = W - 2 * M
      const imgW = Math.min(maxW, 420)
      const imgH = (png.h / png.w) * imgW
      if (y + imgH + 30 > H - M) {
        doc.addPage()
        y = M
      }
      y += 10
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text(ctx.seleccion ? `Mapa: ${ctx.seleccion.titulo}` : 'Distribución geográfica', M, y)
      y += 10
      doc.addImage(png.dataUrl, 'JPEG', M + (maxW - imgW) / 2, y, imgW, imgH)
      y += imgH + 16
    }
  }

  // ---- Tabla ranking ----
  const cabecera = ['#', pais.unidadMayor.charAt(0).toUpperCase() + pais.unidadMayor.slice(1), 'Matrículas', '%']
  if (tienePrecio) cabecera.push('Ingresos')
  const cuerpo = ctx.porMayor.map((e, i) => {
    const fila = [
      e.estado === SIN_DATO ? '—' : i + 1,
      e.estado,
      e.n,
      pct(e.n, total) + '%',
    ]
    if (tienePrecio) fila.push(formatoMoneda(e.ingresos, pais.moneda))
    return fila
  })
  autoTable(doc, {
    head: [cabecera],
    body: cuerpo,
    startY: y + 6,
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: teal, textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.setTextColor(...gris)
      doc.text(
        'Tablero de Matrículas — generado en el navegador',
        M,
        H - 18
      )
      const p = doc.internal.getNumberOfPages()
      doc.text(`Pág. ${doc.internal.getCurrentPageInfo().pageNumber} / ${p}`, W - M, H - 18, {
        align: 'right',
      })
    },
  })

  // ---- Tabla detalle de la zona (si hay drill) ----
  if (ctx.seleccion && ctx.puntos && ctx.puntos.length) {
    const totalZona = ctx.puntos.reduce((a, p) => a + p.n, 0)
    const cab = ['Ciudad / Zona', 'Provincia/Estado', 'Matrículas', '%']
    if (tienePrecio) cab.push('Ingresos')
    const cuerpoZ = ctx.puntos.map((p) => {
      const f = [p.label, p.subtitulo || '', p.n, pct(p.n, totalZona) + '%']
      if (tienePrecio) f.push(formatoMoneda(p.ingresos, pais.moneda))
      return f
    })
    autoTable(doc, {
      head: [[`Detalle de ${ctx.seleccion.titulo}`, '', '', '', ...(tienePrecio ? [''] : [])]],
      body: [],
      startY: doc.lastAutoTable.finalY + 18,
      margin: { left: M, right: M },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 11 },
    })
    autoTable(doc, {
      head: [cab],
      body: cuerpoZ,
      startY: doc.lastAutoTable.finalY + 2,
      margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: teal, textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })
  }

  const nombre = `reporte-matriculas-${pais.id}-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`
  doc.save(nombre)
  return nombre
}
