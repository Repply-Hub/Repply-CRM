-- Escolher QUAL preset é o padrão — pela tela de admin
--
-- Faltava a terceira peça. A tarefa 7 entregou criar preset e apontar empresa para um
-- preset, mas `is_padrao` só era LIDO: nascia `false` em todo preset novo e nunca mudava.
-- O único padrão era o semeado em 21/08, sem caminho de volta que não fosse mexer no banco.
--
-- O QUE "PADRÃO" SIGNIFICA AQUI, medido em 23/08/2026:
--
--   · `empresas.secao_preset_id` é nulável de propósito, sem valor automático e sem gatilho.
--     Empresa nova nasce NULA e cai no padrão (ver `empresa_tem_secao`).
--   · As 8 empresas de hoje apontam EXPLICITAMENTE para um preset — zero dependem do padrão.
--
-- Somando os dois: trocar o padrão **não mexe em nenhum cliente atual**. Ele decide o que o
-- PRÓXIMO assinante recebe no primeiro dia. É por isso que esta função é segura de rodar e
-- por isso que a tela precisa dizer exatamente isso — senão o aviso ou assusta à toa, ou
-- passa a impressão errada de que nada acontece.

create or replace function public.admin_definir_preset_padrao(p_preset_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode escolher o preset padrão';
  end if;

  if not exists (select 1 from secao_presets where id = p_preset_id) then
    raise exception 'Preset não encontrado';
  end if;

  -- Dois comandos, e a ordem importa. Existe um índice único parcial
  -- (`secao_presets_um_padrao_so`, em 20260821174845) que só admite UMA linha com
  -- `is_padrao`. Marcar o novo antes de desmarcar o velho violaria o índice.
  --
  -- Funciona porque índice único é conferido ao fim de CADA comando, não a cada linha: o
  -- primeiro update deixa zero padrões, o segundo cria um. Estado intermediário sem padrão
  -- nenhum existe, mas só dentro desta transação.
  update secao_presets set is_padrao = false, updated_at = now() where is_padrao;
  update secao_presets set is_padrao = true,  updated_at = now() where id = p_preset_id;
end;
$$;

revoke all on function public.admin_definir_preset_padrao(uuid) from public, anon;
grant execute on function public.admin_definir_preset_padrao(uuid) to authenticated;

-- A listagem passa a dizer quantas empresas dependem do padrão por OMISSÃO — quantas seriam
-- realmente afetadas por uma troca, em vez de deixar a tela adivinhar. Hoje esse número é 0.
--
-- É diferente de `empresas_seguindo`, que soma as apontadas explicitamente MAIS as omissas:
-- aquele responde "quem segue este preset", este responde "quem muda se eu trocar o padrão".
drop function if exists public.admin_listar_presets();

create or replace function public.admin_listar_presets()
returns table (
  id                 uuid,
  nome               text,
  descricao          text,
  is_padrao          boolean,
  empresas_seguindo  bigint,
  empresas_por_omissao bigint,
  secoes_ligadas     bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode ver os presets';
  end if;

  return query
  select p.id,
         p.nome,
         p.descricao,
         p.is_padrao,
         (select count(*) from empresas e
           where e.secao_preset_id = p.id
              or (e.secao_preset_id is null and p.is_padrao)),
         (select count(*) from empresas e
           where e.secao_preset_id is null and p.is_padrao),
         (select count(*) from secao_preset_itens i
           where i.preset_id = p.id and i.habilitada)
    from secao_presets p
   order by p.is_padrao desc, p.nome;
end;
$$;

revoke all on function public.admin_listar_presets() from public, anon;
grant execute on function public.admin_listar_presets() to authenticated;
