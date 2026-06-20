import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const base = 'http://localhost:5173'

async function shot(name) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: `/tmp/shot-${name}.png`, fullPage: true })
  console.log('shot', name)
}

// Login
await page.goto(base)
await page.waitForLoadState('networkidle')
await shot('1-login')

// Vendedor
await page.getByRole('button', { name: 'Vendedor' }).click()
await page.waitForURL('**/admin')
await shot('2-dashboard')
await page.getByText('Venda de Terreno').first().click()
await page.waitForTimeout(600)
await shot('3-contrato-resumo')

// Área do cliente (mobile)
const mctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
const m = await mctx.newPage()
await m.goto(base + '/cliente/contract-1')
await m.waitForLoadState('networkidle')
await m.waitForTimeout(600)
await m.screenshot({ path: '/tmp/shot-c-inicio.png', fullPage: true })
console.log('shot c-inicio')

async function mtab(label, name) {
  await m.getByRole('button', { name, exact: true }).click()
  await m.waitForTimeout(500)
  await m.screenshot({ path: `/tmp/shot-c-${label}.png`, fullPage: true })
  console.log('shot c-' + label)
}
await mtab('parcelas', 'Minhas parcelas')
await mtab('pagamentos', 'Pagamentos')
await mtab('previsao', 'Previsão')
await mtab('contrato', 'Meu contrato')

// Simulador modo reduzir
await m.getByRole('button', { name: 'Pagar a mais', exact: true }).click()
await m.waitForTimeout(300)
await m.getByPlaceholder('Ex.: 5.000,00').fill('5.000,00')
await m.waitForTimeout(500)
await m.screenshot({ path: '/tmp/shot-c-simular.png', fullPage: true })
console.log('shot c-simular')

// Simulador modo antecipar
await m.getByText('Quitar últimas parcelas').click()
await m.waitForTimeout(500)
await m.screenshot({ path: '/tmp/shot-c-antecipar.png', fullPage: true })
console.log('shot c-antecipar')

await browser.close()
console.log('done')
