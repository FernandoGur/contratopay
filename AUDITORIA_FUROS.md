Vou produzir o relatório de auditoria a partir dos furos confirmados. Primeiro, vou deduplificar os furos equivalentes e ordená-los por severidade.

# Relatório de Auditoria — ContratoPay

Auditor-chefe · 2026-06-20 · 14 furos confirmados, consolidados em 11 itens após dedup

Linha condutora: a esmagadora maioria dos furos pertence a UMA única classe-raiz — **funções e telas que leem campos crus do cronograma (`balanceBefore`, `balanceAfter`, `value`, `installmentsAffected`, `!isAnticipated`) que pressupõem pagamento estritamente sequencial**. A correção `openBalance/openBalanceAfter/projectOpenCorrections` foi aplicada apenas a `computeContractState` e à aba do cliente, mas NÃO propagada às funções de simulação (`simulateAnticipateLast`, `simulateExtraPayment`), ao gráfico de previsão, nem ao admin. Tudo abaixo decorre disso, mais quatro furos independentes (composição da carteira, amortização invisível, colisão de comprovantes, parseReceiptNotes).

---

## SEVERIDADE ALTA

### 1. `simulateAnticipateLast` superfatura e gera "desconto" negativo / overcharge ao antecipar após antecipações prévias
**Severidade:** alta
**Arquivo:** `src/lib/finance.ts:537-557` (consumido em `src/pages/client/ClientArea.tsx:1330-1347` AnteciparSim/`copyTotal` e `:1550` ParcelasTab)

> Dedup: consolida os dois primeiros furos confirmados ("desconto negativo" e "overcharge de R$27,7 mil"). São o mesmo defeito — divisor errado em `simulateAnticipateLast` — manifestado em count parcial vs. count total.

