-- Devolve as 12 conversas de WhatsApp da base de demonstração a quem apresenta.
--
-- ============================================================================
-- A CAUSA — e não é a que parecia
-- ============================================================================
--
-- O sintoma: a seção de WhatsApp da empresa "Repply" (a base de demonstração)
-- aparece vazia para o "Usuario teste", com a frase "Você ainda não atende
-- nenhum número".
--
-- 🔴 A FRASE APONTA PARA O LADO ERRADO. Ela é só a REDAÇÃO que a tela escolhe
--    quando a lista já está vazia (WhatsAppInbox.tsx, `semNumero`); não é o
--    motivo do vazio. Como a empresa de demonstração não tem número nenhum
--    conectado, todo mundo recebe essa redação, aconteça o que acontecer.
--
-- 🔴 E `instancia_id` NULO TAMBÉM NÃO É A CAUSA. A regra de visibilidade por
--    número (20260902170000) deixa passar de propósito a conversa sem número
--    registrado — está escrito lá, com o motivo: "nenhuma conversa some em
--    silêncio", lição de 20260827181625. Confirmado em 10/09/2026 que essa é a
--    regra viva no banco, não só no repositório.
--
-- A causa real: AS 12 CONVERSAS TÊM DONO, E O DONO É UM FANTASMA.
--
--   O semeador (scripts/seed-demo-repply.sql, 31/08/2026) sorteou o responsável
--   de cada conversa entre os cinco vendedores fictícios. Esses cinco existem
--   como linha em `usuarios`, mas com `user_id` NULO de propósito: são gente que
--   NÃO CONSEGUE ENTRAR no sistema.
--
--   A cerca de responsável (de 22/07/2026, anterior à mudança de 02/09) diz que
--   você alcança a conversa se: for gestor/dono da empresa, OU for o
--   responsável, OU a conversa não tiver responsável. Um vendedor comum falha
--   nas três: 0 de 12.
--
--   Ou seja: as 12 nasceram invisíveis para vendedor em 31/08. Não é regressão
--   de 03/09 — só ninguém tinha entrado como vendedor até a conta de teste ser
--   criada, em 09/09/2026.
--
-- Medido em 10/09/2026, projeto hukeirrmsoiowvvrhivx:
--   conversas na empresa demo ................................. 12
--   conversas SEM responsável ................................. 0 de 12
--   responsáveis que conseguem entrar no sistema .............. 0 de 12
--   números conectados na empresa demo ........................ 0
--
-- ============================================================================
-- O QUE ESTE SCRIPT FAZ — decisão do Lucas em 10/09/2026 ("espelhar uma equipe")
-- ============================================================================
--
--   4 conversas ... passam para o "Usuario teste" ....... "Atribuídos a mim"
--   4 conversas ... ficam SEM dono ...................... "Não atribuídos"
--   4 conversas ... não se toca, seguem com os fictícios  "Outros atendentes"
--
-- Depois disso:
--   · vendedor (Usuario teste) enxerga 8 das 12, em dois grupos, com 8 não lidas
--   · dono/gestor da empresa enxerga as 12, nos três grupos
--
-- Linhas alteradas: 8 apagadas e 4 criadas em `whatsapp_conversa_responsaveis`.
-- NENHUMA mensagem é tocada. NENHUMA conversa é apagada. Só muda de quem é.
--
-- ============================================================================
-- DUAS CONSEQUÊNCIAS QUE VOCÊ VAI VER, E SÃO ESPERADAS
-- ============================================================================
--
-- 1. O gráfico "Conversas atribuídas por responsável" vai passar de 12 para 16
--    atribuições, e "Usuario teste" vai aparecer nele com 4.
--    Isso é o comportamento correto, não um efeito colateral: aquela tabela
--    (`whatsapp_conversa_atribuicoes`) é um registro histórico só-de-acréscimo
--    (20260903160000). A conversa REALMENTE caiu no colo da Larissa em 31/08 e
--    REALMENTE muda de dono hoje. Este script não apaga histórico.
--
-- 2. A tarja âmbar "Você não atende nenhum número" continua aparecendo dentro
--    de cada conversa aberta, porque a empresa de demonstração de fato não tem
--    número conectado. O Lucas decidiu em 10/09/2026 deixar assim por enquanto:
--    a tarja é honesta — o envio realmente não funciona nessa base.
--
-- ============================================================================
-- 🔴 ENSAIE ANTES. É a mesma corrida, sem gravar nada.
-- ============================================================================
--
-- O arquivo inteiro está dentro de `begin; ... commit;`. Para ENSAIAR:
--
--   1. cole o arquivo todo no SQL Editor
--   2. TROQUE a última linha, `commit;`, por `rollback;`
--   3. rode
--
-- Você vê as travas passarem (ou abortarem), a tabela de cópia se formar e as
-- DUAS conferências do PASSO 4 com o resultado final — e o banco volta ao que
-- era, sem uma linha alterada.
--
-- Se o ensaio mostrar o quadro esperado, rode de novo com `commit;` no lugar.
--
-- ─── O ENSAIO JÁ FOI FEITO UMA VEZ, EM 10/09/2026 ──────────────────────────
--
-- O miolo do PASSO 3 (o `delete` e o `insert`) foi rodado contra o banco de
-- produção dentro de uma transação desfeita, e a medição foi feita ATRAVESSANDO
-- A RLS como cada usuário de verdade (`set local role authenticated` com o
-- `sub` de cada um). Resultado:
--
--                                    antes          depois do ensaio
--   Usuario teste (vendedor) ......  0 conversas    8 conversas / 8 não lidas
--                                                   (4 "Não atribuídos" + 4 "Atribuídos a mim")
--   Repply Suporte (empresa) ......  12 / 9         12 / 9  (não muda, e não devia)
--
-- Depois do `rollback`, conferido: 12 linhas de responsável, 12 donos fantasmas,
-- nenhuma tabela de cópia. O banco ficou como estava.
--
-- ⚠️ O que o ensaio NÃO exercitou: o PASSO 0 (travas), o PASSO 1 (tabela de
--    cópia) e o PASSO 4 (conferências) — o ensaio pulou a criação de tabela.
--    Por isso o ensaio com `rollback;` acima continua valendo a pena antes do
--    `commit;`: é ele que exercita o arquivo INTEIRO.
--
-- ============================================================================
-- COMO DESFAZER (rode isto se algo sair errado)
-- ============================================================================
--
--   -- volta as 8 linhas apagadas, com o dono e a data que tinham
--   insert into whatsapp_conversa_responsaveis (id, conversa_id, usuario_id, created_at)
--   select b.linha_responsavel_antes, b.conversa_id, b.dono_antes, b.dono_antes_desde
--     from backup_wa_donos_demo_20260910 b
--    where b.destino in ('fila','minhas');
--
--   -- tira as 4 que este script criou
--   delete from whatsapp_conversa_responsaveis r
--    using backup_wa_donos_demo_20260910 b
--    where r.conversa_id = b.conversa_id
--      and r.usuario_id  = b.dono_depois
--      and b.destino     = 'minhas';
--
--   ⚠️ O desfazer NÃO limpa o registro histórico de atribuições — nem deve: ele é
--      só-de-acréscimo por desenho. O gráfico ficará com 20 atribuições. Se isso
--      incomodar na demonstração, apague à mão SÓ as da empresa demo criadas
--      hoje:
--      delete from whatsapp_conversa_atribuicoes
--       where empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
--         and atribuido_em::date = current_date;
--
-- DEPOIS DE CONFERIR, a cópia pode ser removida:
--   drop table backup_wa_donos_demo_20260910;
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PASSO 0 — as duas travas. Aborta antes de escrever qualquer coisa.
-- ---------------------------------------------------------------------------
do $$
begin
  -- (a) empresa certa, e é mesmo a de demonstração
  if not exists (
    select 1 from empresas
     where id = '9b17bfdf-f631-4af6-9471-a68411909a04'
       and nome = 'Repply'
  ) then
    raise exception 'Empresa errada ou renomeada — script abortado.';
  end if;

  -- (b) 🔴 A TRAVA QUE IMPORTA: quem vai RECEBER as conversas precisa conseguir
  --     ENTRAR no sistema. Dar a conversa a alguém sem login é exatamente o
  --     defeito que este script existe para consertar — não pode acontecer de
  --     novo por descuido.
  if not exists (
    select 1
      from usuarios u
      join auth.users a on a.id = u.user_id
     where u.id = 'bd65949c-83bd-428a-a916-28d8d049e230'
       and u.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
  ) then
    raise exception 'O "Usuario teste" não existe, mudou de empresa ou perdeu o login. Nada foi alterado.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 1 — o plano, a cópia e o desfazer na mesma tabela.
