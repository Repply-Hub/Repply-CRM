# SPEC — Repply CRM

Especificação do produto: o que o Repply CRM é, para quem, o que já faz de verdade,
o que falta e por que cada decisão foi tomada assim.

**Leia antes de construir qualquer coisa neste repositório.**

| | |
|---|---|
| **Produto** | Repply CRM — *o CRM que fala a sua língua* |
| **Marca-mãe** | Repply (Grupo MD · Natal/RN) |
| **Repositório** | `mdrepresentacoes` |
| **Cliente-âncora** | MD Representações |
| **Versão deste documento** | 1.0 — 19/08/2026 |

---

## Índice

1. [Visão do produto](#1-visão-do-produto)
2. [Personas e usuários](#2-personas-e-usuários)
3. [O ramo da representação comercial](#3-o-ramo-da-representação-comercial)
4. [A MD é cliente-âncora, não é molde](#4-a-md-é-cliente-âncora-não-é-molde)
5. [Estado real — módulo a módulo](#5-estado-real--módulo-a-módulo)
6. [Modelo de dados](#6-modelo-de-dados)
7. [Autorização](#7-autorização)
8. [Integrações externas](#8-integrações-externas)
9. [Escopo por fase](#9-escopo-por-fase)
10. [Decisões e justificativas](#10-decisões-e-justificativas)
11. [Riscos e dívida técnica](#11-riscos-e-dívida-técnica)
12. [Critérios de aceite](#12-critérios-de-aceite)

---

## 1. Visão do produto

### 1.1 Definição

O **Repply CRM** é um SaaS multi-empresa para **representantes comerciais**. Cada empresa
de representação tem seu espaço isolado, com sua equipe, suas marcas representadas, sua
carteira de clientes e sua configuração de funil.

O recorte de hoje é **representação de materiais de construção** — tanto quem vende B2B
para engenharia (o caso da MD) quanto quem vende para o varejo. Representantes de fora do
ramo da construção são um segundo momento, ainda sem data.

O produto nasceu como CRM/ERP interno da MD Representações, com escopo maior que o
Bitrix24 que a MD usava — principalmente no mapeamento de obras. A ambição sempre foi
virar produto de mercado, e já é: existem empresas de fora da MD usando o sistema.

### 1.2 Repply CRM × Repply Imob — a confusão que não pode voltar

São **produtos diferentes, com bases de código diferentes, para públicos diferentes.**

| | **Repply CRM** *(este repositório)* | **Repply Imob** *(outro repositório)* |
|---|---|---|
| Público | Representante comercial | Incorporadora, construtora, imobiliária |
| Vende | Produto de terceiros (representação) | Imóvel / unidade |
| Marca | Marca de mercado própria | Dentro da Repply Hub |
| Base técnica | Vite + React + Supabase | Next.js + Supabase |
| Vocabulário | Fabricante, obra, pedido, tabela de preços | Empreendimento, unidade, VGV, espelho de vendas |

> ⚠️ **A documentação herdada da agência erra isso.** O arquivo original
> `docs/HANDOFF_REPPLY_IMOB_LP.md` afirmava "este repositório (o CRM) é o Repply Imob".
> Está errado e foi corrigido (hoje é `docs/modulos/landing-e-assinatura.md`). Se algum
> documento, comentário ou texto de tela voltar a chamar este sistema de Imob, é engano —
> corrija.

### 1.3 O fluxo que define o produto

O funil do representante não é o funil de um CRM genérico. Ele passa por dentro da fábrica.

```
Lead entra (WhatsApp, telefone, indicação, showroom, prospecção em obra)
        |
        v
Qualificação — que obra, que fase, quem decide, que prazo
        |
        v
Cadastro do cliente NA FÁBRICA + análise de crédito       <- etapa que CRM nenhum modela
        |
        v
Montagem do orçamento — o jeito muda de fábrica para fábrica
        |
        v
Envio ao cliente
        |
        v
Follow-up                                                 <- onde a maior parte do dinheiro vaza
        |
        v
Fechamento -> pedido lançado na fábrica
        |
        v
Acompanhamento de entrega
        |
        v
A fábrica fatura o cliente e paga comissão ao representante
```

Duas consequências de produto saem daí, e valem para o sistema inteiro:

1. **O funil precisa ser configurável.** Cada representação organiza essas etapas de um
   jeito. As etapas do Kanban vivem em tabela (`kanban_colunas`), nunca em enum.
2. **Follow-up é onde o produto ganha ou perde.** Um CRM que só guarda o orçamento
   enviado não resolve a dor; ele precisa cobrar a resposta.

### 1.4 As dores que resolve

1. **Orçamento enviado que ninguém cobra.** O representante manda dezenas de orçamentos
   por mês e perde a conta de quais estão sem resposta e há quanto tempo. Vira venda do
   concorrente sem ninguém perceber.
2. **A operação não cabe numa planilha, mas também não cabe num CRM genérico.** As
   ferramentas de mercado não têm o eixo *fabricante* — e sem ele não existe meta por
   marca, tabela de preços por marca, nem leitura de desempenho por representada.
3. **Informação de campo que se perde.** Visita a obra, fase da obra, quem decide, o que
   o concorrente está fazendo: tudo vive na cabeça do vendedor e evapora quando ele sai.
4. **Falta de previsibilidade.** O dono não sabe quanto vai fechar no mês, nem quanto de
   meta cada fábrica está cobrando dele.

### 1.5 Modelo de negócio

- **Quem paga é a empresa de representação**, não o usuário. O gestor assina; os
  funcionários dele entram por código de acesso e herdam o plano.
- **Plano de Lançamento** — R$ 2.997/ano, usuários ilimitados, todos os módulos.
  O catálogo exibido na landing está em `src/lib/planos.ts`; a fonte de verdade do
  faturamento é a tabela `planos` (que guarda o `stripe_price_id`).
- **Cobrança:** Stripe, modelo *paga para ativar*. Cadastra → cai em `/assinar` →
  paga → o app libera para a empresa inteira.
- **O estado da assinatura vive em `empresa_assinaturas`**, ligado à empresa. Ver §7.3.

---

## 2. Personas e usuários

| Persona | O que precisa | Onde vive no sistema |
|---|---|---|
| **Dono da representação** | Número macro em dez segundos: quanto fechou, quanto falta pra meta de cada fábrica, quem está performando | Dashboard, Plano de Vendas |
| **Gestor comercial** | Funil inteiro do time, cobrança de meta, permissões de quem faz o quê | Negócios, Configurações → Usuários |
| **Vendedor interno** | "Com quem eu preciso falar agora" — orçamentos parados, follow-up do dia, WhatsApp | Negócios, WhatsApp, Tarefas, Calendário |
| **Vendedor externo (campo)** | Registrar o que viu na obra, achar obra nova, consultar preço no celular | Obras, Catálogo, Clientes |
| **Administrativo / financeiro** | Cadastro, importação de base, acompanhamento de pedidos lançados | Clientes, Importação, Negócios |
| **Super-admin da Repply** | Ver todas as empresas assinantes, ativar plano, provisionar WhatsApp, dar suporte | `/admin/*` |

**Tamanho da operação atendida:** de representante com 2 pessoas a equipe de 10+. O
produto não pode ficar complexo demais para o pequeno nem raso demais para o grande.

---

## 3. O ramo da representação comercial

Esta seção existe porque um CRM genérico não sabe estas quatro coisas — e é por não
saber que ele não serve para um representante. **Isto é modelo de produto**, não
preferência de cliente. O que é preferência está na §4.

### 3.1 A representação intermedia, ela não vende

A fábrica fatura o cliente final e emite a nota da mercadoria. O representante emite
nota de **serviço de representação** para a fábrica e recebe **comissão**. Essa comissão
é o faturamento dele.

> **Consequência de produto:** o valor do negócio (`pedidos.valor_total`) **não é a
> receita de quem usa o CRM**. É o valor que a fábrica vai faturar. A receita do
> representante é um percentual sobre isso.
>
> Hoje o sistema trata `valor_total` como o número principal em todos os painéis. Isso
> está correto para acompanhar meta de fábrica (a fábrica cobra volume vendido), mas
> significa que **o Repply ainda não sabe dizer quanto o representante ganhou.** É uma
> lacuna consciente, registrada em §9.

### 3.2 A representada é um eixo de primeira classe

Um representante trabalha para **várias fábricas ao mesmo tempo**. Todo negócio pertence
a um cliente **e** a uma fabricante. É esse segundo eixo que separa o Repply de um
Pipedrive ou de um RD Station.

Tudo que é por fábrica e não existiria num CRM comum:

- Meta por fabricante (`metas_vendas`), com meta de equipe e meta individual
- Tabela de preços e catálogo por fabricante (`tabela_precos`)
- Leitura de conversão e desempenho por fabricante no Dashboard
- Ordenação customizável das fábricas no Plano de Vendas

### 3.3 O cliente precisa de cadastro e crédito aprovado em cada fábrica

Antes de comprar, o cliente é cadastrado e tem o crédito analisado por **cada fábrica,
separadamente**. Fábrica diferente, cadastro diferente, resposta diferente. Uma pode
aprovar e outra recusar o mesmo cliente.

> **Consequência de produto:** isso é **etapa real do funil**, não burocracia externa. Um
> negócio pode estar parado esperando cadastro numa fábrica enquanto avança em outra.
>
> Hoje o sistema não modela isso. O funil configurável permite que a empresa crie uma
> etapa "Cadastro na fábrica", mas não existe registro de cadastro/crédito **por
> fabricante** para cada cliente. Lacuna registrada em §9.

### 3.4 O orçamento é o centro do ciclo

Vender, na representação, é montar orçamento, enviar e cobrar resposta. O artefato que
circula é o orçamento — não uma proposta comercial nem um contrato.

> **Consequência de produto:** o objeto central do sistema (`pedidos`, chamado de
> **Negócio** na tela) é o orçamento, e a coisa mais importante que o sistema pode fazer
> com ele é **saber há quanto tempo ele está sem resposta e cobrar**.

### 3.5 O princípio que atravessa tudo: o CRM registra, não interpreta

O sistema guarda o fato. Quem lê a causa é uma pessoa.

Exemplo concreto e decidido: **motivo de perda**. Registrar "perdeu por preço" é
obrigação do sistema. Concluir que a culpa foi da fábrica **não é** — porque perda por
preço também pode ser o vendedor que não construiu valor suficiente sobre o produto, ou
não gerou a confiança que faria o cliente comprar dele em vez do concorrente. Os dois
casos existem e se parecem igual no banco de dados.

> **Proibido:** painel que rotule motivo de perda como responsabilidade da fábrica, do
> vendedor ou de quem quer que seja. Mostre o número; a leitura é do gestor.

---

## 4. A MD é cliente-âncora, não é molde

A MD Representações é o caso real que valida o produto, e a documentação interna dela
(a wiki do Cérebro MD) é a fonte mais rica de domínio que existe. Mas **as escolhas
organizacionais da MD não são o mercado.** O que está listado aqui precisa ser
**configurável** e nunca pode virar regra embutida no sistema.

| Escolha da MD | O que o sistema não pode assumir |
|---|---|
| **Comissão coletiva** — bate a meta agregada, todo mundo recebe | Que a comissão é coletiva. Outros pagam por vendedor |
| **Sem carteira fixa** — qualquer vendedor atende qualquer cliente | Que cliente não tem dono. Muitas operações têm carteira |
| **Carteira dividida por marca**, não por cliente nem por região | Que a divisão é por marca |
| **Metas agrupadas por sinergia de marcas** (ex.: três marcas do mesmo grupo numa meta só) | Que meta é por grupo. Pode ser por marca, por vendedor, por região |
| **Quatro jeitos diferentes de montar orçamento**, conforme a fábrica | Um fluxo único de orçamento |
| **Régua 0–30 / 30–90 / 90+ dias** para classificar orçamento parado | Esses prazos. A régua tem que ser parametrizável |
| **Ranking individual não é público** (protege a cultura colaborativa) | Nem que ranking é bom, nem que é ruim — tem que ser opção |
| **B2B de engenharia** como canal principal | Que o cliente é sempre PJ. Há representante que vende para varejo e para pessoa física |
| **Prospecção por licença pública no RN** | Que existe portal de licença. É exclusividade da MD — ver §9 |

> **Regra prática:** quando aparecer um pedido do tipo "a MD faz assim", a pergunta certa
> é *"isso vira configuração ou vira regra?"*. Só vira regra se estiver na §3.

---

## 5. Estado real — módulo a módulo

Escala usada: **Sólido** (pode confiar) · **Com ressalva** (funciona, mas tem pegadinha
conhecida) · **Quebrado** (não faz o que promete) · **Não existe**.

| # | Módulo | Rota | Estado | O ponto de atenção |
|---|---|---|---|---|
| 1 | Negócios (pipeline) | `/app` | Sólido | Tela mais complexa do sistema |
| 2 | Clientes e Contatos | `/clientes` | Sólido | — |
| 3 | Obras | `/obras` | Sólido | Depende de chave do Google Maps |
| 4 | Fabricantes e Catálogo | `/fabricantes` | Sólido | Virou por empresa só em 19/08/2026 |
| 5 | Portal de Consultas | `/portal` | Com ressalva | Só serve o RN. Vira exclusivo da MD |
| 6 | Dashboard | `/dashboard` | Sólido | — |
| 7 | Plano de Vendas | dentro do Dashboard | Sólido | — |
| 8 | Calendário | `/calendario` | Com ressalva | **Lembrete de evento nunca foi enviado** |
| 9 | Tarefas | `/tarefas` | Sólido | — |
| 10 | Chat interno | `/chat` | Sólido | — |
| 11 | WhatsApp | `/whatsapp` | Com ressalva | Falha de segurança aberta + arquivo de 7.838 linhas |
| 12 | E-mail | `/emails` | Com ressalva | **Sincronização automática nunca rodou** |
| 13 | Importação | dentro de cada tela | Sólido | Conversão de data corrigida em 19/08/2026 |
| 14 | Configurações e Permissões | `/configuracoes` | Sólido | — |
| 15 | Admin da Repply | `/admin/*` | Com ressalva | Falta o controle de seções por empresa |
| 16 | Landing e Assinatura | `/` e `/assinar` | Com ressalva | Código pronto; a cobrança depende de passos fora do código |

### 5.1 Negócios — o pipeline

O coração do sistema, e a tela mais complexa que existe nele (`src/pages/Negocios.tsx`,
2.698 linhas).

**O que faz:** mostra os negócios em Kanban ou em lista, a partir dos mesmos dados.
Filtros aplicados no servidor. Arrastar card muda a etapa. Ações em massa: mudar etapa,
trocar responsável e excluir — inclusive "excluir tudo que casa com o filtro atual",
sem precisar marcar item por item.

**O que tem de configurável por empresa:**

- **Funis** (`funis`) — mais de um funil por empresa
- **Etapas** (`kanban_colunas`) — nome, cor e ordem, por funil
- **Campos customizados** (`configuracoes_campos`) — inclusive obrigatoriedade
  **por etapa**: um campo pode ser exigido só quando o negócio chega em determinada
  coluna. A regra mora em `isCampoObrigatorioNaEtapa`; nunca leia `campo.obrigatorio`
  direto para campos de pedido
- **Colunas da tabela** (`configuracoes_tabelas`, `colunas_customizadas`)

**Pegadinhas conhecidas:** board e lista compartilham estado derivado (filtros, seleção),
então mexer em um costuma afetar o outro. A busca do pipeline já foi lenta e ganhou
índices dedicados em 17/08/2026 (`20260817120000_negocios_busca_indices.sql`) — não
desfaça isso sem medir.

**Auditoria completa dos filtros:** `docs/modulos/negocios.md`.

### 5.2 Clientes e Contatos

Duas entidades distintas: `clientes` é a empresa cliente, `contatos` são as pessoas dela.
Cada uma tem página de detalhe própria, por slug (`/clientes/:slug`, `/contatos/:slug`).

Tem importação e exportação por planilha, colunas configuráveis e histórico de interações
(`historico_contatos`).

### 5.3 Obras

O diferencial que motivou o produto a existir. Obra vinculada ao cliente, com endereço,
CNPJ da SPE e status configurável por empresa (`status_obras`, semeado por
`seed_default_status_obras`).

O endereço vira ponto no mapa por geocodificação: Google Maps primeiro, **Nominatim
(OpenStreetMap) como reserva** quando o Google recusa por limite. O reserva não custa nada
mas aceita só uma consulta por segundo — o limitador está em `use-geocode-obras.ts`.

Também existe `parse_endereco_livre` no banco, para transformar endereço escrito solto em
campos separados.

### 5.4 Fabricantes e Catálogo

Cadastro das representadas, mais catálogo de produtos e tabela de preços por fabricante,
com categorias e importação por planilha.

> **Mudança recente e importante:** até 19/08/2026 o catálogo e a tabela de preços eram
> **globais** — uma empresa via os preços cadastrados por outra. Foi corrigido para ser
> por empresa (`20260819124247_fabricantes_e_precos_por_empresa.sql`) e, no mesmo dia,
> a escrita deixou de exigir papel de gestor: qualquer membro da empresa cria e edita.

### 5.5 Portal de Consultas

Lê licenças de construção emitidas por órgãos públicos e transforma em lista de
prospecção. Fontes: **IDEMA** (licença ambiental do RN), **Diário Oficial de Natal** e
**Diário Oficial de Extremoz**. Alimentado por funções de borda mais uma rotina no GitHub
Actions (`.github/workflows/scrape-dom-natal.yml`).

É a maior função de borda depois do WhatsApp (`portal-scraper`, 957 linhas) e a única
parte do sistema que é geograficamente presa.

> **Decisão de produto (19/08/2026):** o Portal é **exclusividade da MD Representações**.
> Empresas assinantes não têm acesso. Isso exige um controle de seções por empresa que
> ainda não existe — ver §7.4 e §9.

### 5.6 Dashboard e Plano de Vendas

**Dashboard:** faturamento mensal (view `vw_faturamento_mensal`), conversão por vendedor,
rendimento por responsável, indicadores por usuário e exportação em PDF.

**Plano de Vendas:** metas por fabricante, com duas camadas — **meta de equipe** e
**meta individual**. Um vendedor comum vê a própria barra e a meta geral; o diálogo de
edição é do gestor. A ordem das fábricas na tela é customizável
(`plano_vendas_fabricante_ordem`).

Os dois somam no **servidor**, por função de banco (`dashboard_stats`,
`plano_vendas_progresso`), e não puxando os pedidos para o navegador. Mantenha assim: a
tabela `pedidos` já tem milhares de linhas.

### 5.7 Calendário, Tarefas e Chat

**Calendário** — eventos com participantes, criação em lote, visão por mês/semana/dia.

> 🔴 **O lembrete de evento nunca funcionou.** O agendamento existe no banco, mas nunca
> executou com sucesso. Detalhe e conserto em §11.

**Tarefas** — quadro Kanban próprio (`tarefas_kanban_colunas`), com responsável, prazo e
marcadores. Uma tarefa pode estar ligada a um negócio **ou a uma conversa de WhatsApp**,
o que é o embrião da cobrança de follow-up.

**Chat interno** — grupos, membros, confirmação de leitura com avatar de quem viu,
presença online. Funciona bem e é usado.

### 5.8 WhatsApp

A maior peça do sistema: 7.838 linhas só na página, mais 1.091 na função que recebe os
eventos. Provedor: **uazapi**.

**Faz:** conectar número por QR Code, caixa de entrada, envio de texto, mídia e áudio,
grupos (criar, gerenciar participantes), reações, apagar mensagem, foto de contato,
renomear contato, e responsável por conversa.

**Duas pegadinhas que já custaram caro:**

1. **O identificador de grupo é literal.** `whatsapp_conversas.telefone` guarda o
   identificador do grupo em dois formatos, e um deles tem hífen. Qualquer código que
   faça "limpar tudo que não é dígito" apaga o hífen e monta um destino inexistente — a
   uazapi responde sucesso e não entrega nada. Foi um bug silencioso por meses.
2. **A chave da instância está exposta.** Ver §11 — é a dívida mais grave em aberto.

Detalhe da arquitetura: `docs/modulos/whatsapp.md`.

### 5.9 E-mail

Provedor atual: **Nylas**. Antes era Gmail direto — a migração aconteceu, mas o código
antigo do Gmail ficou no repositório (`useGmail.ts`, `GmailSettings.tsx`, as funções
`gmail-*`) e a documentação herdada ainda descreve o Gmail como se fosse o provedor.

**Faz:** conectar caixa, sincronizar, pastas e marcadores, leitor, resposta na mesma
conversa, rascunho com salvamento automático (`email_rascunhos`) e assinatura com logo,
em modo texto ou imagem.

> 🔴 **A sincronização automática nunca rodou.** O espelho da caixa só atualiza quando
> alguém clica em atualizar na tela. Mesma causa do lembrete de evento — ver §11.

### 5.10 Importação

Assistente de três passos — enviar arquivo, mapear colunas, conferir e confirmar — com
reconhecimento aproximado de cabeçalho. Existe para Clientes, Negócios e Catálogo. As
linhas que não passam na validação vão para `linhas_ignoradas_importacao` e podem ser
revisadas em `/importacao/ignoradas`.

> 🔴 **É o bloqueio número um do projeto.** A migração da base do Bitrix24 para o Repply
> está travada por um problema de formatação de datas que a agência deixou sem corrigir.
> Enquanto isso, a MD roda os dois sistemas em paralelo.
>
> Pista já registrada no código: existe uma função de borda `import-data` **órfã** (nada
> na interface a chama) que converte datas usando IA, **sem** a regra brasileira de
> desambiguação dia/mês que o caminho real aplica em `sanitizeFieldValue`. Se algum dia
> ela for ligada, alinhe as duas primeiro.

Detalhe: `docs/modulos/importacao.md`.

### 5.11 Configurações e Permissões

Seis abas: **Perfil**, **Usuários**, **WhatsApp**, **Automação**, **Campos** e **Empresa**.

O controle de permissão é granular: para cada um dos **14 módulos**, define-se ver, criar,
editar e excluir, mais uma lista de **funcionalidades** específicas (importar, exportar,
mover card, enviar WhatsApp, gerar PDF, filtrar por vendedor…). Existem **presets** de
permissão para não configurar tudo na mão a cada usuário novo, e um registro de auditoria
das mudanças (`audit_permissoes`).

Novos usuários entram por **código de acesso** da empresa.

### 5.12 Admin da Repply

Área do super-admin, separada do resto (`AdminRoute`). Tem painel com total de empresas,
total de usuários e quem está perto do vencimento; gestão de empresas e seus usuários;
definição de plano; e provisionamento de instâncias de WhatsApp.

> **O que falta:** ligar e desligar **seções inteiras por empresa**. Ver §7.4.

### 5.13 Landing e Assinatura

Landing pública na raiz, cadastro, e o portão de pagamento em `/assinar` com Stripe
(checkout e portal do cliente). O código está pronto; o que falta para cobrar de verdade
é configuração fora do repositório, descrita em `docs/operacao/cobranca-stripe.md`.

### 5.14 Transversais

- **Notificações** (`notificacoes`, `notificacoes_leituras`) — leitura por usuário,
  corrigido em agosto/2026
- **Histórico de alterações** (`historico_alteracoes`) — auditoria de quem mudou o quê
- **Registro de erro** (`app_erros`) — erros do app gravados no banco

---

## 6. Modelo de dados

74 tabelas, 5 visões, cerca de 30 funções de banco, 252 migrations.

### 6.1 Multi-empresa

```
empresas (o assinante do SaaS)
   |
   +-- usuarios          (a equipe dele; carrega role e empresa_id)
   +-- empresa_assinaturas (estado do plano)
   +-- funis -> kanban_colunas
   +-- clientes -> contatos
   +-- obras
   +-- fabricantes -> tabela_precos
   +-- pedidos
```

O perfil do usuário logado é uma linha de `usuarios` com `empresas(*)` aninhado, montado
em `src/hooks/use-auth.tsx`. Um gatilho no cadastro cria as linhas de `empresas` e
`usuarios` a partir dos dados informados no `signUp`.

### 6.2 O núcleo comercial

**`pedidos`** é a entidade central — o que a tela chama de **Negócio**. Ele aponta para:

| Campo | Aponta para | Obrigatório |
|---|---|---|
| `cliente_id` | `clientes` | sim |
| `fabricante_id` | `fabricantes` | sim |
| `obra_id` | `obras` | não |
| `usuario_id` | `usuarios` (o responsável) | sim |
| `status` | a etapa do Kanban | sim |

Em volta dele: `itens_pedido` (as linhas do orçamento), `pedidos_historico_status` (por
onde o negócio passou e quando) e os anexos em storage.

### 6.3 Ambiguidades herdadas — leia antes de escrever qualquer consulta

Estas três já causaram bug e vão causar de novo se ninguém souber:

| Palavra | Significa duas coisas | Como não errar |
|---|---|---|
| **empresa** | `empresas` = o assinante do SaaS. Mas `clientes` tem um campo `empresa` de texto, que é o nome da empresa **cliente** | Inquilino é sempre `empresa_id`. O texto em `clientes` é dado do cliente, não vínculo |
| **vendedor** | A tabela `vendedores` virou `usuarios` em abril/2026, mas o nome antigo sobrou: `historico_contatos.vendedor_id`, as funções `is_gestor()`, `get_my_vendedor_id()`, `vendedor_in_my_empresa()`, a visão `vw_indicadores_vendedor` | Para código novo use `usuarios` / `usuario_id` / `get_my_usuario_id()`. Os antigos continuam funcionando como apelido — não remova sem varrer as políticas de segurança |
| **negócio / pedido** | Na tela é **Negócio**. No banco é `pedidos`. No domínio é um **orçamento** | Interface fala Negócio, código fala `pedido`. Não renomeie nem um nem outro por conta própria |

### 6.4 Mapa das tabelas por domínio

| Domínio | Tabelas |
|---|---|
| **Inquilino e acesso** | `empresas`, `usuarios`, `empresa_assinaturas`, `planos`, `stripe_eventos`, `permissoes_usuario`, `permissao_presets`, `perfis_customizados`, `audit_permissoes` |
| **Comercial** | `pedidos`, `itens_pedido`, `pedidos_historico_status`, `clientes`, `contatos`, `obras`, `status_obras`, `fabricantes`, `tabela_precos`, `historico_contatos` |
| **Funil e configuração** | `funis`, `kanban_colunas`, `configuracoes_campos`, `configuracoes_campos_etapas`, `configuracoes_tabelas`, `colunas_customizadas`, `marcadores` |
| **Metas** | `metas_vendas`, `plano_vendas_fabricante_ordem` |
| **Produtividade** | `tarefas`, `tarefas_kanban_colunas`, `eventos`, `chat_grupos`, `chat_grupo_membros`, `chat_mensagens`, `chat_mensagens_leituras`, `chat_geral_config` |
| **WhatsApp** | `whatsapp_conversas`, `whatsapp_mensagens`, `whatsapp_conversa_responsaveis`, `whatsapp_contatos_fotos`, `configuracoes_wapi`, `wapi_instancia_usuarios`, `mensagens_whatsapp` |
| **E-mail** | `email_contas`, `email_conta_usuarios`, `email_conta_grants`, `email_mensagens`, `email_pastas`, `email_rascunhos`, `email_conexao_estados`, `emails`, `emails_recebidos`, `gmail_tokens` |
| **Importação** | `linhas_ignoradas_importacao` |
| **Portal (exclusivo MD)** | `licencas_idema`, `licencas_natal`, `licencas_extremoz`, `dom_licencas` |
| **Interface** | `sidebar_preferences`, `sidebar_empresa_padrao`, `sidebar_empresa_padrao_historico` |
| **Operação e diagnóstico** | `notificacoes`, `notificacoes_leituras`, `historico_alteracoes`, `automation_logs`, `configuracoes_automacao`, `app_erros`, `debug_logs`, `webhook_debug` |
| **Legado / a aposentar** | `user_integrations`, `user_domains` (Resend, integração preparada e nunca concluída), `gmail_tokens` (provedor antigo de e-mail) |

### 6.5 Visões

`vw_faturamento_mensal` · `vw_indicadores_usuario` · `vw_indicadores_vendedor` (apelido
legado) · `vw_pedidos_inativos` · `vw_velocidade_por_fabricante`

---

## 7. Autorização

### 7.1 A regra de ouro

**A segurança real está no banco, não na tela.** Toda consulta que sai do navegador é
filtrada pelas políticas de segurança por linha (RLS) do Postgres. Esconder um botão não
protege nada; a proteção é a política.

As políticas se apoiam em funções auxiliares: `is_admin()`, `is_gestor()`,
`get_my_usuario_id()`, `get_my_empresa_id()`, `usuario_in_my_empresa()`.

### 7.2 Os papéis — são quatro, não três

| Papel | O que é | Alcance |
|---|---|---|
| **admin** | Super-admin da Repply | Todas as empresas. **Não** enxerga o pipeline comercial de ninguém — tem rotas próprias em `/admin/*` |
| **empresa** | Quem criou a conta da empresa assinante (o titular) | A própria empresa inteira |
| **gestor** | Membro promovido a gerente | A própria empresa inteira |
| **vendedor** | Membro da equipe | O que as permissões dele liberarem |

> ⚠️ **A função `is_gestor()` responde verdadeiro para três papéis: `gestor`, `admin` e
> `empresa`.** Ela não significa "tem o papel gestor"; significa "responde pela empresa".
> Quem lê a função pelo nome erra a interpretação — e as políticas de segurança dependem
> dela.

**Padrões de `has_permission` quando o usuário não tem linha configurada:** `ver` libera,
`criar` / `editar` / `excluir` bloqueiam. Ou seja, usuário novo enxerga tudo e não altera
nada até o gestor configurar.

### 7.3 Permissão por módulo, e o portão do plano

Duas camadas independentes:

1. **Permissão do usuário** (`permissoes_usuario`) — por módulo, com ver/criar/editar/
   excluir mais funcionalidades específicas. Configurada pelo gestor.
2. **Portão do plano** — se a assinatura da empresa não está em dia, a escrita é bloqueada
   no banco e a tela manda para `/assinar`. A regra fica num lugar só,
   `src/lib/plano-gate.ts`.

### 7.4 O que falta: controle de seção por empresa

Hoje existe `sidebar_empresa_padrao`, que define o **layout do menu** de cada empresa.
Isso é **cosmético**: esconde o item da barra lateral, mas não bloqueia a rota nem os
dados. Quem souber o endereço entra.

O que o produto precisa e não tem:

> **Um controle real de seções por empresa**, no painel de admin da Repply, com política
> de segurança no banco. Padrão: empresa nova recebe **todas as seções, menos o Portal de
> Consultas**, que fica ligado só para a MD Representações.

Isso é fase própria no roadmap — ver §9.

---

## 8. Integrações externas

| Serviço | Para quê | Escopo |
|---|---|---|
| **Supabase** | Banco, login, arquivos, funções de borda | Um projeto por ambiente |
| **Vercel** | Hospedagem do site | Publica sozinha a cada envio para `main` |
| **Stripe** | Cobrança da assinatura | Por ambiente |
| **Nylas** | E-mail (conectar, sincronizar, enviar) | Credencial por ambiente; caixa por usuário |
| **uazapi** | WhatsApp | Servidor por ambiente; instância por empresa |
| **Google Maps** | Mapa e geocodificação das obras | Chave por ambiente |
| **Nominatim (OpenStreetMap)** | Geocodificação reserva | Sem credencial |
| **Portais públicos do RN** | Licenças de construção | Exclusivo MD |
| **Lovable AI** | Leitura de PDF de licença | Por ambiente |
| **Gmail API** | *Legado* — substituído pelo Nylas | A aposentar |
| **Resend** | *Preparado e nunca concluído* | A decidir |

Inventário completo, com o que trocar em cada novo ambiente:
`docs/arquitetura/integracoes-externas.md`.

---

## 9. Escopo por fase

Ordem definida em 19/08/2026. **Uma fase não começa antes da anterior fechar**, salvo o
que estiver marcado como paralelo.

### Fase 0 — Importação *(prioridade 00, bloqueia tudo)*

**Por que primeiro:** é o único item que impede a MD de desligar o Bitrix24. Enquanto a
importação não funciona, a MD paga e opera dois sistemas, e o painel de metas não reflete
a operação inteira.

- ✅ **Corrigir o parsing de datas na importação de planilha** — feito em `446779ff`
- ✅ **Validar com a exportação real do Bitrix24, ponta a ponta** — 26.181 datas, 100%
- ⬜ **Reparar os 11.903 negócios já gravados com data trocada** — plano pronto em
  `docs/operacao/plano-reparo-datas.md`, aguardando autorização
- Decidir o destino da função de borda órfã `import-data`: integrar alinhando a regra de
  data, ou remover
- Migrar a base histórica da MD e conferir contagens

**Pronto quando:** a MD consegue importar a base completa do Bitrix sem linha ignorada por
data, e o Bitrix pode ser desligado sem perda.

### Fase 1 — Segurança *(começa junto com a Fase 0, não espera)*

**Por que segundo:** já existem empresas de fora usando o sistema. Risco aberto com
cliente pagante não espera roadmap.

- **Fechar a exposição da chave do WhatsApp** (detalhe e ordem obrigatória em §11.1)
- **Passar a validar quem chama o webhook do WhatsApp** — hoje o endpoint é público e não
  confere nada, então qualquer um pode injetar mensagem na caixa de entrada de uma empresa.
  O padrão certo já existe duas vezes no repositório (`stripe-webhook`, `email-webhook`)
- Concluir a transferência de titularidade: projeto Supabase e repositório GitHub
- Revisar o que mais está sem política de segurança no banco
- Rotacionar as credenciais que passaram por histórico público

**Pronto quando:** nenhuma credencial de terceiro é legível por quem tem só a chave
pública do app, e todos os serviços estão em conta da Repply.

### Fase 2 — Seções por empresa

**Por que terceiro:** é o que permite vender para fora sem entregar junto o Portal de
Consultas, que é exclusividade da MD.

- Modelo de seções habilitadas por empresa, com política de segurança no banco
- Tela no painel de admin da Repply para ligar e desligar
- Guarda de rota de verdade, não só esconder o item de menu
- Padrão: empresa nova recebe tudo **menos** o Portal
- Migrar a MD como a única empresa com Portal ligado

**Pronto quando:** um usuário de outra empresa que digite `/portal` na barra de endereço
recebe negativa, e nenhum dado de licença chega ao navegador dele.

### Fase 3 — Endurecer e refinar o que já existe

Frente contínua, sem data de fim.

| Item | O que é |
|---|---|
| **Agendamentos** | Fazer os lembretes de evento e a sincronização de e-mail funcionarem de verdade (§11.2) |
| **Testes** | Hoje são 7 arquivos para 78 mil linhas. Começar pelo que mais dói se quebrar: importação, permissões, portão de plano |
| **Quebrar as telas gigantes** | WhatsApp tem 7.838 linhas num arquivo só; Negócios, 2.698. Arquivo desse tamanho é difícil de mexer com segurança |
| **Aposentar o legado** | Código do Gmail, tabelas do Resend, apelidos de `vendedor` sem uso |
| **Desempenho** | Continuar tirando agregação do navegador e levando para o banco |
| **Refino de interface** | Ajustes acumulados no uso diário |

### Fase 4 — Vender para fora sem a gente no meio *(ainda não priorizada)*

Cadastro autoatendido, cobrança rodando sem intervenção, onboarding sem implantação
manual, suporte.

### Lacunas de domínio conhecidas *(sem data)*

Registradas porque saem direto da §3 e ainda não têm resposta no produto:

1. **Comissão.** O sistema não sabe quanto o representante ganhou — só quanto a fábrica
   vai faturar. Falta percentual por fabricante e previsto × realizado.
2. **Cadastro e crédito por fábrica.** Não existe registro de que o cliente X está
   aprovado na fábrica Y e recusado na fábrica Z.
3. **Cobrança de follow-up.** O sistema guarda o orçamento parado, mas não cobra ninguém
   por ele. É a dor número um da §1.4 e continua aberta.
4. **Motivo de perda.** Não é campo obrigatório nem categorizado.

### Fora de escopo

- Virar CRM genérico, sem o eixo fabricante
- Atender incorporadora ou imobiliária — isso é o Repply Imob, outro produto (§1.2)
- Expandir o Portal de Consultas para outros estados (decisão de 19/08/2026)

---

## 10. Decisões e justificativas

Registradas para ninguém reverter sem saber o custo. As três primeiras foram tomadas pela
agência e estão certas.

### 10.1 As etapas do funil são tabela, não lista fixa no código

Cada representação organiza o funil de um jeito, e o mesmo cliente muda de ideia com o
tempo. Etapa em lista fixa exigiria mudança de banco a cada ajuste. Vive em
`kanban_colunas`, por funil, por empresa.

### 10.2 O portão de plano libera em caso de dúvida, em vez de bloquear

O portão tem uma **lista fechada de situações que bloqueiam** (cancelado, não pago,
suspenso…). Qualquer outro valor libera, inclusive valor vazio ou desconhecido.

O contrário — só liberar quem estiver explicitamente "ativo" — parece mais seguro e é pior:
o site publica sozinho na Vercel, independente do banco. Se o site subir antes da mudança
de banco, a lista fechada trancaria **toda a base pagante** no paywall, sem volta rápida,
porque o arquivo já está espalhado na rede de distribuição. Com a lista de bloqueio, o pior
caso é o paywall ficar inerte por algumas horas.

Ficaram **de fora da lista de bloqueio de propósito**: cartão recusado com nova tentativa
em andamento, período de teste e cobrança em processamento. Cortar acesso na primeira
falha de cobrança gera cancelamento; o certo é avisar na tela.

### 10.3 O cache dos arquivos é de 7 dias, não de 1 ano

O padrão do mercado para arquivo com nome baseado no conteúdo é cache eterno. Aqui não
dá: a Vercel aplica o mesmo cabeçalho na resposta de **arquivo não encontrado**, e não há
como condicionar cabeçalho ao resultado. Um "não encontrado" guardado por um ano recria o
problema de cache envenenado. Sete dias entregam quase todo o ganho e qualquer erro se
cura sozinho numa semana.

Pela mesma razão, a regra de reescrita exclui `/assets`: sem a exclusão, arquivo
inexistente devolvia a página inteira com status de sucesso, e o navegador guardava página
no lugar de código.

### 10.4 Quem paga é a empresa, não o usuário

O modelo do ramo é uma empresa de representação com uma equipe pequena. Cobrar por usuário
criaria o incentivo errado — o gestor deixaria vendedor de fora do sistema para economizar,
e o CRM voltaria a não refletir a operação. Assinatura por empresa, usuários ilimitados.

### 10.5 O Portal de Consultas fica exclusivo da MD

*Decisão de 19/08/2026.* Expandir o Portal significaria construir e manter um raspador por
estado e por município — trabalho recorrente e frágil, que quebra sempre que um site
público muda de layout. Fica como vantagem da MD, e o produto vendido para fora não
promete prospecção por licença.

### 10.6 O CRM registra, não interpreta

*Decisão de 19/08/2026.* Ver §3.5.

### 10.7 A soma é feita no banco, não no navegador

Total, contagem e progresso de meta saem de função de banco ou de contagem exata do
servidor. Puxar milhares de pedidos para somar no navegador funcionava com a base pequena
e para de funcionar sem aviso conforme a empresa cresce.

---

## 11. Riscos e dívida técnica

Inventário completo em `docs/divida-tecnica.md`. Os três que mais importam:

### 11.1 A chave do WhatsApp está legível — exposição fechada, resto em aberto

**O que é:** as funções do WhatsApp gravam o pacote inteiro recebido da uazapi numa tabela
de diagnóstico (`webhook_debug`). A uazapi manda o próprio token dentro do pacote. A tabela
estava sem política de segurança, então quem tivesse a **chave pública do app** — que vai
dentro do JavaScript do site e é pública por natureza — conseguia ler. Uma requisição real
sem sessão, em 20/08/2026, devolveu `HTTP 200` e **71.009 linhas**, das quais **4.725** com
o token e **4.774** com o nome da instância.

**Exposição fechada em 20/08/2026.** Ver
[`docs/operacao/plano-blindagem-whatsapp.md`](docs/operacao/plano-blindagem-whatsapp.md)
para o estado de cada fase.

**O que isso permite:** falar direto com a uazapi, sem passar pelo Repply. Ler todas as
conversas da empresa, enviar mensagem se passando por ela e desconectar o número.

**Como aconteceu:** a tabela **não foi criada por migration** — não existe em nenhum dos
252 arquivos. Foi criada à mão pelo painel do Supabase, e por isso nunca passou por
revisão de código. É o motivo pelo qual isso escapou de todo mundo.

> **Registrado por honestidade:** a auditoria herdada descreve isso como risco "mantido
> por decisão do dono do produto". O dono do produto confirmou em 19/08/2026 que **a
> decisão não foi dele**. Isso não é risco aceito; é dívida a pagar.

**A ordem do conserto — corrigida em 20/08/2026.**

> ⚠️ **Este documento prescrevia a ordem inversa, e a justificativa estava errada.** Dizia
> para ligar a segurança por linha **por último**, porque "ligar antes de existir política
> bloqueia inclusive o diagnóstico". **Não bloqueia.** O diagnóstico é feito pelo painel do
> Supabase e pelas funções de borda, e ambos usam credencial de serviço, que passa por cima
> da segurança por linha por definição. Verificado na prática: depois de ligada, a consulta
> de diagnóstico continua funcionando e as funções continuam gravando.
>
> A premissa errada custava caro: mandava **esperar** a limpeza e o conserto do código para
> só então fechar um vazamento que estava ativo e crescendo ~1.200 linhas por dia.

A ordem correta, e a que foi seguida:

1. **Ligar a segurança por linha, sem política** — estanca a exposição em minutos e não
   quebra nada. ✅ feito em 20/08/2026
2. Parar de gravar o token
3. Apagar o acumulado e instalar prazo de guarda
4. Autenticar o webhook (ver §16 da dívida técnica) — **em modo observação primeiro**
5. Tirar o token do navegador

**Não termina aí:** o próprio site entrega o token ao navegador no fluxo de conectar o QR
Code (`use-whatsapp-inbox.ts` fala direto com a uazapi). Limpar a tabela fecha metade do
buraco; a outra metade é tirar essa conversa do navegador.

### 11.2 Os agendamentos nunca funcionaram

Dois agendamentos existem no banco — lembrete de evento (a cada 5 minutos) e sincronização
de e-mail (a cada 15). Em 05/08/2026 havia 3.656 execuções registradas, **todas com falha**,
desde a criação em 23/07.

**Consequência real:** lembrete de evento nunca foi enviado a ninguém, e a caixa de e-mail
só atualiza quando alguém clica em atualizar.

São três causas empilhadas, e a de cima esconde as de baixo. Duas exigem mudança de
configuração do banco (uma delas com reinício). O diagnóstico completo, com os comandos de
verificação, está em `docs/divida-tecnica.md`.

### 11.3 Praticamente não há teste automatizado

7 arquivos de teste para 78 mil linhas de código. E o `npm run lint` **também não passa** —
498 problemas herdados no `main` (medido em 19/08/2026), o que faz a ferramenta deixar de
servir como sinal: ninguém percebe quando 458 erros viram 459.

Somado ao fato de que **a Vercel publica sozinha a cada envio para `main`**, qualquer erro
chega ao cliente pagante em minutos.

É por isso que este projeto tem regra fixa: **toda alteração vai por branch e Pull
Request, nunca direto no `main`.** Ver `CLAUDE.md`.

### 11.4 Riscos de titularidade

| Item | Situação em 19/08/2026 |
|---|---|
| Domínio, Stripe, Nylas, arquivo de ambiente | Resolvidos |
| Supabase | Conta acessível, mas o projeto segue em organização de terceiro |
| GitHub | Temos envio, mas o repositório está em conta pessoal do desenvolvedor anterior |
| Vercel, uazapi, Google Cloud | Pendentes |

**Por que isso é o risco maior:** quem controla o projeto Supabase e o repositório tem
acesso muito além de qualquer falha do código. Concluir a transferência vale mais, em
segurança, do que qualquer correção técnica.

---

## 12. Critérios de aceite

### Fase 0 — Importação

- [ ] Uma exportação real do Bitrix24 importa sem nenhuma linha ignorada por causa de data
- [ ] Data no formato brasileiro (dia primeiro) é interpretada certo, inclusive nos dias
      ambíguos como 05/03
- [ ] Contagem de negócios, clientes e obras confere com a origem
- [ ] A função órfã `import-data` foi integrada com a mesma regra de data, ou removida
- [ ] A MD confirma que pode desligar o Bitrix24

### Fase 1 — Segurança

- [x] `webhook_debug` fechada para leitura pública — 20/08/2026, sem quebrar diagnóstico
- [ ] As funções pararam de gravar o token
- [ ] Nenhuma linha de `webhook_debug` contém token
- [ ] O webhook do WhatsApp confere quem está chamando
- [ ] O navegador não recebe mais o token da instância
- [ ] Projeto Supabase e repositório GitHub em conta da Repply

### Fase 2 — Seções por empresa

- [ ] Existe modelo de seções habilitadas por empresa, com política no banco
- [ ] O painel de admin liga e desliga seção por empresa
- [ ] Digitar `/portal` como usuário de outra empresa é negado, e nenhum dado de licença
      trafega
- [ ] Empresa nova nasce com todas as seções menos o Portal
- [ ] A MD é a única com Portal ligado

---

*Este documento é vivo. Quando uma decisão mudar, atualize aqui antes de mudar o código —
o SPEC é a fonte da verdade sobre o porquê.*
