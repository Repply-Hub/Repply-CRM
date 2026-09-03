-- Fecha o acesso das 9 visões `v_md_*` a quem não é o servidor.
--
-- 🔴 O QUE ESTAVA ACONTECENDO: elas devolviam 1.310 registros de clientes da MD para um
-- visitante ANÔNIMO. Medido em 03/09/2026, com `set_config('role','anon')`:
--
--     select count(*) from v_md_base   ->  1310
--     select count(*) from v_md_final  ->  1310
--
-- POR QUE a proteção não pegava: as nove são `security_invoker = off` e pertencem ao
-- `postgres`. Nesse modo a visão lê as tabelas de baixo com o privilégio do DONO, e a regra
-- que separa uma empresa da outra (RLS) simplesmente não é aplicada. A permissão de leitura
-- estava concedida a `anon` e a `authenticated`, então bastava a chave pública do site — que
-- é pública por desenho, vai no próprio navegador — para baixar a carteira da MD sem senha.
--
-- Isso valia para `authenticated` também, e essa parte é pior do que parece: um gestor de
-- OUTRA empresa cliente da Repply lia os clientes da MD pelo mesmo caminho.
--
-- DE ONDE VIERAM: nenhuma migration as criou e nenhuma tela as usa (conferido com busca em
-- `src/` e em `supabase/functions/`). São resto do trabalho de relacionar as obras da MD,
-- criadas à mão no painel do Supabase — exatamente o anti-padrão do CLAUDE.md §6.2, o mesmo
-- caminho pelo qual a `webhook_debug` nasceu sem proteção e vazou a chave do WhatsApp.
--
-- 🔴 POR QUE REVOGAR E NÃO APAGAR — decisão do Lucas em 03/09/2026. O vazamento acaba com o
-- mesmo efeito prático das duas formas, mas revogar é REVERSÍVEL: se alguém consultava essas
-- visões por fora do sistema (Metabase, planilha ligada ao banco), o conserto é devolver a
-- permissão, não recriar nove visões cuja definição ninguém guardou em lugar nenhum.
--
-- PARA DESFAZER, se algo legítimo depender delas:
--     grant select on public.v_md_base to authenticated;   -- só a visão e só o papel que precisa
--
-- Repare que `anon` NUNCA deve voltar: é o papel de quem não fez login.
--
-- `service_role` fica intacto de propósito — é a chave do servidor, que existe para ter
-- acesso total e nunca chega ao navegador.

revoke all on public.v_md_arestas   from anon, authenticated;
revoke all on public.v_md_base      from anon, authenticated;
revoke all on public.v_md_dominio   from anon, authenticated;
revoke all on public.v_md_fatos     from anon, authenticated;
revoke all on public.v_md_final     from anon, authenticated;
revoke all on public.v_md_grupo     from anon, authenticated;
revoke all on public.v_md_migracao  from anon, authenticated;
revoke all on public.v_md_resultado from anon, authenticated;
revoke all on public.v_md_socio     from anon, authenticated;
