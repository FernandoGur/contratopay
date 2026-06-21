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
import { makeSeed } from './seed'
import { supabase, useSupabase } from './supabase'
import { hydrate, upsertRow } from './supabaseSync'
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

let db: Database = loadDb()
const listeners = new Set<() => void>()

function loadDb(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as Database
  } catch {
    /* ignore */
  }
  const seed = makeSeed()
  localStorage.setItem(DB_KEY, JSON.stringify(seed))
  return seed
}

function persist() {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
  listeners.forEach((l) => l())
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getDb(): Database {
  return db
}

export function resetDb() {
  db = makeSeed()
  persist()
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const nowISO = () => new Date().toISOString()

function log(action: string, description: string, contractId: string | null) {
  db.auditLogs.unshift({
    id: uid('log'),
    userId: getCurrentUser()?.id ?? 'desconhecido',
    contractId,
    action,
    description,
    createdAt: nowISO(),
  })
}

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const id = JSON.parse(raw) as string
    return db.users.find((u) => u.id === id) ?? null
  } catch {
    return null
  }
}

export function login(email: string, password: string): User {
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

export function logout() {
  localStorage.removeItem(USER_KEY)
  listeners.forEach((l) => l())
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
    if (p.status === 'pago') {
      if (p.installmentType === 'financiamento') paidFin.add(p.installmentNumber)
      else paidDown.add(p.installmentNumber)
    }
    if (p.amortizationAmount > 0 && p.installmentType === 'financiamento') {
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
  log('cliente_criado', `Cliente ${client.name} cadastrado.`, null)
  persist()
  return client
}

export function updateClient(id: string, patch: Partial<Client>) {
  const c = db.clients.find((x) => x.id === id)
  if (!c) return
  Object.assign(c, patch, { updatedAt: nowISO() })
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
  // Cria uma chave Pix inicial vazia para o contrato.
  db.pixKeys.push({
    id: uid('pix'),
    contractId: contract.id,
    pixKey: '',
    receiverName: '',
    bankName: '',
    activeFrom: contract.financingStartDate,
    activeUntil: null,
    status: 'ativa',
    createdAt: nowISO(),
  })
  log('contrato_criado', `Contrato "${contract.title}" criado.`, contract.id)
  persist()
  return contract
}

export function updateContract(id: string, patch: Partial<Contract>) {
  const c = db.contracts.find((x) => x.id === id)
  if (!c) return
  Object.assign(c, patch, { updatedAt: nowISO() })
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

/** Cliente envia comprovante (modo local: guarda data URL). */
export function submitReceipt(
  contractId: string,
  installmentType: 'entrada' | 'financiamento',
  installmentNumber: number,
  receiptUrl: string,
) {
  const existing = db.payments.find(
    (p) =>
      p.contractId === contractId &&
      p.installmentType === installmentType &&
      p.installmentNumber === installmentNumber,
  )
  if (existing) {
    existing.receiptUrl = receiptUrl
    existing.status = 'comprovante_enviado'
  } else {
    db.payments.push({
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
      notes: '',
      createdBy: getCurrentUser()?.id ?? 'user-cliente',
      createdAt: nowISO(),
    })
  }
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
  if (existing) {
    existing.ipcaPercentage = data.ipcaPercentage
    existing.correctionDate = data.correctionDate
    existing.notes = data.notes ?? existing.notes
  } else {
    db.corrections.push({
      id: uid('ipca'),
      contractId: data.contractId,
      index: data.index,
      correctionDate: data.correctionDate,
      ipcaPercentage: data.ipcaPercentage,
      notes: data.notes ?? '',
      createdAt: nowISO(),
    })
  }
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
    }
  }
  db.pixKeys.push({
    id: uid('pix'),
    contractId,
    pixKey: data.pixKey,
    receiverName: data.receiverName,
    bankName: data.bankName,
    activeFrom: data.activeFrom,
    activeUntil: null,
    status: 'ativa',
    createdAt: nowISO(),
  })
  log('pix_atualizada', `Chave Pix atualizada: ${data.pixKey}.`, contractId)
  persist()
}
