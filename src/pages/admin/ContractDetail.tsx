import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applyIpcaCorrection,
  getContractCalc,
  getDb,
  recordAmortization,
  recordPayment,
  deletePayment,
  setPixKey,
  updateContract,
} from '@/lib/repo'
import { useDb } from '@/lib/store'
import { brl, pct } from '@/lib/format'
import { formatDateBR, formatMonthBR, todayISO } from '@/lib/dates'
import { openReceipt } from '@/lib/receipt'
import { parseReceiptNotes } from '@/lib/requests'
import {
  simulateAnticipateLast,
  simulateExtraPayment,
  summarizeByYear,
  type ScheduleRow,
} from '@/lib/finance'
import {
  Badge,
  Button,
  Card,
  Field,
  INSTALLMENT_STATUS_LABEL,
  INSTALLMENT_STATUS_TONE,
  Input,
  Modal,
  MoneyInput,
  Notice,
  PAYMENT_STATUS_LABEL,
  PageHeader,
  Row,
  Select,
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
  const [reviewPayment, setReviewPayment] = useState<
    NonNullable<ReturnType<typeof getContractCalc>>['payments'][number] | null
  >(null)
  const [ipcaModal, setIpcaModal] = useState(false)
  const [pixModal, setPixModal] = useState(false)
  const [editModal, setEditModal] = useState(false)

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
            <Button variant="secondary" onClick={() => setEditModal(true)}>
              Editar contrato
            </Button>
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
        {tab === 'pagamentos' && (
          <PagamentosTab
            calc={calc}
            onEdit={(row) => setPayModal({ row })}
            onReview={(p) => setReviewPayment(p)}
          />
        )}
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
      {reviewPayment && (
        <ReviewReceiptModal
          calc={calc}
          payment={reviewPayment}
          onClose={() => setReviewPayment(null)}
        />
      )}
      {ipcaModal && <IpcaModal calc={calc} onClose={() => setIpcaModal(false)} />}
      {pixModal && <PixModal calc={calc} onClose={() => setPixModal(false)} />}
      {editModal && <EditContractModal calc={calc} onClose={() => setEditModal(false)} />}
    </div>
  )
}

