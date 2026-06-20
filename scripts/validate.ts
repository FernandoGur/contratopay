// Validação da engine contra os números publicados na especificação.
import {
  generateSchedule,
  simulateExtraPayment,
  summarizeByYear,
  type ContractCalcInput,
} from '../src/lib/finance'

const contract: ContractCalcInput = {
  financedValue: 332500,
  financingInstallments: 60,
  downPaymentInstallments: 12,
  financingStartDate: '2026-06-15',
  correctionBaseDate: '2026-06-15',
  correctionFrequencyMonths: 12,
}

let pass = 0
let fail = 0
function check(label: string, got: number, expected: number, tol = 0.05) {
  const ok = Math.abs(got - expected) <= tol
  console.log(`${ok ? '  OK ' : 'FAIL'} | ${label.padEnd(46)} got=${got.toFixed(2).padStart(12)} esp=${expected.toFixed(2).padStart(12)}`)
  ok ? pass++ : fail++
}

// --- Simulação conservadora IPCA 5% a.a. ---
const sched = generateSchedule(contract, { forecastAnnualIpca: 0.05 })
const blocks = summarizeByYear(sched)

console.log('\n== Valores mensais por bloco (IPCA 5%) ==')
check('Bloco 1 (13-24) parcela', blocks[0].installmentValue, 5541.67)
check('Bloco 2 (25-36) parcela', blocks[1].installmentValue, 5818.75)
check('Bloco 3 (37-48) parcela', blocks[2].installmentValue, 6109.69)
check('Bloco 4 (49-60) parcela', blocks[3].installmentValue, 6415.17)
check('Bloco 5 (61-72) parcela', blocks[4].installmentValue, 6735.93)

console.log('\n== Totais por bloco ==')
check('Total bloco 1', blocks[0].blockTotal, 66500.04)
check('Total bloco 2', blocks[1].blockTotal, 69825.0)
check('Total bloco 3', blocks[2].blockTotal, 73316.28)
check('Total bloco 4', blocks[3].blockTotal, 76982.04)
check('Total bloco 5', blocks[4].blockTotal, 80831.16)

console.log('\n== Total geral ==')
check('Total previsto financiamento (5%)', sched.totalProjected, 367454.52)
check('Total geral com entrada', sched.totalProjected + 17500, 384954.52)

// --- Amortização (seção 13): parcela 13 paga, saldo 326.958,33, extra 5.000 ---
console.log('\n== Simulação de pagamento extra (parcela 13 paga) ==')
const sim = simulateExtraPayment(
  contract,
  { paid: new Set([1,2,3,4,5,6,7,8,9,10,11,12,13]), forecastAnnualIpca: 0 },
  5000,
)
check('Parcela atual', sim.currentInstallment, 5541.67)
check('Total a pagar hoje', sim.totalToPayNow, 10541.67)
check('Saldo antes', sim.balanceBefore, 326958.33)
check('Novo saldo após extra', sim.balanceAfter, 321958.33)
check('Nova parcela estimada', sim.newInstallmentEstimate, 5456.92)
check('Economia mensal estimada', sim.monthlySavings, 84.75)
check('Economia total (simples)', sim.totalSavingsSimple, 5000.0, 1)

console.log(`\n=== ${pass} OK, ${fail} FAIL ===`)
if (fail > 0) process.exit(1)
