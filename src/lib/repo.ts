// Repositório de dados — modo LOCAL (localStorage).
//
// Toda a UI fala com este módulo através de uma interface única. Quando o
// Supabase estiver configurado, basta criar um repo equivalente que implemente
// as mesmas funções (ver supabase/README). A engine de cálculo é compartilhada.

import {
  computeContractState,
  generateDownPaymentRows,
  generateSchedule,
  type AppliedAmortizations,
  type ContractState,
  type OfficialCorrections,
  type ScheduleResult,
  type ScheduleRow,
} from './finance'
import { todayISO } from './dates'
import { encodeReceiptNotes, parseReceiptNotes, type ExtraIntent } from './requests'
import { makeSeed } from './seed'
import { supabase, useSupabase } from './supabase'
import { hydrate, upsertRow, deleteRow } from './supabaseSync'
import type {
  Client,
  Contract,
  Database,
  IpcaCorrection,
  Payment,
  PixKey,
  User,
} from './types'

type Entity = 'clients' | 'contracts' | 'payments' | 'corrections' | 'pixKeys' | 'auditLogs'

const DB_KEY = 'recebimentos.db.v4'
const USER_KEY = 'recebimentos.user.v1'

// Credenciais simples para o modo local (no Supabase isto vira Auth real).
const CREDENTIALS: Record<string, { password: string; userId: string }> = {
  'admin@local': { password: 'admin', userId: 'user-admin' },
  'cliente@local': { password: 'cliente', userId: 'user-cliente' },
}

// ---------------------------------------------------------------------------
// Store reativo
// ---------------------------------------------------------------------------

const SB_KEY = 'recebimentos.sb.v1'

function emptyDb(): Database {
  return { users: [], clients: [], contracts: [], payments: [], corrections: [], pixKeys: [], auditLogs: [] }
}

let db: Database = loadDb()
let ready = !useSupabase // local já fica pronto; supabase fica após hidratar
let currentUser: User | null = null
let version = 0 // tick incrementado a cada mudança (reatividade do useDb)
const listeners = new Set<() => void>()

/** Snapshot reativo: muda a cada persist(), pois o `db` é mutado no lugar. */
export function getVersion(): number {
  return version
}

/**
 * Migrações leves no banco LOCAL já salvo no dispositivo, sem perder dados.
 * Chaves Pix antigas usavam o placeholder "admin@local" (tratado como "não
 * informada"); promove para o e-mail real do vendedor.
 */
function migrate(database: Database): Database {
  for (const k of database.pixKeys ?? []) {
    if (k.status === 'ativa' && k.pixKey.toLowerCase().endsWith('@local')) {
      k.pixKey = 'fernandogutemberggomes@gmail.com'
      if (!k.receiverName) k.receiverName = 'Fernando Silva'
      if (!k.bankName) k.bankName = 'Banco do Brasil'
    }
  }
  // Remove lançamentos "pago" fantasmas (R$ 0,00 e sem amortização).
  database.payments = (database.payments ?? []).filter(
    (p) => p.status !== 'pago' || p.amount > 0 || p.amortizationAmount > 0,
  )
  return database
}

function loadDb(): Database {
  const key = useSupabase ? SB_KEY : DB_KEY
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      return useSupabase ? parsed : migrate(parsed)
    }
  } catch {
    /* ignore */
  }
  if (useSupabase) return emptyDb()
  const seed = makeSeed()
  localStorage.setItem(DB_KEY, JSON.stringify(seed))
  return seed
}

