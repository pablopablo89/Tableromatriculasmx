// Registro de países. Cada país define su mapa, su normalización de la unidad
// mayor (estado/provincia), y cómo geocodificar la unidad fina (CP o ciudad).
//
// Para sumar un país nuevo: agregá su GeoJSON a /public, su normalización, y un
// objeto acá con la misma forma. El resto del tablero funciona igual.

import { normalizarEstado } from './estados-mx.js'
import { detectarColumnasCP, extraerCP } from './cp-mx.js'
import { normalizarProvincia } from './provincias.js'
import {
  detectarColumnaCiudad,
  construirIndiceCantones,
  geocodificar,
} from './geo.js'
import { detectarEnFilas, SINONIMOS } from './campos.js'

const detectarColumnaMayor = (rows) => detectarEnFilas(rows, SINONIMOS.mayor)

export const PAISES = {
  mx: {
    id: 'mx',
    nombre: 'México',
    bandera: '🇲🇽',
    mapa: '/mexico-estados.json',
    propNombre: 'name',
    unidadMayor: 'estado',
    moneda: { locale: 'es-MX', currency: 'MXN' },
    etiquetaFina: 'código postal',
    detectarColumnaMayor,
    normalizar: normalizarEstado,

    // CDMX y Estado de México se ven como una sola ciudad (Valle de México).
    grupo(estado) {
      const valle = ['Ciudad de México', 'México']
      if (valle.includes(estado))
        return { titulo: 'Valle de México (CDMX + Edo. de México)', provincias: valle }
      return { titulo: estado, provincias: [estado] }
    },

    // Unidad fina: código postal.
    fino: {
      dataset: '/cp-coords.json',
      detectarCols: (rows) => detectarColumnasCP(rows),
      preparar(data) {
        return {
          geocode(row, cols) {
            const cp = extraerCP(row, cols)
            if (!cp) return null
            const rec = data.cp[cp]
            if (!rec) return null
            return {
              key: cp,
              label: cp,
              subtitulo: data.munis[rec[2]],
              lat: rec[0],
              lng: rec[1],
            }
          },
        }
      },
    },
  },

  ec: {
    id: 'ec',
    nombre: 'Ecuador',
    bandera: '🇪🇨',
    mapa: '/ecuador-provincias.json',
    propNombre: 'province',
    unidadMayor: 'provincia',
    moneda: { locale: 'es-EC', currency: 'USD' },
    etiquetaFina: 'ciudad/cantón',
    detectarColumnaMayor,
    normalizar: normalizarProvincia,

    grupo(provincia) {
      return { titulo: provincia, provincias: [provincia] }
    },

    // Unidad fina: ciudad / cantón.
    fino: {
      dataset: '/ec-cantones.json',
      detectarCols: (rows) => {
        const c = detectarColumnaCiudad(rows)
        return c ? [c] : []
      },
      preparar(data) {
        const indice = construirIndiceCantones(data)
        return {
          geocode(row, cols) {
            if (!cols.length) return null
            const c = geocodificar(row[cols[0]], indice)
            if (!c) return null
            return {
              key: c.n,
              label: c.n,
              subtitulo: c.provincia || '',
              lat: c.lat,
              lng: c.lng,
            }
          },
        }
      },
    },
  },
}