function EditContractModal({
  calc,
  onClose,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onClose: () => void
}) {
  const c = calc.contract
  const [title, setTitle] = useState(c.title)
  const [status, setStatus] = useState(c.status)
  const [ipcaText, setIpcaText] = useState(String((c.forecastAnnualIpca * 100).toString().replace('.', ',')))
  const [clientNotes, setClientNotes] = useState(c.clientNotes)
  const [internalNotes, setInternalNotes] = useState(c.internalNotes)

  function save() {
    if (!title.trim()) return
    updateContract(c.id, {
      title: title.trim(),
      status,
      forecastAnnualIpca: (parseFloat(ipcaText.replace(',', '.')) || 0) / 100,
      clientNotes,
      internalNotes,
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Editar contrato" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nome do contrato / imóvel">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Venda de Terreno — Lote 00" />
          </Field>
        </div>
        <Field label="Status do contrato">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ativo">Ativo</option>
            <option value="quitado">Quitado</option>
            <option value="atrasado">Atrasado</option>
            <option value="renegociado">Renegociado</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </Field>
        <Field label="IPCA estimado (% ao ano)" hint="Usado nas simulações/projeções.">
          <Input value={ipcaText} onChange={(e) => setIpcaText(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Observações visíveis ao cliente">
            <Textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Observações internas (não aparecem ao cliente)">
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save}>Salvar alterações</Button>
      </div>
    </Modal>
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
                  <Button size="sm" variant="ghost" onClick={() => onPay(r)}>
                    {r.status === 'paga' ? 'Editar' : 'Registrar'}
                  </Button>
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
function PagamentosTab({
  calc,
  onEdit,
  onReview,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onEdit: (row: ScheduleRow) => void
  onReview: (payment: NonNullable<ReturnType<typeof getContractCalc>>['payments'][number]) => void
}) {
  // Esconde lançamentos "pago" sem valor (R$ 0,00 e sem amortização) — não são
  // pagamentos de fato; mantém comprovantes enviados e demais status.
  const paid = calc.payments.filter(
    (p) => p.status !== 'pago' || p.amount > 0 || p.amortizationAmount > 0,
  )
  // Localiza a linha do cronograma correspondente a um pagamento (para editar).
  // Amortização avulsa não tem parcela vinculada (só pode ser removida).
  const rowFor = (p: (typeof paid)[number]) =>
    p.installmentType === 'amortizacao'
      ? undefined
      : p.installmentType === 'entrada'
        ? calc.downRows.find((r) => r.number === p.installmentNumber)
        : calc.schedule.rows.find((r) => r.number === p.installmentNumber)
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
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {paid.map((p) => (
              <tr key={p.id} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-medium text-ink-800">
                  {p.installmentType === 'amortizacao' || (p.amount <= 0 && p.amortizationAmount > 0)
                    ? 'Amortização'
                    : `${p.installmentType === 'entrada' ? 'Entrada' : 'Fin.'} #${p.installmentNumber}`}
                  {(() => {
                    const it = parseReceiptNotes(p.notes).intent
                    return it ? (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        pedido: {it.mode === 'amortizar' ? 'amortizar' : 'quitar'}
                      </span>
                    ) : null
                  })()}
                </td>
                <td className="px-4 py-2.5 tnum text-ink-600">{formatDateBR(p.paymentDate)}</td>
                <td className="px-4 py-2.5 text-right tnum text-ink-900">
                  {p.amount > 0 ? brl(p.amount) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tnum text-ink-600">
                  {p.amortizationAmount > 0 ? brl(p.amortizationAmount) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    tone={
                      p.amount <= 0 && p.amortizationAmount > 0
                        ? 'info'
                        : p.status === 'pago'
                          ? 'pos'
                          : p.status === 'comprovante_enviado'
                            ? 'warn'
                            : 'muted'
                    }
                  >
                    {p.amount <= 0 && p.amortizationAmount > 0
                      ? 'Amortização'
                      : PAYMENT_STATUS_LABEL[p.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {p.receiptUrl ? (
                    <Button size="sm" variant="secondary" onClick={() => onReview(p)}>
                      Revisar
                    </Button>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {p.installmentType === 'amortizacao' ? (
                    <Button size="sm" variant="ghost" onClick={() => deletePayment(p.id)}>
                      Remover
                    </Button>
                  ) : (
                    (() => {
                      const row = rowFor(p)
                      return row ? (
                        <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
                          Editar
                        </Button>
                      ) : null
                    })()
                  )}
                </td>
              </tr>
            ))}
            {paid.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-ink-400">
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
  // Pré-preenche com o lançamento já existente (permite editar), senão usa o
  // valor da parcela do cronograma.
  const existing = calc.payments.find(
    (p) => p.installmentType === row.type && p.installmentNumber === row.number,
  )
  const [amount, setAmount] = useState(existing?.amount ?? row.value)
  const [amort, setAmort] = useState(existing?.amortizationAmount ?? 0)
  const [date, setDate] = useState(existing?.paymentDate ?? todayISO())
  const isFin = row.type === 'financiamento'
  // Amortização extra no máximo zera o saldo que sobra após esta parcela.
  const maxAmort = Math.max(0, row.balanceAfter)
  const total = amount + (isFin ? amort : 0)

  function save() {
    const am = isFin ? Math.min(amort, maxAmort) : 0
    // Amortização PURA (sem pagar a parcela) vira lançamento avulso, não fica
    // presa à parcela do mês.
    if (amount <= 0 && am > 0) {
      recordAmortization({
        contractId: calc.contract.id,
        applyAtInstallment: row.number,
        amount: am,
        paymentDate: date,
      })
      if (existing) deletePayment(existing.id)
    } else {
      recordPayment({
        contractId: calc.contract.id,
        installmentType: row.type,
        installmentNumber: row.number,
        paymentDate: date,
        amount,
        amortizationAmount: am,
        status: 'pago',
      })
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${existing ? 'Editar' : 'Registrar'} pagamento — parcela #${row.number}`}
    >
      <div className="space-y-4">
        <Field label="Data do pagamento">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Valor pago (parcela)">
          <MoneyInput value={amount} onValueChange={setAmount} />
        </Field>
        {isFin && (
          <Field
            label="Valor extra para amortizar o saldo"
            hint={`Opcional — reduz o saldo devedor. Máximo ${brl(maxAmort)} (zera o saldo).`}
          >
            <MoneyInput value={amort} onValueChange={(n) => setAmort(Math.min(n, maxAmort))} />
          </Field>
        )}
        <div className="rounded-lg bg-ink-50 px-4 py-3">
          <Row label="Total a registrar" value={brl(total)} strong />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>{existing ? 'Salvar alterações' : 'Confirmar pagamento'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Modal: Revisar comprovante (conferir e dar baixa)
// ---------------------------------------------------------------------------
type ReviewMode = 'parcela' | 'amortizar' | 'antecipar'

function ReviewReceiptModal({
  calc,
  payment,
  onClose,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  payment: NonNullable<ReturnType<typeof getContractCalc>>['payments'][number]
  onClose: () => void
}) {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const isFin = payment.installmentType === 'financiamento'
  const sourceRows = isFin ? calc.schedule.rows : calc.downRows
  const openFin = calc.schedule.rows.filter((r) => r.status !== 'paga')
  const submittedRow = sourceRows.find((r) => r.number === payment.installmentNumber)

  // Pedido do cliente (amortizar / quitar) anexado ao comprovante: pré-seleciona
  // o modo e o valor; o vendedor ainda pode ajustar antes de confirmar.
  const intent = parseReceiptNotes(payment.notes).intent

  const [date, setDate] = useState(payment.paymentDate || todayISO())
  const [amount, setAmount] = useState(
    intent ? intent.amount : payment.amount > 0 ? payment.amount : submittedRow?.value ?? 0,
  )
  const [mode, setMode] = useState<ReviewMode>(
    intent ? (intent.mode === 'amortizar' ? 'amortizar' : 'antecipar') : 'parcela',
  )
  const [count, setCount] = useState(intent?.count ?? 1)
  // No modo "amortizar": o valor inclui a parcela do mês (quita + amortiza o
  // excedente) ou é só amortização (parcela continua a vencer)?
  const [amortIncludesParcela, setAmortIncludesParcela] = useState(false)

  const isImage =
    !!payment.receiptUrl && /^data:image|\.(png|jpe?g|webp|gif)(\?|$)/i.test(payment.receiptUrl)

  // Modo "quitar parcela(s)": consecutivas em aberto a partir da enviada.
  const startIdx = submittedRow ? sourceRows.findIndex((r) => r.number === submittedRow.number) : -1
  const parcelaSelection =
    startIdx >= 0
      ? sourceRows.slice(startIdx).filter((r) => r.status !== 'paga').slice(0, Math.max(1, count))
      : []
  const parcelaTotal = r2(parcelaSelection.reduce((s, r) => s + r.value, 0))
  const maxParcelas = startIdx >= 0 ? sourceRows.slice(startIdx).filter((r) => r.status !== 'paga').length : 0

  // Modo amortizar: parte que vai para o saldo (amortização) depende de incluir
  // ou não a parcela do mês.
  const parcelaValueFin = isFin ? submittedRow?.value ?? 0 : 0
  const amortAmount = amortIncludesParcela ? r2(Math.max(0, amount - parcelaValueFin)) : amount
  const amortSim =
    mode === 'amortizar' ? simulateExtraPayment(calc.contract, calc.scheduleOpts, amortAmount) : null
  const antSim = mode === 'antecipar' ? simulateAnticipateLast(calc.contract, calc.scheduleOpts, count) : null

  // Avisos por modo.
  const expected = mode === 'parcela' ? parcelaTotal : antSim?.payToday ?? 0
  const mismatch = mode !== 'amortizar' && Math.abs(amount - expected) >= 0.01
  // No "amortizar + quitar parcela", o valor precisa cobrir a parcela do mês.
  const amortShort = mode === 'amortizar' && amortIncludesParcela && amount < parcelaValueFin - 0.01

  function confirm() {
    if (mode === 'parcela') {
      parcelaSelection.forEach((r, i) => {
        recordPayment({
          contractId: calc.contract.id,
          installmentType: r.type,
          installmentNumber: r.number,
          paymentDate: date,
          amount: r.value,
          status: 'pago',
          receiptUrl: i === 0 ? payment.receiptUrl : undefined,
        })
      })
    } else if (mode === 'amortizar' && isFin) {
      if (amortIncludesParcela) {
        // Quita a parcela do mês (registro da parcela) e o excedente vira uma
        // amortização avulsa (lançamento próprio, sem número de parcela).
        recordPayment({
          contractId: calc.contract.id,
          installmentType: 'financiamento',
          installmentNumber: payment.installmentNumber,
          paymentDate: date,
          amount: parcelaValueFin,
          status: 'pago',
          receiptUrl: payment.receiptUrl,
        })
        if (amortAmount > 0) {
          recordAmortization({
            contractId: calc.contract.id,
            applyAtInstallment: payment.installmentNumber,
            amount: amortAmount,
            paymentDate: date,
          })
        }
      } else {
        // Só amortização: lançamento avulso (com o comprovante) e remove o
        // registro original da parcela (ela NÃO é quitada).
        recordAmortization({
          contractId: calc.contract.id,
          applyAtInstallment: openFin[0]?.number ?? payment.installmentNumber,
          amount: amortAmount,
          paymentDate: date,
          receiptUrl: payment.receiptUrl,
        })
        deletePayment(payment.id)
      }
    } else if (mode === 'antecipar' && antSim) {
      const lastK = openFin.slice(-antSim.count)
      const per = r2(antSim.payToday / Math.max(1, lastK.length))
      const inLastK = lastK.some((r) => r.number === payment.installmentNumber && isFin)
      lastK.forEach((r, i) => {
        recordPayment({
          contractId: calc.contract.id,
          installmentType: 'financiamento',
          installmentNumber: r.number,
          paymentDate: date,
          amount: per,
          status: 'pago',
          receiptUrl: i === 0 ? payment.receiptUrl : undefined,
        })
      })
      // Se o comprovante foi enviado para uma parcela fora das últimas, remove o
      // lançamento original (foi realocado para a antecipação).
      if (!inLastK) deletePayment(payment.id)
    }
    onClose()
  }

  const tab = (m: ReviewMode, label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        mode === m ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Modal open onClose={onClose} title={`Revisar comprovante — ${isFin ? 'parcela' : 'entrada'} #${payment.installmentNumber}`} wide>
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Comprovante */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Comprovante</div>
          {payment.receiptUrl ? (
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
              {isImage ? (
                <button
                  type="button"
                  onClick={() => openReceipt(payment.receiptUrl)}
                  className="group relative block w-full bg-white"
                >
                  <img src={payment.receiptUrl} alt="Comprovante" className="max-h-72 w-full object-contain" />
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    Abrir ↗
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openReceipt(payment.receiptUrl)}
                  className="flex h-40 w-full flex-col items-center justify-center gap-2 text-brand-600 hover:bg-ink-100"
                >
                  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <span className="text-sm font-semibold">Abrir comprovante</span>
                </button>
              )}
              <div className="flex items-center justify-between border-t border-ink-200 bg-white px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-warn-500" />
                  Aguardando validação
                </span>
                <button
                  type="button"
                  onClick={() => openReceipt(payment.receiptUrl)}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Abrir ↗
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-ink-200 text-sm text-ink-400">
              Sem comprovante anexado
            </div>
          )}
        </div>

        {/* Conferência */}
        <div className="space-y-4">
          {intent && (
            <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-900">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              <div>
                <b>Pedido do cliente:</b>{' '}
                {intent.mode === 'amortizar'
                  ? `amortizar o saldo em ${brl(intent.amount)}.`
                  : `quitar ${intent.count && intent.count > 1 ? `as ${intent.count} últimas parcelas` : 'a última parcela'} por ${brl(intent.amount)}.`}
                <span className="mt-0.5 block text-xs text-brand-700">Já pré-selecionado abaixo — confira o comprovante e ajuste se precisar.</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data do recebimento">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Valor recebido">
              <MoneyInput value={amount} onValueChange={setAmount} />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Como aplicar</div>
            <div className="flex gap-1.5">
              {tab('parcela', 'Quitar parcela(s)')}
              {isFin && openFin.length > 0 && tab('amortizar', 'Amortizar')}
              {isFin && openFin.length > 1 && tab('antecipar', 'Antecipar fim')}
            </div>
          </div>

          {/* Modo: quitar parcela(s) */}
          {mode === 'parcela' && (
            <div className="rounded-xl bg-ink-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-600">Quantas parcelas quitar?</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCount((c) => Math.max(1, c - 1))} className="h-7 w-7 rounded-lg bg-white ring-1 ring-ink-200">−</button>
                  <span className="num-display w-6 text-center font-bold">{parcelaSelection.length}</span>
                  <button onClick={() => setCount((c) => Math.min(maxParcelas, c + 1))} className="h-7 w-7 rounded-lg bg-white ring-1 ring-ink-200">+</button>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {parcelaSelection.map((r) => (
                  <div key={`${r.type}-${r.number}`} className="flex justify-between text-xs text-ink-500">
                    <span>{r.type === 'entrada' ? 'Entrada' : 'Parcela'} {r.number} · vence {formatDateBR(r.dueDate)}</span>
                    <span className="num-display text-ink-700">{brl(r.value)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-ink-200 pt-2 text-sm font-semibold">
                <span className="text-ink-700">Total das parcelas</span>
                <span className="num-display text-ink-900">{brl(parcelaTotal)}</span>
              </div>
            </div>
          )}

          {/* Modo: amortizar */}
          {mode === 'amortizar' && amortSim && (
            <div className="space-y-3">
              {/* Escolha explícita: inclui a parcela do mês ou só amortização */}
              <div className="grid gap-1.5">
                <button
                  onClick={() => setAmortIncludesParcela(false)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${!amortIncludesParcela ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200' : 'border-ink-200 hover:bg-ink-50'}`}
                >
                  <div className="font-semibold text-ink-900">Só amortização</div>
                  <div className="text-xs text-ink-500">Não quita a parcela do mês — ela continua a vencer. Todo o valor abate o saldo.</div>
                </button>
                <button
                  onClick={() => setAmortIncludesParcela(true)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${amortIncludesParcela ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200' : 'border-ink-200 hover:bg-ink-50'}`}
                >
                  <div className="font-semibold text-ink-900">Quitar a parcela do mês + amortizar o excedente</div>
                  <div className="text-xs text-ink-500">Quita a parcela ({brl(parcelaValueFin)}) e o restante abate o saldo.</div>
                </button>
              </div>

              <div className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm ring-1 ring-brand-200">
                {amortIncludesParcela && (
                  <Row label={`Quita a parcela #${payment.installmentNumber}`} value={brl(parcelaValueFin)} />
                )}
                <Row label="Vai para amortização" value={brl(amortAmount)} />
                <Row label="Parcela passa a ser" value={`${brl(amortSim.currentInstallmentEstimate)} → ${brl(amortSim.newInstallmentEstimate)}`} />
                <Row label="Saldo passa a ser" value={brl(amortSim.balanceAfter)} />
                <Row label="Economiza de inflação" value={brl(amortSim.netIpcaSavings)} />
              </div>
            </div>
          )}

          {/* Modo: antecipar fim */}
          {mode === 'antecipar' && antSim && (
            <div className="rounded-xl bg-brand-50 p-3 text-sm ring-1 ring-brand-200">
              <div className="flex items-center justify-between">
                <span className="text-ink-600">Quitar as últimas</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCount((c) => Math.max(1, c - 1))} className="h-7 w-7 rounded-lg bg-white ring-1 ring-ink-200">−</button>
                  <span className="num-display w-6 text-center font-bold">{antSim.count}</span>
                  <button onClick={() => setCount((c) => Math.min(antSim.maxCount, c + 1))} className="h-7 w-7 rounded-lg bg-white ring-1 ring-ink-200">+</button>
                </div>
              </div>

              {/* Quais parcelas serão dadas como quitadas (segurança p/ decisão) */}
              <div className="mt-2.5 rounded-lg bg-white p-2.5 ring-1 ring-brand-200/70">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  Parcelas que serão quitadas ({antSim.count})
                </div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {openFin.slice(-antSim.count).map((r) => (
                    <div key={r.number} className="flex items-center justify-between text-xs">
                      <span className="text-ink-600">
                        Parcela <b className="font-semibold text-ink-800">#{r.number}</b> · vence {formatDateBR(r.dueDate)}
                      </span>
                      <span className="num-display text-ink-700">{brl(r.value)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between border-t border-ink-100 pt-1.5 text-xs font-semibold">
                  <span className="text-ink-600">Faixa quitada</span>
                  <span className="text-ink-800">
                    {antSim.count > 1
                      ? `#${openFin.slice(-antSim.count)[0]?.number} a #${openFin[openFin.length - 1]?.number}`
                      : `#${openFin[openFin.length - 1]?.number}`}
                  </span>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                <Row label="Você paga hoje" value={brl(antSim.payToday)} />
                <Row label="Valor cheio no futuro (c/ IPCA)" value={brl(antSim.futureValueWithIpca)} />
                <Row label="Economiza de inflação" value={brl(antSim.ipcaDiscount)} />
                <Row label="Nova última parcela" value={antSim.newLastInstallmentNumber ? `#${antSim.newLastInstallmentNumber} · ${formatDateBR(antSim.newLastInstallmentDate)}` : 'contrato quitado'} />
              </div>
            </div>
          )}

          {mismatch && (
            <Notice tone="warn">
              O valor recebido ({brl(amount)}) é diferente do total da ação ({brl(expected)}). Você pode confirmar mesmo assim.
            </Notice>
          )}
          {amortShort && (
            <Notice tone="warn">
              O valor recebido ({brl(amount)}) é menor que a parcela do mês ({brl(parcelaValueFin)}); não dá para quitá-la. Use "Só amortização" ou aumente o valor.
            </Notice>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirm} disabled={amortShort}>Confirmar recebimento</Button>
          </div>
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
