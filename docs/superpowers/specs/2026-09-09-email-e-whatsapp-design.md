# E-mail e WhatsApp — caixa de entrada, histórico por blocos, som e quatro consertos

**Data:** 09/09/2026
**Dono do produto:** Lucas
**Estado:** aprovado, pronto para virar plano

---

## Por que este documento existe

Sete pedidos chegaram juntos, deliberadamente pareados entre e-mail e WhatsApp — as
duas seções resolvem o mesmo problema (uma caixa de mensagens que precisa virar
histórico comercial) e vinham divergindo. Não cabem num plano só: são quatro
entregas independentes, com riscos e prazos diferentes.

A ordem é **C → D → A → B**. C alivia o dia a dia e não depende de ninguém. D
destrava um cliente parado (JHS). A é contido. B é o maior e o que mais se
apoia nos outros.

---

## O que foi medido, e não suposto

Tudo abaixo foi conferido contra a produção em 09/09/2026. Números são da MD
Representações (`0c5df684-20d1-4d4f-b0f0-30676d4d4128`) salvo onde dito.

| fato | evidência |
|---|---|
| O rascunho é um só para a tela inteira | `WhatsAppInbox.tsx:4779` — um `useState("")` para todas as conversas |
| O negrito repete o nome cru | `whatsapp-send/index.ts:26` — `` const header = `*${nome}*` `` |
| O grupo é renomeado por quem envia | `whatsapp-webhook/index.ts:689` — `isGroup ? groupName \|\| msg.senderName : …` |
| Um grupo está torto agora | `120363397034366398` gravado como "Crispim Santana" |
| `[Undecryptable]` é texto do provedor | 19 mensagens em 75.952 (0,025%), 18 delas em grupo, todas com `remetente_telefone` nulo |
| A JHS nunca voltou do provedor | 4 tentativas em 09/09 (12:29 imap, 12:30 microsoft, 12:31 google, 12:31 imap), **zero** linhas de `email-callback` no log, nenhuma linha em `email_contas` |
| Fechar conversa é marco confiável | 4.168 fechamentos, em 757 das 764 conversas; média 5,5 por conversa; pior caso 150 |
| Reabrir não deixa rastro | `WhatsAppInbox.tsx:8060` — a nota só é gravada quando `novaArquivada` é verdadeiro |
| Os sons não são servidos | `sounds/` está na raiz do repositório; o site serve `public/`, que só tem `favicon.ico` e `og-repply.png` |

---

## Decisões do dono do produto

Tomadas em 09/09/2026, todas dele:

1. **Bloco no WhatsApp** — o bloco vai da primeira mensagem (ou do "assumiu")
   até o "fechou a conversa"; o próximo começa na mensagem seguinte.
2. **Bloco no e-mail** — o bloco é o **assunto** (`nylas_thread_id`), não um
   corte de tempo.
3. **Teto** — 10 blocos no painel, com "ver todas".
4. **Quem vê e-mail no histórico** — só quem já tem acesso à caixa. Vendedor sem
   acesso não vê linha nenhuma, nem a existência da troca.
5. **"Todos os e-mails"** — não leva spam nem lixeira.
6. **Som** — liga/desliga por pessoa; toca só fora do foco; o de envio toca sempre.
7. **Rascunho** — vive no navegador daquela pessoa, não no banco.
8. **Locaweb** — aceitar o caminho com senha, mudando a promessa da tela.

---

# Bloco C — WhatsApp: os quatro consertos

## C1. Som de notificação e de envio

**Estado hoje:** não existe som em lugar nenhum do sistema (busca por `new Audio`
e `.mp3` em `src/` não devolve nada).

**Os arquivos.** `sounds/som de notificações.mp3` (58 KB) e
`sounds/som ao enviar mensagem.mp3` (34 KB) vão para `public/sons/`, renomeados
para `notificacao.mp3` e `envio.mp3`. Nome com espaço e acento vira URL escapada
e quebra em servidor que normaliza caminho — não vale o risco por estética de
nome de arquivo.

