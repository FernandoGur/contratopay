import {
  computeContractState,
  simulateAnticipateLast,
  simulateExtraPayment,
  generateSchedule,
  generateDownPaymentRows,
  type ContractCalcInput,
  type ScheduleOptions,
} from './src/lib/finance'

const contract = {
  financedValue: 332500,
  financingInstallments: 60,
  downPaymentInstallments: 12,
  financingStartDate: '2026-07-15',
  correctionBaseDate: '2026-06-15',
  correctionFrequencyMonths: 12,
  downPaymentValue: 60000,
  downPaymentStartDate: '2026-06-15',
} satisfies ContractCalcInput & { downPaymentValue: number; downPaymentStartDate: string }

// The financing installments are numbered 13..72 (after 12 down payments).
// Amortization of 30000 applied at installment 13 (which is PAID).
// To match the scenario: installment 13 paid + amortization recorded there.

function run(label: string, opts: ScheduleOptions) {
  const sched = generateSchedule(contract, opts)
  const downRows = generateDownPaymentRows(contract, {
    paid: new Set(Array.from({ length: contract.downPaymentInstallments }, (_, i) => i + 1)),
  })
  const state = computeContractState(contract, sched, downRows)
  const maxCount = sched.rows.filter(
    (r) => r.type === 'financiamento' && r.status !== 'paga',
  ).length
  const simAll = simulateAnticipateLast(contract, opts, maxCount)
  console.log(`\n=== ${label} ===`)
  console.log('currentBalance      :', state.currentBalance)
  console.log('sim.payToday (all)  :', simAll.payToday)
  console.log('sim.currentInstall  :', simAll.currentInstallment)
  console.log('sim.balanceAfter    :', simAll.balanceAfter)
  console.log('sim.ipcaDiscount    :', simAll.ipcaDiscount)
  console.log('diff payToday-cb    :', Math.round((simAll.payToday - state.currentBalance) * 100) / 100)
}

// CASE 1 (baseline, no amortization): pay installment 13 only.
run('CASE 1 baseline (paid 13, no amort)', { paid: new Set([13]) })

// CASE 2: amortization 30000 at installment 13, installment 13 paid.
run('CASE 2 (amort 30k at #13, paid 13)', {
  paid: new Set([13]),
  amortizations: { 13: 30000 },
})

// CASE 3: amort 30k at #13 + prior anticipation of last installments 68..72.
run('CASE 3 (amort 30k + anticip 68..72)', {
  paid: new Set([13, 68, 69, 70, 71, 72]),
  amortizations: { 13: 30000 },
})

// CASE 4: amortization recorded at the FIRST OPEN installment (#14 open, #13 paid),
// so amortAhead != 0. This is the path where double-subtraction could occur.
run('CASE 4 (amort 30k at OPEN #14, paid 13)', {
  paid: new Set([13]),
  amortizations: { 14: 30000 },
})

// CASE 5: amortization at open #14 + prior anticipation 68..72.
run('CASE 5 (amort 30k at open #14 + anticip 68..72)', {
  paid: new Set([13, 68, 69, 70, 71, 72]),
  amortizations: { 14: 30000 },
})

// Contrast: simulateExtraPayment on CASE 2 to see if it has the bug.
const simExtra = simulateExtraPayment(contract, { paid: new Set([13]), amortizations: { 13: 30000 } }, 1000)
console.log('\n=== simulateExtraPayment CASE2 balanceBefore (should == currentBalance 302500) ===')
console.log('balanceBefore       :', simExtra.balanceBefore)
