-- ============================================================================
-- Pauta do dia — Fase 1: a base no banco
-- ============================================================================
--
-- Plano completo: docs/operacao/plano-pauta-do-dia.md §5.
--
-- Esta migration NÃO cria comportamento. Ela só prepara o terreno para a fase 2 (a função
-- que monta a pauta) e a fase 3 (a função que adia). Nada muda para quem usa o sistema hoje.
--
-- Duas coisas: a tabela de adiamentos, e abrir a restrição do histórico do negócio para
-- aceitar um terceiro tipo de registro.
-- ============================================================================

-- ── 1. A tabela de adiamentos ──────────────────────────────────────────────
--
-- POR QUE ELA PRECISA EXISTIR
--
-- A pauta NÃO é uma lista guardada — ela é calculada na hora, toda vez que a tela abre. A
-- pergunta é sempre a mesma: "quais negócios meus estão abertos e parados há mais de N
-- dias?". Se o ✓ não gravasse nada, amanhã a mesma pergunta devolveria o mesmo negócio, e o
-- botão não teria efeito nenhum além de sumir com o item até recarregar a página.
--
-- O QUE ELA NÃO FAZ
--
-- Não toca no negócio. Não move etapa, não mexe em data, não altera valor. Empurrar o
-- `prazo_resposta` seria mais barato e faria a coluna mudar de significado — de "data de
-- fechamento" para "quando eu vou cobrar" — e todo relatório que a lê passaria a mentir. É o
-- mesmo tipo de estrago do `fechado_em`.

create table if not exists public.pauta_adiamentos (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  -- 'negocio' aponta para pedidos.id; 'compromisso' aponta para eventos.id.
  -- Sem chave estrangeira de propósito: são duas tabelas diferentes no mesmo campo, e uma
  -- FK condicional não existe. O `on delete cascade` do usuário já limpa o grosso, e linha
  -- órfã aqui é inofensiva — a pauta só a consulta para EXCLUIR item que ela já não mostra.
  tipo          text not null check (tipo in ('negocio','compromisso')),
  referencia_id uuid not null,
  adiado_ate    date not null,
  created_at    timestamptz not null default now()
);

comment on table public.pauta_adiamentos is
  'Itens que a pessoa mandou a pauta do dia parar de mostrar por alguns dias (o botão ✓ da '
  'tela "Hoje"). Não altera o negócio nem o compromisso — é só um "hoje não". O registro '
  'visível para a equipe vai para pedidos_historico_status, escrito pela mesma função.';

-- O índice espelha exatamente a consulta da pauta: "os meus adiamentos ainda válidos".
create index if not exists idx_pauta_adiamentos_consulta
  on public.pauta_adiamentos (usuario_id, tipo, adiado_ate desc);

-- Um item só pode ter um adiamento vigente por pessoa. Adiar de novo SUBSTITUI a data, em
-- vez de empilhar linha — senão "adiado 3 vezes" (o sinal de negócio morto, §10 do plano)
-- viraria contagem de linhas em vez de contagem de decisões.
create unique index if not exists idx_pauta_adiamentos_unico
  on public.pauta_adiamentos (usuario_id, tipo, referencia_id);

alter table public.pauta_adiamentos enable row level security;

-- Cada pessoa só enxerga e mexe nos próprios adiamentos. Nem gestor lê os dos outros: o
-- registro que a equipe precisa ver é o do histórico do negócio, que é público para a
-- empresa. Aqui é o bilhete operacional de quem clicou.
create policy "pauta_adiamentos_select" on public.pauta_adiamentos
  for select to authenticated
  using (usuario_id = get_my_usuario_id());

create policy "pauta_adiamentos_insert" on public.pauta_adiamentos
  for insert to authenticated
  with check (usuario_id = get_my_usuario_id() and empresa_id = get_my_empresa_id());

create policy "pauta_adiamentos_update" on public.pauta_adiamentos
  for update to authenticated
  using (usuario_id = get_my_usuario_id())
  with check (usuario_id = get_my_usuario_id() and empresa_id = get_my_empresa_id());

create policy "pauta_adiamentos_delete" on public.pauta_adiamentos
  for delete to authenticated
  using (usuario_id = get_my_usuario_id());

-- ── 2. O histórico do negócio passa a aceitar um terceiro tipo ─────────────
--
-- 🔴 DECISÃO DO DONO DO PRODUTO (24/08/2026): o adiamento aparece no "Histórico de
-- Movimentação" do negócio, sincronizado com a tabela acima. Deixa de ser bilhete privado e
-- vira registro — quem abre o negócio vê que alguém adiou, quando e até quando.
--
-- `pedidos_historico_status` já é uma linha do tempo genérica (tem `tipo`, `campo`,
-- `valor_anterior_txt`, `valor_novo_txt`), mas DUAS restrições travavam o terceiro tipo. As
-- duas são substituídas abaixo — não editadas, que a migration original não se toca
-- (CLAUDE.md §6.3).
--
-- O formato do registro de adiamento:
--
--   tipo               'adiamento'
--   campo              'Pauta do dia'          (para a tela ter o que rotular)
--   valor_novo_txt     '2026-08-27'            (até quando)
--   valor_anterior_txt  nulo
--   usuario_id         quem adiou
--
-- ⚠️ NENHUMA LINHA DESTE TIPO PODE SER ESCRITA ANTES DA TELA SABER DESENHÁ-LA.
-- `HistoricoMovimentacaoNegocio.tsx:55` só distingue `tipo === 'campo'`; TODO o resto cai no
-- else e é desenhado como mudança de etapa — um adiamento apareceria como "mudou de (vazio)
-- para (vazio)". A fase que escreve (a função `pauta_adiar`) tem de subir junto com o
-- caminho novo de desenho, no mesmo commit.

alter table public.pedidos_historico_status
  drop constraint if exists pedidos_historico_status_tipo_check;

alter table public.pedidos_historico_status
  add constraint pedidos_historico_status_tipo_check
  check (tipo in ('status', 'campo', 'adiamento'));

alter table public.pedidos_historico_status
  drop constraint if exists pedidos_historico_status_shape_check;

alter table public.pedidos_historico_status
  add constraint pedidos_historico_status_shape_check
  check (
       (tipo = 'status'    and status_novo    is not null)
    or (tipo = 'campo'     and campo          is not null)
    or (tipo = 'adiamento' and valor_novo_txt is not null)
  );

-- ── 3. O que NÃO está aqui, e por quê ──────────────────────────────────────
--
-- As chaves de configuração da pauta (`pauta_dias_parado`, `pauta_min_itens`,
-- `pauta_max_itens`, `pauta_resumo_email`) NÃO são semeadas. A tabela
-- `configuracoes_automacao` é chave/valor por empresa e está vazia; a função da fase 2 lê
-- com `coalesce(...)` e cai nos padrões (3 dias, banda de 3 a 7, resumo desligado).
--
-- Semear criaria 8 linhas que ninguém pediu e que passariam a mentir no dia em que o padrão
-- mudasse: empresa que nunca abriu a tela ficaria presa no valor de hoje. Ausência de linha
-- significa "usa o padrão vigente", que é o comportamento certo.
-- ============================================================================
