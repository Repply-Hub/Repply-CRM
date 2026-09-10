-- ============================================================================
-- A TABELA DO TIME GANHA FUNÇÃO PRÓPRIA, PAGINADA: negocios_em_risco
-- ============================================================================
--
-- A migration anterior (20260909120000) fez a fila da tela "Hoje" voltar a ser sempre pessoal.
-- Com isso a chave `pauta_de_todos` ficou sem emprego na fila — e o emprego novo dela é este:
-- liberar a TABELA DO TIME, a lista dos negócios da equipe que pedem atenção. Esta migration
-- constrói a peça de banco dessa tabela; a tela vem na tarefa seguinte.
--
-- Em uma frase: os "10 maiores parados" saem de dentro do painel de números
-- (`dashboard_negocios_risco`) e viram função própria, paginada, que devolve o total do recorte
-- na própria linha.
--
-- Por que paginada, e por que o total vem junto de cada linha:
--   · A lista de hoje é fixa em 10. Quem enxerga a equipe inteira tem 159 negócios pedindo
--     atenção (medido na MD em 10/09/2026; eram 157 na véspera — o número anda com os dados)
--     e vê 10 deles, sem jeito nenhum de ver o resto.
--   · `total_geral` repete em toda linha o total do recorte inteiro, não o da página. É assim
--     que o "Ver mais" sabe quando parar, sem uma segunda chamada ao banco só para contar.
--     Quem faz isso é o `count(*) OVER ()`, que roda ANTES do `LIMIT`.
--     ⚠️ A função ainda NÃO existe no banco, então isto não foi medido chamando-a: a medição
--     foi feita rodando o CORPO dela inline, como usuária logada (ver o bloco de desempenho
--     mais abaixo). Com página de 10, as 10 linhas voltam com `total_geral = 159`, e um
--     `count(*)` da mesma condição sem paginação também dá 159. Refaça a conta CHAMANDO a
--     função depois de aplicar — o plano de execução prova a ordem, com o `WindowAgg` sobre
--     159 linhas acontecendo antes do `Sort` que corta em 10.
--   · 🔴 O teto de 100 em `p_limite` não é decoração. Sem ele, um "Ver mais" pedindo um número
--     grande varreria a base inteira debaixo da regra de segurança e estouraria o limite de 8
--     segundos do papel `authenticated` (CLAUDE.md §7.15) — e a tela giraria para sempre em vez
--     de dar erro. `least(p_limite, 100)` corta por cima; `greatest(…, 1)` corta por baixo, para
--     que `p_limite := 0` (ou negativo) não devolva a lista vazia sem explicação.
--
-- O PORTÃO É O MESMO DA LISTA DE HOJE, e continua sendo o da chave, não o do papel:
-- quem tem `pauta_de_todos` vê a empresa; quem não tem vê os seus. Não é uma decisão nova —
-- é o mesmo `CASE` que o `top_parados` já usava desde 07/09/2026, copiado sem mudança.
--
-- ============================================================================
-- 10/09/2026 — A MESMA LISTA PASSA A SERVIR TAMBÉM O E-MAIL DAS 7h
-- ============================================================================
-- Esta migration ainda NÃO foi aplicada, então o texto abaixo mudou de forma antes de existir
-- no banco. O que mudou, e por quê:
--
-- O e-mail das 7h (`supabase/functions/pauta-resumo-diario/index.ts`) precisa desta mesma lista
-- para quem tem a chave `pauta_de_todos` e ficou sem negócio próprio — três gestoras da MD,
-- Fabiola entre elas. Mas a função de borda fala com o banco como `service_role`, onde **não há
-- usuário logado**: `auth.uid()` é nulo, `get_my_usuario_id()` devolve nulo e
-- `eu_vejo_pauta_de_todos()` (que é literalmente `ve_pauta_de_todos(get_my_usuario_id())`)
-- devolve NULO. O filtro vira `(NULL OR usuario_id = NULL)`, que é NULL para toda linha, e a
-- consulta volta VAZIA. O e-mail diria "não há nada", todo dia, para todo mundo.
--
-- A saída é a MESMA que `pauta_do_dia_de(uuid)` já usa para servir esse mesmo e-mail: quem
-- pergunta vai por parâmetro, não por sessão. Então a função virou DUAS, com UM corpo só:
--
--   `negocios_em_risco_de(p_usuario_id, …)`  ← o corpo. SECURITY DEFINER, só `service_role`
--   `negocios_em_risco(…)`                   ← invólucro de uma linha, para a tela. Assinatura
--                                              e retorno INTACTOS: a tela não muda nada
--
-- É par a par com `pauta_do_dia_de(uuid)` / `pauta_do_dia()`, que já vivem assim neste banco
-- desde 07/09 e servem a MESMA tela e o MESMO e-mail (medido hoje: `pauta_do_dia()` é
-- SECURITY DEFINER e chama `pauta_do_dia_de`, que é fechada para `authenticated`).
--
-- 🔴 POR QUE NÃO DUAS CÓPIAS DA CONSULTA. `hoje`/`abertos`/`marcado` já existem duas vezes neste
-- arquivo (aqui e em `dashboard_negocios_risco`). Uma terceira cópia é exatamente o desenho que
-- CLAUDE.md §7.14 conta ter custado caro: o conserto das datas foi feito num dos três leitores de
-- planilha, e voltou a quebrar porque a tela usava outro. Duas pontas, um corpo.
--
-- ----------------------------------------------------------------------------
-- 🔴 A CERCA DE EMPRESA, QUE ANTES ERA A RLS E AGORA ESTÁ ESCRITA
-- ----------------------------------------------------------------------------
-- `service_role` PULA a RLS, e não existe política nenhuma segurando o resultado depois disso.
-- Sem cerca explícita, uma gestora da MD receberia negócio de OUTRA EMPRESA no e-mail. Medido
-- em 10/09/2026, rodando o corpo com o portão de Fabiola e privilégio de administrador:
--
--   sem a CTE `gente`  → 261 negócios, de 3 empresas, R$ 29.963.972 — 100 deles de fora da MD
--   com a CTE `gente`  → 161 negócios, de 1 empresa,  R$ 10.580.166 — ZERO de fora da MD
--
-- A cerca é a CTE `gente`, o mesmo caminho de `pauta_do_dia_de`. E ela é o ESPELHO EXATO do que
-- a RLS de `pedidos` faz hoje — `pedidos_select` é `usuario_id IN (usuarios_da_minha_empresa())`,
-- e `usuarios_da_minha_empresa()` é, palavra por palavra:
--     SELECT u.id FROM usuarios u WHERE u.empresa_id = get_my_empresa_id() OR u.id = get_my_usuario_id()
-- Por isso `gente` NÃO filtra `deleted_at`: a RLS também não filtra, e acrescentar o filtro aqui
-- MUDARIA a lista da tela (negócio de colega desativado sumiria). E por isso ela mantém o "ou eu
-- mesmo": `empresa_id` é anulável (há 1 usuário ativo sem empresa, o Admin Master) e `NULL = NULL`
-- é falso — sem esse ramo, quem não tem empresa perderia os próprios negócios.
--
-- 🔴 A PROVA DE QUE A TELA NÃO MUDA. Como o invólucro é SECURITY DEFINER, a RLS deixa de ser
-- quem faz a cerca no caminho da tela — quem faz é a `gente`. Para provar que dá na MESMA lista,
-- o corpo antigo foi rodado COMO USUÁRIA LOGADA (CLAUDE.md §7.15: `set_config` de
-- `request.jwt.claims` + `role` = `authenticated`) e o corpo novo com privilégio, comparando a
-- impressão digital do conjunto de identificadores (`md5(string_agg(id ordenado))`):
--
--   pessoa                             hoje (RLS)              novo (cerca)            igual?
--   Fabiola (gestora, com chave)       161 · d0a88c3e38789e0e  161 · d0a88c3e38789e0e   sim
--   Igor Morais (chave + negócio seu)  161 · d0a88c3e38789e0e  161 · d0a88c3e38789e0e   sim
--   Érika Marques (vendedora)           43 · 09e59b9b462b409b   43 · 09e59b9b462b409b   sim
--   Dennis Correia (OUTRA empresa)       7 · 78b0c2b67c18dc08    7 · 78b0c2b67c18dc08   sim
--
-- As outras tabelas que o corpo lê continuam iguais nos dois caminhos porque TODA política de
-- leitura delas é por empresa, e não por pessoa (conferido em `pg_policy` em 10/09/2026:
-- `clientes`, `fabricantes`, `kanban_colunas`, `usuarios`, `tarefas`, `historico_contatos`,
-- `pedidos_historico_status`). As duas exceções teóricas foram contadas e dão zero: tarefa de
-- pessoa de outra empresa num negócio daqui → 0; cliente de pessoa de outra empresa → 0. Também
-- não há negócio sem dono (`usuario_id is null` → 0), que é o caso em que `IN (…)` e `JOIN`
-- poderiam divergir.
--
-- ----------------------------------------------------------------------------
-- `valor_geral`: A COLUNA NOVA, E POR QUE ELA SÓ APARECE NA VARIANTE
-- ----------------------------------------------------------------------------
-- O e-mail precisa dizer "R$ 10.580.166 em 161 negócios da equipe" tendo lido só as 5 maiores
-- linhas. `total_geral` já resolvia a contagem; `valor_geral` faz o mesmo com o dinheiro, pelo
-- mesmo `OVER ()` e no mesmo `WindowAgg` — custo zero, porque a janela já estava lá. Somar no
-- Deno exigiria trazer o recorte inteiro para o servidor de e-mail (CLAUDE.md §6.4).
--
-- Ela fica FORA do retorno de `negocios_em_risco`, que projeta as 8 colunas de sempre: a tela da
-- Tarefa 3 do Plano C está prestes a ser publicada com `NegocioEmRisco` de 8 campos
-- (`src/hooks/use-dashboard.ts`) e `src/integrations/supabase/types.ts` declarando as mesmas 8.
-- Mudar o contrato dela agora não traria nada e mexeria no que já foi medido.
--
-- ----------------------------------------------------------------------------
-- O QUE FOI CONFERIDO NO BANCO ANTES DE ESCREVER (09/09/2026, só SELECT)
-- ----------------------------------------------------------------------------
--   · O texto de `dashboard_negocios_risco` foi COLHIDO com `pg_get_functiondef` e editado a
--     partir do que está vivo, não reescrito de memória.
--       corpo vigente  → md5 590e971f0f7a00a1daabcfcee16a95a4 · 4.122 caracteres
--       corpo reemitido→ md5 3e40ace58fa8b109c44710db2b8415da · 3.071 caracteres
--     O segundo é o primeiro cortado no ponto exato onde começa a última coluna do SELECT.
--     Contagem de ocorrências, para provar que o corte não pegou demais: `tp.` 11 → 0 e
--     `public.clientes` 1 → 0 (as duas só existiam dentro do bloco removido).
--
--   · As CTEs `hoje`, `abertos` e `marcado` de `negocios_em_risco` são o MESMO texto, caractere
--     por caractere, das de `dashboard_negocios_risco`: md5 663def4a3bf932088ca8540c4e4924e1
--     (1.859 caracteres). Isso inclui a junção de `kanban_colunas` pelas TRÊS colunas
--     (`slug`, `empresa_id`, `funil_id`) — sem `funil_id`, empresa com dois funis dobra cada
--     negócio (conserto de 20260905140000) — e o `LEFT JOIN LATERAL` da última atividade.
--
--     ⚠️ ATUALIZADO EM 10/09/2026: com a cerca de empresa escrita, `abertos` deixou de ser
--     idêntica — ela ganhou UMA linha, o `JOIN gente g ON g.id = p.usuario_id`, e nada mais.
--     `hoje` e `marcado` continuam idênticas, caractere por caractere. A linha nova fica no
--     `JOIN` e não num `EXISTS` lá embaixo de propósito: ela corta ANTES do `LATERAL` da última
--     atividade e das duas subconsultas de `marcado`, que são o caro desta consulta.
--
--   · `proacl` de `dashboard_negocios_risco` medida ANTES desta migration:
--         =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--     Dono: `postgres`. Confira antes e depois — tem de dar o mesmo texto nas duas medições:
--
--       select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname in ('dashboard_negocios_risco','negocios_em_risco');
--
-- ----------------------------------------------------------------------------
-- 🔴 AQUI TEM UM `DROP`, E ELE APAGA AS CONCESSÕES
-- ----------------------------------------------------------------------------
-- `dashboard_negocios_risco` perde uma coluna do `RETURNS TABLE` (`top_parados`), e mudar a
-- lista de colunas do retorno NÃO cabe em `CREATE OR REPLACE`: o Postgres recusa com
-- "cannot change return type of existing function ... Use DROP FUNCTION ... first". Então o
-- caminho é `DROP` + `CREATE`, e o `DROP` leva junto todo `GRANT` que existia.
--
-- Por isso o `GRANT` abaixo repõe os três papéis que estavam lá. Conferido em `pg_default_acl`
-- antes de escrever: neste banco, função nova criada por `postgres` no esquema `public` já nasce
-- alcançável por PUBLIC, `postgres`, `anon`, `authenticated` e `service_role` — que é exatamente
-- a `proacl` medida antes. Ou seja, o `GRANT` abaixo é redundante de propósito: ele declara a
-- intenção por escrito, para o dia em que a concessão padrão do esquema mudar. O resultado
-- esperado é a linha idêntica à de antes, PUBLIC inclusive.
--
-- `negocios_em_risco` é função NOVA. Ela leva `REVOKE` de PUBLIC e de `anon` — lê carteira de
-- cliente e não tem por que ser alcançável sem login —, e o `GRANT` deixa `authenticated`. O
-- `service_role` fica de pé pela concessão padrão do esquema, sem `GRANT` explícito. A `proacl`
-- esperada depois de aplicar é a mesma forma de `eu_vejo_pauta_de_todos()`:
--     postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- `negocios_em_risco_de(uuid, …)` é a variante que serve o e-mail, e é MAIS FECHADA que as duas:
-- ela recebe a pessoa por parâmetro e roda com privilégio, então aberta para `authenticated` ela
-- seria o buraco que a 20260907150000 já descreveu — "qualquer pessoa logada perguntaria pelo
-- identificador de qualquer outra, de qualquer empresa". Por isso ela leva
-- `REVOKE ALL … FROM PUBLIC, anon, authenticated` e `GRANT EXECUTE … TO service_role`, que é
-- exatamente a forma de `pauta_do_dia_de(uuid)` e de `ve_pauta_de_todos(uuid)`. `proacl`
-- esperada depois de aplicar, as três iguais:
--     postgres=X/postgres | service_role=X/postgres
--
-- (Medido em 10/09/2026, ANTES desta migration: `pauta_do_dia_de(uuid)` e `ve_pauta_de_todos(uuid)`
-- estão nessa forma; `eu_vejo_pauta_de_todos()` está em `postgres | authenticated | service_role`.
-- É por `ve_pauta_de_todos(uuid)` já estar liberada para `service_role` que a variante consegue
-- chamá-la sem GRANT novo nenhum.)
--
-- Isso não é dedução: `eu_vejo_pauta_de_todos()` nasceu em 20260907150000 com este mesmo par de
-- linhas (`REVOKE ALL … FROM PUBLIC, anon` seguido de `GRANT EXECUTE … TO authenticated`), e a
-- `proacl` dela medida hoje é exatamente a linha acima. A linha de `pg_default_acl` que produz
-- isso é `defaclobjtype = 'f'`, esquema `public`, dono `postgres`:
--     postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- somada à concessão embutida do Postgres, que acrescenta PUBLIC. É de lá que vêm os cinco
-- papéis da `proacl` medida em `dashboard_negocios_risco`, e é por isso que o `DROP` + `CREATE`
-- dela devolve a MESMA lista mesmo sem o `GRANT` — que fica escrito assim mesmo, de propósito.
--
-- ----------------------------------------------------------------------------
-- 🔴 NÃO APLIQUE ESTA MIGRATION SEM PUBLICAR A TELA DA TAREFA 3 JUNTO
-- ----------------------------------------------------------------------------
-- Enquanto a tela não trocar de fonte, `RadarDeRisco.tsx` continua lendo `top_parados` do
-- resultado de `dashboard_negocios_risco`. Sem a coluna, `bruto?.top_parados ?? []` devolve
-- lista vazia e a tabela de risco mostra o estado "nada aqui" — sem erro na tela, sem aviso
-- nenhum. Ou seja: aplicar isto sozinho não quebra a página, mas faz ela MENTIR, dizendo que
-- não há negócio parado num dia em que há 159 (10/09/2026). Aplique junto com o deploy da tela.
--
-- 🔴 E TEM UM TERCEIRO GESTO, QUE É DE OUTRO CAMINHO (CLAUDE.md §16): a função de borda
-- `pauta-resumo-diario` passou a chamar `negocios_em_risco_de`. Enquanto ela não for publicada
-- (`npx supabase functions deploy pauta-resumo-diario --project-ref hukeirrmsoiowvvrhivx`), o
-- e-mail das 7h continua o de antes — e as três gestoras da MD sem negócio próprio (Fabiola,
-- Gabriel Medeiros, Gabriel Pereira) PARAM DE RECEBER no dia em que a 20260909120000 for
-- aplicada. Aplicar as migrations sem publicar a função é o cenário ruim; o inverso é inofensivo
-- (a função de borda erraria "função não existe", e o `catch` por destinatário registra isso em
-- `automation_logs` sem derrubar o e-mail de quem tem negócio próprio).
--
-- ----------------------------------------------------------------------------
-- DUAS COISAS QUE SAÍRAM DIFERENTES DO PLANO, E O QUE FOI MEDIDO PARA DECIDIR
-- ----------------------------------------------------------------------------
-- 1. A ORDENAÇÃO GANHOU DESEMPATE POR `id`. O plano pedia `ORDER BY valor_total DESC NULLS
--    LAST` e nada mais. Com paginação por deslocamento, empate de valor é bug de verdade: a
--    ordem entre linhas empatadas não é garantida, e nada obriga duas chamadas seguidas a
--    resolvê-lo do mesmo jeito. Medido hoje, com os dados de produção da MD: existem dois
--    valores repetidos no recorte, nas posições 70–71 e 138–139 — e 70/71 cai EXATAMENTE na
--    virada de página de um "Ver mais" de 10 em 10.
--
--      páginas 7 e 8 (deslocamento 60 e 70), sem desempate → 19 negócios distintos em 20 linhas
--                                                            (um aparece duas vezes, outro some)
--      as mesmas duas páginas, com `, id` no fim            → 20 distintos, nenhum repetido
--
--    O desempate por `id` não muda a primeira página: entre as 15 primeiras posições não há
--    empate nenhum.
--
--    Conferido de novo em 10/09/2026, com o recorte já em 159: os empates mudaram de lugar
--    (posições 69–70 e 140–141) e 140/141 é que caiu na virada agora. Ou seja, não é um azar de
--    um dia — enquanto houver valor repetido, sempre existe um deslocamento que o parte ao meio,
--    e ele anda sozinho conforme a carteira muda. É por isso que o desempate fica no texto e não
--    vira "não precisa hoje".
--
-- 2. A JUNÇÃO COM `clientes` FICOU DEPOIS DO RECORTE, dentro de uma subconsulta com o `LIMIT`.
--    Escrita no mesmo nível de `meus`, ela seria aplicada a TODAS as linhas do recorte antes do
--    `LIMIT`, porque `LIMIT` é o último passo da consulta. E a política de `clientes` chama
--    `get_my_usuario_id()` e `usuario_in_my_empresa()` UMA VEZ POR LINHA — é o mesmo custo que
--    matou `pedidos_stats` (CLAUDE.md §7.16) e que a Etapa 2 já tinha consertado aqui
--    (20260905123000). Medido como usuário logado, mesmo recorte, mesmas opções de EXPLAIN:
--
--      junção no mesmo nível (antes do corte)  → `clientes` varrida com loops=157 · 34,2 ms
--      junção depois do corte (é o que está aí)→ `clientes` varrida com loops=9   · 28,8 ms
--
--    A diferença cresce com a empresa: o recorte cresce, a página continua no teto de 100.
--
--    ⚠️ ATUALIZADO EM 10/09/2026: com o corpo rodando com privilégio, a política de `clientes`
--    deixou de ser cobrada — some o motivo ORIGINAL de a junção estar depois do corte. Ela fica
--    onde está mesmo assim, por dois motivos: continua sendo menos trabalho (medido de novo hoje:
--    `loops=9`, não 161) e, mais importante, mexer nela sem necessidade seria mexer no que já
--    foi medido. O que a nota acima explica continua verdadeiro, só que o custo agora é o das
--    linhas, não o da regra de segurança.
--
-- ----------------------------------------------------------------------------
-- DESEMPENHO, MEDIDO COMO USUÁRIO LOGADO (CLAUDE.md §7.15), NÃO PELO PAINEL
-- ----------------------------------------------------------------------------
--   select set_config('request.jwt.claims','{"sub":"<login>","role":"authenticated"}',true),
--          set_config('role','authenticated',true),
--          set_config('statement_timeout','8s',true);
--   explain (analyze, buffers) <consulta>;
--
-- 🔴 COMO A FUNÇÃO NOVA FOI MEDIDA SEM EXISTIR NO BANCO: esta migration não foi aplicada, então
-- `select * from public.negocios_em_risco(...)` não tinha o que chamar. O que se mede é o CORPO
-- da função colado direto na consulta, com os valores padrão dos parâmetros escritos no lugar
-- deles (o identificador da pessoa e depois `null,null,null,7,null,10,0`), debaixo do mesmo
-- login (ou, para a variante, do mesmo privilégio) e do mesmo tempo limite. O
-- painel de comparação, esse sim, é chamada de verdade — ele já existe. Quando a migration for
-- aplicada junto com a tela (Tarefa 3), refaça a medida chamando a função e confira que continua
-- na mesma casa; se passar de ~50 ms quente, pare e avise antes de publicar.
--
--   09/09/2026, recorte de 157 negócios:
--     painel de hoje (`dashboard_negocios_risco`, com `top_parados` dentro) → 29,3 ms
--     `negocios_em_risco`, página de 10, gestora que vê a empresa inteira   → 28,8 ms
--   10/09/2026, refeito na conferência final, recorte de 159 negócios:
--     painel de hoje                                                       → 29,6 ms
--     corpo de `negocios_em_risco`, mesma página, mesma gestora            → 29,1 ms
--   O recorte muda de um dia para o outro porque ele é o estado de hoje da carteira, não um
--   número fixo — o que se compara é o custo, e ele não se mexeu.
--
--   10/09/2026, DEPOIS da divisão em duas funções, recorte de 161 negócios. Agora o corpo roda
--   com privilégio, então a medida certa é a com privilégio — não a de usuário logado:
--     corpo de `negocios_em_risco_de`, página de 10, a mesma gestora       → 22,2 ms
--   Ficou MAIS BARATO, e o plano diz por quê: a cerca virou o primeiro corte da consulta.
--     Seq Scan on usuarios u_1 (actual rows=13)         ← a CTE `gente`: 13 pessoas da MD
--     Index Scan using idx_pedidos_usuario_id on pedidos p (loops=13)
--   Antes, o mesmo trecho era uma varredura de `pedidos` inteira com a política de segurança
--   chamando `usuarios_da_minha_empresa()` linha a linha (CLAUDE.md §7.16). É por isso que a
--   linha nova está no `JOIN` de `abertos` e não num `EXISTS` depois: ali ela corta primeiro.
--
-- 🔴 E os dois portões continuam aparecendo no plano como `InitPlan … rows=1 loops=1`, avaliados
-- UMA vez, não uma vez por linha varrida:
--     InitPlan 3 -> Index Scan on usuarios dono (actual rows=1 loops=1)  ← a empresa da pessoa
--     InitPlan 8 -> Result (actual rows=1 loops=1)                       ← ve_pauta_de_todos(p)
--     Index Scan on pedidos … Filter: … ((InitPlan 8).col1 OR (usuario_id = '…'::uuid))
-- É para isso que o portão está escrito como `(SELECT funcao())` e não como `funcao()`, e por
-- isso a empresa da pessoa é buscada numa subconsulta sem correlação.
--
-- E a ordem que o `total_geral`/`valor_geral` promete aparece no plano, com o mesmo recorte:
--     WindowAgg (actual rows=161)  →  Sort (top-N heapsort, actual rows=10)
-- ou seja, a janela conta as 161 ANTES de o `LIMIT` cortar em 10. A junção com `clientes`
-- continua depois do corte: `Index Scan using clientes_pkey … loops=9`, e não 161.
--
-- ----------------------------------------------------------------------------
-- QUEM FOR CHAMAR ISTO DA TELA
-- ----------------------------------------------------------------------------
-- 🔴 Array vazio em filtro de RPC filtra tudo fora (CLAUDE.md §7.8): `= ANY('{}')` não casa com
-- nada. Mande `null` quando não houver filtro, nunca `[]` — é o que `useDashboardNegociosRisco`
-- já faz para os quatro filtros, e a conversão tem de ser repetida aqui.
--
-- Deslocamento além do fim devolve ZERO linha — e, com zero linha, não há `total_geral` para
-- ler. É o comportamento certo para o "Ver mais" (ele para antes de chegar lá), mas a tela não
-- pode concluir "o total é zero" de uma página vazia.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- (a) O CORPO — `negocios_em_risco_de(p_usuario_id, …)`
--
-- Quem pergunta vem por PARÂMETRO, não por sessão. É o que permite a função de borda usar a
-- mesma lista da tela como `service_role`, onde `auth.uid()` é nulo. Mesmo desenho de
-- `pauta_do_dia_de(uuid)`.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.negocios_em_risco_de(p_usuario_id uuid, p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, valor_geral numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 🔴 A CERCA DE EMPRESA. Esta função roda com privilégio e PULA A RLS — sem esta CTE, o e-mail
  -- de uma gestora da MD sairia com negócio de outra empresa dentro (medido: 100 de 261). Ela é o
  -- espelho exato de `usuarios_da_minha_empresa()`, a função que a política `pedidos_select` usa:
  -- mesma empresa OU a própria pessoa, e sem filtrar `deleted_at` — ver o cabeçalho.
  WITH gente AS (
    SELECT u.id
    FROM public.usuarios u
    WHERE u.empresa_id = (SELECT dono.empresa_id FROM public.usuarios dono WHERE dono.id = p_usuario_id)
       OR u.id = p_usuario_id
  ),
  hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.usuario_id,
      p.nome,
      p.cliente_id,
      p.campos_extras,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    JOIN gente g ON g.id = p.usuario_id
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id = p.funil_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.historico_contatos hc, hoje
          WHERE hc.pedido_id = a.id
            AND hc.proximo_contato_em IS NOT NULL
            AND hc.proximo_contato_em >= hoje.d
        )
      ) AS sem_proxima_acao
    FROM abertos a
  ),
  meus AS (
    -- O PORTÃO. É a mesma leitura da chave de sempre: `eu_vejo_pauta_de_todos()` é, no banco,
    -- literalmente `ve_pauta_de_todos(get_my_usuario_id())` — aqui o identificador vem por
    -- parâmetro em vez de vir da sessão, e nada mais muda. Continua `(SELECT …)` para o
    -- planejador avaliá-lo UMA vez (InitPlan), não uma vez por linha varrida.
    SELECT * FROM marcado
    WHERE (parado OR sem_proxima_acao)
      AND (
        (SELECT public.ve_pauta_de_todos(p_usuario_id))
        OR usuario_id = p_usuario_id
      )
  )
  SELECT
    pagina.id,
    coalesce(
      nullif(trim(pagina.nome), ''),
      nullif(trim(pagina.campos_extras ->> 'Negócio'), ''),
      nullif(trim(cl.empresa), '') || coalesce(' | ' || pagina.fabricante_nome, ''),
      'Negócio sem nome'
    ),
    pagina.fabricante_nome,
    pagina.etapa_label,
    pagina.vendedor_nome,
    pagina.valor_total,
    ((SELECT d FROM hoje) - pagina.parado_desde)::integer,
    pagina.total_geral,
    pagina.valor_geral
  FROM (
    -- `count(*) OVER ()` e `sum(…) OVER ()` na MESMA janela: as duas rodam antes do `LIMIT` e
    -- descrevem o recorte inteiro, não a página. É o que deixa o e-mail dizer
    -- "R$ X em N negócios da equipe" tendo lido só as 5 maiores linhas.
    SELECT m.*, (count(*) OVER ())::bigint AS total_geral, (sum(m.valor_total) OVER ())::numeric AS valor_geral
    FROM meus m
    ORDER BY m.valor_total DESC NULLS LAST, m.id
    OFFSET greatest(p_deslocamento, 0)
    LIMIT greatest(least(p_limite, 100), 1)
  ) pagina
  LEFT JOIN public.clientes cl ON cl.id = pagina.cliente_id
  ORDER BY pagina.valor_total DESC NULLS LAST, pagina.id;
