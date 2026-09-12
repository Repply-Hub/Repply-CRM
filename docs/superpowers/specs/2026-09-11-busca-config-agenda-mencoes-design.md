# Busca responsiva, Configurações, avisos da agenda e menções

**Data:** 11/09/2026
**Dono do produto:** Lucas
**Estado:** aprovado seção a seção em 11/09/2026, pronto para virar plano

---

## Por que este documento existe

Sete pedidos chegaram juntos, agrupados pelo dono do produto em quatro seções. São
quatro entregas independentes — cada uma com seu plano, sua publicação e sua
verificação — e nenhuma precisa da outra para funcionar.

A ordem, escolhida pelo dono do produto, é **1 → 2 → 3 → 4**:

1. **Barras de busca** — pequeno, sem banco, sem decisão de produto.
2. **Configurações** — data da assinatura, escolha de som, equilíbrio da tela.
3. **Calendário** — aviso aos participantes e vários lembretes.
4. **Menções** — o maior; vem por último.

Os blocos 3 e 4 mexem em avisos. O 3 vem antes por ser menor e não depender do 4.

---

## O que foi medido, e não suposto

Conferido contra a produção em 11/09/2026.

| fato | evidência |
|---|---|
| Caixas de busca com largura fixa, maiores que um celular | `EventDialog.tsx:455` `w-[400px]`, `NovaRotaVisitaDialog.tsx:661` `w-[400px]` e `:728` `w-[420px]`, `CampoDeResponsaveis.tsx:181` `w-[260px]`, `FigurinhasPopover.tsx:92` `w-[300px]`, além de vários `w-64/w-72/w-80` |
| O seletor de contato ao criar empresa | `ContatoSelector` em `Clientes.tsx:1272` e `ClienteDetalhe.tsx:1127` |
| `ativado_em` não é a data de início | `stripe-webhook/index.ts:226` grava `now()` a **cada** evento que libera acesso — renovação inclusive. Nas legacy guarda a hora da migration que as liberou |
| Legacy já aparece como cortesia | `situacao-empresa.ts:99` — `origem === 'legacy' \|\| 'cortesia'` → `'cortesia'` |
| Só uma empresa passa pelo Stripe hoje | Uma só, e ela é de teste. Nenhum cliente real é afetado pela troca de campo |
| O evento guarda um lembrete só | `eventos.lembrete_minutos int` + `lembrete_enviado bool` |
| Um evento com participantes é uma linha por pessoa | `use-eventos.ts:260` — mesmo `grupo_id`, `criado_por` = organizador |
| O robô de lembretes roda a cada 5 minutos e só grava no sininho | cron `eventos-lembrete` `*/5 * * * *`; `eventos-lembrete/index.ts:126` insere em `notificacoes` e nada mais |
| 86% dos eventos são só da própria pessoa | últimos 90 dias: 214 eventos — 185 só a própria pessoa, 24 com várias, 5 de rota de visita |
| O canal Geral quase não é usado | 13 mensagens desde sempre (7 nos últimos 30 dias), contra 308 diretas e 210 em grupos |
| E-mail do sistema é montado no código | `pauta-resumo-diario/corpo.ts` monta o HTML; envio pelo Resend. Nada a cadastrar no Supabase |
| Mensagem de chat não tem campo de menção | `chat_mensagens`: conteudo, usuario_id, grupo_id, recipient_id, lida… |
| Nota interna do WhatsApp é mensagem com `is_nota_interna = true` | `use-whatsapp-inbox.ts:1711`; entrada do usuário na janela "Adicionar nota" (`WhatsAppInbox.tsx:9672`) |
| Todo aviso de chat já vira aviso na tela | `use-notificacoes.ts:150` — qualquer INSERT em `chat_mensagens` de outra pessoa chama `avisarMensagemNova` |
| O chat não tem endereço por conversa | `use-notificacoes.ts:172` — o aviso leva para `/chat`, e não para a conversa |
| Os sons novos | 5 arquivos em `public/sons/opções secundárias/`, com volume de −14,3 a −25,7 LUFS (o padrão atual está em −14,8) |

---

## Decisões do dono do produto

Tomadas em 11/09/2026, todas dele:

1. **Sons: origem** — os 5 arquivos que ele colocou em `public/sons/opções secundárias/`,
   renomeados, **mais** alguns gerados por mim.
