# Configurações (som) e Chat interno — 4 melhorias

**Data:** 2026-09-22
**Ramo:** `chat-config` (worktree `_chat-config`, a partir de `origin/main`)

## Objetivo

Quatro pedidos independentes, dois módulos:

1. **Configurações → som:** "Toque suave" vira o padrão do sistema; o "Padrão" de hoje troca de
   lugar com ele e passa a se chamar **"Alerta"**.
2. **Chat interno → anexos:** imagem e vídeo enviados na conversa abrem numa mini-visualização
   embutida (como no WhatsApp), em vez de abrir em nova aba / só baixar.
3. **Chat interno → marcar como não lida:** clique com o botão direito numa conversa para marcá-la
   como não lida.
4. **Chat interno → Anotações:** um espaço pessoal, fixo no topo da lista, para a pessoa mandar
   recado/link/arquivo para si mesma.

As quatro são **independentes** — cada uma pode ser construída, testada e publicada sozinha.
**Só a #3 mexe no banco** (uma tabela nova); as outras três são só frontend.

> Escopo: as três melhorias de Chat são para o **chat interno da equipe** (`src/pages/Chat.tsx`,
> tabelas `chat_*`), **não** para a caixa de WhatsApp.

---

## Feature 1 — Som "Toque suave" como padrão

### Estado hoje

A lista de sons vive em `src/lib/catalogo-de-sons.ts`. O **primeiro item do array** é quem toca
para quem **nunca escolheu** um som (`somDoCatalogo` cai em `CATALOGO_DE_SONS[0]` quando o id é
nulo/desconhecido, linha 36) e é também a rede de segurança quando um som some da lista. A
constante `SOM_PADRAO = 'padrao'` é o outro ponto de queda (usada no `catch` de
`use-som-escolhido.ts:16`). Hoje o índice 0 é `{ id: 'padrao', rotulo: 'Padrão',
arquivo: '/sons/notificacao.mp3', grupo: 'padrao' }`.

A escolha de som é **por pessoa, no navegador** (`localStorage`, `use-som-escolhido.ts`). Não há
nada disso no banco.

### Decisão

- "Toque suave" (`toque-suave`, `/sons/opcoes/toque-suave.mp3`) vira o **primeiro** da lista e o
  padrão de verdade.
- O antigo "Padrão" (`padrao`, `/sons/notificacao.mp3`) vai para o **segundo** lugar e passa a se
  chamar **"Alerta"**.

### Abordagem

Em `src/lib/catalogo-de-sons.ts`:

- Reordenar `CATALOGO_DE_SONS` para `toque-suave` ser o índice 0 e `padrao` o índice 1.
- Trocar o `rotulo` de `padrao` de `'Padrão'` para `'Alerta'`.
- Trocar `SOM_PADRAO` de `'padrao'` para `'toque-suave'`.
- `grupo`: dar a `toque-suave` o grupo `'padrao'` e ao antigo o grupo `'opcoes'` — mantém a
  invariante de "exatamente um item com grupo `padrao`". Visualmente não muda nada: `CardDeSom`
  só separa `principais` (grupo ≠ `repply`) de `daRepply` (grupo `repply`), e os dois seguem em
  `principais`.

**IDs ficam estáveis** (`toque-suave` e `padrao` continuam com o mesmo `id`): quem já salvou uma
escolha no navegador não perde nada — só o rótulo e a ordem mudam.

Ajustar os testes que fixam o contrato: `catalogo-de-sons.test.ts` (fallback = índice 0,
`SOM_PADRAO`) e `use-som-escolhido.test.ts` (id padrão). `src/lib/som.ts` **não muda** (ele lê o
catálogo).

### Perspectivas

- **Quem nunca abriu essa configuração** (a maioria): passa a ouvir "Toque suave" quando chega
  mensagem. É a mudança que a equipe percebe — e é exatamente o que "virar padrão" significa.
- **Quem salvou `padrao`:** continua ouvindo o mesmo arquivo, agora rotulado "Alerta".
- **Quem salvou `toque-suave`:** nada muda.
- **Multi-empresa:** vale para todas as empresas igual (é preferência de navegador, não de
  empresa).

