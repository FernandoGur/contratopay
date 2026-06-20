import { useState } from 'react'
import { createClient, getContractsByClient, getDb } from '@/lib/repo'
import { useDb } from '@/lib/store'
import type { ClientStatus } from '@/lib/types'
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
  const [open, setOpen] = useState(false)

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro de clientes vinculados aos contratos."
        actions={<Button onClick={() => setOpen(true)}>Novo cliente</Button>}
      />

      <Card className="p-0">
        <div className="divide-y divide-ink-200">
          {db.clients.map((c) => {
            const contracts = getContractsByClient(c.id)
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="font-medium text-ink-900">{c.name}</div>
                  <div className="text-sm text-ink-500">
                    {c.document} · {c.phone || 'sem telefone'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-500">
                    {contracts.length} contrato{contracts.length === 1 ? '' : 's'}
                  </span>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </div>
              </div>
            )
          })}
          {db.clients.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-400">
              Nenhum cliente cadastrado.
            </p>
          )}
        </div>
      </Card>

      <NewClientModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: '',
    document: '',
    phone: '',
    email: '',
    address: '',
    status: 'ativo' as ClientStatus,
    notes: '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function save() {
    if (!form.name.trim()) return
    createClient(form)
    onClose()
    setForm({ name: '', document: '', phone: '', email: '', address: '', status: 'ativo', notes: '' })
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo cliente">
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
        <Button onClick={save}>Salvar cliente</Button>
      </div>
    </Modal>
  )
}
