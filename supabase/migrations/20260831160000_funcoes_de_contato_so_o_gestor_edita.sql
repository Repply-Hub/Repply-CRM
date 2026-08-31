-- ============================================================================
-- A LISTA DE FUNÇÕES DE CONTATO PASSA A SER EDITADA SÓ POR QUEM RESPONDE PELA EMPRESA
-- ============================================================================
-- Decisão do Lucas em 31/08/2026, sobre `fabricante_funcoes`
-- (criada horas antes em 20260831150000).
--
-- POR QUE A LISTA É DIFERENTE DOS CONTATOS
--
-- Contato de fábrica é dado do dia a dia: qualquer membro cadastra, edita e remove, igual
-- ao que já vale para editar a própria fábrica desde 19/08/2026. Isso NÃO muda aqui.
--
-- A lista de FUNÇÕES é outra coisa — é configuração da empresa, como as etapas do funil ou
-- os marcadores de obra. Renomear "Logística" muda o rótulo em todos os contatos que a
-- usam, e apagá-la deixa todos eles sem função de uma vez. É um gesto de poucos, com
-- efeito em muitos.
--
-- 🔴 ISTO NÃO MEXE NO CARÁTER MULTI-EMPRESA. Cada empresa continua nascendo com as cinco
-- funções semeadas e continua moldando a SUA lista à vontade — o recorte por
-- `empresa_id` fica exatamente como estava. O que muda é QUEM, dentro da empresa, pode
-- moldá-la.
--
-- QUEM PERDE, MEDIDO EM 31/08/2026
--
--   empresa                        continuam   perdem   cargo afetado
--   MD Representações                      5        8   vendedor
--   Repply (demonstração)                  2        4   vendedor
--   PR & Cocentino                         1        2   vendedor
--   JHS                                    2        1   vendedor
--   MD / House Design / TESTE           1 cada   1 cada  vendedor
--
-- O único cargo afetado é `vendedor`, e ninguém perde acesso a TRABALHO: contato, fábrica,
-- negócio e obra seguem iguais. Perde-se só a edição de uma lista de configuração que a
-- maioria nunca abriu. Por isso não há aviso prévio a dar, diferente do caso da exclusão
-- de negócio (docs/operacao/plano-multi-responsavel.md §4.2).
--
-- LER CONTINUA ABERTO A TODOS
--
-- O SELECT não muda de propósito: todo mundo precisa da lista para ESCOLHER a função ao
-- cadastrar um contato. Fechar a leitura deixaria o seletor vazio para o vendedor, que é
-- justamente quem mais cadastra contato.
-- ============================================================================

-- `is_gestor()` responde verdadeiro para 'gestor', 'admin' E 'empresa' — ela significa
-- "responde pela empresa", não "tem o cargo gestor" (CLAUDE.md §7.2). É o alcance certo:
-- o titular da conta precisa poder mexer sem alguém promovê-lo.
--
-- O ramo `is_admin()` vem separado porque o admin global NÃO TEM empresa: `get_my_empresa_id()`
-- devolve nulo para ele, e `empresa_id = null` não casa com nada.

drop policy if exists "fabricante_funcoes_insert" on public.fabricante_funcoes;
create policy "fabricante_funcoes_insert" on public.fabricante_funcoes
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_gestor() and empresa_id = public.get_my_empresa_id())
  );

drop policy if exists "fabricante_funcoes_update" on public.fabricante_funcoes;
create policy "fabricante_funcoes_update" on public.fabricante_funcoes
  for update to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and empresa_id = public.get_my_empresa_id())
  )
  -- O WITH CHECK é escrito à mão de novo, e não é repetição à toa: sem ele o Postgres
  -- reaproveita o USING, que olha a linha de ORIGEM. Um gestor poderia então MOVER uma
  -- função para outra empresa, e a checagem aprovaria porque a origem era legítima.
  with check (
    public.is_admin()
    or (public.is_gestor() and empresa_id = public.get_my_empresa_id())
  );

drop policy if exists "fabricante_funcoes_delete" on public.fabricante_funcoes;
create policy "fabricante_funcoes_delete" on public.fabricante_funcoes
  for delete to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and empresa_id = public.get_my_empresa_id())
  );

-- O cerco do bloqueio por falta de pagamento é RESTRITIVO e vive em políticas próprias,
-- que os DROPs acima não tocam. Rodar o gerador de novo é barato e garante que as três
-- continuam lá depois desta troca.
select public.aplicar_gate_de_plano();

comment on table public.fabricante_funcoes is
  'A lista de funções de contato, por empresa. Nasce semeada e é editável — ponto de '
  'partida, não regra (SPEC.md §4). LER é aberto a todo membro, porque todos escolhem '
  'função ao cadastrar contato; ESCREVER é de quem responde pela empresa, porque renomear '
  'ou apagar uma função muda todos os contatos que a usam de uma vez.';