**O módulo.** `src/lib/som.ts`, sem React, com duas funções:
`tocarNotificacao()` e `tocarEnvio()`. Ele resolve três coisas que não são
óbvias:

- **A política de reprodução automática.** O navegador recusa tocar áudio antes
  do primeiro gesto do usuário na página, e a recusa é uma `Promise` rejeitada,
  não uma exceção — engolir isso sem tratar polui o console e esconde erro de
  verdade. O módulo registra um ouvinte único de `pointerdown`/`keydown` que
  destrava o áudio e se remove; até lá, cada pedido de som é ignorado em
  silêncio.
- **Instância única por som.** Criar um `Audio` novo a cada mensagem em rajada
  deixa dezenas de objetos pendurados. Um por som, com `currentTime = 0` antes
  de tocar de novo.
- **Teto de repetição.** Vinte mensagens chegando juntas não podem virar vinte
  sons sobrepostos. Dois segundos de intervalo mínimo entre dois toques de
  notificação; o de envio não tem teto, porque é um por clique.

**Quando toca.** Só quando a pessoa não está olhando aquilo:
`document.visibilityState !== 'visible'` (aba em segundo plano) **ou** a
conversa que gerou a notificação não é a que está aberta na tela. O som de envio
é exceção deliberada: toca sempre, porque é resposta ao clique dela.

**Onde entra.** Nos pontos que já existem e já sabem que algo novo chegou:
- `use-notificacoes.ts` — notificação do sistema e chat interno (já tem o toast);
- `use-whatsapp-inbox.ts` — a assinatura de mensagens novas;
- a lista de não lidas do e-mail.

Nenhum deles ganha lógica nova; ganham uma chamada.

**A preferência.** Liga/desliga por pessoa, junto das outras preferências dela.
Ligado por padrão. Um hook `useSomLigado()` lê e grava; `src/lib/som.ts` consulta
antes de tocar.

## C2. Rascunho por conversa

**Estado hoje:** `const [texto, setTexto] = useState("")` em
`WhatsAppInbox.tsx:4779` — uma caixa de texto compartilhada por todas as
conversas. Trocar de chat carrega o que foi escrito no anterior.

**O desenho.** Um módulo `src/lib/rascunhos-do-whatsapp.ts` guarda um mapa
`conversaId → texto` no navegador daquela pessoa, sob uma chave que inclui o id
do usuário (duas pessoas no mesmo computador não se misturam). A tela lê o
rascunho ao abrir a conversa e grava com um respiro de meio segundo depois da
última tecla — gravar a cada caractere é escrita síncrona no caminho da
digitação.

**Na lista de conversas.** Conversa com rascunho ganha o selo **rascunho** em
vermelho no lugar da prévia da última mensagem, e sobe para o topo da lista. Sai
quando o texto é enviado ou apagado.

**Limpeza.** Rascunho de conversa que não existe mais é descartado na primeira
leitura. Sem isso o mapa cresce para sempre.

## C3. O nome no negrito

**Estado hoje:** `whatsapp-send/index.ts:26` monta `` `*${nome}*` `` com o nome
exatamente como está cadastrado. "Silvia " (com espaço sobrando) vira `*Silvia *`,
e o WhatsApp não aplica negrito quando há espaço colado ao asterisco — o cliente
recebe os asteriscos crus.

**O desenho.** Uma função pura em `supabase/functions/_shared/whatsapp.ts`
(compartilhada, porque o mesmo problema vale para qualquer lugar que monte
negrito) que:

- tira espaço, tabulação e quebra de linha das pontas;
- colapsa espaço repetido no meio;
- remove os caracteres que o próprio WhatsApp usa como formatação — `*`, `_`,
  `~` e crase — porque um nome como "Ana *Paula*" quebraria o negrito por
  dentro;
- devolve nada quando o que sobra é vazio, e aí a mensagem sai sem prefixo em
  vez de sair com `**`.

