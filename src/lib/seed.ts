// Dados iniciais (seed) — contrato-exemplo da especificação (seção 5).
// Carregado automaticamente no primeiro uso (modo local).

import { addMonths } from './dates'
import type {
  Contract,
  Database,
  Payment,
  PixKey,
  User,
} from './types'

const now = () => new Date().toISOString()

export function makeSeed(): Database {
  const adminUser: User = {
    id: 'user-admin',
    name: 'Fernando Silva',
    email: 'admin@local',
    role: 'admin',
  }
  const clientUser: User = {
    id: 'user-cliente',
    name: 'Cliente do Terreno',
    email: 'cliente@local',
    role: 'cliente',
    clientId: 'client-1',
  }

  const client = {
    id: 'client-1',
    name: 'Cliente do Terreno',
    document: '000.000.000-00',
    phone: '(85) 90000-0000',
    email: 'cliente@contratopay.com',
    address: 'Lote 00, Loteamento Exemplo',
    status: 'ativo' as const,
    notes: 'Contrato de venda de terreno.',
    createdAt: now(),
    updatedAt: now(),
  }

  const financingStart = '2026-06-15'
  const downStart = addMonths(financingStart, -12) // entrada nos 12 meses anteriores

  const contract: Contract = {
    id: 'contract-1',
    clientId: 'client-1',
    title: 'Venda de Terreno — Lote 00',
    totalValue: 350000,
    downPaymentValue: 17500,
    downPaymentInstallments: 12,
    downPaymentStartDate: downStart,
    financedValue: 332500,
    financingInstallments: 60,
    financingStartDate: financingStart,
    firstInstallmentDueDate: '2026-06-22', // 1ª parcela vence 22/06; demais no dia 15
    baseInstallmentValue: 5541.67,
    correctionType: 'ipca_anual',
    correctionBaseDate: '2026-06-15',
    correctionFrequencyMonths: 12,
    status: 'ativo',
    internalNotes:
      'Carência até o início do financiamento. Parcela 13 inicia no valor base, sem IPCA acumulado.',
    clientNotes:
      'Bem-vindo! Aqui você acompanha suas parcelas, o saldo do contrato e pode simular pagamentos extras para reduzir as próximas parcelas.',
    forecastAnnualIpca: 0.05,
    createdAt: now(),
    updatedAt: now(),
  }

  const pixKey: PixKey = {
    id: 'pix-1',
    contractId: 'contract-1',
    pixKey: 'admin@local',
    receiverName: 'Fernando Silva',
    bankName: 'Banco do Brasil',
    activeFrom: financingStart,
    activeUntil: null,
    status: 'ativa',
    createdAt: now(),
  }

  // Pagamentos já realizados: apenas as 12 parcelas da entrada.
  // A parcela 13 (1ª do financiamento) ainda está em aberto, vence 22/06.
  const payments: Payment[] = []
  const downValue = Math.round((17500 / 12) * 100) / 100
  for (let i = 1; i <= 12; i++) {
    payments.push({
      id: `pay-entrada-${i}`,
      contractId: 'contract-1',
      installmentType: 'entrada',
      installmentNumber: i,
      paymentDate: addMonths(downStart, i - 1),
      amount: downValue,
      amortizationAmount: 0,
      paymentType: 'pix',
      pixKeyId: 'pix-1',
      receiptUrl: null,
      status: 'pago',
      notes: '',
      createdBy: 'user-admin',
      createdAt: now(),
    })
  }

  return {
    users: [adminUser, clientUser],
    clients: [client],
    contracts: [contract],
    payments,
    corrections: [],
    pixKeys: [pixKey],
    auditLogs: [
      {
        id: 'log-1',
        userId: 'user-admin',
        contractId: 'contract-1',
        action: 'contrato_criado',
        description: 'Contrato de venda de terreno cadastrado.',
        createdAt: now(),
      },
    ],
  }
}
