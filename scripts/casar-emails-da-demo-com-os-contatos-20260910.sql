-- Faz a caixa de e-mail da DEMONSTRAÇÃO conversar com os contatos dela.
--
-- ============================================================================
-- O PROBLEMA, medido em 10/09/2026
--
--   A base de demonstração foi semeada em duas metades que nunca se falaram:
--
--     · a caixa de e-mail tem 12 mensagens de "ana.ferreira@demo.exemplo.com.br",
--       "carlos.tavares@...", "eduardo.pontes@...", "mariana.duarte@..." e
--       "flavia.maia@...";
--     · os CONTATOS têm exatamente esses nomes — Ana Ferreira, Carlos Tavares,
--       Eduardo Pontes, Mariana Duarte, Flávia Maia — mas com e-mail NUMERADO
--       ("ana.23@", "carlos.10@"), gerado por outro pedaço do semeador.
--
--   Resultado: quem apresenta o produto abre um negócio e o histórico não
--   mostra e-mail nenhum, embora a caixa esteja cheia. Não é defeito do CRM —
--   é cadastro incoerente na própria demonstração.
--
-- O QUE ISTO FAZ
--   Corrige o e-mail de CINCO contatos, um por pessoa que aparece na caixa,
--   escolhendo em cada caso o contato com mais negócios. Ensaiado antes de
--   escrever: 35 negócios passam a ter histórico de e-mail, e em todos a
--   janela do negócio cobre a data das mensagens.
--
-- ONDE MEXE
--   Só na empresa Repply, a de demonstração. Cinco linhas de `contatos`.
--   Nada da MD, da JHS ou de qualquer cliente pagante é tocado.
--
-- COMO DESFAZER
--   update contatos c set email = b.email_antes
--     from backup_email_contatos_demo_20260910 b
--    where c.id = b.id;
--
--   E depois, se quiser: drop table backup_email_contatos_demo_20260910;
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PASSO 0 — trava de empresa. Aborta se não for a de demonstração.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from empresas
    where id = '9b17bfdf-f631-4af6-9471-a68411909a04' and nome = 'Repply'
  ) then
    raise exception 'A empresa de demonstracao nao e a esperada — abortado.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 1 — plano, cópia e desfazer na mesma tabela.
-- ---------------------------------------------------------------------------
create table backup_email_contatos_demo_20260910 as
with alvos(id, novo_email) as (values
  ('55555555-0000-4000-8000-000000000023'::uuid, 'ana.ferreira@demo.exemplo.com.br'),
  ('55555555-0000-4000-8000-000000000010'::uuid, 'carlos.tavares@demo.exemplo.com.br'),
  ('55555555-0000-4000-8000-000000000019'::uuid, 'eduardo.pontes@demo.exemplo.com.br'),
  ('55555555-0000-4000-8000-000000000013'::uuid, 'mariana.duarte@demo.exemplo.com.br'),
  ('55555555-0000-4000-8000-000000000002'::uuid, 'flavia.maia@demo.exemplo.com.br')
)
select ct.id,
       ct.nome_contato,
       ct.email      as email_antes,
       a.novo_email  as email_depois,
       now()         as copiado_em
from alvos a
join contatos ct on ct.id = a.id
-- 🔴 Trava dupla: o contato tem de ser da empresa de demonstração E o endereço
-- novo tem de ser de fato um que apareça na caixa dela. Sem a segunda, um id
-- errado escreveria um e-mail que não casa com nada e o script "passaria".
where ct.empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
  and exists (
    select 1 from email_mensagens m
    where m.conta_id = 'bbbbbbbb-0000-4000-8000-000000000001'
      and (
        lower(m.remetente_email) = a.novo_email
        or exists (
          select 1 from jsonb_array_elements(coalesce(m.destinatarios,'[]'::jsonb)) d
          where lower(d->>'email') = a.novo_email
        )
      )
  );

alter table backup_email_contatos_demo_20260910 enable row level security;

-- ---------------------------------------------------------------------------
-- PASSO 2 — aborta se não forem exatamente 5.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from backup_email_contatos_demo_20260910;
  if n <> 5 then
    raise exception 'Esperava 5 contatos, achei %. Nada foi alterado.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3 — a correção, condicionada ao valor de antes.
-- ---------------------------------------------------------------------------
update contatos ct
   set email = b.email_depois,
       updated_at = now()
  from backup_email_contatos_demo_20260910 b
 where ct.id = b.id
   and ct.email is not distinct from b.email_antes;

-- ---------------------------------------------------------------------------
-- PASSO 4 — conferência.
--
-- Esperado: 5 linhas com `ok` = true, e `negocios_com_email` somando 35.
-- ---------------------------------------------------------------------------
select b.nome_contato,
       c.empresa as cliente,
       b.email_antes,
       ct.email as email_agora,
       (ct.email = b.email_depois) as ok,
       (select count(*) from pedidos p where p.cliente_id = ct.cliente_id) as negocios_com_email
from backup_email_contatos_demo_20260910 b
join contatos ct on ct.id = b.id
join clientes c on c.id = ct.cliente_id
order by negocios_com_email desc;

commit;
