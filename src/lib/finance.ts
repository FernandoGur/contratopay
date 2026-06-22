// ============================================================================
// Engine de cálculo financeiro — núcleo do sistema.
//
// Modelo (validado contra a especificação do contrato):
//  - Sem juros embutidos. Parcela base = saldo financiado / nº de parcelas.
//  - Cada parcela paga abate o seu valor cheio do saldo devedor.
//  - Correção anual (IPCA): na data-base + k·12 meses,
//        saldo_corrigido = saldo × (1 + ipca)
//        nova_parcela    = saldo_corrigido / parcelas_vincendas
//  - Amortização extra: novo_saldo = saldo − extra ;
//        nova_parcela = novo_saldo / parcelas_vincendas
//    (mantendo o prazo e reduzindo o valor das parcelas — modo padrão).
//
// Tudo é DERIVADO de: definição do contrato + eventos (pagamentos, amortizações,
// correções oficiais). Nada de valor de parcela é "congelado" — é recalculado,
// o que mantém o sistema correto para contratos de formatos diferentes.
// ============================================================================

import { addMonths, compareISO, type ISODate } from './dates'

export type InstallmentType = 'entrada' | 'financiamento'

export interface ContractCalcInput {
  financedValue: number // saldo financiado (ex.: 332500)
  financingInstallments: number // nº de parcelas do financiamento (ex.: 60)
  downPaymentInstallments: number // nº de parcelas da entrada (ex.: 12)
  financingStartDate: ISODate // cadência mensal das parcelas do financiamento (ex.: dia 15)
  correctionBaseDate: ISODate // data-base da correção (ex.: 2026-06-15)
  correctionFrequencyMonths: number // periodicidade (ex.: 12)
  /** Vencimento específico da 1ª parcela, quando difere da cadência (opcional). */
  firstInstallmentDueDate?: ISODate
}

/** Correção IPCA oficial já aplicada (índice real), por ordem de correção (1, 2, 3…). */
export type OfficialCorrections = Record<number, number> // { 1: 0.05 } -> 5%

/** Amortização extra aplicada, indexada pelo número da parcela em que foi paga. */
export type AppliedAmortizations = Record<number, number> // { 13: 5000 }

export interface ScheduleOptions {
  /** Conjunto de números de parcela já pagas (assume-se sequencial a partir do início). */
  paid?: Set<number>
  /** Correções IPCA oficiais já aplicadas. */
  officialCorrections?: OfficialCorrections
  /** Amortizações já aplicadas, por número de parcela. */
  amortizations?: AppliedAmortizations
  /** IPCA anual previsto (decimal, ex.: 0.05) usado para correções ainda não oficiais. */
  forecastAnnualIpca?: number
  /** Data de referência ("hoje") para classificar vencidas. */
  today?: ISODate
}

export type InstallmentStatus = 'paga' | 'vencida' | 'a_vencer'

export interface ScheduleRow {
  number: number
  type: InstallmentType
  dueDate: ISODate
  value: number
  /** Saldo devedor logo antes do vencimento desta parcela. */
  balanceBefore: number
  /** Saldo devedor após abater esta parcela (e eventual amortização). */
  balanceAfter: number
  status: InstallmentStatus
  /** Correção aplicada nesta data, se houver. */
  correction?: { index: number; ipca: number; isOfficial: boolean }
  /** Amortização extra aplicada nesta parcela, se houver. */
  amortization?: number
}

export interface CorrectionEvent {
  index: number
  date: ISODate
  ipca: number
  isOfficial: boolean
  fromInstallment: number
  balanceBefore: number
  balanceAfter: number
  previousInstallment: number
  newInstallment: number
  installmentsAffected: number
}

