# Plano — Landing Page + Cadastro com Pagamento (Repply)

Inspirado na lógica da **QuantIA** (LP institucional na raiz → cadastro → paywall → app liberado),
adaptado para o stack e a arquitetura do Repply.

> **Decisões já tomadas** (base deste plano):
> - **Cobrança:** planos fixos mensais (Starter / Pro / Business).
> - **Entrada:** *paga para ativar* — cadastra, cai no paywall com plano inativo, só usa o app depois de pagar.
> - **Escopo:** produto público (SaaS) — Repply vendido para várias empresas de representação.

---

## 1. Ponto de partida: o que existe hoje

**QuantIA** (referência) é Next.js (App Router) com **API routes de servidor** (`/api/checkout`, `/api/webhooks/stripe`),
Stripe + Supabase, e um paywall por **créditos**. A home é uma LP rica, e o cadastro joga o usuário em
`/billing?status=plan_inactive` até ativar o plano.

**Repply (MD Representações)** é outro stack:

| Aspecto | QuantIA | Repply (hoje) |
|---|---|---|
| Framework | Next.js App Router | **Vite SPA + React Router** |
| Backend/servidor | API routes Next.js | **Supabase Edge Functions (Deno)** |
| Auth | Supabase Auth | Supabase Auth (igual) |
| Multi-tenant | por usuário/tenant | **por empresa** (`empresas` → muitos `usuarios`) |
| Landing page | ✅ rica | ❌ **não existe** (entra direto no `/login`) |
| Pagamento | ✅ Stripe + créditos | ❌ **nada** (sem Stripe) |
| Marca | quantIA | **"Repply — o CRM que fala a sua língua"** (dark `#0A0A0A` + laranja `#FF5A1F`) |

**Consequência arquitetural mais importante:** como o Repply é SPA (sem servidor Next), tudo que a QuantIA
faz em API routes vai virar **Edge Function do Supabase** — o que o projeto já usa e domina (há ~20 functions Deno hoje).

### Fatos do código que guiam o plano
- O perfil do usuário é uma linha da tabela **`usuarios`** com `empresas(*)` aninhado (via `use-auth.tsx`),
  carregando `role` e `empresa_id`. A tabela `vendedores` é **legada** — o `docs/auth-structure.md` está desatualizado.
- O cadastro usa `supabase.auth.signUp` com metadata (`role: "empresa"` ou `role: "vendedor"` + `codigo_empresa`).
  Um **trigger no `auth.users`** cria as linhas de `empresas`/`usuarios` a partir desse metadata.
- Autorização real é **RLS** (`is_gestor()`, `is_admin()`, `usuario_in_my_empresa()`), não o frontend.
- `role === "admin"` é super-admin global (não deve cair no paywall).
- Confirmação de e-mail está **ligada** no cadastro atual (o toast pede "verifique seu email").

---

## 2. Modelo de pagamento proposto

**Quem paga:** a **empresa** (o gestor que faz o cadastro tipo "empresa"). O **funcionário** que entra com
código de empresa **não paga** — herda o plano da empresa dele. Isso já encaixa no fluxo de cadastro atual.

**A assinatura vive na tabela `empresas`.** Um `plan_status` na empresa é o que libera/bloqueia o app para
todo o time dela.

### Planos (sugestão — a confirmar preços e limites)

| Plano | Preço/mês (sugestão) | Usuários inclusos | Ideia de posicionamento |
|---|---|---|---|
| **Starter** | R$ — | até 2 | representante autônomo / dupla |
| **Pro** | R$ — | até 8 | equipe comercial pequena (destaque) |
| **Business** | R$ — | até 25 | operação maior / múltiplas fábricas |

> Preços, nomes e limites são **placeholders** — precisam da sua definição (ver seção 8). A mecânica não muda.
> O limite de usuários vira `max_seats` na empresa e é checado ao aceitar novos funcionários/convites.

### Fluxo "paga para ativar" (espelha a QuantIA)
1. Gestor cadastra a empresa → conta criada com `plan_status = 'inactive'`.
2. É redirecionado para **`/assinar`** (paywall) — não consegue usar o app ainda.
3. Escolhe o plano → Edge Function cria a **Checkout Session (subscription)** no Stripe → redireciona pro checkout hospedado.
4. Stripe cobra e chama o **webhook** → Edge Function ativa `plan_status = 'active'` na empresa.
5. App é liberado para o gestor **e todos os funcionários** daquela empresa.

> **Nota Stripe Brasil:** assinatura recorrente no Stripe BR via Checkout só aceita **cartão**. Se quiser
> boleto/PIX no plano recorrente, é preciso o modelo `collection_method: 'send_invoice'` (fatura hospedada,
> pagamento manual todo ciclo) — foi exatamente o que a QuantIA fez na rota `/api/checkout/boleto`. Decisão sua (seção 8).

---

## 3. Arquitetura técnica

### 3.1 Banco de dados — nova migration

Adicionar à tabela `empresas` (uma migration `supabase/migrations/<timestamp>_billing.sql`):