2. **Sons: alcance** — só o de notificação muda. O de envio fica como está.
3. **Data da assinatura** — pagante: data de início da assinatura no Stripe;
   cortesia: data de criação da empresa.
4. **Aviso do evento** — mensagem **direta** a cada participante (não o Geral), mais
   e-mail.
5. **Lembretes** — vão pelo mesmo caminho do aviso (sininho sempre; chat e e-mail
   quando o botão está ligado).
6. **Mudanças** — mudança de data/hora e cancelamento também avisam.
7. **Evento só da própria pessoa** — lembretes vão por sininho **e** e-mail.
8. **Participante retirado** — é avisado, como cancelamento para ele.
9. **Remetente da mensagem automática** — quem criou o evento.
10. **Forma de envio da agenda** — A: o banco anota, o robô envia.
11. **Menção: o que chega** — aviso na tela com som, registro no sininho e o @.
12. **@todos** — quem está naquela conversa.
13. **Nota do WhatsApp** — só quem atende aquele número aparece na lista.
14. **Onde o @ aparece** — lista de conversas **e** menu lateral.
15. **Conversa direta** — não tem menção.
16. **Forma de guardar a menção** — A: pela pessoa escolhida, não pelo nome escrito.

---

# Bloco 1 — Barras de busca

**O que muda:** só tamanho. Nenhum comportamento.

**A regra.** Uma caixa de busca — no campo, no menu suspenso ou dentro de um
diálogo — nunca passa da largura da tela. No celular ela ocupa a largura disponível.

**Como.**
- Menu suspenso com largura fixa vira `w-[min(<largura>,calc(100vw-2rem))]`: no
  computador fica igual a hoje, no celular encolhe.
- Menu suspenso que acompanha o campo continua usando
  `w-[--radix-popover-trigger-width]` (o `ContatoSelector` já faz isso), mas ganha
  o mesmo teto de largura.
- Campo de busca dentro de barra de ferramentas ganha `w-full` com `sm:w-<fixo>`,
  para quebrar de linha em vez de empurrar os vizinhos para fora.

**Levantamento.** As 32 telas que têm campo com placeholder de busca são abertas
em três larguras — **375 px** (celular), **768 px** (tablet) e **1280 px**
(computador). Entra no conserto o que corta, vaza, some ou fica ilegível. O
levantamento vira uma tabela no plano: tela, largura, defeito, conserto.

**Pré-requisito.** O sistema aberto e logado no navegador do app. Eu não digito
senha; se pedir login, o dono do produto entra.

**Verificação.** Cada conserto conferido nas três larguras, com captura de tela
de antes e depois.

---

# Bloco 2 — Configurações

## 2.1 Data de início da assinatura

**Onde:** aba **Assinatura** (`PagamentosTab.tsx`), no cartão principal, abaixo da
explicação. A aba continua visível só para quem já a vê hoje.

| situação | texto | fonte |
|---|---|---|
| pagante | "Assinatura iniciada em 15 de maio de 2026" | `empresa_assinaturas.assinatura_iniciada_em` |
| cortesia (inclui legacy) | "Cortesia desde 10 de março de 2026" | `empresas.created_at` |
| teste, teste vencido, bloqueada, nunca pagou | nada | — |

Data por extenso, no mesmo formato de "Renova em" (`porExtenso`).

**O campo novo.** `empresa_assinaturas.assinatura_iniciada_em timestamptz`, sem
"stripe" no nome: quando o provedor mudar, o novo preenche o mesmo campo. O
`stripe-webhook` grava `sub.start_date` (fixo dentro de uma mesma assinatura; uma
assinatura nova depois de um cancelamento traz a data dela) em todo evento que
tiver o valor.

**Sem preenchimento retroativo.** A única empresa pelo Stripe é de teste; ela
recebe a data no próximo evento do Stripe. Até lá a linha não aparece — nunca
se mostra data inventada.

**Por que não `ativado_em`:** ver a tabela de medições. Corrigir o `ativado_em`
fica fora deste bloco (ver "Fora deste documento").

## 2.2 Escolha do som de notificação

**Os arquivos.** A pasta `public/sons/opções secundárias/` vira
`public/sons/opcoes/` — acento e espaço em endereço de internet costumam quebrar
em servidor e cache. Os nomes vêm da análise do áudio (número de notas, altura,
duração); o dono do produto pode trocar qualquer rótulo.

