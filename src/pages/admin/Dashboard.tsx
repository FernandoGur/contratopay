import { Link } from 'react-router-dom'
import { getContractCalc, getDb } from '@/lib/repo'
import { useDb } from '@/lib/store'
import { brl } from '@/lib/format'
import { formatDateBR } from '@/lib/dates'
import { Badge, Card, PageHeader, StatCard } from '@/components/ui'

export function Dashboard() {
  useDb()
  const db = getDb()

  const calcs = db.contracts.map((c) => getContractCalc(c.id)!).filter(Boolean)

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total vendido" value={brl(totalSold)} />
        <StatCard label="Total recebido" value={brl(totalReceived)} tone="pos" />
        <StatCard label="Saldo devedor total" value={brl(totalBalance)} accent />
        <StatCard label="Total a receber (previsto)" value={brl(totalToReceive)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              const calc = getContractCalc(c.id)!
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
