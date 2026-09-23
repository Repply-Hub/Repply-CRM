# Editar grupo/Geral num painel único, símbolos de obra e cores claras+escuras

**Data:** 2026-09-23
**Ramo:** `editar-grupo` (worktree `_editar-grupo`)
**Contexto:** evolução da entrega de 23/09 (`aparencia-grupo-e-nao-lida-whatsapp`), que estreou
símbolo/cor/imagem para grupo e Chat Geral. O dono pediu quatro ajustes; este spec cobre os quatro.

> 🔴 AGENTS §3: funcionalidade nova cobre **todas as superfícies** que toca. Este spec lista cada uma.

---

## Panorama dos quatro ajustes

1. **Editar o grupo inteiro num painel único** (arquitetural). Hoje a aparência é editada **solta
   dentro da ficha lateral**, espremida numa faixa estreita ao lado do nome — e é isso que **vaza
   para fora da tela** (o "trecho bugado"). Passa a existir um botão **"Editar grupo"** que abre um
   painel igual ao de **criar grupo**: estilo em cima, participantes embaixo.
2. **Chat Geral** ganha o mesmo botão "Editar", abrindo o painel **só com estilo + nome** (sem
   participantes — o Geral é sempre a equipe inteira).
3. **+5 símbolos de obra/construção** no catálogo.
4. **Cores com versão clara E escura** (fundo forte + símbolo branco), e o **padrão passa a ser o
   laranja escuro + branco** (o visual clássico do sistema).

**Banco: nenhuma mudança.** As colunas `icone/cor_fundo/cor_icone` já existem; e a regra de segurança
de `chat_grupo_membros` **já permite remover** participante (criador do grupo ou gestor — ver §Banco).

---

## 1. Editar o grupo inteiro (painel único)

### Estado hoje
Na ficha lateral (`Chat.tsx`, `SheetContent` ~1688), o bloco de aparência (`<SeletorDeAparencia>`)
está dentro de `<div className="flex items-center gap-3 mb-4">`, **ao lado** da coluna do nome
(`min-w-0 flex-1`). O `SeletorDeAparencia` é um bloco vertical (prévia + grade de símbolos + paleta +
cor livre) que precisa da largura toda; espremido em ~metade de uma folha de 448px, a paleta (8×28px)
e a linha "Fundo:/Ícone:" **transbordam pela borda direita**. Na **criação** o mesmo componente fica
em `<CorpoDialogo>` na largura inteira — por isso lá está correto. Essa é a causa-raiz do "fora da
tela": não é o componente, é o encaixe estreito na ficha.

A edição de participantes hoje só sabe **adicionar** (`useAddChatGrupoMembros` + um `Dialog`
separado, `addMembersOpen` ~2310). **Remover não existe.** O nome é editado por um lápis inline na
ficha. `canDeleteGrupo = canManageGrupos || activeGrupo.criado_por === myVendedor` já é a permissão de
"quem pode editar/excluir este grupo".

### O que fazer
Um componente novo **`EditarConversaDialog`** (`src/components/chat/EditarConversaDialog.tsx`) que
espelha o layout do `CreateGroupDialog` (mesmo `ConteudoDialogo` responsivo):

- **Cabeçalho:** "Editar grupo".
- **Corpo (topo):** `<SeletorDeAparencia>` (estilo) + campo de **nome**.
- **Corpo (baixo):** `<SeletorDeMembros>` — a lista de participantes com marcar/desmarcar.
- **Rodapé:** botão **"Salvar"**.

Estado **local** (rascunho), aplicado só no "Salvar" — igual à criação, que segura o estado e grava no
"Criar Grupo". Nada é mutado a cada clique (diferente da ficha de hoje).

**Ao salvar (grupo):**
1. Nome/estilo mudaram → `useUpdateChatGrupo` (com `limparFoto:true` quando escolheu símbolo/cor, ou
   `foto` quando escolheu imagem — a mesma lógica de imagem-ganha-do-símbolo já existente).
2. Participantes → **diferença** contra os membros atuais: os recém-marcados entram por
   `useAddChatGrupoMembros`; os desmarcados saem por **`useRemoveChatGrupoMembros`** (novo, §Remover).
3. Sucesso → fecha o painel, toasts, invalida as listas (`chat-grupo-membros`, `chat-grupos`).

**Onde o botão vive.** Na ficha lateral do grupo, o `<SeletorDeAparencia>` inline **sai**. No lugar:
- avatar **só de ver** (`<AvatarDeChat>` com `IconePadrao={Users2}`),
- nome **só de ver** (o lápis inline sai; renomear passa a ser dentro do painel),
- um botão **"Editar grupo"** — visível **só quando `canDeleteGrupo`** (criador ou gestor). Isso
  também conserta um efeito colateral silencioso de hoje: o seletor de aparência aparecia para
  **qualquer** membro, e a gravação era recusada pela RLS **sem erro** (§4.6 do CLAUDE.md) — o membro
  comum "editava" e nada mudava.

