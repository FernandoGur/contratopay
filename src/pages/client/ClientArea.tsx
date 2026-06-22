import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  getActivePixKey,
  getContractCalc,
  getDb,
  logout,
  submitReceipt,
  deletePayment,
} from '@/lib/repo'
import { useCurrentUser, useDb } from '@/lib/store'
import { brl, num, parseMoney, pct } from '@/lib/format'
import { formatDateBR, todayISO } from '@/lib/dates'
import { openReceipt } from '@/lib/receipt'
import { parseReceiptNotes } from '@/lib/requests'
import {
  generateSchedule,
  openBalanceAfter,
  projectOpenCorrections,
  simulateAnticipateLast,
  simulateExtraPayment,
  summarizeByYear,
} from '@/lib/finance'
import {
  Badge,
  Button,
  Card,
  INSTALLMENT_STATUS_LABEL,
  INSTALLMENT_STATUS_TONE,
  MoneyInput,
  Row,
} from '@/components/ui'
import { Logo } from '@/components/Logo'

type ClientTab = 'inicio' | 'parcelas' | 'pagamentos' | 'simular' | 'previsao' | 'contrato'

const CLIENT_TABS: { id: ClientTab; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'parcelas', label: 'Minhas parcelas' },
  { id: 'simular', label: 'Antecipar pagamentos' },
  { id: 'previsao', label: 'Previsão' },
  { id: 'contrato', label: 'Meu contrato' },
]

export function ClientArea() {
  const user = useCurrentUser()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Cliente logado vê o próprio contrato; admin pode abrir via link com :id.
  const calc = useResolvedContract(params.id, user)

  // Sair: encerra a sessão e leva ao login (não depende só do redirect de render).
  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }
  const [tab, setTab] = useState<ClientTab>('inicio')
  const [simMode, setSimMode] = useState<'reduzir' | 'antecipar'>('reduzir')
  const [parcelasFilter, setParcelasFilter] = useState<Filter>('todas')

  // Indicador de rolagem das abas (mostra seta quando há mais abas à direita).
  const navRef = useRef<HTMLDivElement>(null)
  const [navScroll, setNavScroll] = useState({ left: false, right: false })
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const update = () =>
      setNavScroll({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      })
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  const scrollNav = (dir: number) => navRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })

  // Ao trocar de aba, volta ao topo (evita abrir a aba já rolada, escondendo
  // o conteúdo do topo — ex.: os botões amortizar/quitar).
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  // Deslogado não fica preso: manda para o login.
  if (!user) return <Navigate to="/" replace />

  // Cliente com UM contrato não vê o id na URL — usa /cliente limpo (o app
  // resolve pelo login). Se tiver vários, mantém o id para não bloquear o acesso
  // aos demais (até existir um seletor de contratos). O id só persiste assim.
  const myContracts = getDb().contracts.filter((c) => c.clientId === user.clientId)
  if (user.role === 'cliente' && params.id && myContracts.length <= 1)
    return <Navigate to="/cliente" replace />

  if (!calc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink-500">Contrato não encontrado ou indisponível para a sua conta.</p>
        <button
          onClick={handleLogout}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sair e entrar com outra conta
        </button>
      </div>
    )
  }

  const { contract, client } = calc

  // Contrato cancelado: bloqueia o painel (pagar/simular/comprovante não fazem
  // sentido). Antes o status era ignorado e o cliente seguia operando normal.
  if (contract.status === 'cancelado') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neg-50 text-neg-700">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Contrato cancelado</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            Este contrato foi cancelado. Fale com o vendedor para mais informações.
          </p>
        </div>
        <button onClick={handleLogout} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Sair
        </button>
      </div>
    )
  }

  const pix = getActivePixKey(contract.id)
  const clientInitials = (client?.name ?? 'Cliente')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="min-h-screen">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          {/* Marca ContratoPay — clica para voltar à Início */}
          <button
            onClick={() => setTab('inicio')}
            aria-label="Voltar para a Início"
            className="-m-1 cursor-pointer rounded-lg p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <Logo subtitle="Gestão Inteligente de Contratos" markClassName="h-11 w-11" size="lg" />
          </button>

          {/* Avatar do cliente + sair */}
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[13px] font-semibold text-ink-800">{client?.name}</div>
              <div className="text-[11px] text-ink-400">Cliente</div>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600"
              aria-hidden="true"
            >
              {clientInitials}
            </div>
            {user && (
              <button
                onClick={handleLogout}
                aria-label="Sair da conta"
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800"
              >
                Sair
              </button>
            )}
          </div>
        </div>
        {/* Abas roláveis — seta indica que há mais abas à direita */}
        <div className="relative">
          <div
            ref={navRef}
            className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CLIENT_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tab === t.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Esquerda: fade + seta (quando dá para voltar) */}
          {navScroll.left && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
              <button
                onClick={() => scrollNav(-1)}
                aria-label="Abas anteriores"
                className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink-600 shadow-md ring-1 ring-ink-200 hover:text-ink-900"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            </>
          )}

          {/* Direita: fade + seta (quando há mais abas) */}
          {navScroll.right && (
            <>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
              <button
                onClick={() => scrollNav(1)}
                aria-label="Mais abas"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-600 shadow-md ring-1 ring-ink-200 hover:text-brand-700"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === 'inicio' && (
          <InicioDashboard
            calc={calc}
            pix={pix}
            onSimular={() => setTab('simular')}
            onVerParcelas={(f) => {
              setParcelasFilter(f ?? 'todas')
              setTab('parcelas')
            }}
          />
        )}

        {/* Telas internas com a mesma largura da home */}
        {tab !== 'inicio' && (
          <div className="mx-auto max-w-5xl">
            {tab === 'parcelas' && (
              <ParcelasTab
                calc={calc}
                initialFilter={parcelasFilter}
                onQuitarUltima={() => {
                  setSimMode('antecipar')
                  setTab('simular')
                }}
              />
            )}
            {tab === 'simular' && <ExtraBlock calc={calc} initialMode={simMode} />}
            {tab === 'previsao' && <PrevisaoTab calc={calc} />}
            {tab === 'contrato' && <ContratoTab calc={calc} pix={pix} />}
          </div>
        )}

        <p className="mx-auto max-w-5xl pb-10 pt-6 text-center text-xs text-ink-400">
          Esta é uma simulação. Os valores futuros podem variar conforme o IPCA oficial
          e eventuais ajustes no contrato.
        </p>
      </main>
    </div>
  )
}

/** Resolve o contrato do cliente (por param na URL ou pelo cliente logado),
 *  com checagem de POSSE: um cliente só abre o próprio contrato (defesa em
 *  profundidade além do RLS do Supabase). Admin pode abrir qualquer um via link. */
function useResolvedContract(paramId: string | undefined, user: ReturnType<typeof useCurrentUser>) {
  const db = useDb()
  const clientId = user?.clientId
  const role = user?.role
  return useMemo(() => {
    void db
    const cid = paramId ?? getDb().contracts.find((c) => c.clientId === clientId)?.id
    if (!cid) return null
    const calc = getContractCalc(cid)
    if (!calc) return null
    // Cliente não pode abrir contrato de outro pelo id da URL.
    if (role === 'cliente' && calc.contract.clientId !== clientId) return null
    return calc
  }, [paramId, role, clientId, db])
}

