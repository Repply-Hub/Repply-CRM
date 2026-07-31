-- Expande a config de campos para cobrir TODOS os campos dos modais de criação
-- (Negócios, Empresas, Contatos) e cria a entidade "obras" do zero, além de
-- adicionar rótulo de etapa (wizard) para os modais com múltiplos passos.

ALTER TABLE public.configuracoes_campos ADD COLUMN IF NOT EXISTS etapa TEXT;

-- Preenche a etapa das linhas padrão já existentes, sem alterar obrigatorio/ordem.
UPDATE public.configuracoes_campos SET etapa = 'Informações do Negócio'
WHERE entidade = 'pedidos' AND origem = 'padrao' AND etapa IS NULL;

UPDATE public.configuracoes_campos SET etapa = 'Dados'
WHERE entidade = 'clientes' AND origem = 'padrao' AND campo_key = 'razao_social';

UPDATE public.configuracoes_campos SET etapa = 'Contato'
WHERE entidade = 'clientes' AND origem = 'padrao' AND campo_key IN ('email', 'telefone');

UPDATE public.configuracoes_campos SET etapa = 'Endereço'
WHERE entidade = 'clientes' AND origem = 'padrao' AND campo_key = 'endereco';

-- Novas linhas padrão para campos estruturais que hoje são fixos no código
-- (label preenchido diretamente para não colidir com FIELD_LABELS entre
-- entidades diferentes, ex. "status" em pedidos vs. obras).
INSERT INTO public.configuracoes_campos (empresa_id, entidade, origem, campo_key, label, obrigatorio, ordem, etapa)
SELECT e.id, v.entidade, 'padrao', v.campo_key, v.label, v.obrigatorio, v.ordem, v.etapa
FROM public.empresas e
CROSS JOIN (VALUES
  ('pedidos',  'cliente_id',        'Cliente',                   true,  5,  'Informações do Negócio'),
  ('pedidos',  'fabricante_id',     'Fabricante',                 true,  6,  'Informações do Negócio'),
  ('pedidos',  'vendedor_id',       'Responsável',                true,  7,  'Informações do Negócio'),
  ('pedidos',  'status',            'Fase do Negócio',            false, 8,  'Informações do Negócio'),
  ('pedidos',  'anexo_pdf',         'Anexar PDF',                 true,  9,  'Informações do Negócio'),
  ('pedidos',  'data_pedido',       'Data de Criação',            true,  10, 'Informações do Negócio'),
  ('pedidos',  'itens',             'Itens do Negócio',           false, 11, 'Itens do Negócio'),
  ('pedidos',  'valor_manual',      'Valor de Negociação',        false, 12, 'Itens do Negócio'),
  ('pedidos',  'proximo_contato',   'Próximo Contato Agendado',   false, 13, 'Itens do Negócio'),
  ('clientes', 'tipo',              'Tipo',                       false, 4,  'Dados'),
  ('clientes', 'cnpj',              'CNPJ',                       true,  5,  'Dados'),
  ('clientes', 'nome',              'Nome',                       true,  6,  'Dados'),
  ('contatos', 'nome_contato',      'Nome do contato',            true,  3,  NULL),
  ('contatos', 'empresa_vinculo',   'Empresa vinculada',          false, 4,  NULL)
) AS v(entidade, campo_key, label, obrigatorio, ordem, etapa)
ON CONFLICT (empresa_id, entidade, campo_key) DO NOTHING;

-- Nova entidade "obras" (não existia nenhuma linha antes).
INSERT INTO public.configuracoes_campos (empresa_id, entidade, origem, campo_key, label, obrigatorio, ordem)
SELECT e.id, 'obras', 'padrao', v.campo_key, v.label, v.obrigatorio, v.ordem
FROM public.empresas e
CROSS JOIN (VALUES
  ('nome_obra',         'Nome da Obra',           true,  0),
  ('cliente_id',        'Cliente Responsável',    true,  1),
  ('status',            'Status Inicial',         false, 2),
  ('endereco_entrega',  'Endereço de Entrega',    false, 3),
  ('spe_cnpj',          'SPE/CNPJ',               false, 4)
) AS v(campo_key, label, obrigatorio, ordem)
ON CONFLICT (empresa_id, entidade, campo_key) DO NOTHING;

