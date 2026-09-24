# Ajustes na seção de Tarefas (5 itens)

**Data:** 2026-09-24
**Ramo:** `tarefas` (worktree `_tarefas`)
**Contexto:** cinco ajustes pedidos pelo dono na seção de Tarefas — quatro bugs/padronizações e uma funcionalidade nova (fotos nos cards). Um deles (item 1) mexe no banco.

> 🔴 AGENTS §3: funcionalidade nova cobre TODAS as superfícies que toca. Este spec lista cada uma.
> 🔴 O detalhe da tarefa NÃO é um componente próprio: é montado inline num `<Sheet>` cru dentro de `src/pages/Tarefas.tsx`.

---

## Panorama

| # | Item | Tipo | Banco? |
|---|---|---|---|
| 1 | "Projeto / Obra" vira vínculo real com **Obras** | funcionalidade | 🔴 sim (1 coluna) |
| 2 | Botões do detalhe da tarefa no padrão de Negócio/Obra (Editar+Fechar à esquerda, Excluir à direita) | padronização | não |
| 3 | Negócio e Empresa do detalhe da tarefa viram **clicáveis** (abrem o negócio / a ficha do cliente) | conserto | não |
| 4 | **Foto do responsável ao lado do nome** nos cards e listas de Tarefa e de Negócio | funcionalidade | não |
| 5 | Formulário de nova tarefa aberto do painel do **negócio**: mostrar os campos vinculados e destravar o **scroll** | conserto | não |

---

## Item 1 — "Projeto / Obra" ligado às Obras de verdade

### Estado hoje
`tarefas.projeto` é **texto livre**; o `ProjetoSelect` (`src/components/tarefas/ProjetoSelect.tsx`) tira as opções do `localStorage` (`tarefas_projetos`), sem nenhum vínculo com a tabela `obras`. O `TarefaFormDialog` **nem tem** o campo na tela (o estado `form.projeto` existe e é salvo, mas não há input ligado a ele). O detalhe (`Tarefas.tsx:791-796`) mostra o texto com o rótulo "Projeto / Obra". Só o formulário do WhatsApp usa o `ProjetoSelect`.

### Decisão do dono
Ligar de verdade às Obras: o campo passa a ser um **seletor das obras cadastradas** e a tarefa guarda o vínculo.

### Banco (🔴 migration, gated no "pode")
`ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id);` — anulável, herda a RLS de `tarefas` (sem política nova, como na entrega do chat). A coluna **`projeto` (texto) fica** (não se apaga dado; §6.3), servindo de legado.
Atualizar `src/integrations/supabase/types.ts` à mão (Row/Insert/Update de `tarefas`).

### Frontend
- `use-tarefas.ts`: a interface `Tarefa` ganha `obra_id?: string | null`; create/update passam a gravar `obra_id`.
- `TarefaFormDialog`: acrescentar o campo **"Obra"** (que hoje não existe na tela), um `SeletorComBusca` de obras. Fonte: `useObras()` (todas as obras da empresa; obra tem `nome_obra` e `clientes(empresa)`). Quando a tarefa tem `cliente_id`, **filtra as obras por aquele cliente**; senão, lista todas. Grava `obra_id`. O `form.projeto` (texto legado) deixa de ser gravado por aqui.
- **Pré-preencher a obra a partir do negócio:** o negócio já aponta para uma obra (`pedidos.obra_id`). Ao abrir a tarefa de um negócio, se o negócio tiver obra, o campo Obra nasce **preenchido com ela** (editável — não travado). Vem junto do vínculo do negócio (ver item 5 e `alvoDaTarefaDoNegocio`).
- Detalhe da tarefa (`Tarefas.tsx`): o bloco "Projeto / Obra" vira **"Obra"** e mostra o **nome da obra** (de `obra_id`, via `useObras`); se não houver `obra_id` mas houver o `projeto` legado, mostra o texto legado; senão "—". (Não fica clicável — obras não têm rota própria; fora de escopo abrir a obra a partir daqui.)
- `ProjetoSelect` (localStorage) sai do fluxo de tarefa. O formulário do WhatsApp (que hoje usa `ProjetoSelect`) — ver "Fora de escopo".

---

## Item 2 — Botões do detalhe no padrão da casa

### Estado hoje
`Tarefas.tsx` monta o detalhe num `<Sheet>` cru; o `SheetFooter` (`:851-878`) põe **Excluir à esquerda** e Fechar/Editar à direita — o inverso de Negócio e Obra.

### O que fazer
Trocar a moldura do detalhe da tarefa pela compartilhada `src/components/shared/PainelDeDetalhes.tsx` (`ConteudoDoPainel`/`CabecalhoDoPainel`/`CorpoDoPainel`/`RodapeDoPainel`), como Negócio (`PainelDoNegocio.tsx`) e Obra (`Obras.tsx`) já fazem: cabeçalho e rodapé **congelados**, só o miolo rola, e o rodapé com **Editar + Fechar à esquerda (`esquerda=`), Excluir à direita (`children`)**. Preserva os `onClick` atuais dos três botões.

