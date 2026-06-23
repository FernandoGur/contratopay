import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getContractCalc, getCurrentUser, getDb } from '@/lib/repo'
import { supabase } from '@/lib/supabase'
import { useDb } from '@/lib/store'
import { brl } from '@/lib/format'
import { formatDateBR } from '@/lib/dates'
import { Badge, Button, Card, PageHeader, StatCard } from '@/components/ui'
import { PushButton } from '@/components/PushButton'
import { BiometricToggle } from '@/components/BiometricToggle'
import { sendPush } from '@/lib/push'

export function Dashboard() {
  const version = useDb()
  const db = getDb()

  // Roda o motor UMA vez por contrato e só quando os dados mudam (version),
  // reusando o resultado na lista (antes recalculava 2× por contrato a cada tick).
  const calcs = useMemo(
    () => db.contracts.map((c) => getContractCalc(c.id)!).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const calcById = useMemo(() => new Map(calcs.map((c) => [c.contract.id, c])), [calcs])

  const totalSold = db.contracts.reduce((s, c) => s + c.totalValue, 0)
  const totalReceived = calcs.reduce((s, c) => s + c.state.totalPaid, 0)
  const totalBalance = calcs.reduce((s, c) => s + c.state.currentBalance, 0)
  const totalToReceive = calcs.reduce((s, c) => s + c.state.totalOpenProjected, 0)
  const totalAmortized = calcs.reduce((s, c) => s + c.state.totalAmortized, 0)
  const overdue = calcs.reduce((s, c) => s + c.state.overdueCount, 0)

  const active = db.contracts.filter((c) => c.status === 'ativo').length
  const settled = db.contracts.filter((c) => c.status === 'quitado').length

  // Próximas correções IPCA previstas (próxima de cada contrato).
  const upcomingCorrections = calcs
    .filter((c) => c.state.nextCorrection)
    .map((c) => ({
      contractId: c.contract.id,
      title: c.contract.title,
      date: c.state.nextCorrection!.date,
      index: c.state.nextCorrection!.index,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  return (
    <div>
      <PageHeader
        title="Painel financeiro"
        subtitle="Visão geral dos seus contratos e recebimentos."
      />

      <AdminPushCard />

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-base font-semibold text-ink-900">Acesso por biometria</div>
          <p className="text-sm text-ink-500">
            Bloqueie o painel e entre com Face ID ou digital nas próximas vezes (PWA instalada).
          </p>
        </div>
        <BiometricToggle />
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total vendido" value={brl(totalSold)} />
        <StatCard label="Total recebido" value={brl(totalReceived)} tone="pos" />
        <StatCard label="Saldo devedor total" value={brl(totalBalance)} accent />
        <StatCard label="Total a receber (previsto)" value={brl(totalToReceive)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Contratos ativos" value={active} />
        <StatCard label="Contratos quitados" value={settled} />
        <StatCard
          label="Parcelas vencidas"
          value={overdue}
          tone={overdue > 0 ? 'neg' : 'pos'}
        />
        <StatCard label="Amortizado pelos clientes" value={brl(totalAmortized)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-base font-semibold text-ink-900">Contratos</h2>
          <div className="space-y-2">
            {db.contracts.map((c) => {
              const calc = calcById.get(c.id)
              if (!calc) return null
              return (
                <Link
                  key={c.id}
                  to={`/admin/contratos/${c.id}`}
                  className="flex items-center justify-between rounded-lg border border-ink-200 px-4 py-3 hover:border-brand-300 hover:bg-brand-50/30"
                >
                  <div>
                    <div className="font-medium text-ink-900">{c.title}</div>
                    <div className="text-sm text-ink-500">{calc.client?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum font-semibold text-ink-900">
                      {brl(calc.state.currentBalance)}
                    </div>
                    <div className="text-xs text-ink-400">saldo devedor</div>
                  </div>
                </Link>
              )
            })}
            {db.contracts.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400">
                Nenhum contrato cadastrado ainda.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-semibold text-ink-900">
            Próximas correções IPCA
          </h2>
          <div className="space-y-2">
            {upcomingCorrections.map((c) => (
              <Link
                key={c.contractId}
                to={`/admin/contratos/${c.contractId}`}
                className="flex items-center justify-between rounded-lg border border-ink-200 px-4 py-3 hover:bg-ink-50"
              >
                <div>
                  <div className="font-medium text-ink-900">{c.title}</div>
                  <div className="text-sm text-ink-500">{c.index}ª correção</div>
                </div>
                <Badge tone="info">{formatDateBR(c.date)}</Badge>
              </Link>
            ))}
            {upcomingCorrections.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400">
                Sem correções previstas.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

interface NotifLog {
  id: string
  user_email: string
  title: string | null
  sent_at: string
  delivered_at: string | null
  clicked_at: string | null
}

/** Card de notificações (vendedor): ativa o push, envia teste e mostra o
 *  rastreamento (enviada → entregue → clicada). */
function AdminPushCard() {
  const email = getCurrentUser()?.email ?? ''
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<NotifLog[]>([])

  async function loadLog() {
    if (!supabase) return
    const { data } = await supabase
      .from('notification_log')
      .select('id, user_email, title, sent_at, delivered_at, clicked_at')
      .order('sent_at', { ascending: false })
      .limit(8)
    setLog((data as NotifLog[]) ?? [])
  }
  useEffect(() => {
    loadLog()
  }, [])

  async function test() {
    setStatus(null)
    setBusy(true)
    const r = await sendPush(email, 'ContratoPay', 'Notificação de teste — tudo certo por aqui.', '/admin')
    setBusy(false)
    setStatus(r.ok ? 'Enviado. Deve chegar em instantes.' : `Falhou: ${r.error ?? 'erro'}`)
    setTimeout(loadLog, 1500)
  }

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-base font-semibold text-ink-900">Notificações</div>
          <p className="text-sm text-ink-500">
            Ative para receber avisos neste dispositivo (PWA instalada). Você pode mandar um teste
            para si mesmo.
          </p>
          {status && <p className="mt-1 text-xs text-ink-500">{status}</p>}
        </div>
        <div className="flex items-center gap-2">
          <PushButton />
          <Button variant="secondary" onClick={test} disabled={busy || !email}>
            {busy ? 'Enviando…' : 'Enviar teste'}
          </Button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Últimos envios
          </div>
          <div className="space-y-1.5">
            {log.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-ink-700">
                  {n.title || 'Notificação'} · <span className="text-ink-400">{n.user_email}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge tone="muted">enviada {hora(n.sent_at)}</Badge>
                  {n.delivered_at && <Badge tone="info">entregue {hora(n.delivered_at)}</Badge>}
                  {n.clicked_at && <Badge tone="pos">clicada {hora(n.clicked_at)}</Badge>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
