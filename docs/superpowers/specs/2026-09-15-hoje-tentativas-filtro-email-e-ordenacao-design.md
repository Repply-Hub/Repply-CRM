# Hoje: tentativas, filtro de data, e-mail por pessoa e ordenação — Desenho

**Data:** 15/09/2026 · **Autor do pedido:** dono do produto (Lucas)

**Objetivo:** quatro melhorias na tela "Hoje", pedidas em 15/09/2026, que deixam a pauta
priorizar e destacar os negócios já perseguidos, deixam o bloco "No geral" recortar por
período quando se quiser, deixam a tabela de negócios em risco ordenar por qualquer coluna,
e deixam o gestor escolher, pessoa a pessoa, quem recebe o e-mail da pauta.

**Arquitetura (visão geral):** as regras de "quem vê o quê" e "o que está em risco" moram em
funções de banco (`pauta_do_dia_de`, `negocios_em_risco`/`_de`, `dashboard_negocios_risco`,
`pauta_resumo_destinatarios`). As quatro partes são, na maioria, mudanças nessas funções, com o
front lendo os campos novos e desenhando os controles. Nada de nova tabela: a preferência de
e-mail por pessoa entra na tabela chave/valor `configuracoes_automacao` que já existe.

**Stack:** React 18 + TS + Vite; TanStack Query; shadcn/Radix; Supabase (Postgres + Edge
Functions). Sem banco local — os tipos em `src/integrations/supabase/types.ts` são atualizados à
mão (CLAUDE.md §6.8).

## Restrições globais (valem para todas as tarefas)

- **PT-BR** em tela, comentário, commit e mensagem de erro.
- **Nada de dado real** de cliente/equipe em teste, comentário, migration ou neste desenho
  (repositório público — CLAUDE.md §6.9). Exemplos são inventados ("Ana Souza", "Obra Exemplo").
- **Migration nova para cada mudança de banco** — nunca editar migration existente (§6.3). Toda
  função nova/recriada mantém a permissão exata de antes (o `DROP` apaga o `GRANT` em silêncio) e
  termina com `NOTIFY pgrst, 'reload schema'`, dentro de `BEGIN/COMMIT`.
- **`negocios_em_risco_de` continua fechada ao navegador** (`authenticated`): só `service_role`.
  É ela que aceita o identificador de qualquer pessoa e roda com privilégio.
- **`.update()`/`.delete()` conferem contagem** (§4.6) — não se aplica aqui (só leitura e upsert
  de config), mas o upsert de config segue o padrão de `useSalvarConfiguracaoAutomacao`.
- **Mudança de banco em produção** passa por ensaio + rota de volta + "pode" do Lucas; mudança
  visual passa por foto mostrada ao Lucas antes de publicar; publica-se só os commits próprios,
  por cópia isolada (memórias `ensaio-de-migration-em-producao`, `dois-chats-mesma-pasta-git`).
- **Versão de migration pode colidir** com outra sessão — conferir o prefixo no local e no
  `origin` antes de publicar, e usar minuto não-redondo.

## Decisões tomadas (15/09/2026)

1. **O sinal de "tentativa" é o "Retomar depois".** Não existe registro manual de "liguei/mandei
   mensagem"; o mais próximo é cada retomada gravada em `historico_contatos` (`tipo='retorno'`).
   É essa contagem que vira "tentativa". (Alternativa recusada: criar um botão novo de registrar
   contato.)
2. **Prioridade: tentativa na frente, DENTRO do teto.** Os perseguidos sobem para o topo da pauta
   e ocupam as vagas do dia primeiro; se houver muitos, um negócio grande "fresco" fica para o dia
   seguinte. Não é "além do teto" — é dentro dele. (Ajuste do Lucas sobre a proposta inicial.)
3. **Filtro de data: opcional, desligado por padrão, para todos** (com e sem `pauta_de_todos`).
   Conta por **data de criação** (`data_pedido`). (Alternativa recusada: sempre com período.)
4. **Etiqueta de tentativa aparece na pauta E na tabela do time.**
5. **E-mail por pessoa: lista de EXCLUÍDOS** — todos recebem por padrão (inclusive quem entrar
   depois), o gestor desmarca as exceções.
6. **Ordenação por coluna na tabela do time**, no servidor, como nas telas de Negócios/Clientes.

---

## Parte 1 — Negócios perseguidos: prioridade e etiqueta

### O que é uma tentativa

Para cada negócio (pedido), o número de linhas em `historico_contatos` com `tipo='retorno'`
(cada "Retomar depois" já registrado). **Não** conta `tipo='automatico'` (o contato agendado na
criação) — o "+1" da numeração abaixo já representa o primeiro envio.

