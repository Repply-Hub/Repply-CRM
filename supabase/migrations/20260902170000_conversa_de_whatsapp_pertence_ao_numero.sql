-- ============================================================================
-- A CONVERSA DE WHATSAPP PASSA A PERTENCER AO NÚMERO, NÃO À EMPRESA INTEIRA
-- ============================================================================
--
-- 🔴 MUDANÇA DE REGRA DE PRODUTO, não conserto de digitação. Decisão do Lucas em 02/09/2026,
-- depois de ver a medição e escolher entre dois desenhos.
--
-- ─── O QUE ELE RELATOU ───────────────────────────────────────────────────────
--
-- "as pessoas veem todas as conversas de todas as instâncias mesmo quando não estão vinculadas
-- a elas. O certo é só ver as mensagens das instâncias às quais você está vinculado."
--
-- ─── O QUE A MEDIÇÃO ACHOU ───────────────────────────────────────────────────
--
-- Vazamento entre EMPRESAS: ZERO. A cerca `c.empresa_id = get_my_empresa_id()` sempre
-- funcionou e continua intocada.
--
-- Vazamento entre INSTÂNCIAS da mesma empresa: total. A palavra "instancia" não aparecia uma
-- única vez nesta função. Pior caso medido: o vendedor Vincius (MD Representações) enxergava
-- 671 conversas e 46.868 mensagens; sob a regra nova enxerga 6.
--
-- 🔴 E A CAUSA NÃO ERA O GESTOR VER TUDO. Era o último ramo — "conversa sem responsável é
-- visível a qualquer um da empresa" — e ele é a MAIORIA da base: 768 das 983 conversas (78%)
-- não têm responsável. Consertar só o ramo de papel não moveria um número sequer.
--
-- ─── ISTO REVERTE UMA DECISÃO DELIBERADA, E ISSO PRECISA ESTAR ESCRITO ──────
--
-- A visibilidade "empresa + responsável" foi construída em quatro passos conscientes:
--   20260709190000  cria a regra (antes, todo mundo da empresa via tudo)
--   20260715130000  acrescenta o gestor
--   20260721150000  decide NÃO usar `wapi_instancia_usuarios` para ATRIBUIR conversa
--   20260722110000  abre a conversa sem responsável a toda a empresa, para o vendedor não
--                   depender de alguém empurrar a conversa até ele
--
-- O vínculo instância↔usuário decidia de qual número você ENVIA, nunca o que você VÊ. A tela
-- do gestor ("vincule a múltiplos usuários") é vocabulário de conexão e nunca prometeu
-- isolamento — mas lê-se como isolamento, e foi o que aconteceu.
--
-- ─── O DESENHO ESCOLHIDO (A), E O QUE FICOU DE FORA ─────────────────────────
--
-- O Lucas escolheu manter a privacidade entre colegas do MESMO número: estar ligado ao número
-- não basta, você vê o que assumiu e o que ainda não tem dono. A cerca de número entra POR
-- CIMA da regra de sempre, não no lugar dela.
--
-- ⚠️ Consequência aceita e medida: o vendedor Sororo (empresa "MD") vê 0 das 4 conversas do
-- número dele e CONTINUA vendo 0 — as 4 têm dono e ele não é. Sob o desenho A isso é a regra
-- funcionando. Se ele deve atendê-las, alguém as direciona a ele.
--
-- ─── OS DOIS PORTÕES, ABERTOS ANTES DE ESCREVER ─────────────────────────────
--
-- Medido em 02/09/2026, e os dois tinham poder de vetar esta migration:
--   · instância com conversas e SEM ninguém vinculado ....... nenhuma (senão as conversas dela
--     ficariam invisíveis para a empresa inteira — o desastre de 20260827181625)
--   · responsável de conversa cujo número ele não atende .... nenhum (senão a conversa ficaria
--     com dono, fora da fila dos outros, e muda)
--
-- ============================================================================
-- 🔴 SCRIPT DE VOLTA — colhido do BANCO em 02/09/2026, não do repositório
-- ============================================================================
-- Escrito ANTES de aplicar, no mesmo commit, porque reversibilidade preparada depois do
-- incidente não é reversibilidade. Para desfazer, criar migration NOVA (§6.3: nunca editar
-- migration existente) com exatamente isto:
--
--   create or replace function public.can_access_wa_conversa(_conversa_id uuid)
--    returns boolean language sql stable security definer set search_path to 'public'
--   as $volta$
--     SELECT EXISTS (
--       SELECT 1 FROM whatsapp_conversas c
--       WHERE c.id = _conversa_id
--         AND c.empresa_id = get_my_empresa_id()
--         AND ( is_admin()
--            OR EXISTS (SELECT 1 FROM usuarios WHERE user_id = auth.uid()
--                        AND role IN ('empresa', 'gestor'))
--            OR EXISTS (SELECT 1 FROM whatsapp_conversa_responsaveis wcr
--                        WHERE wcr.conversa_id = c.id AND wcr.usuario_id = get_my_usuario_id())
--            OR NOT EXISTS (SELECT 1 FROM whatsapp_conversa_responsaveis wcr2
--                            WHERE wcr2.conversa_id = c.id) ) );
--   $volta$;
--
--   create policy responsaveis_select on public.whatsapp_conversa_responsaveis
--     for select using (exists (select 1 from whatsapp_conversas wc
--       where wc.id = whatsapp_conversa_responsaveis.conversa_id
--         and wc.empresa_id = get_my_empresa_id()));
--   create policy responsaveis_insert on public.whatsapp_conversa_responsaveis
--     for insert with check (exists (select 1 from whatsapp_conversas wc
--       where wc.id = whatsapp_conversa_responsaveis.conversa_id
--         and wc.empresa_id = get_my_empresa_id()));
--   create policy responsaveis_delete on public.whatsapp_conversa_responsaveis
--     for delete using (exists (select 1 from whatsapp_conversas wc
--       where wc.id = whatsapp_conversa_responsaveis.conversa_id
--         and wc.empresa_id = get_my_empresa_id()));
--
--   drop policy if exists wa_responsaveis_so_quem_atende_o_numero
--     on public.whatsapp_conversa_responsaveis;
--
--   drop policy if exists wa_mensagens_access on public.whatsapp_mensagens;
--   create policy wa_mensagens_access on public.whatsapp_mensagens for all
--     using (can_access_wa_conversa(conversa_id))
--     with check (empresa_id = get_my_empresa_id());
--
-- O índice e a função auxiliar podem ficar — não fazem mal a ninguém.
-- ============================================================================