--
-- `dono_antes` e `dono_antes_desde` são LIDOS do banco, não digitados: é o que
-- o desfazer usa para reconstruir a linha exata.
-- ---------------------------------------------------------------------------
create table backup_wa_donos_demo_20260910 as
select
  c.id                as conversa_id,
  c.telefone,
  c.nome_contato,
  r.id                as linha_responsavel_antes,
  r.usuario_id        as dono_antes,
  r.created_at        as dono_antes_desde,
  plano.destino,
  plano.dono_depois,
  now()               as copiado_em
from whatsapp_conversas c
left join whatsapp_conversa_responsaveis r
       on r.conversa_id = c.id
join (values
  -- conversa                                     destino    quem passa a ser o dono
  ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'minhas', 'bd65949c-83bd-428a-a916-28d8d049e230'::uuid), -- Ana Ferreira      (2 não lidas)
  ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'outros', null::uuid),                                   -- Carlos Tavares    → segue com a Beatriz
  ('aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'minhas', 'bd65949c-83bd-428a-a916-28d8d049e230'::uuid), -- Débora Lins       (1 não lida)
  ('aaaaaaaa-0000-4000-8000-000000000004'::uuid, 'fila',   null::uuid),                                   -- Eduardo Pontes    → fila
  ('aaaaaaaa-0000-4000-8000-000000000005'::uuid, 'fila',   null::uuid),                                   -- Flávia Maia       → fila (3 não lidas)
  ('aaaaaaaa-0000-4000-8000-000000000006'::uuid, 'minhas', 'bd65949c-83bd-428a-a916-28d8d049e230'::uuid), -- Gustavo Bezerra
  ('aaaaaaaa-0000-4000-8000-000000000007'::uuid, 'outros', null::uuid),                                   -- Isabela Rocha     → segue com a Larissa
  ('aaaaaaaa-0000-4000-8000-000000000008'::uuid, 'fila',   null::uuid),                                   -- João Vitorino     → fila (2 não lidas, "orçamento urgente")
  ('aaaaaaaa-0000-4000-8000-000000000009'::uuid, 'outros', null::uuid),                                   -- Karina Melo       → segue com a Helena (gestora)
  ('aaaaaaaa-0000-4000-8000-000000000010'::uuid, 'fila',   null::uuid),                                   -- Depósito Cidade Alta → fila
  ('aaaaaaaa-0000-4000-8000-000000000011'::uuid, 'outros', null::uuid),                                   -- Mariana Duarte    → segue com a Beatriz
  ('aaaaaaaa-0000-4000-8000-000000000012'::uuid, 'minhas', 'bd65949c-83bd-428a-a916-28d8d049e230'::uuid)  -- Nelson Aguiar
) as plano(conversa_id, destino, dono_depois)
  on plano.conversa_id = c.id
