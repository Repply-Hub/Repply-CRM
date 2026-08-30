-- 🔴 O BLOQUEIO FINGIA QUE SALVOU. Defeito introduzido por mim na etapa 1 (29/08/2026),
-- encontrado no levantamento da etapa 2 e medido no banco no mesmo dia.
--
-- ═══ O QUE ACONTECIA ═══
--
-- Empresa bloqueada, com a identidade real de um usuário dela, medido em produção dentro de
-- uma transação desfeita:
--
--     INSERT -> recusado com erro 42501        ✅ certo
--     UPDATE -> SEM ERRO, 0 linhas alteradas   🔴 finge
--     DELETE -> sem erro, 0 linhas
--
-- A pessoa abria um negócio, mudava o valor, clicava em salvar, o app respondia "salvo" — e
-- nada era gravado. Ela só descobria ao recarregar e ver o número velho.
--
-- ═══ A CAUSA: `USING` FILTRA, `WITH CHECK` RECUSA ═══
--
-- É a diferença entre as duas cláusulas de política do Postgres, e ela não aparece na leitura
-- casual porque ambas "bloqueiam":
--
--   USING       decide quais linhas o comando ENXERGA. Linha reprovada é pulada em silêncio —
--               o comando termina com sucesso e zero linhas afetadas.
--   WITH CHECK  decide se a linha RESULTANTE é permitida. Reprovada levanta erro 42501.
--
-- A política de INSERT já usava `with check` (INSERT não aceita `using`), e por isso ela era a
-- única das três que se comportava certo. As de UPDATE e DELETE saíram com `using`, que é o
-- que se escreve por reflexo — e é o que transforma o bloqueio numa mentira.
--
-- Isto se soma a uma armadilha que o `CLAUDE.md` já registra: no PostgREST, gravação que casa
-- zero linhas NÃO devolve erro. As duas juntas produzem o sucesso falso.
--
-- ═══ POR QUE O DELETE CONTINUA ASSIM ═══
--
-- O Postgres NÃO tem `WITH CHECK` para DELETE — não existe "linha resultante" para conferir.
-- Só `USING`. Então delete bloqueado continua afetando 0 linhas em silêncio, e não há como
-- consertar no nível da política.
--
-- Fica assim de propósito, e o efeito é benigno: nada é destruído. A tela remove a linha
-- otimisticamente, o recarregamento a traz de volta, e o pior caso é confusão — não perda.
-- O oposto do UPDATE, onde o que se perde é o trabalho que a pessoa acabou de digitar.
--
-- Se um dia isso incomodar, o caminho é gatilho `BEFORE DELETE`, não política.

-- ── 1. O gerador, para toda política de UPDATE que nascer daqui em diante ──────────────
create or replace function public.aplicar_gate_de_plano()
returns table (tabela text, politica text, acao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_tabela record;
  v_fora   text[] := public.tabelas_fora_do_gate();
  v_cmd    text;
  v_nome   text;
  v_existe boolean;
begin
  for r_tabela in
    select c.relname::text as nome
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and not (c.relname = any (v_fora))
      -- `public` conta como usuário logado: no Postgres, política concedida a `public` vale
      -- para todos os papéis. Filtrar só por `authenticated` deixou 10 tabelas de fora no
      -- ensaio de 29/08/2026, entre elas whatsapp_mensagens e whatsapp_conversas.
      and exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
          and (('authenticated' = any (p.roles)) or ('public' = any (p.roles)))
      )
    order by c.relname
  loop
    foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE']
    loop
      v_nome := r_tabela.nome || '_exige_plano_' || lower(v_cmd);

      select exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = r_tabela.nome and policyname = v_nome
      ) into v_existe;

      if v_existe then
        tabela := r_tabela.nome; politica := v_nome; acao := 'ja existia';
        return next;
        continue;
      end if;

      -- 🔴 INSERT e UPDATE usam WITH CHECK — é o que RECUSA com erro. DELETE só aceita
      -- USING, e por isso continua filtrando em silêncio (ver o cabeçalho).
      if v_cmd in ('INSERT', 'UPDATE') then
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated
             with check ((select public.empresa_plano_ativo()))',
          v_nome, r_tabela.nome, v_cmd);
      else
        execute format(
          'create policy %I on public.%I as restrictive for delete to authenticated
             using ((select public.empresa_plano_ativo()))',
          v_nome, r_tabela.nome);
      end if;

      tabela := r_tabela.nome; politica := v_nome; acao := 'criada';
      return next;
    end loop;
  end loop;
end;
$$;

-- ── 2. As 45 políticas de UPDATE que já existem ───────────────────────────────────────
-- Inclui as 4 nascidas em 20260803140402 (pedidos, clientes, contatos, obras), que têm o
-- mesmo nome e o mesmo defeito.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd = 'UPDATE'
      and policyname like '%\_exige\_plano\_update'
    order by tablename
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         with check ((select public.empresa_plano_ativo()))',
      r.policyname, r.tablename);
  end loop;
end $$;