function persist() {
  // setItem pode lançar QuotaExceededError (ex.: comprovante grande em base64
  // estoura ~5MB do localStorage). Não derruba a app — o estado em memória já
  // foi atualizado; só não persiste entre recarregamentos.
  try {
    localStorage.setItem(useSupabase ? SB_KEY : DB_KEY, JSON.stringify(db))
  } catch (e) {
    console.error('[persist] localStorage falhou (cota?)', e)
  }
  version++
  listeners.forEach((l) => l())
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getDb(): Database {
  return db
}

export function isReady(): boolean {
  return ready
}

export function resetDb() {
  if (useSupabase) return
  db = makeSeed()
  persist()
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const nowISO = () => new Date().toISOString()

// Sinal de erro de sincronização: quando um write-through falha, a alteração
// local diverge do servidor (e será descartada no próximo boot). Em vez de
// falhar em silêncio, expomos isso para a UI avisar o usuário.
let syncError: string | null = null
export function getSyncError(): string | null {
  return syncError
}
export function clearSyncError() {
  if (syncError === null) return
  syncError = null
  version++
  listeners.forEach((l) => l())
}
function flagSyncError(e: unknown) {
  console.error('[sync]', e)
  syncError = 'Algumas alterações não foram salvas no servidor. Recarregue a página para sincronizar.'
  version++
  listeners.forEach((l) => l())
}

/** Write-through para o Supabase (fire-and-forget; sinaliza falha à UI). */
function push(ent: Entity, row: unknown) {
  if (!useSupabase) return
  upsertRow(ent, row as Record<string, unknown>).catch(flagSyncError)
}

/** Remoção espelhada no Supabase (fire-and-forget; sinaliza falha à UI). */
function pushDelete(ent: Entity, id: string) {
  if (!useSupabase) return
  deleteRow(ent, id).catch(flagSyncError)
}

function log(action: string, description: string, contractId: string | null) {
  const entry = {
    id: uid('log'),
    userId: getCurrentUser()?.id ?? 'desconhecido',
    contractId,
    action,
    description,
    createdAt: nowISO(),
  }
  db.auditLogs.unshift(entry)
  // Auditoria só é gravada no servidor pelo admin (RLS).
  if (currentUser?.role === 'admin') push('auditLogs', entry)
}

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

export function getCurrentUser(): User | null {
  if (useSupabase) return currentUser
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const id = JSON.parse(raw) as string
    return db.users.find((u) => u.id === id) ?? null
  } catch {
    return null
  }
}

export async function login(email: string, password: string): Promise<User> {
  if (useSupabase) {
    const { error } = await supabase!.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw new Error(authError(error.message))
    await bootstrapSession()
    if (!currentUser) throw new Error('Não foi possível carregar seus dados.')
    return currentUser
  }
  const cred = CREDENTIALS[email.trim().toLowerCase()]
  if (!cred || cred.password !== password) {
    throw new Error('E-mail ou senha inválidos.')
  }
  const user = db.users.find((u) => u.id === cred.userId)
  if (!user) throw new Error('Usuário não encontrado.')
  localStorage.setItem(USER_KEY, JSON.stringify(user.id))
  listeners.forEach((l) => l())
  return user
}

export async function logout() {
  if (useSupabase) {
    await supabase!.auth.signOut()
    currentUser = null
    db = emptyDb()
    persist()
    return
  }
  localStorage.removeItem(USER_KEY)
  listeners.forEach((l) => l())
}

function authError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.'
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.'
  return msg
}

/** Carrega a sessão atual, hidrata o cache e resolve o usuário/perfil. */
async function bootstrapSession() {
  const { data } = await supabase!.auth.getSession()
  const session = data.session
  if (!session?.user) {
    currentUser = null
    ready = true
    listeners.forEach((l) => l())
    return
  }
  const email = (session.user.email ?? '').toLowerCase()
  db = { ...emptyDb(), ...(await hydrate()) }

  const { data: adminRow } = await supabase!
    .from('app_admins')
    .select('email')
    .ilike('email', email)
    .maybeSingle()
  const isAdmin = !!adminRow

  // Primeiro acesso do admin: semeia o contrato-exemplo.
  if (isAdmin && db.contracts.length === 0) {
    await seedSupabase()
    db = { ...emptyDb(), ...(await hydrate()) }
  }

  if (isAdmin) {
    currentUser = { id: session.user.id, name: 'Vendedor', email, role: 'admin' }
  } else {
    const client = db.clients[0]
    currentUser = {
      id: session.user.id,
      name: client?.name ?? 'Cliente',
      email,
      role: 'cliente',
      clientId: client?.id,
    }
  }
  db.users = [currentUser]
  ready = true
  persist()
}

/** Semeia o contrato-exemplo no Supabase (1ª vez do admin). */
async function seedSupabase() {
  const seed = makeSeed()
  for (const c of seed.clients) await upsertRow('clients', c as unknown as Record<string, unknown>)
  for (const ct of seed.contracts) await upsertRow('contracts', ct as unknown as Record<string, unknown>)
  for (const px of seed.pixKeys) await upsertRow('pixKeys', px as unknown as Record<string, unknown>)
  for (const p of seed.payments) await upsertRow('payments', p as unknown as Record<string, unknown>)
}

