# Hand-off — Landing Page + Cadastro com Pagamento (Repply Imob)

Documento pronto para entregar ao **Claude Code**. Contém a identidade visual real da marca
(extraída do Instagram [@repply.hub](https://www.instagram.com/repply.hub/) e do site
[repplyhub.com.br](https://www.repplyhub.com.br)), a estrutura da landing page e o resumo do fluxo de
pagamento. Os detalhes técnicos de billing estão em **`docs/PLANO_LP_E_PAGAMENTO.md`** (referenciado ao longo).

---

## 🟠 Cole isto no Claude Code (prompt inicial)

> Leia `docs/HANDOFF_REPPLY_IMOB_LP.md` e `docs/PLANO_LP_E_PAGAMENTO.md`. Implemente, na ordem da seção
> "Tarefas para o Claude Code", uma **landing page pública** para o produto **Repply Imob** (o CRM comercial),
> seguindo a identidade visual da marca descrita aqui, e o **fluxo de cadastro com paywall** (paga para ativar,
> planos fixos mensais). Comece pela **Fase 1 (LP visual)** e pare para eu revisar antes de mexer em rotas/backend.
> Não invente preços — use placeholders e me pergunte. Mantenha tudo em pt-BR e reutilize os tokens de marca
> que já existem em `src/index.css` ("Repply Brand System V2.0").

---

## 1. Contexto do produto

**Repply Hub** é um ecossistema digital para o mercado da **construção e imobiliário** (Grupo MD · Natal/RN),
com **quatro frentes**:

| Frente | O que é |
|---|---|
| **Repply Ads** | Tráfego pago |
| **Repply Studio** | Audiovisual |
| **Repply Imob** | **CRM comercial ← este é o produto desta LP** |
| **Repply Labs** | Tecnologia sob medida |

Este repositório (o CRM) é o **Repply Imob**: "Organização do funil e previsibilidade de vendas, do primeiro
contato ao fechamento." A LP deve se posicionar como o **CRM comercial do ecossistema Repply**.

**Público-alvo (do site oficial):** incorporadoras, construtoras, imobiliárias e arquitetos — "quem lança e
precisa vender".

> ⚠️ **Nuance a decidir (ver seção 7):** o código atual nasceu para representação de **materiais de construção**
> (fabricantes, pedidos, obras). A marca Repply aponta para o mercado **imobiliário/incorporação**. As copies
> abaixo usam a voz imobiliária da marca; os módulos reais do sistema (pipeline, clientes, WhatsApp, e-mail,
> dashboard) são genéricos o suficiente. Confirmar o vocabulário final com o Vinicius.

---

## 2. Identidade visual (fonte da verdade: site + Instagram)

### 2.1 Cores — já existem no código ✅

O `src/index.css` já traz o **"Repply Brand System V2.0"**. **Reutilizar, não recriar.** Destaques:

| Token | Valor | Uso |
|---|---|---|
| Laranja Repply | `--primary: 16 100% 56%` (`#FF5A1F`) | acento principal, CTAs, keywords |
| Preto profundo | `#0A0A0A` (`0 0% 4%`) | superfície escura da LP |
| Gradiente da marca | `--gradient-brand: linear-gradient(135deg, hsl(16 100% 56%), hsl(17 100% 64%))` | **botão CTA principal** (pill laranja) |
| Sombra de marca | `--shadow-brand` | brilho laranja sob os CTAs |
| Branco | `#FFFFFF` | texto sobre o escuro |
| Cinza mudo | `0 0% 55%` (dark) | textos de apoio |

**A LP é escura por padrão** (superfície `#0A0A0A`), independente do tema do app. Escopar num wrapper
(ex: `<div className="repply-landing dark …">`) para **não quebrar o tema atual do sistema**.
As seções podem **alternar escuro ↔ claro** (o site usa uma seção quase branca `~#F7F6F3` para contraste),
sempre com o laranja como constante.

### 2.2 Logotipo

- **Símbolo "r."**: um "r" minúsculo branco com um **quadrado laranja arredondado** no lugar do ponto, dentro de
  um badge quadrado quase-preto. Já existe em `src/assets/` e `src/components/layout/Logo.tsx` — **reutilizar**.
- **Lockup horizontal**: badge "r." + wordmark **"repply hub."** — `repply` branco bold, `hub.` laranja bold.
  Para o produto, pode usar **"repply imob."** (imob laranja) no header da LP, mantendo o mesmo estilo.

### 2.3 Tipografia

- **Títulos (display):** sans geométrico bold, tracking apertado, tamanhos grandes e editoriais
  (o site usa headlines enormes tipo "O ecossistema digital de quem constrói e vende").
  Recomendo **Sora** ou **Space Grotesk** (Google Fonts) para o display. *(Confirmar a fonte exata da marca com
  o time; usar uma dessas como aproximação fiel até lá.)*
- **Corpo:** **Inter** (limpo, neutro).
- **Eyebrows/labels de seção:** pequenas, **CAIXA ALTA, com letter-spacing**, cinza mudo, muitas vezes
  precedidas do badge "r." — ex: `CONSTRUÇÃO · IMOBILIÁRIO`, `O CENÁRIO`, `O QUE FAZEMOS`, `O CAMINHO`,
  `FEITO PARA`. **Padrão recorrente — replicar em todas as seções.**

### 2.4 Componentes e maneirismos visuais

- **Botão primário:** pill (bem arredondado) com **gradiente laranja** + seta `→`, com `--shadow-brand`.
- **Botão secundário:** pill outline/fantasma (borda sutil, texto claro) — ex: "Conhecer o ecossistema".
- **Barra de progresso de scroll:** uma linha **laranja fina no topo** que avança conforme rola (o site tem).
- **Cards:** cantos arredondados (`--radius: 0.625rem`+), fundo `#101012`/`card`, borda sutil.
- **Comparação "Antes / Agora":** padrão forte do site (fornecedores desconexos → um só parceiro). Reaproveitar
  como bloco "Antes/Depois" da LP (espelha também o bloco antes/depois da QuantIA).
- **Fotografia:** imagens reais de obras/edifícios com **overlay escuro** e acento laranja; alternando com
  **cards sólidos laranja** de tipografia forte.
- **Destaque de palavra-chave:** nas headlines, a **palavra central fica laranja** e o resto branco
  (ex: "**Construir** é o verbo mais difícil.").

### 2.5 Tom de voz (copy)

Editorial, confiante, provocativo e "de dentro do mercado". Exemplos reais da marca:
- "A gente não estudou o mercado da construção. **A gente nasceu dentro dele.**"
- "**O seu negócio é um só.** Por que o digital dele está espalhado em dez lugares?"
- "Um ecossistema. Quatro forças. **Tudo no mesmo lugar.**"

---

## 3. Estrutura da Landing Page (Repply Imob)

Nova `src/pages/Landing.tsx` + seções em `src/components/landing/*`. Layout base inspirado no site oficial e na
LP da QuantIA. Seções, em ordem (copy = **sugestão** na voz da marca, ajustável):

1. **Nav** (sticky, translúcida sobre o escuro): logo "repply imob." · âncoras (Problema · Recursos · Preços) ·
   "Entrar" · **CTA "Criar conta"**. Barra de progresso laranja no topo.
2. **Hero:** eyebrow `CRM COMERCIAL · IMOBILIÁRIO` + headline grande com keyword laranja
   (ex: "O CRM de quem **lança e vende** empreendimento.") + subhead
   ("Funil, WhatsApp, e-mail e previsibilidade de vendas — do primeiro contato ao fechamento, num só lugar.") +
   **2 CTAs** ("Criar conta" gradiente / "Ver planos" outline) + demo animada do produto (ver §3.1).
3. **O Cenário / Problema — "Antes / Agora":** planilha + WhatsApp solto + leads perdidos → pipeline
   organizado no Repply Imob. Bloco comparativo (herda o padrão do site e da QuantIA).
4. **Como funciona (3 passos):** Cadastre sua empresa → Convide seu time (código) → Venda com o funil + automações.
5. **Recursos (grid dos módulos reais):** Pipeline/Funil (Kanban), Clientes & Contatos, Negócios/Propostas,
   **WhatsApp Inbox**, **E-mail (Gmail)**, Dashboard/KPIs, Calendário, Tarefas, Obras/Empreendimentos,
   Importação de planilhas, Portal de prospecção. Cards no estilo Repply (ícone, título, 1 frase).
6. **Preços (3 planos):** Starter · Pro (destaque) · Business — cards escuros, plano do meio com anel laranja.
   CTA de cada card → `/cadastro` (ou `/assinar`). **Preços = placeholder até definição.**
7. **CTA final:** faixa (pode ser laranja sólida, estilo card do Instagram) — "Pronto para vender com previsibilidade?"
   + botão "Criar conta".
8. **Footer:** logo, "Ecossistema Repply · Grupo MD · Natal/RN", links, contato (WhatsApp, @repply.hub).

### 3.1 Demo animada do Hero
Como o `HeroDemo` da QuantIA (puro React/CSS, sem libs): um **mini-funil Kanban** com cards de negócios se
movendo entre colunas (Novo → Orçamento → Enviado → Negociação → Fechado), **ou** uma **inbox de WhatsApp**
recebendo mensagens e virando card no funil. Escuro, com acentos laranja.

---

## 4. Cadastro + Pagamento (resumo — detalhes em `PLANO_LP_E_PAGAMENTO.md`)

**Decisões já tomadas:** planos fixos mensais · **paga para ativar** · produto público (SaaS).

- **Quem paga:** a **empresa** (gestor). Funcionário entra com **código** e não paga (herda o plano).
- **Gate:** a assinatura vive na tabela **`empresas`** (`plan_status`). Sem `plan_status='active'`, o
  `ProtectedRoute` redireciona para **`/assinar`**. `role='admin'` (super-admin) nunca é bloqueado.
- **Fluxo:** cadastro empresa → `plan_status='inactive'` → `/assinar` → **Edge Function `stripe-checkout`**
  (Checkout Session, `mode: subscription`) → checkout hospedado → **`stripe-webhook`** ativa o plano → app liberado.
- **Backend = Supabase Edge Functions (Deno)** (não há servidor Next aqui): `stripe-checkout`, `stripe-webhook`,
  `stripe-portal`. Migration adiciona colunas de billing em `empresas`. **Ver o plano para o passo a passo completo,
  incluindo RLS, secrets e a nota de que subscription no Stripe BR só aceita cartão.**

---

## 5. Tarefas para o Claude Code (ordem sugerida)

**Fase 1 — LP visual (fazer primeiro, parar para revisão):**
1. Criar `src/pages/Landing.tsx` + `src/components/landing/*` com todas as seções da §3, dark + tokens de marca.
2. Adicionar as fontes de display (Sora/Space Grotesk) e o padrão de eyebrow/seção.
3. Demo animada do Hero (§3.1).
4. **Não** ligar backend ainda; CTAs apontam para `/login` e `/cadastro` (placeholders).

**Fase 2 — Roteamento + paywall (mock):**
5. Em `src/App.tsx`: rota pública `/` = `Landing` (se logado + plano ativo → redireciona ao app); mover o "home"
   do app (pipeline/AdminDashboard) para `/app`.
6. Criar `src/pages/Assinar.tsx` (cards de plano, banners de status) — ainda sem Stripe.
7. Estender `ProtectedRoute` com o gate de `plan_status` (usando `profile.empresas.plan_status`).

**Fase 3 — Backend de pagamento (seguir `PLANO_LP_E_PAGAMENTO.md`):**
8. Migration `supabase/migrations/<ts>_billing.sql` (colunas em `empresas` + RLS + ajuste do trigger de signup).
9. Edge Functions `stripe-checkout`, `stripe-webhook`, `stripe-portal` + `config.toml` + secrets.
10. Ligar `/assinar` ao checkout/portal e refletir `plan_status` real. Atualizar `src/integrations/supabase/types.ts`.

**Fase 4 — QA:** cadastro empresa → pagamento → liberação; funcionário grátis; falha de pagamento; admin sem bloqueio.

---

## 6. Critérios de aceite

- LP em `/` fiel à identidade Repply (dark `#0A0A0A`, laranja `#FF5A1F`, gradiente nos CTAs, eyebrows em caixa
  alta com badge "r.", headlines grandes com keyword laranja, barra de progresso laranja). Responsiva.
- Reutiliza os tokens de `src/index.css` e o logo existente — **sem hardcode de cor** fora dos tokens.
- Usuário deslogado vê a LP; logado com plano ativo é levado ao app; logado sem plano cai em `/assinar`.
- `npm run build` e `npm run lint` passam. Nada do app atual quebra (tema, rotas protegidas, RLS).
- Nenhum preço inventado: placeholders + pergunta ao Vinicius.

---

## 7. Decisões pendentes (perguntar ao Vinicius antes das Fases 3+)

1. **Preços e limites** dos 3 planos (Starter/Pro/Business) — valores e nº de usuários por plano.
2. **Vocabulário do produto:** manter termos atuais (fabricantes/pedidos/representação) ou migrar para o
   imobiliário (empreendimentos/lançamentos/incorporadoras)?
3. **Nome na LP:** "Repply Imob" (frente do Hub) vs só "Repply"?
4. **Boleto/PIX** no recorrente ou **cartão apenas**?
5. **Confirmação de e-mail** no lançamento: manter ou desligar (para o fluxo "paga para ativar")?
6. **Conta Stripe** do Repply/Grupo MD já existe? **Domínio** público para success/cancel/webhook.
7. **`max_seats`**: o que acontece ao estourar o limite de usuários do plano?

---

*Fontes da identidade: instagram.com/repply.hub · repplyhub.com.br · `src/index.css` (Repply Brand System V2.0).*