- `stripe_customer_id text unique`
- `stripe_subscription_id text`
- `subscription_status text` (espelho do Stripe: `active`, `past_due`, `canceled`, …)
- `plan_tier text` (`starter` | `pro` | `business`)
- `plan_status text not null default 'inactive'` (`inactive` | `active`) — **o gate do app**
- `max_seats int` (derivado do plano)
- `current_period_end timestamptz` (fim do ciclo pago)

Complementos:
- **RLS:** membros da empresa podem **ler** esses campos; **escrita só via `service_role`** (webhook/Edge Function).
- **Helper SQL** `empresa_plano_ativo()` → boolean, para reforçar o gate também nas policies das tabelas sensíveis, se desejado.
- **Ajustar o trigger de signup** (`handle_new_user`) para nascer com `plan_status = 'inactive'` em empresa nova.

### 3.2 Edge Functions (Deno) — o "backend" do pagamento

Criar em `supabase/functions/` (mesmo padrão das funções existentes):

- **`stripe-checkout/index.ts`** — recebe o plano, valida JWT do usuário, cria/recupera o `Customer` do Stripe
  (salva `stripe_customer_id` na empresa), cria a **Checkout Session `mode: 'subscription'`** com
  `metadata.app = 'repply'`, `metadata.empresa_id`, `success_url`/`cancel_url`. Retorna a `url`.
- **`stripe-webhook/index.ts`** — `verify_jwt = false` (endpoint público). Valida a assinatura
  (`Stripe-Signature`), **filtra `metadata.app = 'repply'`** (isolamento, caso a conta Stripe seja compartilhada),
  e trata: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`, `invoice.payment_failed` → atualiza `empresas` (plan_status, tier, seats, period_end).
- **`stripe-portal/index.ts`** — cria uma sessão do **Billing Portal** do Stripe para o gestor gerenciar/cancelar.

Config:
- `supabase/config.toml`: registrar as functions e marcar `verify_jwt = false` só na `stripe-webhook`.
- Secrets: `supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=…`.
- Isolamento: usar **Restricted Key** dedicada e `metadata.app='repply'` em tudo (mesma disciplina da QuantIA).

### 3.3 Frontend — reestruturação de rotas (React Router)

Hoje `/` é o app (redireciona pro login se deslogado). Passa a ser assim:

**Rotas públicas (novas):**
- `/` → **Landing Page** (se logado e com plano ativo, redireciona pro app).
- `/precos` → âncora/seção de planos (pode ser seção da própria LP).
- `/login`, `/esqueci-senha`, `/redefinir-senha` → como hoje.

**Rota de paywall (nova):**
- `/assinar` → página de planos + checkout + banners de status (`plan_inactive`, `success`, `cancelled`) +
  link pro portal. Espelha a `app/billing/page.tsx` da QuantIA, com os componentes shadcn do Repply.

**Rotas do app (protegidas):** as atuais (`/clientes`, `/negocios`, `/obras`, `/dashboard`, `/whatsapp`, …).
O "home" do app (pipeline / AdminDashboard) sai da raiz `/` e passa a viver, por exemplo, em **`/app`** ou
**`/pipeline`** — para liberar `/` pra LP.

**Gate de plano** — estender o `ProtectedRoute` em `App.tsx`:
- Se `profile.empresas.plan_status !== 'active'` **e** `role !== 'admin'` → redireciona pra `/assinar`.
- Funcionário de empresa sem plano ativo vê o mesmo bloqueio (com mensagem "empresa sem assinatura ativa —
  fale com seu gestor"), já que ele não paga.
- `role === 'admin'` (super-admin global) **nunca** cai no paywall.

### 3.4 Landing Page — estrutura (reaproveitando a marca Repply)

Nova `src/pages/Landing.tsx` + seções em `src/components/landing/`. Mantém o visual já existente do painel de
login (fundo dark `#0A0A0A`, acento laranja `#FF5A1F`, tokens shadcn/HSL). Seções, no mesmo espírito da QuantIA:

1. **Nav** sticky (logo Repply, âncoras, "Entrar", "Começar agora").
2. **Hero** com título + subtítulo + demo animada. Em vez da "planta escaneada" da QuantIA, uma **demo do
   produto**: um mini-**Kanban de pipeline** com cards se movendo entre colunas, ou uma **inbox de WhatsApp**
   recebendo mensagens em tempo real (puro CSS/estado, como o `HeroDemo` da QuantIA).
3. **Problema** (antes/depois) — planilha/WhatsApp solto vs pipeline organizado.
4. **Como funciona** — 3 passos (cadastra empresa → convida time por código → vende com pipeline + automações).
5. **Recursos** — grid dos módulos reais: Pipeline (Kanban), Clientes, Negócios/Pedidos, Obras, Fabricantes,
   **Portal de prospecção** (licenças públicas IDEMA/Natal), Dashboard/KPIs, Calendário, Tarefas, Chat,
   **WhatsApp Inbox**, **E-mail (Gmail)**, Importação de planilhas.
6. **Preços** — 3 cards (Starter/Pro/Business) com CTA → `/assinar`.
7. **CTA final** + **Footer**.

---

## 4. Fluxos end-to-end

