// Viewer global de comprovante (modal). Em vez de abrir em outra aba (data:
// URLs são bloqueadas pelo Chrome), qualquer "ver comprovante" chama
// openReceipt(url) e o <ReceiptModal/> (montado no App) exibe num modal.
let current: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openReceipt(url: string | null | undefined) {
  current = url ?? null
  emit()
}
export function closeReceipt() {
  current = null
  emit()
}
export function subscribeReceipt(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export function getReceipt() {
  return current
}

/** Converte um data: URL em blob URL (para exibir PDF em <iframe> com segurança). */
export function dataUrlToBlobUrl(url: string): string {
  if (!url.startsWith('data:')) return url
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const isB64 = /;base64/i.test(meta)
  const mime = meta.split(';')[0] || 'application/octet-stream'
  const data = url.slice(comma + 1)
  let bytes: Uint8Array
  if (isB64) {
    const bin = atob(data)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data))
  }
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
}