where c.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';

alter table backup_wa_donos_demo_20260910 enable row level security;

-- ---------------------------------------------------------------------------
-- PASSO 2 — aborta se o quadro não for exatamente o que foi medido.
-- ---------------------------------------------------------------------------
do $$
declare
  n int; n_minhas int; n_fila int; n_outros int; sem_linha int; com_login int;
begin
  select count(*) into n from backup_wa_donos_demo_20260910;
  if n <> 12 then
    raise exception 'Esperava 12 conversas, achei %. Nada foi alterado.', n;
  end if;

  select count(*) filter (where destino = 'minhas'),
         count(*) filter (where destino = 'fila'),
         count(*) filter (where destino = 'outros')
    into n_minhas, n_fila, n_outros
    from backup_wa_donos_demo_20260910;
  if (n_minhas, n_fila, n_outros) <> (4, 4, 4) then
    raise exception 'O plano deveria ser 4/4/4, veio %/%/%. Nada foi alterado.', n_minhas, n_fila, n_outros;
  end if;

  -- Toda conversa tinha exatamente um dono. Se alguma já estiver livre, o estado
  -- mudou desde a medição e o desfazer não reconstruiria a linha.
  select count(*) into sem_linha
    from backup_wa_donos_demo_20260910 where linha_responsavel_antes is null;
  if sem_linha > 0 then
    raise exception '% conversa(s) já estão sem dono — o banco mudou desde a medição. Nada foi alterado.', sem_linha;
  end if;

  -- 🔴 CONFIRMA A CAUSA ANTES DE AGIR: todos os donos de hoje são gente sem
  --    login. Se algum já tiver login, o quadro não é o diagnosticado e alguém
  --    mexeu nisso — parar é mais barato que descobrir depois.
  select count(*) into com_login
    from backup_wa_donos_demo_20260910 b
    join usuarios u on u.id = b.dono_antes
   where u.user_id is not null;
  if com_login > 0 then
    raise exception '% conversa(s) já têm dono com login — não é o quadro medido. Nada foi alterado.', com_login;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3 — a troca de dono.
