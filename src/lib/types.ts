// Tipos de domínio — espelham a estrutura de dados da especificação (seção 26)
// e o schema do Supabase (ver supabase/schema.sql).

import type { ISODate } from './dates'

export type Role = 'admin' | 'cliente'

export type ClientStatus = 'ativo' | 'inadimplente' | 'quitado' | 'bloqueado'

export type ContractStatus =
  | 'ativo'
  | 'quitado'
  | 'atrasado'
  | 'renegociado'
  | 'cancelado'

export type PaymentStatus =
  | 'em_aberto'
  | 'aguardando_comprovante'
  | 'comprovante_enviado'
  | 'em_analise'
  | 'pago'
  | 'pago_parcial'
  | 'vencido'
  | 'renegociado'
  | 'cancelado'
  | 'ajustado'

export interface Client {
  id: string
  name: string
  document: string // CPF/CNPJ
  phone: string
  email: string
  address: string
  status: ClientStatus
  notes: string // observações internas
  createdAt: string
  updatedAt: string
}

export interface Contract {
  id: string
  clientId: string
  title: string
  totalValue: number
  downPaymentValue: number
  downPaymentInstallments: number
  downPaymentStartDate: ISODate
  financedValue: number
  financingInstallments: number
  financingStartDate: ISODate
  baseInstallmentValue: number
  correctionType: 'ipca_anual'
  correctionBaseDate: ISODate
  correctionFrequencyMonths: number
  status: ContractStatus
  internalNotes: string
  clientNotes: string // observações visíveis ao cliente
  /** IPCA anual previsto (decimal) usado nas simulações deste contrato. */
  forecastAnnualIpca: number
  createdAt: string
  updatedAt: string
}

/** Registro de pagamento de uma parcela (entrada ou financiamento). */
export interface Payment {
  id: string
  contractId: string
  installmentType: 'entrada' | 'financiamento'
  installmentNumber: number
  paymentDate: ISODate
  amount: number
  amortizationAmount: number // valor extra usado para amortizar o saldo
  paymentType: string // ex.: 'pix'
  pixKeyId: string | null
  receiptUrl: string | null
  status: PaymentStatus
  notes: string
  createdBy: string
  createdAt: string
}

/** Correção IPCA oficial aplicada (índice real). */
export interface IpcaCorrection {
  id: string
  contractId: string
  index: number // ordem da correção (1, 2, 3…)
  correctionDate: ISODate
  ipcaPercentage: number // decimal
  notes: string
  createdAt: string
}

export interface PixKey {
  id: string
  contractId: string
  pixKey: string
  receiverName: string
  bankName: string
  activeFrom: ISODate
  activeUntil: ISODate | null
  status: 'ativa' | 'inativa'
  createdAt: string
}

export interface AuditLog {
  id: string
  userId: string
  contractId: string | null
  action: string
  description: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Para cliente: id do cliente vinculado. */
  clientId?: string
}

/** Snapshot completo persistido (modo local). */
export interface Database {
  users: User[]
  clients: Client[]
  contracts: Contract[]
  payments: Payment[]
  corrections: IpcaCorrection[]
  pixKeys: PixKey[]
  auditLogs: AuditLog[]
}
