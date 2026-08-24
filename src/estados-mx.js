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

const SLUG_A_CANONICO = {}
for (const nombre of ESTADOS_CANONICOS) SLUG_A_CANONICO[slug(nombre)] = nombre

export function normalizarEstado(valor) {
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
