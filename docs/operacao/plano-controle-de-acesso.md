# Controle de acesso a seções por empresa

**Situação:** o Repply CRM começou a receber assinantes de fora da MD, e há seção que não
pode ir junto — o Portal de Consultas é da MD. Hoje **não existe controle nenhum**, e o
Portal está aberto para todas as empresas.

**Estado:** desenho aprovado pelo dono do produto em 21/08/2026. **Nada implementado.**

**Resolve a dívida** [§8 — Controle de seção é só cosmético](../divida-tecnica.md#8-controle-de-seção-é-só-cosmético),
registrada como bloqueadora de venda, e o critério de pronto da Fase 2 do
[`SPEC.md`](../../SPEC.md) §12.

---

## 1. O que está provado

Medido no banco de produção em 21/08/2026.

| Fato | Medida |
|---|---|
| Controle de seção por empresa | **Não existe.** Nem tabela, nem tela, nem regra de banco |
| A função `has_funcionalidade` no banco | Existe e é **código morto** — zero chamadas no SQL e no frontend |
| Tabelas do Portal com leitura liberada para **qualquer** usuário logado | **4 de 4** (`licencas_idema`, `licencas_natal`, `licencas_extremoz`, `dom_licencas`) |
| Tabelas do Portal que aceitam **escrita** de qualquer usuário logado | **3** (inserção nas três; `licencas_idema` também aceita alteração) |
| Empresas com menu personalizado (o único "controle" existente) | **2 de 8** — as outras 6 caem no padrão, onde o Portal aparece |
| Empresas cadastradas | 8: MD Representações (13 usuários), JHS (3), House Design (2), MD duplicada (2), Climb (1), e 3 de teste |

**O vazamento não é público.** Testado sem sessão: o retorno é vazio. É entre clientes —
qualquer pessoa logada em JHS, House Design ou nas empresas de teste lê as licenças da MD, e
em três tabelas consegue gravar.

### Por que esconder na tela não resolve

O próprio código já registra isso num comentário: *"conveniência de navegação, não
segurança"* (`src/components/layout/AppSidebar.tsx:56-58`). Três furos confirmados:

1. Qualquer usuário **cria um atalho digitando o endereço à mão**
   (`src/components/layout/SidebarAddItemDialog.tsx:43`)
2. O usuário escreve o próprio menu — a regra de `sidebar_preferences` é `auth.uid() = user_id`
3. O padrão da empresa **nunca remove** item já salvo pelo usuário, só acrescenta o que falta
   (`src/hooks/use-sidebar-preferences.ts:125-128`)

---

## 2. As decisões tomadas

Todas do dono do produto, em 21/08/2026.

| # | Decisão | Escolha |
|---|---|---|
| 1 | Forma do controle | **Cada seção ligável por empresa, com presets** |
| 2 | O que "desligada" significa | **Recusa de verdade** — não é só sumir do menu |
| 3 | Granularidade | **Seções inteiras.** Nada de sub-recursos por ora |
| 4 | Relação preset ↔ empresa | **A empresa segue o preset**, com exceções por cima |
| 5 | Preset padrão | **Tudo o que existe hoje, menos o Portal** |
| 6 | Página de vendas | **Tira o Portal** — não prometer o que o assinante não recebe |

---

## 3. As seções

### Desligáveis — 8

| Seção | Atrito | O que reage ao desligar |
|---|---|---|
| **Portal** | baixo | 1 rota, 1 item de menu, 1 linha na matriz de permissões, 2 funções de servidor. **Exige regra nova no banco** |
| **Calendário** | baixo | 1 rota, 1 item, 1 linha. Ninguém depende dele — o desligamento mais limpo |
| **Chat interno** | baixo | 1 rota, 1 item, 1 linha, 1 contador de não lidas |
| **Obras** | médio | **11 pontos** espalhados (§3.1). Zero dado real hoje |
| **Tarefas** | médio | 5 painéis embutidos em cliente, contato, negócio e WhatsApp. Vínculos todos opcionais |
| **E-mail** | médio | 3 botões em telas de cliente/contato, central de notificações, assinatura no perfil |
| **Dashboard** | médio | O logo da barra lateral aponta para ele — vira link morto se sair |
| **WhatsApp** | **alto** | 8 pontos, incluindo uma seção do Dashboard, tarefas criadas a partir de conversa e uma aba de Configurações. **49.427 mensagens** gravadas |

### Núcleo — não desligáveis

**Clientes, Negócios, Fabricantes e Configurações.** Não é escolha de projeto: o banco exige
cliente e fabricante em todo negócio (`pedidos.cliente_id` e `pedidos.fabricante_id` são
NOT NULL, 11.909 de 11.909 preenchidos), e Negócios é a home autenticada (`/app`).

Sub-recurso desligável **dentro** de Fabricantes: a aba Catálogo. **Fora do escopo desta
rodada** (decisão 3).

### 3.1 Os 11 pontos de Obras

Serve de referência para a profundidade que "cascata" significa:

1. Rota `/obras` e a página
2. Painel "Obras Vinculadas" dentro do cliente — `ClienteDetalhe.tsx:699-825`
3. Campo Obra ao criar negócio — `NovoNegocioDialog.tsx:548`
4. Campo Obra ao editar negócio — `EditarPedido.tsx:186,268`
5. Coluna "Obra/Endereço" na lista e link no detalhe — `Negocios.tsx:303,1667-1678`
6. A consulta de negócios traz a obra embutida — `use-pedidos.ts:254,332`
7. A busca de negócios casa contra nome de obra — `use-pedidos.ts:141-149`
8. A consulta de clientes traz `obras(*)` embutido — `use-clientes.ts:14`
9. Coluna "Obra" nas exportações PDF e Excel — `generate-pdf.ts:68`, `generate-excel.ts:18`
10. Aba "Obras" em Configurações → Campos — `CamposTab.tsx:111`
11. Filtro por entidade "Obra" no Histórico — `HistoricoAlteracoes.tsx:21`

---

## 4. O desenho

### 4.1 Uma lista única de seções

Hoje existem **duas** listas canônicas que não batem:

| Lista | Onde | Quantos | Diferenças |
|---|---|---|---|
| A — barra lateral | `use-sidebar-preferences.ts:18-35` | 15 | tem 3 itens de admin; **não** tem `contatos` nem `pedidos` |
| B — matriz de permissões | `use-permissoes.ts:34+` | 14 | tem `contatos` e `pedidos`; **não** tem os de admin |

Compartilham 12: `dashboard`, `pipeline`, `clientes`, `obras`, `fabricantes`, `portal`,
`calendario`, `tarefas`, `chat`, `whatsapp`, `emails`, `configuracoes`.

**Criar uma terceira lista seria criar uma terceira verdade.** O desenho cria **uma lista
única de seções** no código, e as três coisas passam a consultá-la: o menu, a matriz de
permissões por usuário, e o controle novo.

Cada seção declara: identificador, rótulo, rota, se é desligável, e os identificadores
equivalentes nas listas A e B (para a reconciliação não quebrar o que já está salvo).

### 4.2 O banco

**Presets** — nome + conjunto de seções ligadas. Um deles é o padrão.

**Empresa → preset** — cada empresa aponta para um preset. **Empresa sem preset apontado
segue o preset padrão** — não existe estado "sem regra": empresa criada hoje, amanhã ou por
um caminho que ninguém previu cai no padrão, que é o comportamento seguro.

**Exceções por empresa** — linhas do tipo "esta empresa tem esta seção, apesar do preset".
A exceção **sempre ganha** do preset. A MD entra com uma linha: Portal ligado.

Toda tabela nova nasce por migration, com RLS habilitada e política escrita — só admin
global escreve; qualquer usuário logado lê o que vale para a própria empresa (precisa, para
o app perguntar).

### 4.3 A pergunta única

Uma função de banco responde *"a empresa desta pessoa tem a seção X?"*, resolvendo na ordem:

```
exceção da empresa  →  preset da empresa  →  padrão (ligada)
```

É a **mesma resposta** para o site e para as regras do banco. Sem isso, os dois divergem e
ninguém descobre até um cliente ver o que não devia.

> A função morta `has_funcionalidade` ou vira esta, ou é apagada na mesma migration.
> Não podem coexistir duas funções com o mesmo propósito e uma delas mentindo.

### 4.4 As três camadas de recusa

| Camada | O que faz | Onde | Vale para |
|---|---|---|---|
| **Menu** | O item some da barra lateral | Mecanismo já existe | Todas as 8 |
| **Rota** | Endereço digitado devolve "sem acesso" | `ProtectedRoute`, junto do portão de plano (`App.tsx:270-276`) | Todas as 8 |
| **Banco** | O dado não sai, nem por fora do site | Política de RLS | **Só o Portal**, por ora |

A camada de rota tem **dois precedentes no mesmo arquivo** — o portão de plano e a lista
fechada `ROTAS_DO_ADMIN_GERAL` (`App.tsx:243-250`). Não se inventa mecanismo novo.

**Atenção às rotas sem item de menu**, que uma guarda baseada em menu deixaria passar:
`/clientes/:slug` e `/contatos/:slug` (onde ficam os painéis de Obras e Tarefas),
`/pedidos/novo` e `/pedidos/:id/editar` (onde fica o campo Obra), `/importacao/ignoradas` e
`/historico`.

### 4.5 Por que a trava do Portal é simples

As quatro tabelas de licença **não têm coluna de empresa** — são dados públicos de licenças
ambientais, iguais para todo mundo. Então a regra não é *"esta linha é sua?"*, é
**"você tem o Portal?"**. Uma condição só, aplicada nas quatro tabelas.

As duas funções de servidor que o Portal chama (`portal-scraper`, `scrape-licencas-idema`,
mais `list-dom-editions`) rodam com credencial de serviço e **ignoram RLS por definição** —
precisam da mesma checagem escrita dentro delas.

### 4.6 A cascata

Uma verificação reutilizável no frontend — *"esta empresa tem a seção X?"* — aplicada nos
pontos onde a seção aparece espalhada. Para Obras são os 11 pontos de §3.1.

**Regra:** onde a seção some, some o **controle**, não o dado. Um negócio que já tenha obra
vinculada continua com ela no banco; o campo apenas deixa de aparecer. Religar a seção traz
tudo de volta intacto.

### 4.7 A tela de admin

Rota nova em `/admin/`, seguindo o molde de `AdminEmpresas.tsx` e `AdminWhatsAppInstancias.tsx`.

**Lista de empresas:** nome, nº de usuários, preset que segue, nº de exceções.

**Empresa aberta:** as 8 seções, mostrando de onde vem cada resposta — herdada do preset ou
exceção própria — e um jeito de criar ou remover exceção.

**Presets:** criar, renomear, e marcar quais seções entram.

### 4.8 Regra para o futuro

**Seção que já existe entra ligada — com uma exceção: o Portal.** No dia da publicação,
ninguém pode perder acesso ao que já usava, e por isso as 7 demais entram ligadas no preset
padrão. O Portal é o único que nasce desligado, porque é justamente o caso que motivou este
trabalho — e a MD recebe a exceção que o mantém.

**Funcionalidade nova nasce desligada**, e é liberada quando houver decisão de vendê-la.

---

## 5. O que NÃO entra nesta rodada

- **Sub-recursos** (aba Catálogo, importação, exportação) — decisão 3
- **Controle por pessoa** — já existe a matriz `permissoes_usuario`; este trabalho é por
  empresa. Os dois convivem: a empresa define o que **existe**, a matriz define quem **vê**
- **Pacotes comerciais e preço** — o preset é a ferramenta; a política de venda é decisão
  de negócio, separada
- **Os resíduos da marca MD** — o nome "MD Representações" está fixo em três geradores de
  PDF, no modelo de assinatura de e-mail e no texto padrão do WhatsApp (§7). É problema da
  mesma família e **não** deste plano

---

## 6. Riscos

| Risco | Como está tratado |
|---|---|
| Publicar e todo mundo perder acesso a tudo | Seção existente entra **ligada**; o padrão é permissivo. Só o Portal nasce desligado |
| A terceira lista de módulos brigar com as outras duas | Lista única desde o primeiro dia, com mapeamento para os identificadores já salvos |
| Guarda por menu deixar rota passar | A guarda é por rota, no `ProtectedRoute`, e a lista de rotas sem menu está em §4.4 |
| Fechar o Portal e quebrar a MD | A MD recebe a exceção **antes** de a regra do banco entrar em vigor. A ordem importa |
| As funções de servidor do Portal continuarem abertas | §4.5 — elas ignoram RLS e precisam da checagem escrita dentro |
| Matriz de permissões apontar para seção que não existe mais | A linha some da matriz junto com a seção |
| Desligar WhatsApp derrubar mais do que se espera | É a de maior atrito (8 pontos, 49 mil mensagens). Fica por último na implementação |

---

## 7. Achados vizinhos, fora do escopo

Levantados no mapeamento de 21/08/2026 e registrados para não se perderem:

- **A marca da MD vaza para outros assinantes.** "MD Representações" está fixo em
  `generate-pdf.ts:48,88`, `generate-conversa-pdf.ts:71,107`, `generate-dashboard-pdf.ts:60`,
  `assinatura-email.ts:125,135` e `use-whatsapp.ts:8`. **Hoje, se a JHS gerar um PDF, sai o
  nome da MD nele.**
- **Link quebrado em Obras:** clicar no nome da obra dentro do negócio navega para
  `/obras/{id}`, rota que não existe — cai em página não encontrada (`Negocios.tsx:1671`).
- **Badge de e-mail sempre zero:** `useUnreadEmails` lê `emails_recebidos`, tabela que o
  próprio banco marca como obsoleta e tem 0 linhas; o e-mail real está em `email_mensagens`
  (4.735 linhas) — `use-notificacoes.ts:94`.
- **Componente morto:** `src/components/WhatsAppQuickAction.tsx` não é importado em lugar
  nenhum.
- **Página órfã:** `src/pages/Catalogo.tsx` (465 linhas) não é importada em `App.tsx`.
- **`AdminDashboard.tsx`** é importado em `App.tsx:25` e nunca usado.

---

## 8. Como saberemos que funcionou

| Critério | Como se mede |
|---|---|
| Usuário de empresa sem Portal digitando `/portal` | Recebe negativa e **nenhum dado de licença chega ao navegador** — testado com requisição direta, não só olhando a tela |
| A MD continua com o Portal | Login real na MD, Portal funcionando igual a hoje |
| Nenhuma empresa perde acesso ao que já usava | Comparar as 8 seções, empresa a empresa, antes e depois |
| Trocar uma seção no preset | As empresas daquele preset mudam juntas; as com exceção não mudam |
| Obras desligada some por completo | Os 11 pontos de §3.1, conferidos um a um |
| Menu, rota e banco concordam | Nenhum caso em que o menu esconde e a rota deixa entrar, ou vice-versa |

---

## 9. Coordenação

Há **outra sessão de trabalho ativa na mesma pasta**, com dezenas de arquivos não
commitados. Antes de cada commit: `git fetch`, conferir commits novos, e **nunca**
`git add -A` — listar os arquivos um a um.

Os números de linha citados neste documento são do estado de 21/08/2026 e podem sair do
lugar. Os números de banco são do banco real.
