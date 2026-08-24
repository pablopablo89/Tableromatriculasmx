// Registro de países. Cada país define su mapa, su normalización de la unidad
// mayor (estado/provincia), y cómo geocodificar la unidad fina.
//
// La unidad fina se ubica por CIUDAD/MUNICIPIO (dato confiable que traen las
// bases) y, en México, por CÓDIGO POSTAL cuando la base lo incluye (más fino).
//
// Para sumar un país: agregá su GeoJSON + su dataset de ciudades a /public, su
// normalización, y un objeto acá con la misma forma.

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
    base: '/base-mx.json',
    propNombre: 'name',
    unidadMayor: 'estado',
    codigoPais: 'MX',
    moneda: { locale: 'es-MX', currency: 'MXN' },
    etiquetaFina: 'CP/municipio',
    detectarColumnaMayor,
    normalizar: normalizarEstado,

    // CDMX y Estado de México se ven como una sola ciudad (Valle de México).
    grupo(estado) {
      const valle = ['Ciudad de México', 'México']
      if (valle.includes(estado))
        return { titulo: 'Valle de México (CDMX + Edo. de México)', provincias: valle }
      return { titulo: estado, provincias: [estado] }
    },

    // Unidad fina: código postal (si la base lo trae) o municipio (por ciudad).
    fino: {
      datasets: { cp: '/cp-coords.json', muni: '/mx-municipios.json' },
      detectar: (rows) => ({
        cp: detectarColumnasCP(rows),
        ciudad: detectarColumnaCiudad(rows),
      }),
      hayCols: (c) => (c.cp && c.cp.length > 0) || !!c.ciudad,
      colMostrar: (c) => (c.cp && c.cp.length ? c.cp[0] : c.ciudad),
      preparar(data) {
        const idxMuni = construirIndiceCantones(data.muni)
        return {
          geocode(row, cols) {
            // 1) Código postal (más preciso) si la base lo trae.
            if (cols.cp && cols.cp.length) {
              const cp = extraerCP(row, cols.cp)
              if (cp) {
                const rec = data.cp.cp[cp]
                if (rec)
                  return {
                    key: 'cp:' + cp,
                    label: cp,
                    subtitulo: data.cp.munis[rec[2]],
                    lat: rec[0],
                    lng: rec[1],
                  }
              }
            }
            // 2) Municipio, por el nombre de la ciudad.
            if (cols.ciudad) {
              const m = geocodificar(row[cols.ciudad], idxMuni)
              if (m)
                return {
                  key: 'mun:' + m.n,
                  label: m.n,
                  subtitulo: m.provincia || '',
                  lat: m.lat,
                  lng: m.lng,
                }
            }
            return null
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
    base: '/base-ec.json',
    propNombre: 'province',
    unidadMayor: 'provincia',
    codigoPais: 'EC',
    moneda: { locale: 'es-EC', currency: 'USD' },
    etiquetaFina: 'ciudad/cantón',
    detectarColumnaMayor,
    normalizar: normalizarProvincia,

    grupo(provincia) {
      return { titulo: provincia, provincias: [provincia] }
    },

    // Unidad fina: ciudad / cantón.
    fino: {
      datasets: { canton: '/ec-cantones.json' },
      detectar: (rows) => ({ ciudad: detectarColumnaCiudad(rows) }),
      hayCols: (c) => !!c.ciudad,
      colMostrar: (c) => c.ciudad,
      preparar(data) {
        const indice = construirIndiceCantones(data.canton)
        return {
          geocode(row, cols) {
            if (!cols.ciudad) return null
            const c = geocodificar(row[cols.ciudad], indice)
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
