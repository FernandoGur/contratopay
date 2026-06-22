import { useEffect, useState } from 'react'
import {
  biometricEnabledFor,
  biometricSupported,
  disableBiometric,
  enableBiometric,
} from '@/lib/biometric'
import { getCurrentUser } from '@/lib/repo'

/** Botão "Ativar Face ID / digital" — registra a credencial de plataforma. */
export function BiometricToggle() {
  const email = getCurrentUser()?.email ?? ''
  const [supported, setSupported] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    biometricSupported().then((s) => {
      setSupported(s)
      setEnabled(biometricEnabledFor(email))
    })
  }, [email])

  if (supported === null) return null
  if (!supported) return null // dispositivo sem biometria — não mostra

  async function activate() {
    setBusy(true)
    setErr(null)
    const r = await enableBiometric(email)
    setBusy(false)
    if (r.ok) setEnabled(true)
    else setErr(r.error ?? 'Não foi possível ativar.')
  }
  function deactivate() {
    if (!window.confirm('Desativar o bloqueio por biometria?')) return
    disableBiometric()
    setEnabled(false)
  }

  if (enabled) {
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-pos-700">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          Face ID ativo
        </span>
        <button onClick={deactivate} className="text-sm font-medium text-ink-500 hover:text-ink-800">
          Desativar
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={activate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-brand hover:bg-brand-700 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11v2m0 4h.01M7 7a5 5 0 0 1 10 0M5 11v3a7 7 0 0 0 14 0v-3" /></svg>
        {busy ? 'Ativando…' : 'Ativar Face ID / digital'}
      </button>
      {err && <p className="mt-1.5 text-xs text-neg-700">{err}</p>}
    </div>
  )
}
