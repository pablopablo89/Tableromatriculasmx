// México: normalización de estados hacia los 32 nombres del mapa
// (mexico-estados.json). Acentos, mayúsculas, typos, y ciudades -> su estado.
import { SIN_DATO } from './comun.js'

export const ESTADOS_CANONICOS = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán',
  'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco',
  'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
]

function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALIAS = {
  cdmx: 'Ciudad de México',
  df: 'Ciudad de México',
  'distrito federal': 'Ciudad de México',
  'ciudad de mexico': 'Ciudad de México',
  'mexico city': 'Ciudad de México',
  'estado de mexico': 'México',
  'edo de mexico': 'México',
  edomex: 'México',
  'estado de nexico': 'México',
  mex: 'México',
  'nuevo leon': 'Nuevo León',
  monterrey: 'Nuevo León',
  'michoacan de ocampo': 'Michoacán',
  michoacan: 'Michoacán',
  'veracruz de ignacio de la llave': 'Veracruz',
  'coahuila de zaragoza': 'Coahuila',
  guadalajara: 'Jalisco',
  'puebla de zaragoza': 'Puebla',
  leon: 'Guanajuato',
  queretaro: 'Querétaro',
  'santiago de queretaro': 'Querétaro',
  cancun: 'Quintana Roo',
  merida: 'Yucatán',
  tijuana: 'Baja California',
}

// Abreviaturas de 2–3 letras (SAT / exports de órdenes) -> canónico.
const ABREV = {
  AS: 'Aguascalientes', BC: 'Baja California', BS: 'Baja California Sur',
  CC: 'Campeche', CM: 'Ciudad de México', DF: 'Ciudad de México',
  CH: 'Chihuahua', CS: 'Chiapas', CL: 'Colima', CO: 'Coahuila',
  DG: 'Durango', GT: 'Guanajuato', GR: 'Guerrero', HG: 'Hidalgo',
  JC: 'Jalisco', JA: 'Jalisco', MC: 'México', MX: 'México', MN: 'Michoacán',
  MI: 'Michoacán', MS: 'Morelos', MO: 'Morelos', NT: 'Nayarit', NA: 'Nayarit',
  NL: 'Nuevo León', OC: 'Oaxaca', OA: 'Oaxaca', PL: 'Puebla', PU: 'Puebla',
  QO: 'Querétaro', QT: 'Querétaro', QR: 'Quintana Roo', SP: 'San Luis Potosí',
  SL: 'San Luis Potosí', SR: 'Sinaloa', SI: 'Sinaloa', SO: 'Sonora',
  TC: 'Tabasco', TB: 'Tabasco', TS: 'Tamaulipas', TM: 'Tamaulipas',
  TL: 'Tlaxcala', VZ: 'Veracruz', VE: 'Veracruz', YN: 'Yucatán',
  YU: 'Yucatán', ZS: 'Zacatecas', ZA: 'Zacatecas',
}

const SLUG_A_CANONICO = {}
for (const nombre of ESTADOS_CANONICOS) SLUG_A_CANONICO[slug(nombre)] = nombre

export function normalizarEstado(valor) {
  const raw = String(valor || '').trim().toUpperCase().replace(/^MX-/, '')
  if (ABREV[raw]) return ABREV[raw]
  const s = slug(valor)
  if (!s) return SIN_DATO
  if (ALIAS[s]) return ALIAS[s]
  if (SLUG_A_CANONICO[s]) return SLUG_A_CANONICO[s]
  for (const [clave, nombre] of Object.entries(ALIAS)) {
    if (s.includes(clave)) return nombre
  }
  for (const [clave, nombre] of Object.entries(SLUG_A_CANONICO)) {
    if (clave.length > 4 && s.includes(clave)) return nombre
  }
  return SIN_DATO
}
