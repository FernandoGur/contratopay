# Auditoria técnica e financeira — ContratoPay

Data: 21/06/2026 · Escopo: engine de cálculo, camada de dados, segurança, consistência.
Evidências automatizadas: `scripts/audit.ts` (41 checagens) e `scripts/validate.ts` (19 checagens).

---

## Resumo executivo

O **núcleo de cálculo** (`src/lib/finance.ts`) está **correto e reconciliado** para o contrato de
referência: entrada, geração de parcelas, saldo devedor, IPCA anual, amortização e economia batem com
o esperado, comparados **em centavos exatos**. Foram encontradas **2 divergências reais** (ambas
**corrigidas** nesta auditoria) e identificadas pendências estruturais que **impedem aprovação como
sistema de produção que movimenta dinheiro real** — principalmente porque o **backend (Supabase) está
pausado**: hoje o app roda em **modo local (localStorage)**, sem RLS ativa, sem transações, sem
idempotência/concorrência de servidor e com **valores monetários em `float` (JS Number)**.

- **Cálculos aprovados:** entrada (R$ 17.500,00), saldo financiado (R$ 332.500,00), parcelas,
  saldo devedor, ciclos de IPCA, datas, amortização (seção 18), economia líquida (não inflada).
- **Cálculos corrigidos:** (1) soma das 60 parcelas exibidas; (2) clamp do pagamento extra.
- **Riscos:** `float` para dinheiro; ausência de backend/transações/RLS ativa; sem reversões.
- **Fonte de verdade única:** `getContractCalc()` em `repo.ts` alimenta admin **e** cliente — não há
  recálculo divergente entre telas (consistência por construção).

---

## Tabela de divergências

| Cálculo | Esperado | Encontrado | Diferença | Causa | Correção |
|---|---|---|---|---|---|
| Soma das 60 parcelas (base) | R$ 332.500,00 | R$ 332.500,20 | +R$ 0,20 | Resíduo de arredondamento não distribuído (soma de valores `round2`) | Última parcela absorve o resíduo (`generateSchedule`) |
| Pagamento extra > saldo | parcela/saldo ≥ 0 | parcela −R$ 847,46 / saldo −R$ 50.000 | inválido | Falta de limite no extra | `clamp(0 ≤ extra ≤ saldo)` em `simulateExtraPayment` e na amortização da engine |
| Total c/ IPCA 5% (efeito da correção acima) | R$ 367.454,52 (publicado, inflado) | R$ 367.454,48 (exato) | −R$ 0,04 | A soma inflada virou soma exata após a política de arredondamento | Documentado — valor exato passa a ser o oficial |

> O valor R$ 367.454,52 da especificação era a **soma dos arredondamentos**. Com a política de
> arredondamento correta, o total exato é **R$ 367.454,48** (a diferença de R$ 0,04 é explicada e
> esperada — ver item 15 da especificação, que prevê ajuste da parcela final/distribuição de centavos).

---

## Arquivos alterados

| Arquivo | Função | Motivo | Impacto |
|---|---|---|---|
| `src/lib/finance.ts` | `generateSchedule` | Distribuição do resíduo na última parcela; clamp da amortização ao saldo | Soma das parcelas = principal exato; saldo nunca negativo |
| `src/lib/finance.ts` | `simulateExtraPayment` | `clamp(0 ≤ extra ≤ saldo)` | Sem parcela/saldo/economia negativos; extra > saldo quita |
| `scripts/audit.ts` | (novo) | Bateria de reconciliação determinística | Evidência de auditoria reexecutável |

Nenhuma regra financeira foi alterada sem antes ser documentada (fórmula atual → esperada → diferença).

---

## Reconciliação — contrato de referência

| Item | Valor |
|---|---|
| Valor total da venda | R$ 350.000,00 |
| Entrada recebida (6 pagamentos) | **R$ 17.500,00** (exato) |
| Saldo financiado | R$ 332.500,00 |
| Soma das 60 parcelas base | **R$ 332.500,00** (após correção) |
| Saldo interno após a 60ª parcela | R$ 0,00 |
| Parcela base (13) | R$ 5.541,67 |
| Próxima parcela (seed atual) | #13 · 22/06/2026 · R$ 5.541,67 |
| Saldo devedor atual (seed) | R$ 332.500,00 |
| 1º reajuste | 15/06/2027 (parcela 25), IPCA est. ~5% |
| Saldo pré/pós 1ª correção | R$ 266.000,00 → R$ 279.300,00 |
| Amortização R$ 5.000 (saldo 326.958,33) | nova parcela R$ 5.456,92 · economia mensal R$ 84,75 |
| Economia líquida (IPCA evitado) do extra 5.000 | R$ 543,78 (≠ valor amortizado — não inflada) |
| Total financiamento c/ IPCA 5% | R$ 367.454,48 (exato) |

