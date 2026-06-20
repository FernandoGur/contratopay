# Recebimentos — controle de contratos parcelados

Sistema web premium para controlar vendas parceladas com entrada, carência,
financiamento, saldo devedor, correção anual pelo IPCA, pagamentos via Pix e
amortização extraordinária. Tem **painel do vendedor** e **área do cliente**.

## O que já funciona (v1)

- Login com dois perfis: **vendedor (admin)** e **cliente**.
- Cadastro de clientes e contratos (com cálculo automático da parcela base).
- Geração automática das parcelas (entrada + financiamento) respeitando a carência.
- **Engine de cálculo validada** contra a planilha do contrato (IPCA anual sobre o
  saldo, amortização, economia). Rode `npx tsx scripts/validate.ts` para conferir.
- Painel financeiro com indicadores (vendido, recebido, saldo, vencidas…).
- Tela do contrato: resumo, cronograma, pagamentos, **previsão/correção IPCA**,
  chave Pix (com histórico) e auditoria.
- Registro de pagamentos e amortizações; aprovação de comprovantes.
- **Área do cliente** simples: valor a pagar, chave Pix (copiar), envio de
  comprovante, saldo e **simulador de pagamento extra** com economia estimada.
- Linguagem amigável e avisos de "simulação" conforme as regras do contrato.

## Rodar localmente

```bash
npm install
npm run dev       # abre em http://localhost:5173
```

**Acesso de teste** (botões na tela de login):
- Vendedor: `admin@local` / `admin`
- Cliente: `cliente@local` / `cliente`

O contrato-exemplo de R$ 350.000 já vem carregado. Os dados ficam salvos **no
navegador** (localStorage) — é o "modo local" da v1.

## Comandos

```bash
npm run dev                   # desenvolvimento
npm run build                 # build de produção (gera /dist)
npx tsx scripts/validate.ts   # valida os cálculos contra a especificação
node scripts/shots.mjs        # screenshots (precisa do dev server rodando)
```

---

## Publicar de graça (Cloudflare Pages + domínio próprio)

1. Suba este projeto para um repositório no GitHub.
2. Em **Cloudflare → Workers & Pages → Create → Pages → conectar o GitHub**.
3. Configurações de build:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy. O arquivo `public/_redirects` já cuida das rotas (SPA).
5. Em **Custom domains**, aponte seu domínio (SSL automático e grátis).

Sem custo, sem servidor para manter. Nesta forma, o app roda em modo local
(dados no navegador de cada dispositivo).

---

## Próximo passo: Supabase (multiusuário + cliente acessa de qualquer lugar)

Para o cliente acessar do celular dele, com login real e dados na nuvem:

1. Crie um projeto no [Supabase](https://supabase.com) (plano grátis).
2. No **SQL Editor**, cole e execute `supabase/schema.sql`
   (cria tabelas + segurança RLS: cada cliente só vê o próprio contrato).
3. Em **Storage**, crie um bucket privado `receipts` para os comprovantes.
4. Em **Authentication**, crie os usuários (vendedor e cliente) e preencha a
   tabela `profiles` com `role` e `client_id`.
5. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
   (no Cloudflare Pages, adicione as mesmas variáveis em *Settings → Environment*).

A camada de dados foi desenhada para essa migração: toda a UI fala com
`src/lib/repo.ts` através de uma interface única, e a **engine de cálculo**
(`src/lib/finance.ts`) é a mesma nos dois modos. O passo de produção é criar um
`supabaseRepo` com as mesmas funções usando `src/lib/supabase.ts`.

## Estrutura

```
src/
  lib/
    finance.ts     # ENGINE de cálculo (saldo, IPCA, amortização) — validada
    dates.ts       # utilidades de data (sem fuso)
    format.ts      # formatação BRL / %
    types.ts       # tipos de domínio (= schema do Supabase)
    repo.ts        # camada de dados (modo local) + auditoria + auth
    store.ts       # reatividade React
    seed.ts        # contrato-exemplo
    supabase.ts    # cliente Supabase (para produção)
  components/       # UI premium (cards, badges, modal, layout)
  pages/
    admin/         # painel do vendedor
    client/        # área do cliente
supabase/schema.sql  # banco + segurança (RLS)
scripts/validate.ts  # testes da engine contra a especificação
```