Com testes cobrindo cada uma dessas variações. É o pedido explícito do dono do
produto: "pensado para mais tipos de situações futuras que podem ocorrer".

**Fora do escopo, de propósito:** corrigir o cadastro da Silvia. O nome com
espaço é dado do cliente; quem conserta é ele. O que o sistema deve garantir é
não vazar o erro para o cliente final.

## C4. Nome de grupo e mensagem indecifrável

São duas linhas com **uma causa só**: a uazapi às vezes entrega o pacote pela
metade. Nas 19 mensagens indecifráveis, `remetente_telefone` é nulo em todas —
o participante não veio identificado. É o mesmo pacote degradado que deixa
`chat.name` vazio.

**O nome do grupo.** `whatsapp-webhook/index.ts:689` faz:

```ts
const pushName: string = isGroup
  ? groupName || msg.senderName || ""
  : …
```

Em grupo, quando `groupName` vem vazio, cai no nome de quem enviou. E como
`nome_contato` é reescrito a cada mensagem (linha 1122), o grupo passa a se
chamar "Crispim Santana". Volta ao normal sozinho quando chega uma mensagem com
o nome certo — foi o que o dono do produto observou.

**O conserto:** em grupo, `pushName` é `groupName` e ponto. Sem nome no pacote,
o grupo **mantém o nome que já tinha**. Nunca há motivo para chamar um grupo
pelo nome de um participante, e `msg.senderName` já é gravado separado em
`remetente_nome`, que é onde ele serve.

**Conserto do dado:** o grupo `120363397034366398` volta ao nome de verdade.
Escrita em produção — passa pelo método de sempre: medir, mostrar a linha,
entregar o desfazer antes de escrever.

**A mensagem indecifrável.** O texto `[Undecryptable] [text] Não foi possível
descriptografar…` vem pronto da uazapi. Quem não conseguiu abrir a mensagem foi
o WhatsApp conectado, não o Repply — não há nada para descriptografar do nosso
lado, e nenhuma chamada que recupere o conteúdo depois.

