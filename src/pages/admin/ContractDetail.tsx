import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applyIpcaCorrection,
  getContractCalc,
  getDb,
  recordPayment,
  setPaymentStatus,
  setPixKey,
} from '@/lib/repo'
import { useDb } from '@/lib/store'
import { brl, parseMoney, pct } from '@/lib/format'
import { formatDateBR, formatMonthBR, todayISO } from '@/lib/dates'
import { summarizeByYear, type ScheduleRow } from '@/lib/finance'
import {
  Badge,
  Button,
  Card,
  Field,
  INSTALLMENT_STATUS_LABEL,
  INSTALLMENT_STATUS_TONE,
  Input,
  Modal,
  Notice,
  PAYMENT_STATUS_LABEL,
  PageHeader,
  Row,
  Textarea,
} from '@/components/ui'

type Tab = 'resumo' | 'cronograma' | 'pagamentos' | 'ipca' | 'pix' | 'historico'

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'pagamentos', label: 'Pagamentos' },
  { id: 'ipca', label: 'IPCA & Previsão' },
  { id: 'pix', label: 'Chave Pix' },
  { id: 'historico', label: 'Histórico' },
]

export function ContractDetail() {
  useDb()
  const { id } = useParams<{ id: string }>()
  const calc = id ? getContractCalc(id) : null
  const [tab, setTab] = useState<Tab>('resumo')
  const [payModal, setPayModal] = useState<{ row: ScheduleRow } | null>(null)
  const [ipcaModal, setIpcaModal] = useState(false)
  const [pixModal, setPixModal] = useState(false)

  if (!calc) {
    return (
      <div className="py-20 text-center text-ink-500">
        Contrato não encontrado.{' '}
        <Link to="/admin/contratos" className="text-brand-600">
          Voltar
        </Link>
      </div>
    )
  }

  const { contract, client, state } = calc

  return (
    <div>
      <Link to="/admin/contratos" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        ← Contratos
      </Link>
      <PageHeader
        title={contract.title}
        subtitle={`${client?.name} · ${client?.document}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setIpcaModal(true)}>
              Aplicar IPCA
            </Button>
            <Button onClick={() => setTab('cronograma')}>Registrar pagamento</Button>
          </>
        }
      />

      {/* Resumo rápido sempre visível */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card card-hover p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Saldo devedor atual</div>
          <div className="num-display mt-2 text-2xl font-bold text-ink-900">{brl(state.currentBalance)}</div>
        </div>
        <div className="card card-hover p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Próxima parcela</div>
          <div className="num-display mt-2 text-2xl font-bold text-ink-900">{brl(state.currentInstallmentValue)}</div>
          <div className="mt-1 text-xs text-ink-400">
            {state.nextInstallmentNumber ? `#${state.nextInstallmentNumber} · ${formatDateBR(state.nextInstallmentDueDate)}` : 'quitado'}
          </div>
        </div>
        <div className="card card-hover p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total recebido</div>
          <div className="num-display mt-2 text-2xl font-bold text-pos-600">{brl(state.totalPaid)}</div>
        </div>
        <div className="card card-hover p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Parcelas vencidas</div>
          <div className={`num-display mt-2 text-2xl font-bold ${state.overdueCount ? 'text-neg-700' : 'text-ink-900'}`}>
            {state.overdueCount}
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'resumo' && <ResumoTab calc={calc} />}
        {tab === 'cronograma' && (
          <CronogramaTab calc={calc} onPay={(row) => setPayModal({ row })} />
        )}
        {tab === 'pagamentos' && <PagamentosTab calc={calc} />}
        {tab === 'ipca' && <IpcaTab calc={calc} onApply={() => setIpcaModal(true)} />}
        {tab === 'pix' && <PixTab calc={calc} onEdit={() => setPixModal(true)} />}
        {tab === 'historico' && <HistoricoTab calc={calc} />}
      </div>

      {payModal && (
        <PaymentModal
          calc={calc}
          row={payModal.row}
          onClose={() => setPayModal(null)}
        />
      )}
      {ipcaModal && <IpcaModal calc={calc} onClose={() => setIpcaModal(false)} />}
      {pixModal && <PixModal calc={calc} onClose={() => setPixModal(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba: Resumo
// ---------------------------------------------------------------------------
function ResumoTab({ calc }: { calc: NonNullable<ReturnType<typeof getContractCalc>> }) {
  const { contract, state, client } = calc
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Resumo financeiro</h3>
        <Row label="Valor total da venda" value={brl(contract.totalValue)} />
        <Row label="Entrada" value={`${brl(contract.downPaymentValue)} em ${contract.downPaymentInstallments}x`} />
        <Row label="Saldo financiado" value={brl(contract.financedValue)} />
        <Row label="Parcelas do financiamento" value={`${contract.financingInstallments}x`} />
        <Row label="Parcela base (sem IPCA)" value={brl(contract.baseInstallmentValue)} />
        <div className="my-2 border-t border-ink-200" />
        <Row label="Saldo devedor atual" value={brl(state.currentBalance)} strong />
        <Row label="Total recebido" value={brl(state.totalPaid)} />
        <Row label="Total amortizado" value={brl(state.totalAmortized)} />
        <Row label="Total em aberto (previsto)" value={brl(state.totalOpenProjected)} />
        <div className="my-2 border-t border-ink-200" />
        <Row label="Total previsto com IPCA" value={brl(state.totalProjectedWithIpca)} />
        <Row label="Total sem IPCA (financiado)" value={brl(state.totalWithoutIpca)} />
        <Row
          label="Próxima correção"
          value={state.nextCorrection ? `${formatDateBR(state.nextCorrection.date)} (${state.nextCorrection.index}ª)` : '—'}
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Cliente</h3>
        <Row label="Nome" value={client?.name} />
        <Row label="CPF / CNPJ" value={client?.document} />
        <Row label="Telefone" value={client?.phone || '—'} />
        <Row label="E-mail" value={client?.email || '—'} />
        <Row label="Endereço" value={client?.address || '—'} />
        <div className="my-3 border-t border-ink-200" />
        <h3 className="mb-2 text-base font-semibold text-ink-900">Observações</h3>
        <p className="text-sm text-ink-600">
          <span className="font-medium text-ink-700">Internas: </span>
          {contract.internalNotes || '—'}
        </p>
        <p className="mt-2 text-sm text-ink-600">
          <span className="font-medium text-ink-700">Visível ao cliente: </span>
          {contract.clientNotes || '—'}
        </p>
        <div className="mt-4">
          <Link to={`/cliente/${contract.id}`} target="_blank">
            <Button variant="secondary" size="sm">
              Abrir área do cliente ↗
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba: Cronograma
// ---------------------------------------------------------------------------
function CronogramaTab({
  calc,
  onPay,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onPay: (row: ScheduleRow) => void
}) {
  const rows = [...calc.downRows, ...calc.schedule.rows]
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Parcela</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Saldo após</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={`${r.type}-${r.number}`} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-medium text-ink-800">#{r.number}</td>
                <td className="px-4 py-2.5 text-ink-500">
                  {r.type === 'entrada' ? 'Entrada' : 'Financiamento'}
                  {r.correction && (
                    <Badge tone="info">IPCA {pct(r.correction.ipca)}</Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 tnum text-ink-600">{formatDateBR(r.dueDate)}</td>
                <td className="px-4 py-2.5 text-right tnum font-medium text-ink-900">{brl(r.value)}</td>
                <td className="px-4 py-2.5 text-right tnum text-ink-500">
                  {r.type === 'financiamento' ? brl(r.balanceAfter) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={INSTALLMENT_STATUS_TONE[r.status]}>
                    {INSTALLMENT_STATUS_LABEL[r.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.status !== 'paga' && (
                    <Button size="sm" variant="ghost" onClick={() => onPay(r)}>
                      Registrar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba: Pagamentos
// ---------------------------------------------------------------------------
function PagamentosTab({ calc }: { calc: NonNullable<ReturnType<typeof getContractCalc>> }) {
  const paid = calc.payments
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Parcela</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Amortização</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Comprovante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {paid.map((p) => (
              <tr key={p.id} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-medium text-ink-800">
                  {p.installmentType === 'entrada' ? 'Entrada' : 'Fin.'} #{p.installmentNumber}
                </td>
                <td className="px-4 py-2.5 tnum text-ink-600">{formatDateBR(p.paymentDate)}</td>
                <td className="px-4 py-2.5 text-right tnum text-ink-900">{brl(p.amount)}</td>
                <td className="px-4 py-2.5 text-right tnum text-ink-600">
                  {p.amortizationAmount > 0 ? brl(p.amortizationAmount) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={p.status === 'pago' ? 'pos' : p.status === 'comprovante_enviado' ? 'warn' : 'muted'}>
                    {PAYMENT_STATUS_LABEL[p.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {p.receiptUrl ? (
                    <div className="flex items-center gap-2">
                      <a href={p.receiptUrl} target="_blank" className="text-brand-600 hover:underline">
                        Ver
                      </a>
                      {p.status !== 'pago' && (
                        <Button size="sm" variant="ghost" onClick={() => setPaymentStatus(p.id, 'pago')}>
                          Aprovar
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {paid.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-ink-400">
                  Nenhum pagamento registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba: IPCA & Previsão
// ---------------------------------------------------------------------------
function IpcaTab({
  calc,
  onApply,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onApply: () => void
}) {
  const blocks = summarizeByYear(calc.schedule)
  return (
    <div className="space-y-6">
      <Notice>
        A correção é aplicada <b>a cada 12 meses</b> (no aniversário do contrato), sobre o saldo
        devedor em aberto na data do reajuste — não no início do ano-calendário. A tabela abaixo é
        uma previsão com IPCA de {pct(calc.contract.forecastAnnualIpca)} por ciclo de 12 meses.
      </Notice>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-base font-semibold text-ink-900">Previsão por ciclo de 12 meses</h3>
          <Button size="sm" variant="secondary" onClick={onApply}>
            Inserir IPCA oficial
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-5 py-3">Ciclo (12 meses)</th>
                <th className="px-5 py-3">Parcelas</th>
                <th className="px-5 py-3">Período</th>
                <th className="px-5 py-3 text-right">IPCA estimado</th>
                <th className="px-5 py-3 text-right">Valor mensal</th>
                <th className="px-5 py-3 text-right">Saldo devedor (fim)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {blocks.map((b) => (
                <tr key={b.yearIndex}>
                  <td className="px-5 py-2.5 font-medium text-ink-800">{b.label}</td>
                  <td className="px-5 py-2.5 tnum text-ink-600">{b.fromNumber} a {b.toNumber}</td>
                  <td className="px-5 py-2.5 text-ink-600">
                    {formatMonthBR(b.fromDate)} a {formatMonthBR(b.toDate)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {b.hasCorrection ? (
                      <Badge tone="info">{pct(b.ipca)}</Badge>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right tnum font-medium text-ink-900">{brl(b.installmentValue)}</td>
                  <td className="px-5 py-2.5 text-right tnum text-ink-700">{brl(b.balanceEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Correções IPCA</h3>
        {calc.schedule.corrections.length === 0 ? (
          <p className="text-sm text-ink-400">Nenhuma correção no horizonte.</p>
        ) : (
          <div className="space-y-2">
            {calc.schedule.corrections.map((c) => (
              <div key={c.index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 px-4 py-3">
                <div>
                  <div className="font-medium text-ink-800">
                    {c.index}ª correção · {formatDateBR(c.date)}
                  </div>
                  <div className="text-sm text-ink-500">
                    A partir da parcela #{c.fromInstallment} · {c.installmentsAffected} parcelas
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge tone={c.isOfficial ? 'pos' : 'info'}>
                    {c.isOfficial ? 'Oficial' : 'Previsto'} {pct(c.ipca)}
                  </Badge>
                  <div className="text-right">
                    <div className="tnum text-sm text-ink-500">
                      {brl(c.previousInstallment)} → <span className="font-semibold text-ink-900">{brl(c.newInstallment)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba: Pix
// ---------------------------------------------------------------------------
function PixTab({
  calc,
  onEdit,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onEdit: () => void
}) {
  return (
    <div className="space-y-4">
      <Notice>
        A chave Pix pode ser trocada mês a mês. O sistema mantém o histórico de todas
        as chaves utilizadas.
      </Notice>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Atualizar chave Pix
        </Button>
      </div>
      <PixList contractId={calc.contract.id} />
    </div>
  )
}

function PixList({ contractId }: { contractId: string }) {
  useDb()
  const keys = getPixKeysLocal(contractId)
  return (
    <Card className="p-0">
      <div className="divide-y divide-ink-200">
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <div className="tnum font-medium text-ink-900">{k.pixKey || '—'}</div>
              <div className="text-sm text-ink-500">
                {k.receiverName} · {k.bankName} · desde {formatDateBR(k.activeFrom)}
              </div>
            </div>
            <Badge tone={k.status === 'ativa' ? 'pos' : 'muted'}>{k.status}</Badge>
          </div>
        ))}
        {keys.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-400">Nenhuma chave cadastrada.</p>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba: Histórico (auditoria)
// ---------------------------------------------------------------------------
function HistoricoTab({ calc }: { calc: NonNullable<ReturnType<typeof getContractCalc>> }) {
  const logs = getAuditLocal(calc.contract.id)
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold text-ink-900">Histórico e auditoria</h3>
      <div className="space-y-3">
        {logs.map((l) => (
          <div key={l.id} className="flex gap-3 border-l-2 border-ink-200 pl-4">
            <div>
              <div className="text-sm text-ink-800">{l.description}</div>
              <div className="text-xs text-ink-400">
                {new Date(l.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          </div>
        ))}
        {logs.length === 0 && <p className="text-sm text-ink-400">Sem registros.</p>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------
function PaymentModal({
  calc,
  row,
  onClose,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  row: ScheduleRow
  onClose: () => void
}) {
  const [amount, setAmount] = useState(String(row.value))
  const [amort, setAmort] = useState('0')
  const [date, setDate] = useState(todayISO())
  const isFin = row.type === 'financiamento'
  const total = parseMoney(amount) + (isFin ? parseMoney(amort) : 0)

  function save() {
    recordPayment({
      contractId: calc.contract.id,
      installmentType: row.type,
      installmentNumber: row.number,
      paymentDate: date,
      amount: parseMoney(amount),
      amortizationAmount: isFin ? parseMoney(amort) : 0,
      status: 'pago',
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Registrar pagamento — parcela #${row.number}`}>
      <div className="space-y-4">
        <Field label="Data do pagamento">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Valor pago (parcela)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {isFin && (
          <Field
            label="Valor extra para amortizar o saldo"
            hint="Opcional — reduz o saldo devedor e recalcula as próximas parcelas."
          >
            <Input value={amort} onChange={(e) => setAmort(e.target.value)} />
          </Field>
        )}
        <div className="rounded-lg bg-ink-50 px-4 py-3">
          <Row label="Total a registrar" value={brl(total)} strong />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Confirmar pagamento</Button>
        </div>
      </div>
    </Modal>
  )
}

function IpcaModal({
  calc,
  onClose,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onClose: () => void
}) {
  // Próxima correção sem índice oficial.
  const next = calc.schedule.corrections.find((c) => !c.isOfficial) ?? calc.schedule.corrections[0]
  const [index, setIndex] = useState(String(next?.index ?? 1))
  const [date, setDate] = useState(next?.date ?? calc.contract.correctionBaseDate)
  const [ipca, setIpca] = useState('')
  const [notes, setNotes] = useState('')

  function save() {
    applyIpcaCorrection({
      contractId: calc.contract.id,
      index: Number(index),
      correctionDate: date,
      ipcaPercentage: (parseFloat(ipca.replace(',', '.')) || 0) / 100,
      notes,
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Aplicar correção IPCA oficial">
      <div className="space-y-4">
        <Notice>
          A correção será aplicada sobre o saldo devedor em aberto na data do reajuste e
          recalculará as parcelas vincendas.
        </Notice>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nº da correção">
            <Input value={index} onChange={(e) => setIndex(e.target.value)} />
          </Field>
          <Field label="Data do reajuste">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="IPCA acumulado (% no período)">
          <Input value={ipca} onChange={(e) => setIpca(e.target.value)} placeholder="Ex.: 4,62" />
        </Field>
        <Field label="Observação">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Aplicar correção</Button>
        </div>
      </div>
    </Modal>
  )
}

function PixModal({
  calc,
  onClose,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onClose: () => void
}) {
  const current = getActivePixLocal(calc.contract.id)
  const [pixKey, setKey] = useState(current?.pixKey ?? '')
  const [receiverName, setReceiver] = useState(current?.receiverName ?? '')
  const [bankName, setBank] = useState(current?.bankName ?? '')
  const [activeFrom, setFrom] = useState(todayISO())

  function save() {
    setPixKey(calc.contract.id, { pixKey, receiverName, bankName, activeFrom })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Atualizar chave Pix">
      <div className="space-y-4">
        <Field label="Chave Pix">
          <Input value={pixKey} onChange={(e) => setKey(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" />
        </Field>
        <Field label="Nome do recebedor">
          <Input value={receiverName} onChange={(e) => setReceiver(e.target.value)} />
        </Field>
        <Field label="Banco">
          <Input value={bankName} onChange={(e) => setBank(e.target.value)} />
        </Field>
        <Field label="Ativa a partir de">
          <Input type="date" value={activeFrom} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar chave</Button>
        </div>
      </div>
    </Modal>
  )
}

// Helpers locais (acesso direto ao repo para listas auxiliares)
function getPixKeysLocal(contractId: string) {
  return getDb().pixKeys.filter((p) => p.contractId === contractId)
}
function getActivePixLocal(contractId: string) {
  return getDb().pixKeys.find((p) => p.contractId === contractId && p.status === 'ativa')
}
function getAuditLocal(contractId: string) {
  return getDb().auditLogs.filter((l) => l.contractId === contractId)
}
