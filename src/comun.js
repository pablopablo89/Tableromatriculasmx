// Utilidades compartidas entre países.

export const SIN_DATO = 'No identificado'

// Formatea un monto según la moneda del país.
export function formatoMoneda(n, moneda) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString(moneda.locale, {
    style: 'currency',
    currency: moneda.currency,
    maximumFractionDigits: 0,
  })
}
