// ============================================================================
// Auditoria financeira determinística — ContratoPay
// Reconcilia o contrato de referência e valida invariantes da engine.
// Esperado vs Encontrado, comparação exata em centavos.
// ============================================================================
import {
  generateSchedule,
  generateDownPaymentRows,
  computeContractState,
  simulateExtraPayment,
  type ContractCalcInput,
} from '../src/lib/finance'

const cents = (v: number) => Math.round(v * 100)
let pass = 0
let fail = 0
const fails: string[] = []
function check(label: string, got: number, esp: number, tolCents = 0) {
  const ok = Math.abs(cents(got) - cents(esp)) <= tolCents
  console.log(`${ok ? '  OK ' : 'FAIL'} | ${label.padEnd(52)} got=${got.toFixed(2).padStart(13)} esp=${esp.toFixed(2).padStart(13)}`)
  ok ? pass++ : (fail++, fails.push(label))
}
function checkBool(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  OK ' : 'FAIL'} | ${label.padEnd(52)} ${detail}`)
  ok ? pass++ : (fail++, fails.push(label))
}

// Contrato de referência (igual ao seed) ------------------------------------
const contract: ContractCalcInput & { downPaymentValue: number; downPaymentStartDate: string } = {
  financedValue: 332500,
  financingInstallments: 60,
  downPaymentInstallments: 12,
  financingStartDate: '2026-06-15',
  firstInstallmentDueDate: '2026-06-22',
  correctionBaseDate: '2026-06-15',
  correctionFrequencyMonths: 12,
  downPaymentValue: 17500,
  downPaymentStartDate: '2025-06-15',
}

console.log('\n=== 1. ENTRADA (pagamentos reais) ===')
const entradaPg = [2916.66, 2916.66, 2916.66, 2916.66, 2916.66, 2916.70]
const entradaTotal = entradaPg.reduce((s, v) => s + v, 0)
check('Soma dos 6 pagamentos da entrada', entradaTotal, 17500.0)
check('Saldo financiado (total - entrada)', 350000 - 17500, 332500.0)

console.log('\n=== 2. GERAÇÃO DAS PARCELAS (sem IPCA) ===')
const base = generateSchedule(contract, { forecastAnnualIpca: 0 })
const somaParcelas = base.rows.reduce((s, r) => s + r.value, 0)
check('Parcela base exibida (13)', base.rows[0].value, 5541.67)
check('Qtd parcelas financiamento', base.rows.length, 60)
check('SOMA das 60 parcelas EXIBIDAS = principal', somaParcelas, 332500.0)
check('totalWithoutCorrection', base.totalWithoutCorrection, 332500.0)
check('Saldo interno após última parcela (deve ~0)', base.rows[59].balanceAfter, 0.0, 1)

console.log('\n=== 3. DATAS DOS CICLOS / VENCIMENTOS ===')
checkBool('Parcela 13 vence 22/06/2026', base.rows[0].dueDate === '2026-06-22', base.rows[0].dueDate)
checkBool('Parcela 14 vence 15/07/2026 (cadência dia 15)', base.rows[1].dueDate === '2026-07-15', base.rows[1].dueDate)
checkBool('Parcela 24 vence 15/05/2027 (fim 1º ciclo)', base.rows[11].dueDate === '2027-05-15', base.rows[11].dueDate)

console.log('\n=== 4. IPCA CONSERVADOR 5% ===')
const s5 = generateSchedule(contract, { forecastAnnualIpca: 0.05 })
check('Parcela 13-24 (1º ciclo, sem correção)', s5.rows[0].value, 5541.67)
check('Parcela 25-36 (2º ciclo)', s5.rows[12].value, 5818.75)
check('Parcela 37-48 (3º ciclo)', s5.rows[24].value, 6109.69)
check('Parcela 49-60 (4º ciclo)', s5.rows[36].value, 6415.17)
check('Parcela 61-72 (5º ciclo)', s5.rows[48].value, 6735.93)
// Após a política de arredondamento (última parcela absorve o resíduo), o total
// é o valor EXATO da soma das parcelas, não a soma inflada dos arredondamentos.
// Publicado (inflado): 367.454,52 → exato: 367.454,48 (diferença R$ 0,04 explicada).
check('Total financiamento c/ IPCA 5% (exato)', s5.totalProjected, 367454.48)
check('Total geral (financiamento + entrada)', s5.totalProjected + 17500, 384954.48)
checkBool('1ª correção na parcela 25', s5.corrections[0]?.fromInstallment === 25, `#${s5.corrections[0]?.fromInstallment}`)
checkBool('1ª correção em 15/06/2027', s5.corrections[0]?.date === '2027-06-15', s5.corrections[0]?.date)
checkBool('Nº de correções no horizonte', s5.corrections.length === 4, `${s5.corrections.length} correções (esp. 4)`)
checkBool('Parcela 13 SEM correção (carência)', !s5.rows[0].correction, '')
check('Saldo pré-1ª correção (parc.24 abatida)', s5.corrections[0].balanceBefore, 266000.0, 1)
check('Saldo pós-1ª correção (×1,05)', s5.corrections[0].balanceAfter, 279300.0, 1)