### Banco: nenhum.

---

## Feature 2 — Mini-visualização de anexos no chat interno

### Estado hoje (`src/pages/Chat.tsx`)

No **balão da mensagem** (render por `arquivo_tipo`, ~linhas 2101-2147):

- Áudio (`audio/`) → player interno `ChatAudioPlayer`. OK.
- **Imagem (`image/`) → `<a target="_blank">`, abre em nova aba** (linha ~2107).
- PDF/Word/Excel (`isPreviewable`) → modal embutido `FilePreviewDialog` (linha ~2126). OK.
- **Resto (inclui vídeo!) → só botão de baixar** (linhas ~2134-2145). Vídeo não tem player.

No **painel lateral de mídias** (~linhas 785-919):

- **Imagem → nova aba** (`renderImagens`, ~813).
- **Vídeo → nova aba** (`renderVideos`, ~831).
- Documento previsível → `FilePreviewDialog`; senão baixa (~855-881). OK.
- Link (URL detectada no texto) → nova aba (`renderLinks`, ~901).

A URL do anexo vem do bucket `chat-files` (gravada pública) e é reexibida via
`useArquivosPrivados`/`enderecoDe` (URL assinada de 1h) — o mesmo do resto do sistema
(`src/lib/arquivo-privado.ts`). O tipo do anexo está em `chat_mensagens.arquivo_tipo` (MIME).

### Decisão

Trazer para o chat interno a mesma experiência que a caixa de WhatsApp já tem:

- **Imagem** → visualizador embutido com zoom (lightbox), sem sair da tela.
- **Vídeo** → toca embutido.
- **PDF/Word/Excel** → já embutido, mantém.
- **Arquivo não previsível** (zip, etc.) → baixa. (WhatsApp faz igual.)
- **Link** → continua abrindo no navegador (endereço externo; o certo é abrir fora).

### Abordagem

- Criar um **componente reutilizável de visualização de mídia** (imagem com zoom + vídeo com
  player), em `src/components/chat/`. **Não** vamos editar `WhatsAppInbox.tsx` (10 mil linhas) para
  extrair o lightbox de lá — o risco não compensa; construímos um componente próprio, enxuto, e
  fica registrada a opção de a caixa de WhatsApp adotá-lo depois. `FilePreviewDialog` já é
  reutilizável e continua sendo usado para documento.
- Ligar o novo visualizador no chat interno, substituindo os pontos de "nova aba" de **imagem**
  (balão e painel) e trocando o vídeo:
  - Balão: imagem vira miniatura que abre o lightbox; vídeo toca embutido (`<video controls>` no
    balão, como no WhatsApp) — em vez do botão de baixar genérico.
  - Painel: imagem e vídeo abrem no visualizador (modal) em vez de nova aba.
- Reaproveitar `enderecoDe` para a URL (sem mudança no fluxo de arquivo).

### Perspectivas

- **Vendedor no celular:** o lightbox precisa funcionar no toque (fechar tocando fora, zoom por
  pinça); o `<video>` embutido já funciona no celular.
- **Anotações (Feature 4):** como Anotações é uma conversa comum por baixo, ganha o visualizador
  de graça.
- **Falha de carregamento:** manter a rede de proteção que já existe (`enderecoDe` devolve a URL
  original se a assinatura falhar).

### Banco: nenhum.

---

## Feature 3 — Marcar como não lida (clique direito) — **a única que mexe no banco**

### Estado hoje

Não existe menu de clique direito no chat interno (nenhum `onContextMenu`/`ContextMenu`), nem a
ação "marcar como não lida" (só existe "marcar como lida").

O "não lido" do chat interno é um **booleano por mensagem, compartilhado**: `chat_mensagens.lida`.
Os contadores por conversa são calculados **contando** mensagens com `lida = false` e
`usuario_id ≠ eu` (`useUnreadChatByTarget`, `src/hooks/use-notificacoes.ts:206-248`;
`unreadCounts` em `Chat.tsx:777`). Ao abrir a conversa, `useMarkChatAsRead`
(`src/hooks/use-chat.ts:670-703`) põe `lida = true`.