**Cenário que dispara:** Cliente já antecipou parcelas finais fora de ordem (ex.: #68..#72 pagas) e usa "Antecipar pagamentos" para quitar parte (count parcial) ou tudo (count = maxCount) do miolo ainda aberto.

**Esperado vs. atual:**
- Esperado: `currentInstallment` = saldo real em aberto / nº de slots originais a partir da próxima aberta = 332.500 / 60 = **5.541,67/parcela**. Quitar tudo → `payToday == state.currentBalance` (304.791,67). `ipcaDiscount` positivo.
- Atual: usa `balanceNow = openFin[0].balanceBefore` (332.500, saldo CHEIO que conta as parcelas já pagas no fim) dividido por `maxCount = openFin.length` (só as abertas, 55). Resultado `currentInstallment = 6.045,45`. Quitar tudo cobra **332.500 vs. saldo real 304.791,67 → overcharge de R$ 27.708,33**. Em count parcial sob IPCA, `ipcaDiscount` fica negativo (cliente paga MAIS que o valor futuro corrigido; com IPCA=0 a prova limpa dá −R$ 5.541,65 = uma parcela inteira a mais). O botão "Copiar total a pagar" copia exatamente esse `payToday` inflado.

**Correção recomendada:** Em `simulateAnticipateLast`, derivar o principal-de-hoje da mesma forma que `computeContractState` (finance.ts:307-310): `principalHoje = nextOpen.balanceBefore / vincendas`, onde `vincendas` = nº de linhas com `number >= nextOpen.number` (inclui as já pagas no fim), NÃO `openFin.length`. `payToday = principalHoje * k`. Idealmente extrair um helper único compartilhado com `computeContractState` para garantir consistência.

---

### 2. `simulateExtraPayment` (amortizar) usa saldo cheio quando há antecipações, inflando saldo/parcela estimada
**Severidade:** alta
**Arquivo:** `src/lib/finance.ts:431-435,466-472` (ReduzirSim em `src/pages/client/ClientArea.tsx:1040,1176-1180,1235`)

**Cenário que dispara:** 5 últimas parcelas antecipadas (#68..#72). Cliente vai em "Reduzir valor das parcelas" e simula amortizar R$ 50.000 (ou usa o modo "Escolher a parcela").

**Esperado vs. atual:**
- Esperado: `balanceBefore` = 304.791,67; `currentInstallmentEstimate` = 304.791,67/55 = 5.541,67; `balanceAfter` (amort. 50k) = 254.791,67.
- Atual: usa `target.balanceBefore` cru = 332.500 (conta as 5 já pagas). `currentInstallmentEstimate` = 6.045,45; `balanceAfter` = 282.500. **Contradição na própria tela:** o card "Escolher a parcela" mostra parcela atual 5.541,67 (vindo de `state`), enquanto "hoje é {currentInstallmentEstimate}" mostra 6.045,45 para a mesma parcela. No modo "Escolher a parcela", o cliente pede parcela de R$ 5.000 e o headline "Sua nova parcela ficaria" exibe R$ 5.503,79 — diferente do pedido.

**Correção recomendada:** Não usar `target.balanceBefore` cru. Derivar `balanceBefore` do saldo ciente de antecipação (`state.currentBalance` / `openBalanceAfter`) e as estimativas de parcela de `openFin.length × principalHoje` como em `computeContractState`. Garantir que o modo "Escolher a parcela" recalcule o headline a partir do alvo solicitado.

---

### 3. Gráfico "Saldo a cada aniversário" (Previsão) ignora pagamentos sequenciais — barra mostra saldo cheio mesmo com parcelas já pagas
**Severidade:** alta
**Arquivo:** `src/pages/client/ClientArea.tsx:1906-1915` (`openCountFrom` usa `!isAnticipated`; `finance.ts:602` `isAnticipated`)

**Cenário que dispara:** Cliente paga normalmente (em ordem) as parcelas #13–#30. Abre a aba Previsão e vê `SaldoDevedorChart`.

**Esperado vs. atual:**
- Esperado: barra do Ano 1 reflete só parcelas com `status !== 'paga'`, coerente com "Saldo atual" da Início e o anel "% quitado".
- Atual: `openCountFrom` conta toda parcela com `number >= fromNumber` que NÃO seja `isAnticipated`. Mas `isAnticipated` (finance.ts:602) só é `true` para pagamento FORA de ordem; parcelas pagas em ordem têm `status='paga'` mas `isAnticipated=false`, e continuam contadas. A barra do Ano 1 mostra o financiamento cheio (~332.500) contra Saldo atual de ~232.750–244.387 — **superestimação de ~R$ 88–100 mil**, contradizendo a tela Início para o mesmo contrato.

**Correção recomendada:** Trocar o filtro `!isAnticipated` por `status !== 'paga'` (a mesma base já usada em `computeContractState` e `openBalanceAfter`). Remover/atualizar o comentário (linhas 1903-1905) que assume "sem antecipação ⇒ saldo planejado".

---

### 4. Amortização na próxima parcela aberta não reduz o saldo exibido (`currentBalance`) na Início
**Severidade:** alta
**Arquivo:** `src/lib/finance.ts:306-313` (computeContractState); consumido em `src/pages/client/ClientArea.tsx:366`

**Cenário que dispara:** Admin usa o modo "Só amortização" do ReviewReceiptModal (`ContractDetail.tsx:843-849`), que chama `recordAmortization` com `applyAtInstallment = openFin[0].number` (#13, a próxima aberta, NÃO quitada). `getContractCalc` monta `amortizations={13:50000}` com `paid` vazio.

**Esperado vs. atual:**
- Esperado: "Em aberto" cai de 332.500 para ~282.500, coerente com o `simulateExtraPayment` (balanceAfter=282.500) e com a queda real do cronograma.
- Atual: `currentBalance` permanece **332.500 (variação 0)**. A Início exibe simultaneamente "Amortizado R$ 50.000,00" e "Em aberto R$ 332.500,00" — autocontraditório. Causa: `nextOpen.balanceBefore` é capturado ANTES de aplicar a amortização da própria linha (finance.ts:162 vs. 172-176). Prova: `totalOpenProjected` cai corretamente (367.454 → 312.109) e a #14 cai de 5.541,67 para 4.694,21 — só `currentBalance`/`currentInstallmentValue` ficam defasados.

**Correção recomendada:** Derivar `currentBalance` e `currentInstallmentValue` do estado PÓS-amortização da próxima linha (usar `balanceAfter` ciente de amortização, ou recomputar `currentBalance` a partir de `totalOpenProjected`/soma das parcelas abertas, que já reflete corretamente a amortização). Alternativamente, capturar `balanceBefore` da próxima linha após aplicar a amortização que incide nela.

---

### 5. `submitReceipt` usa chave (tipo,número) com slot único — recibo comum, amortizar e quitar colidem e se sobrescrevem silenciosamente
**Severidade:** alta
**Arquivo:** `src/lib/repo.ts:650-690` (submitReceipt) + `src/pages/client/ClientArea.tsx:639-648` (PixBlock) e `:882-895` (RequestComprovante)

**Cenário que dispara:** Cliente anexa o comprovante da parcela do mês (PixBlock, alvo `state.nextInstallmentNumber`) e depois, antes da validação, anexa um pedido de amortizar/quitar (RequestComprovante, alvo `openFin[0].number`). Como `nextInstallmentNumber === openFin[0].number`, os três fluxos miram a MESMA parcela.

**Esperado vs. atual:**
- Esperado: cada solicitação distinta coexiste como registro independente; nenhum upload apaga outro comprovante aguardando validação.
- Atual: só existe 1 slot por (tipo,número). `submitReceipt` acha o `existing` e sobrescreve `receiptUrl`+`notes`. O segundo upload destrói o primeiro; o anterior some da UI (PixBlock filtra registros sem intent; RequestComprovante só mostra o intent que bate). **O vendedor nunca chega a ver a solicitação clobberada e o cliente vê o comprovante anterior desaparecer.** Reproduzido nos 3 sentidos (recibo→amortizar, amortizar→quitar, quitar→recibo).

**Correção recomendada:** Não usar (tipo,número) como chave única para comprovantes pendentes. Adicionar à chave o discriminador de intent/modo (ou um id próprio do request), permitindo múltiplos registros `comprovante_enviado` coexistirem para a mesma parcela. Em `submitReceipt`, criar novo registro em vez de sobrescrever quando o intent diferir do existente.

---

## SEVERIDADE MÉDIA

### 6. Card "Quite a última parcela" (ParcelasTab) calcula payToday sobre saldo cheio após antecipação
**Severidade:** média
**Arquivo:** `src/pages/client/ClientArea.tsx:1547-1577` (`lastSim = simulateAnticipateLast(...,1)`)

> Mesma causa-raiz do furo #1 (`simulateAnticipateLast` com divisor errado), porém em outro ponto de consumo (count=1, card de quitar a última). Mantido separado por ser tela/correção distinta, mas será resolvido pelo mesmo fix do item #1.

**Cenário que dispara:** 5 últimas antecipadas (#68..#72); a "última em aberto" passa a ser #67. ParcelasTab roda `simulateAnticipateLast(...,1)`.

**Esperado vs. atual:**
- Esperado: `payToday` da #67 = principal real ~5.541,67.
- Atual: `payToday = 6.045,45` (overcharge de R$ 503,78) e `ipcaDiscount` subnotificado (690,48 em vez de ~1.194,26). Contradiz a Início, que diz que a parcela vale 5.541,67.

**Correção recomendada:** Resolvido automaticamente pela correção do item #1 (`simulateAnticipateLast` com divisor = vincendas totais). Adicionar teste cobrindo count=1 sob antecipação.

---

### 7. Admin Cronograma exibe `r.balanceAfter` cru (conta parcelas já antecipadas) em vez de `openBalanceAfter`
**Severidade:** média
**Arquivo:** `src/pages/admin/ContractDetail.tsx:342-344` (coluna "Saldo após")

**Cenário que dispara:** 5 últimas antecipadas (#68..#72). Admin abre a aba Cronograma.

**Esperado vs. atual:**
- Esperado: "Saldo após" a #13 = `openBalanceAfter` = 299.250,18 (mesma lógica já corrigida no cliente).
- Atual: mostra `r.balanceAfter` cru = 326.958,33 (inclui as 5 quitadas no fim). 59 de 60 linhas divergem; linhas já quitadas mostram saldo positivo. Incoerência com o card Resumo "Saldo devedor atual" (304.791,67, que usa `state.currentBalance`). Bug de exibição, sem afetar cobrança.

**Correção recomendada:** Importar e aplicar `openBalanceAfter(rows, r)` para linhas de financiamento na coluna "Saldo após" do admin, exatamente como já é feito na aba do cliente (`ClientArea.tsx:1676-1679`).

---

### 8. Amortização avulsa num ponto JÁ PAGO é cobrada do cliente mas não abate nada do saldo em aberto
**Severidade:** média
**Arquivo:** `src/lib/finance.ts:170-176` e `:314-316`; `recordAmortization` em `src/lib/repo.ts:595-624`; gatilho em `src/pages/admin/ContractDetail.tsx:688-690` (PaymentModal)

**Cenário que dispara:** Cliente antecipou #63..#72. Admin lança amortização avulsa via PaymentModal numa parcela já paga (#63) — `recordAmortization` aceita `applyAtInstallment` arbitrário e o PaymentModal usa `row.number` sem checar `row.status === 'paga'`.

**Esperado vs. atual:**
- Esperado: amortização reduz o saldo em aberto, OU é realocada para a próxima aberta, OU é rejeitada.
- Atual: o abatimento incide numa linha fora do conjunto aberto; `currentBalance`/`totalOpenProjected` não mudam (Δ0), mas `totalAmortized` exibe R$ 20.000. Cliente paga, tela credita "Amortizado", saldo idêntico — **dinheiro sem contrapartida**.
- Ressalva: o caminho via comprovante (ReviewReceiptModal, ContractDetail.tsx:843-845) JÁ é defensivo (usa `openFin[0].number`); o vetor real é o lançamento manual do admin via PaymentModal.

**Correção recomendada:** Em `recordAmortization` (repo.ts:602) rejeitar ou realocar `applyAtInstallment` que aponte para parcela com `status === 'paga'`. No PaymentModal (ContractDetail.tsx:688-690) bloquear amortização em parcela paga ou redirecioná-la para `openFin[0].number`. Em `generateSchedule` (finance.ts:172), ignorar amortizações em linhas já pagas (ou ao menos não contabilizá-las em `totalAmortized`).

---

### 9. Composição da carteira na Início não fecha quando há parcelas da ENTRADA ainda abertas
**Severidade:** média
**Arquivo:** `src/pages/client/ClientArea.tsx:347-372`; `src/lib/finance.ts:306-313` (`currentBalance` só do financiamento)

**Cenário que dispara:** Entrada parcial paga (6/12), financiamento intocado — estado que todo contrato atravessa no 1º ano. Cliente vê o HERO ("Pago" · "Em aberto" · anel).

**Esperado vs. atual:**
- Esperado: "Pago" + "Em aberto" = total do contrato (350.000).
- Atual: `state.currentBalance` é só o saldo do FINANCIAMENTO; não inclui o principal das parcelas de entrada abertas. Pago (8.749,98) + Em aberto (332.500) = 341.249,98 ≠ 350.000 → **gap de R$ 8.750**. Anel/barra usam `pctPaid = totalPaid/totalValue` (2%) enquanto o rótulo "Em aberto" representa 95% — barra e número não correspondem.

**Correção recomendada:** Incluir o principal das parcelas de entrada em aberto no "Em aberto" exibido (ou usar um saldo total do contrato que some entrada + financiamento abertos). Garantir que `pctPaid` + `pct em aberto` componham 100% do total do contrato.

---

### 10. Antecipação sob deflação (IPCA previsto/oficial negativo) mostra "desconto" negativo como economia
**Severidade:** média
**Arquivo:** `src/lib/finance.ts:543` (`ipcaDiscount = futureValueWithIpca - payToday`) e `src/pages/client/ClientArea.tsx:1444-1461`

**Cenário que dispara:** `forecastAnnualIpca` negativo (admin aceita valor negativo sem `min` em Contracts.tsx:188) OU correção oficial negativa (repo.ts:1116). Cliente abre "Antecipar pagamentos" > "Quitar últimas parcelas".

**Esperado vs. atual:**
- Esperado: com saldo futuro corrigido MENOR que o valor de hoje, antecipar é desvantajoso — ocultar quando `ipcaDiscount <= 0` (como os guards inline em ClientArea.tsx:1556 e 1683 já fazem).
- Atual: o painel principal exibe `sim.ipcaDiscount` cru em verde com "Desconto de IPCA (você economiza)" e o valor futuro riscado (line-through), embora ele seja MENOR que o "paga hoje". Cliente induzido a pagar mais hoje (55.416,67) que o valor futuro real (45.137,23), com "desconto" de −10.279,44 apresentado como ganho.

**Correção recomendada:** Aplicar o mesmo guard `ipcaDiscount > 0` do painel principal AnteciparSim (ClientArea.tsx:1444-1461): ocultar/desabilitar a oferta de antecipação quando o desconto for ≤ 0, ou exibir aviso de que antecipar é desvantajoso. Adicionalmente, validar IPCA mínimo nos inputs do admin (Contracts.tsx:188, ContractDetail.tsx:199) se deflação não for um caso de negócio suportado.

---

## SEVERIDADE BAIXA

### 11. Admin: correções IPCA mostram `installmentsAffected` cru, contando parcelas já antecipadas
**Severidade:** baixa
**Arquivo:** `src/pages/admin/ContractDetail.tsx:559-561` (usa `c.installmentsAffected`/`c.fromInstallment` crus)

**Cenário/Esperado vs. atual:** Cliente antecipou parcelas dentro do horizonte de uma correção. Esperado: usar `projectOpenCorrections` (`installmentsOpen`) como no cliente. Atual: exibe `installmentsAffected` cru (assume sequencial) — admin vê 12 parcelas afetadas quando só 6 estão em aberto. Apenas exibição; nenhum valor monetário errado.

**Correção recomendada:** Importar `projectOpenCorrections` (finance.ts:620-635) em ContractDetail e exibir `installmentsOpen` em vez de `c.installmentsAffected`, como já feito em ClientArea.tsx:1785,1879.

---

### 12. Divergência sistemática de centavos (~R$ 0,20) entre "Saldo atual" e saldo reconstruído de Minhas parcelas
**Severidade:** baixa
**Arquivo:** `src/lib/finance.ts:306-330` (`currentBalance` em precisão total) vs. `:593-598` (`openBalanceAfter` usa `value` já arredondado)

**Cenário/Esperado vs. atual:** `currentBalance = openFin.length × principalHoje` (divisão em precisão total, um único round2) dá 332.500,00; a reconstrução `next.value + openBalanceAfter(next)` (com `value` já arredondado) dá 332.500,20. Diferença fixa de ~R$ 0,20, visível só se o usuário somar mentalmente parcela + saldo-após de duas telas. Sem impacto em cobrança real.

**Correção recomendada:** Unificar a política de arredondamento: derivar `currentBalance` da MESMA base que `openBalanceAfter` (soma de `value` já arredondados das parcelas abertas), ou vice-versa, para que as duas telas batam centavo a centavo. Baixa prioridade (cosmético).

---

### 13. `parseReceiptNotes` descarta o nome do arquivo quando o JSON tem intent corrompido/sem `mode`
**Severidade:** baixa
**Arquivo:** `src/lib/requests.ts:24-36`

**Cenário/Esperado vs. atual:** `notes` é JSON válido começando com `{` mas sem `intent.mode` (ex.: `{"file":"x","intent":{"amount":10}}`). O guard `o.intent && o.intent.mode` falha e cai em `return { file: raw }`, colocando o BLOB JSON inteiro como nome do arquivo na UI. Só ocorre por corrupção externa de dados (o produtor `encodeReceiptNotes` nunca gera esse estado); impacto puramente cosmético.

**Correção recomendada:** Antes do fallback final, se `o.file` for string, retornar `{ file: o.file }` mesmo sem `intent.mode` válido, recuperando o nome real. Tratar `intent` como opcional/parcial em vez de exigir `mode` para extrair `file`.

---

### 14. Previsão assume rígido 12 meses e ignora `correctionFrequencyMonths != 12`
**Severidade:** baixa
**Arquivo:** `src/lib/finance.ts:637` (`summarizeByYear`, freq=12 default) e call sites `src/pages/admin/ContractDetail.tsx:495` + `src/pages/client/ClientArea.tsx:1900`

**Cenário/Esperado vs. atual:** Contrato com `correctionFrequencyMonths` ≠ 12 (ex.: 6 semestral). A engine honra o campo, mas `summarizeByYear` é chamado sem `freq`, agrupando em blocos de 12 e escondendo reajustes intra-bloco (mês 6 e 12). Textos "a cada 12 meses" (ClientArea.tsx:1797) são literais. **Defeito latente:** nenhum fluxo atual produz freq ≠ 12 (form fixa 12, sem UI de edição); só dispara via import/insert externo. Impacto real nulo hoje.

**Correção recomendada:** Passar `contract.correctionFrequencyMonths` para `summarizeByYear` em ambos os call sites e tornar os textos "a cada X meses" dinâmicos. Baixa prioridade até existir UI/dado que gere freq ≠ 12.

---

## Por que a auditoria anterior não pegou

1. **Correção aplicada só parcialmente.** O fix de antecipação fora de ordem (`openBalance`/`openBalanceAfter`/`projectOpenCorrections`) foi aplicado a `computeContractState` e à aba do cliente, e a auditoria anterior provavelmente validou só esses pontos. As funções de simulação (`simulateAnticipateLast` finance.ts:537-557; `simulateExtraPayment` :431-472), o gráfico de previsão (ClientArea.tsx:1906) e TODO o admin (ContractDetail.tsx:342,495,559) ficaram com a leitura crua de cronograma — mesma classe de furo, pontos não inspecionados. Furos #1, #2, #3, #6, #7, #11.

2. **Seed mascara o cenário.** O contrato-seed quita a entrada 100% antes do financiamento e não tem antecipações fora de ordem nem freq ≠ 12. Os furos #1–#8, #9 e #14 só se manifestam em estados que o seed nunca atinge (antecipação parcial das últimas, entrada parcial sobreposta, deflação, semestral). Testes baseados no seed passam.

3. **Falta de testes cross-view.** Nenhum teste comparava o mesmo número entre telas distintas (Início vs. Previsão, Início vs. Minhas parcelas, Resumo admin vs. Cronograma admin, simulador vs. saldo). Furos #3, #4, #7, #9 e #12 são contradições entre telas, invisíveis a testes unitários por função isolada.

4. **Sequência temporal de uploads não testada.** O furo #5 (colisão de comprovantes) só aparece com dois uploads na mesma parcela antes da validação. Testes que validam cada upload isoladamente nunca observam a sobrescrita.

5. **Inputs de borda não fuzzados.** Furos #8 (`applyAtInstallment` em parcela paga), #10 (IPCA negativo) e #13 (JSON corrompido) exigem entradas fora do caminho feliz — o admin aceita IPCA negativo sem `min`, `recordAmortization` aceita qualquer parcela, e `parseReceiptNotes` recebe dado corrompido. Nenhum era exercitado.

## Lacunas de cobertura a fechar

1. **Suíte de invariantes sob antecipação fora de ordem.** Para CADA função que lê o cronograma (`simulateAnticipateLast`, `simulateExtraPayment`, gráficos, todas as colunas do admin), testar com últimas N parcelas pagas fora de ordem e assertar coerência com `computeContractState`. Esta única suíte pega #1, #2, #3, #6, #7, #11.

2. **Testes cross-view (consistência entre telas).** Assertar que o mesmo número bate entre: Início ↔ Previsão (saldo por aniversário), Início ↔ Minhas parcelas (saldo reconstruído), Resumo admin ↔ Cronograma admin, simulador ↔ `currentBalance`. Pega #3, #4, #7, #12.

3. **Property test do invariante de fechamento da carteira.** Assertar sempre `Pago + EmAberto == totalValue` (entrada + financiamento), em qualquer estado de entrada/financiamento. Pega #9.

4. **Auditoria de unicidade/colisão de comprovantes.** Testar uploads sequenciais de intents distintos na mesma parcela antes da validação; assertar que nenhum registro pendente é destruído. Pega #5.

5. **Validação de entradas de borda.** Fuzz/edge tests para IPCA negativo, `applyAtInstallment` em parcela paga, e `notes` com JSON corrompido. Adicionar guards/validação na origem (inputs do admin, `recordAmortization`, `parseReceiptNotes`). Pega #8, #10, #13.

6. **Cobrir configurações não-default.** Testar `correctionFrequencyMonths != 12` e, idealmente, bloquear a persistência de valores não suportados até existir UI/agrupamento correto. Pega #14.

7. **Princípio estrutural — fonte única de verdade do saldo.** Extrair UM helper canônico de "principal de hoje / saldo em aberto / parcela atual" ciente de antecipação e amortização, e fazer TODAS as funções (simuladores, gráficos, admin) consumirem-no, em vez de cada uma reimplementar a leitura do cronograma. Elimina a classe-raiz por construção, não por correção pontual.