// Normalización de nombres de estado hacia los 32 nombres oficiales que usa
// el mapa (mexico-estados.json). Maneja acentos, mayúsculas, typos comunes,
// abreviaturas del SAT y ciudades que en realidad son de otro estado.

// Nombres canónicos tal cual aparecen en el GeoJSON.
export const ESTADOS_CANONICOS = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán',
  'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco',
  'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
]

// Quita acentos, pasa a minúsculas y colapsa espacios.
function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Alias -> nombre canónico. La clave se compara ya "sluggeada".
const ALIAS = {
  // CDMX y variantes
  'cdmx': 'Ciudad de México',
  'df': 'Ciudad de México',
  'distrito federal': 'Ciudad de México',
  'ciudad de mexico': 'Ciudad de México',
  'mexico city': 'Ciudad de México',
  // Estado de México (ojo: choca con "México" país; se resuelve abajo)
  'estado de mexico': 'México',
  'edo de mexico': 'México',
  'edomex': 'México',
  'estado de nexico': 'México', // typo del archivo original
  'mex': 'México',
  // Nuevo León (incluye ciudad Monterrey)
  'nuevo leon': 'Nuevo León',
  'monterrey': 'Nuevo León',
  // Michoacán
  'michoacan de ocampo': 'Michoacán',
  'michoacan': 'Michoacán',
  // Veracruz
  'veracruz de ignacio de la llave': 'Veracruz',
  // Coahuila
  'coahuila de zaragoza': 'Coahuila',
  // Otras ciudades frecuentes -> su estado
  'guadalajara': 'Jalisco',
  'puebla de zaragoza': 'Puebla',
  'leon': 'Guanajuato',
  'queretaro': 'Querétaro',
  'santiago de queretaro': 'Querétaro',
  'cancun': 'Quintana Roo',
  'merida': 'Yucatán',
  'tijuana': 'Baja California',
}

// Abreviaturas del SAT (columna estado_facturacion) -> canónico.
export const ABREV_SAT = {
  AS: 'Aguascalientes', BC: 'Baja California', BS: 'Baja California Sur',
  CC: 'Campeche', CH: 'Chihuahua', CS: 'Chiapas', CL: 'Colima',
  CM: 'Ciudad de México', DF: 'Ciudad de México', CO: 'Colima',
  DG: 'Durango', GT: 'Guanajuato', GR: 'Guerrero', HG: 'Hidalgo',
  JA: 'Jalisco', MC: 'México', MX: 'México', MN: 'Michoacán', MI: 'Michoacán',
  MO: 'Morelos', NA: 'Nayarit', NL: 'Nuevo León', OA: 'Oaxaca', PU: 'Puebla',
  QT: 'Querétaro', QR: 'Quintana Roo', SP: 'San Luis Potosí',
  SL: 'San Luis Potosí', SI: 'Sinaloa', SO: 'Sonora', TB: 'Tabasco',
  TC: 'Tabasco', TL: 'Tlaxcala', TS: 'Tamaulipas', TM: 'Tamaulipas',
  VZ: 'Veracruz', VE: 'Veracruz', YU: 'Yucatán', ZA: 'Zacatecas',
}

// Diccionario canónico sluggeado para match directo.
const SLUG_A_CANONICO = {}
for (const nombre of ESTADOS_CANONICOS) SLUG_A_CANONICO[slug(nombre)] = nombre

export const SIN_DATO = 'No identificado'

// Devuelve el nombre canónico de estado, o SIN_DATO si no se reconoce.
export function normalizarEstado(valor) {
  const s = slug(valor)
  if (!s) return SIN_DATO
  if (ALIAS[s]) return ALIAS[s]
  if (SLUG_A_CANONICO[s]) return SLUG_A_CANONICO[s]
  // Intento por inclusión (ej. "estado de mexico ..." con texto extra)
  for (const [clave, nombre] of Object.entries(ALIAS)) {
    if (s.includes(clave)) return nombre
  }
  for (const [clave, nombre] of Object.entries(SLUG_A_CANONICO)) {
    if (clave.length > 4 && s.includes(clave)) return nombre
  }
  return SIN_DATO
}
