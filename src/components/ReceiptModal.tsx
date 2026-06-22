import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { closeReceipt, dataUrlToBlobUrl, getReceipt, subscribeReceipt } from '@/lib/receipt'

/** Modal global que exibe o comprovante (imagem ou PDF) sem abrir nova aba. */
export function ReceiptModal() {
  const url = useSyncExternalStore(subscribeReceipt, getReceipt, getReceipt)
  const [zoom, setZoom] = useState(false)

  // Fecha com ESC.
  useEffect(() => {
    if (!url) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeReceipt()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url])

  const isImg = !!url && /^data:image|\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)

  // PDF: usa blobURL (data: em iframe é instável). Revoga ao fechar.
  const blobUrl = useMemo(() => (url && !isImg ? dataUrlToBlobUrl(url) : null), [url, isImg])
  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  useEffect(() => setZoom(false), [url])

  if (!url) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/70 p-4 backdrop-blur-sm"
      onClick={closeReceipt}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <span className="text-sm font-semibold text-ink-800">Comprovante</span>
          <button
            type="button"
            onClick={closeReceipt}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-ink-50 p-3">
          {isImg ? (
            <img
              src={url}
              alt="Comprovante"
              onClick={() => setZoom((z) => !z)}
              className={`mx-auto rounded-lg ${zoom ? 'max-w-none cursor-zoom-out' : 'max-h-[78vh] w-auto cursor-zoom-in'}`}
            />
          ) : (
            <iframe src={blobUrl ?? url} title="Comprovante" className="h-[78vh] w-full rounded-lg border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  )
}