A ficha continua sendo a **visão** do grupo: avatar, nome, **lista de participantes só de ver**, e as
abas Imagens/Vídeos/Docs/Links. O "Excluir grupo" segue no rodapé (`canDeleteGrupo`).

O `Dialog` separado de "Adicionar participantes" (`addMembersOpen` e o `handleAddMembers`) e o botão
"Adicionar" da ficha **saem** — o painel de editar cobre isso. Remover o estado órfão junto
(`addMembersOpen`, `addMembersSearch`, `selectedNewMembers` se não usado em outro lugar).

### Reaproveitamento (DRY, AGENTS §2)
`<SeletorDeAparencia>` já é peça pronta. A **lista de membros** hoje está inline no `CreateGroupDialog`;
extrair para **`src/components/chat/SeletorDeMembros.tsx`** (busca + checkbox + avatar + nome + toggle),
controlado (`membros`, `selecionados: string[]`, `onToggle`, `meuId`). O `CreateGroupDialog` passa a
**consumir** essa peça, com **comportamento idêntico** (mesma lista, exclui o próprio usuário `meuId`,
selecionados entram na criação). O `EditarConversaDialog` usa a mesma peça, pré-marcando os membros
atuais. 🔴 A tela de criar **não muda de comportamento** — só troca a lista inline pela peça; coberto
por teste unitário do `SeletorDeMembros` e verificação manual da criação.

O `SeletorDeMembros` gerencia **os outros** (exclui o próprio, como a criação já faz). Adicionar/remover
**a si mesmo** fica fora de escopo (o criador permanece; um gestor que edita grupo alheio edita via
permissão de gestor, sem precisar entrar na lista).

---

## 2. Chat Geral: mesmo painel, sem participantes

O mesmo `EditarConversaDialog`, com um alvo discriminado:
`alvo: { tipo: 'grupo', grupo } | { tipo: 'geral', config }`.

- **`tipo: 'geral'`** → cabeçalho "Editar Chat Geral", **sem** a seção de participantes (é a equipe
  toda), salvar via `useUpdateChatGeralConfig` (mesma lógica de estilo/imagem). Continua exigindo
  gestor/admin, como hoje.
- Na ficha do Geral, mesma troca: `<SeletorDeAparencia>` inline sai, entra avatar só-de-ver
  (`IconePadrao={MessageCircle}`) + botão **"Editar"** (visível a quem pode editar o Geral).

---

## 3. Símbolos de obra/construção (+5)

Acrescentar ao catálogo `src/lib/simbolos-de-chat.ts`, no padrão atual (chave estável + rótulo +
ícone lucide). Cinco tradicionais do ramo de construção da MD:

`capacete`→Capacete de obra→`HardHat` · `martelo`→Martelo→`Hammer` · `regua`→Régua→`Ruler` ·
`predio`→Prédio→`Building2` · `caminhao`→Caminhão→`Truck`.

Ficam **15** símbolos (10 atuais + 5). 🔴 Antes de usar, **confirmar que cada ícone existe** na versão
instalada do `lucide-react` (importação resolve no build); trocar por equivalente se algum faltar. A
grade (`flex flex-wrap`) acomoda qualquer quantidade.

---

## 4. Cores: clara + escura, padrão laranja escuro

### Catálogo
`src/lib/cores-de-chat.ts` passa a ter, para cada cor, **duas versões**: a **clara** de hoje (fundo
suave + símbolo na cor forte) e uma **escura** (fundo na cor forte + símbolo **branco** `#FFFFFF`). A
escura deriva da clara: `escuro = { fundo: <cor forte da clara>, icone: '#FFFFFF' }`.

| cor | clara (fundo / ícone) | escura (fundo / ícone) |
|---|---|---|
| Laranja | `#FFE9E0` / `#FF5A1F` | `#FF5A1F` / `#FFFFFF` |
| Azul | `#E3F0FF` / `#2563EB` | `#2563EB` / `#FFFFFF` |
| Verde | `#E4F7EC` / `#16A34A` | `#16A34A` / `#FFFFFF` |
| Roxo | `#F1E9FF` / `#7C3AED` | `#7C3AED` / `#FFFFFF` |
| Rosa | `#FFE7F1` / `#DB2777` | `#DB2777` / `#FFFFFF` |
| Âmbar | `#FFF3D6` / `#D97706` | `#D97706` / `#FFFFFF` |
| Teal | `#DEF7F5` / `#0D9488` | `#0D9488` / `#FFFFFF` |
| Cinza | `#ECEEF1` / `#475569` | `#475569` / `#FFFFFF` |

O `SeletorDeAparencia` mostra **duas fileiras**: "Claras" e "Escuras" (16 atalhos). A **cor livre**
(fundo e ícone separados) continua embaixo, sem mudança.

### Padrão
`COR_FUNDO_PADRAO = '#FF5A1F'` e `COR_ICONE_PADRAO = '#FFFFFF'` (era `#FFE9E0`/`#FF5A1F`). Assim,
escolher um símbolo sem mexer na cor cai no **laranja escuro + branco** — o visual clássico e o mesmo
que o Chat Geral já mostra hoje quando não tem cor definida (o `AvatarDeChat` já cai em `bg-primary` +
branco; agora o atalho de símbolo combina com esse padrão). `AvatarDeChat` **não muda**.