-- Atualiza o seed de empresas novas para já nascer com o conjunto completo.
CREATE OR REPLACE FUNCTION public.criar_configuracoes_campos_padrao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.configuracoes_campos (empresa_id, entidade, origem, campo_key, label, obrigatorio, ordem, etapa) VALUES
    (NEW.id, 'pedidos',  'padrao', 'obra_id',          NULL,                        false, 0,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'origem_lead',      NULL,                        false, 1,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'endereco_entrega', NULL,                        false, 2,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'prazo_resposta',   NULL,                        false, 3,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'observacoes',      NULL,                        false, 4,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'cliente_id',       'Cliente',                   true,  5,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'fabricante_id',    'Fabricante',                true,  6,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'vendedor_id',      'Responsável',               true,  7,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'status',           'Fase do Negócio',           false, 8,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'anexo_pdf',        'Anexar PDF',                true,  9,  'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'data_pedido',      'Data de Criação',           true,  10, 'Informações do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'itens',            'Itens do Negócio',          false, 11, 'Itens do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'valor_manual',     'Valor de Negociação',       false, 12, 'Itens do Negócio'),
    (NEW.id, 'pedidos',  'padrao', 'proximo_contato',  'Próximo Contato Agendado',  false, 13, 'Itens do Negócio'),
    (NEW.id, 'clientes', 'padrao', 'razao_social',     NULL,                        false, 0,  'Dados'),
    (NEW.id, 'clientes', 'padrao', 'email',            NULL,                        true,  1,  'Contato'),
    (NEW.id, 'clientes', 'padrao', 'telefone',         NULL,                        true,  2,  'Contato'),
    (NEW.id, 'clientes', 'padrao', 'endereco',         NULL,                        false, 3,  'Endereço'),
    (NEW.id, 'clientes', 'padrao', 'tipo',             'Tipo',                      false, 4,  'Dados'),
    (NEW.id, 'clientes', 'padrao', 'cnpj',             'CNPJ',                      true,  5,  'Dados'),
    (NEW.id, 'clientes', 'padrao', 'nome',             'Nome',                      true,  6,  'Dados'),
    (NEW.id, 'contatos', 'padrao', 'email',            NULL,                        true,  0,  NULL),
    (NEW.id, 'contatos', 'padrao', 'telefone',         NULL,                        true,  1,  NULL),
    (NEW.id, 'contatos', 'padrao', 'cargo',            NULL,                        false, 2,  NULL),
    (NEW.id, 'contatos', 'padrao', 'nome_contato',     'Nome do contato',           true,  3,  NULL),
    (NEW.id, 'contatos', 'padrao', 'empresa_vinculo',  'Empresa vinculada',         false, 4,  NULL),
    (NEW.id, 'obras',    'padrao', 'nome_obra',        'Nome da Obra',              true,  0,  NULL),
    (NEW.id, 'obras',    'padrao', 'cliente_id',       'Cliente Responsável',       true,  1,  NULL),
    (NEW.id, 'obras',    'padrao', 'status',           'Status Inicial',            false, 2,  NULL),
    (NEW.id, 'obras',    'padrao', 'endereco_entrega', 'Endereço de Entrega',       false, 3,  NULL),
    (NEW.id, 'obras',    'padrao', 'spe_cnpj',         'SPE/CNPJ',                  false, 4,  NULL)
  ON CONFLICT (empresa_id, entidade, campo_key) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Documenta retroativamente a coluna campos_extras em obras (já existe em produção
-- por drift, sem migration correspondente) para manter o histórico consistente.
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
