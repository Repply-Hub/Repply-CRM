# E-mail — Leitor com visualização por conversa (unificada) — Design

**Data:** 2026-09-22
**Origem:** validação da reforma "estilo Gmail" (spec
`2026-09-21-email-reforma-compositor-acoes-autocompletar-design`, etapas C/D
publicadas). O Lucas apontou que o leitor mostra a conversa em **dois formatos
que convivem** e pediu escolher um só.

## Problema

Hoje o leitor (`src/components/email/LeitorEmail.tsx`) trata a conversa em duas
peças com aparências e caminhos diferentes:

- a mensagem aberta (`selectedEmail`) é renderizada **por extenso** no topo
  (assunto grande, cabeçalho, corpo inteiro, anexos);
- as demais mensagens da mesma thread aparecem embaixo como **cards** sob
  "Nesta conversa (N)".

Não há duplicação literal (a lista exclui a mensagem aberta — `Emails.tsx`
filtra `m.id !== selectedEmail.id`), mas o "(N)" conta a aberta junto e só as
outras aparecem ali, então parece inconsistente/repetido. O Gmail tem **um
formato só**: a conversa inteira empilhada, com as antigas recolhidas.

Decisão do dono do produto (22/09): **visualização por conversa, unificada.**

## Decisões (fechadas com o Lucas)

1. **Um formato só, mais recente no topo.** Uma lista única de mensagens da
   conversa, ordem mais-recente-primeiro (mantém a decisão de 21/09). Acaba o
   "principal por extenso + cards diferentes".
2. **Aberta × recolhida (estilo Gmail).** A mensagem que a pessoa abriu e as
   **não lidas** já vêm abertas; as demais vêm **recolhidas** (uma linha).
   Clicar na linha abre; clicar no cabeçalho de uma aberta recolhe.
3. **Ações: topo + menu por mensagem.** No topo, Responder / Responder a todos /
   Encaminhar agem na mensagem **mais recente**. Cada mensagem aberta tem um
   menu **⋮ próprio** para agir só nela.
4. **Resposta no topo** (acima da mais recente), como já ajustado em `5028d672`.
5. Some o "Responder" solto do rodapé (redundante).

## Design

### 1. Estrutura visual (novo layout do `LeitorEmail`)

De cima para baixo, dentro do painel de leitura:

```
[ Barra de ações (fixa) ]  Voltar | ……… | Responder  Responder a todos  Encaminhar
[ Assunto da conversa (h1) ]
[ Caixa de resposta inline ]        (só quando respondendo/encaminhando)
[ Mensagem #1 — a mais recente ]    (aberta ou recolhida conforme a regra)
[ Mensagem #2 ]
[ … ]
[ Mensagem #N — a mais antiga ]
```

- **Barra de ações (topo):** Voltar (esquerda) + Responder / Responder a todos /
  Encaminhar (direita), agindo na **mensagem mais recente** da conversa.
  "Responder a todos" só aparece quando a mais recente tem mais de um
  destinatário (mesma regra de `podeResponderATodos`, aplicada à mais recente).
  O menu ⋮ do topo **deixa de existir** — marcar não lida / mover / excluir
  passam para o ⋮ de cada mensagem.
- **Assunto (h1):** o assunto da conversa, uma vez, no topo.
- **Caixa de resposta inline:** logo abaixo do assunto, acima da lista, como já
  está hoje (`compositorInline`).
- **Lista de mensagens:** todas as da thread, mais recente primeiro, cada uma
  no MESMO componente (`MensagemConversa`), recolhível.

Conversa de mensagem única: a lista tem 1 item, aberto — sem nada de "Nesta
conversa".

### 2. Componente `MensagemConversa` (recolhível)

Novo componente em `src/components/email/MensagemConversa.tsx`, um por mensagem
da lista. Substitui os dois caminhos de hoje (a "principal" embutida no
`LeitorEmail` e os cards de "Nesta conversa").

