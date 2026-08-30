-- Fecha o DELETE em clientes, contatos, obra_contatos, obras e pedidos.
--
-- 🔴 ISTO INVERTE UMA DECISÃO ESCRITA E JUSTIFICADA, e a inversão precisa ficar registrada.
-- A migration 20260803140402_gate_plano_escrita.sql:19-22 diz, com todas as letras:
--   "DELETE também fica livre: impedir alguém de apagar os próprios dados não protege receita
--    nenhuma."
-- O Lucas decidiu o contrário em 29/08/2026: bloqueado passa a ser SÓ VER.
--
-- A razão dele é de retenção, não de receita: se o bloqueio existe para segurar o cliente até
-- ele pagar, deixá-lo apagar a própria carteira nesse meio-tempo trabalha contra — ele pode ir
-- embora deixando terra arrasada, e aí não há o que reter.
--
-- Estas 5 não passam pelo gerador porque ele só cria política que ainda não existe, e as de
-- INSERT/UPDATE delas já existem. O DELETE é o que faltava.
do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'contatos', 'obra_contatos', 'obras', 'pedidos']
  loop
    execute format(
      'drop policy if exists %I on public.%I', t || '_exige_plano_delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using ((select public.empresa_plano_ativo()))',
      t || '_exige_plano_delete', t);
  end loop;
end $$;
