import { useState } from 'react'
import { createClient, getContractsByClient, getDb, updateClient } from '@/lib/repo'
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

  function save() {
    if (!form.name.trim()) return
    if (client) updateClient(client.id, form)
    else createClient(form)
    onClose()
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
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save}>{client ? 'Salvar alterações' : 'Salvar cliente'}</Button>
      </div>
    </Modal>
  )
}
