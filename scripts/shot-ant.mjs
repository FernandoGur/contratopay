import { chromium } from 'playwright'
const browser = await chromium.launch()
const mctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
const m = await mctx.newPage()
await m.goto('http://localhost:5173/cliente/contract-1')
await m.waitForLoadState('networkidle')
await m.getByRole('button', { name: 'Pagar a mais', exact: true }).click()
await m.waitForTimeout(300)
await m.getByText('Quitar últimas parcelas').click()
await m.waitForTimeout(400)
await m.screenshot({ path: '/tmp/shot-ant-1.png', fullPage: true })
for (let i = 0; i < 5; i++) {
  await m.getByRole('button', { name: '+', exact: true }).click()
  await m.waitForTimeout(120)
}
await m.waitForTimeout(400)
await m.screenshot({ path: '/tmp/shot-ant-6.png', fullPage: true })
await browser.close()
console.log('done')
