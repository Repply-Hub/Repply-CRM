-- ============================================================================
-- SEÇÃO "AJUDA" NOS PRESETS
-- ============================================================================
--
-- A página de Ajuda (passo a passo das funcionalidades, `src/pages/Ajuda.tsx`) nasce como
-- uma seção comum, igual a Dashboard/Tarefas — aparece no menu, é ligável/desligável por
-- empresa (Admin → Seções) e entra na matriz de permissão por usuário. Ver `src/lib/secoes.ts`.
--
-- Diferente de "hoje" (que nasceu DESLIGADA por cautela, `20260824280000_pauta_do_dia_fase_1_refeita.sql`),
-- "ajuda" é conteúdo de referência estático, sem risco de dado errado ou custo de consulta —
-- por isso nasce LIGADA para todo preset existente. Decisão de produto de 14/09/2026.
--
-- `secoes_conhecidas()` (`20260825110000_secoes_deixam_de_ter_lista_cravada.sql`) deriva do
-- dado — basta esta linha para ela reconhecer "ajuda", sem tocar em nenhuma função.
insert into public.secao_preset_itens (preset_id, secao, habilitada)
select p.id, 'ajuda', true
from public.secao_presets p
on conflict do nothing;
