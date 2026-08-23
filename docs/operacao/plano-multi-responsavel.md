# Multi-responsável em negócio

**Situação:** hoje um negócio tem **um** responsável — `pedidos.usuario_id`, uma coluna só.
A MD precisa registrar que mais de uma pessoa trabalhou o mesmo negócio, sem que isso
mexa no dinheiro de ninguém.

**Estado:** desenho decidido pelo dono do produto em 23/08/2026. **Nada implementado.**

**Este documento é o *o quê* e o *porquê*.** Ele é para o Lucas aprovar e para outro dev
executar. Números de banco medidos em 23/08/2026 na produção; números de linha são do
código do mesmo dia e podem sair do lugar.

> 🔴 **A medição achou uma coisa que não estava no pedido e muda a ordem do plano.**
> Existe uma política de segurança de 2026-05-04 em `pedidos` que dá a **qualquer** usuário
> logado da empresa o direito de **alterar e apagar qualquer negócio** da empresa. As
> políticas granulares que todo mundo cita — e que estão citadas no próprio pedido deste
> plano — **não valem hoje**. Ver §1.1. Isso vira a Fase 0.

---

## 1. O que está provado

Medido no banco de produção em 23/08/2026.

| Fato | Medida |
|---|---|
| Negócios | **11.911**, 22 MB, todos de **MD Representações** |
| Donos distintos entre eles | **7** |
| `pedidos.usuario_id` | `uuid`, **NOT NULL**, com FK `pedidos_vendedor_id_fkey` → `usuarios(id)` e índice `idx_pedidos_usuario_id` |
| `pedidos` tem coluna de empresa? | **Não.** A empresa é derivada por `usuario_id → usuarios.empresa_id` (§3.1) |
| Políticas em `pedidos` | **7** — e uma delas é `FOR ALL` para PUBLIC (§1.1) |
| Usuários ativos | 26, sendo **13 na MD Representações** |
| Papéis existentes | `vendedor` 10 · `gestor` 7 · `empresa` 7 · **`líder_comercial` 1** · `admin` 1 |
| Linhas em `permissoes_usuario` | 128, sendo **10 do módulo `pedidos`** — todas as 10 com `pode_editar = true` |
| Não-gestores **sem** `has_permission(…,'pedidos','editar')` | **5** — e os 5 têm **0 negócios** (§4.2) |
| Trocas de responsável já registradas no histórico | **0**, em 22.536 edições de negócio (§1.2) |
| Visões que dependem de `pedidos.usuario_id` | **5** |
| Funções de banco (RPC) que dependem de `pedidos.usuario_id` | **5** |

### 1.1 Hoje, qualquer pessoa da empresa já altera e apaga qualquer negócio

As políticas reais de `pedidos`, lidas em `pg_policies`:

| Política | Comando | Papéis | Condição |
|---|---|---|---|
| `pedidos_select` | SELECT | `authenticated` | `usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id)` |
| `pedidos_insert` | INSERT | `authenticated` | `usuario_id = get_my_usuario_id() OR (is_gestor() AND usuario_in_my_empresa(usuario_id))` |
| `pedidos_update` | UPDATE | `authenticated` | `usuario_id = get_my_usuario_id() OR (is_gestor() AND usuario_in_my_empresa(usuario_id))` |
| `pedidos_delete` | DELETE | `authenticated` | `is_gestor() AND usuario_in_my_empresa(usuario_id)` |
| **`Acesso pedidos empresa`** | **ALL** (`polcmd = '*'`) | **PUBLIC** (`polroles = {}`) | **`usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = <a minha>)`** |
| `pedidos_exige_plano_insert` | INSERT | RESTRICTIVE | `empresa_plano_ativo()` |
| `pedidos_exige_plano_update` | UPDATE | RESTRICTIVE | `empresa_plano_ativo()` |

**No Postgres, política `PERMISSIVE` se soma — o efeito é a união, não a interseção.**
Como `Acesso pedidos empresa` é `FOR ALL`, ela cobre SELECT, INSERT, UPDATE e DELETE ao
mesmo tempo. E como ela foi criada **sem** `WITH CHECK`, o Postgres usa a mesma expressão
do `USING` também na checagem de escrita.

Resultado efetivo hoje:

| Ação | O que as políticas granulares dizem | O que de fato acontece |
|---|---|---|
| Ver negócio da empresa | qualquer um da empresa | igual |
| **Alterar qualquer negócio da empresa** | só o dono e o gestor | **qualquer um da empresa** |
| **Reatribuir para qualquer colega** | só o gestor | **qualquer um da empresa** |
| **Apagar qualquer negócio da empresa** | só o gestor | **qualquer um da empresa** |

Origem: `supabase/migrations/20260504172116_d58aba56-3ac8-4d4c-8aeb-e14b7af32eb9.sql:93`.
As granulares vieram antes, das migrations de abril
(`20260413223933`, `20260416174744`, `20260424024022`). A de maio recriou a política larga
e apagou o efeito das outras **sem apagar as outras** — ninguém percebeu porque as duas
gerações continuam listadas lado a lado.

