# Repply CRM

**O CRM que fala a sua língua.** SaaS multi-empresa para representantes comerciais —
funil de vendas, carteira de clientes, obras no mapa, catálogo das marcas representadas,
metas por fábrica, WhatsApp e e-mail no mesmo lugar.

Produto da **Repply** (Grupo MD · Natal/RN). Cliente-âncora: **MD Representações**.

> **Em produção, com cliente pagante.** Não é protótipo. Ver a seção
> [Antes de mexer](#antes-de-mexer).

---

## Índice

- [Antes de mexer](#antes-de-mexer)
- [Documentos de referência](#documentos-de-referência)
- [Stack](#stack)
- [Estado atual](#estado-atual)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Scripts](#scripts)
- [Git e publicação](#git-e-publicação)
- [Titularidade e acessos](#titularidade-e-acessos)
- [Glossário](#glossário)

---

## Antes de mexer

Três fatos que mudam como se trabalha neste repositório:

1. **A Vercel publica sozinha a cada envio para `main`.** Não existe etapa de aprovação
   automática entre o commit e o cliente.
2. **Quase não existe rede de proteção automática.** São 10 arquivos de teste para 78 mil
   linhas; o TypeScript está configurado de forma frouxa de propósito; e o `npm run lint`
   **não passa** — são 498 problemas herdados no `main`. O critério prático é *o número
   não subir*, não *o lint passar*.
3. Somando 1 e 2: **nada é commitado sem autorização explícita do dono do produto.** O
   trabalho vai direto no `main`, como o time já faz — a barreira é humana, pedida antes de
   cada commit, e não um Pull Request. Ver [Git e publicação](#git-e-publicação).

---

## Documentos de referência

Leia nesta ordem antes de tocar no código:

| Documento | O que contém |
|---|---|
| **[SPEC.md](./SPEC.md)** | O produto: domínio da representação, estado real de cada módulo, modelo de dados, escopo por fase, decisões e porquês |
| **[CLAUDE.md](./CLAUDE.md)** | Regras de engenharia, vocabulário e as armadilhas já medidas neste código |
| **[docs/README.md](./docs/README.md)** | Índice do detalhe técnico por assunto |
| **[docs/divida-tecnica.md](./docs/divida-tecnica.md)** | O que está quebrado, com custo e ordem de conserto |

---

## Stack

| Camada | Tecnologia |
|---|---|
| **Build** | Vite 5 + TypeScript |
| **Framework** | React 18 + React Router 6 |
| **UI** | shadcn-ui (Radix) + Tailwind CSS 3 |
| **Dados** | TanStack Query 5 |
| **Formulários** | React Hook Form + Zod |
| **Gráficos** | Recharts · **Mapas** Google Maps + Leaflet |
| **Backend** | Supabase — Postgres, Auth, Storage, Edge Functions (Deno) |
| **Cobrança** | Stripe |
| **E-mail** | Nylas · **WhatsApp** uazapi |
| **Testes** | Vitest + Testing Library (jsdom) |
| **Deploy** | Vercel |

---

## Estado atual

**Sólido e em uso diário:** Negócios (Kanban e lista), Clientes e Contatos, Obras com
mapa, Fabricantes e catálogo, Dashboard, Plano de Vendas, Tarefas, Chat interno,
Configurações com permissões granulares.

**Funciona, mas tem ressalva conhecida:**

| Módulo | A ressalva |
|---|---|
| WhatsApp | Falha de segurança em aberto (chave da instância legível) |
| E-mail | A sincronização automática nunca rodou — só atualiza no clique |
| Calendário | O lembrete de evento nunca foi enviado |
| Portal de Consultas | Só cobre o Rio Grande do Norte. Vira exclusividade da MD |
| Admin | Falta ligar e desligar seções por empresa |
| Assinatura | Código pronto; cobrar de verdade depende de configuração fora do repositório |

**Quebrado e bloqueando:**

| Módulo | O problema |
|---|---|
| **Importação** | Problema de formatação de datas trava a migração da base do Bitrix24. É a **prioridade zero** do projeto |

Detalhe módulo a módulo em [SPEC.md §5](./SPEC.md#5-estado-real--módulo-a-módulo).

---

## Rodando localmente

### Pré-requisitos

- Node.js 20+
- npm
- Acesso ao projeto Supabase (ou um projeto próprio com as migrations aplicadas)

### Passos

```sh
npm install
cp .env.example .env    # e preencha os valores
npm run dev
```

O servidor sobe em **http://localhost:8080**. Ao subir, ele imprime no terminal qual
`VITE_SUPABASE_URL` está usando — confira, para não trabalhar apontando para o banco
errado.

> ⚠️ **Não existe Supabase local neste projeto.** O ambiente de desenvolvimento aponta
> para um projeto Supabase real. Escrever uma migration **não é** aplicá-la: quem aplica é
> quem tem acesso ao projeto (`supabase db push`).

---

## Variáveis de ambiente

### No `.env` (usadas pelo site)

| Variável | Para quê | Obrigatória |
|---|---|---|
| `VITE_SUPABASE_URL` | Endereço do projeto Supabase | sim |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública do Supabase (vai no navegador, é pública por natureza) | sim |
| `VITE_SUPABASE_PROJECT_ID` | Identificador do projeto | sim |
| `VITE_GOOGLE_MAPS_API_KEY` | Mapa e geocodificação das obras | não — sem ela o mapa entra em modo de demonstração |
| `VITE_PAYWALL_ATIVO` | Liga o portão de assinatura | não |
| `SUPABASE_SERVICE_ROLE_KEY` | Usada só por scripts locais de manutenção. **Nunca vai para o navegador** | não |

### Nos segredos das Edge Functions (painel do Supabase)

Levantado direto do código das 37 funções:

| Segredo | Usado por |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Praticamente todas |
| `APP_URL` | Retornos de OAuth e do Stripe |
| `NYLAS_API_KEY`, `NYLAS_CLIENT_ID`, `NYLAS_API_BASE`, `NYLAS_WEBHOOK_SECRET` | E-mail |
| `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN` | WhatsApp |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cobrança |
| `LOVABLE_API_KEY` | Leitura de PDF de licença (`extract-natal-pdf`) |
| `GEMINI_API_KEY` | Função `import-data` — **órfã**, ver dívida técnica |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Legado do Gmail**, provedor antigo de e-mail |

> `NYLAS_API_BASE` define a região (`api.us` / `api.eu`) e **não pode ser trocada depois de
> criada a aplicação Nylas**.

O inventário completo, com o que trocar ao montar um ambiente novo, está em
[docs/arquitetura/integracoes-externas.md](./docs/arquitetura/integracoes-externas.md).

> **Nunca commite credencial.** O `.gitignore` cobre `.env`, mas o histórico do repositório
> já teve chave em texto puro — qualquer chave que tenha passado por lá deve ser tratada
> como comprometida e rotacionada.

---

## Banco de dados

Tudo mora em `supabase/`:

- **`supabase/migrations/*.sql`** — 252 arquivos com estrutura, políticas de segurança e
  funções. **Só acrescente**; nunca edite arquivo existente.
- **`supabase/functions/*`** — 37 funções de borda em Deno, para o que não pode rodar no
  navegador (segredo de API, raspagem, tarefa agendada). Cada uma é um diretório com
  `index.ts`.
- **`supabase/config.toml`** — diz quais funções aceitam chamada sem sessão de usuário, e
  **por quê** em cada caso. Leia os comentários antes de adicionar uma.

### A regra que importa

**A autorização real é a segurança por linha (RLS) do Postgres.** As políticas se apoiam
em funções como `is_admin()`, `is_gestor()`, `get_my_usuario_id()`, `get_my_empresa_id()`,
`usuario_in_my_empresa()`. Assuma que toda consulta vinda do navegador já chega filtrada —
e nunca tente reproduzir autorização apenas na tela.

### Tipos

`src/integrations/supabase/types.ts` é gerado a partir do banco, mas **não há banco local
para regenerar**. Ao criar uma função ou mudar uma tabela, atualize esse arquivo à mão.

---

## Estrutura do projeto

```
mdrepresentacoes/
├── SPEC.md · CLAUDE.md · README.md
├── docs/                      documentação técnica por assunto
├── public/
├── scripts/                   scripts de manutenção pontual (backfill, limpeza)
├── src/
│   ├── pages/                 29 telas, uma por rota
│   ├── components/
│   │   ├── ui/                shadcn gerado — camada-base, não editar
│   │   ├── layout/            casca do app, barra lateral, notificações
│   │   ├── shared/            componentes usados por vários domínios
│   │   └── <dominio>/         pedidos · clientes · obras · catalogo · chat ·
│   │                          tarefas · email · import · configuracoes · landing
│   ├── hooks/                 um hook por domínio, envolvendo TanStack Query
│   ├── lib/                   funções puras, sem React e sem rede
│   ├── integrations/supabase/ cliente e tipos (gerados)
│   ├── data/ · assets/ · utils/ · types/
│   └── test/                  configuração do Vitest
└── supabase/
    ├── migrations/
    └── functions/
```

**Onde as coisas ficam grandes:** `src/pages/WhatsAppInbox.tsx` (7.838 linhas) e
`src/pages/Negocios.tsx` (2.698) são de longe os maiores arquivos. Ao mexer neles, extraia
o pedaço tocado em vez de engordar mais.

---

## Scripts

```sh
npm run dev          # servidor de desenvolvimento na porta 8080
npm run build        # build de produção
npm run build:dev    # build sem minificar, para investigar erro de build
npm run lint         # eslint
npm run test         # vitest, uma passada
npm run test:watch   # vitest em modo contínuo
```

Rodar um teste específico:

```sh
npx vitest run src/hooks/whatsapp-phone.test.ts
```

Em `scripts/` há utilitários de manutenção pontual (preenchimento retroativo de campos,
limpeza). São de uso manual, não fazem parte do build.

---

## Git e publicação

O trabalho vai **direto no `main`**, como o time já faz. A barreira entre o código e o
cliente é a **autorização do dono do produto, pedida antes de cada commit** — não um Pull
Request.

**Os quatro passos, sem exceção:**

1. **Avisar** o que vai subir e esperar o "pode". A autorização é por commit; a anterior
   não vale para a próxima.
2. **Conferir se entrou commit de outra pessoa** — outros colaboradores continuam subindo
   no `main`:
   ```sh
   git fetch origin
   git log --oneline HEAD..origin/main   # vazio = nada novo
   git status --short                     # vazio = área limpa
   ```
3. **Avaliar conflito.** Se apareceu commit novo tocando os mesmos arquivos, **parar e
   avisar** antes de juntar.
4. **Commitar e enviar** para o `main`, com mensagem no padrão convencional, em português:
   `fix(negocios): corrige lentidão na busca do pipeline`

**Publicação:** a Vercel publica automaticamente o que entra em `main`. Não há passo
manual — por isso a autorização prévia é a única barreira que existe.

O `vercel.json` tem duas regras que **parecem** decoração e não são (reescrita de rota com
exclusão de `/assets`, e tempos de cache distintos). A explicação de cada uma está em
[docs/arquitetura/integracoes-externas.md](./docs/arquitetura/integracoes-externas.md).
**JSON não aceita comentário e a Vercel recusa propriedade desconhecida** — não tente
documentar dentro do arquivo, o deploy falha.

---

## Titularidade e acessos

Este sistema foi construído por uma agência terceirizada e está em transferência para a
Repply. Situação em **19/08/2026**:

| Item | Situação |
|---|---|
| Domínio, Stripe, Nylas, arquivo de ambiente | ✅ Resolvidos |
| **Supabase** | ⚠️ Conta acessível, mas o projeto segue em organização de terceiro |
| **GitHub** | ⚠️ Temos envio, mas o repositório está em conta pessoal do desenvolvedor anterior |
| Vercel, uazapi, Google Cloud | ❌ Pendentes |
| Lovable | ✅ Dispensado (último commit do robô em 19/06/2026) |

**Por que isso está num README:** enquanto o projeto Supabase não for da Repply, toda
mudança de banco pode ser escrita mas não aplicada nem testada — e é aí que vive a maior
parte do trabalho neste projeto. Antes de prometer qualquer coisa que envolva banco,
confirme se o acesso já existe.

---

## Glossário

| Termo | O que é |
|---|---|
| **Negócio** | Um orçamento. No banco é `pedidos`. Objeto central do sistema |
| **Fabricante / representada** | A marca que o representante vende |
| **Obra** | O canteiro. Pode ter CNPJ próprio (SPE) |
| **Empresa** | O assinante do SaaS — **não** o cliente dele |
| **Cliente** | A empresa que compra do representante |
| **Etapa** | Coluna do funil, configurável por empresa |
| **Tabela de preços** | Lista de preços vigente de uma fábrica |
| **Orçamento parado** | Enviado e sem resposta há X dias. Maior fonte de perda de venda |
| **Alçada de desconto** | Até quanto o vendedor decide sozinho |
| **RLS** | Segurança por linha do Postgres — a autorização de verdade do sistema |