console.log('\n=== 5. AMORTIZAÇÃO (cenário seção 18) — parcela 13 paga, extra 5000 ===')
const paid13 = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13])
const sim = simulateExtraPayment(contract, { paid: paid13, forecastAnnualIpca: 0.05 }, 5000)
check('Saldo antes', sim.balanceBefore, 326958.33, 1)
check('Novo saldo (saldo - extra)', sim.balanceAfter, 321958.33, 1)
check('Nova parcela estimada (÷59)', sim.newInstallmentEstimate, 5456.92, 1)
check('Economia mensal', sim.monthlySavings, 84.75, 1)
check('Economia simples = valor amortizado', sim.totalSavingsSimple, 5000.0, 1)
checkBool('Economia líquida (IPCA evitado) > 0', sim.netIpcaSavings > 0, `R$ ${sim.netIpcaSavings.toFixed(2)}`)
checkBool('Economia líquida NÃO inclui o extra', sim.netIpcaSavings < 5000, `R$ ${sim.netIpcaSavings.toFixed(2)}`)

console.log('\n=== 6. INVARIANTES / EDGE CASES ===')
const simZero = simulateExtraPayment(contract, { paid: paid13, forecastAnnualIpca: 0.05 }, 0)
checkBool('Extra = 0 não altera saldo', cents(simZero.balanceAfter) === cents(simZero.balanceBefore), '')
const simNeg = simulateExtraPayment(contract, { paid: paid13, forecastAnnualIpca: 0.05 }, -1000)
checkBool('Extra NEGATIVO não aumenta o saldo (invariante)', simNeg.balanceAfter <= simNeg.balanceBefore + 0.001,
  `antes=${simNeg.balanceBefore.toFixed(2)} depois=${simNeg.balanceAfter.toFixed(2)}`)
const saldoAtual = simZero.balanceBefore
const simOver = simulateExtraPayment(contract, { paid: paid13, forecastAnnualIpca: 0.05 }, saldoAtual + 50000)
checkBool('Extra > saldo NÃO gera parcela negativa (invariante)', simOver.newInstallmentEstimate >= 0,
  `nova parcela=${simOver.newInstallmentEstimate.toFixed(2)}`)
checkBool('Extra > saldo NÃO gera saldo negativo (invariante)', simOver.balanceAfter >= 0,
  `saldo depois=${simOver.balanceAfter.toFixed(2)}`)

console.log('\n=== 7. ESTADO DO CONTRATO (seed atual: entrada paga, parc.13 em aberto) ===')
const paidDown = new Set([1,2,3,4,5,6,7,8,9,10,11,12])
const sched = generateSchedule(contract, { paid: new Set(), forecastAnnualIpca: 0.05, today: '2026-06-21' })
const downRows = generateDownPaymentRows(contract, { paid: paidDown, today: '2026-06-21' })
const state = computeContractState(contract, sched, downRows)
check('Saldo devedor atual (nenhuma fin. paga)', state.currentBalance, 332500.0)
check('Próxima parcela (#13)', state.currentInstallmentValue, 5541.67)
checkBool('Próxima parcela é a #13', state.nextInstallmentNumber === 13, `#${state.nextInstallmentNumber}`)
checkBool('Próxima correção prevista 15/06/2027', state.nextCorrection?.date === '2027-06-15', state.nextCorrection?.date)

console.log('\n=== 8. RECONCILIAÇÃO DO SALDO ===')
// financedValue - principal pago - amort = saldo (sem fin pago => 332500)
const principalPagoFin = 0
const saldoRecon = 332500 - principalPagoFin
check('Reconciliação saldo (sem fin pago)', saldoRecon, state.currentBalance)

console.log('\n=== 9. ARREDONDAMENTO / ARTEFATOS FLOAT ===')
const temArtefato = s5.rows.some((r) => {
  const c = r.value * 100
  return Math.abs(c - Math.round(c)) > 1e-6 || Number.isNaN(r.value) || !Number.isFinite(r.value)
})
checkBool('Nenhum valor exibido com >2 casas / NaN / Infinity', !temArtefato, '')
checkBool('Nenhum saldo exibido negativo', s5.rows.every((r) => r.balanceAfter >= -0.005), '')

console.log(`\n================ ${pass} OK, ${fail} FAIL ================`)
if (fails.length) {
  console.log('Falhas:')
  fails.forEach((f) => console.log('  - ' + f))
}