-- ─── 1. A REGRA ────────────────────────────────────────────────────────────
--
-- 🔴 AS DUAS FAMÍLIAS DE IDENTIFICADOR ESTÃO A TRÊS LINHAS UMA DA OUTRA (CLAUDE.md §4.5):
--
--   wapi_instancia_usuarios.usuario_auth_id   -> auth.users(id)  -> auth.uid()
--   whatsapp_conversa_responsaveis.usuario_id -> usuarios(id)    -> get_my_usuario_id()
--
-- Trocar uma pela outra NÃO dá erro: dá zero linhas. E o sintoma seria a caixa de entrada de
-- TODAS as empresas ficando vazia ao mesmo tempo, porque nenhum `usuarios.id` existe em
-- `auth.users` (0 de 26, medido). Conferido aqui com pg_get_constraintdef antes de escrever.
--
-- 🔴 NUNCA CITE `wiu.id`. Em produção `wapi_instancia_usuarios` tem SÓ duas colunas, com chave
-- primária composta. A migration que a descreve com `id` (20260701000000) é `create table if
-- not exists` sobre uma tabela que já existia — nunca chegou a rodar.
--
-- 🔴 A CERCA DE NÚMERO É UM `AND` DE TOPO, e não uma cópia dentro de cada ramo. Repetir a
-- condição em quatro lugares é convidar um deles a ficar para trás na próxima alteração — foi
-- assim que o cerco de plano saiu pela metade em `obra_contatos` (20260830100500).
--
-- `is_admin()` SAI. Já era letra morta: mora dentro do `AND c.empresa_id = get_my_empresa_id()`,
-- e o administrador global não tem empresa (conferido: `empresa_id` nulo, um único registro),
-- então a comparação dava nulo e a função inteira dava falso antes de o termo ser lido. Sai
-- porque lê-se como porta dos fundos e abriria sozinha no dia em que alguém desse uma empresa
-- ao admin — contra a decisão de que ninguém escapa da regra.
create or replace function public.can_access_wa_conversa(_conversa_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  SELECT EXISTS (
    SELECT 1
    FROM whatsapp_conversas c
    WHERE c.id = _conversa_id
      -- A fronteira externa, intocada. É a que nunca vazou.
      AND c.empresa_id = get_my_empresa_id()
      -- A cerca de NÚMERO, nova. Vale para todos: vendedor, gestor, dono da empresa.
      AND (
        -- 🔴 Conversa sem número registrado (17 delas, anteriores à coluna existir) passa
        -- reto, com a regra de hoje. É o princípio de 20260827181625, escrito depois de 17
        -- conversas sumirem com cliente pagante esperando: nenhuma conversa some em silêncio.
        -- Elas não têm número a que pertencer; esconder por um dado que não existe seria
        -- esconder por chute.
        c.instancia_id IS NULL
        OR EXISTS (
          SELECT 1 FROM wapi_instancia_usuarios wiu
          WHERE wiu.instancia_id = c.instancia_id
            AND wiu.usuario_auth_id = auth.uid()
        )
      )
      -- Dentro do número, a regra de sempre. O Lucas escolheu manter a privacidade entre
      -- colegas do mesmo número: estar ligado não basta.
      AND (
        EXISTS (
          SELECT 1 FROM usuarios u
          WHERE u.user_id = auth.uid()
            AND u.role IN ('empresa', 'gestor')
        )
        OR EXISTS (
          SELECT 1 FROM whatsapp_conversa_responsaveis wcr
          WHERE wcr.conversa_id = c.id
            AND wcr.usuario_id = get_my_usuario_id()
        )
        OR NOT EXISTS (
          SELECT 1 FROM whatsapp_conversa_responsaveis wcr2
          WHERE wcr2.conversa_id = c.id
        )
      )
  );
$function$;

comment on function public.can_access_wa_conversa(uuid) is
  'Quem alcança uma conversa de WhatsApp. Três cercas, nesta ordem: a EMPRESA, o NÚMERO '
  '(wapi_instancia_usuarios — vale para todos, inclusive gestor e dono), e dentro do número a '
  'regra de responsável. Conversa sem instancia_id passa pela cerca do número de propósito: '
  'nenhuma conversa pode sumir em silêncio (20260827181625). 🔴 As duas famílias de id '
  'convivem aqui: usuario_auth_id casa com auth.uid(), usuario_id casa com get_my_usuario_id().';


-- ─── 2. FECHAR A PORTA DOS FUNDOS DA AUTO-ATRIBUIÇÃO ───────────────────────
--
-- 🔴 SEM ISTO A REGRA ACIMA É DECORATIVA. `whatsapp_conversa_responsaveis` tinha três políticas
-- PERMISSIVAS extras — `responsaveis_select`, `responsaveis_insert`, `responsaveis_delete` —
-- que checavam SÓ a empresa. Permissivas se somam com OR, então a mais frouxa vencia: qualquer
-- pessoa da empresa se inseria como responsável de qualquer conversa e atravessava a cerca
-- nova pelo ramo "sou responsável".
--
-- 🔴 ELAS NÃO EXISTEM EM MIGRATION NENHUMA. Foram criadas à mão, direto no banco — verificado
-- por varredura em supabase/migrations/. É o mesmo caminho que fez a `webhook_debug` nascer sem
-- proteção e vazar a chave do WhatsApp (SPEC.md §11.1). O texto exato delas está no cabeçalho
-- deste arquivo, como script de volta.
--
-- O que fica no lugar: nada novo. `wa_conversa_responsaveis_access` já cobre os quatro comandos
-- e agora ancora na função corrigida. "Assumir" continua funcionando — só que sobre o conjunto
-- de conversas que a pessoa realmente alcança.
drop policy if exists responsaveis_select on public.whatsapp_conversa_responsaveis;
drop policy if exists responsaveis_insert on public.whatsapp_conversa_responsaveis;
drop policy if exists responsaveis_delete on public.whatsapp_conversa_responsaveis;


-- ─── 3. QUEM PODE *RECEBER* UMA CONVERSA ───────────────────────────────────
--
-- `wa_conversa_responsaveis_access` pergunta "EU alcanço esta conversa?", nunca "a pessoa que
-- estou atribuindo alcança?". Um gestor podia direcionar uma conversa para quem não atende
-- aquele número: a linha era criada, a conversa ganhava dono e SAÍA DA FILA para todo mundo —
-- e o dono não a via. Conversa ativa, com dono, invisível para o dono e para os outros. É o
-- mesmo desfecho de 20260827181625, com cliente esperando resposta.
create or replace function public.wa_responsavel_alcanca_conversa(
  _usuario_id uuid,
  _conversa_id uuid
)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  -- SECURITY DEFINER porque precisa ler o vínculo de TERCEIRO, que a política de
  -- `wapi_instancia_usuarios` não mostraria a um vendedor.
  --
  -- 🔴 Recebe `usuarios.id` (a família da coluna whatsapp_conversa_responsaveis.usuario_id) e
  -- faz a ponte para `auth.users` por `usuarios.user_id`. É a mesma ponte de 20260721150000.
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_conversas c
    WHERE c.id = _conversa_id
      AND (
        c.instancia_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM wapi_instancia_usuarios wiu
          JOIN usuarios u ON u.user_id = wiu.usuario_auth_id
          WHERE wiu.instancia_id = c.instancia_id
            AND u.id = _usuario_id
        )
      )
  );
