import { useReducer, useState } from 'react'
import { useCurrentUser } from '@/lib/store'
import { biometricEnabledFor, isUnlocked, unlockBiometric } from '@/lib/biometric'
import { logout } from '@/lib/repo'
import { LogoMark } from '@/components/Logo'

/** Cadeado de biometria: se o usuário ativou, trava o app na abertura até
 *  destravar com Face ID/digital. A sessão do Supabase continua por baixo. */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const locked = !!user && biometricEnabledFor(user.email) && !isUnlocked()
  if (!locked) return <>{children}</>

  async function unlock() {
    setBusy(true)
    setErr(null)
    const r = await unlockBiometric()
    setBusy(false)
    if (r.ok) force()
    else setErr(r.error ?? 'Não foi possível desbloquear.')
  }

  async function usePassword() {
    await logout()
    force()
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-ink-50 px-6 text-center">
      <LogoMark className="h-14 w-auto" />
      <div>
        <h1 className="font-display text-lg font-bold text-ink-900">App bloqueado</h1>
        <p className="mt-1 max-w-xs text-sm text-ink-500">
          Use o Face ID ou a digital para acessar seu contrato.
        </p>
      </div>
      <button
        onClick={unlock}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-brand hover:bg-brand-700 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11v2m0 4h.01M7 7a5 5 0 0 1 10 0M5 11a7 7 0 0 1 1.5-4.3M19 11a7 7 0 0 0-1.5-4.3M5 11v3a7 7 0 0 0 14 0v-3" /></svg>
        {busy ? 'Verificando…' : 'Desbloquear'}
      </button>
      {err && <p className="text-xs font-medium text-neg-700">{err}</p>}
      <button onClick={usePassword} className="text-sm font-medium text-ink-500 hover:text-ink-800">
        Entrar com senha
      </button>
    </div>
  )
}
