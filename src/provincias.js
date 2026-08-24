// Ecuador: normalización de provincias hacia los 24 nombres del mapa
// (ecuador-provincias.json). Acentos, mayúsculas, abreviaturas y ciudades
// frecuentes que a veces se cargan en la columna de provincia.
import { SIN_DATO } from './comun.js'

export const PROVINCIAS_CANONICAS = [
  'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El Oro',
  'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja', 'Los Ríos',
  'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza', 'Pichincha',
  'Santa Elena', 'Santo Domingo', 'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe',
]

export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Ciudades / cantones frecuentes -> su provincia (por si vienen en la columna
// de provincia). La clave se compara ya "sluggeada".
const ALIAS = {
  guayaquil: 'Guayas',
  duran: 'Guayas',
  samborondon: 'Guayas',
  milagro: 'Guayas',
  daule: 'Guayas',
  quito: 'Pichincha',
  'distrito metropolitano de quito': 'Pichincha',
  cuenca: 'Azuay',
  ambato: 'Tungurahua',
  machala: 'El Oro',
  manta: 'Manabí',
  portoviejo: 'Manabí',
  loja: 'Loja',
  riobamba: 'Chimborazo',
  ibarra: 'Imbabura',
  latacunga: 'Cotopaxi',
  babahoyo: 'Los Ríos',
  quevedo: 'Los Ríos',
  tulcan: 'Carchi',
  guaranda: 'Bolívar',
  azogues: 'Cañar',
  'santa elena': 'Santa Elena',
  'la libertad': 'Santa Elena',
  salinas: 'Santa Elena',
  'lago agrio': 'Sucumbíos',
  'nueva loja': 'Sucumbíos',
  tena: 'Napo',
  puyo: 'Pastaza',
  macas: 'Morona Santiago',
  zamora: 'Zamora Chinchipe',
  coca: 'Orellana',
  'puerto francisco de orellana': 'Orellana',
  'francisco de orellana': 'Orellana',
  'san cristobal': 'Galápagos',
  'puerto ayora': 'Galápagos',
  'puerto baquerizo moreno': 'Galápagos',
  // Provincia con nombre largo
  'santo domingo de los tsachilas': 'Santo Domingo',
  'sto domingo': 'Santo Domingo',
  morona: 'Morona Santiago',
}

const SLUG_A_CANONICO = {}
for (const p of PROVINCIAS_CANONICAS) SLUG_A_CANONICO[slug(p)] = p

export function normalizarProvincia(valor) {
  const s = slug(valor)
  if (!s) return SIN_DATO
  if (SLUG_A_CANONICO[s]) return SLUG_A_CANONICO[s]
  if (ALIAS[s]) return ALIAS[s]
  for (const [clave, nombre] of Object.entries(SLUG_A_CANONICO)) {
    if (s.includes(clave) || clave.includes(s)) return nombre
  }
  for (const [clave, nombre] of Object.entries(ALIAS)) {
    if (s.includes(clave)) return nombre
  }
  return SIN_DATO
}