Guardadas como hex, aplicadas por `style` inline — como já é.

---

## Remover participante (novo, sem mudança de banco)

`useRemoveChatGrupoMembros` em `src/hooks/use-chat.ts`: `DELETE` em `chat_grupo_membros` por
`grupo_id` + `usuario_id`, com **`{ count: 'exact' }`** e **`count === 0` tratado como recusa**
(§4.6 do CLAUDE.md — a RLS recusa sem erro; nunca `!count`). Mensagem de recusa via
`recusaSemErro`/`mensagemDeErro`. Invalida `['chat-grupo-membros', grupoId]`.

Sem trava de "esvaziar o grupo" nem de "remover o criador" (decisão do dono: livre dentro do que a
segurança permite).

### Banco
🔴 **Nenhuma migration.** A política já existente cobre o `DELETE`
(`20260416174744...`): `chat_grupo_membros_delete FOR DELETE TO authenticated USING (EXISTS (SELECT 1
FROM chat_grupos g WHERE g.id = chat_grupo_membros.grupo_id AND (g.criado_por = get_my_usuario_id() OR
is_gestor())))`. Confere com `canDeleteGrupo` da tela. `INSERT` e `SELECT` também já existem. As
colunas de estilo já existem.

---

## Superfícies (AGENTS §3 — cobrir TODAS)

- **Criar grupo** (`CreateGroupDialog.tsx`): passa a usar `SeletorDeMembros` (comportamento idêntico);
  ganha os símbolos/cores novos automaticamente (via `SeletorDeAparencia`). **Sem mudança de fluxo.**
- **Editar grupo** (novo `EditarConversaDialog`, aberto pela ficha do grupo).
- **Editar Chat Geral** (mesmo dialog, `tipo:'geral'`, aberto pela ficha do Geral).
- **Ficha lateral (grupo e Geral)** em `Chat.tsx`: aparência inline sai; entra avatar só-de-ver +
  botão "Editar" (permissão); participantes viram lista só-de-ver; abas de mídia e "Excluir" ficam.
- **`SeletorDeAparencia`**: duas fileiras de cor + grade com 15 símbolos + novo padrão.
- **`AvatarDeChat`** e os 8 pontos de desenho do avatar: **inalterados** (já leem `icone/cor_*`).

---

## Perspectivas

- **Multi-empresa:** a RLS isola por empresa; cada um edita só os próprios grupos.
- **Quem não é criador nem gestor:** o botão "Editar grupo" **não aparece** — e a RLS já recusaria a
  gravação. Conserta o silêncio de hoje (o seletor aparecia para todos e falhava mudo). **Testar como
  vendedor comum.**
- **Remover participante:** só criador/gestor (RLS + `count===0` mostra a recusa na tela).
- **Celular:** o painel é `ConteudoDialogo` (responsivo, com rolagem no corpo); a lista de membros
  rola dentro do corpo. Testar em largura de telefone.
- **Estado:** grupo com muitos membros → lista rola; empresa com muita gente → a busca filtra; grupo
  recém-criado; empresa bloqueada por cobrança (o `DELETE` volta zero linhas → recusa tratada).
- **O avesso:** um gestor editando grupo de outro — pode (RLS permite), e não precisa se auto-incluir.

---

## Verificação (AGENTS §5 — os três "não")

- `npm run test` — suíte **inteira**; o número de testes não cai. Novos testes:
  `simbolos-de-chat` (15 chaves, construção presentes), `cores-de-chat` (par claro+escuro por cor,
  padrão laranja escuro), `SeletorDeMembros` (toggle/seleção), `EditarConversaDialog` (diff de
  participantes: adiciona marcados, remove desmarcados; geral sem participantes),
  `useRemoveChatGrupoMembros` (`count===0` vira recusa).
- `npx tsc --noEmit -p tsconfig.app.json` — não sobe da base.
- `npm run build` — compila. `npm run lint` — número não sobe.
- RLS: testar edição/remoção como vendedor comum (botão escondido; gravação recusada).
- Banco: nada a aplicar.

## Fora de escopo

- Personalizar a aparência das **Anotações** (por pessoa).
- Adicionar/remover **a si mesmo** na lista de participantes.
- Trava de esvaziar o grupo / de remover o criador.
- Menu de clique-direito no trilho recolhido.
- Reordenar/renomear os símbolos existentes.

## Ordem sugerida

Catálogos (símbolos, cores+padrão) → `SeletorDeAparencia` (duas fileiras) → `SeletorDeMembros`
(extração, criação segue igual) → `useRemoveChatGrupoMembros` → `EditarConversaDialog` (grupo e geral)
→ religar as fichas em `Chat.tsx` (tirar aparência inline, pôr botão "Editar", limpar o add-members
antigo).