**Recolhida** — uma linha clicável:
`[inicial/avatar]  Nome do remetente     trecho (snippet)…        data   [•não lida] [📎]`
- inicial do remetente (ou ícone de "enviada" quando `tipo === 'sent'`);
- nome (ou "Você" quando enviada);
- trecho: `snippet` (já disponível na consulta — **não** busca o corpo);
- data curta;
- selo de não lida (ponto) quando recebida e `lido === false`;
- clipe de anexo quando `tem_anexo`.
Clique na linha → expande.

**Aberta** — cabeçalho + corpo + anexos + ações:
- cabeçalho: remetente (nome + e-mail clicável), "para …" (destinatários),
  Cc, data, selo "Você respondeu" quando couber — o que o cabeçalho atual já
  mostra, por mensagem;
- corpo: `CorpoEmail` (o mesmo de hoje, com sanitização/endereços clicáveis);
- anexos da mensagem (exibição, como hoje);
- **menu ⋮ da mensagem:** Responder / Responder a todos / Encaminhar **aquela**,
  Marcar como não lida (só recebida), Mover, Excluir.
- clicar no cabeçalho de uma aberta → recolhe.

Props (interface bem definida, testável isoladamente):
`{ mensagem, emailDaConta, aberta, onAlternar, carregandoCorpo, onClicarEndereco,
onResponder, onResponderATodos, onEncaminhar, onMarcarNaoLido, onMover, onExcluir }`.
As de ação recebem a própria `mensagem` (a página decide o efeito).

### 3. Dados da conversa (consulta enriquecida)

A consulta da thread (`Emails.tsx`, hook da conversa) passa a trazer **todas** as
mensagens da thread (inclusive a que foi aberta), com o que responder-a-todos /
encaminhar de cada uma precisam:

`id, direcao, data_mensagem, remetente_nome, remetente_email, destinatarios,
cc, bcc, assunto, snippet, lido, nylas_message_id, nylas_thread_id,
caixa_origem, tem_anexo`

Ordenada por `data_mensagem` **descendente** (mais recente primeiro), filtrando
`excluido = false`. O tipo `MensagemDaConversa` cresce para carregar esses
campos (hoje só tem `id, tipo, remetente, data, html, snippet, lido`).

### 4. Corpo sob demanda (desempenho)

Hoje o corpo de TODAS as mensagens da conversa é buscado de uma vez
(`Promise.all(outras.map(carregarCorpo))`). Com o recolhimento, isso vira
desperdício (busca corpo de mensagem que ninguém abriu).

Novo comportamento:
- mensagem **recolhida**: mostra só o `snippet` (já na consulta) — **não** busca
  o corpo;
- mensagem **aberta** (por padrão ou por clique): busca o corpo sob demanda via
  `carregarCorpo(id)` (já cacheado por mensagem em `use-email-empresa.ts`, e já
  devolve `{ html, anexos }` desde o D). Enquanto busca, mostra "carregando…".

Resultado: a conversa abre mais rápido (só o corpo das abertas), e reabrir uma
mensagem é instantâneo (cache).

### 5. Quais vêm abertas por padrão

Estado local no `LeitorEmail`: um conjunto de ids expandidos (`expandidos`),
semeado na abertura da conversa com:
- a mensagem que a pessoa abriu (o `selectedEmail.id` que trouxe até aqui);
- toda mensagem **recebida não lida** (`tipo === 'received' && lido === false`).
As demais começam recolhidas. Clique alterna (abre/recolhe) e persiste enquanto
a conversa está na tela.

### 6. Ações — quem é o alvo

- **Topo (Responder / Responder a todos / Encaminhar):** alvo = a **mensagem
  mais recente** da conversa.
- **⋮ de uma mensagem:** alvo = **aquela** mensagem.