**O que dá para fazer**, e é o que será feito: reconhecer o marcador
`[Undecryptable]` na entrada e gravar a mensagem com um tipo próprio, para que a
conversa mostre uma frase honesta ("Esta mensagem não pôde ser lida aqui — ela
está no WhatsApp do celular") em vez do texto cru do provedor, e para que ela
não vire a prévia da conversa na lista. Dezenove em 75.952 justifica tratar, não
justifica investir mais que isso.

---

# Bloco D — Locaweb da JHS

**O que se sabe.** A JHS (`9ad7723e-a9ba-4608-b961-72b9bdeabcbe`) tentou quatro
vezes em 09/09, nos três provedores. Nas quatro o `email-conectar` respondeu 200
e devolveu a URL. **Nenhuma** gerou linha de `email-callback` no log. Eles não
voltaram da tela da Nylas.

Ou seja: o defeito não está no nosso código de retorno, nem na gravação. Está em
mandar `comercial@jhsrepresentacoesltda.com.br` para um fluxo hospedado de
OAuth. Google e Microsoft recusam porque a conta não é deles. E o `provider=imap`
no `/v3/connect/auth` não é o caminho que a Nylas usa para IMAP — caixa comum
por servidor e senha se conecta pela autenticação direta, com as configurações
explícitas.

**Primeiro passo, antes de qualquer tela:** confirmar o contrato da autenticação
direta da Nylas — endpoint, formato das configurações, e se o provedor precisa
estar habilitado na conta. Esta parte ainda não foi provada; o que foi provado é
só que o caminho atual não funciona. Se a confirmação derrubar a hipótese, o
plano volta para esta mesa antes de escrever código.

**O desenho, se confirmar.** A tela de conectar ganha um terceiro caminho, e só
esse caminho pede: servidor de entrada e porta, servidor de saída e porta,
usuário e senha. Uma Edge Function nova (`email-conectar-imap`) recebe isso,
chama a Nylas e grava a conta exatamente como o callback já grava hoje —
reaproveitando o mesmo código, para que sincronização, envio e marcadores não
saibam a diferença.

**A senha.** Vai do navegador para a nossa função e da função para a Nylas.
**Não é gravada no nosso banco**, não vai para log, não entra em mensagem de
erro. O que fica guardado é o mesmo `grant` que já existe para Gmail.

**A promessa da tela muda.** Hoje o rodapé diz "O CRM não guarda sua senha" para
todos os caminhos. Passa a dizer a verdade inteira, só no caminho de servidor
próprio: a senha é entregue ao provedor de integração para manter a caixa
conectada. Mentir aqui seria pior que não ter o recurso.

**Erro visível.** O retorno de erro hoje é um código na URL (`motivo=troca_falhou`)
que ninguém entende. O caminho novo devolve o que a Nylas disse, traduzido: senha
recusada, servidor não encontrado, porta errada. É onde a pessoa vai errar.

---

# Bloco A — Caixa de entrada de verdade

**Estado hoje.** A barra lateral tem "Todas" (`BarraPastas.tsx:178`), Spam,
Lixeira e os marcadores. "Todas" mostra tudo que foi recebido menos spam e
lixeira — inclusive o que já foi arquivado num marcador. A seção abre nela.

**O que muda.**

| item | o que mostra |
|---|---|
| **Caixa de entrada** *(novo, primeiro, padrão)* | recebidos que **não estão em marcador nenhum**, nem spam, nem lixeira |
| **Todos os e-mails** *(o "Todas" de hoje, renomeado)* | recebidos, marcador incluso; sem spam e sem lixeira |
| Spam, Lixeira, marcadores | como hoje |

É a regra do Gmail: mover para um marcador tira da entrada; a mensagem continua
em "Todos os e-mails" e no marcador dela.

**Como o filtro é feito.** `email_pastas` já distingue marcador de pasta de
sistema (`ehSistema`, em `use-email-pastas.ts`). A entrada é a consulta de hoje
mais uma condição: a mensagem não pode ter nenhum dos `pasta_id` de marcador.
Em `pastas`, que é `TEXT[]`, isso é o operador de sobreposição do Postgres.

Risco medido: a caixa da MD tem 25 marcadores, o que cabe folgado numa URL de
consulta. Se um cliente chegar a centenas, a lista sai da URL e vira uma função
no banco. Não vale antecipar essa complexidade agora — mas vale deixar o ponto
isolado num lugar só, para a troca ser de uma linha.

**As contagens.** A RPC `email_contagem_por_marcador` já devolve total e não
lidas por marcador. Ganha a linha da entrada, pelo mesmo critério da listagem —
badge que conta diferente do que a lista mostra é o defeito que o comentário em
`Emails.tsx:858` já descreve.

**O que abre por padrão.** A Caixa de entrada. Hoje abre em "Todas".

**Fora do escopo:** o botão "Todas / Não lidas" do topo, que filtra por lido e
não tem relação com isto apesar do nome coincidir. Fica como está.

---

# Bloco B — Histórico do negócio por blocos

## O problema

`HistoricoDoNegocio.tsx` hoje mostra uma linha por **conversa inteira** de
WhatsApp — decisão de 04/09/2026, tomada para não afogar as 56 anotações manuais
sob 73 mil mensagens. E não mostra e-mail nenhum.

O dono do produto revisou essa decisão em 09/09: a unidade certa não é a conversa
inteira nem a mensagem solta, é o **atendimento** — cada vez que a conversa foi
aberta e fechada.

## A regra do bloco

**No WhatsApp.** Um bloco termina numa nota interna de fechamento; o próximo
começa na mensagem seguinte. É um marco que a equipe já produz de propósito:
4.168 fechamentos, presentes em 757 das 764 conversas.

Duas consequências que o desenho aceita de olhos abertos:

- Conversa **sem nenhum fechamento** vira um bloco só — exatamente o
  comportamento de hoje. O recurso de fechar só existe desde 20/07/2026, então
  todo o histórico anterior degrada sozinho, sem código de transição.
- **Reabrir não grava nota** hoje. Vai passar a gravar, senão metade da história
  fica invisível. Mudança pequena, no mesmo botão que já grava o fechamento.

**No e-mail.** O bloco é o assunto — `nylas_thread_id`, que o provedor já
entrega amarrado. Não há corte de tempo inventado: "aberta e fechada" no e-mail
é literalmente a thread.

## O módulo

`src/lib/blocos-de-atendimento.ts` — puro, sem React e sem banco. Recebe
mensagens e notas, devolve blocos com início, fim, contagem e a mensagem de
abertura. Testável sozinho, que é o ponto: a regra é sutil o suficiente para
merecer teste próprio, e a tela não deve ser o lugar onde ela vive.

## A janela do negócio

Só entram blocos cujo **início** cai entre a criação do negócio e o fechamento
dele. Negócio em aberto: da criação até hoje.

## Quais mensagens pertencem ao negócio

- **WhatsApp:** as conversas do cliente e dos contatos dele — o caminho que
  `HistoricoDoNegocio` já percorre com `useContatosDoCliente`.
- **E-mail:** mensagens em que o e-mail do cliente **ou de qualquer contato dele**
  aparece como remetente, destinatário ou cópia (`remetente_email`,
  `destinatarios`, `cc`). O exemplo do dono do produto é exatamente esse: a
  construtora **e** o João, os dois na mesma lista.

## Quem enxerga

A consulta de e-mail sai do navegador com a sessão da pessoa, então a regra de
acesso da caixa se aplica sozinha: quem não foi liberado não recebe linha
nenhuma. Nada de consulta privilegiada aqui. É a decisão 4, e é também a opção
que não abre por uma porta lateral o que a seção de e-mail fecha pela porta da
frente.

## Na tela

Cada bloco é uma linha com o período, quantas mensagens e quem atendeu; clicar
leva à **primeira mensagem do bloco** — no WhatsApp, à conversa posicionada
naquela mensagem; no e-mail, à mensagem que abriu o assunto.

Dez linhas, mais recentes primeiro, e "ver todas" abre o resto. O teto existe
porque há uma conversa na MD com 150 fechamentos: sem ele, um caso extremo
empurra comentários, visitas e ligações para fora da tela.

Quando a seção de WhatsApp está desligada para a empresa, as linhas de WhatsApp
somem — como já acontece hoje via `useSecaoLigada`. Mesma coisa para e-mail.

---

## O que este documento não promete

- Não recupera o conteúdo das mensagens indecifráveis. Não é possível.
- Não conserta o cadastro "Silvia " da JHS. É dado do cliente.
- Não garante que a Locaweb vá conectar antes da confirmação do contrato da
  Nylas. Garante que o caminho atual não funciona e por quê.
- Não muda o botão "Todas / Não lidas" do topo da seção de e-mail.
- Não altera a regra de acesso da caixa de e-mail, em nenhuma direção.

## Depois destes quatro blocos

Pendências já levantadas, que o dono do produto pediu para não esquecer:

1. `perfis_customizados` sem `empresa_id`, com política aberta — perfil de uma
   empresa visível a outra.
2. Seis depósitos de arquivo públicos (`avatars`, `branding`, `chat-files`,
   `email-assets`, `pedido-anexos`, `whatsapp-media`).
3. "Excluído com sucesso" que não exclui, em Cliente e Contato
   (`use-mutations.ts:103` e `:126`, sem `.select()`). Obras e Fabricantes já
   foram corrigidos.
4. Blindagem do WhatsApp — depende de o dono do produto gerar o segredo e
   registrar o endereço de novo na uazapi.
5. Retirar o gatilho temporário `trg_email_esconde_antigo_md` quando a validação
   da caixa da MD terminar.