### A numeração e a etiqueta

- **0 retomadas** → o negócio parado continua com a etiqueta **"Orçamento parado"** (vermelha),
  como hoje.
- **1 retomada** → **"2ª tentativa"**; 2 → **"3ª tentativa"**; e assim por diante. Ou seja, o texto
  é `(nº de retomadas) + 1`, e a etiqueta só aparece a partir da 2ª (≥ 1 retomada), casando com os
  exemplos do pedido.
- **Aparência:** etiqueta de **destaque forte** — fundo laranja da marca (`--primary`), texto
  claro, com um ícone de "insistir/repetir" (ex.: `RefreshCw`/`RotateCcw`). Mais chamativa que a de
  parado, porque a mensagem é "já correram atrás várias vezes e ainda não fechou". Substitui a
  etiqueta de "Orçamento parado" no mesmo lugar.
- Um componente compartilhado desenha a etiqueta em um lugar só (ex.:
  `src/components/pauta/EtiquetaDeTentativa.tsx`, recebendo o número de tentativas), usado pela
  pauta e pela tabela do time — para não haver duas verdades sobre a mesma etiqueta.

### A prioridade (só na pauta — a fila de cima)

Hoje a pauta escolhe até `pauta_max_itens` negócios ordenando por
`e_meu desc, valor desc, dias_parado desc, id`. Passa a ordenar **primeiro pelo número de
tentativas (desc)**, e depois pelas mesmas chaves. Como a escolha do que entra na pauta usa essa
mesma ordem, os perseguidos ocupam as vagas primeiro — dentro do teto (decisão 2). O teto e a
regra de "só entra o que está parado" não mudam. Compromissos seguem à parte, como hoje.

> Consequência aceita: numa empresa com muitos perseguidos, um negócio grande sem tentativa pode
> ficar de fora da pauta do dia. O teto é ajustável na aba Automação (`pauta_max_itens`).

### Onde aparece a etiqueta

- **Pauta (fila):** no lugar da etiqueta "Orçamento parado" do item (`ItemPauta`, em `Hoje.tsx`).
- **Tabela do time:** ao lado do nome do negócio (`TabelaDoTime.tsx`), sem mudar a ordem-padrão da
  tabela (a ordenação da tabela é a Parte 4).

### Mudanças de banco (Parte 1)

- `pauta_do_dia_de(uuid)` (migration `20260912100000`): calcular o nº de tentativas por negócio,
  **devolvê-lo numa coluna nova** (`tentativas int`), usá-lo como primeira chave do `ORDER BY`, e
  manter o `selo` como está (o front decide "Nª tentativa" vs "Orçamento parado" a partir do
  número). Como muda o `RETURNS TABLE`, é `DROP`+`CREATE`; e o invólucro `pauta_do_dia()`
  (`20260824290000`), que faz `select * from pauta_do_dia_de(...)`, também muda de forma → recriar
  os dois na mesma transação e restaurar as permissões exatas.
- `negocios_em_risco`/`negocios_em_risco_de` (migration `20260914153000`): acrescentar a coluna
  `tentativas int` (mesma contagem), para a etiqueta na tabela do time. `DROP`+`CREATE` (muda o
  `RETURNS TABLE`), permissão exata restaurada, `negocios_em_risco_de` segue fechada.
- A contagem é uma subconsulta correlacionada em `historico_contatos` por `pedido_id` com
  `tipo='retorno'`. As funções são `SECURITY DEFINER` (sem custo de RLS por linha), e o conjunto é
  pequeno (pauta cortada por `max_itens`; risco com teto de 100). Confirmar índice em
  `historico_contatos(pedido_id)` no ensaio; medir antes/depois.

### Mudanças de front (Parte 1)

- `ItemDaPauta` (`use-pauta.ts`): campo `tentativas: number` (opcional, cai em 0 quando o banco
  anterior à migration não devolve).
- `NegocioEmRisco` (`use-dashboard.ts`): campo `tentativas?: number`.
- `EtiquetaDeTentativa` (novo), `ItemPauta` (em `Hoje.tsx`) e `TabelaDoTime.tsx` usando-a.

---

## Parte 2 — Filtro de data opcional (bloco "No geral")

### Comportamento

Um seletor de **período opcional** na barra de filtros do "No geral" (`BarraDeFiltros`),
disponível para **todos** (diferente do filtro de Responsável, que só aparece com a chave). Com o
período **vazio (padrão)**, nada muda — o bloco mostra tudo, inclusive os parados antigos. Ao
escolher um período, os cartões, a tabela do time e os resumos (por vendedor e por fabricante)
passam a contar só os negócios **criados** (`data_pedido`) dentro dele. A pauta (fila de cima)
**não** muda — ela é sempre "hoje".

