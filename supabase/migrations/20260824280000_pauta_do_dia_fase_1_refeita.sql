-- ============================================================================
-- Pauta do dia — a fase 1 REFEITA, porque a anterior construiu a coisa errada
-- ============================================================================
--
-- A migration de 20 minutos atrás (20260824270000) criou uma tabela `pauta_adiamentos` e
-- abriu o histórico do negócio para um tipo `adiamento`. **Nada disso é necessário**, e esta
-- desfaz as duas coisas.
--
-- O QUE MUDOU O DESENHO
--
-- O dono do produto pediu que, ao adiar um item da pauta, a pessoa informasse o MOTIVO e uma
-- DATA DE RETORNO — "o cliente disse que decide depois que a obra começar", "vai comprar só
-- mês que vem". Procurando onde guardar isso, apareceu que a tabela certa **já existe e está
-- vazia**:
--
--   historico_contatos (pedido_id, usuario_id, tipo, descricao, data_contato, proximo_contato_em)
--
-- É o campo "próximo contato agendado" que foi removido da tela do negócio em 08/2026 por
-- nunca ter sido preenchido. E ele nunca foi preenchido porque o MOMENTO de perguntar estava
-- errado: no cadastro de um negócio novo ninguém sabe quando vai voltar a falar. Na hora de
-- tirar da pauta, sabe — é a informação que a pessoa acabou de receber do cliente.
--
-- POR QUE ELA É MELHOR QUE A TABELA QUE EU TINHA CRIADO
--
-- Três coisas passam a acontecer sem uma linha de código nova:
--
--   1. O painel do negócio JÁ desenha `historico_contatos` (Negocios.tsx:2684), com ícone,
--      texto, data e autor. E `contactIcons[tipo] ?? MessageSquare` cai num ícone padrão
--      quando o tipo é desconhecido, então um tipo novo não quebra a tela.
--   2. O Calendário JÁ lê `proximo_contato_em` e vira compromisso na agenda
--      (use-eventos.ts:114-117).
--   3. A política de INSERT já permite a TELA gravar direto ("o negócio é meu, ou sou
--      gestor da empresa") — some a necessidade de função `SECURITY DEFINER` e da transação
--      atômica que o plano previa. Uma fase inteira do plano deixou de existir.
--
-- E a política de SELECT é por empresa, então o motivo fica visível para a equipe — que era
-- exatamente o pedido de "registrar no histórico do negócio".
--
-- NENHUM DADO É PERDIDO: `pauta_adiamentos` foi criada vazia e nunca recebeu linha.
-- ============================================================================

-- ── 1. Desfaz o que a fase 1 anterior criou ────────────────────────────────

drop table if exists public.pauta_adiamentos;

-- O tipo 'adiamento' no histórico de MOVIMENTAÇÃO também deixa de fazer sentido: o registro
-- agora vive em `historico_contatos`, que é a linha do tempo de CONTATO com o cliente — o
-- lugar certo para "falei, e volto tal dia". Devolve as duas restrições ao original.
--
-- Seguro: nenhuma linha com tipo 'adiamento' chegou a ser escrita (a fase que escreveria
-- nunca foi implementada).

alter table public.pedidos_historico_status
  drop constraint if exists pedidos_historico_status_tipo_check;
alter table public.pedidos_historico_status
  add constraint pedidos_historico_status_tipo_check
  check (tipo in ('status', 'campo'));

alter table public.pedidos_historico_status
  drop constraint if exists pedidos_historico_status_shape_check;
alter table public.pedidos_historico_status
  add constraint pedidos_historico_status_shape_check
  check (
       (tipo = 'status' and status_novo is not null)
    or (tipo = 'campo'  and campo       is not null)
  );

-- ── 2. A seção "Hoje" nos presets ──────────────────────────────────────────
--
-- 🔴 DECISÃO DO DONO DO PRODUTO (24/08/2026): a pauta é validada na MD Representações antes
-- de ir para os outros assinantes. Portanto:
--
--   preset "Padrão"                  -> DESLIGADA (é o que as outras 7 empresas usam)
--   preset "Preset MD Representações" -> ligada
--
-- É exatamente o caminho que o Portal já seguia — ele nasceu desligado no padrão e ligado no
-- da MD. Não é exceção nova, é o padrão da casa.
--
-- Sem UUID cravado: os presets são identificados por `is_padrao` e por nome. `on conflict
-- do nothing` para o arquivo poder rodar duas vezes — o ambiente não tem banco local e a
-- aplicação é feita à mão contra produção.

insert into public.secao_preset_itens (preset_id, secao, habilitada)
select p.id, 'hoje', false
from public.secao_presets p
where p.is_padrao = true
on conflict do nothing;

insert into public.secao_preset_itens (preset_id, secao, habilitada)
select p.id, 'hoje', true
from public.secao_presets p
where p.is_padrao = false and p.nome ilike '%MD Representa%'
on conflict do nothing;

-- Qualquer preset que exista fora desses dois (criado pelo painel de admin depois desta
-- migration) entra DESLIGADO — o mesmo lado seguro do padrão.
insert into public.secao_preset_itens (preset_id, secao, habilitada)
select p.id, 'hoje', false
from public.secao_presets p
where not exists (
  select 1 from public.secao_preset_itens i
  where i.preset_id = p.id and i.secao = 'hoje'
)
on conflict do nothing;

-- ── 3. O que continua NÃO estando aqui ─────────────────────────────────────
--
-- As chaves de configuração da pauta (`pauta_dias_parado`, `pauta_min_itens`,
-- `pauta_max_itens`, `pauta_resumo_email`, `pauta_dias_da_semana`) não são semeadas. A
-- função da fase 2 lê `configuracoes_automacao` com `coalesce(...)` e cai nos padrões.
-- Semear criaria linhas que ninguém pediu e que passariam a mentir no dia em que o padrão
-- mudasse: empresa que nunca abriu a tela ficaria presa no valor de hoje.
-- ============================================================================
