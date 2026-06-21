# Guia para alterações visuais — ContratoPay

Este documento serve para você conseguir alterar **qualquer parte visual** do
projeto com segurança. Você tem **liberdade total** sobre o design (cores,
tipografia, espaçamento, layout, componentes, ilustrações, o que quiser). As
únicas restrições aqui são técnicas — não quebrar a lógica, os cálculos e o build.

- **App no ar:** https://contratopay.com.br
- **Repositório:** `FernandoGur/contratopay`
- **Stack:** Vite + React + TypeScript + Tailwind CSS v4.

---

## Rodar localmente

```bash
npm install
npm run dev      # abre em http://localhost:5173
```

Login de teste (modo local, dados no navegador):
- Vendedor (admin): `admin@local` / `admin`
- Cliente: `cliente@local` / `cliente`

Para ver a área do cliente isolada: `http://localhost:5173/cliente/contract-1`

---

## Onde está o visual

Mexa à vontade nestes arquivos:

| Arquivo | O que é |
|---|---|
| `src/index.css` | **Design tokens** (cores, fontes, sombras, raios) e utilitários como `.card`, `.bg-brand-gradient`. Mudar aqui reflete em todo o app. |
| `src/components/ui.tsx` | **Componentes base**: `Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, `Modal`, `StatCard`, `Notice`, `Row`, `PageHeader`. Alterar aqui propaga para todas as telas. |
| `src/components/AdminLayout.tsx` | Layout/casca do painel do vendedor (sidebar, topo). |
| `src/pages/Login.tsx` | Tela de login. |
| `src/pages/admin/**` | Telas do vendedor: `Dashboard`, `Clients`, `Contracts`, `ContractDetail`. |
| `src/pages/client/ClientArea.tsx` | Toda a área do cliente (abas, painel inicial, simuladores, previsão, parcelas). |

As fontes são carregadas em `index.html` (Google Fonts). Trocar a fonte = editar
o `<link>` lá e o `--font-sans` / `--font-display` em `src/index.css`.

---

## Publicar sem afetar a produção (preview)

Trabalhe numa branch e abra um Pull Request — **não comite direto no `main`**
(o `main` é o que está no ar).

```bash
git checkout -b design
# ...alterações...
git commit -am "ajustes visuais"
git push -u origin design
```

O Cloudflare gera **automaticamente uma URL de preview** para a branch (algo como
`design-contratopay.fernandogutemberggomes.workers.dev`), onde dá para ver tudo
ao vivo. Só quando o PR for aprovado e mesclado no `main` é que vai para
`contratopay.com.br`.

---

## Limites (apenas técnicos)

Para não quebrar nada além do visual:

- **Não altere `src/lib/`** — é a lógica, os cálculos e os dados. Em especial
  `src/lib/finance.ts` (motor de cálculo de saldo/IPCA/amortização).
- Você **pode usar livremente** estes helpers ao montar telas:
  - `brl(valor)`, `num(valor)`, `pct(decimal)` — de `src/lib/format.ts`
  - `formatDateBR(data)`, `formatMonthBR(data)` — de `src/lib/dates.ts`
- Mantenha o **build verde** antes de cada commit:
  ```bash
  npm run build
  ```
- Confirme que os cálculos seguem intactos (deve dar `19 OK, 0 FAIL`):
  ```bash
  npx tsx scripts/validate.ts
  ```

Fora isso, o design é seu. Pode reestruturar telas, criar componentes novos,
trocar a paleta inteira, mudar o layout — sem pedir permissão.