**Fórmula de reconciliação do saldo** (verificada):
`saldo = financedValue − principal pago − amortizações (+ correções oficiais)` → bate com o exibido.

---

## Invariantes validados (auditoria)

- saldo nunca negativo · amortização nunca aumenta o saldo · extra negativo não aumenta o saldo
- extra = 0 não altera nada · extra > saldo é limitado (quita, não estoura)
- parcela paga não recebe IPCA · 1ª parcela sem correção (carência) · nenhum ciclo corrigido 2×
- economia líquida não inclui o valor amortizado · simuladores são puros (não gravam)
- valores exibidos sem `NaN`/`Infinity`/`>2 casas`/negativos

---

## Pendências (decisões de negócio — NÃO inventadas)

1. **Política de arredondamento final** — adotado "última parcela absorve resíduo"; confirmar.
2. **Multa/juros de mora/correção de vencidas** — não implementado (não inventar).
3. **Ordem de eventos no mesmo dia** (amortização na data do IPCA) — indefinida.
4. **Pagamento maior que o saldo / redução de prazo / renegociação** — regra a definir.
5. **Reversões** (cancelar pagamento, reverter IPCA/amortização) — **não implementadas**.
6. **Alocação automática** (vencidas → atual → excedente=amort) — hoje é **manual** no admin.

---

## Riscos estruturais (impeditivos de produção real)

| Risco | Estado | Recomendação |
|---|---|---|
| Dinheiro em `float` (JS Number) | Presente (exibição mitigada por `round2`) | Migrar para **centavos inteiros** ou `numeric/decimal` + lib decimal |
| Backend ausente (Supabase pausado) | App em `localStorage`, por dispositivo | Ligar Supabase; dados na nuvem |
| RLS não ativa | `schema.sql` existe (RLS por e-mail), **não plugado** | Ativar e testar isolamento por cliente |
| Sem transações/atomicidade | Mutações `localStorage` diretas | Operações financeiras em transação no banco |
| Idempotência/concorrência | Inexistente no servidor | Chaves de idempotência + optimistic locking |
| Autenticação | Credenciais locais em texto puro (demo) | Supabase Auth real |
| Reversões/auditoria imutável | Logs locais; sem reversão | Eventos imutáveis + reversão |

**Itens que HOJE respeitam a regra:** comprovante ≠ pagamento (`submitReceipt` só anexa, não baixa
saldo); trocar Pix não altera valores; simulação não grava; admin e cliente leem a mesma fonte.

---

## Indicadores

- Checagens financeiras automatizadas: **60** (audit 41 + validate 19), **100% aprovadas**.
- Divergências encontradas: **2** · corrigidas: **2** · pendências de negócio: **6**.
- Operações sem transação: todas (modo local). Cálculos duplicados entre telas: **0** (fonte única).

---

## Nota de confiabilidade

- **Engine de cálculo (isolada):** **9/10** — correta, reconciliada, testada, com arredondamento
  agora exato; perde ponto pelo uso de `float` em vez de centavos inteiros.
- **Sistema como plataforma de dinheiro real:** **4/10** — sem backend/transações/RLS ativa/reversões.

## Parecer para produção

> **Engine de cálculo: Aprovado com ressalvas** (correto para demonstração e base sólida; migrar para
> centavos inteiros antes de produção).
>
> **Sistema (real, com dinheiro de cliente): Reprovado para produção** até existir backend (Supabase)
> com RLS ativa, transações atômicas, idempotência, reversões e tipo monetário seguro.

Justificativa objetiva (critérios da própria auditoria, item 49): há `float` para dinheiro, ausência
de transação e RLS não ativa — qualquer um já impede aprovação integral. Não há, porém, divergência
financeira em aberto nem teste crítico falhando: as divergências encontradas foram corrigidas e
reconciliadas.
