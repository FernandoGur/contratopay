const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const NUM = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 5541.67 -> 'R$ 5.541,67' */
export function brl(n: number | null | undefined): string {
  // Inclui Infinity/-Infinity (ex.: divisão por 0 parcelas) — nunca exibe "R$ ∞".
  if (n == null || !Number.isFinite(n)) return 'R$ 0,00'
  // Evita "-R$ 0,00" por resíduos de arredondamento.
  if (Math.abs(n) < 0.005) n = 0
  return BRL.format(n)
}

/** 5541.67 -> '5.541,67' (sem símbolo) */
export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0,00'
  // Mesma guarda do brl(): evita "-0,00" por resíduo negativo.
  if (Math.abs(n) < 0.005) n = 0
  return NUM.format(n)
}

/** 0.05 -> '5%' ; 0.045 -> '4,5%' */
export function pct(decimal: number | null | undefined): string {
  if (decimal == null || Number.isNaN(decimal)) return '—'
  const v = decimal * 100
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/** Converte texto digitado ('5.000,50' ou '5000.5') em número. */
export function parseMoney(input: string): number {
  if (!input) return 0
  const cleaned = input
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const v = Number(cleaned)
  return Number.isNaN(v) ? 0 : v
}
