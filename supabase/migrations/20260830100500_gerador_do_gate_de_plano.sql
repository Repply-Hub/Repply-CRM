-- ⚠️ HISTORICO: este arquivo ja nasceu corrigido, mas a producao viu duas versoes.
-- A primeira aplicacao (29/08/2026) filtrava so por `authenticated` e deixou 10 tabelas de
-- fora — entre elas whatsapp_mensagens e whatsapp_conversas. O ensaio pegou antes de trancar
-- nada, e a correcao foi aplicada em producao sob o nome
-- `gerador_do_gate_enxerga_politicas_de_public`. Por isso o historico remoto tem uma entrada
-- a mais que esta pasta. Reconstruir o banco a partir DESTES arquivos da o resultado certo:
-- este arquivo ja e a versao corrigida.

-- Aplica o bloqueio por falta de pagamento em toda tabela do inquilino que ainda não o tenha.
--
-- 🔴 POR QUE UM GERADOR, E NÃO UMA LISTA ESCRITA À MÃO.
-- O gate nasceu em 20260803140402 cobrindo 5 tabelas. Em 27/08/2026 ele foi copiado à mão
-- para `obra_contatos` e SAIU PELA METADE — só INSERT, sem UPDATE. Quatro semanas depois de
-- existir. Lista que alguém mantém falha; rotina que confere, não.
--
-- 🔴 O `(SELECT ...)` EM VOLTA DA CHAMADA NÃO É ESTILO. Ele faz o planner tratar o resultado
-- como InitPlan e avaliar UMA VEZ POR COMANDO, em vez de uma vez por linha. Medido nesta base:
-- 1,7 ms por comando, mesmo varrendo 60.188 linhas. Sem o SELECT, isto viraria a armadilha do
-- CLAUDE.md §7.9, que já transformou 4 ms em 16 segundos noutra função.
--
-- Idempotente de propósito: pode rodar todo dia sem efeito colateral. Política que já existe é
-- pulada, e não recriada — recriar tomaria trava exclusiva na tabela sem necessidade.
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
      -- Só tabela com RLS ligada. Sem RLS, política nenhuma é avaliada e criar uma daria
      -- falsa sensação de proteção.
      and c.relrowsecurity
      and not (c.relname = any (v_fora))
      -- Só tabela que de fato aceita escrita de usuário logado. Tabela que só o servidor
      -- escreve não precisa de gate — e criar um ali só adiciona ruído.
      --
      -- 🔴 `public` CONTA COMO USUÁRIO LOGADO, e esquecer isso custou caro no ensaio de
      -- 29/08/2026: a primeira versão desta consulta procurava só `authenticated` e deixou
      -- 10 tabelas de fora — entre elas `whatsapp_mensagens` (60 mil linhas) e
      -- `whatsapp_conversas`, o módulo inteiro que o bloqueio existe para travar.
      --
      -- No Postgres, política concedida a `public` vale para TODOS os papéis, o que inclui
      -- `authenticated`. Metade das políticas antigas deste projeto foi escrita sem o `TO`
      -- explícito, e o Postgres gravou `{public}` — então filtrar por `authenticated` só
      -- enxerga as políticas mais novas.
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

      -- INSERT usa WITH CHECK (a linha ainda não existe); UPDATE e DELETE usam USING.
      if v_cmd = 'INSERT' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated
             with check ((select public.empresa_plano_ativo()))',
          v_nome, r_tabela.nome);
      else
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated
             using ((select public.empresa_plano_ativo()))',
          v_nome, r_tabela.nome, v_cmd);
      end if;

      tabela := r_tabela.nome; politica := v_nome; acao := 'criada';
      return next;
    end loop;
  end loop;
end;
$$;

comment on function public.aplicar_gate_de_plano() is
  'Cria as politicas restritivas de bloqueio por falta de pagamento nas tabelas que ainda nao as tem. Idempotente.';

revoke all on function public.aplicar_gate_de_plano() from public, anon, authenticated;
grant execute on function public.aplicar_gate_de_plano() to service_role;
