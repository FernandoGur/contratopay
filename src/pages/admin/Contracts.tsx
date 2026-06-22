import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createContract, getContractCalc, getDb } from '@/lib/repo'
import { useDb } from '@/lib/store'
import { brl, parseMoney } from '@/lib/format'
import { formatDateBR } from '@/lib/dates'
import type { ContractStatus } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Select,
} from '@/components/ui'

const STATUS_TONE: Record<ContractStatus, 'pos' | 'neg' | 'info' | 'warn' | 'muted'> = {
  ativo: 'pos',
  quitado: 'info',
  atrasado: 'neg',
  renegociado: 'warn',
  cancelado: 'muted',
}

export function Contracts() {
  useDb()
  const db = getDb()
  const [open, setOpen] = useState(false)

  return (
    <div>
      <PageHeader
        title="Contratos"
        subtitle="Vendas parceladas com entrada, financiamento e correção IPCA."
        actions={<Button onClick={() => setOpen(true)}>Novo contrato</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {db.contracts.map((c) => {
          const calc = getContractCalc(c.id)!
          return (
            <Link key={c.id} to={`/admin/contratos/${c.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-ink-900">{c.title}</div>
                    <div className="text-sm text-ink-500">{calc.client?.name}</div>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-ink-400">Saldo devedor</div>
                    <div className="tnum font-semibold text-ink-900">
                      {brl(calc.state.currentBalance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">Próxima parcela</div>
                    <div className="tnum font-semibold text-ink-900">
                      {brl(calc.state.currentInstallmentValue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">Total recebido</div>
                    <div className="tnum text-sm text-ink-700">
                      {brl(calc.state.totalPaid)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">Próx. vencimento</div>
                    <div className="text-sm text-ink-700">
                      {formatDateBR(calc.state.nextInstallmentDueDate)}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      <NewContractModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function NewContractModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = getDb()
  const [form, setForm] = useState({
    clientId: db.clients[0]?.id ?? '',
    title: '',
    totalValue: '350000',
    downPaymentValue: '17500',
    downPaymentInstallments: '12',
    downPaymentStartDate: '2025-06-15',
    financingInstallments: '60',
    financingStartDate: '2026-06-15',
    correctionBaseDate: '2026-06-15',
    forecastAnnualIpca: '5',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const financedValue = useMemo(
    () => parseMoney(form.totalValue) - parseMoney(form.downPaymentValue),
    [form.totalValue, form.downPaymentValue],
  )
  const baseInstallment = useMemo(() => {
    const n = Number(form.financingInstallments) || 1
    return financedValue / n
  }, [financedValue, form.financingInstallments])

  function save() {
    if (!form.clientId || !form.title.trim()) return
    createContract({
      clientId: form.clientId,
      title: form.title,
      totalValue: parseMoney(form.totalValue),
      downPaymentValue: parseMoney(form.downPaymentValue),
      downPaymentInstallments: Number(form.downPaymentInstallments),
      downPaymentStartDate: form.downPaymentStartDate,
      financedValue,
      financingInstallments: Number(form.financingInstallments),
      financingStartDate: form.financingStartDate,
      correctionType: 'ipca_anual',
      correctionBaseDate: form.correctionBaseDate,
      correctionFrequencyMonths: 12,
      status: 'ativo',
      internalNotes: '',
      clientNotes: '',
      forecastAnnualIpca: (Number(form.forecastAnnualIpca) || 0) / 100,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo contrato" wide>
      {db.clients.length === 0 ? (
        <Notice tone="warn">Cadastre um cliente antes de criar um contrato.</Notice>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <Select value={form.clientId} onChange={set('clientId')}>
                {db.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descrição do contrato">
              <Input value={form.title} onChange={set('title')} placeholder="Ex.: Venda de Terreno — Lote 00" />
            </Field>
            <Field label="Valor total da venda">
              <MoneyInput
                value={parseMoney(form.totalValue)}
                onValueChange={(n) => setForm((f) => ({ ...f, totalValue: String(n) }))}
              />
            </Field>
            <Field label="Valor da entrada">
              <MoneyInput
                value={parseMoney(form.downPaymentValue)}
                onValueChange={(n) => setForm((f) => ({ ...f, downPaymentValue: String(n) }))}
              />
            </Field>
            <Field label="Parcelas da entrada">
              <Input value={form.downPaymentInstallments} onChange={set('downPaymentInstallments')} />
            </Field>
            <Field label="1º vencimento da entrada">
              <Input type="date" value={form.downPaymentStartDate} onChange={set('downPaymentStartDate')} />
            </Field>
            <Field label="Parcelas do financiamento">
              <Input value={form.financingInstallments} onChange={set('financingInstallments')} />
            </Field>
            <Field label="1ª parcela do financiamento (vencimento)">
              <Input type="date" value={form.financingStartDate} onChange={set('financingStartDate')} />
            </Field>
            <Field label="Data-base da correção IPCA">
              <Input type="date" value={form.correctionBaseDate} onChange={set('correctionBaseDate')} />
            </Field>
            <Field label="IPCA previsto (% ao ano)" hint="Usado nas simulações.">
              <Input value={form.forecastAnnualIpca} onChange={set('forecastAnnualIpca')} />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-ink-50 p-4">
            <div>
              <div className="text-xs text-ink-500">Saldo financiado</div>
              <div className="tnum text-lg font-semibold text-ink-900">{brl(financedValue)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500">Parcela base (sem IPCA)</div>
              <div className="tnum text-lg font-semibold text-ink-900">{brl(baseInstallment)}</div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save}>Criar contrato</Button>
          </div>
        </>
      )}
    </Modal>
  )
}