Os filtros do "No geral" moram no ENDEREÇO da página (`?...`), para sobreviverem ao recarregar e
poderem ir por link (`filtros-do-painel.ts`). O período entra lá também
(`?data_de=AAAA-MM-DD&data_ate=AAAA-MM-DD`).

### Por que só a data de criação, e não a de fechamento

Para negócio ainda aberto, `prazo_resposta` ("fechamento") é uma previsão herdada da planilha que
ninguém atualiza (CLAUDE.md §4.4). Recortar por ela não quer dizer nada. O filtro conta por
`data_pedido`. Não há parâmetro que escolha entre duas colunas de data (evita §7.9): é uma coluna
só, com faixa opcional.

### Mudanças de banco (Parte 2)

- `dashboard_negocios_risco(...)` (migration `20260824220000` / recriações posteriores) e
  `negocios_em_risco`/`negocios_em_risco_de` ganham `p_data_de date DEFAULT NULL` e
  `p_data_ate date DEFAULT NULL`, aplicados como `(p_data_de IS NULL OR p.data_pedido >= p_data_de)`
  e o simétrico para `p_data_ate`, no `WHERE` dos abertos. `NULL` = sem recorte (comportamento de
  hoje preservado). Muda a assinatura → `DROP`+`CREATE`, permissões exatas restauradas.
- Filtra `pedidos.data_pedido` direto (sem junção) — não recai no custo do §7.16.

### Mudanças de front (Parte 2)

- `FiltrosDoPainel` (`filtros-do-painel.ts`): campos `dataDe?: string`, `dataAte?: string`; leitura
  e escrita no endereço; `recorteParaOServidor` repassa (para TODOS, sem depender da chave).
- `BarraDeFiltros`: um controle de intervalo de datas (reaproveitar o padrão de calendário do
  projeto — `<Calendar>` com `defaultMonth`, `captionLayout`, `fromYear`/`toYear`, §7.13; e âncora
  de meio-dia ao ler datas, §7.12). Um botão "Limpar" já existente zera também o período.
- `useNegociosEmRisco` e `useDashboardNegociosRisco` (`use-dashboard.ts`): passar
  `p_data_de`/`p_data_ate` e incluí-los na `queryKey`.
- `RadarDeRisco.tsx`: repassar o período; o texto "É a foto de agora — não depende de período"
  passa a valer só quando não há período escolhido (com período, dizer o período).

---

## Parte 3 — E-mail da pauta, pessoa a pessoa (aba Automação)

### Comportamento

Na aba Automação (só do gestor), embaixo do card "Resumo diário por e-mail", uma **lista da equipe
com uma marca em cada pessoa**. **Todos marcados por padrão** — inclusive quem entrar depois. O
gestor **desmarca** quem não deve receber. A lista fica desabilitada/esmaecida quando o resumo por
e-mail está desligado (como já acontece com os dias da semana).

### Modelo: lista de EXCLUÍDOS (opt-out), não de incluídos

Guardar "quem foi tirado" (e não "quem recebe") é o que faz "todos por padrão" valer inclusive
para quem entra na equipe depois: ausência da pessoa na lista = ela recebe. Uma nova chave por
empresa em `configuracoes_automacao`:

- `pauta_resumo_excluidos` — um array de `usuarios.id` (texto). Ausência da linha ou array vazio =
  ninguém excluído = todos recebem.

### Mudanças de banco (Parte 3)

- `pauta_resumo_destinatarios()` (migration `20260825120000`) ganha uma cláusula
  `AND u.id <> ALL( COALESCE(<array de excluídos da empresa>, '{}'::uuid[]) )`. Mesma assinatura e
  mesmo retorno → `CREATE OR REPLACE` (não precisa `DROP`). A função de borda
  `pauta-resumo-diario` **não muda** (ela só percorre o que a RPC devolve). Lembrar: publicar a
  função de borda é gesto separado do `git push` — aqui ela não muda, então não há o que publicar
  no Supabase, só a migration da RPC.

### Mudanças de front (Parte 3)

- `use-configuracoes-automacao.ts`: acrescentar a chave `pauta_resumo_excluidos` a
  `PADROES_DA_PAUTA` (padrão `[]`) e ensinar a validação a aceitar **array de texto** (hoje ela só
  valida número/booleano/array-de-número). O `useSalvarConfiguracaoAutomacao` já grava qualquer
  `valor` via upsert com `updated_by: profile.user_id` (§4.5) — passa a aceitar `string[]`.
