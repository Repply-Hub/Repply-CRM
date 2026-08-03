-- Permite redimensionar colunas (estilo Excel) nas tabelas configuráveis (Negócios, Clientes,
-- Obras, Fabricantes, Tarefas) e persistir a largura escolhida por empresa/tabela, no mesmo
-- registro onde já vivem colunas visíveis/labels/tamanho de página.
ALTER TABLE public.configuracoes_tabelas
  ADD COLUMN IF NOT EXISTS larguras_colunas JSONB NOT NULL DEFAULT '{}'::jsonb;
