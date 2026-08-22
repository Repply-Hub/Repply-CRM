-- Portal: as tabelas de licença passam a exigir a seção contratada
--
-- ESTADO ANTES, medido em 21/08/2026: as 4 tabelas tinham política de SELECT com
-- `qual = true` para `authenticated`. Qualquer pessoa logada em QUALQUER empresa lia as
-- licenças da MD, e três das quatro aceitavam escrita de qualquer autenticado. Não vazava
-- para a internet (requisição sem sessão devolvia vazio), mas vazava ENTRE CLIENTES.
--
-- POR QUE A CONDIÇÃO É "VOCÊ TEM O PORTAL?" E NÃO "ESTA LINHA É SUA?": estas tabelas não
-- têm `empresa_id`. São dados públicos de licença ambiental e de diário oficial, iguais
-- para todo mundo — o que não pode é a empresa que não contratou o módulo alcançá-los.
--
-- PRÉ-REQUISITO CONFERIDO ANTES DE APLICAR: a MD Representações tem a exceção de `portal`
-- em `secao_excecoes` (criada pela tela de admin em 22/08/2026 22h03). Sem isso, esta
-- migration fecharia a porta com a MD do lado de fora.
--
-- AS FUNÇÕES DE SERVIDOR NÃO SÃO AFETADAS por esta migration: `scrape-licencas-idema` grava
-- com service_role, que ignora RLS por definição. A carga em massa continua funcionando.
-- O controle de QUEM pode dispará-la é tratado dentro da própria função, em commit
-- separado.

drop policy if exists "Authenticated users can read dom_licencas" on public.dom_licencas;
drop policy if exists "licencas_extremoz_delete" on public.licencas_extremoz;
drop policy if exists "licencas_extremoz_insert" on public.licencas_extremoz;
drop policy if exists "licencas_extremoz_select" on public.licencas_extremoz;
drop policy if exists "licencas_extremoz_update" on public.licencas_extremoz;
drop policy if exists "Usuários autenticados podem atualizar licenças" on public.licencas_idema;
drop policy if exists "licencas_idema_insert" on public.licencas_idema;
drop policy if exists "licencas_idema_select" on public.licencas_idema;
drop policy if exists "Authenticated users can insert licencas_natal" on public.licencas_natal;
drop policy if exists "Authenticated users can read licencas_natal" on public.licencas_natal;

-- Leitura: exige a seção.
create policy dom_licencas_select on public.dom_licencas
  for select to authenticated using (empresa_tem_secao('portal'));

create policy licencas_idema_select on public.licencas_idema
  for select to authenticated using (empresa_tem_secao('portal'));

create policy licencas_natal_select on public.licencas_natal
  for select to authenticated using (empresa_tem_secao('portal'));

create policy licencas_extremoz_select on public.licencas_extremoz
  for select to authenticated using (empresa_tem_secao('portal'));

-- Escrita: exige a seção E ser gestor.
--
-- Antes, `licencas_idema` e `licencas_natal` aceitavam INSERT de qualquer autenticado, e
-- `licencas_idema` também UPDATE — de qualquer empresa. `licencas_extremoz` já exigia
-- gestor para alterar e apagar, mas gestor de QUALQUER empresa.
--
-- Apertar aqui não quebra a importação de licenças: ela vem das Edge Functions, com
-- service_role, que não passa por RLS.
create policy licencas_idema_write on public.licencas_idema
  for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());

create policy licencas_natal_write on public.licencas_natal
  for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());

create policy licencas_extremoz_write on public.licencas_extremoz
  for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());

-- `dom_licencas` continua sem política de escrita: só a Edge Function grava lá, e ela usa
-- service_role. Criar uma política de escrita permissiva "por simetria" seria abrir uma
-- porta que ninguém precisa.
