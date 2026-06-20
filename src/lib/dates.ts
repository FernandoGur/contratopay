// Utilidades de data — trabalhamos com datas "civis" (sem fuso) no formato ISO YYYY-MM-DD.

export type ISODate = string // 'YYYY-MM-DD'

export function parseISO(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}

export function toISO(y: number, m: number, day: number): ISODate {
  const mm = String(m).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/** Soma `n` meses a uma data ISO, preservando o dia (com clamp p/ fim de mês). */
export function addMonths(d: ISODate, n: number): ISODate {
  const { y, m, day } = parseISO(d)
  const total = (y * 12 + (m - 1)) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(ny, nm, 0).getDate()
  return toISO(ny, nm, Math.min(day, lastDay))
}

/** Quantidade de meses entre duas datas (a -> b), ignorando o dia. */
export function monthsBetween(a: ISODate, b: ISODate): number {
  const pa = parseISO(a)
  const pb = parseISO(b)
  return (pb.y - pa.y) * 12 + (pb.m - pa.m)
}

/** Comparação: -1 se a<b, 0 se igual, 1 se a>b (por ano/mês/dia). */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const MESES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/** '2026-06-15' -> '15/06/2026' */
export function formatDateBR(d?: ISODate | null): string {
  if (!d) return '—'
  const { y, m, day } = parseISO(d)
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

/** '2026-06-15' -> 'jun/2026' */
export function formatMonthBR(d: ISODate): string {
  const { y, m } = parseISO(d)
  return `${MESES_ABREV[m - 1]}/${y}`
}

/** Data de hoje como ISO, no fuso local. */
export function todayISO(): ISODate {
  const now = new Date()
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
