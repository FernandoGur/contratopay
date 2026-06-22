import { useState } from 'react'
import { login } from '@/lib/repo'
import { markUnlocked } from '@/lib/biometric'
import { useSupabase } from '@/lib/supabase'
import { Button, Field, Input, Notice } from '@/components/ui'
import { LogoMark, Wordmark } from '@/components/Logo'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      markUnlocked() // login explícito já conta como destravado
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function quick(em: string, pw: string) {
    setError('')
    setLoading(true)
    try {
      await login(em, pw)
      markUnlocked()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-auto" />
          <div className="mt-1">
            <Wordmark size="lg" />
          </div>
          <p className="mt-0.5 text-sm text-ink-500">Gestão Inteligente de Contratos</p>
        </div>

        <div className="card p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="E-mail">
              <Input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoFocus
              />
            </Field>
            <Field label="Senha">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </Field>
            {error && <Notice tone="warn">{error}</Notice>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {!useSupabase && (
            <>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-ink-200" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  Acesso de teste
                </span>
                <div className="h-px flex-1 bg-ink-200" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={() => quick('admin@local', 'admin')}>
                  Vendedor
                </Button>
                <Button variant="secondary" size="sm" onClick={() => quick('cliente@local', 'cliente')}>
                  Cliente
                </Button>
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          {useSupabase
            ? 'Acesse com o e-mail e a senha cadastrados.'
            : 'Dados salvos neste dispositivo. Versão de demonstração.'}
        </p>
      </div>
    </div>
  )
}