---

## Item 3 — Negócio e Empresa clicáveis no detalhe

### Estado hoje
No detalhe (`Tarefas.tsx:797-815`), Empresa e Negócio são **só texto**, sem `onClick`.

### O que fazer
- **Empresa** (o cliente da tarefa): clicar navega para a ficha do cliente — `navigate(\`/clientes/${selectedTarefa.cliente_id}\`)` (a rota `/clientes/:slug` aceita id puro). Só vira link quando há `cliente_id`.
- **Negócio** (o `pedido` vinculado): clicar **abre o negócio** no mesmo painel que o resto do sistema usa. Montar em `Tarefas.tsx` o hook `useNegocioNoEndereco()` + `<PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />` (como `VendasDaObra.tsx` faz dentro de Obras). Clicar no negócio **fecha o detalhe da tarefa** e chama `abrirNegocio(pedido_id)` — evita empilhar dois painéis (e evita o problema de scroll do item 5). Só vira link quando há negócio vinculado.
- Aparência: link discreto (cor primária, sublinhado no hover), não botão.

---

## Item 4 — Foto do responsável ao lado do nome (cards e listas)

### Estado hoje
Nenhum card/lista de Tarefa ou de Negócio mostra foto; só a **Tabela do Time** da tela "Hoje" (`TabelaDoTime.tsx`) já mostra — é o exemplo que o dono citou como bom. O responsável aparece como **nome em texto**: card de tarefa (`TarefaKanbanCard.tsx:84-91`), lista de tarefa (`Tarefas.tsx:566-569` e `:647-650`, via `UserProfilePopover`), card de negócio (`kanban/KanbanCard.tsx:172-182`), lista de negócio (`Negocios.tsx:421-427` e `PainelDeNegocios.tsx:503-504`).

### O que fazer
Criar uma peça reutilizável `src/components/shared/ResponsavelComFoto.tsx` (o padrão de avatar que já se repete: `Avatar`/`AvatarImage`/`AvatarFallback` + `iniciais`), que recebe o **nome** do responsável e, opcionalmente, o `avatarUrl`. Quando o `avatarUrl` não vier, a peça procura pela foto em `useVendedores()` **por nome** (é como o `UserProfilePopover` já faz hoje; nome de membro da equipe raramente repete). Props: `{ nome: string | null; avatarUrl?: string | null; tamanho?: 'xs'|'sm'; className? }`. Sem nome → não renderiza nada (não inventa "?").

Aplicar (ao lado do nome, avatar pequeno):
- **Tarefa:** `TarefaKanbanCard.tsx` (card kanban), `Tarefas.tsx` (linha da lista desktop e card mobile). Onde hoje é `UserProfilePopover`, manter o popover e **acrescentar a foto no gatilho** (ou envolver o nome com a foto ao lado) — a foto aparece sem precisar clicar.
- **Negócio:** `kanban/KanbanCard.tsx` (card kanban), `Negocios.tsx` (lista) e `PainelDeNegocios.tsx` (lista reutilizável). Aqui o responsável costuma vir como objeto `vendedor` — se ele já trouxer `avatar_url`, passar direto; senão, a peça procura por nome.

A **Tabela de Hoje fica como está** (já tem foto). O "Hoje" topo (`ItemPauta`) não estava no pedido — fora de escopo.

---

## Item 5 — Nova tarefa a partir do negócio: mostrar vínculos e destravar o scroll

### Estado hoje
O painel do negócio (`PainelDoNegocio.tsx:663-676`) abre o **mesmo** `TarefaFormDialog` (o bom), com `extraFields={alvoDaTarefaDoNegocio(...)}` travando `cliente_id` e `pedido_id`. Duas consequências que o dono viu:
1. **Campos faltando:** com os dois travados, o bloco Empresa/Negócio some inteiro (`TarefaFormDialog.tsx:281`, `(!clienteTravado || !negocioTravado)`).
2. **Scroll travado:** o `TarefaFormDialog` abre por cima do painel do negócio, que é um `Sheet` **modal** (Radix) — o trava-rolagem do Sheet por baixo bloqueia a roda do mouse dentro do formulário, mesmo o dialog sendo `modal={false}`.

### O que fazer
- **(5a) Mostrar os campos travados, preenchidos.** Quando `clienteTravado`/`negocioTravado`, em vez de esconder, **mostrar** os campos Empresa e Negócio **preenchidos e desabilitados** (só leitura), para a pessoa conferir a que a tarefa está sendo vinculada. Ajustar `TarefaFormDialog.tsx:281-327`: renderizar sempre os campos; quando travado, `disabled` + valor vindo do `extraFields`/`pedidoVinculado`. (O `handleSave` já aplica `...extraFields` por cima — o valor gravado continua o do negócio.)
- **(5b) Destravar o scroll (systematic-debugging).** A causa provável é o trava-rolagem do `Sheet` modal do painel por baixo. Investigar a fundo antes de consertar (§systematic-debugging). Candidatos, do menos ao mais invasivo: (i) o próprio `TarefaFormDialog` já cria backdrop manual e usa `modal={false}` — conferir se falta `RemoveScroll`/`onWheel` ou se o Sheet de baixo precisa liberar a rolagem enquanto o dialog está aberto; (ii) fechar/ocultar o painel do negócio enquanto o formulário de tarefa está aberto. Escolher o conserto que NÃO quebre o scroll do formulário aberto pela tela de Tarefas (onde não há Sheet por baixo) nem o do painel do negócio depois de fechar o formulário. Verificar com evidência (ver Verificação).