--
-- Apaga pelo `id` EXATO da linha copiada, não por (conversa, usuário): se algo
-- tiver sido inserido entre a cópia e agora, esta linha nova não é atingida.
-- ---------------------------------------------------------------------------
delete from whatsapp_conversa_responsaveis r
 using backup_wa_donos_demo_20260910 b
 where r.id = b.linha_responsavel_antes
   and b.destino in ('fila', 'minhas');

-- As 4 de "minhas" ganham o vendedor que realmente entra.
-- `created_at` fica no padrão (agora): a atribuição está acontecendo agora, e o
-- registro histórico deve dizer a verdade.
insert into whatsapp_conversa_responsaveis (conversa_id, usuario_id)
select b.conversa_id, b.dono_depois
  from backup_wa_donos_demo_20260910 b
 where b.destino = 'minhas';

-- ---------------------------------------------------------------------------
-- PASSO 4 — conferência. Esperado: 12 linhas, coluna `ok` toda true.
-- ---------------------------------------------------------------------------
select
  b.telefone,
  b.nome_contato,
  b.destino,
  coalesce(ant.nome, '—')                                  as dono_antes,
  coalesce(dep.nome, '(sem dono — vai para a fila)')        as dono_agora,
  c.nao_lidas,
  case b.destino
    when 'minhas' then dep.id = 'bd65949c-83bd-428a-a916-28d8d049e230'
    when 'fila'   then dep.id is null
    when 'outros' then dep.id = b.dono_antes
  end                                                       as ok
from backup_wa_donos_demo_20260910 b
join whatsapp_conversas c on c.id = b.conversa_id
left join usuarios ant on ant.id = b.dono_antes
left join lateral (
  select u.id, u.nome
    from whatsapp_conversa_responsaveis r
    join usuarios u on u.id = r.usuario_id
   where r.conversa_id = b.conversa_id
   limit 1
) dep on true
order by c.ultima_mensagem_at desc;

-- Resumo: o que cada perfil passa a enxergar.
-- Esperado: vendedor = 8 conversas / 8 não lidas; dono e gestor = 12 / 9.
select
  'vendedor (Usuario teste)' as perfil,
  count(*)                   as conversas_visiveis,
  sum(c.nao_lidas)           as nao_lidas
from whatsapp_conversas c
where c.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
  and (
    not exists (select 1 from whatsapp_conversa_responsaveis r where r.conversa_id = c.id)
    or exists (select 1 from whatsapp_conversa_responsaveis r
                where r.conversa_id = c.id
                  and r.usuario_id = 'bd65949c-83bd-428a-a916-28d8d049e230')
  )
union all
select
  'dono / gestor da empresa',
  count(*),
  sum(c.nao_lidas)
from whatsapp_conversas c
where c.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04';

commit;
