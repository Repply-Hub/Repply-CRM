-- ============================================================================
-- Comentários nas colunas cujo NOME não diz o que elas GUARDAM
-- ============================================================================
--
-- Esta migration não muda estrutura nem dado. Só escreve comentário — o texto que aparece
-- ao lado da coluna no painel do Supabase, que é onde um dev vai olhar quando estiver
-- decidindo se pode usar aquele campo.
--
-- POR QUE ELA EXISTE
--
-- Em 24/08/2026 um plano inteiro foi desenhado sobre `pedidos.prazo_resposta`, acreditando
-- que fosse o prazo em que o cliente deveria responder. Não é: é a DATA DE FECHAMENTO. O
-- erro só apareceu porque o dono do produto desconfiou do nome. A documentação em
-- `docs/arquitetura/modelo-de-dados.md` registra o mapa completo, mas documentação em
-- arquivo não aparece para quem está olhando a tabela no painel. Comentário aparece.
--
-- POR QUE NÃO RENOMEAMOS AS COLUNAS
--
-- Medido: `ALTER TABLE ... RENAME COLUMN` atualiza visão e índice sozinho, mas **NÃO
-- atualiza o corpo das funções** — testado neste banco, em transação desfeita. Renomear
-- `prazo_resposta` quebraria 8 funções (`dashboard_stats`, `pedidos_stats`,
-- `plano_vendas_progresso`, `plano_vendas_progresso_por_vendedor`,
-- `dashboard_indicadores_vendedor`, `fn_set_pedido_fechado_em`,
-- `fn_log_pedido_historico_status`, `criar_configuracoes_campos_padrao`), além de 100
-- referências em 22 arquivos do frontend.
--
-- Só seria seguro reescrevendo as 8 no mesmo arquivo. É factível, mas é mudança grande e
-- arriscada em produção cujo benefício é só para quem lê o código — nada muda para quem usa
-- o sistema. A escolha registrada foi documentar em vez de renomear.
-- ============================================================================

-- ── A pior das quatro: o nome diz uma coisa, o sistema faz outra ────────────

COMMENT ON COLUMN public.pedidos.prazo_resposta IS
  'DATA DE FECHAMENTO do negócio. O nome da coluna mente — não é prazo de resposta de '
  'ninguém. É o que a tela chama de "Data de Fechamento" e o que o Dashboard usa em TODAS '
  'as métricas de dinheiro. Para negócio ABERTO é uma previsão herdada da importação que '
  'ninguém atualiza: dos 193 abertos em 24/08/2026, 32 tinham fechamento ANTERIOR à '
  'criação. Nunca use como prazo. Ver docs/arquitetura/modelo-de-dados.md.';

-- ── As três datas que a importação carimbou, e por isso não medem nada ──────

COMMENT ON COLUMN public.pedidos.fechado_em IS
  'ENVENENADA e legada. As 11.715 linhas foram carimbadas em 18-19/08/2026, a data da '
  'importação, não a do fechamento real. Não use para medir nada. A data de fechamento '
  'que vale é prazo_resposta (sim, o nome é confuso — ver o comentário dela).';

COMMENT ON COLUMN public.pedidos.updated_at IS
  'Mantida pelo gatilho update_pedidos_updated_at, mas a linha de base é a IMPORTAÇÃO: os '
  '11.911 negócios têm valor entre 18 e 21/08/2026. Só serve para medir atividade posterior '
  'a essa data. "Parado há N dias" calculado com esta coluna dá o mesmo número para um '
  'negócio trabalhado ontem e um abandonado em 2022.';

COMMENT ON COLUMN public.pedidos_historico_status.created_at IS
  'Confiável a partir de 08/2026. As 18.319 linhas existentes nasceram entre 18 e 21/08/2026 '
  'na importação, então para os negócios legados o relógio de "há quanto tempo está nesta '
  'etapa" começa ali. O gatilho trg_pedidos_historico_status está ativo, então mudança de '
  'etapa daqui para frente é registrada com data de verdade.';

-- ── Colunas vazias que a tela sugere estarem em uso ─────────────────────────

COMMENT ON COLUMN public.pedidos.obra_id IS
  'NULO nos 11.911 negócios, e a tabela obras tem 0 linhas. A importação nunca escreve aqui: '
  'a coluna "obra" da planilha vira campos_extras[''Negócio''] quando não há nome de negócio '
  '(ImportPedidosDialog.tsx:448). A coluna "Obra/Endereço" da lista de Negócios mostra '
  'endereco_entrega, que é outra coisa.';

COMMENT ON COLUMN public.pedidos.nome IS
  'NULO nos 11.911 negócios. O nome que a tela exibe vem de campos_extras[''Negócio''] ou, '
  'na falta dele, do formato automático "empresa | fabricante" (src/lib/nome-negocio.ts). '
  'Ordenar por esta coluna empata tudo.';

COMMENT ON COLUMN public.pedidos.status IS
  'Guarda o APELIDO da etapa (enviado, negociacao, fechamento, perdido...), não o rótulo que '
  'a tela mostra ("Orçamento Enviado"). A tela chama isto de "Etapa". Os rótulos e a ordem '
  'do funil vivem em kanban_colunas, por empresa. Etapas terminais são identificadas pelos '
  'apelidos fechamento e perdido — não existe coluna marcando isso.';
