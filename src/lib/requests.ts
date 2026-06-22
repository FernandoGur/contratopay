// Intenção do cliente anexada a um comprovante: um pedido de amortização do
// saldo ou de quitação antecipada das últimas parcelas. Vai serializada em
// Payment.notes — que de outra forma guarda só o nome do arquivo — por isso o
// parser é retrocompatível com texto puro (comprovantes comuns de parcela).

export interface ExtraIntent {
  mode: 'amortizar' | 'quitar'
  /** amortizar: valor extra para abater o saldo · quitar: total pago hoje. */
  amount: number
  /** quitar: nº de últimas parcelas que o cliente quer quitar. */
  count?: number
}

export interface ReceiptMeta {
  file: string
  intent?: ExtraIntent
}

export function encodeReceiptNotes(meta: ReceiptMeta): string {
  if (!meta.intent) return meta.file
  return JSON.stringify({ file: meta.file, intent: meta.intent })
}

export function parseReceiptNotes(notes: string | null | undefined): ReceiptMeta {
  const raw = (notes ?? '').trim()
  if (!raw || raw[0] !== '{') return { file: raw }
  try {
    const o = JSON.parse(raw) as { file?: unknown; intent?: ExtraIntent }
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const file = typeof o.file === 'string' ? o.file : ''
      // Só trata como pedido se a intenção estiver íntegra (tem mode). JSON
      // parcialmente corrompido (sem mode) não vira pedido, mas preserva o nome.
      const intent = o.intent && o.intent.mode ? o.intent : undefined
      return { file, intent }
    }
  } catch {
    /* não é JSON → texto puro (nome do arquivo) */
  }
  return { file: raw }
}
