-- Conserta o nome de grupo que o webhook sobrescreveu com o nome de quem enviou.
--
-- ============================================================================
-- 🔴 ORDEM IMPORTA: PUBLIQUE A FUNÇÃO `whatsapp-webhook` ANTES DE RODAR ISTO.
--
-- O defeito está no webhook (commit 1bf9fc0e): em grupo, quando a uazapi manda
-- o pacote sem o nome do grupo, ele caía em `msg.senderName` — o participante
-- que enviou. Rodar este script com a função antiga ainda no ar conserta o
-- nome, e a próxima mensagem degradada estraga de novo.
-- ============================================================================
--
-- O QUE ELE FAZ, EM UMA FRASE
--   Uma linha: a conversa 47f2a7f1-9218-4f73-a2fe-396c7cafad3a, da JHS, volta
--   a se chamar "Carteira 01" em vez de "Crispim Santana".
--
-- DE ONDE VEM O NOME CERTO — e por que não é palpite meu
--   A JHS tem DOIS números dentro do mesmo grupo, e a conversa é por número
--   (uma linha por instância). A linha do outro número recebeu o pacote bom e
--   guarda o nome de verdade. O script LÊ o nome de lá; ele não está escrito
--   aqui dentro. Se a linha irmã sumir ou mudar, o script aborta em vez de
--   inventar.
--
-- COMO DESFAZER (rode isto se algo sair errado)
--   update whatsapp_conversas c
--      set nome_contato = b.nome_antes
--     from backup_nome_grupo_20260909 b
--    where c.id = b.id;
--
-- DEPOIS DE CONFERIR, a cópia pode ser removida:
--   drop table backup_nome_grupo_20260909;

begin;

-- ---------------------------------------------------------------------------
-- PASSO 0 — trava de empresa. Aborta se não for a JHS.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from empresas
    where id = '9ad7723e-a9ba-4608-b961-72b9bdeabcbe'
      and nome = 'JHS Representações Limitada'
  ) then
    raise exception 'Empresa errada ou renomeada — script abortado.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 1 — plano, cópia e desfazer na mesma tabela.
--
-- `nome_certo` é LIDO da linha irmã (mesmo grupo, mesma empresa, outra
-- instância). Nada aqui é digitado à mão.
-- ---------------------------------------------------------------------------
create table backup_nome_grupo_20260909 as
select
  errada.id,
  errada.telefone,
  errada.nome_contato as nome_antes,
  certa.nome_contato  as nome_certo,
  now() as copiado_em
from whatsapp_conversas errada
join whatsapp_conversas certa
  on  certa.telefone    = errada.telefone
  and certa.empresa_id  = errada.empresa_id
  and certa.id         <> errada.id
where errada.id = '47f2a7f1-9218-4f73-a2fe-396c7cafad3a'
  and errada.empresa_id = '9ad7723e-a9ba-4608-b961-72b9bdeabcbe'
  -- A linha errada é a que tem uma mensagem cujo REMETENTE se chama igual ao
  -- grupo: é a assinatura exata do defeito.
  and exists (
    select 1 from whatsapp_mensagens m
    where m.conversa_id = errada.id
      and m.remetente_nome = errada.nome_contato
  )
  -- Nome que alguém escreveu à mão não se toca.
  and errada.nome_contato_editado_manualmente = false;

alter table backup_nome_grupo_20260909 enable row level security;

-- ---------------------------------------------------------------------------
-- PASSO 2 — aborta se o quadro não for exatamente o esperado.
-- ---------------------------------------------------------------------------
do $$
declare n int; vazio int;
begin
  select count(*) into n from backup_nome_grupo_20260909;
  if n <> 1 then
    raise exception 'Esperava 1 conversa para corrigir, achei %. Nada foi alterado.', n;
  end if;

  select count(*) into vazio from backup_nome_grupo_20260909
   where coalesce(trim(nome_certo), '') = '' or nome_certo = nome_antes;
  if vazio > 0 then
    raise exception 'O nome de referencia esta vazio ou igual ao errado. Nada foi alterado.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3 — a correção, condicionada ao valor de antes.
--
-- NÃO marcamos `nome_contato_editado_manualmente`: congelar o nome impediria
-- uma renomeação legítima do grupo de chegar aqui um dia. A proteção de verdade
-- é o conserto no webhook — este script só limpa o estrago que já aconteceu.
-- ---------------------------------------------------------------------------
update whatsapp_conversas c
   set nome_contato = b.nome_certo,
       updated_at   = now()
  from backup_nome_grupo_20260909 b
 where c.id = b.id
   and c.nome_contato = b.nome_antes;

-- ---------------------------------------------------------------------------
-- PASSO 4 — conferência. Esperado: uma linha, `ok` = true.
-- ---------------------------------------------------------------------------
select b.telefone,
       b.nome_antes,
       b.nome_certo,
       c.nome_contato as nome_agora,
       (c.nome_contato = b.nome_certo) as ok
from backup_nome_grupo_20260909 b
join whatsapp_conversas c on c.id = b.id;

commit;
