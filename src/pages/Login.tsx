import { useState } from 'react'
import { login } from '@/lib/repo'
import { Button, Field, Input, Notice } from '@/components/ui'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      login(email, password)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function quick(em: string, pw: string) {
    setError('')
    try {
      login(em, pw)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-brand-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl font-display text-2xl font-extrabold text-white shadow-[var(--shadow-brand)]">
            R
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Recebimentos</h1>
          <p className="mt-1 text-sm text-ink-500">
            Controle de contratos parcelados
          </p>
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
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>

          <div className="mt-6 border-t border-ink-200 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
              Acesso rápido para teste
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => quick('admin@local', 'admin')}>
                Vendedor
              </Button>
              <Button variant="secondary" size="sm" onClick={() => quick('cliente@local', 'cliente')}>
                Cliente
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Dados salvos neste dispositivo. Versão de demonstração.
        </p>
      </div>
    </div>
  )
}