$function$;

-- 🔴 FECHADA PARA `authenticated`, e é o ponto mais importante deste bloco: ela aceita o
-- identificador de QUALQUER pessoa e roda com privilégio. Aberta para o navegador, qualquer
-- pessoa logada perguntaria pela pauta de qualquer outra. Mesma forma de `pauta_do_dia_de(uuid)`
-- e `ve_pauta_de_todos(uuid)`. Quem chama é a função de borda do e-mail, como `service_role`.
REVOKE ALL ON FUNCTION public.negocios_em_risco_de(uuid,uuid[],uuid[],uuid,integer,text[],integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco_de(uuid,uuid[],uuid[],uuid,integer,text[],integer,integer) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- (b) A PONTA DA TELA — `negocios_em_risco(…)`, invólucro de uma linha
--
-- Assinatura e retorno INTACTOS: as mesmas 7 entradas e as mesmas 8 colunas que
-- `useNegociosEmRisco` e `src/integrations/supabase/types.ts` já declaram. `valor_geral` fica de
-- fora porque a tela não a usa.
--
-- 🔴 SECURITY DEFINER porque a função que ela chama é fechada para `authenticated` — é o mesmo
-- motivo pelo qual `pauta_do_dia()` é SECURITY DEFINER. Quem faz a cerca de empresa deixa de ser
-- a RLS e passa a ser a CTE `gente`; a prova de que dá na MESMA lista, pessoa a pessoa, está no
-- cabeçalho (quatro impressões digitais idênticas).
--
-- O `ORDER BY` repetido aqui é de propósito: sem ele a ordem seria a da varredura da função, que
-- na prática é a mesma, mas não é promessa do Postgres. Sobre no máximo 100 linhas, custa nada.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.negocios_em_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT n.id, n.nome, n.fabrica, n.etapa, n.responsavel, n.valor, n.dias_parado, n.total_geral
  FROM public.negocios_em_risco_de(
         public.get_my_usuario_id(),
         p_usuario_ids, p_fabricante_ids, p_funil_id, p_dias_parado, p_etapas, p_limite, p_deslocamento
       ) n
  ORDER BY n.valor DESC NULLS LAST, n.id;
$function$;

REVOKE ALL ON FUNCTION public.negocios_em_risco(uuid[],uuid[],uuid,integer,text[],integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco(uuid[],uuid[],uuid,integer,text[],integer,integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- `dashboard_negocios_risco` reemitida sem `top_parados`
-- ----------------------------------------------------------------------------
-- É o texto de hoje com a ÚLTIMA coluna do SELECT removida e `top_parados jsonb` fora do
-- `RETURNS TABLE`. Nada mais mudou: os cinco números, `risco_por_vendedor` (com o mesmo `CASE`
-- da chave) e `risco_por_fabricante` estão idênticos, caractere por caractere.
--
-- Por que não tem comentário nenhum dentro do corpo, se a migration 20260907150000 tem 38 linhas
-- deles: o que está VIVO no banco não os tem. Quem aplicou aquela migration mandou o corpo sem os
-- comentários, e como este texto foi colhido do que está rodando (e não copiado do arquivo), ele
-- veio sem eles. Conferido linha a linha: fora essas 38 linhas de comentário, o corpo vivo e o da
-- 20260907150000 são iguais — nenhuma diferença de SQL. Os comentários continuam onde sempre
-- estiveram, naquela migration; o histórico não perde nada.
DROP FUNCTION IF EXISTS public.dashboard_negocios_risco(uuid[],uuid[],uuid,integer,text[]);

CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[])
 RETURNS TABLE(qtd_parados bigint, valor_parados numeric, qtd_sem_proxima_acao bigint, valor_sem_proxima_acao numeric, valor_risco_total numeric, risco_por_vendedor jsonb, risco_por_fabricante jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.usuario_id,
      p.nome,
      p.cliente_id,
      p.campos_extras,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id = p.funil_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.historico_contatos hc, hoje
          WHERE hc.pedido_id = a.id
            AND hc.proximo_contato_em IS NOT NULL
            AND hc.proximo_contato_em >= hoje.d
        )
      ) AS sem_proxima_acao
    FROM abertos a
  )
  SELECT
    (SELECT count(*) FROM marcado WHERE parado)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado)::numeric,
    (SELECT count(*) FROM marcado WHERE sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado OR sem_proxima_acao)::numeric,
    CASE WHEN public.eu_vejo_pauta_de_todos() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) ELSE '[]'::jsonb END,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    );
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_negocios_risco(uuid[],uuid[],uuid,integer,text[]) TO anon, authenticated, service_role;

-- Fecha a transação aberta lá em cima.
--
-- 🔴 Ela existe por causa do `DROP FUNCTION` da `dashboard_negocios_risco`. Se o `CREATE`
-- seguinte falhasse e quem executa não abrisse transação própria, o `DROP` ficaria de pé
-- sozinho: a função sumiria do banco e o painel da tela "Hoje" morreria para todo mundo — com
-- a tela dando erro de função inexistente, e nada para reverter senão aplicar de novo.
--
-- Os dois vizinhos desta família que também apagam função fazem igual
-- (`20260907140000_adiar_negocio_de_colega.sql` e `20260907150000_pauta_segue_a_chave.sql`).
-- A `20260909120000_fila_pessoal.sql` não precisa: lá é um `CREATE OR REPLACE` sozinho, que já
-- é atômico por si.
COMMIT;