**Cadastro de empresa (paga):** signup `role=empresa` → trigger cria empresa `plan_status=inactive` →
redireciona `/assinar?status=plan_inactive` → escolhe plano → `stripe-checkout` → checkout hospedado → paga →
`stripe-webhook` ativa `plan_status=active` → app liberado.

**Cadastro de funcionário (grátis):** signup `role=vendedor` + código válido → entra na empresa. Se a empresa
tem plano ativo, usa o app; se não, vê o aviso de "empresa sem assinatura".

**Gestão da assinatura:** `/assinar` → botão "Gerenciar assinatura" → `stripe-portal` → portal do Stripe
(troca de cartão, cancelamento, faturas).

**Renovação/falha:** `invoice.paid` mantém ativo; `payment_failed`/`subscription.deleted` → `past_due`/`inactive`
→ app volta a bloquear na próxima verificação.

---

## 5. Mudanças arquivo a arquivo (checklist)

**Banco / Supabase**
- [ ] `supabase/migrations/<ts>_billing.sql` — colunas de billing em `empresas` + RLS + helper + ajuste do trigger.
- [ ] `supabase/functions/stripe-checkout/index.ts`
- [ ] `supabase/functions/stripe-webhook/index.ts`
- [ ] `supabase/functions/stripe-portal/index.ts`
- [ ] `supabase/config.toml` — registrar functions (webhook com `verify_jwt=false`).
- [ ] `src/integrations/supabase/types.ts` — refletir as novas colunas (projeto não regenera tipos no sandbox).

**Frontend — roteamento e gate**
- [ ] `src/App.tsx` — nova rota pública `/` (LP), mover home do app pra `/app`, estender `ProtectedRoute` com o gate de plano.

**Frontend — novas telas**
- [ ] `src/pages/Landing.tsx` + `src/components/landing/*` (Hero, Problema, ComoFunciona, Recursos, Precos, CTA, Footer).
- [ ] `src/pages/Assinar.tsx` — paywall (cards de plano, checkout, banners de status, link do portal).
- [ ] `src/hooks/use-assinatura.ts` — lê `plan_status`/tier da empresa e expõe helpers pro gate e pra tela.

**Config**
- [ ] Secrets do Stripe no Supabase; `NEXT_PUBLIC_SITE_URL`/domínio público; produtos+preços criados no Stripe.

---

## 6. Faseamento sugerido

1. **Fase 1 — LP visual** (sem backend): `/` com todas as seções e a demo animada, usando a marca Repply. Entregável já "bonito de ver".
2. **Fase 2 — Roteamento + gate**: mover app pra `/app`, LP na raiz, paywall `/assinar` (ainda mockado), gate no `ProtectedRoute`.
3. **Fase 3 — Stripe backend**: migration de billing + 3 Edge Functions + secrets + webhook no dashboard Stripe.
4. **Fase 4 — Ligar o paywall**: conectar `/assinar` ao `stripe-checkout`/portal, refletir `plan_status` real.
5. **Fase 5 — QA**: testar cadastro empresa → pagamento → liberação; funcionário grátis; falha de pagamento; super-admin sem bloqueio.

---

## 7. Riscos e pontos de atenção

- **Confirmação de e-mail vs "paga para ativar":** hoje o cadastro exige confirmar e-mail antes de logar. No
  fluxo "paga para ativar", isso adiciona um passo antes do paywall. Decidir se desliga a confirmação durante o
  lançamento (como a QuantIA fez: `email_confirm: true` no signup) ou mantém.
- **Trigger de signup:** a criação de `empresas`/`usuarios` acontece num trigger SQL do `auth.users`. A coluna
  `plan_status='inactive'` precisa nascer dali — é uma edição cirúrgica nesse trigger.
- **Stripe BR só cartão em subscription** (ver nota da seção 2) — impacta se você quer boleto/PIX no recorrente.
- **Isolamento da conta Stripe:** se a conta for compartilhada com outros produtos, `metadata.app='repply'` +
  Restricted Key dedicada são obrigatórios (a QuantIA teve exatamente esse problema com a conta Climb.ai).
- **RLS:** o gate no frontend é conveniência; o bloqueio real de dados de empresa sem plano, se necessário,
  deve passar por policies/`empresa_plano_ativo()`.
- **`max_seats`:** definir o comportamento ao estourar o limite (bloquear novo funcionário vs cobrar assento extra).

---

## 8. Preciso de você (decisões em aberto)

1. **Preços e limites** dos 3 planos (Starter/Pro/Business) — valores e nº de usuários por plano.
2. **Boleto/PIX no recorrente?** (senão, cartão apenas — mais simples).
3. **Confirmação de e-mail** no lançamento: manter ou desligar?
4. **Conta Stripe** do Repply já existe? (para criar produtos/preços e a Restricted Key).
5. **Domínio público** da LP (ex: `repply.com.br`) para `success_url`/`cancel_url` e o webhook.
6. **Comportamento do `max_seats`** ao estourar o limite de usuários.

Assim que fechar esses pontos, sigo para a implementação na ordem do faseamento (começando pela LP).
