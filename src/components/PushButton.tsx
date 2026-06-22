import { useEffect, useState } from 'react'
import { enablePush, pushSubscribed, pushSupported } from '@/lib/push'
import { useSupabase } from '@/lib/supabase'

/** No iOS, web push só funciona com a PWA instalada na tela inicial. */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Botão "Ativar notificações" — pede permissão e assina o push. */
export function PushButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<'loading' | 'idle' | 'on' | 'busy' | 'hidden'>('loading')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!pushSupported() || !useSupabase) {
      setState('hidden')
      return
    }
    pushSubscribed().then((s) => setState(s ? 'on' : 'idle'))
  }, [])

  if (state === 'hidden' || state === 'loading') return null

  // iOS fora da PWA instalada: orienta a instalar.
  if (isIOS() && !isStandalone()) {
    return (
      <p className={`text-xs text-ink-400 ${className}`}>
        Para receber avisos no iPhone, toque em Compartilhar → <b>Adicionar à Tela de Início</b> e
        abra o app por lá.
      </p>
    )
  }

  async function activate() {
    setErr(null)
    setState('busy')
    const r = await enablePush()
    if (r.ok) setState('on')
    else {
      setErr(r.error ?? 'Não foi possível ativar.')
      setState('idle')
    }
  }

  if (state === 'on') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-pos-700 ${className}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        Notificações ativas
      </span>
    )
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={activate}
        disabled={state === 'busy'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-brand hover:bg-brand-700 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {state === 'busy' ? 'Ativando…' : 'Ativar notificações'}
      </button>
      {err && <p className="mt-1.5 text-xs text-neg-700">{err}</p>}
    </div>
  )
}