- `AutomacaoTab.tsx`: listar a equipe com `useVendedores()` (a mesma consulta que a aba de Usuários
  usa), uma caixa por pessoa marcada quando NÃO está na lista de excluídos; alternar grava a lista
  nova. Só gestor (a aba já é gated por `isGestor && temHoje`, e a RLS de `configuracoes_automacao`
  exige gestor).

---

## Parte 4 — Ordenar a tabela do time por qualquer coluna

### Comportamento

Cada coluna da tabela do time (negócios em risco) ganha ordenação clicável, como nas telas de
Negócios e Clientes: Negócio (A–Z/Z–A), Fabricante, Etapa, Responsável (quando visível), Valor
(maior/menor) e "Sem mexer há" (mais/menos dias). A ordenação acontece **no servidor** — a tabela
cresce de 10 em 10 (teto 100), então ordenar só o pedaço carregado enganaria. Ao trocar a
ordenação, a lista volta ao começo (as 10 primeiras da nova ordem). A ordem-padrão continua sendo
**maior valor primeiro**.

### Padrão a seguir

O canônico do projeto para "tabela paginada ordenada no servidor" é o de Negócios: cabeçalho
ordenável (`SortableTh`, com o menuzinho "Ordenar A-Z / Z-A"), estado `{coluna, direção}`, e uma
**lista branca de colunas permitidas** que traduz o clique em ordenação — a validação é por lista
fixa, nunca interpolando texto.

⚠️ A tabela do time tem cabeçalho PRÓPRIO, com alça de redimensionar
(`larguras-de-colunas.ts` + `AlcaDeLargura`), diferente do resize do `SortableTh`
(`use-column-resize`). Para não desfazer o redimensionamento entregue em 14/09/2026, o caminho é
**manter o cabeçalho atual e acrescentar só a parte de ordenação** (o menu "Ordenar A-Z/Z-A") ao
título de cada coluna, convivendo com a alça (o clique da alça não dispara ordenação —
`stopPropagation`). O texto do cabeçalho abre o menu; a borda direita continua redimensionando.

### Mudanças de banco (Parte 4)

- `negocios_em_risco`/`negocios_em_risco_de` ganham `p_ordenar_por text DEFAULT 'valor'` e
  `p_ascendente boolean DEFAULT false`. O `ORDER BY` vira **lista branca por `CASE`** — uma
  cláusula por coluna permitida (`valor`→`valor_total`, `negocio`→`nome`, `fabricante`,
  `etapa`, `responsavel`→nome do dono, `dias`→dias parado), com `m.id` **sempre** como desempate
  (a paginação exige ordem estável). É o primeiro `ORDER BY` por parâmetro em SQL do projeto; é
  seguro aqui porque a função tem teto de 100 linhas (o §7.9 não morde). Coluna fora da lista cai
  no padrão (valor desc). Junto com a Parte 1 (coluna `tentativas`) e a Parte 2 (datas), as duas
  funções são recriadas **uma vez** com todos os parâmetros novos.

### Mudanças de front (Parte 4)

- `useNegociosEmRisco` (`use-dashboard.ts`): passar `p_ordenar_por`/`p_ascendente` e incluí-los na
  `queryKey` (senão o cache devolve a ordem antiga).
- `TabelaDoTime.tsx`: estado `{coluna, direção}` (padrão `valor`/desc), um `ordenarPor(coluna,
  dir)` que também zera o "Ver mais" (`setQuantos(PAGINA)`) e entra na lógica de "voltar para 10 ao
  mudar o recorte" que já existe. Menu de ordenação no título de cada coluna ordenável. O subtítulo
  "Do maior valor para o menor." passa a refletir a ordenação atual.
- Guardar a preferência de ordenação no `localStorage` (como Negócios) é opcional; decidir no
  plano. Padrão sem persistir: recarregar volta a valor desc.

---

## Consolidação das mudanças de banco

Uma migration nova (prefixo com minuto não-redondo, conferido nos dois lados) que, numa transação:

1. `pauta_do_dia_de` + invólucro `pauta_do_dia` — recriadas com a coluna `tentativas` e o novo
   `ORDER BY` (tentativa na frente). `DROP`+`CREATE`, permissões restauradas.
2. `negocios_em_risco` + `negocios_em_risco_de` — recriadas com `tentativas`, `p_data_de`,
   `p_data_ate`, `p_ordenar_por`, `p_ascendente`. `DROP`+`CREATE`, permissões restauradas
   (`_de` fechada a `authenticated`).