**Por que não dá para "religar o `lida`":** `lida` é único por mensagem e vira `true` quando
**qualquer** membro lê. Reverter `lida = false` num grupo faria a conversa reaparecer como não
lida **para todos os membros**, não só para quem marcou. (É um comportamento herdado — o contador
de grupo já é compartilhado; **não** vamos consertar isso aqui, só não piorar.)

### Decisão

Marcação de "não lida" **privada por pessoa**, que aparece na conversa (Geral, grupo ou DM) até a
pessoa abrir de novo, e **acompanha a pessoa em qualquer aparelho** (fica no banco, não no
navegador).

### Abordagem

**Tabela nova** (migration com RLS e política no mesmo arquivo, §6.2):

```
chat_conversa_nao_lida
  usuario_id  uuid  not null  -> usuarios(id)     -- a mesma família de chat_mensagens.usuario_id
  empresa_id  uuid  not null  -> empresas(id)
  alvo        text  not null                       -- 'geral' | 'grupo:<uuid>' | 'dm:<uuid>'
  criado_em   timestamptz not null default now()
  primary key (usuario_id, alvo)
```

- **RLS:** habilitada; select/insert/delete só onde `usuario_id = get_my_usuario_id()` e
  `empresa_id = get_my_empresa_id()`. Confirmar no banco a chave certa (§4.5) antes de escrever —
  `chat_mensagens.usuario_id` aponta para `usuarios(id)`, então uso `profile.id`.
- **Contador (`useUnreadChatByTarget`):** além da contagem atual, buscar minhas marcações e
  devolver, por alvo, `{ quantidade, marcadoNaoLido }`. Uma conversa é "não lida" se
  `quantidade > 0` **ou** `marcadoNaoLido`.
- **Badge (`Chat.tsx`):** se `quantidade > 0`, mostra o número (como hoje); se `quantidade == 0`
  mas `marcadoNaoLido`, mostra uma **bolinha sem número** (não há mensagem nova de verdade, só a
  marcação).
- **Menu de clique direito:** `onContextMenu` nos `<button>` de cada conversa em `MembersList`
  (`Chat.tsx` — Geral ~269-298/150-163, grupo ~309-341/173-201, DM ~370-404/202-230), usando o
  `ContextMenu` do shadcn (`src/components/ui/context-menu.tsx`, que já existe e nunca foi usado).
  Itens: **"Marcar como não lida"** (insere/atualiza a marcação) e, quando a conversa está com
  não-lida, **"Marcar como lida"** (chama `markAsRead` + apaga a marcação).
- **Ao abrir a conversa:** além do `markAsRead` que já existe (`Chat.tsx:1022-1031`, `1066-1071`),
  apagar minha marcação daquele alvo.
- **`.delete()`/`.update()` conferem a contagem** (§4.6): tratar `count === 0` conforme a regra
  (aqui é linha própria, mas as políticas RESTRICTIVE de cobrança podem zerar sem erro).
- **Anotações (Feature 4) não entra:** não faz sentido marcar as próprias anotações como não
  lidas, e elas nunca têm não-lida real. O item de menu não aparece nelas.

### Perspectivas

- **Vendedor comum (RLS):** testar logado como vendedor, não só gestor — a marcação tem de ser
  visível/gravável só para o dono.
- **Grupo:** a marcação é minha; não reaparece para os colegas (é o motivo da tabela).
- **Empresa bloqueada por cobrança:** as políticas RESTRICTIVE zeram `delete`/`update` sem erro;
  por isso conferimos a contagem.

### Banco: **sim** — 1 tabela nova. Segue o rito: medir → ensaiar em produção (transação que
termina em `RAISE` para desfazer) → apresentar → "pode" do Lucas → aplicar → conferir.

---

## Feature 4 — Anotações (espaço pessoal)

### Estado hoje