// Bootstrap no carregamento do módulo (modo Supabase).
if (useSupabase) {
  bootstrapSession().catch((e) => {
    console.error('[auth] bootstrap', e)
    ready = true
    listeners.forEach((l) => l())
  })
  supabase!.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null
      db = emptyDb()
      persist()
    }
  })
}

// ---------------------------------------------------------------------------
// Seletores
// ---------------------------------------------------------------------------

export function getClient(id: string): Client | undefined {
  return db.clients.find((c) => c.id === id)
}

export function getContract(id: string): Contract | undefined {
  return db.contracts.find((c) => c.id === id)
}

export function getContractsByClient(clientId: string): Contract[] {
  return db.contracts.filter((c) => c.clientId === clientId)
}

export function getPayments(contractId: string): Payment[] {
  return db.payments
    .filter((p) => p.contractId === contractId)
    .sort((a, b) =>
      a.installmentType === b.installmentType
        ? a.installmentNumber - b.installmentNumber
        : a.installmentType === 'entrada'
          ? -1
          : 1,
    )
}

export function getCorrections(contractId: string): IpcaCorrection[] {
  return db.corrections
    .filter((c) => c.contractId === contractId)
    .sort((a, b) => a.index - b.index)
}

export function getPixKeys(contractId: string): PixKey[] {
  return db.pixKeys.filter((p) => p.contractId === contractId)
}

export function getActivePixKey(contractId: string): PixKey | undefined {
  return db.pixKeys.find((p) => p.contractId === contractId && p.status === 'ativa')
}

export interface ContractCalc {
  contract: Contract
  client?: Client
  schedule: ScheduleResult
  downRows: ScheduleRow[]
  state: ContractState
  payments: Payment[]
  corrections: IpcaCorrection[]
  scheduleOpts: {
    paid: Set<number>
    officialCorrections: OfficialCorrections
    amortizations: AppliedAmortizations
    forecastAnnualIpca: number
    today: string
  }
}

/** Reúne contrato + pagamentos + correções e roda a engine. */
export function getContractCalc(contractId: string): ContractCalc | null {
  const contract = getContract(contractId)
  if (!contract) return null
  const payments = getPayments(contractId)
  const corrections = getCorrections(contractId)

  const paidFin = new Set<number>()
  const paidDown = new Set<number>()
  const amortizations: AppliedAmortizations = {}
  for (const p of payments) {
    // Só quita a parcela se foi efetivamente paga (valor > 0). Um comprovante
    // aprovado sem valor (R$ 0,00) NÃO deve dar a parcela como quitada.
    if (p.status === 'pago' && p.amount > 0) {
      if (p.installmentType === 'entrada') paidDown.add(p.installmentNumber)
      else if (p.installmentType === 'financiamento') paidFin.add(p.installmentNumber)
    }
    // Amortização: tanto a combinada (na parcela do financiamento) quanto o
    // lançamento avulso ('amortizacao') abatem o saldo no ponto indicado.
    // Só vale depois de validada (status 'pago'); um pedido do cliente ainda
    // em análise NÃO mexe no saldo.
    if (
      p.status === 'pago' &&
      p.amortizationAmount > 0 &&
      (p.installmentType === 'financiamento' || p.installmentType === 'amortizacao')
    ) {
      amortizations[p.installmentNumber] =
        (amortizations[p.installmentNumber] ?? 0) + p.amortizationAmount
    }
  }

  const officialCorrections: OfficialCorrections = {}
  for (const c of corrections) officialCorrections[c.index] = c.ipcaPercentage

  const today = todayISO()
  const schedule = generateSchedule(contract, {
    paid: paidFin,
    officialCorrections,
    amortizations,
    forecastAnnualIpca: contract.forecastAnnualIpca,
    today,
  })
  const downRows = generateDownPaymentRows(
    {
      downPaymentValue: contract.downPaymentValue,
      downPaymentInstallments: contract.downPaymentInstallments,
      downPaymentStartDate: contract.downPaymentStartDate,
    },
    { paid: paidDown, today },
  )
  const state = computeContractState(contract, schedule, downRows)

  // "Total já pago" reflete os valores REAIS dos pagamentos registrados
  // (que podem diferir por centavos do valor planejado das parcelas).
  const actualPaid = payments
    .filter((p) => p.status === 'pago')
    .reduce((s, p) => s + p.amount + p.amortizationAmount, 0)
  state.totalPaid = Math.round((actualPaid + Number.EPSILON) * 100) / 100

  return {
    contract,
    client: getClient(contract.clientId),
    schedule,
    downRows,
    state,
    payments,
    corrections,
    scheduleOpts: {
      paid: paidFin,
      officialCorrections,
      amortizations,
      forecastAnnualIpca: contract.forecastAnnualIpca,
      today,
    },
  }
}

