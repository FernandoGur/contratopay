// Abre um comprovante em nova aba de forma robusta.
//
// Os comprovantes são guardados como data: URL (base64). O Chrome BLOQUEIA
// navegar para data: no frame de topo (inclusive nova aba) por segurança — daí
// o sintoma "abre a aba mas só carrega no refresh". A solução é converter o
// data: URL em um Blob e abrir a blobURL (essa o navegador permite).
export function openReceipt(url: string | null | undefined) {
  if (!url) return
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',')
      const meta = url.slice(5, comma) // ex.: "image/png;base64"
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
      const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
      window.open(blobUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } else {
      window.open(url, '_blank', 'noopener')
    }
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}