| arquivo de origem | vira | rótulo | como soa (medido) |
|---|---|---|---|
| `dragon-studio-new-notification-3-398649.mp3` | `toque-suave.mp3` | Toque suave | 1 nota grave (Dó5), 0,5 s |
| `dragon-studio-notification-sound-effect-372475.mp3` | `plim.mp3` | Plim | 2 notas subindo (Fá#5 → Fá6), 1,1 s |
| `universfield-new-notification-051-494246.mp3` | `cristal.mp3` | Cristal | 2 notas muito agudas (Mi6 → Mi7), 2,5 s |
| `universfield-new-notification-059-494262.mp3` | `arpejo.mp3` | Arpejo | 3 notas subindo (Fá#4, Ré5, Lá5), 2,2 s |
| `universfield-new-notification-062-494544.mp3` | `pop.mp3` | Pop | 1 nota seca (Si5), 1,1 s |

**Os gerados por mim** — sintetizados em código (numpy → ffmpeg), sem direito
autoral por construção, também em `public/sons/opcoes/`: **Marimba**
(`marimba.mp3`, duas notas de madeira descendo), **Sino** (`sino.mp3`, sino com
cauda longa), **Gota** (`gota.mp3`, bolha que desce de tom) e **Bipe duplo**
(`bipe-duplo.mp3`, dois toques curtos e suaves). O script que os gera fica em
`scripts/gerar-sons-de-notificacao.py`, para poder regerar.

**Volume.** Todos os arquivos de opção são nivelados para o volume do padrão
(≈ −15 LUFS). Sem isso, trocar de som mudaria o volume — o Arpejo está hoje 11 dB
abaixo do padrão. O `notificacao.mp3` atual não é tocado.

**Licença.** Pelo nome, os 5 arquivos vêm do Pixabay, cuja licença permite uso
dentro de um produto sem crédito. O dono do produto confirma a origem.

**A tela.** No cartão **Aviso sonoro**, abaixo do liga/desliga, um link
"Quero mudar o som das minhas notificações", **fechado por padrão**. Aberto, mostra
a lista: primeiro **Padrão**, depois os 5 dele, depois um rótulo discreto "criados
pela Repply" e os 4 gerados. Cada linha tem um botão ▶ que toca o som.

- Escolher uma linha grava na hora e toca o som uma vez.
- O ▶ toca mesmo com o som desligado e ignora o intervalo mínimo de 2 s — é um
  gesto explícito da pessoa.
- A escolha vale para WhatsApp, e-mail e chat interno. O som de envio não muda.

**Onde fica guardado.** No navegador, como o liga/desliga (`repply_som_notificacao`,
guardando o identificador do som). Identificador desconhecido — um som retirado no
futuro — cai no **Padrão**, sem erro.

**O módulo.** O catálogo (identificador, rótulo, arquivo, grupo) vive em
`src/lib/catalogo-de-sons.ts`, puro e testado. `src/lib/som.ts` passa a tocar o
arquivo da escolha em `tocarNotificacao`, mantendo cache de um `Audio` por arquivo,
a trava de 2 s e a regra "só fora do foco". Nova função `ouvirAmostra(id)` para o ▶.

## 2.3 Equilíbrio da aba Perfil

**Hoje:** esquerda = Informações pessoais + Aviso sonoro + Personalizar; direita =
Conta e segurança. A esquerda passa muito da direita.

**Proposta:**

| | esquerda | direita |
|---|---|---|
| com módulo de e-mail (editor de assinatura visível) | Informações pessoais, Aviso sonoro | Personalizar, Conta e segurança |
| sem módulo de e-mail | Informações pessoais, Aviso sonoro, Personalizar | Conta e segurança |

A Zona de perigo continua no fim de Conta e segurança. O Personalizar muda de lado
conforme `temEmails`, porque sem o editor de assinatura o cartão de Informações
pessoais fica bem mais baixo.

**Antes de fechar:** medir a altura real das duas colunas nos dois casos, com o
Aviso sonoro fechado, a 1280 px. Se a diferença passar de ~150 px em algum caso, a
distribuição é revista antes de publicar. A lista de sons aberta pode desequilibrar
— é temporária e escolhida pela pessoa.

---

# Bloco 3 — Calendário

## 3.1 O que a pessoa vê

**No formulário de evento** (`EventDialog.tsx`):

- Chave **"Avisar participantes por chat e e-mail"**, **ligada** em evento novo. Ao
  editar, mostra o que o evento tem (os antigos, desligada).
- **Lembretes** viram lista: cada lembrete é uma etiqueta removível ("1 dia antes ×")
  e há um "+ Adicionar lembrete" com as opções de hoje (15 min, 30 min, 1 h, 2 h,
  1 dia, 2 dias, personalizado). Até 5 por evento, sem repetição, ordenados do mais
  cedo para o mais tarde.
- Evento novo já vem com **1 dia antes** e **1 hora antes**. Evento existente
  mantém o que tem.

**Rota de visita** (`NovaRotaVisitaDialog.tsx`) não ganha a chave e não avisa ninguém.

## 3.2 Quem recebe o quê

| acontecimento | quem recebe | sininho | mensagem direta | e-mail |
|---|---|---|---|---|
| evento criado | cada participante, menos quem criou | sim | sim | sim |
| participante incluído depois | a pessoa incluída | sim | sim | sim |
| data ou hora mudada pelo organizador | todos, menos o organizador | sim | sim | sim |
| organizador exclui o evento | todos, menos o organizador | sim | sim | sim |
| organizador tira alguém | a pessoa retirada (como cancelamento) | sim | sim | sim |
| participante sai do evento | ninguém | — | — | — |
| participante muda o horário da própria cópia | ninguém | — | — | — |
| lembrete | cada participante (o organizador só se estiver no evento) | sim | sim, menos para o organizador | sim |

Tudo que está como "sim" nas colunas de mensagem direta e e-mail só acontece com a
chave ligada. Com a chave desligada, o lembrete continua indo para o sininho, como
hoje, e nada mais sai.

- **Evento só da própria pessoa** com a chave ligada: lembrete por sininho e e-mail
  (decisão 7). Não há mensagem direta para si mesmo.
- **Mudar só título ou descrição** não avisa.
- **Evento que já passou** não gera aviso de mudança nem de cancelamento.
- **Lembrete cujo horário já passou** quando o evento foi criado — ou quando o
  horário mudou — não sai atrasado. Ex.: evento amanhã às 8h criado hoje às 18h;
  o lembrete de 1 dia já passou e o convite cumpre esse papel.
- **Horário mudou:** lembretes já enviados voltam a valer para o horário novo.
- **Empresa com o Calendário desligado:** nada sai, e nada é marcado como enviado
  (mesma regra de hoje em `eventos-lembrete/index.ts:111`).

## 3.3 Os textos

A mensagem direta sai em nome de quem criou o evento, na conversa direta dele com o
participante, e começa com um ícone e a palavra que deixa claro que é automática:

- Convite: "📅 Convite automático: Reunião com a Construtora Alfa — quarta, 17/09, das 14:00 às 15:00. Obra: Residencial Mar Azul."
- Mudança: "📅 Evento alterado: Reunião com a Construtora Alfa — era quarta, 17/09, às 14:00; agora é quinta, 18/09, às 10:00."
- Cancelamento: "📅 Evento cancelado: Reunião com a Construtora Alfa — quarta, 17/09, às 14:00."
- Retirado: "📅 Evento cancelado para você: Reunião com a Construtora Alfa — quarta, 17/09, às 14:00."
- Lembrete: "🔔 Lembrete automático: Reunião com a Construtora Alfa começa em 1 hora (quarta, 17/09, às 14:00)."

Linha de obra só quando houver obra. Horário sempre em `America/Sao_Paulo`. Evento
de dia inteiro diz "o dia todo" no lugar do horário.

**E-mail.** Montado no código, no visual do resumo diário, enviado pelo Resend com
o mesmo remetente do resumo, para o e-mail de login de cada pessoa
(`usuarios.email`). Quatro versões — convite, mudança, cancelamento (inclui
"cancelado para você"), lembrete — com título, dia e hora (e o "antes" na mudança),
obra, descrição, organizador, participantes e o botão **"Abrir na agenda"**, que
leva à agenda no dia do evento. Assunto: "Convite: <título> — qua 17/09, 14:00" e
equivalentes. Não leva arquivo `.ics`.

## 3.4 Como funciona por dentro (forma A)

**Banco — só estrutura, nada apagado:**

- `eventos.avisar_participantes boolean not null default false` — todo evento
  antigo e toda rota ficam desligados.
- `eventos.lembretes_minutos int[] not null default '{}'` — a migration copia o
  `lembrete_minutos` de hoje para a lista. As colunas antigas continuam existindo
  até o robô novo estar no ar; retirá-las é outro passo, fora deste bloco.
- `eventos.lembretes_valem_desde timestamptz` — carimbado na criação e a cada
  mudança de horário. Um lembrete só sai se o seu momento for posterior a isso.
- `evento_lembretes_enviados (evento_id, minutos, enviado_em)`, chave
  `(evento_id, minutos)`, apagado junto com o evento. Mudança de horário apaga as
  linhas daquele evento.
- `evento_avisos` — a fila: destinatário, remetente (o organizador), tipo
  (`convite`, `alteracao`, `cancelamento`, `lembrete`), minutos (no lembrete), uma
  fotografia dos dados do evento no momento (título, início e fim, início e fim
  anteriores, obra, descrição, participantes), o que já saiu (`sininho_em`,
  `chat_em`, `email_em`), tentativas, último erro e `processando_desde`.

**O gatilho** (em `eventos`, por linha): cria o item da fila conforme a tabela de
3.2, pulando quando o destinatário é quem fez a mudança (`auth.uid()`), quando não
há sessão (exclusões feitas pelo sistema), quando o evento já passou ou quando a
chave está desligada. Na exclusão usa a fotografia de `OLD`.

**O robô:** o `eventos-lembrete` de hoje (mesmo nome, mesmo agendamento de 5 min)
passa a fazer duas coisas — gerar os lembretes devidos na fila e esvaziar a fila.
Um gatilho por comando em `evento_avisos` chama o robô na hora
(`chamar_edge_function`), então o aviso sai em segundos; o agendamento de 5 min é a
rede de segurança para o que falhou.

- **Pegar itens sem repetir:** cada execução reserva os itens com `FOR UPDATE SKIP
  LOCKED` e carimba `processando_desde`; item preso há mais de 10 min volta à fila.
- **Cada canal tem sua marca:** se o e-mail falhar e o chat não, a nova tentativa
  manda só o e-mail. Nada sai duas vezes.
- **Desiste depois de 5 tentativas**, guardando o erro — nunca com dado sensível.

**Partes puras e testadas** — o que decide "está na hora", os textos e o HTML do
e-mail ficam em arquivos sem acesso a banco, com teste: a lista de lembretes
(normalizar, limitar a 5, padrões), o cálculo de lembretes devidos e a montagem dos
textos.

---

# Bloco 4 — Menções

## 4.1 Onde existe

- **Chat interno:** no Geral e nos grupos. **Não** em conversa direta.
- **WhatsApp:** na janela de nota interna ("Adicionar nota") e em qualquer outra
  entrada onde a pessoa digita uma nota. **Não** na caixa que manda mensagem ao
  cliente — ali o @ seria enviado ao cliente, e nos grupos de WhatsApp o @ já marca
  participantes do próprio grupo, função que continua como está.

## 4.2 Como funciona para quem escreve

- Digitar **@** abre a lista acima do campo. O que se digita depois do @ aparece na
  barra de busca da lista e filtra por nome, sem diferenciar acento nem maiúscula.
- Setas escolhem, **Enter** ou clique confirma; o texto vira "@Nome Completo ".
  **Esc** fecha a lista e mantém o que foi digitado.
- **@todos** é a primeira opção, com "avisa as N pessoas desta conversa". Digitar
  "@todos" ou "@all" à mão também vale.
- **Quem aparece:** no Geral, todos da empresa; no grupo, os membros; na nota do
  WhatsApp, só quem atende o número da conversa. A própria pessoa nunca aparece;
  usuário excluído também não.
- Conversa de WhatsApp sem número vinculado: a lista diz que ninguém atende este
  número, e não há menção.
- Se a pessoa apagar o "@Nome" do texto antes de enviar, a menção cai.
- Menção só é criada no envio. Editar uma mensagem depois não cria nem retira menção.

## 4.3 O que a pessoa mencionada recebe

- **Aviso na tela:** "Carlos te mencionou no Geral" (ou "no grupo Equipe de obras",
  ou "numa nota da conversa com Construtora Alfa"), com a prévia do texto e o botão
  **Abrir conversa**, tocando o som escolhido no Bloco 2 (e respeitando o
  liga/desliga).
- **No chat, a menção substitui o aviso normal** daquela mensagem — nunca dois
  avisos pela mesma coisa.
- **Sininho:** um registro "te mencionou" que, ao clicar, abre a conversa.
- **O @:** ao lado do número vermelho na lista de conversas, e no item Chat ou
  WhatsApp do menu lateral, enquanto houver menção não lida. Some quando a pessoa
  abre aquela conversa.
- **O nome mencionado** fica destacado na mensagem e na nota; quando é o nome de
  quem está lendo, com mais destaque.

## 4.4 Endereço de cada conversa do chat

Hoje o aviso de chat leva só para `/chat`. O chat passa a aceitar
`/chat?conversa=geral`, `/chat?conversa=grupo_<id>` e `/chat?conversa=dm_<id>` —
as mesmas chaves que `unreadCounts` já usa — e abre a conversa certa. O WhatsApp já
tem `/whatsapp?conversaId=<id>`.

## 4.5 Como funciona por dentro (forma A)

- **Na mensagem:** `chat_mensagens` e `whatsapp_mensagens` ganham
  `mencionados uuid[]` (as pessoas escolhidas na lista) e
  `menciona_todos boolean`. O texto guarda "@Nome Completo", legível em qualquer
  lugar — exportação, prévia, e-mail.
- **A tabela `mencoes`:** mencionado, autor, origem (`chat` ou `whatsapp_nota`),
  mensagem, chave da conversa, `lida_em`. Cada pessoa só lê e marca como lidas as
  próprias.
- **Um gatilho depois de inserir a mensagem** confere, para cada pessoa, se ela
  **enxerga aquela conversa** — membro do grupo, da empresa no Geral, atendente do
  número no WhatsApp — e só então cria a menção e o registro no sininho. `@todos`
  é expandido ali, pela mesma regra. É isso que impede usar menção para mostrar
  trecho de conversa a quem não tem acesso.
- **O aviso na tela** sai do mesmo canal em tempo real que já existe: ao chegar a
  mensagem, se `mencionados` inclui quem está logado (ou `menciona_todos`), o aviso
  vira "te mencionou". Para as notas do WhatsApp, o canal passa a olhar notas
  também — hoje ele só avisa mensagem de cliente.
- **O sininho** ganha um destino por registro (o endereço da conversa), usado pelo
  tipo `mencao`.
- **O campo com @** é um componente só (`CampoComMencao` + a lógica pura de
  detectar o @ no cursor, filtrar e montar a lista final de pessoas), usado no chat
  e na nota. A lógica pura tem teste.

---

## Verificação, em todos os blocos

- `npm run test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint` e
  `npm run build` sem piorar a linha de base (hoje 1.349 testes; 36 erros de tipo e
  427 avisos de lint já existentes, nenhum destes blocos).
- Migrations aplicadas **uma a uma**, só com o "pode" do dono do produto.
- Leitura em produção medida como o usuário logado (RLS), não como administrador.
- Conferência no navegador em três larguras; publicação conferida no pacote que
  está no ar.
- Publicar só os commits destes blocos, nunca os de outra sessão.

---

## Riscos

- **O gatilho em `eventos` vale para toda gravação de evento**, rotas inclusive. O
  `avisar_participantes` desligado por padrão é o que protege tudo que não passa
  pelo formulário novo.
- **Volume de e-mail.** Com a chave ligada nos eventos solo, estimativa de ~120
  e-mails de lembrete por mês somando todas as empresas, mais os de eventos com
  várias pessoas. Conferir o limite do plano do Resend antes de publicar o Bloco 3.
- **O gatilho de menção roda com poder de sistema** para enxergar quem está em cada
  conversa. Ele só grava menção depois de conferir o acesso de cada pessoa, e nunca
  devolve dado a quem escreveu.
- **O robô de lembretes não confere quem o chama** (`eventos-lembrete`, já anotado
  em `20260806191500_cron_le_a_chave_do_vault.sql:80`). Chamá-lo de fora continua
  inofensivo — cada item tem a marca de "já enviado" —, mas agora ele manda e-mail e
  mensagem. Registrado abaixo.

---

## Fora deste documento

- **`ativado_em` regravado a cada evento do Stripe** (`stripe-webhook/index.ts:226`)
  — o painel de clientes lê esse campo como "quando entrou". Hoje só afeta a empresa de teste.
- **`eventos-lembrete` sem conferência de token.**
- **Arquivo `.ics`** no e-mail do evento, para adicionar ao Google ou Outlook.
- **Menção ao editar mensagem**, menção em conversa direta, som por canal, som de
  envio escolhível.
- **Retirar `lembrete_minutos` e `lembrete_enviado`** depois que o Bloco 3 estiver
  estável.