### Outros locais (o dono pediu "verificar se não acontece em outros lugares")
Existe um **formulário de nova tarefa DUPLICADO e cru** em `src/pages/WhatsAppInbox.tsx` (~`9706-9874`): usa `<DialogContent>` cru (anti-padrão §7.11, scroll travado), lista curta de negócios (sem busca no servidor), sem campo de anexos, e trata erro com `err?.message` cru. **Proposta:** tratá-lo num item à parte (trocar pelo `TarefaFormDialog`, com `extraFields` de conversa/cliente) — é maior e mexe num arquivo de 7.800 linhas. Decidir na revisão do spec se entra agora ou vira follow-up.

---

## Banco

Só o item 1: **1 coluna** (`tarefas.obra_id`), anulável, FK para `obras`, herda RLS. Rito: medir → ensaiar (transação que desfaz) → apresentar → "pode" → aplicar → conferir → renomear o arquivo da migration para a versão que o banco registrar. Nada mais toca o banco.

## Superfícies (AGENTS §3)

- **Item 1:** detalhe da tarefa (rótulo/valor), `TarefaFormDialog` (campo novo, no fluxo normal E no aberto do negócio/cliente/contato), tipos, hook. (Criação automática de tarefa por visita/evento — `use-obra-visitas.ts`, `use-eventos.ts` — não define obra; segue sem `obra_id`, sem regressão.)
- **Item 2:** detalhe da tarefa (Sheet → moldura compartilhada).
- **Item 3:** detalhe da tarefa (empresa e negócio) + montar `PainelDoNegocio` em `Tarefas.tsx`.
- **Item 4:** cards e listas de Tarefa (kanban, lista desktop, card mobile) e de Negócio (kanban, lista da página, lista reutilizável).
- **Item 5:** `TarefaFormDialog` (mostrar travados + scroll), afetando todos os pontos que o abrem com `extraFields`.

## Perspectivas

- **Multi-empresa:** obras são por empresa (RLS de `obras`); o seletor só mostra as da empresa de quem edita. Empresa sem obras → seletor vazio, campo opcional, sem erro.
- **Quem não é gestor / vendedor no celular:** o card com foto é só exibição; nada de permissão. O detalhe da tarefa e os links respeitam as rotas já existentes (cliente, negócio). Testar no celular (card e detalhe).
- **Estado:** tarefa antiga com `projeto` texto e sem `obra_id` → mostra o texto legado; tarefa sem responsável → sem foto; foto que falha ao carregar → cai nas iniciais.
- **O avesso:** quem usa o formulário do WhatsApp continua com o form cru até o follow-up (se não entrar agora) — não piora, mas não melhora; registrar.

## Verificação (os três "não")

- `npm run test` — suíte inteira; nº não cai. Testes novos: `ResponsavelComFoto` (acha por nome, cai nas iniciais, some sem nome); `TarefaFormDialog` (campo Obra grava `obra_id`; travados aparecem desabilitados e preenchidos); detalhe da tarefa (obra por `obra_id`, fallback pro texto legado; empresa/negócio viram link com o destino certo).
- `npx tsc --noEmit -p tsconfig.app.json` — não sobe da base. `npm run build` compila. `npm run lint` não sobe.
- **Item 5 (scroll):** provar o conserto — de preferência na pré-visualização; se o login barrar, descrever o teste manual exato para o dono validar no ar, e cobrir por teste o que der (a lógica dos campos travados dá; o gesto de rolagem, não).
- Banco: confirmar a coluna aplicada antes de publicar; publicar só com o "pode".

## Fora de escopo

- Abrir a **obra** a partir do detalhe da tarefa (obras não têm rota própria; só mostramos o nome).
- Mudar a tela "Hoje" (a tabela já tem foto; o topo `ItemPauta` não foi pedido).
- Migrar os valores antigos de `projeto` (texto) para `obra_id` (ficam como legado exibível).
- O formulário de nova tarefa do **WhatsApp** — decisão na revisão do spec (agora ou follow-up).

## Ordem sugerida

Item 1 banco (migration gated) + tipos/hook → campo Obra no form + detalhe → item 2 (moldura) → item 3 (links + PainelDoNegocio na tela) → item 4 (ResponsavelComFoto + aplicar) → item 5 (mostrar travados + scroll).
