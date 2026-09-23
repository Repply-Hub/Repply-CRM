# Aparência de grupo/Geral (símbolo + cores + imagem) e "marcar não lida" no WhatsApp

**Data:** 2026-09-23
**Ramo:** `chat-config` (worktree `_chat-config`)

Duas melhorias independentes:

- **#1 — Marcar como não lida no WhatsApp (bounded, sem banco).**
- **#2 — Aparência de grupo/Geral: símbolo + cores + imagem (arquitetural, mexe no banco).**

> 🔴 Regra do AGENTS §3: funcionalidade nova cobre **todas as superfícies** que toca, não só a
> citada no pedido. Este spec lista cada superfície explicitamente.

---

## #1 — Marcar como não lida no WhatsApp

### Estado hoje
A caixa de WhatsApp já sabe marcar não-lida (`whatsapp_conversas.nao_lidas_forcada`), mas só pelo
menu "..." do **cabeçalho** da conversa aberta (`WhatsAppInbox.tsx:8428`). A lista de conversas
(`renderConvButton`, `WhatsAppInbox.tsx:6696`, `<button>` em `:6710`) só tem `onClick`; não há
clique-direito (confirmado: 0 `onContextMenu` no arquivo). As ações já existem:
`useWaMarcarNaoLida(conversaId)` (grava `nao_lidas_forcada=true`, `use-whatsapp-inbox.ts:1253`) e
`useWaMarcarLida(conversaId)` (`:1213`), ambas vinculadas no componente (`:4770`, `:4828`).
`conversaNaoLida(conv)` decide o estado (`WhatsAppInbox.tsx:643`).

### O que fazer
Envolver o `<button>` de cada linha da lista expandida (`renderConvButton`) num `ContextMenu`
(shadcn, `@/components/ui/context-menu`) com um item:
- se `conversaNaoLida(conv)` for falso → **"Marcar como não lida"** → `marcarNaoLida.mutate(conv.id)`;
- se for verdadeiro → **"Marcar como lida"** → `marcarLida.mutate(conv.id)`.

Espelha o que já foi feito no chat interno. **Sem mudança de banco.** O `key={conv.id}` migra para
o elemento externo (`ContextMenu`), preservando classes e `onClick` do botão. O trilho recolhido
(`:7096`) não recebe o menu nesta entrega (igual ao chat interno).

### Banco: nenhum.

---

## #2 — Aparência de grupo/Geral: símbolo + cores + imagem

### Estado hoje
`chat_grupos` e `chat_geral_config` guardam só `nome` e `foto_url`. O avatar é desenhado sempre
igual: `<Avatar>` com `<ImagemPrivada src={foto_url}>` quando há foto, senão `<AvatarFallback
className="bg-primary text-primary-foreground">` com o ícone lucide fixo `Users2` (grupo) ou
`Users` (Geral). Esse bloco se repete em **8 lugares** (ver "Superfícies"). Não há onde guardar
símbolo nem cor. Existe um seletor de cor reutilizável no app (`SeletorCorLivre` +
`src/lib/wa-instancia-cores.ts`), hoje preso dentro de `WhatsAppInstanciasTab.tsx`.

### Decisão de produto
Cada empresa pode dar cara própria aos grupos e ao Chat Geral: escolher um **símbolo** (grade de
10) com **cor de fundo** e **cor do ícone**, **ou** enviar uma **imagem**. A imagem, quando existe,
ganha do símbolo. O **Chat Geral nasce com o balão de chat**. Grupos atuais não mudam (seguem no
ícone de pessoas). As **Anotações** ficam com o marcador fixo por ora (espaço pessoal, não um
grupo; personalizá-las exigiria guardar por pessoa — fora de escopo).

### Os 10 símbolos (chave → rótulo → ícone lucide)
`balao`→Balão de chat→`MessageCircle` · `grupo`→Grupo de pessoas→`Users2` ·
`lampada`→Lâmpada→`Lightbulb` · `notas`→Bloco de notas→`NotebookPen` · `maleta`→Maleta→`Briefcase` ·
`alvo`→Alvo→`Target` · `megafone`→Megafone→`Megaphone` · `agenda`→Agenda→`Calendar` ·
`checklist`→Checklist→`ListChecks` · `pasta`→Pasta→`Folder`.

Vive num catálogo puro `src/lib/simbolos-de-chat.ts` (chave estável + rótulo + componente), no
padrão do `catalogo-de-sons.ts`: símbolo que sumir da lista cai no padrão sem erro.

### Cor: paleta clara + cor livre
Paleta de **pares claros** (fundo em tom suave + ícone no tom forte da mesma cor), preferindo
tons claros como o fundo das Anotações. Clicar num par preenche fundo e ícone de forma
harmônica; a **cor livre** (reaproveitando o seletor do app) permite ajustar fundo e ícone
separadamente. Paleta inicial (fundo / ícone), em `src/lib/cores-de-chat.ts`:

| nome | fundo | ícone |
|---|---|---|
| Laranja | `#FFE9E0` | `#FF5A1F` |
| Azul | `#E3F0FF` | `#2563EB` |
| Verde | `#E4F7EC` | `#16A34A` |
| Roxo | `#F1E9FF` | `#7C3AED` |
| Rosa | `#FFE7F1` | `#DB2777` |
| Âmbar | `#FFF3D6` | `#D97706` |
| Teal | `#DEF7F5` | `#0D9488` |
| Cinza | `#ECEEF1` | `#475569` |