// ---------------------------------------------------------------------------
// Tela inicial — painel (dashboard) do cliente
// ---------------------------------------------------------------------------
function InicioDashboard({
  calc,
  pix,
  onSimular,
  onVerParcelas,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  pix: ReturnType<typeof getActivePixKey>
  onSimular: () => void
  onVerParcelas: (filter?: Filter) => void
}) {
  const { state, contract, client } = calc
  const downRows = calc.downRows
  const finRows = calc.schedule.rows
  const paidDown = downRows.filter((r) => r.status === 'paga').length
  const paidFin = finRows.filter((r) => r.status === 'paga').length
  // % por VALOR pago (não por quantidade de parcelas).
  const pctPaid = Math.min(
    100,
    Math.round((state.totalPaid / Math.max(1, contract.totalValue)) * 100),
  )
  const entradaDone = downRows.length > 0 && paidDown === downRows.length
  // "Em aberto" da composição = quanto falta do valor do contrato (inclui as
  // parcelas da ENTRADA ainda abertas). Fecha com "Pago" (Pago + Em aberto =
  // total); usar só o saldo do financiamento deixava a barra sem fechar.
  const emAbertoTotal = Math.max(0, contract.totalValue - state.totalPaid)
  const upcoming = finRows.filter((r) => r.status !== 'paga').slice(0, 3)
  // Ordem global da parcela (entrada 1–12, depois financiamento) para desempate.
  const payOrder = (p: (typeof calc.payments)[number]) =>
    (p.installmentType === 'financiamento' ? 1000 : 0) + p.installmentNumber
  const recentPayments = [...calc.payments]
    // Só pagamentos reais (valor pago > 0 ou amortização > 0). Ignora
    // lançamentos "pago" com R$ 0,00, que não são pagamentos de fato.
    .filter((p) => p.status === 'pago' && (p.amount > 0 || p.amortizationAmount > 0))
    // Mais recente primeiro; no mesmo dia, a parcela mais recente vem antes.
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || payOrder(b) - payOrder(a))
    .slice(0, 3)

  return (
    <div className="space-y-5">
      {/* HERO — andamento do contrato (anel + números + composição da carteira) */}
      <div className="card p-5 sm:p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-400">Seu contrato</div>
        <h1 className="font-display mt-0.5 text-xl font-bold tracking-[-0.025em] text-ink-900">
          {contract.title}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Bem-vindo, {client?.name?.split(' ')[0]}. Acompanhe saldo, parcelas e pagamentos do seu contrato.
        </p>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          {/* anel de progresso */}
          <div className="relative h-32 w-32 shrink-0 self-center sm:self-auto">
            <svg viewBox="0 0 128 128" className="h-32 w-32">
              <circle cx="64" cy="64" r="54" fill="none" stroke="#eef0f3" strokeWidth="13" />
              <circle
                cx="64"
                cy="64"
                r="54"
                fill="none"
                stroke="url(#cp-ring)"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={339.29}
                strokeDashoffset={339.29 * (1 - Math.min(Math.max(pctPaid, 0), 100) / 100)}
                transform="rotate(-90 64 64)"
              />
              <defs>
                <linearGradient id="cp-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6366f1" />
                  <stop offset="1" stopColor="#5b5bd6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="num-display text-[28px] font-extrabold leading-none text-ink-900">{pctPaid}%</span>
              <span className="mt-0.5 text-[10px] font-semibold text-ink-400">quitado</span>
            </div>
          </div>

          {/* três números — empilhados no mobile, em colunas no desktop */}
          <div className="grid flex-1 grid-cols-1 divide-y divide-ink-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 sm:block sm:py-0 sm:pr-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-400">Saldo atual</div>
              <div className="text-right sm:text-left">
                <div className="num-display text-lg font-bold text-ink-900 sm:mt-1.5 sm:text-[22px]">{brl(state.currentBalance)}</div>
                <div className="text-xs text-ink-400 sm:mt-0.5">em aberto</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 sm:block sm:py-0 sm:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-400">Já pago</div>
              <div className="text-right sm:text-left">
                <div className="num-display text-lg font-bold text-pos-600 sm:mt-1.5 sm:text-[22px]">{brl(state.totalPaid)}</div>
                <div className="text-xs text-ink-400 sm:mt-0.5">de {brl(contract.totalValue)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 last:pb-0 sm:block sm:py-0 sm:pl-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-400">Próxima parcela</div>
              <div className="text-right sm:text-left">
                <div className="num-display text-lg font-bold text-ink-900 sm:mt-1.5 sm:text-[22px]">{brl(state.currentInstallmentValue)}</div>
                <div className="text-xs text-ink-400 sm:mt-0.5">
                  {state.nextInstallmentNumber ? `#${state.nextInstallmentNumber} · ${formatDateBR(state.nextInstallmentDueDate)}` : 'quitado'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* composição da carteira — pago vs em aberto */}
        <div className="mt-6">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100">
            <div className="bg-pos-600" style={{ width: `${Math.min(Math.max(pctPaid, 0), 100)}%` }} />
            <div className="bg-brand-gradient flex-1" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              <span className="h-2 w-2 rounded-sm bg-pos-600" />
              Pago <b className="font-semibold text-ink-800">{brl(state.totalPaid)}</b>
            </span>
            {state.totalAmortized > 0 && (
              <span className="inline-flex items-center gap-1.5 text-ink-500">
                <span className="h-2 w-2 rounded-sm bg-pos-100 ring-1 ring-inset ring-pos-500/30" />
                Amortizado <b className="font-semibold text-ink-800">{brl(state.totalAmortized)}</b>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              <span className="h-2 w-2 rounded-sm bg-brand-500" />
              Falta pagar <b className="font-semibold text-ink-800">{brl(emAbertoTotal)}</b>
            </span>
            <span className="basis-full text-ink-400 sm:ml-auto sm:basis-auto">
              {entradaDone ? 'Entrada concluída' : `Entrada ${paidDown}/${downRows.length}`} · Financ. {paidFin}/{finRows.length}
            </span>
          </div>
        </div>
      </div>

      {/* Conteúdo principal em duas colunas (mesma altura no desktop) */}
      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {/* Coluna principal: pagamento + simulador */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <PixBlock calc={calc} pix={pix} />

          {/* Atalho "Reduza" — só no mobile; no desktop o simulador fica na aba */}
          {state.nextInstallmentNumber && (
            <Card className="card-hover border-brand-200 bg-brand-50/40 lg:hidden">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m3 17 6-6 4 4 8-8" />
                    <path d="M17 7h4v4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 basis-[60%]">
                  <h3 className="font-display text-base font-semibold text-ink-900">
                    Reduza suas próximas parcelas
                  </h3>
                  <p className="mt-0.5 text-sm text-ink-500">
                    Simule um pagamento extra e veja o saldo e as parcelas caírem.
                  </p>
                </div>
                <Button onClick={onSimular} className="w-full sm:w-auto">
                  Simular economia
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Coluna lateral: próximas parcelas + histórico numa única caixa */}
        <Card className="flex flex-col p-0">
          <div className="flex items-center justify-between px-5 pb-2.5 pt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">Próximas parcelas</h3>
            <button onClick={() => onVerParcelas('a_vencer')} className="text-sm font-semibold text-brand-600 hover:underline">
              Ver todas
            </button>
          </div>
          <div className="divide-y divide-ink-100">
              {upcoming.map((r, i) => {
                const [, mm, dd] = r.dueDate.split('-')
                const mes = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][Number(mm) - 1]
                return (
                  <div
                    key={r.number}
                    className={`flex items-center justify-between gap-2 px-4 py-2.5 ${i === 0 ? 'bg-brand-50/50' : ''}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* chip de data */}
                      <div
                        className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border leading-none ${
                          r.correction
                            ? 'border-brand-200 bg-brand-50'
                            : i === 0
                              ? 'border-brand-200 bg-white'
                              : 'border-ink-100 bg-ink-50'
                        }`}
                      >
                        <span
                          className={`num-display text-sm font-bold ${
                            r.correction ? 'text-brand-700' : i === 0 ? 'text-brand-700' : 'text-ink-800'
                          }`}
                        >
                          {dd}
                        </span>
                        <span className={`text-[8.5px] font-bold tracking-wide ${r.correction ? 'text-brand-400' : 'text-ink-400'}`}>
                          {mes}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                          Parcela {r.number}
                          {i === 0 && (
                            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-700">
                              Próxima
                            </span>
                          )}
                        </div>
                        {r.correction ? (
                          <div className="text-[11px] font-semibold text-brand-600">atualização infl. est. ~{pct(r.correction.ipca)}</div>
                        ) : (
                          <div className="text-xs text-ink-400">vence {formatDateBR(r.dueDate)}</div>
                        )}
                      </div>
                    </div>
                    <span className={`num-display shrink-0 text-sm font-semibold ${i === 0 ? 'text-brand-700' : 'text-ink-800'}`}>
                      {brl(r.value)}
                    </span>
                  </div>
                )
              })}
          </div>

          {recentPayments.length > 0 && (
            <>
              <div className="mt-2 flex items-center justify-between border-t border-ink-100 px-5 pb-2.5 pt-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">Histórico recente</h3>
                <button onClick={() => onVerParcelas('pagas')} className="text-sm font-medium text-brand-600 hover:underline">
                  Ver tudo
                </button>
              </div>
              <div>
                {recentPayments.map((p) => {
                  const hasAmort = p.amortizationAmount > 0
                  const onlyAmort = p.installmentType === 'amortizacao' || (hasAmort && p.amount <= 0)
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos-50 text-pos-600">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12 5 5L20 7" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink-800">
                            {onlyAmort
                              ? 'Amortização'
                              : `${p.installmentType === 'entrada' ? 'Entrada' : 'Parcela'} ${p.installmentNumber}`}
                          </div>
                          <div className="text-xs text-ink-400">
                            pago {formatDateBR(p.paymentDate)}
                            {hasAmort && !onlyAmort ? ` · amortização ${brl(p.amortizationAmount)}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num-display text-sm font-semibold text-ink-800">
                          {brl(p.amount + p.amortizationAmount)}
                        </div>
                        <div className="text-[11px] font-medium text-pos-600">
                          {onlyAmort ? 'Amortização' : 'Pago'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bloco principal — Pix
// ---------------------------------------------------------------------------
const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "2026-06-22" → "22 de junho de 2026" */
function formatDateLong(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)} de ${MESES_EXTENSO[Number(m) - 1]} de ${y}`
}

/** Mini-preview clicável do comprovante (imagem ou ícone de documento). */
/** Chip elegante "Comprovante" (abre o modal). Substitui a miniatura quadrada. */
function ReceiptThumb({ url }: { url: string }) {
  return (
    <button
      type="button"
      onClick={() => openReceipt(url)}
      aria-label="Ver comprovante"
      title="Ver comprovante"
      className="ml-2 inline-flex translate-y-[1px] items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors hover:bg-brand-100"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Comprovante
    </button>
  )
}

/** Tipo da chave Pix a partir do formato (para o rótulo). */
function pixKeyType(key: string): string {
  if (/@/.test(key)) return 'e-mail'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key.trim())) return 'aleatória'
  const digits = key.replace(/\D/g, '')
  if (key.trim().startsWith('+') || digits.length === 13) return 'telefone'
  if (digits.length === 14) return 'CNPJ'
  if (digits.length === 11) return 'CPF'
  return 'chave'
}

/** "2026-07-15" → "em 23 dias" / "hoje" / "há 2 dias" (relativo a hoje). */
function dueRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(y, m - 1, d)
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diff > 1) return `em ${diff} dias`
  if (diff === 1) return 'amanhã'
  if (diff === 0) return 'hoje'
  if (diff === -1) return 'há 1 dia'
  return `há ${-diff} dias`
}

/** ISO com hora → "hoje 14:32" / "23/06 14:32". */
function formatSentTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const t0 = new Date()
  t0.setHours(0, 0, 0, 0)
  const d0 = new Date(d)
  d0.setHours(0, 0, 0, 0)
  if (d0.getTime() === t0.getTime()) return `hoje ${hh}:${mm}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`
}

const MAX_RECEIPT_MB = 10
/** Valida um comprovante antes de ler/enviar. Retorna mensagem de erro ou null. */
function validateReceipt(file: File): string | null {
  const okType = file.type.startsWith('image/') || file.type === 'application/pdf'
  if (!okType) return 'Formato inválido. Envie uma imagem (JPG/PNG) ou um PDF.'
  if (file.size > MAX_RECEIPT_MB * 1024 * 1024)
    return `Arquivo muito grande (máx. ${MAX_RECEIPT_MB} MB).`
  return null
}

function PixBlock({
  calc,
  pix,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  pix: ReturnType<typeof getActivePixKey>
}) {
  const { state, contract } = calc
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Considera placeholder/teste quando não há chave ou termina em "@local".
  const hasRealPix = !!pix?.pixKey && !pix.pixKey.toLowerCase().endsWith('@local')
  const nextRow = calc.schedule.rows.find((r) => r.number === state.nextInstallmentNumber)
  const dueLabel = dueRelative(state.nextInstallmentDueDate)

  // Comprovante já enviado (aguardando validação) da parcela atual. Pedidos de
  // amortização/quitação (que têm "intenção") ficam nos simuladores, não aqui.
  const submittedReceipt = calc.payments.find(
    (p) =>
      p.installmentType === 'financiamento' &&
      p.installmentNumber === state.nextInstallmentNumber &&
      p.status === 'comprovante_enviado' &&
      !!p.receiptUrl &&
      !parseReceiptNotes(p.notes).intent,
  )
  const receiptUrl = submittedReceipt?.receiptUrl ?? null
  const receiptIsImage = !!receiptUrl && /^data:image|\.(png|jpe?g|webp|gif)(\?|$)/i.test(receiptUrl)

  function copy() {
    if (!hasRealPix || !pix) return
    navigator.clipboard?.writeText(pix.pixKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleFile(file: File | undefined | null) {
    if (!file || !state.nextInstallmentNumber) return
    const err = validateReceipt(file)
    if (err) {
      setFileError(err)
      return
    }
    setFileError(null)
    const reader = new FileReader()
    reader.onerror = () => setFileError('Não foi possível ler o arquivo. Tente outro.')
    reader.onload = () => {
      submitReceipt(
        contract.id,
        'financiamento',
        state.nextInstallmentNumber!,
        String(reader.result),
        file.name,
      )
    }
    reader.readAsDataURL(file)
  }

  // Metadados do comprovante enviado (nome, tamanho, hora).
  const receiptName =
    parseReceiptNotes(submittedReceipt?.notes).file ||
    (receiptIsImage ? 'comprovante.jpg' : 'comprovante.pdf')
  const receiptKB = receiptUrl
    ? Math.max(1, Math.round(((receiptUrl.split(',')[1]?.length ?? 0) * 0.75) / 1024))
    : 0
  const receiptSent = submittedReceipt ? formatSentTime(submittedReceipt.createdAt) : ''

  if (!state.nextInstallmentNumber) {
    return (
      <Card className="bg-pos-50 ring-1 ring-pos-500/20">
        <h2 className="font-display text-lg font-semibold text-pos-700">Contrato quitado</h2>
        <p className="mt-1 text-sm text-ink-600">Todas as parcelas foram pagas.</p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col overflow-hidden p-0 lg:h-full">
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />

      {/* Faixa de valor */}
      <div className="bg-brand-gradient px-5 py-5 text-white sm:px-6">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-white/85">Valor a pagar agora</span>
          {nextRow && (
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
              {INSTALLMENT_STATUS_LABEL[nextRow.status]}
              {dueLabel ? ` · ${dueLabel}` : ''}
            </span>
          )}
        </div>
        <div className="num-display mt-1 text-4xl font-semibold tracking-tight">
          {brl(state.currentInstallmentValue)}
        </div>
        <div className="mt-1 text-sm text-white/85">
          Parcela {state.nextInstallmentNumber} · vence em {formatDateLong(state.nextInstallmentDueDate)}
        </div>
      </div>

      {/* Duas colunas: pague via Pix · comprovante */}
      <div className="grid items-stretch sm:grid-cols-2 sm:divide-x sm:divide-ink-100 lg:flex-1">
        {/* Pague via Pix */}
        <div className="flex flex-col p-5 sm:p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">Pague via Pix</div>

          <div className="mt-2 overflow-hidden rounded-xl border border-ink-200">
            <div className="p-3.5">
              <div className="text-[11px] text-ink-400">
                Chave Pix{hasRealPix ? ` · ${pixKeyType(pix!.pixKey)}` : ''}
              </div>
              <div className={`num-display tnum mt-0.5 break-all text-lg font-semibold ${hasRealPix ? 'text-ink-900' : 'italic text-ink-400'}`}>
                {hasRealPix ? pix!.pixKey : 'não informada'}
              </div>
              <Button onClick={copy} disabled={!hasRealPix} aria-label="Copiar chave Pix" className="mt-3 w-full">
                <span className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  {copied ? 'Chave copiada!' : 'Copiar chave Pix'}
                </span>
              </Button>
            </div>
            {hasRealPix && (
              <div className="flex items-center gap-2.5 border-t border-ink-100 bg-ink-50/60 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-4h6v4" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-900">{pix!.receiverName}</div>
                  {pix!.bankName && <div className="truncate text-xs text-ink-500">{pix!.bankName}</div>}
                </div>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-pos-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
              </div>
            )}
          </div>

          {!hasRealPix && (
            <p className="mt-2 text-xs text-ink-400">O vendedor ainda vai cadastrar a chave Pix.</p>
          )}

          <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-ink-400">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Pagamento direto ao titular. A ContratoPay não intermedia valores.
          </p>
        </div>

        {/* Comprovante */}
        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">Comprovante</div>
            {receiptUrl ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-50 px-2.5 py-0.5 text-[11px] font-semibold text-warn-700">
                <span className="h-1.5 w-1.5 rounded-full bg-warn-500" /> Em análise
              </span>
            ) : (
              <span className="text-[11px] font-medium text-ink-400">Etapa final</span>
            )}
          </div>

          {receiptUrl ? (
            <div className="mt-3">
              {/* arquivo enviado */}
              <div className="flex items-center gap-3 rounded-xl border border-ink-200 p-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                  {receiptIsImage ? (
                    <img src={receiptUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-900">{receiptName}</div>
                  <div className="text-xs text-ink-400">{receiptKB} KB · enviado {receiptSent}</div>
                </div>
                <button type="button" onClick={() => openReceipt(receiptUrl)} aria-label="Ver comprovante" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-50">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>

              {/* linha do tempo */}
              <ol className="mt-4">
                <li className="relative flex gap-3 pb-4">
                  <span className="absolute left-[10px] top-[22px] h-[calc(100%-1.25rem)] w-px bg-ink-200" />
                  <span className="z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-pos-500 text-white">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-800">Comprovante enviado</div>
                    <div className="text-xs text-ink-400">{receiptSent}</div>
                  </div>
                </li>
                <li className="relative flex gap-3 pb-4">
                  <span className="absolute left-[10px] top-[22px] h-[calc(100%-1.25rem)] w-px bg-ink-200" />
                  <span className="z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-2 border-warn-500 bg-white">
                    <span className="h-2 w-2 rounded-full bg-warn-500" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-warn-700">Em análise pelo vendedor</div>
                    <div className="text-xs text-ink-400">Resposta em até 1 dia útil</div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="z-10 h-[21px] w-[21px] shrink-0 rounded-full border-2 border-ink-200 bg-white" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-400">Pagamento confirmado</div>
                  </div>
                </li>
              </ol>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Button variant="secondary" size="sm" onClick={() => openReceipt(receiptUrl)}>Ver</Button>
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Trocar</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => submittedReceipt && window.confirm('Excluir o comprovante enviado? Esta ação não pode ser desfeita.') && deletePayment(submittedReceipt.id)}
                  className="text-neg-700 hover:bg-neg-50"
                >
                  Excluir
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
                className={`mt-3 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragOver ? 'border-brand-400 bg-brand-50' : 'border-ink-300 hover:bg-ink-50'}`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>
                </div>
                <div className="mt-3 text-base font-semibold text-ink-900">Já pagou? Anexe o comprovante</div>
                <p className="mt-1 max-w-[15rem] text-sm text-ink-500">Arraste aqui ou selecione. PDF, JPG ou PNG até 10 MB.</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                  className="mt-4 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-brand hover:bg-brand-700"
                >
                  Selecionar arquivo
                </button>
              </div>
              {fileError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-neg-700">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                  {fileError}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba: Pagar a mais (dois modos: reduzir parcelas / quitar últimas)
// ---------------------------------------------------------------------------
type SimMode = 'reduzir' | 'antecipar'

/** Anexo de comprovante de um pedido extra (amortizar / quitar antecipado).
 *  Cria uma solicitação pendente — inerte no cálculo — que o vendedor valida
 *  no Revisar completo, já pré-selecionado pela intenção do cliente. */
function RequestComprovante({
  calc,
  mode,
  amount,
  count,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  mode: 'amortizar' | 'quitar'
  amount: number
  count?: number
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const openFin = calc.schedule.rows.filter((r) => r.status !== 'paga')
  const target = openFin[0]
  const label = mode === 'amortizar' ? 'amortização' : 'quitação antecipada'

  // Pedido desta modalidade já enviado (aguardando validação). Pedidos extras
  // ficam no namespace 'amortizacao' (não colidem com o comprovante comum).
  const pending = calc.payments.find(
    (p) =>
      p.installmentType === 'amortizacao' &&
      p.status === 'comprovante_enviado' &&
      !!p.receiptUrl &&
      parseReceiptNotes(p.notes).intent?.mode === mode,
  )
  const pendingUrl = pending?.receiptUrl ?? null
  const pendingMeta = parseReceiptNotes(pending?.notes)
  const pendingIsImage = !!pendingUrl && /^data:image|\.(png|jpe?g|webp|gif)(\?|$)/i.test(pendingUrl)
  const pendingName = pendingMeta.file || (pendingIsImage ? 'comprovante.jpg' : 'comprovante.pdf')
  const pendingSent = pending ? formatSentTime(pending.createdAt) : ''

  function handleFile(file: File | undefined | null) {
    if (!file || !target || !(amount > 0)) return
    const err = validateReceipt(file)
    if (err) {
      setFileError(err)
      return
    }
    setFileError(null)
    const reader = new FileReader()
    reader.onerror = () => setFileError('Não foi possível ler o arquivo. Tente outro.')
    reader.onload = () =>
      submitReceipt(
        calc.contract.id,
        'amortizacao',
        target.number,
        String(reader.result),
        file.name,
        { mode, amount, count },
      )
    reader.readAsDataURL(file)
  }

  if (pending) {
    return (
      <div className="rounded-2xl border border-ink-200 p-3">
        <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-50 px-2.5 py-0.5 text-[11px] font-semibold text-warn-700">
            <span className="h-1.5 w-1.5 rounded-full bg-warn-500" /> Pedido em análise
          </span>
          <span className="text-[11px] text-ink-400">enviado {pendingSent}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-ink-200 p-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
            {pendingIsImage ? (
              <img src={pendingUrl!} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-900">{pendingName}</div>
            <div className="text-xs text-ink-400">Pedido de {label} · {brl(pendingMeta.intent?.amount ?? 0)}</div>
          </div>
          <button type="button" onClick={() => openReceipt(pendingUrl)} aria-label="Ver comprovante" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-50">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" onClick={() => openReceipt(pendingUrl)}>Ver</Button>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Trocar</Button>
          <Button variant="secondary" size="sm" onClick={() => pending && window.confirm('Excluir este pedido? Esta ação não pode ser desfeita.') && deletePayment(pending.id)} className="text-neg-700 hover:bg-neg-50">Excluir</Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-400">O vendedor confere o valor e aplica a {label} oficialmente.</p>
      </div>
    )
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
      <div
        onClick={() => amount > 0 && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors ${amount > 0 ? (dragOver ? 'cursor-pointer border-brand-400 bg-brand-50' : 'cursor-pointer border-ink-300 hover:bg-ink-50') : 'cursor-not-allowed border-ink-200 opacity-60'}`}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>
        </div>
        <div className="mt-2.5 text-sm font-semibold text-ink-900">Já pagou? Anexe o comprovante</div>
        <p className="mt-1 max-w-[18rem] text-xs text-ink-500">Cria um pedido de {label} para o vendedor validar. PDF, JPG ou PNG até 10 MB.</p>
        <button
          type="button"
          disabled={!(amount > 0)}
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          className="mt-3 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-brand hover:bg-brand-700 disabled:opacity-50"
        >
          Selecionar arquivo
        </button>
      </div>
      {fileError && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-neg-700">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          {fileError}
        </p>
      )}
    </div>
  )
}

function ExtraBlock({
  calc,
  initialMode = 'reduzir',
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  initialMode?: SimMode
}) {
  const [mode, setMode] = useState<SimMode>(initialMode)

  if (!calc.state.nextInstallmentNumber) {
    return (
      <Card>
        <p className="text-center text-sm text-ink-500">Contrato quitado — nada a pagar.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('reduzir')}
          className={`rounded-xl px-3 py-3 text-left text-sm font-semibold transition-all ${
            mode === 'reduzir'
              ? 'bg-brand-600 text-white shadow-[var(--shadow-brand)]'
              : 'bg-white text-ink-600 ring-1 ring-ink-200'
          }`}
        >
          Reduzir valor das parcelas
          <span className={`mt-0.5 block text-xs font-normal ${mode === 'reduzir' ? 'text-white/80' : 'text-ink-400'}`}>
            pago um extra e o valor cai
          </span>
        </button>
        <button
          onClick={() => setMode('antecipar')}
          className={`rounded-xl px-3 py-3 text-left text-sm font-semibold transition-all ${
            mode === 'antecipar'
              ? 'bg-brand-600 text-white shadow-[var(--shadow-brand)]'
              : 'bg-white text-ink-600 ring-1 ring-ink-200'
          }`}
        >
          Quitar últimas parcelas
          <span className={`mt-0.5 block text-xs font-normal ${mode === 'antecipar' ? 'text-white/80' : 'text-ink-400'}`}>
            com desconto do IPCA futuro
          </span>
        </button>
      </div>

      {mode === 'reduzir' ? <ReduzirSim calc={calc} /> : <AnteciparSim calc={calc} />}
    </div>
  )
}

function ReduzirSim({ calc }: { calc: NonNullable<ReturnType<typeof getContractCalc>> }) {
  const [inputMode, setInputMode] = useState<'valor' | 'parcela'>('valor')
  const [extraText, setExtraText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [copied, setCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const target = parseMoney(targetText)

  // Bloqueia amortizar enquanto houver parcela do mês corrente (ou vencida) em
  // aberto: o cliente precisa quitar a parcela antes de amortizar o saldo.
  const openFin = calc.schedule.rows.filter((r) => r.status !== 'paga')
  const nextOpen = openFin[0]
  const blockAmortize = !!nextOpen && nextOpen.dueDate.slice(0, 7) <= todayISO().slice(0, 7)

  // Baseline (sem extra) da MESMA engine que calcula a "nova parcela" exibida.
  // Usar essa base (e não state.currentBalance/financingRemaining, que divergem
  // após antecipações) garante que, ao escolher uma parcela-alvo, a nova parcela
  // bata EXATAMENTE com o alvo escolhido.
  const sim0 = useMemo(() => simulateExtraPayment(calc.contract, calc.scheduleOpts, 0), [calc])
  const currentParcela = sim0.currentInstallmentEstimate
  const vincendas = currentParcela > 0 ? Math.round(sim0.balanceBefore / currentParcela) : 0
  const saldoBase = sim0.balanceBefore

  // No modo "parcela", o extra é o que falta para a nova parcela chegar no alvo.
  const extra =
    inputMode === 'valor'
      ? parseMoney(extraText)
      : target > 0 && target < currentParcela
        ? Math.max(0, saldoBase - target * vincendas)
        : 0

  const sim = useMemo(
    () => simulateExtraPayment(calc.contract, calc.scheduleOpts, extra),
    [calc, extra],
  )

  // A "nova parcela" é em reais de hoje: vale até o próximo reajuste anual e
  // depois sobe pela inflação, como as demais. Pega o próximo reajuste futuro
  // (e o valor projetado da parcela após ele) para deixar isso explícito.
  const futureCorrections = sim.discountBreakdown.filter((s) => s.avoidedIpca > 0)
  const nextCorrection = futureCorrections[0] ?? null

  // Sugestões de parcela "redonda" abaixo da atual.
  const roundBase = Math.floor(currentParcela / 500) * 500
  const roundTargets = [0, 1, 2, 3]
    .map((i) => roundBase - i * 500)
    .filter((v) => v > 0)

  function copyExtra() {
    navigator.clipboard?.writeText(sim.extra.toFixed(2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <h3 className="font-display text-base font-bold text-ink-900">
        Pagamento extra para reduzir o valor das parcelas
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        Um pagamento à parte, separado da sua parcela mensal. O valor vai direto para o saldo
        devedor e recalcula as próximas parcelas (o prazo continua o mesmo).
      </p>

      {blockAmortize && nextOpen && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-800">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
          <div>
            Você tem a <b>parcela {nextOpen.number}</b> {nextOpen.status === 'vencida' ? 'vencida' : 'a vencer este mês'} ({brl(nextOpen.value)}).
            Quite-a primeiro — depois você poderá amortizar o saldo. Para encurtar o contrato agora, use <b>Quitar últimas parcelas</b>.
          </div>
        </div>
      )}

      {/* Sub-modo: por valor ou por parcela desejada */}
      <div className="mt-4 inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        <button
          onClick={() => setInputMode('valor')}
          className={`rounded-lg px-3 py-1.5 transition-colors ${inputMode === 'valor' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
        >
          Escolher o valor
        </button>
        <button
          onClick={() => setInputMode('parcela')}
          className={`rounded-lg px-3 py-1.5 transition-colors ${inputMode === 'parcela' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
        >
          Escolher a parcela
        </button>
      </div>

      {inputMode === 'valor' ? (
        <div className="mt-3">
          <label className="mb-1.5 block text-sm font-medium text-ink-700">
            Quanto deseja pagar a mais?
          </label>
          <MoneyInput
            value={parseMoney(extraText)}
            onValueChange={(n) => setExtraText(num(n))}
            placeholder="R$ 0,00"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1000, 5000, 10000, 20000].map((v) => (
              <button
                key={v}
                onClick={() => setExtraText(num(v))}
                className={`rounded-lg px-2.5 py-1 text-sm font-semibold transition-colors ${
                  Math.abs(parseMoney(extraText) - v) < 0.5
                    ? 'bg-brand-600 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
              >
                {brl(v)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <label className="mb-1.5 block text-sm font-medium text-ink-700">
            Quero que minha parcela fique em
          </label>
          <MoneyInput
            value={parseMoney(targetText)}
            onValueChange={(n) => setTargetText(num(n))}
            placeholder={`R$ ${num(roundBase)}`}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {roundTargets.map((v) => (
              <button
                key={v}
                onClick={() => setTargetText(num(v))}
                className={`rounded-lg px-2.5 py-1 text-sm font-semibold transition-colors ${
                  Math.abs(target - v) < 0.5
                    ? 'bg-brand-600 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
              >
                {brl(v)}
              </button>
            ))}
          </div>
          {target > 0 && target < currentParcela && (
            <div className="mt-3 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
              <div className="text-sm text-brand-800">
                Para a parcela ficar em{' '}
                <b className="num-display">{brl(target)}</b>{' '}
                <span className="text-brand-600">(em reais de hoje)</span>, pague um extra de
              </div>
              <div className="num-display mt-0.5 text-2xl font-extrabold text-brand-700">
                {brl(extra)}
              </div>
            </div>
          )}
          {target > 0 && target >= currentParcela && (
            <p className="mt-2 text-xs text-warn-700">
              Escolha um valor menor que a parcela atual ({brl(currentParcela)}).
            </p>
          )}
        </div>
      )}

      {extra > 0 && (
        <div className="mt-5 space-y-3">
          {/* Resultado principal: a parcela cai */}
          <div className="rounded-2xl bg-brand-50 p-5 text-center ring-1 ring-brand-200">
            <div className="text-sm font-medium text-brand-700">Sua nova parcela ficaria</div>
            <div className="num-display mt-1 text-4xl font-bold text-brand-800">
              {brl(sim.newInstallmentEstimate)}
            </div>
            <div className="mt-1 text-sm text-ink-500">
              hoje é {brl(sim.currentInstallmentEstimate)} ·{' '}
              <span className="font-semibold text-pos-600">−{brl(sim.monthlySavings)} por mês</span>
            </div>
            {nextCorrection && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-brand-700 ring-1 ring-brand-200">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                valor de hoje · vale até {formatDateBR(nextCorrection.date)}
              </div>
            )}
          </div>

          {/* Até quando esse valor vale — reajuste anual pelo IPCA */}
          {nextCorrection && (
            <div className="rounded-xl border border-ink-200 p-3.5">
              <div className="text-sm font-semibold text-ink-800">Esse valor vale até o próximo reajuste</div>
              <p className="mt-1 text-xs text-ink-500">
                Toda parcela sobe pela inflação (IPCA) uma vez por ano — ela não fica parada nesse
                valor. Veja quanto você paga agora e quanto fica depois do reajuste:
              </p>
              <div className="mt-3 flex items-stretch gap-2 text-center">
                <div className="flex-1 rounded-lg bg-pos-50 p-2.5 ring-1 ring-pos-500/20">
                  <div className="text-[10px] uppercase tracking-wide text-ink-400">
                    de hoje até {formatDateBR(nextCorrection.date)}
                  </div>
                  <div className="num-display mt-0.5 text-sm font-bold text-pos-700">
                    {brl(sim.newInstallmentEstimate)}
                  </div>
                </div>
                <div className="flex items-center text-ink-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </div>
                <div className="flex-1 rounded-lg bg-ink-50 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-ink-400">
                    a partir de {formatDateBR(nextCorrection.date)}
                  </div>
                  <div className="num-display mt-0.5 text-sm font-bold text-ink-800">
                    ~{brl(nextCorrection.installmentWithExtra)}
                  </div>
                  <div className="text-[10px] text-ink-400">IPCA est. ~{pct(nextCorrection.ipca)}</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-ink-400">
                Veja a evolução ano a ano em "Ver detalhes da economia".
              </p>
            </div>
          )}

          {/* Dois fatos simples */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-ink-50 p-3">
              <div className="text-xs text-ink-500">Você paga a mais</div>
              <div className="num-display font-bold text-ink-900">{brl(sim.extra)}</div>
            </div>
            <div className="rounded-xl bg-ink-50 p-3">
              <div className="text-xs text-ink-500">Saldo passa a ser</div>
              <div className="num-display font-bold text-ink-900">{brl(sim.balanceAfter)}</div>
            </div>
          </div>

          {/* Economia em destaque (líquida) */}
          <div className="flex items-center justify-between rounded-xl bg-pos-50 px-4 py-3.5 ring-1 ring-pos-500/20">
            <div className="text-sm font-medium text-pos-700">Você economiza de inflação no total</div>
            <div className="num-display text-xl font-bold text-pos-600">{brl(sim.netIpcaSavings)}</div>
          </div>

          {/* Detalhes recolhíveis */}
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-center gap-1 py-1 text-sm font-semibold text-brand-600 hover:underline"
          >
            {showDetails ? 'Ocultar detalhes' : 'Ver detalhes da economia'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={showDetails ? 'rotate-180' : ''}><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {showDetails && <DiscountBreakdown sim={sim} />}

          {!blockAmortize && (
            <>
              <Button onClick={copyExtra} variant="secondary" className="w-full">
                {copied ? 'Valor copiado!' : `Copiar valor a pagar (${brl(sim.extra)})`}
              </Button>

              <div className="rounded-2xl bg-ink-50/70 p-3">
                <div className="mb-2 text-center text-xs text-ink-500">
                  Pague <b className="num-display text-ink-800">{brl(sim.extra)}</b> via Pix e anexe o
                  comprovante. O vendedor valida e aplica a redução do saldo.
                </div>
                <RequestComprovante calc={calc} mode="amortizar" amount={sim.extra} />
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

/** Mostra como o desconto de IPCA foi gerado, período a período, com saldo e parcela. */
function DiscountBreakdown({ sim }: { sim: ReturnType<typeof simulateExtraPayment> }) {
  const steps = sim.discountBreakdown.filter((s) => s.avoidedIpca > 0)
  if (steps.length === 0) return null

  return (
    <div className="rounded-xl border border-ink-200 p-4">
      <h4 className="font-display text-sm font-bold text-ink-900">Como esse desconto foi gerado</h4>
      <p className="mt-0.5 text-xs text-ink-500">
        Em cada reajuste de 12 meses, veja o saldo do período e como a parcela fica menor com o seu
        pagamento.
      </p>

      <div className="mt-3 space-y-2.5">
        {steps.map((s) => (
          <div key={s.index} className="rounded-xl bg-ink-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-800">
                {formatDateBR(s.date)} · {s.periodNumber}º período
              </span>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                IPCA est. ~{pct(s.ipca)}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white p-2 ring-1 ring-ink-200">
                <div className="text-[10px] uppercase tracking-wide text-ink-400">Saldo do período</div>
                <div className="num-display text-xs text-ink-500 line-through">{brl(s.balanceBase)}</div>
                <div className="num-display text-sm font-bold text-ink-900">{brl(s.balanceWithExtra)}</div>
              </div>
              <div className="rounded-lg bg-white p-2 ring-1 ring-ink-200">
                <div className="text-[10px] uppercase tracking-wide text-ink-400">Parcela do período</div>
                <div className="num-display text-xs text-ink-500 line-through">{brl(s.installmentBase)}</div>
                <div className="num-display text-sm font-bold text-pos-600">{brl(s.installmentWithExtra)}</div>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-ink-200 pt-2">
              <span className="text-xs text-ink-500">IPCA evitado neste ano</span>
              <span className="num-display text-sm font-bold text-pos-700">{brl(s.avoidedIpca)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink-200 pt-2.5">
        <span className="text-sm font-semibold text-ink-700">Total de IPCA evitado</span>
        <span className="num-display text-base font-bold text-pos-700">{brl(sim.netIpcaSavings)}</span>
      </div>
    </div>
  )
}

function AnteciparSim({ calc }: { calc: NonNullable<ReturnType<typeof getContractCalc>> }) {
  const [count, setCount] = useState(1)
  const sim = useMemo(
    () => simulateAnticipateLast(calc.contract, calc.scheduleOpts, count),
    [calc, count],
  )
  const [copied, setCopied] = useState(false)

  // Dados para o mapa visual: TODAS as parcelas (entrada + financiamento).
  const finRows = calc.schedule.rows
  const mapRows = [...calc.downRows, ...finRows]
  const openFin = finRows.filter((r) => r.status !== 'paga')
  const quitRows = openFin.slice(openFin.length - sim.count)
  const quitSet = new Set(quitRows.map((r) => r.number))
  const lastRow = quitRows[quitRows.length - 1]

  function copyTotal() {
    navigator.clipboard?.writeText(sim.payToday.toFixed(2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <h3 className="font-display text-base font-bold text-ink-900">
        Quitar as últimas parcelas com desconto de IPCA
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        As últimas parcelas ainda vão receber vários reajustes. Quitando agora, você paga o valor de
        hoje e economiza todo o IPCA que ainda não foi aplicado nelas. Isso encurta o seu contrato.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-ink-700">
          Quantas das últimas parcelas deseja quitar?
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="h-11 w-11 shrink-0 rounded-xl bg-ink-100 text-xl font-bold text-ink-700 hover:bg-ink-200"
          >
            −
          </button>
          <div className="num-display flex-1 rounded-xl bg-ink-50 py-2.5 text-center text-2xl font-bold text-ink-900">
            {sim.count}
          </div>
          <button
            onClick={() => setCount((c) => Math.min(sim.maxCount, c + 1))}
            className="h-11 w-11 shrink-0 rounded-xl bg-ink-100 text-xl font-bold text-ink-700 hover:bg-ink-200"
          >
            +
          </button>
        </div>
        <div className="mt-1.5 text-xs text-ink-400">
          Você tem {sim.maxCount} parcelas em aberto. Toque numa parcela no mapa abaixo para quitar
          dela até o fim.
        </div>
      </div>

      {/* Mapa visual de TODAS as parcelas (entrada + financiamento) */}
      <div className="mt-5 rounded-2xl border border-ink-200 bg-ink-50/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-3 w-3 rounded-[4px] bg-pos-100" /> paga
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-3 w-3 rounded-[4px] bg-ink-200" /> em aberto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-3 w-3 rounded-[4px] bg-pos-500" /> sendo quitada
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {mapRows.map((r) => {
            const isPaid = r.status === 'paga'
            const isQuit = quitSet.has(r.number)
            // Parcela do financiamento em aberto é clicável: seleciona de trás
            // pra frente (desta até a última) — mesmo efeito do contador +/-.
            const clickable = r.type === 'financiamento' && !isPaid
            const cls = isQuit
              ? 'bg-pos-500 text-white scale-110 shadow-sm'
              : isPaid
                ? 'bg-pos-100 text-pos-700'
                : 'bg-ink-200 text-ink-400'
            const selectToHere = () => {
              const idx = openFin.findIndex((o) => o.number === r.number)
              if (idx >= 0) setCount(openFin.length - idx)
            }
            return (
              <button
                key={`${r.type}-${r.number}`}
                type="button"
                disabled={!clickable}
                onClick={clickable ? selectToHere : undefined}
                title={`${r.type === 'entrada' ? 'Entrada' : 'Parcela'} ${r.number} · ${brl(r.value)}${clickable ? ' · quitar até aqui' : ''}`}
                className={`flex h-7 w-7 items-center justify-center rounded-[6px] text-[10px] font-bold transition-all duration-200 ${cls} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-pos-500/40' : 'cursor-default'}`}
              >
                {r.number}
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-center text-xs text-ink-500">
          O fim do seu contrato vai de{' '}
          <b className="text-ink-700">parcela {openFin[openFin.length - 1]?.number}</b> para{' '}
          <b className="text-pos-700">
            {sim.newLastInstallmentNumber ? `parcela ${sim.newLastInstallmentNumber}` : 'quitado'}
          </b>
          .
        </div>
      </div>

      {/* Destaque da(s) parcela(s) sendo paga(s) */}
      {lastRow && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-pos-50 p-4 ring-1 ring-pos-500/20">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-pos-700">
              {sim.count === 1 ? 'Parcela que você quita' : `Parcelas ${quitRows[0].number} a ${lastRow.number}`}
            </div>
            <div className="num-display mt-0.5 text-lg font-bold text-ink-900">
              {sim.count === 1 ? `Parcela ${lastRow.number}` : `${sim.count} parcelas`} ·{' '}
              {formatDateBR(lastRow.dueDate)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-400 line-through">{brl(sim.futureValueWithIpca)}</div>
            <div className="num-display text-xl font-extrabold text-pos-600">{brl(sim.payToday)}</div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div className="rounded-xl bg-ink-50 p-4">
          <Row label="Valor cheio dessas parcelas no futuro (com IPCA)" value={brl(sim.futureValueWithIpca)} />
          <Row label="Você paga hoje" value={brl(sim.payToday)} strong />
        </div>

        {sim.ipcaDiscount > 0 ? (
          <div className="rounded-xl border border-pos-500/20 bg-pos-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-pos-700">
              Desconto de IPCA (você economiza)
            </div>
            <div className="num-display mt-1 text-3xl font-extrabold text-pos-600">
              {brl(sim.ipcaDiscount)}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600">
            Com a inflação estimada atual, antecipar agora não gera desconto — você pagaria
            praticamente o mesmo valor de hoje. Faz sentido antecipar quando há IPCA a evitar.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-ink-50 p-3">
            <div className="text-xs text-ink-500">Parcelas restantes</div>
            <div className="num-display font-bold text-ink-900">
              {calc.state.financingRemaining} → {sim.remainingAfter}
            </div>
          </div>
          <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200">
            <div className="text-xs text-brand-700">Novo fim do contrato</div>
            <div className="num-display font-bold text-brand-800">
              {sim.newLastInstallmentDate ? formatDateBR(sim.newLastInstallmentDate) : 'quitado'}
            </div>
          </div>
        </div>

        <Button onClick={copyTotal} variant="secondary" className="w-full">
          {copied ? 'Total copiado!' : `Copiar total a pagar (${brl(sim.payToday)})`}
        </Button>

        <div className="rounded-2xl bg-ink-50/70 p-3">
          <div className="mb-2 text-center text-xs text-ink-500">
            Pague <b className="num-display text-ink-800">{brl(sim.payToday)}</b> via Pix e anexe o
            comprovante. O vendedor dá baixa nas {sim.count === 1 ? 'última parcela' : `${sim.count} últimas parcelas`}.
          </div>
          <RequestComprovante calc={calc} mode="quitar" amount={sim.payToday} count={sim.count} />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba: Minhas parcelas (cronograma completo)
// ---------------------------------------------------------------------------
type Filter = 'todas' | 'pagas' | 'a_vencer'

function ParcelasTab({
  calc,
  onQuitarUltima,
  initialFilter = 'todas',
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  onQuitarUltima: () => void
  initialFilter?: Filter
}) {
  const rows = [...calc.downRows, ...calc.schedule.rows]
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const paidCount = rows.filter((r) => r.status === 'paga').length
  const openCount = rows.length - paidCount

  // Comprovante vinculado a cada parcela (entrada/financiamento). Pedidos de
  // amortização/quitação (com "intenção") não vinculam a uma parcela — só
  // aparecem no extrato.
  const receiptByKey: Record<string, string> = {}
  for (const p of calc.payments) {
    if (p.receiptUrl && p.installmentType !== 'amortizacao' && !parseReceiptNotes(p.notes).intent) {
      receiptByKey[`${p.installmentType}-${p.installmentNumber}`] = p.receiptUrl
    }
  }
  // Extrato de pagamentos (parcelas pagas, entradas e amortizações).
  // Ordem global p/ desempate dentro da mesma data (amortização > financ. > entrada).
  const extratoOrder = (p: (typeof calc.payments)[number]) =>
    (p.installmentType === 'amortizacao' ? 2000 : p.installmentType === 'financiamento' ? 1000 : 0) +
    p.installmentNumber
  const extrato = [...calc.payments]
    .filter(
      (p) =>
        (p.status === 'pago' && (p.amount > 0 || p.amortizationAmount > 0)) ||
        p.status === 'comprovante_enviado',
    )
    // Mais recente primeiro; mesma data → número maior primeiro (sequência limpa).
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || extratoOrder(b) - extratoOrder(a))

  const visible = rows.filter((r) =>
    filter === 'todas'
      ? true
      : filter === 'pagas'
        ? r.status === 'paga'
        : r.status !== 'paga',
  )

  // Última parcela do financiamento + desconto de IPCA (antecipação de 1 parcela).
  const openFin = calc.schedule.rows.filter((r) => r.status !== 'paga')
  const lastInstallment = openFin[openFin.length - 1]
  const lastSim = lastInstallment
    ? simulateAnticipateLast(calc.contract, calc.scheduleOpts, 1)
    : null

  return (
    <div className="space-y-4">
      {/* Última parcela ativa — quitar com desconto de IPCA */}
      {lastInstallment && lastSim && lastSim.ipcaDiscount > 0 && (
        <Card className="card-hover overflow-hidden border-pos-500/30 bg-pos-50 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-pos-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  Parcela {lastInstallment.number}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-pos-700">
                  Última parcela · pode antecipar
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-600">
                Quite a última parcela por{' '}
                <b className="num-display text-ink-900">{brl(lastSim.payToday)}</b>{' '}
                <span className="text-ink-400 line-through">{brl(lastSim.futureValueWithIpca)}</span> —
                economize <b className="text-pos-700">{brl(lastSim.ipcaDiscount)}</b> de inflação e encurte o contrato.
              </p>
            </div>
            <Button onClick={onQuitarUltima}>Quitar com desconto</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Pagas</div>
          <div className="num-display mt-1 text-xl font-bold text-pos-600">{paidCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">A vencer</div>
          <div className="num-display mt-1 text-xl font-bold text-ink-900">{openCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total</div>
          <div className="num-display mt-1 text-xl font-bold text-ink-900">{rows.length}</div>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total já pago</div>
          <div className="num-display mt-0.5 text-lg font-bold text-pos-600">{brl(calc.state.totalPaid)}</div>
        </div>
        {calc.state.totalAmortized > 0 && (
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Pagamentos extras (amortizações)</div>
            <div className="num-display mt-0.5 text-lg font-bold text-ink-800">{brl(calc.state.totalAmortized)}</div>
          </div>
        )}
      </Card>

      <div className="flex gap-1.5">
        {(['todas', 'pagas', 'a_vencer'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              filter === f ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 ring-1 ring-ink-200'
            }`}
          >
            {f === 'todas' ? 'Todas' : f === 'pagas' ? 'Pagas' : 'A vencer'}
          </button>
        ))}
      </div>

      {filter !== 'pagas' && (
      <Card className="p-0">
        <div className="divide-y divide-ink-100">
          {visible.map((r) => {
            const isLast =
              !!lastInstallment &&
              r.type === 'financiamento' &&
              r.number === lastInstallment.number &&
              r.status !== 'paga'
            return (
              <Fragment key={`${r.type}-${r.number}`}>
                {/* Marcador da atualização pela inflação (sem juros) */}
                {r.correction && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-l-2 border-brand-300 bg-brand-50/60 px-3.5 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700">
                      <span className="h-1 w-1 rounded-full bg-brand-400" />
                      Atualização anual pela inflação · IPCA est. ~{pct(r.correction.ipca)}
                    </span>
                    <span className="num-display text-[11px] text-ink-400">
                      saldo base {brl(r.balanceBefore)}
                    </span>
                  </div>
                )}
                <div className={`px-4 py-3 ${isLast ? 'bg-pos-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                        Parcela {r.number}
                        <span className="font-normal text-ink-400">
                          {r.type === 'entrada' ? '· entrada' : ''}
                        </span>
                        {isLast && (
                          <span className="rounded-full bg-pos-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            Última
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-400">
                        {formatDateBR(r.dueDate)}
                        {r.amortization ? ' · com pagamento extra' : ''}
                        {receiptByKey[`${r.type}-${r.number}`] && (
                          <ReceiptThumb url={receiptByKey[`${r.type}-${r.number}`]} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num-display text-sm font-bold text-ink-900">{brl(r.value)}</span>
                      <Badge tone={INSTALLMENT_STATUS_TONE[r.status]}>
                        {INSTALLMENT_STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                  </div>
                  {r.type === 'financiamento' && !isLast && r.status !== 'paga' && (
                    <div className="mt-1.5 flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1">
                      <span className="text-[11px] text-ink-400">Saldo devedor em aberto após esta parcela</span>
                      <span className="num-display text-xs font-semibold text-ink-700">
                        {brl(openBalanceAfter(rows, r))}
                      </span>
                    </div>
                  )}
                  {/* Última parcela: sugestão de quitar com desconto, na própria linha */}
                  {isLast && lastSim && lastSim.ipcaDiscount > 0 && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2.5 ring-1 ring-pos-500/20">
                      <span className="text-xs text-ink-600">
                        Quite agora por{' '}
                        <b className="num-display text-ink-900">{brl(lastSim.payToday)}</b>{' '}
                        <span className="text-ink-400 line-through">{brl(lastSim.futureValueWithIpca)}</span>{' '}
                        · economize <b className="text-pos-700">{brl(lastSim.ipcaDiscount)}</b>
                      </span>
                      <Button size="sm" onClick={onQuitarUltima}>
                        Quitar com desconto
                      </Button>
                    </div>
                  )}
                </div>
              </Fragment>
            )
          })}
        </div>
      </Card>
      )}

      {filter === 'pagas' && (
        <Card className="p-0">
          <div className="border-b border-ink-100 px-5 py-3.5">
            <h3 className="font-display text-base font-semibold text-ink-900">Extrato de pagamentos</h3>
          </div>
          {extrato.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-ink-400">Nenhum pagamento ainda.</p>
          )}
          <div className="divide-y divide-ink-100">
            {extrato.map((p) => {
              const intent = parseReceiptNotes(p.notes).intent
              const isAmort = intent
                ? intent.mode === 'amortizar'
                : p.installmentType === 'amortizacao' || (p.amount <= 0 && p.amortizationAmount > 0)
              const title = intent
                ? intent.mode === 'amortizar'
                  ? 'Amortização'
                  : intent.count && intent.count > 1
                    ? `Quitação de ${intent.count} parcelas`
                    : 'Quitação antecipada'
                : isAmort
                  ? 'Amortização'
                  : `${p.installmentType === 'entrada' ? 'Entrada' : 'Parcela'} ${p.installmentNumber}`
              const pending = p.status === 'comprovante_enviado'
              // Pedido pendente mostra o valor pretendido (registro fica inerte).
              const value = intent ? intent.amount : p.amount + p.amortizationAmount
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-800">
                      {title}
                      {intent && <span className="ml-1.5 font-normal text-ink-400">· pedido</span>}
                    </div>
                    <div className="text-xs text-ink-400">
                      {formatDateBR(p.paymentDate)}
                      {p.amortizationAmount > 0 && !isAmort && !intent
                        ? ` · amortização ${brl(p.amortizationAmount)}`
                        : ''}
                      {p.receiptUrl && <ReceiptThumb url={p.receiptUrl} />}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num-display text-sm font-semibold text-ink-800">{brl(value)}</div>
                    <div
                      className={`text-[11px] font-medium ${
                        pending ? 'text-warn-700' : isAmort ? 'text-brand-600' : 'text-pos-600'
                      }`}
                    >
                      {pending ? 'Em análise' : isAmort ? 'Amortização' : 'Pago'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-ink-400">
        O saldo devedor e as parcelas futuras são estimativas e podem mudar com a correção anual do IPCA.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba: Previsão (estimativa de correção anual)
// ---------------------------------------------------------------------------
function PrevisaoTab({ calc }: { calc: NonNullable<ReturnType<typeof getContractCalc>> }) {
  const [, mm, dd] = calc.contract.financingStartDate.split('-')
  const anniversary = `${dd}/${mm}`
  const [forecast, setForecast] = useState(calc.contract.forecastAnnualIpca)
  const [customText, setCustomText] = useState('')

  // Cenário de inflação editável (simulação) — recalcula a projeção localmente.
  const simSchedule = useMemo(
    () => generateSchedule(calc.contract, { ...calc.scheduleOpts, forecastAnnualIpca: forecast }),
    [calc, forecast],
  )
  // Projeção ciente de antecipações: ignora parcelas já quitadas (inclusive as
  // últimas antecipadas) na contagem e no saldo de cada reajuste.
  const corrections = projectOpenCorrections(simSchedule)
  const nextDate = (corrections.find((c) => !c.isOfficial) ?? corrections[0])?.date
  const presets = [0.04, 0.045, 0.05]

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 px-4 py-3.5 ring-1 ring-inset ring-brand-100">
        <div className="flex items-center gap-2 font-display text-sm font-semibold text-brand-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
          Seu contrato não tem juros
        </div>
        <p className="mt-1 text-sm text-brand-800/90">
          A cada <b>12 meses</b> (dia {anniversary}), o valor é apenas <b>atualizado pela inflação
          oficial (IPCA)</b>.
        </p>
      </div>

      {/* Cenário de inflação — editável (simulação conservadora) */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-ink-900">Estimativa de inflação</h3>
          <Badge tone="muted">Simulação</Badge>
        </div>
        <p className="mt-0.5 text-sm text-ink-500">
          Use uma estimativa conservadora. Veja como ficaria com diferentes cenários de inflação ao ano.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => { setForecast(p); setCustomText('') }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                Math.abs(forecast - p) < 0.0001 && !customText
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              }`}
            >
              {pct(p)}{p === 0.05 ? ' · conservador' : ''}
            </button>
          ))}
          <div className="flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1">
            <input
              inputMode="decimal"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value)
                const v = parseFloat(e.target.value.replace(',', '.'))
                if (!Number.isNaN(v) && v >= 0 && v <= 50) setForecast(v / 100)
              }}
              placeholder="outro"
              className="tnum w-14 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <span className="text-sm text-ink-500">%</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Esta é uma simulação. A correção oficial seguirá o IPCA divulgado no período.
        </p>
      </Card>

      <SaldoDevedorChart schedule={simSchedule} />

      <div className="px-1 pt-1">
        <h3 className="font-display text-base font-bold text-ink-900">Atualização pela inflação, ano a ano</h3>
        <p className="text-sm text-ink-500">Veja como o saldo é corrigido pela inflação em cada período.</p>
      </div>

      {corrections.map((c) => {
        const isNext = c.date === nextDate
        return (
          <Card key={c.index} className="card-hover p-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isNext ? 'bg-brand-600' : 'bg-ink-300'}`} />
                <div className="min-w-0">
                  <div className="font-display text-sm font-bold text-ink-900">{formatDateBR(c.date)}</div>
                  <div className="text-[11px] text-ink-400">
                    {c.index}ª atualização{isNext ? ' · a próxima' : ''}
                  </div>
                </div>
              </div>
              <Badge tone="info">{c.isOfficial ? 'IPCA' : 'IPCA est.'} {pct(c.ipca)}</Badge>
            </div>

            <div className="space-y-1.5 border-t border-ink-100 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">Saldo devedor</span>
                <span className="num-display">
                  <span className="text-ink-500">{brl(c.openBalanceBefore)}</span>
                  <span className="mx-1.5 text-ink-300">→</span>
                  <span className="font-semibold text-brand-700">{brl(c.openBalanceAfter)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500">Cada parcela ({c.installmentsOpen}x)</span>
                <span className="num-display">
                  <span className="text-ink-500">{brl(c.previousInstallment)}</span>
                  <span className="mx-1.5 text-ink-300">→</span>
                  <span className="font-semibold text-ink-900">{brl(c.newInstallment)}</span>
                </span>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/** Gráfico (SVG) do saldo devedor caindo ao longo do contrato, com os reajustes marcados. */
function SaldoDevedorChart({
  schedule,
}: {
  schedule: ReturnType<typeof generateSchedule>
}) {
  const blocks = summarizeByYear(schedule)
  if (blocks.length === 0) return null

  // Saldo ciente de antecipações: conta as parcelas a partir de cada aniversário
  // que NÃO foram quitadas antecipadamente (fora de ordem). Para contratos sem
  // antecipação, equivale ao saldo planejado (nº restante × valor do período).
  const rows = schedule.rows
  // Conta só as parcelas do financiamento ainda EM ABERTO a partir do ponto —
  // exclui tanto as pagas em sequência quanto as antecipadas, para o saldo de
  // cada aniversário refletir o que o cliente realmente ainda deve.
  const openCountFrom = (n: number) =>
    rows.filter((r) => r.type === 'financiamento' && r.number >= n && r.status !== 'paga').length

  // Uma barra por aniversário (saldo no início de cada ciclo de 12 meses) e a
  // barra final "quitado". O saldo cai ano após ano mesmo com o reajuste anual.
  const bars = blocks.map((b, i) => ({
    label: `Ano ${i + 1}`,
    value: Math.max(0, openCountFrom(b.fromNumber) * b.installmentValue),
  }))
  bars.push({ label: 'Fim', value: 0 })
  const max = Math.max(...bars.map((b) => b.value), 1)
  const kFmt = (v: number) => (v <= 0 ? 'quitado' : v < 1000 ? brl(v) : `${Math.round(v / 1000)} mil`)

  return (
    <Card>
      <h3 className="font-display text-base font-bold text-ink-900">
        Saldo a cada aniversário do contrato
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        Onde o saldo fica depois de cada reajuste anual do IPCA. Cai ano após ano até quitar.
      </p>
      <div className="mt-6 flex items-end gap-1.5 sm:gap-3" style={{ height: 188 }}>
        {bars.map((b, i) => {
          const isLast = i === bars.length - 1
          const h = b.value <= 0 ? 3 : Math.max(4, Math.round((b.value / max) * 150))
          return (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <div className="num-display mb-1.5 whitespace-nowrap text-[9.5px] font-semibold text-ink-600 sm:text-[11px]">
                {kFmt(b.value)}
              </div>
              <div
                className={`w-full rounded-t-md ${isLast ? 'bg-pos-500' : i === 0 ? 'bg-brand-400' : 'bg-brand-gradient'}`}
                style={{ height: h }}
              />
              <div className="mt-2 text-[9.5px] font-medium text-ink-400 sm:text-[11px]">{b.label}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba: Meu contrato (resumo + dados)
// ---------------------------------------------------------------------------
function ContratoTab({
  calc,
  pix,
}: {
  calc: NonNullable<ReturnType<typeof getContractCalc>>
  pix: ReturnType<typeof getActivePixKey>
}) {
  const { contract, state, client } = calc
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="mb-2 font-display text-base font-bold text-ink-900">Resumo do contrato</h3>
        <Row label="Valor total da compra" value={brl(contract.totalValue)} />
        <Row label="Entrada" value={`${brl(contract.downPaymentValue)} em ${contract.downPaymentInstallments}x`} />
        <Row label="Valor financiado" value={brl(contract.financedValue)} />
        <Row label="Parcelas do financiamento" value={`${contract.financingInstallments}x`} />
        <div className="my-2 border-t border-ink-100" />
        <Row label="Total já pago" value={brl(state.totalPaid)} />
        <Row label="Saldo atual do contrato" value={brl(state.currentBalance)} strong />
        <Row
          label="Próxima estimativa de correção"
          value={state.nextCorrection ? formatDateBR(state.nextCorrection.date) : '—'}
        />
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-base font-bold text-ink-900">Dados para pagamento</h3>
        <Row label="Chave Pix" value={pix?.pixKey || '—'} />
        <Row label="Recebedor" value={pix?.receiverName || '—'} />
        <Row label="Banco" value={pix?.bankName || '—'} />
      </Card>

      {contract.clientNotes && (
        <Card>
          <h3 className="mb-2 font-display text-base font-bold text-ink-900">Avisos do vendedor</h3>
          <p className="text-sm text-ink-600">{contract.clientNotes}</p>
        </Card>
      )}

      <Card>
        <h3 className="mb-2 font-display text-base font-bold text-ink-900">Meus dados</h3>
        <Row label="Nome" value={client?.name} />
        <Row label="CPF / CNPJ" value={client?.document} />
        <Row label="Telefone" value={client?.phone || '—'} />
        <Row label="E-mail" value={client?.email || '—'} />
      </Card>
    </div>
  )
}
