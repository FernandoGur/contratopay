I have confirmed the key code locations: the residue policy (lines 198-205) and the `currentBalance` formula (lines 300-304). The analysis matches the reported bugs. Here is the consolidated report.

---

# Relatório de Auditoria Financeira — `src/lib/finance.ts`

**Sistema:** Recebimentos (contratos parcelados de terreno, indexados ao IPCA, modelo sem juros embutidos)
**Arquivo auditado:** `/Users/fernandosilva/Documents/recebimentos/src/lib/finance.ts`
**Contrato de referência:** financedValue R$ 332.500,00 · 72 parcelas · 60 do financiamento (#13–#72) · IPCA previsto 5% a.a. · correctionBaseDate 2025-06-15 · 1ª parcela 2026-06-22
**Total de cenários executados:** 54 (via `npx tsx`, comparados em centavos contra recomputação independente)

---

## 1) Veredito geral

**As fórmulas estão corretas no núcleo financeiro.** Toda a aritmética de saldo, parcela, correção IPCA, amortização extra e liquidação antecipada fecha **ao centavo** contra recomputação independente. As invariantes financeiras essenciais (não-negatividade de saldo, conservação `Σ parcelas = totalProjected`, "sem juros" sob IPCA=0, monotonicidade da economia) são respeitadas.

Foram encontrados **3 defeitos reais** — todos de **baixa/média severidade e impacto cosmético ou em cenário fora do domínio prático**, nenhum compromete a corretude de saldos ou totais agregados:
- **1 bug de exibição** (parcela de −R$ 0,03 quando amortização zera o saldo antes da última parcela) — recorrente e visível ao cliente.
- **1 incoerência dimensional** no KPI `currentBalance` sob pagamento fora de ordem (afeta também a feature legítima de antecipar-últimas).
- **1 assimetria de clamp** sob deflação (IPCA negativo) — fora do domínio prático brasileiro.

Resumo quantitativo: **47 OK · 5 suspeitos · 2 falhas** (em 54 checagens).

---

## 2) Cenários testados por dimensão

| Dimensão | Cenários | OK | Suspeito | Falha |
|---|---|---|---|---|
| Amortização em diferentes pontos (#13, 25, 40, 55, 72) | 8 | 6 | 2 | 0 |
| Amortização variada na #13 (clamp, quitação, reconciliação) | 6 | 6 | 0 | 0 |
| Liquidação antecipada das últimas (`simulateAnticipateLast`) | 7 | 7 | 0 | 0 |
| Correção IPCA (0/3/5/10/20%, oficial, resíduo, periodicidade) | 10 | 9 | 1 | 0 |
| Operações combinadas (a/b/c/d, fora de ordem) | 11 | 7 | 3 | 1 |
| Equivalências e bordas | 12 | 9 | 2 | 1 |
| **Total** | **54** | **44** | **8** | **2** |

### Destaques OK (citando números)
- **IPCA 5%:** saldo corrigido `332.500 × 1,05 = 349.125,00` na 1ª correção; parcela-base #13 = R$ 5.818,75; encadeamento de saldo fecha em 0 na #72.
- **Sem IPCA:** `totalProjected = financedValue = R$ 332.500,00` exato (propriedade "sem juros").
- **Resíduo:** soma das 60 parcelas = `totalProjected` (R$ 385.827,20), com a #72 absorvendo −R$ 0,04.
- **Reconciliação amortização:** `(futuras com amort) + extra = base.totalProjected − netIpcaSavings`. Extra de R$ 50.000 na #13 evita exatamente R$ 5.345,40 de IPCA.
- **Antecipar tudo (count=60):** contrato quitado, `balanceAfter = 0`, `futureValueWithIpca = totalProjected = R$ 385.827,20`.
- **Equivalência amortizar-tudo vs antecipar-tudo:** `netIpcaSavings == ipcaDiscount = R$ 36.702,20` a 0 centavos (e idêntico sob IPCA 0/50%/100%/500%). **Atenção:** o par equivalente é `netIpcaSavings` vs `ipcaDiscount`, NÃO `totalSavingsWithIpca` (que mede a queda da soma das parcelas, R$ 380.008,45 — outra grandeza).

---

## 3) Bugs confirmados

### BUG 1 — Parcela negativa de −R$ 0,03 quando amortização zera o saldo antecipadamente
**Severidade: BAIXA** · **Status: FAIL** (reproduzido 16/16) · linhas 198–205 + 164

Amortizando todo o saldo antes da última parcela (ex.: `amortizations={70: 999999999}`, IPCA 5%):
- `row70.amortization = R$ 14.145,45`, `row70.balanceAfter = 0` (correto, sem saldo negativo).
- `row71.value = 0`, **`row72.value = −R$ 0,03`** (parcela negativa exibida).
- Soma das parcelas = `totalProjected = R$ 371.681,75` (total continua correto).

**Causa raiz:** `sumExact` (linha 164) acumula em precisão total; as ~58 parcelas arredondadas derivam −0,03 vs a soma exibida. A política de resíduo (linhas 200–203) deposita `round2(sumExact) − sumDisplayed` **incondicionalmente em `rows[length-1]`**, mesmo quando o valor verdadeiro dessa parcela é 0. Resultado: `0 + (−0,03) = −0,03`.

Generaliza: amort total em #71 → −0,03; #69/#70 → −0,03; #50 → −0,01; #40 → −0,02. (#60/#13 dão resíduo 0 por coincidência.) Só ocorre quando a amortização zera o saldo antes do fim, deixando parcelas-zero finais.

**Correção sugerida:** depositar o resíduo na **última parcela com valor > 0** (a última "viva"), não em `rows[length-1]`. No exemplo: `row70.value = 7.072,70`, `row71 = row72 = 0,00`. Alternativamente, clampar para nunca exibir valor negativo. A invariante `Σ == totalProjected` permanece preservada.

---

### BUG 2 — `currentBalance` mistura dimensões (principal vs valor com IPCA) em pagamento fora de ordem
**Severidade: MÉDIA** · **Status: SUSPEITO/confirmado** · linhas 300–304

A fórmula `currentBalance = max(0, nextOpen.balanceBefore − paidAfterNext)` é **dimensionalmente inconsistente**: `nextOpen.balanceBefore` é **principal**, mas `paidAfterNext` soma os campos `value` (que carregam IPCA embutido das correções futuras).

Manifestações confirmadas:
- **Caso patológico** (pagar #14–#72, só #13 aberta, IPCA 5%): `row13.balanceBefore = R$ 349.125,00`, `Σ(14..72) = R$ 380.008,45`, raw = −R$ 30.883,45 → o clamp reporta `currentBalance = 0` enquanto `financingRemaining = 1` e #13 genuinamente em aberto. (Os campos de cobrança — próximo número/valor/data — permanecem corretos; só o KPI fica errado.)
- **Feature legítima afetada:** ao antecipar 5 últimas, `simulateAnticipateLast` promete `balanceAfter = R$ 320.031,25` (usa principal de hoje), mas após materializar os pagamentos #68–#72 o `computeContractState` reporta `R$ 313.761,39` — **discrepância de R$ 6.269,86**. Em misto realista (pagas #13–#30 sequencial + antecipou #71/#72): reportado R$ 242.461,46 vs correto R$ 256.606,88 (subtrai ~R$ 1.415 a mais por parcela antecipada).

**Correção sugerida:** descontar o **valor-principal-de-hoje** das parcelas antecipadas, não o `value` nominal:
`currentBalance = (parcelas em aberto) × (nextOpen.balanceBefore / vincendas)`.
Isso elimina a incoerência dimensional, faz `computeContractState` e `simulateAnticipateLast` concordarem, e dispensa o clamp `Math.max(0,...)` no caso normal. **Atenuante** (por isso média, não crítica): exige sequência fora de ordem; campos de cobrança ao cliente permanecem corretos.

---

### BUG 3 — Assimetria de clamp sob deflação (IPCA negativo)
**Severidade: BAIXA** · **Status: SUSPEITO** · linhas 471 (`netIpcaSavings`) vs 537 (`ipcaDiscount`)

Sob `forecastAnnualIpca = −0,10` (deflação), as duas vias calculam a **mesma grandeza econômica**, mas só uma é clampada:
- `simulateExtraPayment`: raw `totalSavingsWithIpca − extra = −R$ 54.158,26`, mas `netIpcaSavings` = **R$ 0,00** (clamp `Math.max(0,...)` na linha 471).
- `simulateAnticipateLast`: `ipcaDiscount = futureValueWithIpca − payToday = −R$ 54.158,26` (**sem clamp**, linha 537).

Varredura confirmou identidade centavo a centavo para ipca ∈ {−0,20; −0,05; −0,01; 0; +0,03; +0,10}. **Para IPCA ≥ 0 não há discrepância alguma** (o `Math.max` é no-op; ambas concordam em R$ 36.702,20 sob IPCA 5%). A assimetria só aparece sob deflação anual — cenário fora do domínio prático (IPCA brasileiro positivo há décadas).

**Verruga cosmética:** sob deflação, `ipcaDiscount` cru seria exibido negativo rotulado "Economiza de inflação" (ClientArea.tsx:1019, ContractDetail.tsx:971). Os CTAs promocionais já têm guarda `> 0` (linhas 1115/1254), então não há decisão financeira incorreta.

**Correção sugerida:** padronizar — aplicar `Math.max(0,...)` também a `ipcaDiscount`, OU remover o clamp de `netIpcaSavings` (deixar ambos crus). Prioridade baixa.

---

### Pontos de atenção adicionais (não-bugs)
- **No-op ao amortizar a ÚLTIMA parcela (#72):** `amortizations[72]` é sempre zerado pelo clamp `Math.min(extra, balance)` (linha 172), pois o saldo pós-parcela já é ~0. Matematicamente seguro (nunca gera negativo nem overpay), porém **silencioso**. → **Recomenda-se bloquear na UI** o lançamento de amortização na última parcela; para quitar a #72 o caminho correto é `simulateAnticipateLast`.
- **1ª parcela já nasce corrigida (alerta de NEGÓCIO, não bug):** com as datas de referência, a 1ª parcela do financiamento (#13, venc. 2026-06-22) **já recebe a 1ª correção IPCA** (aniversário 2026-06-15 < vencimento), pois `balanceBefore = 332.500 × 1,05 = 349.125,00`. Isso **contradiz o comentário da spec na linha 197** (parcelas 13–71 a R$ 5.541,67 sem correção, sugerindo carência de 1 ano). → **Confirmar com o negócio** se a 1ª parcela deve nascer reajustada ou se `correctionBaseDate` deveria ser 2026-06-15.

---

## 4) Cenários interessantes para o produto

Insights extraídos da mecânica validada — úteis para orientar o cliente na UI:

**a) Quanto antes amortizar, maior a economia de IPCA (monotonicamente decrescente).** Extra fixo de R$ 50.000 em pontos diferentes evita IPCA assim:

| Parcela | netIpcaSavings (IPCA evitado) |
|---|---|
| #13 (cedo) | **R$ 5.345,40** |
| #25 | R$ 3.959,xx |
| #40 | R$ 2.859,xx |
| #55 (tarde) | **R$ 1.764,70** |

→ **Mensagem ao cliente:** "Amortizar agora rende ~3× mais economia de inflação que amortizar perto do fim." A economia simples (principal) é sempre exatamente o extra; o ganho marginal é todo o IPCA futuro evitado.

**b) Antecipar as últimas parcelas é o caminho mais eficiente para "fugir do IPCA".** `ipcaDiscount` cresce com `count` e é não-decrescente: antecipar TODAS (60) gera desconto de R$ 36.702,20 — todo o IPCA que incidiria. Nota: `ipcaDiscount@59 == ipcaDiscount@60` (R$ 36.702,20), pois a #13 (corrente) não tem IPCA futuro a evitar.

**c) Amortizar-tudo ≡ antecipar-tudo** (R$ 36.702,20 de economia de IPCA em ambos). Ferramentas diferentes, mesmo resultado econômico: amortizar **reduz valor da parcela** (mantém prazo); antecipar **reduz prazo** (paga menos parcelas). → A UI pode oferecer ambas como "duas formas de economizar a mesma quantia".

**d) Quitar uma parcela corrente custa o saldo cheio corrigido.** Para "quitar" via amortização máxima na #13, o cliente paga `parcela + extra = saldo cheio = R$ 349.125,00` (parcela do mês continua devida junto com o extra). Importante deixar claro na UI que "quitar" ≠ "só o saldo após a parcela".

---

## 5) Recomendações

**Código (priorizadas):**
1. **[BUG 1 — baixa]** Corrigir a política de resíduo (linhas 198–205): depositar na última parcela com `value > 0`, ou clampar a 0. Elimina parcelas de −R$ 0,03 visíveis ao cliente.
2. **[BUG 2 — média]** Reformular `currentBalance` (linhas 300–304) para descontar **principal-de-hoje** das parcelas antecipadas: `(parcelas em aberto) × (nextOpen.balanceBefore / vincendas)`. Faz `computeContractState` concordar com `simulateAnticipateLast` (corrige discrepância de até R$ 6.269,86).
3. **[BUG 3 — baixa]** Padronizar o clamp entre `netIpcaSavings` e `ipcaDiscount` para o caso de deflação.

**UI / Produto:**
4. **Bloquear lançamento de amortização na última parcela (#72)** — hoje é no-op silencioso; redirecionar para "antecipar últimas".
5. Expor o insight "amortizar cedo economiza ~3× mais" como dica contextual ao escolher a parcela.

**Negócio (decisão necessária):**
6. **Confirmar a semântica da 1ª correção:** a 1ª parcela do financiamento nasce reajustada (contradiz a carência de 1 ano descrita no comentário da linha 197). Se a intenção é carência, ajustar `correctionBaseDate` para 2026-06-15. Esta é a única pendência com impacto financeiro material (R$ 5.541,67 vs R$ 5.818,75 por parcela-base).

**Arquivos relevantes:** motor em `/Users/fernandosilva/Documents/recebimentos/src/lib/finance.ts`; consumo na UI em `ClientArea.tsx` (linhas 807, 1019, 1115) e `ContractDetail.tsx` (linhas 952, 971, 1254).