No chat interno, o tipo da conversa é **derivado** da nulidade de `grupo_id`/`recipient_id`
(não há coluna `tipo`): Geral = ambos nulos; DM = `recipient_id` preenchido; grupo = `grupo_id`
preenchido. A RLS (`chat_select`) libera quem é **remetente OU `recipient_id`** da mensagem
(`20260723160000_...sql`). Não existe hoje nenhum conceito intencional de "mensagens salvas" /
conversa consigo mesmo. (Há só um efeito colateral não intencional: a lista recolhida não exclui
você mesmo, `Chat.tsx:202`, e o rótulo "(você)" em `:393` é código morto na visão expandida.)

### Decisão

Cada pessoa tem, **fixo no topo da lista** (ícone de marcador), um espaço **"Anotações"** só dela,
para mandar recado/link/arquivo para si mesma. Ninguém mais vê, **não notifica**, e **não dá para
adicionar colegas**.

### Abordagem — **sem mudança no banco**

Modelar "Anotações" como uma **conversa direta de você com você** (`recipient_id = seu próprio
usuario.id`). Isso encaixa no que já existe:

- **Privacidade pronta:** a RLS já libera só remetente/recipient — nas anotações você é os dois,
  então só você vê. Ninguém precisa de política nova.
- **Não notifica:** os contadores contam `usuario_id ≠ eu`; como as anotações têm `usuario_id = eu`,
  nunca contam como não lida. Correto — você não é notificado das próprias anotações.
- **Envio:** a mutation de envio já aceita `recipient_id` (`use-chat.ts:499-505`); enviar com
  `recipient_id = eu` funciona. Confirmar na implementação que a política de **INSERT** aceita
  `recipient_id = eu` (é um DM para um usuário da minha empresa — eu).
- **Leitura:** a query de DM (`use-chat.ts:72-80`) e a chave `activityKeyFor` (`:378-384`) precisam
  tratar o caso `dm:<eu>`.

Na tela (`Chat.tsx`, `MembersList`):

- Adicionar uma entrada fixa **"Anotações"** no topo (acima do Geral), com ícone de marcador, que
  seleciona o alvo `{ type: 'dm', recipientId: meu id }`. Fica visível sempre (vazia até você
  escrever), com um texto de vazio: "Guarde aqui recados, links e arquivos para você. Só você vê."
- Tornar essa entrada a **canônica** para "você": excluir você mesmo da lista normal de DMs
  (já excluído na visão expandida, `:362`/`:139`; garantir também na recolhida, `:202`) e remover o
  código morto do "(você)".
- Anexos nas Anotações usam o mesmo bucket/preview e ganham o visualizador da Feature 2.

### Perspectivas

- **Multi-empresa / usuário novo:** todo mundo, de toda empresa, ganha o espaço automaticamente —
  ele é derivado, não semeado. Sem configuração por empresa, sem risco de "semeador diverge das
  migrations".
- **Não é grupo:** não dá para adicionar gente (se um dia a pessoa quiser um grupo de verdade, cria
  um grupo normal).

### Banco: nenhum.

---

## Verificação (antes de dizer "feito", §9)

Rodar no worktree, comparando com a linha de base:

- `npx tsc --noEmit -p tsconfig.app.json` — o número de erros herdados **não pode subir**.
- `npm run test` — passa limpo; o número de testes **não pode cair**.
- `npm run build` — compila.
- `npm run lint` — o número de problemas **não pode subir**.
- **Feature 3 (RLS):** testar logado como vendedor comum, não só gestor; confirmar que a migration
  foi de fato aplicada em produção.
- **Feature 2 (celular):** conferir o lightbox no toque.

## Fora de escopo

- Não mexer na caixa de WhatsApp.
- Não consertar o "não lido compartilhado" de grupo já existente (a Feature 3 só não piora).
- Não transformar "Anotações" em grupo de verdade.

## Ordem sugerida

1 → 2 → 4 (só tela, publicáveis direto) e **3 por último** (a que espera o "pode" do banco). As
quatro são independentes; a ordem é só de conveniência.
