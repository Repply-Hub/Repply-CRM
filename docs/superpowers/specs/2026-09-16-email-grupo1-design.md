# E-mail — Grupo 1 (4 mudanças de tela) — desenho e plano

> Status: DESENHO APROVADO em 16/09/2026 (Lucas). Só tela; **não toca banco nem função de
> servidor**. Prioridade por regras (Grupo 2) é desenho à parte.

## Decisões do dono do produto (16/09 — não reabrir)
1. **Cc/Cco** ao enviar, estilo Gmail (link "Cc/Cco" que abre os campos). Para, Cc e Cco aceitam
   **vários endereços**. Rascunho salvo **não** guardará Cc/Cco por ora (sem mudança de banco;
   igual a `incluirAssinatura`, que também não persiste).
2. **Arrastar sempre**, por uma alça — sem o botão "modo arrastar".
3. **Atalho da assinatura** alcançável por **qualquer** pessoa (sem guarda de gestor).
4. **Ações no hover/seleção** — sai a coluna fixa de botões; excluir (e "marcar não lida")
   aparecem ao passar o mouse na linha ou quando o e-mail está selecionado. No **celular**
   (sem hover) ficam sempre visíveis. Vale para Recebidos, Enviados e Rascunhos.

## Base: como está hoje (medido em disco, origin/main = d25e67ff)
- Servidor e banco **já enviam Cc/Cco**: `email-enviar` monta `payload.cc/bcc`; `email_mensagens`
  tem colunas `cc`/`bcc`; `enviarMutation` (`use-email-empresa.ts:244-289`) já aceita `cc?`/`bcc?`.
  Falta: campos na tela, o wrapper `enviarEmail` (`use-email-empresa.ts:328-341`) expor cc/bcc, e
  o "Para" aceitar vários (hoje é string única).
- Arrastar **já funciona** por HTML5 nativo; só há um toggle `modoArrastar` no caminho
  (`Emails.tsx:257`, botão `Move` ~2092-2111, `draggable={modoArrastar}` nas linhas ~2229/2490,
  `onMoverParaMarcador` condicionado ~2182-2187). Clique nativo não dispara arrasto, então
  `draggable` sempre-ligado é seguro.
- Atalho da assinatura só existe dentro de "Gerenciar caixa" (gestor). Editor em
  `/configuracoes?tab=perfil`. Navegação por `useNavigate` (padrão em `GerenciarCaixaDialog.tsx:226`).
- Ações por linha: Recebidos (`Emails.tsx:2596-2631`: "marcar não lida" quando lido + excluir),
  Enviados e Rascunhos têm coluna equivalente. A linha já é `group` (hover pronto).

## Plano de implementação (só arquivos de `src/`)

### T1 — lib pura (TDD): `src/lib/enderecos-email.ts` + `.test.ts`
- `parseEnderecos(texto: string): string[]` — separa por `,` e `;`, apara espaços, descarta vazios,
  remove duplicados (comparação sem diferenciar maiúsculas no endereço). Preserva forma "Nome <e@x>".
- `enderecoParece Valido(s: string): boolean` — tem um `@` com algo antes e um ponto depois (leniente,
  só para aviso, nunca para travar). Nome sem espaço: `enderecoPareceValido`.
- Teste primeiro (RED): um endereço; vários com vírgula; com ponto-e-vírgula; espaços; separador
  no fim; duplicado; string vazia → `[]`. Depois implementa (GREEN).

### T2 — Cc/Cco no compositor
- `CompositorEmail.tsx`: `RascunhoEmail` ganha `cc: string; cco: string;`. Estado local
  `mostrarCc`/`mostrarCco` (começa `true` se `valores.cc`/`valores.cco` não vazio). Na linha "Para",
  à direita, dois links "Cc" e "Cco" que revelam as linhas de campo (mesmo estilo do "Para"),
  inseridas entre "Para" e "Assunto". Rótulos com `<label htmlFor>` para acessibilidade.
- `Emails.tsx`: `formData` (~361) ganha `cc:'' , cco:''`; resets incluem os dois; no envio
  (`sendEmailMutation` ~1016-1111) usa `parseEnderecos` para Para (vários), Cc e Cco, e passa
  `cc`/`bcc` para `enviarEmail`. Se `parseEnderecos(destinatario).length === 0`, avisa e não envia.
- `use-email-empresa.ts`: `enviarEmail` (~328-341) ganha `cc?: string[]`, `bcc?: string[]` e repassa
  ao `enviarMutation` (que já os aceita).
- **Não** mexer no autosave de rascunho (cc/cco não persistem por ora).

### T3 — arrastar sempre por alça
- `Emails.tsx`: remover estado `modoArrastar` e o botão `Move` (~2092-2111). Linhas de Recebidos e
  Enviados: `draggable` sempre `true`, `onMoverParaMarcador` sempre passado. Alça `GripVertical`
  sempre presente, discreta (`opacity-60 group-hover:opacity-100`), `cursor-grab`. Clique na linha
  segue abrindo (nativo não confunde clique com arrasto). Conferir que soltar num marcador
  (`BarraPastas`) segue chamando `moverParaMarcadorMut`.

### T4 — atalho da assinatura para todos
- `CompositorEmail.tsx`: nova prop opcional `onConfigurarAssinatura?: () => void`. Botão/link
  discreto "Configurar assinatura" perto do bloco de assinatura (nos dois estados: com e sem
  assinatura). `Emails.tsx` passa `onConfigurarAssinatura={() => navigate('/configuracoes?tab=perfil')}`
  nas duas montagens do compositor; adicionar `useNavigate` se ainda não houver. Sem guarda de papel.

### T5 — ações no hover/seleção (Recebidos, Enviados, Rascunhos)
- Em cada aba, o contêiner de ações da linha passa a
  `opacity-0 group-hover:opacity-100 focus-within:opacity-100` **e** visível quando
  `selectedIds.includes(email.id)`. **Celular**: sem hover — manter visível abaixo de `sm`
  (ex.: classes que só escondem a partir de `sm:`). Nada de remover as ações em si (excluir e
  "marcar não lida" continuam); só mudam quando aparecem. Preservar `stopPropagation` nos cliques.

## Verificação (antes de publicar)
- `npx vitest run src/lib/enderecos-email.test.ts` — passa; e o teste falha se a lógica quebrar (RED provado).
- `npx vitest run` — bateria inteira verde, número de testes não cai.
- `npx tsc --noEmit -p tsconfig.app.json` — sem erro novo (base herdada 36).
- `npm run build` — compila.
- Foto da tela: compositor com Cc/Cco abertos; caixa de entrada com a ação aparecendo no hover e a
  alça de arrastar.

## Fora de escopo (Grupo 2, à parte): prioridade por regras (banco + servidor).