3. `dashboard_negocios_risco` — recriada com `p_data_de`/`p_data_ate`. `DROP`+`CREATE`, permissões
   restauradas.
4. `pauta_resumo_destinatarios` — `CREATE OR REPLACE` com a cláusula de exclusão (mesma assinatura).
5. `NOTIFY pgrst, 'reload schema'`.

Pode ser mais de uma migration se ficar grande demais para revisar de uma vez; decidir no plano.
Cada `RETURNS TABLE`/assinatura que muda restaura o `GRANT`/`REVOKE` exato de antes (o `DROP` apaga
a permissão em silêncio). Rota de volta: recriar cada função na definição anterior, com a mesma
permissão (geradas com `pg_get_functiondef` antes de aplicar).

`src/integrations/supabase/types.ts` é atualizado à mão para as novas assinaturas e colunas.

## Segurança e desempenho

- Nenhuma regra de "quem vê o quê" muda: a chave `pauta_de_todos` continua governando pauta,
  tabela e cartões; `negocios_em_risco_de` continua fechada ao navegador; a aba Automação continua
  gated no servidor (RLS de `configuracoes_automacao` exige gestor).
- A contagem de tentativas e o filtro de data entram em funções `SECURITY DEFINER` (sem custo de
  RLS por linha) e sobre conjuntos pequenos (pauta cortada por `max_itens`, risco com teto 100).
  Ainda assim, **medir no ensaio** (como usuário `authenticated` de verdade, §7.15) antes/depois, e
  conferir índice em `historico_contatos(pedido_id)`.
- O filtro de data é sobre `pedidos.data_pedido` (coluna própria, sem junção): não recai no §7.16.

## Testes (Vitest + Testing Library)

Um por comportamento, com dados inventados:

- **Parte 1:** `EtiquetaDeTentativa` — "2ª tentativa" para 1 retomada, "Orçamento parado" para 0;
  a pauta desenha a etiqueta de tentativa no lugar da de parado quando `tentativas > 0`; a tabela
  do time mostra a etiqueta ao lado do nome. (A prioridade da ORDEM vive na função de banco; provar
  no ensaio de SQL, não em teste de front.)
- **Parte 2:** `filtros-do-painel` lê/escreve `data_de`/`data_ate` no endereço e os repassa em
  `recorteParaOServidor` para todos; a barra oferece o período para quem tem e para quem não tem a
  chave; com período vazio, os hooks mandam `null` (nada muda).
- **Parte 3:** `use-configuracoes-automacao` aceita e valida `pauta_resumo_excluidos` (array de
  texto); `AutomacaoTab` marca todos por padrão, desmarcar grava a lista de excluídos; a lista some
  quando o resumo está desligado.
- **Parte 4:** `TabelaDoTime` manda `p_ordenar_por`/`p_ascendente` ao trocar a ordenação e volta o
  "Ver mais" para 10; a `queryKey` inclui a ordenação; coluna de ação não é ordenável.
- Testes de banco (ordem por tentativa, filtro de data, ordenação por coluna, exclusão de e-mail)
  são provados no **ensaio** de migration, não em Vitest (não há banco local).

## Publicação (as travas)

1. Rodar a verificação do §9 (test, build, tsc `-p`, lint sem subir o número).
2. **Ensaiar** as mudanças de banco num `execute_sql` só, terminando em `RAISE` que desfaz tudo:
   sonda antes, papel `authenticated` de verdade, conferir depois (memória
   `ensaio-de-migration-em-producao`). Mostrar o resultado ao Lucas e pedir o **"pode"** antes de
   aplicar.
3. **Fotos** das telas novas (pauta com etiqueta de tentativa, filtro de data, aba Automação com a
   lista, tabela ordenando) mostradas ao Lucas antes de publicar.
4. Aplicar a migration; conferir por md5 e permissões; renomear o arquivo para a versão registrada
   se `apply_migration` gravar outra.
5. Publicar **só os commits próprios**, por cópia isolada (worktree + cherry-pick), com `git fetch`
   antes e conferência de que o `origin` não andou.

## Fora de escopo (por ora)

- Registrar tentativa de contato à mão (ligação/WhatsApp/visita) — recusado na decisão 1.
- Ordenar a tabela do time por "tentativas" como coluna própria — a etiqueta fica no nome; se o
  Lucas quiser depois, vira uma opção de ordenação a mais.
- Mudar a ordem-padrão da tabela do time (fica valor desc; a Parte 1 só reordena a PAUTA).
- Filtro de data na pauta (fila) — ela é sempre "hoje".
