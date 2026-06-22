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

  const financingStart = '2026-07-01' // vencimentos no dia 01; 1ª parcela 01/07/2026
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
    baseInstallmentValue: 5541.67,
    correctionType: 'ipca_anual',
    // Base = 1ª parcela: 1º reajuste 12 meses depois (01/07/2027).
    correctionBaseDate: '2026-07-01',
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
    pixKey: 'fernandogutemberggomes@gmail.com',
    receiverName: 'Fernando Silva',
    bankName: 'Banco do Brasil',
    activeFrom: financingStart,
    activeUntil: null,
    status: 'ativa',
    createdAt: now(),
  }

  // Histórico real da entrada: 12 parcelas quitadas em 6 pagamentos (pares).
  // A parcela 13 (1ª do financiamento) ainda está em aberto, vence 22/06.
  const payments: Payment[] = []
  const entradaPagamentos: { date: string; parcelas: [number, number]; valores: [number, number] }[] = [
    { date: '2025-07-14', parcelas: [1, 2], valores: [1458.33, 1458.33] },
    { date: '2025-08-30', parcelas: [3, 4], valores: [1458.33, 1458.33] },
    { date: '2025-09-30', parcelas: [5, 6], valores: [1458.33, 1458.33] },
    { date: '2025-10-29', parcelas: [7, 8], valores: [1458.33, 1458.33] },
    { date: '2025-11-28', parcelas: [9, 10], valores: [1458.33, 1458.33] },
    { date: '2026-01-30', parcelas: [11, 12], valores: [1458.35, 1458.35] },
  ]
  for (const pg of entradaPagamentos) {
    pg.parcelas.forEach((num, idx) => {
      payments.push({
        id: `pay-entrada-${num}`,
        contractId: 'contract-1',
        installmentType: 'entrada',
        installmentNumber: num,
        paymentDate: pg.date,
        amount: pg.valores[idx],
        amortizationAmount: 0,
        paymentType: 'pix',
        pixKeyId: 'pix-1',
        receiptUrl: null,
        status: 'pago',
        notes: `Pago junto com a parcela ${pg.parcelas[idx === 0 ? 1 : 0]}`,
        createdBy: 'user-admin',
        createdAt: now(),
      })
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