$function$;

revoke all on function public.wa_responsavel_alcanca_conversa(uuid, uuid) from public, anon;
grant execute on function public.wa_responsavel_alcanca_conversa(uuid, uuid) to authenticated;

-- 🔴 RESTRITIVA, não permissiva. Restritiva soma com AND: nenhuma política permissiva futura
-- — nem outra criada à mão — consegue passar por cima dela. É o padrão que o cerco de plano
-- já usa (20260830100500).
--
-- `with check` em INSERT RECUSA com erro 42501, não filtra em silêncio (a diferença que
-- 20260830110000 documenta). A tela precisa usar `mensagemDeErro` para a frase aparecer:
-- erro do Supabase não é `Error` (CLAUDE.md §4.6).
drop policy if exists wa_responsaveis_so_quem_atende_o_numero on public.whatsapp_conversa_responsaveis;
create policy wa_responsaveis_so_quem_atende_o_numero
  on public.whatsapp_conversa_responsaveis
  as restrictive
  for insert
  to authenticated
  with check (public.wa_responsavel_alcanca_conversa(usuario_id, conversa_id));


-- ─── 4. DOIS ENDURECIMENTOS BARATOS ────────────────────────────────────────
--
-- (a) `wa_mensagens_access` deixava QUALQUER UM DA EMPRESA escrever nota interna dentro de uma
--     conversa que não pode ler — o `using` cobrava a função, mas o `with check` cobrava só a
--     empresa. Passa a cobrar a mesma função, que é estritamente mais forte (ela já exige a
--     empresa). Não quebra `useWaAddNota`: quem escreve nota é quem está com a conversa aberta.
drop policy if exists wa_mensagens_access on public.whatsapp_mensagens;
create policy wa_mensagens_access
  on public.whatsapp_mensagens
  for all
  using (public.can_access_wa_conversa(conversa_id))
  with check (public.can_access_wa_conversa(conversa_id));

