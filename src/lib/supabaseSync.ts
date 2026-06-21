// ============================================================================
// Sincronização com o Supabase — cache + write-through.
// Mapeia camelCase (app) <-> snake_case (Postgres) e coage numéricos
// (PostgREST devolve numeric como string, para preservar precisão).
// ============================================================================
import { supabase } from './supabase'
import type {
  Client,
  Contract,
  IpcaCorrection,
  Payment,
  PixKey,
  AuditLog,
} from './types'

const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

function keysToSnake(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v === undefined) continue // não envia undefined
    r[toSnake(k)] = v
  }
  return r
}

function keysToCamel(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  for (const k of Object.keys(o)) r[toCamel(k)] = o[k]
  return r
}

/** Coage os campos numéricos informados de string -> number. */
function coerce<T extends Record<string, unknown>>(row: T, numericFields: string[]): T {
  for (const f of numericFields) {
    if (row[f] != null && typeof row[f] === 'string') {
      ;(row as Record<string, unknown>)[f] = Number(row[f])
    }
  }
  return row
}

const NUMERIC: Record<string, string[]> = {
  clients: [],
  contracts: [
    'totalValue', 'downPaymentValue', 'downPaymentInstallments', 'financedValue',
    'financingInstallments', 'baseInstallmentValue', 'correctionFrequencyMonths', 'forecastAnnualIpca',
  ],
  payments: ['installmentNumber', 'amount', 'amortizationAmount'],
  corrections: ['index', 'ipcaPercentage'],
  pixKeys: [],
  auditLogs: [],
}

const TABLE = {
  clients: 'clients',
  contracts: 'contracts',
  payments: 'payments',
  corrections: 'ipca_corrections',
  pixKeys: 'pix_keys',
  auditLogs: 'audit_logs',
} as const

type Entity = keyof typeof TABLE

export interface HydratedData {
  clients: Client[]
  contracts: Contract[]
  payments: Payment[]
  corrections: IpcaCorrection[]
  pixKeys: PixKey[]
  auditLogs: AuditLog[]
}

/** Busca tudo que o usuário pode ver (RLS aplica o escopo). */
export async function hydrate(): Promise<HydratedData> {
  const sb = supabase!
  const [c, ct, p, ip, px, au] = await Promise.all([
    sb.from('clients').select('*'),
    sb.from('contracts').select('*'),
    sb.from('payments').select('*'),
    sb.from('ipca_corrections').select('*'),
    sb.from('pix_keys').select('*'),
    sb.from('audit_logs').select('*').order('created_at', { ascending: false }),
  ])
  const err = c.error || ct.error || p.error || ip.error || px.error || au.error
  if (err) throw err

  const map = (rows: unknown[] | null, ent: Entity) =>
    (rows ?? []).map((r) => coerce(keysToCamel(r as Record<string, unknown>), NUMERIC[ent]))

  return {
    clients: map(c.data, 'clients') as unknown as Client[],
    contracts: map(ct.data, 'contracts') as unknown as Contract[],
    payments: map(p.data, 'payments') as unknown as Payment[],
    corrections: map(ip.data, 'corrections') as unknown as IpcaCorrection[],
    pixKeys: map(px.data, 'pixKeys') as unknown as PixKey[],
    auditLogs: map(au.data, 'auditLogs') as unknown as AuditLog[],
  }
}

/** Insere/atualiza uma linha (upsert por id). */
export async function upsertRow(ent: Entity, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase!.from(TABLE[ent]).upsert(keysToSnake(row))
  if (error) throw error
}

/** Remove uma linha por id. */
export async function deleteRow(ent: Entity, id: string): Promise<void> {
  const { error } = await supabase!.from(TABLE[ent]).delete().eq('id', id)
  if (error) throw error
}