Guardadas como **hex** (ex.: `#FFE9E0`), aplicadas por `style` inline (fundo e cor do ícone), como
o `SeletorCorLivre` já faz. `SeletorCorLivre` é **extraído** de `WhatsAppInstanciasTab.tsx` para
`src/components/shared/SeletorCorLivre.tsx` (e o Tab passa a importá-lo), para reuso sem duplicar.

### Banco (mudança pequena e de baixo risco)
Acrescentar a **`chat_grupos`** e a **`chat_geral_config`** três colunas de texto, todas anuláveis:
`icone text`, `cor_fundo text`, `cor_icone text`. `foto_url` continua. **Só `ADD COLUMN`** — as
tabelas já têm RLS e políticas de UPDATE (quem pode editar grupo = criador/admin; Geral =
gestor/admin), e colunas novas herdam essas políticas. **Nenhuma política nova.** Atualizar
`types.ts` à mão e os tipos `ChatGrupo`/`ChatGeralConfig` e os `select('*')` já pegam as colunas.

### Como decide o avatar (fonte única)
Componente novo `src/components/chat/AvatarDeChat.tsx` que recebe `{ fotoUrl, icone, corFundo,
corIcone, iconePadrao }` e decide:
1. `fotoUrl` → `<ImagemPrivada>` (com `hideOnError`);
2. senão `icone` (do catálogo) → esse ícone, `style={{ backgroundColor: corFundo, color: corIcone }}`
   (com padrão laranja/branco se as cores vierem nulas);
3. senão `iconePadrao` no fundo primário (o de hoje).

Substitui os 8 blocos repetidos — DRY e consistência.

### O seletor (peça reutilizável)
`src/components/chat/SeletorDeAparencia.tsx`: grade dos 10 símbolos + paleta de cor (fundo e ícone)
+ botão "cor livre" + a opção "enviar imagem" (o fluxo de foto que já existe). Estado controlado
(recebe/emite `{ icone, corFundo, corIcone, foto }`). Uma prévia do avatar no topo.

### Superfícies (AGENTS §3 — cobrir TODAS)
**Onde o avatar é desenhado (trocar pelo `AvatarDeChat`) — 8 lugares, `Chat.tsx`:**
- Grupo: trilho recolhido (~`214`), lista expandida (~`371`), cabeçalho da conversa (~`1601`),
  ficha lateral (~`1722`).
- Geral: trilho recolhido (~`191`), lista expandida (~`323`), cabeçalho (~`1636`), ficha (~`1823`).

**Onde o seletor entra — 3 lugares:**
- **Criar grupo:** `CreateGroupDialog.tsx` (hoje só foto, `:158–180`) → acrescenta o seletor; grava
  `icone/cor_fundo/cor_icone` no insert (e mantém o upload de foto quando escolhida).
- **Editar grupo:** ficha lateral do grupo (`Chat.tsx` bloco `target.type==='grupo'`, ~`1706`) →
  `useUpdateChatGrupo` passa a aceitar `icone/corFundo/corIcone` além de `foto`.
- **Editar Geral:** ficha do Geral (`Chat.tsx` bloco `target.type==='geral'`, ~`1807`) →
  `useUpdateChatGeralConfig` idem.

**Padrões:** grupo sem nada = `Users2` no primário (sem mudança para grupos atuais); Geral sem nada
= **`MessageCircle`** no primário (novo padrão — troca só o ícone).

### Perspectivas
- **Multi-empresa:** cada empresa edita a aparência dos próprios grupos/Geral; a RLL das duas
  tabelas já isola por empresa e por permissão. Nada vaza nem se impõe a outra empresa.
- **Quem não é gestor:** editar aparência do Geral segue exigindo gestor/admin (política atual);
  editar grupo segue a regra atual do grupo. Testar como vendedor comum.
- **Estado atual:** grupos e Geral existentes seguem funcionando; só ganham a opção. O Geral muda o
  ícone padrão para o balão — mudança visual pequena e desejada.
- **Celular:** o seletor precisa caber e ser tocável; a prévia ajuda.
- **Símbolo/cor removidos no futuro:** o catálogo cai no padrão sem erro (como os sons).

### Banco: **sim** — `ADD COLUMN` em 2 tabelas. Rito: medir → ensaiar (transação que desfaz) →
apresentar → "pode" → aplicar → conferir.

---

## Verificação (§9 / AGENTS §5, os "três não")
- `npm run test` — a suíte **inteira** (não só o arquivo tocado); nº de testes não cai.
- `npx tsc --noEmit -p tsconfig.app.json` — não sobe da base.
- `npm run build` — compila. `npm run lint` — não sobe.
- RLS: testar como vendedor comum (quem pode editar aparência de grupo/Geral).
- Banco: confirmar as colunas aplicadas antes de publicar; publicar só com o "pode".

## Fora de escopo
- Personalizar a aparência das **Anotações** (por pessoa) — possível depois.
- Menu de clique-direito no **trilho recolhido** do WhatsApp e do chat interno.
- Reordenar/renomear os símbolos existentes.

## Ordem sugerida
#1 (rápida, sem banco) → catálogo de símbolos + cores + `AvatarDeChat` + extrair `SeletorCorLivre`
→ migration (gated) → seletor → ligar na criação/edição de grupo e Geral.