// ---------------------------------------------------------------------------
// Mutações — Clientes
// ---------------------------------------------------------------------------

export function createClient(
  data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>,
): Client {
  const client: Client = {
    ...data,
    id: uid('client'),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
  db.clients.push(client)
  push('clients', client)
  log('cliente_criado', `Cliente ${client.name} cadastrado.`, null)
  persist()
  return client
}

export function updateClient(id: string, patch: Partial<Client>) {
  const c = db.clients.find((x) => x.id === id)
  if (!c) return
  Object.assign(c, patch, { updatedAt: nowISO() })
  push('clients', c)
  log('cliente_atualizado', `Cliente ${c.name} atualizado.`, null)
  persist()
}

// ---------------------------------------------------------------------------
// Mutações — Contratos
// ---------------------------------------------------------------------------

export function createContract(
  data: Omit<Contract, 'id' | 'createdAt' | 'updatedAt' | 'baseInstallmentValue'>,
): Contract {
  const contract: Contract = {
    ...data,
    baseInstallmentValue:
      Math.round((data.financedValue / data.financingInstallments) * 100) / 100,
    id: uid('contract'),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
  db.contracts.push(contract)
  push('contracts', contract)
  // Cria uma chave Pix inicial vazia para o contrato.
  const pix: PixKey = {
    id: uid('pix'),
    contractId: contract.id,
    pixKey: '',
    receiverName: '',
    bankName: '',
    activeFrom: contract.financingStartDate,
    activeUntil: null,
    status: 'ativa',
    createdAt: nowISO(),
  }
  db.pixKeys.push(pix)
  push('pixKeys', pix)
  log('contrato_criado', `Contrato "${contract.title}" criado.`, contract.id)
  persist()
  return contract
}

export function updateContract(id: string, patch: Partial<Contract>) {
  const c = db.contracts.find((x) => x.id === id)
  if (!c) return
  Object.assign(c, patch, { updatedAt: nowISO() })
  push('contracts', c)
  log('contrato_atualizado', `Contrato "${c.title}" atualizado.`, c.id)
  persist()
}

// ---------------------------------------------------------------------------
// Mutações — Pagamentos
// ---------------------------------------------------------------------------

export function recordPayment(data: {
  contractId: string
  installmentType: 'entrada' | 'financiamento'
  installmentNumber: number
  paymentDate: string
  amount: number
  amortizationAmount?: number
  pixKeyId?: string | null
  receiptUrl?: string | null
  status?: Payment['status']
  notes?: string
}): Payment {
  const existing = db.payments.find(
    (p) =>
      p.contractId === data.contractId &&
      p.installmentType === data.installmentType &&
      p.installmentNumber === data.installmentNumber,
  )
  const status = data.status ?? 'pago'
  const amount = data.amount
  const amort = data.amortizationAmount ?? 0

  // Um pagamento "pago" sem valor (0 e sem amortização) NÃO é um pagamento:
  // não cria registro fantasma. Se já existia um lançamento para esta parcela,
  // ele é REMOVIDO (equivale a desfazer/estornar) — a parcela volta a "em aberto"
  // e some do histórico. Resolve o caso de editar o valor pago para R$ 0,00.
  if (status === 'pago' && amount <= 0 && amort <= 0) {
    if (existing) {
      db.payments = db.payments.filter((p) => p.id !== existing.id)
      pushDelete('payments', existing.id)
      log(
        'pagamento_estornado',
        `Lançamento sem valor removido: ${data.installmentType} #${data.installmentNumber}.`,
        data.contractId,
      )
      persist()
    }
    return (
      existing ?? {
        id: uid('pay'),
        contractId: data.contractId,
        installmentType: data.installmentType,
        installmentNumber: data.installmentNumber,
        paymentDate: data.paymentDate,
        amount: 0,
        amortizationAmount: 0,
        paymentType: 'pix',
        pixKeyId: null,
        receiptUrl: null,
        status: 'em_aberto',
        notes: '',
        createdBy: getCurrentUser()?.id ?? 'user-admin',
        createdAt: nowISO(),
      }
    )
  }

  const base: Payment = {
    id: existing?.id ?? uid('pay'),
    contractId: data.contractId,
    installmentType: data.installmentType,
    installmentNumber: data.installmentNumber,
    paymentDate: data.paymentDate,
    amount: data.amount,
    amortizationAmount: data.amortizationAmount ?? 0,
    paymentType: 'pix',
    pixKeyId: data.pixKeyId ?? getActivePixKey(data.contractId)?.id ?? null,
    receiptUrl: data.receiptUrl ?? existing?.receiptUrl ?? null,
    status: data.status ?? 'pago',
    notes: data.notes ?? '',
    createdBy: getCurrentUser()?.id ?? 'user-admin',
    createdAt: existing?.createdAt ?? nowISO(),
  }
  if (existing) {
    Object.assign(existing, base)
  } else {
    db.payments.push(base)
  }
  push('payments', base)
  const label = `${data.installmentType} #${data.installmentNumber}`
  if (data.amortizationAmount && data.amortizationAmount > 0) {
    log(
      'amortizacao_registrada',
      `Amortização de R$ ${data.amortizationAmount.toFixed(2)} na parcela ${label}.`,
      data.contractId,
    )
  }
  log('pagamento_registrado', `Pagamento registrado: ${label}.`, data.contractId)
  persist()
  return base
}

/**
 * Registra uma AMORTIZAÇÃO avulsa (lançamento próprio, sem número de parcela).
 * `applyAtInstallment` é apenas o ponto do cronograma onde o abatimento passa a
 * valer (uso interno do motor). Cada chamada cria um lançamento novo (permite
 * várias amortizações) e nunca quita a parcela.
 */
export function recordAmortization(data: {
  contractId: string
  applyAtInstallment: number
  amount: number
  paymentDate: string
  receiptUrl?: string | null
}): Payment | null {
  if (!(data.amount > 0)) return null
  const row: Payment = {
    id: uid('amort'),
    contractId: data.contractId,
    installmentType: 'amortizacao',
    installmentNumber: data.applyAtInstallment,
    paymentDate: data.paymentDate,
    amount: 0,
    amortizationAmount: data.amount,
    paymentType: 'pix',
    pixKeyId: getActivePixKey(data.contractId)?.id ?? null,
    receiptUrl: data.receiptUrl ?? null,
    status: 'pago',
    notes: '',
    createdBy: getCurrentUser()?.id ?? 'user-admin',
    createdAt: nowISO(),
  }
  db.payments.push(row)
  push('payments', row)
  log('amortizacao_registrada', `Amortização de ${data.amount.toFixed(2)} registrada.`, data.contractId)
  persist()
  return row
}

/** Remove um pagamento/amortização por id (estorno). */
export function deletePayment(paymentId: string) {
  const p = db.payments.find((x) => x.id === paymentId)
  if (!p) return
  db.payments = db.payments.filter((x) => x.id !== paymentId)
  pushDelete('payments', paymentId)
  log('pagamento_estornado', `Lançamento removido: ${p.installmentType} #${p.installmentNumber}.`, p.contractId)
  persist()
}

/** Cliente envia comprovante (modo local: guarda data URL). `fileName` fica em
 *  notes para exibir nome/data do arquivo. */
export function submitReceipt(
  contractId: string,
  installmentType: 'entrada' | 'financiamento' | 'amortizacao',
  installmentNumber: number,
  receiptUrl: string,
  fileName = '',
  intent?: ExtraIntent,
) {
  // `intent` (amortizar/quitar) é serializado junto do nome do arquivo. O
  // registro fica inerte (amount/amortization 0, status comprovante_enviado):
  // não mexe no cálculo até o vendedor validar no modal de revisão.
  // Pedidos extras chegam com installmentType 'amortizacao' (namespace próprio),
  // para NÃO colidir com o comprovante comum da parcela ('financiamento').
  const notes = encodeReceiptNotes({ file: fileName, intent })
  // Só reusa um registro PENDENTE do mesmo tipo/número (e, se houver intenção,
  // da mesma modalidade). Nunca sobrescreve um pagamento já 'pago' nem mistura
  // comprovante comum com pedido de amortizar/quitar.
  const existing = db.payments.find(
    (p) =>
      p.contractId === contractId &&
      p.installmentType === installmentType &&
      p.installmentNumber === installmentNumber &&
      p.status !== 'pago' &&
      (!intent || parseReceiptNotes(p.notes).intent?.mode === intent.mode),
  )
  let row: Payment
  if (existing) {
    existing.receiptUrl = receiptUrl
    existing.status = 'comprovante_enviado'
    existing.notes = notes
    existing.paymentDate = todayISO()
    existing.createdAt = nowISO() // atualiza a hora do envio ao trocar
    row = existing
  } else {
    row = {
      id: uid('pay'),
      contractId,
      installmentType,
      installmentNumber,
      paymentDate: todayISO(),
      amount: 0,
      amortizationAmount: 0,
      paymentType: 'pix',
      pixKeyId: getActivePixKey(contractId)?.id ?? null,
      receiptUrl,
      status: 'comprovante_enviado',
      notes,
      createdBy: getCurrentUser()?.id ?? 'user-cliente',
      createdAt: nowISO(),
    }
    db.payments.push(row)
  }
  push('payments', row)
  log(
    'comprovante_enviado',
    `Comprovante enviado para ${installmentType} #${installmentNumber}.`,
    contractId,
  )
  persist()
}

export function setPaymentStatus(paymentId: string, status: Payment['status']) {
  const p = db.payments.find((x) => x.id === paymentId)
  if (!p) return
  p.status = status
  push('payments', p)
  log(
    'comprovante_revisado',
    `Pagamento ${p.installmentType} #${p.installmentNumber} → ${status}.`,
    p.contractId,
  )
  persist()
}

// ---------------------------------------------------------------------------
// Mutações — Correção IPCA
// ---------------------------------------------------------------------------

export function applyIpcaCorrection(data: {
  contractId: string
  index: number
  correctionDate: string
  ipcaPercentage: number
  notes?: string
}) {
  const existing = db.corrections.find(
    (c) => c.contractId === data.contractId && c.index === data.index,
  )
  let row: IpcaCorrection
  if (existing) {
    existing.ipcaPercentage = data.ipcaPercentage
    existing.correctionDate = data.correctionDate
    existing.notes = data.notes ?? existing.notes
    row = existing
  } else {
    row = {
      id: uid('ipca'),
      contractId: data.contractId,
      index: data.index,
      correctionDate: data.correctionDate,
      ipcaPercentage: data.ipcaPercentage,
      notes: data.notes ?? '',
      createdAt: nowISO(),
    }
    db.corrections.push(row)
  }
  push('corrections', row)
  log(
    'ipca_aplicado',
    `Correção IPCA #${data.index} (${(data.ipcaPercentage * 100).toFixed(2)}%) aplicada.`,
    data.contractId,
  )
  persist()
}

// ---------------------------------------------------------------------------
// Mutações — Chave Pix
// ---------------------------------------------------------------------------

export function setPixKey(
  contractId: string,
  data: { pixKey: string; receiverName: string; bankName: string; activeFrom: string },
) {
  // Desativa a chave anterior e cria a nova (mantém histórico).
  for (const k of db.pixKeys.filter((p) => p.contractId === contractId)) {
    if (k.status === 'ativa') {
      k.status = 'inativa'
      k.activeUntil = data.activeFrom
      push('pixKeys', k)
    }
  }
  const novo: PixKey = {
    id: uid('pix'),
    contractId,
    pixKey: data.pixKey,
    receiverName: data.receiverName,
    bankName: data.bankName,
    activeFrom: data.activeFrom,
    activeUntil: null,
    status: 'ativa',
    createdAt: nowISO(),
  }
  db.pixKeys.push(novo)
  push('pixKeys', novo)
  log('pix_atualizada', `Chave Pix atualizada: ${data.pixKey}.`, contractId)
  persist()
}
