import { useState } from 'react'
import { createClient, getContractsByClient, getDb, updateClient } from '@/lib/repo'
import { supabase, useSupabase } from '@/lib/supabase'
import { useDb } from '@/lib/store'
import type { Client, ClientStatus } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui'

const STATUS_TONE: Record<ClientStatus, 'pos' | 'neg' | 'info' | 'muted'> = {
  ativo: 'pos',
  inadimplente: 'neg',
  quitado: 'info',
  bloqueado: 'muted',
}

export function Clients() {
  useDb()
  const db = getDb()
  // null = fechado · 'novo' = criar · Client = editar
  const [editing, setEditing] = useState<Client | 'novo' | null>(null)

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro de clientes vinculados aos contratos."
        actions={<Button onClick={() => setEditing('novo')}>Novo cliente</Button>}
      />

      <Card className="p-0">
        <div className="divide-y divide-ink-200">
          {db.clients.map((c) => {
            const contracts = getContractsByClient(c.id)
            return (
              <button
                key={c.id}
                onClick={() => setEditing(c)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-50"
              >
                <div>
                  <div className="font-medium text-ink-900">{c.name}</div>
                  <div className="text-sm text-ink-500">
                    {c.document || 'sem documento'} · {c.phone || 'sem telefone'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-500">
                    {contracts.length} contrato{contracts.length === 1 ? '' : 's'}
                  </span>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  <span className="text-sm font-medium text-brand-600">Editar</span>
                </div>
              </button>
            )
          })}
          {db.clients.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-400">
              Nenhum cliente cadastrado.
            </p>
          )}
        </div>
      </Card>

      <ClientModal
        key={editing === 'novo' || editing === null ? 'novo' : editing.id}
        client={editing && editing !== 'novo' ? editing : null}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function ClientModal({
  client,
  open,
  onClose,
}: {
  client: Client | null
  open: boolean
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: client?.name ?? '',
    document: client?.document ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
    status: (client?.status ?? 'ativo') as ClientStatus,
    notes: client?.notes ?? '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Acesso (login) do cliente — via Edge Function (somente modo Supabase).
  const [password, setPassword] = useState('')
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessMsg, setAccessMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function save() {
    if (!form.name.trim()) return
    if (client) updateClient(client.id, form)
    else createClient(form)
    onClose()
  }

  async function createAccess() {
    setAccessMsg(null)
    const email = form.email.trim().toLowerCase()
    if (!email) return setAccessMsg({ ok: false, text: 'Preencha o e-mail do cliente.' })
    if (password.length < 6) return setAccessMsg({ ok: false, text: 'Senha de no mínimo 6 caracteres.' })
    setAccessLoading(true)
    try {
      // Garante que o e-mail está salvo no cadastro (RLS liga login ao cliente).
      if (client) updateClient(client.id, { ...form, email })
      const { data, error } = await supabase!.functions.invoke('create-client-user', {
        body: { email, password },
      })
      if (error) throw new Error(error.message)
      const res = data as { error?: string; updated?: boolean } | null
      if (res?.error) throw new Error(res.error)
      setAccessMsg({
        ok: true,
        text: res?.updated
          ? 'Senha do acesso atualizada. O cliente entra com esse e-mail e senha.'
          : 'Acesso criado! O cliente já pode entrar com esse e-mail e a senha definida.',
      })
      setPassword('')
    } catch (e) {
      setAccessMsg({ ok: false, text: 'Não foi possível criar o acesso: ' + (e as Error).message })
    } finally {
      setAccessLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={client ? 'Editar cliente' : 'Novo cliente'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nome completo">
            <Input value={form.name} onChange={set('name')} placeholder="Nome do cliente" />
          </Field>
        </div>
        <Field label="CPF / CNPJ">
          <Input value={form.document} onChange={set('document')} placeholder="000.000.000-00" />
        </Field>
        <Field label="Telefone">
          <Input value={form.phone} onChange={set('phone')} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="E-mail">
          <Input value={form.email} onChange={set('email')} placeholder="email@exemplo.com" />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            <option value="ativo">Ativo</option>
            <option value="inadimplente">Inadimplente</option>
            <option value="quitado">Quitado</option>
            <option value="bloqueado">Bloqueado</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Endereço">
            <Input value={form.address} onChange={set('address')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Observações internas">
            <Textarea value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </div>

      {useSupabase && (
        <div className="mt-4 rounded-xl border border-ink-200 p-4">
          <div className="text-sm font-semibold text-ink-900">Acesso do cliente (login)</div>
          {client ? (
            <>
              <p className="mt-1 text-xs text-ink-500">
                Cria o login com o e-mail acima ({form.email || '—'}) e a senha definida. O cliente
                acessa de qualquer aparelho e vê só o contrato dele.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <Field label="Senha do cliente">
                    <Input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="mín. 6 caracteres"
                    />
                  </Field>
                </div>
                <Button variant="secondary" onClick={createAccess} disabled={accessLoading}>
                  {accessLoading ? 'Criando…' : 'Criar / atualizar login'}
                </Button>
              </div>
              {accessMsg && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                    accessMsg.ok ? 'bg-pos-50 text-pos-700' : 'bg-warn-50 text-warn-700'
                  }`}
                >
                  {accessMsg.text}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-ink-500">
              Salve o cliente primeiro; depois reabra o cadastro para criar o acesso.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save}>{client ? 'Salvar alterações' : 'Salvar cliente'}</Button>
      </div>
    </Modal>
  )
}