Isto é o gêmeo exato do [item 13 da dívida técnica](../divida-tecnica.md#13-duas-gerações-de-política-em-clientes),
que descreve o mesmo padrão em `clientes` e termina dizendo *"vale repetir a conferência
nas outras tabelas"*. **Esta é a conferência, e `pedidos` está no mesmo estado — pior, porque
lá a política larga é `FOR ALL`.**

**Consequência para este plano:** a decisão 3 do dono (quem tem a permissão edita qualquer
negócio) **não afrouxa nada. Ela aperta.** Hoje já é todo mundo, sem permissão nenhuma. O
trabalho de segurança aqui é trocar um acesso acidental por um acesso decidido.

> Nenhum botão da tela protege isso. Em `src/pages/Negocios.tsx` o botão "Excluir
> Selecionados" (linha 1747) e a ação em massa "Novo responsável" (linha 3183) aparecem
> para todo mundo, sem checagem de permissão. E, como diz o `CLAUDE.md` §6.1, esconder
> botão nunca protegeu nada de qualquer forma.

### 1.2 O histórico registra a troca de responsável — mas mostra `usuario_id` e um UUID

A decisão 4 do dono se apoia no histórico de alterações. **Ele registra, sim** — com uma
ressalva que precisa virar tarefa.

O gatilho `trg_historico_pedidos` chama `fn_log_historico_alteracao`, que grava
`to_jsonb(OLD)` e `to_jsonb(NEW)` — **a linha inteira**, não uma lista de campos escolhidos.
Então `usuario_id` está lá nos dois lados, sempre.

Na tela (`src/pages/HistoricoAlteracoes.tsx:40-48`), o resumo compara todas as chaves e
ignora só `updated_at` e `created_at`. Uma reatribuição aparece assim:

```
Campos alterados: usuario_id
```

e, ao abrir, dois blocos de JSON cru com dois UUIDs. Ou seja: **está registrado, mas não
está legível.** Quem for conferir "alguém puxou um negócio para si?" precisa traduzir UUID
para nome de pessoa na mão.

| Medida | Valor |
|---|---|
| Linhas em `historico_alteracoes` | 183.901 |
| Delas, de `pedidos` | 169.302 |
| Edições (UPDATE) de negócio | 22.536 |
| Edições em que o responsável mudou | **0** |
| Janela coberta | 28/07/2026 a 21/08/2026 |

Zero trocas em 22.536 edições diz duas coisas: o registro nunca foi exercitado de verdade,
e reatribuir negócio **não é** hábito da casa hoje. A garantia do dono é sobre um mecanismo
que existe mas nunca rodou.

**Isto vira pré-requisito** (Fase 1, §8): traduzir `usuario_id` para "Responsável" e o UUID
para o nome da pessoa no histórico, **antes** de a reatribuição virar coisa comum. Um
registro que ninguém consegue ler não é auditoria; é arquivo morto.

**Segundo pré-requisito, do mesmo tamanho:** a tabela de ligação nova **não nasce com
histórico**. O gatilho existe em exatamente 10 tabelas (`clientes`, `contatos`,
`fabricantes`, `funis`, `kanban_colunas`, `obras`, `pedidos`, `permissoes_usuario`,
`tarefas`, `usuarios`) e o mapa `TABELA_LABELS` da tela
(`src/pages/HistoricoAlteracoes.tsx:19-30`) tem exatamente essas 10 entradas. Sem gatilho e
sem entrada no mapa, **entrar e sair de participante de um negócio não deixa rastro nenhum**
— e aí a garantia da decisão 4 vale só para o principal.

---

## 2. As decisões tomadas

Todas do dono do produto, em 23/08/2026. **Não reabrir.**

| # | Decisão | Escolha |
|---|---|---|
| 1 | Quantos responsáveis | **Vários.** Continua obrigatório ter **pelo menos um**; ao criar já vem preenchido com quem cadastra |
| 2 | Dinheiro | **Vai para UM principal.** Os demais são participantes: contam na participação, **não no valor** |
| 3 | Quem edita | Quem tem a permissão de **editar negócios** nas Configurações, **mais** os gestores |
| 4 | Reatribuir | Quem pode editar pode, **inclusive para si**. O histórico de alterações cobre o risco |

A decisão 2 é a que segura tudo o mais de pé: com o dinheiro num principal só,
"Rendimento por Responsável" e o Plano de Vendas continuam fechando com o Faturamento
Total, e a meta individual continua significando a mesma coisa. **Qualquer desenho que
divida valor entre responsáveis quebra as três coisas de uma vez.**

---

## 3. Estrutura

### 3.1 `pedidos.usuario_id` não é só "o responsável". É a chave de empresa

Este é o fato que decide o resto do capítulo.

**`pedidos` não tem coluna `empresa_id`.** O inquilino é descoberto sempre pelo mesmo
caminho: `pedidos.usuario_id → usuarios.empresa_id`. Está assim em toda parte:

| Onde | Como usa |
|---|---|
| Política `pedidos_select` | `usuario_in_my_empresa(usuario_id)` |
| Visão `vw_faturamento_mensal` | `JOIN usuarios u ON p.usuario_id = u.id`, e agrupa por `u.empresa_id` |
| Visão `vw_indicadores_usuario` | `LEFT JOIN pedidos p ON p.usuario_id = u.id` |
| Visões `vw_indicadores_vendedor`, `vw_pedidos_inativos`, `vw_velocidade_por_fabricante` | mesma junção |
| RPC `dashboard_stats` | `p.usuario_id = ANY(p_usuario_ids)` em duas CTEs |
| RPC `pedidos_stats` | `p.usuario_id = ANY(p_usuario_ids)` |
| RPC `dashboard_indicadores_vendedor` | `ON p.usuario_id = u.id` |
| RPC `plano_vendas_progresso_por_vendedor` | `GROUP BY p.usuario_id, p.fabricante_id` |
| Frontend | `resolveUsuarioIds()` resolve os usuários da empresa e todo consulta faz `.in('usuario_id', usuarioIds)` — `src/hooks/use-pedidos.ts:120-133, 143, 300-301, 559, 606, 827` |
| Embed do PostgREST | `vendedor:usuarios(id, nome, empresa_id)` (`use-pedidos.ts:259, 505`) só funciona por causa da FK `pedidos_vendedor_id_fkey` |

### 3.2 As três opções para a coluna, com custo

| Opção | O que quebra | Custo medido |
|---|---|---|
| **A — a coluna sai** | As 5 visões, as 5 RPCs, as 2 políticas, a FK que sustenta o embed do PostgREST, o índice, e ~14 pontos só em `use-pedidos.ts`. Some a chave de empresa de 11.911 linhas | **Inviável nesta rodada.** É reescrever a segurança, o Dashboard, o Plano de Vendas e a listagem de negócios ao mesmo tempo, em produção, para um cliente pagante |
| **B — a coluna fica como está, e a ligação é só dos "extras"** | Nada quebra. Mas passam a existir **duas verdades** sobre quem é responsável, e "listar os responsáveis" vira `UNION` em todo lugar | Barato de subir, caro de conviver. A primeira consulta que esquecer o `UNION` mostra o principal sem os participantes, ou o contrário |
| **C — a coluna fica como espelho do principal** ✅ | Nada quebra. A ligação guarda **todos** os responsáveis, com marca de principal; a coluna passa a ser cópia mantida pelo banco | **É a escolha.** Uma verdade só (a tabela de ligação), zero mudança nas 5 visões, nas 5 RPCs, nas políticas, na FK, no índice e no frontend existente |

**A escolha é a C.** A coluna vira o que o `SPEC.md` chamaria de atalho de leitura: continua
valendo exatamente o que vale hoje — *quem é o principal* —, só que quem a escreve passa a
ser o banco.

> **Por que espelho e não "a ligação consulta a coluna":** porque a marca de principal
> precisa poder mudar sem tocar em nada mais, e porque a regra "exatamente um principal por
> negócio" só é exprimível como índice único **dentro** da tabela de ligação.

### 3.3 A forma da tabela

**`pedido_responsaveis`** — nome no padrão da casa (português, plural, prefixo da entidade
dona), sem colidir com nada existente.

| Coluna | Papel |
|---|---|
| `pedido_id` | FK para `pedidos`, `ON DELETE CASCADE` |
| `usuario_id` | FK para `usuarios` |
| `principal` | `boolean NOT NULL DEFAULT false` — a marca de quem leva o dinheiro |
| `created_at` / `created_by` | quando entrou e quem colocou |

Três garantias no próprio banco, não no código:

1. **Ninguém aparece duas vezes no mesmo negócio** — único em `(pedido_id, usuario_id)`.
2. **No máximo um principal por negócio** — único parcial em `(pedido_id) WHERE principal`.
   > O índice parcial é o mesmo idioma que `metas_vendas_equipe_uniq` já usa neste banco
   > (ver [`docs/modulos/dashboard.md`](../modulos/dashboard.md) §7). Quem for escrever
   > `ON CONFLICT` contra ele **precisa repetir o `WHERE principal`**, senão o conflito não
   > casa.
3. **Pelo menos um principal** — garantida pelo espelho: `pedidos.usuario_id` é `NOT NULL`,
   e o negócio não existe sem ele.

**Os dois gatilhos do espelho, e o cuidado com o laço.** Um gatilho na ligação escreve
`pedidos.usuario_id` a partir da linha marcada como principal; outro em `pedidos` semeia ou
corrige a linha principal quando alguém escreve `usuario_id` direto — que é o que a
importação, a ação em massa e todos os formulários fazem hoje.

Dois gatilhos que escrevem um no outro entram em laço infinito, a não ser que cada um
**desista quando o valor já é o certo**. A forma é escrever sempre com o valor no `WHERE`:

```sql
UPDATE public.pedidos
   SET usuario_id = v_principal
 WHERE id = v_pedido_id
   AND usuario_id IS DISTINCT FROM v_principal;   -- 0 linhas = não dispara de volta
```

**Isso é o que faz a Fase 2 ser invisível:** com o espelho de mão dupla, `use-bulk-import.ts`,
`use-novo-pedido.ts`, `use-edit-pedido.ts` e a ação em massa de `Negocios.tsx` continuam
funcionando **sem uma linha de mudança**, e já alimentam a tabela nova.

**A carga inicial** é uma linha por negócio, `principal = true`, copiada de
`pedidos.usuario_id`: **11.911 linhas** para uma tabela nova e vazia. É rápido e não toca em
`pedidos`. Ainda assim, faça em lotes — o sistema está em uso no expediente, e é o mesmo
cuidado que a Fase 2 da [blindagem do WhatsApp](plano-blindagem-whatsapp.md) já tomou.

---

## 4. Segurança

**Esta é a parte mais delicada do plano.** Mexer em política de segurança de 11.911
negócios de um cliente pagante, em produção.

### 4.1 O que já está medido

Ver §1.1 para as políticas reais e §1 para os números. Duas funções de banco existem e
respondem o que é preciso:

```sql
has_permission(_usuario_id uuid, _modulo text, _acao text)  -- STABLE, SECURITY DEFINER
```

Corpo real: devolve `true` direto se o usuário for `role = 'gestor'`; senão lê
`permissoes_usuario.pode_editar` para o módulo, com **`false` quando não há linha**.

```sql
is_gestor()  -- true para role IN ('gestor','admin','empresa')
```

**Os dois não concordam sobre quem é gestor**, e a diferença tem nome e sobrenome:

| Papel | `is_gestor()` | atalho de gestor dentro de `has_permission` |
|---|---|---|
| `gestor` | ✅ | ✅ |
| `admin` | ✅ | ❌ (cai na tabela de permissões) |
| `empresa` | ✅ | ❌ (cai na tabela de permissões) |
| `líder_comercial` | ❌ | ❌ |

O módulo a consultar é **`pedidos`** — é a chave que `src/hooks/use-permissoes.ts` usa na
matriz e a que tem as 10 linhas gravadas. (Existe também `pipeline` na mesma matriz, com as
mesmas 10 linhas; o eixo de *editar negócio* é `pedidos`.)

### 4.2 Fase 0 — remover a política velha, e quem perde o quê

**Nada neste plano funciona enquanto `Acesso pedidos empresa` existir.** Escrever a política
de UPDATE nova sem apagar a velha é escrever um documento: a união continua liberando tudo.

Removê-la é um **aperto**, e aperto em produção precisa de lista de vítimas. Medida, uma a
uma:

| Quem | Papel | Negócios que possui | `has_permission('pedidos','editar')` | O que perde ao remover a política velha |
|---|---|---|---|---|
| Érika Marques | `líder_comercial` | **3.772** | ✅ true | **Perde apagar negócio** — `pedidos_delete` exige `is_gestor()`, e `líder_comercial` não entra |
| Pricila Azevedo | `vendedor` | 3.097 | ✅ | Perde apagar |
| Margley Pontes | `vendedor` | 1.658 | ✅ | Perde apagar |
| Daniel Nóbrega | `vendedor` | 966 | ✅ | Perde apagar |
| José Artur | `vendedor` | 781 | ✅ | Perde apagar |
| Alex | `vendedor` | 0 | ✅ | Perde apagar |
| Vincius (MD Rep.) | `vendedor` | 0 | ❌ **false** | Perde apagar **e** editar |
| Vitor Azevedo (House Design) | `vendedor` | 0 | ❌ | idem |
| Rafael Prima (JHS) | `vendedor` | 0 | ❌ | idem |
| Sororo (MD duplicada) | `vendedor` | 0 | ❌ | idem |
| Vinícius Rodrigues (TESTE) | `vendedor` | 0 | ❌ | idem |

Lendo a tabela:

- **Editar** é o caso fácil: os 5 sem permissão têm **0 negócios cada**. A política nova de
  §4.3 mantém `usuario_id = get_my_usuario_id()`, então cada um continua editando o que for
  seu. Ninguém perde acesso a trabalho existente. **A perda medida é zero.**
- **Apagar** é o caso que precisa de decisão do Lucas. Hoje **7 pessoas da MD** apagam
  qualquer negócio da empresa e nenhuma delas é gestor pelo critério do banco. Depois de
  remover a política velha, **nenhuma das 7 apaga nada — nem o próprio negócio.** Érika, com
  3.772 negócios, é a mais afetada.

**Três saídas para o apagar, e a recomendação:**

| Saída | Efeito |
|---|---|
| Deixar como as políticas granulares mandam | Só gestor apaga. É o mais seguro e é o que o código já dizia querer. **7 pessoas da MD mudam de comportamento no dia** |
| Espelhar a decisão 3 também no apagar | `pedidos_delete` passa a aceitar quem tem `pode_excluir` nas Configurações. **Só 1 das 10 linhas de `permissoes_usuario` do módulo `pedidos` tem `pode_excluir`** — o efeito prático é quase igual ao de cima |
| Manter o apagar largo de propósito | Registra a escolha em vez de deixá-la acontecer por acidente |

**Recomendação: a primeira**, com aviso à MD antes. Mas é mudança no que o cliente vê —
`CLAUDE.md` §11 — e por isso está em §12 como pergunta ao Lucas, não como decisão tomada.

**O botão continua aparecendo.** `Negocios.tsx:1747` e `:2319` mostram "Excluir" para
todo mundo. Depois da Fase 0, quem não é gestor clica e recebe erro. Ou o botão passa a
respeitar a permissão, ou a mensagem de erro precisa dizer o motivo em português. Sumir com
o botão é conveniência de navegação; a recusa de verdade é a do banco.

### 4.3 A política de UPDATE nova

```sql
DROP POLICY "Acesso pedidos empresa" ON public.pedidos;   -- Fase 0

DROP POLICY "pedidos_update" ON public.pedidos;
CREATE POLICY "pedidos_update" ON public.pedidos
FOR UPDATE TO authenticated
USING (
      usuario_id = get_my_usuario_id()
   OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
   OR (has_permission(get_my_usuario_id(), 'pedidos', 'editar')
       AND usuario_in_my_empresa(usuario_id))
)
WITH CHECK (
      usuario_id = get_my_usuario_id()
   OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
   OR (has_permission(get_my_usuario_id(), 'pedidos', 'editar')
       AND usuario_in_my_empresa(usuario_id))
);
```

Os três ramos, em português: **o negócio é meu**, ou **sou gestor e o negócio é da minha
empresa**, ou **tenho a permissão das Configurações e o negócio é da minha empresa**. É
exatamente a decisão 3.

### 4.4 O `WITH CHECK`, que é onde isso quebra em silêncio

`pedidos_update` hoje tem `USING` e **nenhum** `WITH CHECK`. Numa política de UPDATE, quando
o `WITH CHECK` está ausente o Postgres reaproveita o `USING` — só que o `USING` julga a linha
**como ela estava** e o `WITH CHECK` julga a linha **como ela vai ficar**.

É exatamente aí que a decisão 4 mora. Sem um `WITH CHECK` que aceite o terceiro ramo:

- abrir o negócio funciona (o `USING` passa pela permissão),
- salvar a troca de responsável é **recusado** (o `WITH CHECK` só reconheceria "ficou meu"
  ou "sou gestor"),
- e o usuário vê um erro genérico de banco no meio de um formulário preenchido.

O `WITH CHECK` escrito à mão em §4.3, idêntico ao `USING`, é o que faz reatribuir funcionar
tanto **para si** quanto **para um colega**. Escrever os dois é deliberado: deixar o Postgres
deduzir foi o que já mascarou o problema até agora.

### 4.5 A tabela de ligação fica FORA de toda política de `pedidos` — e o número que justifica

A tentação óbvia é somar um ramo na política de SELECT: *"…ou eu sou participante deste
negócio"*. **Não faça.** Medido nesta base, com `EXPLAIN (ANALYZE, BUFFERS)` sobre os
11.911 negócios da MD:

| Forma do predicado | Plano escolhido | Tempo | Buffers |
|---|---|---|---|
| Hoje — `usuario_id ∈ (usuários da empresa)` | **Index Only Scan** (`idx_pedidos_usuario_id`) | **3,7–5,9 ms** | 74 |
| Somando `has_permission(...)` — não cita coluna de `pedidos` | **Index Only Scan** | **4,0 ms** | 56 |
| Somando `EXISTS (… WHERE ligacao.pedido_id = p.id)` | **Seq Scan** | **29,0 ms** | **1.149** |

A terceira linha foi medida com `pedidos_historico_status` no lugar da tabela de ligação —
mesma forma (`pedido_id`, `usuario_id`), 18.319 linhas e índice em `pedido_id`, ou seja um
substituto honesto e até maior do que a ligação vai ser.

**A mecânica é a mesma armadilha do `CLAUDE.md` §7.9, em roupa nova.** Um predicado `OR`
que cita `pedidos.id` faz o Postgres largar o Index Scan e varrer a tabela; a política de
`pedidos` ainda chama `usuario_in_my_empresa` **uma vez por linha varrida**, e é essa
multiplicação que já transformou 4 ms em 31 segundos no Dashboard uma vez. 5× e 15× de
buffers com 11,9 mil linhas é o aviso, não o estrago final.

Já `has_permission(get_my_usuario_id(), 'pedidos', 'editar')` **não menciona nenhuma coluna
de `pedidos`**. Por isso o planejador a resolve **uma vez por consulta**, não uma vez por
linha — e o índice sobrevive, como a segunda linha da tabela mostra.

**E o melhor: o ramo do participante não é necessário.** Participante e principal estão
sempre na **mesma empresa**, e a política de SELECT já libera **todos** os negócios da
empresa (`usuario_in_my_empresa(usuario_id)`). Um participante já enxerga o negócio hoje,
antes de qualquer mudança.

> **Regra deste plano, em uma linha: nenhuma política de `pedidos` menciona
> `pedido_responsaveis`.** SELECT não muda. UPDATE muda só como em §4.3. INSERT e DELETE
> não mencionam a ligação.

### 4.6 A política da própria tabela de ligação

Toda tabela nova nasce por migration, com RLS ligada e política escrita no mesmo arquivo
(`CLAUDE.md` §6.2). E a política dela também **não** consulta `pedidos` — se consultasse,
voltaria o problema de §4.5 pelo outro lado.

Como participante e principal são sempre da mesma empresa, a empresa se resolve pela própria
linha da ligação:

| Comando | Condição |
|---|---|
| SELECT | `usuario_in_my_empresa(usuario_id)` — barato, olha só a linha da ligação |
| INSERT / UPDATE / DELETE | `usuario_in_my_empresa(usuario_id) AND (is_gestor() OR has_permission(get_my_usuario_id(),'pedidos','editar'))` — a mesma régua da decisão 3 |

**A checagem do módulo dupla-se de propósito** com a de `pedidos`: quem pode editar o
negócio pode mexer na lista de responsáveis dele, e quem não pode, não pode pelos dois
caminhos.

---

## 5. Métricas — o que muda e o que não muda

Leitura obrigatória antes de encostar aqui:
[`docs/modulos/dashboard.md`](../modulos/dashboard.md).

**Com o dinheiro indo para o principal (decisão 2) e a coluna sendo o espelho do principal
(§3.2 opção C), a resposta curta é: nenhuma consulta do Dashboard muda.** Todas leem
`pedidos.usuario_id`, e `pedidos.usuario_id` continua significando exatamente o que
significa hoje.

### Não mudam — nada a fazer

| Consulta | Por que não muda |
|---|---|
| `dashboard_stats` — Faturamento Total, Negócios Fechados, Ticket Médio | Somam `valor_total` por período; não olham responsável |
| `dashboard_stats.rendimento_vendedor` — "Rendimento por Responsável" | `LEFT JOIN usuarios u ON u.id = p.usuario_id`. Com o espelho, agrupa pelo principal — que é a decisão 2, escrita em SQL |
| `dashboard_stats.rendimento_fabricante` — "Faturamento por Fábrica" | Agrupa por fabricante |
| `dashboard_stats` — Taxa de Conversão e Segmentação por Ticket | Contas de safra, por `data_pedido` |
| `dashboard_indicadores_vendedor` — "Conversão por Vendedor" | `ON p.usuario_id = u.id` |
| `plano_vendas_progresso` e `..._por_vendedor` | A CTE `vendido` recorta por `prazo_resposta` e agrupa por `p.usuario_id` |
| `vw_faturamento_mensal` — "Faturamento Mensal" e o selo "+X% últ. mês" | `JOIN usuarios ON p.usuario_id = u.id` |
| `pedidos_stats` — total e valor do recorte da tela de Negócios | `p.usuario_id = ANY(p_usuario_ids)` |

**É isso que a decisão 2 comprou.** Se o valor fosse rateado entre responsáveis, as oito
linhas acima mudariam juntas, e "Rendimento por Responsável" deixaria de somar o Faturamento
Total — que é o número que a MD usa para cobrar equipe e conferir comissão.

### Mudam

| Consulta | O que muda |
|---|---|
| `dashboard_indicadores_vendedor` | **Só se** o dono quiser um indicador de participação. Hoje devolve contagem por principal, e continua. Um indicador novo cai na regra do `CLAUDE.md` §5: **pergunte ao Lucas se conta por criação ou por fechamento antes de escrever a primeira linha** |

### A armadilha: nunca some uma coluna de valor pela tabela de ligação

Um negócio de R$ 100 mil com três responsáveis vira **R$ 300 mil** em qualquer consulta que
junte `pedidos` com `pedido_responsaveis` e some `valor_total`. Não é hipótese: é o
resultado natural de um `JOIN` um-para-muitos, e a tela não denuncia — o número fica
plausível e grande.

**Regra:** consulta de dinheiro junta `pedidos` com `usuarios` pela coluna `usuario_id`, e
ponto. `pedido_responsaveis` só entra em consulta que responde **"quem participou"**, nunca
em consulta que responde **"quanto"**.

---

## 6. Importação

`src/hooks/use-bulk-import.ts:279` grava direto:

```ts
usuario_id: (row.usuario_id as string | undefined) ?? vendedorId,
```

O `vendedorId` vem de `get_my_vendedor_id()` (linha 48), que é apelido de
`get_my_usuario_id()`. `ImportPedidosDialog.tsx:440` resolve a coluna "Responsável/Vendedor"
da planilha por nome, **só quando quem importa é gestor**, e guarda o nome não resolvido em
`campos_extras['Vendedor Original']` (linha 445).

**O que muda na Fase 2: nada.** O gatilho do espelho (§3.3) cria a linha principal na
ligação a cada `INSERT` em `pedidos`. A importação continua com um responsável por linha, e
ele nasce principal — que é o comportamento certo.

Dois avisos para quem executar:

1. **A importação insere em lote** (`supabase.from('pedidos').insert(batchPayloads)`, linha
   ~297), com retorno para linha a linha quando o lote falha. O gatilho do espelho roda
   `FOR EACH ROW` e precisa ser barato: uma escrita por linha, sem consulta extra. Um gatilho
   pesado aqui transforma a importação da MD — que já é a prioridade 00 — em algo lento o
   bastante para estourar tempo limite.
2. **Se um dia a planilha ganhar coluna de participantes**, ela entra pela ligação, depois do
   `INSERT` do negócio, nunca dentro do mesmo payload. **Fora do escopo desta rodada.**

E a Fase 0 encosta aqui: `ImportPedidosDialog.tsx:440` já é gateada por `isGestorNow`, mas o
`isGestor` do frontend é `role === 'admin' | 'gestor' | 'empresa'` (`App.tsx:362`) —
**`líder_comercial` não entra**. Érika, com 3.772 negócios, hoje importa sem poder atribuir
a outra pessoa. Se a MD quiser que ela possa, o caminho é a permissão das Configurações, não
mais um papel especial.

---

## 7. Telas

Sete pontos. **Regra que atravessa todos: a tela mostra o principal como mostra hoje, e os
participantes aparecem ao lado, nunca no lugar.** Uma tela que troque "Responsável: Érika"
por "Responsável: 3 pessoas" perde a informação que o dinheiro segue.

| # | Onde | Arquivo:linha | O que precisa |
|---|---|---|---|
| 1 | **Cadastro** | `NovoNegocioDialog.tsx:161, 198-200, 365, 579-582` | O campo "Responsável" continua um só e continua obrigatório, já preenchido com quem cadastra (`myVendedorId`, linha 200) — é a decisão 1. **Ele passa a ser o principal.** Participantes: campo de múltipla escolha logo abaixo, opcional, vazio por padrão |
| 2 | **Edição** | `EditarPedido.tsx:116, 155, 257, 329, 565-568` | Igual ao cadastro. A validação da linha 257 (`if (!vendedorId)`) é a que garante "pelo menos um" na tela; **mantenha**, ela espelha o `NOT NULL` do banco |
| 3 | **Lista** | `Negocios.tsx:82, 95, 399-400` | A coluna se chama "Responsável/Vendedor" e sai de `pedido.vendedor?.nome`. Passa a mostrar o principal **e** uma marca discreta de "+N" quando houver participantes. Não crie coluna nova: `PEDIDOS_DEFAULT_VISIBLE_COLUMNS` (linha 95) é preferência salva de cada usuário, e coluna nova nasceria escondida para quem já usa o sistema |
| 4 | **Cartão do kanban** | `KanbanCard.tsx:172-176` | Hoje é um selo com `order.vendedor`. Espaço é o recurso escasso: **o selo continua sendo o principal**, e o "+N" entra como sufixo, não como segundo selo |
| 5 | **Painel de detalhe** | `Negocios.tsx:2132-2140` | O bloco "Vendedor Responsável" já leva ao perfil (`/usuarios/{id}`). Vira a lista completa: o principal marcado como tal, os participantes abaixo, cada um clicável do mesmo jeito |
| 6 | **Filtro de Responsável** | `Negocios.tsx:679, 830` (lista) · `Dashboard.tsx` (painéis) | **Continua significando principal, nas duas telas.** Participação, se entrar, entra como opção separada — ver a decisão pendente em §12 |
| 7 | **Exportação** | `Negocios.tsx:1441, 1470, 1600, 1612` · `src/lib/generate-pdf.ts:12, 93` · `src/lib/generate-excel.ts:23` | A coluna "Vendedor" continua sendo o principal — planilha é o que a MD confere contra o Bitrix, e trocar o significado de uma coluna existente é como o problema de datas começou. Participantes, se pedidos, vão em **coluna nova** |

**Oitavo ponto, que não é tela mas mexe em todas:** a ação em massa "Novo responsável"
(`Negocios.tsx:3183`, aplicada em `:1403` com `updates.usuario_id = bulkNewVendedorId`).
Ela **troca o principal** de um lote inteiro de negócios de uma vez. Depois da Fase 2 o
gatilho do espelho cuida da ligação sozinho — mas é por aqui que uma reatribuição em massa
pode acontecer com um clique, e é o caminho que a decisão 4 mais precisa que o histórico
cubra de verdade (§1.2).

**Nono ponto, o histórico:** `HistoricoAlteracoes.tsx:19-30` precisa de `pedido_responsaveis`
no mapa `TABELA_LABELS` (rótulo sugerido: "Responsável do Negócio"), senão a tela mostra o
nome cru da tabela. E o filtro "Entidade" (linha 160) passa a listá-la.

---

## 8. Ordem de execução e reversibilidade

```
   FASE 0  Fechar a política larga de `pedidos`      ← aperto. Mexe em produção
   FASE 1  Deixar o histórico legível                ← pré-requisito da decisão 4
   FASE 2  Tabela de ligação + espelho + carga       ← invisível na tela
   FASE 3  As telas                                  ← a única que o cliente percebe
   FASE 4  A política de UPDATE nova                 ← libera a decisão 3
```

### Por que esta ordem, e não outra

**A Fase 0 vem primeiro porque hoje ela é o único acesso que existe de verdade.** Enquanto
`Acesso pedidos empresa` estiver lá, a política nova da Fase 4 não muda comportamento
nenhum — e ninguém consegue testar se ela funciona, porque a união libera tudo de qualquer
jeito. Testar a Fase 4 antes da Fase 0 dá aprovação falsa.

**A Fase 1 vem antes da Fase 3** porque a decisão 4 troca uma trava por um registro. Soltar
a reatribuição na tela antes de o registro estar legível é ficar algumas semanas sem trava
**e** sem auditoria utilizável.

**A Fase 2 antes da 3** porque o espelho de mão dupla faz o código de hoje já alimentar a
tabela nova (§3.3). Quando as telas chegarem, a ligação já está povoada e conferida com
11.911 linhas de dado real, em vez de estrear com dado escrito pela tela nova.

**A Fase 4 por último** porque é a que amplia acesso. Ampliar acesso com as telas prontas e o
histórico legível é o único jeito de a ampliação ser observável.

### O que dá para desfazer, e o que não

| Fase | Reversível? | Como |
|---|---|---|
| **0** — remover a política larga | ✅ **Sim, em minutos** | Migration nova recriando a política com o texto exato de `20260504172116:93`. Nenhum dado muda |
| **1** — histórico legível | ✅ Sim | É só apresentação. Nada gravado muda |
| **2** — ligação + espelho + carga | ⚠️ **Sim, com um porém** | A tabela pode ser esvaziada e os gatilhos removidos; `pedidos.usuario_id` nunca deixou de valer, então o sistema volta ao estado atual. **O porém:** todo participante cadastrado no intervalo **some**, porque só existia lá. Ver abaixo |
| **3** — telas | ✅ Sim | Reverter o código. O dado fica |
| **4** — política de UPDATE | ✅ Sim | Migration nova com o texto anterior. Nenhum dado muda |

**O único caminho sem volta é o dado que a Fase 2 passa a receber.** Depois que a MD começar
a marcar participantes, desfazer a Fase 2 **apaga essa informação**, e ela não está em mais
lugar nenhum — nem no espelho, que só guarda o principal.

Duas coisas tornam isso administrável:

1. **A ordem já ajuda.** Entre a Fase 2 e a Fase 3 não existe tela para marcar participante,
   então a tabela só tem a carga inicial — reversível de verdade. A janela de "sem volta"
   começa na Fase 3.
2. **O histórico da ligação (Fase 1) é a segunda cópia.** Se a ligação levar o gatilho de
   histórico, cada participante que entrou ou saiu fica registrado em
   `historico_alteracoes`, e reconstruir a lista é possível mesmo depois de esvaziar a
   tabela. **É o argumento mais forte para o gatilho não ficar para depois.**

O que **não** é caminho sem volta, e vale dizer porque parece: a carga inicial de 11.911
linhas. Ela é cópia do que já está em `pedidos.usuario_id`, refazível a qualquer momento com
a mesma consulta.

---

## 9. Riscos

| Risco | Como está tratado |
|---|---|
| Escrever a política nova e não mudar nada, porque a velha continua liberando tudo | Fase 0 antes de tudo, com o `DROP POLICY` explícito (§4.2) |
| Alguém perder acesso a trabalho existente na Fase 0 | Medido pessoa a pessoa (§4.2): dos 5 sem permissão de editar, **todos têm 0 negócios**. O ramo `usuario_id = get_my_usuario_id()` continua na política |
| 7 pessoas da MD perderem o apagar de um dia para o outro | Consequência conhecida e **decisão pendente do Lucas** (§12), não efeito colateral |
| Reatribuir abrir a tela e falhar ao salvar | `WITH CHECK` escrito à mão, idêntico ao `USING` (§4.4). É o modo de falha mais provável de todo o plano |
| A política ficar lenta e derrubar a lista de negócios | Medido (§4.5): `has_permission` mantém Index Only Scan a 4,0 ms; `EXISTS` na ligação vira Seq Scan a 29,0 ms. **A ligação não entra em política nenhuma** |
| Dinheiro contado duas vezes | Nenhuma consulta de valor toca a ligação (§5). O `JOIN` um-para-muitos que triplicaria o valor está nomeado ali |
| Os gatilhos do espelho entrarem em laço | Escrita idempotente com `IS DISTINCT FROM` no `WHERE` (§3.3) |
| Gatilho pesado travar a importação da MD | §6, aviso 1. A importação insere em lote e é a prioridade 00 |
| Participante entrar e sair sem deixar rastro | Gatilho de histórico na ligação **e** entrada em `TABELA_LABELS`, os dois na Fase 1 (§1.2) |
| Perder participantes ao desfazer a Fase 2 | §8: a janela reversível vai até a Fase 3; depois dela, o histórico da ligação é a segunda cópia |
| Coluna nova nascer escondida para quem já usa | §7, ponto 3: as colunas visíveis são preferência salva por usuário. Reaproveitar a coluna existente, não criar outra |
| `líder_comercial` cair no vão entre `is_gestor()` e `has_permission` | §4.1: a diferença está tabelada. A política nova (§4.3) resolve o caso dela pelo ramo da permissão |
| Alguém "consertar" o Dashboard para somar por participante | §5, com a regra escrita: dinheiro junta por `usuario_id`, ponto |

---

## 10. Como saberemos que funcionou

| Critério | Como se mede |
|---|---|
| A política velha sumiu | `pg_policies` de `pedidos` devolve **6** linhas, e nenhuma com `cmd = 'ALL'` |
| Ninguém perdeu o que era seu | Login real de um vendedor da MD: abre e salva um negócio próprio. Testado **como vendedor comum, não como gestor** (`CLAUDE.md` §9) |
| A decisão 3 vale | Login como Érika (`líder_comercial`, `pode_editar = true`): edita negócio de outra pessoa e **salva** |
| A decisão 3 tem limite | Login como um dos 5 sem permissão: abre negócio de outro e **é recusado ao salvar** — recusa do banco, não botão escondido |
| Reatribuir para si funciona **e** aparece | Trocar o responsável e achar a linha no Histórico com nome de pessoa nos dois lados, não UUID |
| Participante entra e sai com rastro | Marcar e desmarcar participante; as duas ações aparecem no Histórico como "Responsável do Negócio" |
| A lista de negócios não ficou lenta | `EXPLAIN (ANALYZE, BUFFERS)` do recorte da MD **continua em Index Only Scan**, na casa dos **4–6 ms**. Se aparecer `Seq Scan`, alguém pôs a ligação numa política |
| Os números do Dashboard não se mexeram | Faturamento Total, Rendimento por Responsável e Plano de Vendas **iguais ao centavo**, antes e depois, no mesmo período |
| A soma continua fechando | "Rendimento por Responsável" somado à mão = Faturamento Total do mesmo período |
| A carga inicial está completa | `count(*)` da ligação com `principal = true` = **11.911**, e zero negócios sem principal |
| O espelho não desandou | Zero linhas em que `pedidos.usuario_id` ≠ o `usuario_id` da linha principal da ligação. **Esta consulta merece rodar de novo um mês depois** |
| A importação continua igual | Importar um arquivo pequeno e conferir que cada negócio nasceu com uma linha principal na ligação |

---

## 11. O que NÃO entra nesta rodada

- **Ratear valor entre responsáveis.** Contraria a decisão 2 e quebraria as oito consultas
  de §5 de uma vez
- **Comissão por participação.** Depende do rateio acima
- **Participante em outras entidades** — cliente, obra, tarefa. Mesma família de problema,
  outro plano
- **Coluna de participantes na planilha de importação** (§6, aviso 2)
- **Indicador novo de participação no Dashboard.** Gráfico novo exige a pergunta do período
  ao Lucas antes da primeira linha (`CLAUDE.md` §5)
- **Acertar o vão do `líder_comercial`** entre `is_gestor()` e `has_permission` (§4.1). A
  política nova resolve o caso prático; a inconsistência das duas funções é dívida própria
- **A mesma conferência de política dupla nas outras tabelas.** `clientes` está registrada no
  [item 13 da dívida técnica](../divida-tecnica.md#13-duas-gerações-de-política-em-clientes)
  e **continua aberta**. `pedidos` era a segunda; as outras que passaram pela renomeação de
  `vendedores` para `usuarios` não foram conferidas

---

## 12. O que ainda precisa do Lucas

Três perguntas. As duas primeiras travam a Fase 0.

1. **Quem pode apagar negócio depois da Fase 0?** Hoje é qualquer pessoa da empresa, por
   acidente (§1.1). Ao fechar a política larga, o padrão vira "só gestor" — e **7 pessoas da
   MD, incluindo Érika com 3.772 negócios, deixam de apagar até o próprio negócio**. As três
   saídas estão em §4.2. É mudança no que o cliente vê (`CLAUDE.md` §11).

2. **A MD precisa ser avisada antes?** A Fase 0 muda o comportamento de 7 das 13 pessoas
   dela no dia em que subir. Não há como fazer isso sem alguém notar.

3. **O filtro "Responsável" deve incluir participação?** A recomendação deste plano é
   **não** — "Responsável" significa principal nas duas telas, e participação entra depois
   como opção separada (§7, ponto 6). O motivo: o filtro da tela de Negócios alimenta
   `pedidos_stats`, que devolve o **valor** do recorte. Se filtrar por Fulano trouxesse os
   negócios em que ele só participou, o valor cheio desses negócios entraria no total dele —
   e o número da tela passaria a discordar do "Rendimento por Responsável" do Dashboard, sem
   nada indicando qual dos dois está certo. **Esta não trava as fases 0 a 2**, mas trava a
   Fase 3.

---

## 13. Coordenação

Há **outra sessão de trabalho ativa na mesma pasta**. Antes de cada commit: `git fetch`,
conferir se entrou commit de outra pessoa, e **nunca `git add -A`** — listar os arquivos um
a um (`CLAUDE.md` §13).

**Este plano toca `pedidos`.** O [reparo de datas](plano-reparo-datas.md) também. Os dois
mexem na mesma tabela, e o reparo de datas ainda não rodou: ele reescreve `prazo_resposta`
de **445 negócios**. Não há colisão de coluna — um mexe em data, o outro em responsável —
mas **não rode os dois no mesmo dia**: se o Faturamento Mensal mudar, ninguém vai saber qual
dos dois mexeu.

O [controle de acesso por seção](plano-controle-de-acesso.md) mexe em política de banco
também, mas em outras tabelas (`secao_*`, as do Portal). O ponto de encontro é conceitual:
lá a empresa define **o que existe**, na matriz de permissões se define **quem vê**, e aqui
se define **quem edita**. Três eixos, três mecanismos, nenhum substitui o outro.

Nenhum arquivo de código em comum com a
[blindagem do WhatsApp](plano-blindagem-whatsapp.md) — podem correr em paralelo.