-- (b) A chave primária de `wapi_instancia_usuarios` começa por `instancia_id`, então a consulta
--     nova — que busca por `usuario_auth_id` — não usaria índice nenhum. São 32 linhas hoje,
--     irrelevante isolado; relevante multiplicado pelas 69.435 mensagens que passam pela
--     função. A função já é o gargalo do módulo ("5 subconsultas cada", 20260805184506).
create index if not exists idx_wapi_instancia_usuarios_usuario
  on public.wapi_instancia_usuarios (usuario_auth_id);


-- ─── O QUE HERDA O CONSERTO SEM UMA LINHA A MAIS ───────────────────────────
--
-- Tudo que já chamava a função: `wa_conversas_access`, `wa_mensagens_access`,
-- `wa_conversa_responsaveis_access`, `wa_conversa_visualizacoes_*`, a busca `wa_buscar_mensagens`
-- e a trava de sequestro de `wa_iniciar_conversa`. É o benefício de a regra viver num lugar só.
--
-- No app, `useWaConversas` e `useUnreadWaMessages` encolhem sozinhos: filtram por empresa EM
-- CIMA da RLS, não no lugar dela.
--
-- ⚠️ FICA INCOERENTE DE PROPÓSITO, e alguém vai notar: `dashboard_whatsapp_stats` é
-- SECURITY DEFINER, decide autorização uma vez e conta a empresa inteira para gestor/dono.
-- Devolve só contagem e tempo médio, nunca conteúdo. Mexer nela é decisão de produto ("o gestor
-- acompanha a equipe inteira ou só o número dele?") — migration separada, com o Lucas.