Os handlers de hoje (`responderMensagem`/`responderATodos`/`encaminharMensagem`
em `Emails.tsx`) leem de `selectedEmail`. Passam a receber a **mensagem-alvo**
como argumento (o topo passa a mais recente; o ⋮ passa a própria). A citação, o
"Para"/"Cc", o assunto "Re:/Enc:", o `respondendoA` (nylas_message_id) e o
`encaminhandoDe` saem dos campos DESSA mensagem. O `inlineParaId` (a trava de
troca-de-modo, `troca-compositor.ts`) passa a ser o id da mensagem-alvo — assim
trocar de modo respondendo a MESMA mensagem segue sem o aviso de rascunho, e
responder a OUTRA mensagem da conversa protege o rascunho (comportamento certo).

Marcar não lida / Mover / Excluir por mensagem reutilizam os fluxos que já
existem (`marcarNaoLido`, `MoverParaMarcadorDialog`, `deleteEmailMutation`),
recebendo o id da mensagem. Excluir uma mensagem da conversa a remove da lista;
se for a última mensagem visível, volta para a caixa.

### 7. O que NÃO muda

- Ordem mais-recente-primeiro; caixa de resposta no topo.
- Responder/Responder a todos/Encaminhar e o encaminhar-com-anexos (D) e a
  trava de troca-de-modo (`5028d672`) — só ganham o parâmetro de alvo.
- Sanitização/segurança do corpo (`CorpoEmail`), endereços clicáveis, colapso de
  listas grandes de destinatário.
- A caixa de entrada (lista) segue por mensagem; abrir uma abre a conversa dela.

## Componentes e responsabilidades

| Unidade | Responsabilidade |
|---|---|
| `LeitorEmail.tsx` | Casca da leitura: barra de ações (topo, alvo = mais recente), assunto, caixa de resposta inline, e a LISTA de `MensagemConversa`. Guarda o estado `expandidos`. Não conhece HTML de e-mail nem consulta. |
| `MensagemConversa.tsx` (novo) | Uma mensagem: recolhida (linha) ou aberta (cabeçalho + `CorpoEmail` + anexos + ⋮). Recebe tudo por prop; não busca dados. |
| `CorpoEmail` (existe, extrair de `LeitorEmail`) | Corpo sanitizado de UMA mensagem. Já é isolado; passa a ser importado por `MensagemConversa`. |
| `Emails.tsx` | Consulta da conversa (enriquecida), estado do compositor, e os handlers de ação recebendo a mensagem-alvo. |
| `use-email-empresa.ts` | `carregarCorpo(id)` sob demanda (já existe, já devolve `{html,anexos}`). |

## Testes

- `MensagemConversa`: recolhida mostra remetente/trecho/data e NÃO o corpo;
  aberta mostra o corpo e o ⋮; clique alterna; "Responder a todos" no ⋮ só
  aparece com >1 destinatário.
- Regra de "quais abrem por padrão" como função pura testável
  (`mensagens-abertas-por-padrao.ts`): a aberta + as não lidas.
- Alvo das ações do topo = a mais recente (função pura ou teste de fiação).
- `troca-compositor`: segue válido; `inlineParaId` por mensagem-alvo.
- Verificação padrão (§9 CLAUDE.md): `tsc` no baseline, `vitest` não cai, build.

## Riscos / armadilhas

- `LeitorEmail` é grande e tem lógica de pós-processamento do corpo
  (`colapsarListasDeDestinatarios`, `tornarEnderecosClicaveis`) — fica em
  `CorpoEmail`, que já é isolado; extrair `CorpoEmail` para arquivo próprio evita
  duplicar isso em `MensagemConversa`.
- `tem_anexo` na consulta serve só ao selo da linha recolhida; a lista real de
  anexos (com ids) vem no `carregarCorpo` ao abrir.
- Não regredir a trava de troca-de-modo nem o encaminhar-com-anexos: os handlers
  só ganham o parâmetro de alvo; o resto do corpo deles não muda.
- Nada de servidor: é tudo tela. `email-enviar` (v15) já cobre o envio.