export interface ScheduleResult {
  rows: ScheduleRow[]
  corrections: CorrectionEvent[]
  /** Soma de todas as parcelas do financiamento (com correções aplicadas/previstas). */
  totalProjected: number
  /** Soma sem nenhuma correção (= valor financiado, pois não há juros). */
  totalWithoutCorrection: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Gera o cronograma completo do financiamento, aplicando correções anuais
 * (oficiais quando disponíveis, previstas caso contrário) e amortizações.
 */
export function generateSchedule(
  contract: ContractCalcInput,
  opts: ScheduleOptions = {},
): ScheduleResult {
  const {
    paid = new Set<number>(),
    officialCorrections = {},
    amortizations = {},
    forecastAnnualIpca = 0,
    today,
  } = opts

  const nFin = contract.financingInstallments
  const firstNumber = contract.downPaymentInstallments + 1
  const freq = contract.correctionFrequencyMonths || 12

  let balance = contract.financedValue
  let installment = contract.financedValue / nFin // parcela base
  let remaining = nFin // parcelas vincendas (incluindo a corrente)
  let sumExact = 0 // soma das parcelas em precisão total (p/ resíduo de arredondamento)

  // Próxima data de correção = data-base + frequência.
  let nextCorrectionDate = addMonths(contract.correctionBaseDate, freq)
  let correctionIndex = 0

  const rows: ScheduleRow[] = []
  const corrections: CorrectionEvent[] = []

  for (let i = 0; i < nFin; i++) {
    const number = firstNumber + i
    // 1ª parcela pode ter vencimento próprio; as demais seguem a cadência mensal.
    const dueDate =
      i === 0 && contract.firstInstallmentDueDate
        ? contract.firstInstallmentDueDate
        : addMonths(contract.financingStartDate, i)

    // 1) Correção anual, se vencer nesta data (ou antes dela).
    let correctionForRow: ScheduleRow['correction']
    if (compareISO(dueDate, nextCorrectionDate) >= 0) {
      correctionIndex += 1
      const official = officialCorrections[correctionIndex]
      const isOfficial = official != null
      const ipca = isOfficial ? official : forecastAnnualIpca
      const previousInstallment = installment
      const balanceBeforeCorr = balance
      balance = balance * (1 + ipca)
      installment = remaining > 0 ? balance / remaining : 0
      correctionForRow = { index: correctionIndex, ipca, isOfficial }
      corrections.push({
        index: correctionIndex,
        date: dueDate,
        ipca,
        isOfficial,
        fromInstallment: number,
        balanceBefore: round2(balanceBeforeCorr),
        balanceAfter: round2(balance),
        previousInstallment: round2(previousInstallment),
        newInstallment: round2(installment),
        installmentsAffected: remaining,
      })
      nextCorrectionDate = addMonths(nextCorrectionDate, freq)
    }

    const balanceBefore = balance
    const value = installment
    sumExact += value

    // 2) Abate a parcela do saldo.
    balance = balance - value
    remaining -= 1

    // 3) Amortização extra aplicada nesta parcela (recalcula as vincendas).
    //    Invariante: nunca excede o saldo restante (não deixa o saldo negativo).
    const extraAmort = Math.max(0, Math.min(amortizations[number] ?? 0, balance))
    if (extraAmort > 0) {
      balance = balance - extraAmort
      installment = remaining > 0 ? balance / remaining : 0
    }

    let status: InstallmentStatus = 'a_vencer'
    if (paid.has(number)) status = 'paga'
    else if (today && compareISO(dueDate, today) < 0) status = 'vencida'

    rows.push({
      number,
      type: 'financiamento',
      dueDate,
      value: round2(value),
      balanceBefore: round2(balanceBefore),
      balanceAfter: round2(balance),
      status,
      correction: correctionForRow,
      amortization: extraAmort > 0 ? round2(extraAmort) : undefined,
    })
  }

  // Política de arredondamento: a última parcela absorve o resíduo de centavos,
  // garantindo que a soma das parcelas exibidas == round2(soma em precisão total).
  // Ex.: financiamento base → parcelas 13–71 = R$ 5.541,67 e a 72 = R$ 5.541,47.
  if (rows.length > 0) {
    const sumDisplayed = rows.reduce((s, r) => s + r.value, 0)
    const residual = round2(round2(sumExact) - sumDisplayed)
    if (Math.abs(residual) >= 0.01) {
      // Deposita o resíduo na ÚLTIMA parcela com valor > 0 — não em parcelas que
      // ficaram ZERADAS por amortização total antes do fim (senão exibiria valor
      // negativo, ex.: −R$ 0,03). A soma continua == totalProjected.
      let idx = rows.length - 1
      while (idx > 0 && rows[idx].value <= 0) idx--
      rows[idx].value = round2(rows[idx].value + residual)
    }
  }

  const totalProjected = round2(rows.reduce((s, r) => s + r.value, 0))
  return {
    rows,
    corrections,
    totalProjected,
    totalWithoutCorrection: round2(contract.financedValue),
  }
}

/** Gera as parcelas da entrada (sem correção). */
export function generateDownPaymentRows(
  contract: { downPaymentValue: number; downPaymentInstallments: number; downPaymentStartDate: ISODate },
  opts: { paid?: Set<number>; today?: ISODate } = {},
): ScheduleRow[] {
  const { paid = new Set<number>(), today } = opts
  const n = contract.downPaymentInstallments
  const value = round2(contract.downPaymentValue / n)
  const rows: ScheduleRow[] = []
  let acc = contract.downPaymentValue
  for (let i = 0; i < n; i++) {
    const number = i + 1
    const dueDate = addMonths(contract.downPaymentStartDate, i)
    const balanceBefore = acc
    acc = round2(acc - value)
    let status: InstallmentStatus = 'a_vencer'
    if (paid.has(number)) status = 'paga'
    else if (today && compareISO(dueDate, today) < 0) status = 'vencida'
    rows.push({
      number,
      type: 'entrada',
      dueDate,
      value,
      balanceBefore: round2(balanceBefore),
      balanceAfter: acc,
      status,
    })
  }
  return rows
}

export interface ContractState {
  /** Saldo devedor do financiamento na situação atual (após pagamentos/amortizações realizados). */
  currentBalance: number
  /** Valor da próxima parcela do financiamento em aberto. */
  currentInstallmentValue: number
  /** Número da próxima parcela do financiamento em aberto (ou null se quitado). */
  nextInstallmentNumber: number | null
  nextInstallmentDueDate: ISODate | null
  /** Parcelas (entrada + financiamento) por status. */
  paidCount: number
  openCount: number
  overdueCount: number
  /** Quantas parcelas do financiamento ainda faltam (vincendas). */
  financingRemaining: number
  totalPaid: number
  totalAmortized: number
  /** Total em aberto previsto (financiamento) considerando correções. */
  totalOpenProjected: number
  /** Total previsto do financiamento com IPCA (parcelas pagas + futuras). */
  totalProjectedWithIpca: number
  /** Total do financiamento sem IPCA (= valor financiado). */
  totalWithoutIpca: number
  /** Próxima correção prevista (data e índice), se houver. */
  nextCorrection: { date: ISODate; index: number } | null
}

/**
 * Calcula o estado atual do contrato a partir do cronograma e dos pagamentos.
 * Assume pagamentos sequenciais (parcela paga = todas anteriores pagas), o que
 * reflete o fluxo real de cobrança mensal.
 */
export function computeContractState(
  contract: ContractCalcInput & {
    downPaymentValue: number
    downPaymentStartDate: ISODate
  },
  schedule: ScheduleResult,
  downRows: ScheduleRow[],
): ContractState {
  const finRows = schedule.rows
  const today = undefined

  const paidFin = finRows.filter((r) => r.status === 'paga')
  const openFin = finRows.filter((r) => r.status !== 'paga')
  const paidDown = downRows.filter((r) => r.status === 'paga')

  const nextOpen = openFin[0] ?? null

  // Saldo atual = valor PRESENTE das parcelas do financiamento ainda em aberto.
  // Principal de hoje por parcela = saldo que entra na próxima parcela ÷ total de
  // parcelas a partir dela; o saldo é (parcelas em aberto) × esse principal.
  // (Não subtrai o `value` NOMINAL das parcelas antecipadas — esse valor carrega
  // o IPCA futuro embutido, o que misturava dimensões e fazia o saldo divergir
  // da simulação de antecipação. No pagamento sequencial dá exatamente o saldo
  // que entra na próxima parcela, como antes.)
  let currentBalance = contract.financedValue
  if (nextOpen) {
    const vincendas = finRows.filter((r) => r.number >= nextOpen.number).length
    const principalHoje = vincendas > 0 ? nextOpen.balanceBefore / vincendas : 0
    // Amortizações já pagas no ponto atual ou à frente ainda NÃO estão embutidas
    // em nextOpen.balanceBefore (o cronograma as aplica depois da parcela), mas
    // já reduziram o que o cliente deve — descontam do saldo atual.
    const amortAhead = finRows
      .filter((r) => r.number >= nextOpen.number)
      .reduce((s, r) => s + (r.amortization ?? 0), 0)
    currentBalance = Math.max(0, openFin.length * principalHoje - amortAhead)
  } else if (paidFin.length > 0) {
    currentBalance = 0 // tudo quitado
  }
  const totalAmortized = round2(
    finRows.reduce((s, r) => s + (r.amortization ?? 0), 0),
  )
  const totalPaidFin = round2(paidFin.reduce((s, r) => s + r.value, 0))
  const totalPaidDown = round2(paidDown.reduce((s, r) => s + r.value, 0))

  const overdue = [...finRows, ...downRows].filter((r) => r.status === 'vencida').length
  const open = [...finRows, ...downRows].filter((r) => r.status !== 'paga').length
  const paidCount = paidFin.length + paidDown.length

  const nextCorrection = schedule.corrections.find(
    (c) => c.fromInstallment >= (nextOpen?.number ?? Infinity),
  )

  void today
  return {
    currentBalance: round2(currentBalance),
    currentInstallmentValue: nextOpen ? nextOpen.value : 0,
    nextInstallmentNumber: nextOpen ? nextOpen.number : null,
    nextInstallmentDueDate: nextOpen ? nextOpen.dueDate : null,
    paidCount,
    openCount: open,
    overdueCount: overdue,
    financingRemaining: openFin.length,
    totalPaid: round2(totalPaidFin + totalPaidDown),
    totalAmortized,
    totalOpenProjected: round2(openFin.reduce((s, r) => s + r.value, 0)),
    totalProjectedWithIpca: schedule.totalProjected,
    totalWithoutIpca: round2(contract.financedValue),
    nextCorrection: nextCorrection
      ? { date: nextCorrection.date, index: nextCorrection.index }
      : null,
  }
}

/** Contribuição de cada reajuste para o desconto (IPCA evitado pelo pagamento extra). */
export interface DiscountStep {
  index: number
  date: ISODate
  ipca: number
  /** Número do período (bloco de 12 meses) a que este reajuste dá início. */
  periodNumber: number
  /** Saldo devedor projetado no período (após a correção), SEM o pagamento extra. */
  balanceBase: number
  /** Saldo devedor projetado no período (após a correção), COM o pagamento extra. */
  balanceWithExtra: number
  /** Parcela do período SEM o pagamento extra. */
  installmentBase: number
  /** Parcela do período COM o pagamento extra. */
  installmentWithExtra: number
  /** IPCA que deixa de incidir neste reajuste por causa do extra. */
  avoidedIpca: number
}

export interface ExtraPaymentSimulation {
  currentInstallment: number
  extra: number
  totalToPayNow: number
  balanceBefore: number
  balanceAfter: number
  currentInstallmentEstimate: number
  newInstallmentEstimate: number
  monthlySavings: number
  /** Economia simples (sem IPCA): equivale ao valor amortizado distribuído. */
  totalSavingsSimple: number
  /** Economia bruta (quanto cai a soma das parcelas futuras) considerando o IPCA. */
  totalSavingsWithIpca: number
  /** Economia líquida real = IPCA evitado (bruto − valor extra adiantado). */
  netIpcaSavings: number
  /** Quebra do desconto por reajuste anual. */
  discountBreakdown: DiscountStep[]
  newTotalProjected: number
}

/**
 * Simula um pagamento extra (amortização) aplicado JUNTO da próxima parcela em aberto.
 * Reaproveita a engine: roda o cronograma com e sem a amortização e compara.
 */
export function simulateExtraPayment(
  contract: ContractCalcInput,
  baseOpts: ScheduleOptions,
  rawExtra: number,
): ExtraPaymentSimulation {
  const baseSchedule = generateSchedule(contract, baseOpts)
  const openFin = baseSchedule.rows.filter((r) => r.status !== 'paga')
  const target = openFin[0]

  // Saldo em aberto CIENTE de antecipações: o cronograma pressupõe pagamento
  // sequencial, então target.balanceBefore conta também as parcelas já quitadas
  // antecipadamente (lá no fim). O principal de hoje por parcela é o saldo do
  // ponto ÷ slots originais (incluindo as antecipadas) = exatamente o valor da
  // parcela; o saldo em aberto real é (parcelas abertas) × esse principal. Mesma
  // base do computeContractState — mantém Início, simulação e parcelas coerentes.
  const slotsFromTarget = target
    ? baseSchedule.rows.filter((r) => r.number >= target.number).length
    : 0
  const principalToday = target && slotsFromTarget > 0 ? target.balanceBefore / slotsFromTarget : 0
  const amortAhead = target
    ? baseSchedule.rows
        .filter((r) => r.number >= target.number)
        .reduce((s, r) => s + (r.amortization ?? 0), 0)
    : 0
  const openBalance = round2(Math.max(0, openFin.length * principalToday - amortAhead))

  // O extra é um pagamento à PARTE da parcela do mês. No máximo ele zera o
  // saldo que sobra DEPOIS da parcela atual (saldo − parcela).
  const maxExtra = target ? Math.max(0, openBalance - principalToday) : 0
  // Sem parcela em aberto (contrato quitado) não há o que amortizar: extra = 0
  // (antes retornava o valor digitado, sugerindo "pague R$ X" com saldo zero).
  const extra = target ? Math.max(0, Math.min(rawExtra, maxExtra)) : 0

  if (!target || extra <= 0) {
    const cur = round2(principalToday)
    return {
      currentInstallment: cur,
      extra: round2(Math.max(extra, 0)),
      totalToPayNow: round2(cur + Math.max(extra, 0)),
      balanceBefore: openBalance,
      balanceAfter: openBalance,
      currentInstallmentEstimate: cur,
      newInstallmentEstimate: cur,
      monthlySavings: 0,
      totalSavingsSimple: 0,
      totalSavingsWithIpca: 0,
      netIpcaSavings: 0,
      discountBreakdown: [],
      newTotalProjected: baseSchedule.totalProjected,
    }
  }

  // Fórmula da especificação (visão do cliente — seção 13):
  //   saldo_atual = saldo devedor em aberto antes da parcela do mês
  //   vincendas   = parcelas do financiamento em aberto (incluindo a atual)
  //   nova_parcela = (saldo_atual − extra) / vincendas
  const vincendas = openFin.length
  const balanceBefore = openBalance
  const balanceAfter = balanceBefore - extra
  const currentInstallmentEstimate = balanceBefore / vincendas
  const newInstallmentEstimate = balanceAfter / vincendas

  // Economia total considerando o IPCA previsto: compara o cronograma completo
  // com e sem a amortização (propaga o efeito sobre as correções futuras).
  const withAmort = generateSchedule(contract, {
    ...baseOpts,
    amortizations: { ...(baseOpts.amortizations ?? {}), [target.number]: extra },
  })
  const totalSavingsWithIpca = round2(
    baseSchedule.totalProjected - withAmort.totalProjected,
  )

  // Quebra do desconto: em cada reajuste, o IPCA que deixa de incidir porque o
  // saldo está menor (efeito do pagamento extro propagando ano a ano).
  const discountBreakdown: DiscountStep[] = baseSchedule.corrections.map((cb) => {
    const ca = withAmort.corrections.find((x) => x.index === cb.index)
    // Diferença pré-correção define o IPCA evitado neste reajuste.
    const diffPre = cb.balanceBefore - (ca ? ca.balanceBefore : cb.balanceBefore)
    return {
      index: cb.index,
      date: cb.date,
      ipca: cb.ipca,
      periodNumber: cb.index + 1, // o 1º período (carência) não tem reajuste
      balanceBase: round2(cb.balanceAfter),
      balanceWithExtra: round2(ca ? ca.balanceAfter : cb.balanceAfter),
      installmentBase: round2(cb.newInstallment),
      installmentWithExtra: round2(ca ? ca.newInstallment : cb.newInstallment),
      avoidedIpca: round2(diffPre * cb.ipca),
    }
  })

  return {
    currentInstallment: round2(target.value),
    extra: round2(extra),
    totalToPayNow: round2(target.value + extra),
    balanceBefore: round2(balanceBefore),
    balanceAfter: round2(balanceAfter),
    currentInstallmentEstimate: round2(currentInstallmentEstimate),
    newInstallmentEstimate: round2(newInstallmentEstimate),
    monthlySavings: round2(currentInstallmentEstimate - newInstallmentEstimate),
    totalSavingsSimple: round2(extra),
    totalSavingsWithIpca,
    netIpcaSavings: round2(Math.max(0, totalSavingsWithIpca - extra)),
    discountBreakdown,
    newTotalProjected: withAmort.totalProjected,
  }
}

export interface AnticipateLastSimulation {
  /** Quantas das últimas parcelas estão sendo quitadas. */
  count: number
  maxCount: number
  /** Valor da parcela hoje (sem o IPCA futuro). */
  currentInstallment: number
  /** Quanto o cliente paga hoje para quitar essas últimas parcelas. */
  payToday: number
  /** Valor cheio dessas parcelas no futuro, já com o IPCA previsto. */
  futureValueWithIpca: number
  /** Desconto = IPCA que deixa de ser pago (futuro com IPCA − pago hoje). */
  ipcaDiscount: number
  /** Número da nova última parcela após a antecipação. */
  newLastInstallmentNumber: number | null
  newLastInstallmentDate: ISODate | null
  /** Saldo devedor após a quitação das últimas parcelas. */
  balanceAfter: number
  /** Parcelas do financiamento que continuam em aberto. */
  remainingAfter: number
}

/**
 * Simula a antecipação (quitação) das ÚLTIMAS parcelas com desconto do IPCA
 * que ainda não foi aplicado a elas. Reduz o PRAZO (paga menos parcelas) em vez
 * de reduzir o valor das próximas.
 *
 * Modelo: cada parcela vale hoje `saldo / vincendas` (em principal). Quitar a
 * última parcela custa esse valor de hoje; o que se economiza é todo o IPCA que
 * incidiria sobre ela ao longo dos próximos reajustes.
 */
export function simulateAnticipateLast(
  contract: ContractCalcInput,
  baseOpts: ScheduleOptions,
  count: number,
): AnticipateLastSimulation {
  const baseSchedule = generateSchedule(contract, baseOpts)
  const openFin = baseSchedule.rows.filter((r) => r.status !== 'paga')
  const maxCount = openFin.length

  // Principal de hoje por parcela CIENTE de antecipações: saldo do ponto ÷ slots
  // ORIGINAIS a partir da próxima em aberto (inclui as já antecipadas), e NÃO ÷
  // parcelas abertas. Dividir por maxCount (só abertas) superfaturava o valor de
  // hoje quando já havia antecipações — cobrando a mais e gerando "desconto"
  // negativo. Mesma base do computeContractState (saldo atual da tela Início).
  const slotsFromTarget = openFin[0]
    ? baseSchedule.rows.filter((r) => r.number >= openFin[0].number).length
    : 0
  const principalToday = openFin[0] && slotsFromTarget > 0 ? openFin[0].balanceBefore / slotsFromTarget : 0
  const amortAhead = openFin[0]
    ? baseSchedule.rows
        .filter((r) => r.number >= openFin[0].number)
        .reduce((s, r) => s + (r.amortization ?? 0), 0)
    : 0
  const openBalance = round2(Math.max(0, maxCount * principalToday - amortAhead))

  const empty: AnticipateLastSimulation = {
    count: 0,
    maxCount,
    currentInstallment: round2(principalToday),
    payToday: 0,
    futureValueWithIpca: 0,
    ipcaDiscount: 0,
    newLastInstallmentNumber: openFin.length ? openFin[openFin.length - 1].number : null,
    newLastInstallmentDate: openFin.length ? openFin[openFin.length - 1].dueDate : null,
    balanceAfter: openBalance,
    remainingAfter: maxCount,
  }
  if (!openFin.length || count <= 0) return empty

  const k = Math.min(Math.floor(count), maxCount)
  const currentInstallment = principalToday // valor de hoje (principal)
  const payToday = currentInstallment * k

  const lastK = openFin.slice(maxCount - k)
  const futureValueWithIpca = lastK.reduce((s, r) => s + r.value, 0)
  const ipcaDiscount = futureValueWithIpca - payToday

  const remainingAfter = maxCount - k
  const newLast = remainingAfter > 0 ? openFin[remainingAfter - 1] : null

  return {
    count: k,
    maxCount,
    currentInstallment: round2(currentInstallment),
    payToday: round2(payToday),
    futureValueWithIpca: round2(futureValueWithIpca),
    ipcaDiscount: round2(ipcaDiscount),
    newLastInstallmentNumber: newLast ? newLast.number : null,
    newLastInstallmentDate: newLast ? newLast.dueDate : null,
    balanceAfter: round2(openBalance - payToday),
    remainingAfter,
  }
}

/** Agrupa o cronograma em blocos anuais (12 parcelas) para a tabela de previsão. */
export interface YearBlock {
  yearIndex: number
  label: string
  fromNumber: number
  toNumber: number
  fromDate: ISODate
  toDate: ISODate
  installmentValue: number
  hasCorrection: boolean
  /** Estimativa de IPCA aplicada no início deste ano (0 quando não há correção). */
  ipca: number
  /** A correção do ano já é índice oficial (true) ou apenas previsto (false). */
  ipcaOfficial: boolean
  /** Saldo devedor previsto no início do ano (após a correção, se houver). */
  balanceStart: number
  /** Saldo devedor previsto no fim do ano. */
  balanceEnd: number
  blockTotal: number
}

/**
 * Saldo devedor REAL em aberto depois de uma parcela, ciente de antecipações.
 *
 * O cronograma pressupõe pagamento sequencial, então `balanceAfter` de cada
 * linha conta TODAS as parcelas seguintes — inclusive as que o cliente já
 * quitou antecipadamente (as últimas). Aqui contamos só as parcelas que ainda
 * estão EM ABERTO depois desta. Pela identidade do modelo (saldo = nº de
 * parcelas restantes × valor da parcela do período), o saldo em aberto é
 * (parcelas abertas depois desta) × valor desta parcela.
 */
export function openBalanceAfter(rows: ScheduleRow[], row: ScheduleRow): number {
  const openAfter = rows.filter(
    (r) => r.type === row.type && r.number > row.number && r.status !== 'paga',
  ).length
  return round2(openAfter * row.value)
}

/** Há alguma parcela em aberto ANTES desta (do mesmo tipo)? Indica que esta foi
 *  paga fora de ordem (antecipação das últimas), não no fluxo sequencial. */
export function isAnticipated(rows: ScheduleRow[], row: ScheduleRow): boolean {
  return (
    row.status === 'paga' &&
    rows.some((r) => r.type === row.type && r.number < row.number && r.status !== 'paga')
  )
}

/** Correção (interface da CorrectionEvent) já ciente de antecipações: o nº de
 *  parcelas afetadas e o saldo consideram só as parcelas EM ABERTO. Reajustes
 *  que só afetariam parcelas já quitadas são removidos. */
export interface ProjectedCorrection extends CorrectionEvent {
  /** Parcelas em aberto afetadas (exclui antecipadas/quitadas). */
  installmentsOpen: number
  /** Saldo em aberto antes/depois do reajuste (ciente de antecipações). */
  openBalanceBefore: number
  openBalanceAfter: number
}

export function projectOpenCorrections(schedule: ScheduleResult): ProjectedCorrection[] {
  const rows = schedule.rows
  return schedule.corrections
    .map((c) => {
      const open = rows.filter(
        (r) => r.type === 'financiamento' && r.number >= c.fromInstallment && r.status !== 'paga',
      ).length
      return {
        ...c,
        installmentsOpen: open,
        openBalanceBefore: round2(open * c.previousInstallment),
        openBalanceAfter: round2(open * c.newInstallment),
      }
    })
    .filter((c) => c.installmentsOpen > 0)
}

export function summarizeByYear(schedule: ScheduleResult, freq = 12): YearBlock[] {
  const rows = schedule.rows
  const blocks: YearBlock[] = []
  for (let start = 0; start < rows.length; start += freq) {
    const chunk = rows.slice(start, start + freq)
    if (chunk.length === 0) break
    const yearIndex = start / freq + 1
    const corrected = chunk.find((r) => r.correction)
    blocks.push({
      yearIndex,
      label: yearIndex === 1 ? '1º ano' : `${yearIndex}º ano`,
      fromNumber: chunk[0].number,
      toNumber: chunk[chunk.length - 1].number,
      fromDate: chunk[0].dueDate,
      toDate: chunk[chunk.length - 1].dueDate,
      installmentValue: chunk[0].value,
      hasCorrection: Boolean(corrected),
      ipca: corrected?.correction?.ipca ?? 0,
      ipcaOfficial: corrected?.correction?.isOfficial ?? false,
      balanceStart: chunk[0].balanceBefore,
      balanceEnd: chunk[chunk.length - 1].balanceAfter,
      blockTotal: round2(chunk.reduce((s, r) => s + r.value, 0)),
    })
  }
  return blocks
}
