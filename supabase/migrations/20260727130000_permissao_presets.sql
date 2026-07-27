-- Presets de permissões por empresa: gestor pode criar novos presets nomeados e
-- editar a matriz de permissões dos presets padrão (Nenhum/Leitura/Operacional/Total).

CREATE TABLE public.permissao_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  origem TEXT NOT NULL,                -- 'padrao' | 'customizado'
  preset_key TEXT NOT NULL,            -- padrao: 'nenhum'|'leitura'|'operacional'|'total'; customizado: slug do nome
  nome TEXT NOT NULL,
  descricao TEXT,
  permissoes JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { [modulo_key]: { pode_ver, pode_criar, pode_editar, pode_excluir, funcionalidades } }
  created_by UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, preset_key)
);

CREATE INDEX idx_permissao_presets_empresa
  ON public.permissao_presets(empresa_id);

ALTER TABLE public.permissao_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissao_presets_select" ON public.permissao_presets
FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

-- INSERT/UPDATE liberados para gestor da própria empresa, inclusive nas linhas
-- 'padrao' — é isso que dá autonomia para editar o que os presets padrão concedem.
CREATE POLICY "permissao_presets_insert" ON public.permissao_presets
FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "permissao_presets_update" ON public.permissao_presets
FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

-- DELETE: apenas quem criou o preset customizado (created_by), ou admin. Linhas
-- 'padrao' têm created_by NULL, então nunca são elegíveis para exclusão.
CREATE POLICY "permissao_presets_delete" ON public.permissao_presets
FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id() AND created_by = get_my_usuario_id()));

CREATE TRIGGER update_permissao_presets_updated_at
BEFORE UPDATE ON public.permissao_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Monta a matriz de permissões (14 módulos) para cada um dos 4 presets padrão,
-- espelhando a regra hoje hardcoded em applyPreset() no frontend.
CREATE OR REPLACE FUNCTION public.montar_permissoes_preset_padrao(p_preset_key TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_object_agg(modulo, jsonb_build_object(
    'pode_ver', p_preset_key <> 'nenhum',
    'pode_criar', p_preset_key IN ('operacional', 'total'),
    'pode_editar', p_preset_key IN ('operacional', 'total'),
    'pode_excluir', p_preset_key = 'total',
    'funcionalidades', CASE
      WHEN p_preset_key = 'total' THEN
        (SELECT jsonb_object_agg(f, true) FROM jsonb_array_elements_text(funcs) f)
      WHEN p_preset_key = 'operacional' THEN
        (SELECT jsonb_object_agg(f, f NOT IN ('gerenciar_usuarios', 'gerenciar_permissoes'))
         FROM jsonb_array_elements_text(funcs) f)
      ELSE '{}'::jsonb
    END
  ))
  FROM (VALUES
    ('dashboard',    '["filtrar_vendedor","exportar_relatorio"]'::jsonb),
    ('pipeline',     '["mover_cards","exportar_pdf","filtrar_avancado"]'::jsonb),
    ('clientes',     '["importar","exportar","whatsapp"]'::jsonb),
    ('contatos',     '["whatsapp"]'::jsonb),
    ('pedidos',      '["importar","exportar_pdf","alterar_status","whatsapp"]'::jsonb),
    ('obras',        '["alterar_status"]'::jsonb),
    ('fabricantes',  '["importar_precos","gerenciar_precos"]'::jsonb),
    ('portal',       '["importar_licencas"]'::jsonb),
    ('calendario',   '[]'::jsonb),
    ('tarefas',      '["atribuir_responsavel","alterar_status"]'::jsonb),
    ('chat',         '["criar_grupo","enviar_arquivo"]'::jsonb),
    ('whatsapp',     '[]'::jsonb),
    ('emails',       '[]'::jsonb),
    ('configuracoes','["gerenciar_usuarios","gerenciar_permissoes","ver_codigo_acesso"]'::jsonb)
  ) AS m(modulo, funcs);
$$;

-- Seed dos 4 presets padrão para empresas já existentes.
INSERT INTO public.permissao_presets (empresa_id, origem, preset_key, nome, descricao, permissoes)
SELECT e.id, 'padrao', v.preset_key, v.nome, v.descricao, public.montar_permissoes_preset_padrao(v.preset_key)
FROM public.empresas e
CROSS JOIN (VALUES
  ('nenhum',       'Nenhum',       'Remove todo o acesso aos módulos'),
  ('leitura',      'Leitura',      'Apenas visualização, sem criar/editar/excluir'),
  ('operacional',  'Operacional',  'Visualizar, criar e editar, sem excluir e sem funcionalidades administrativas'),
  ('total',        'Total',        'Acesso completo a todos os módulos e funcionalidades')
) AS v(preset_key, nome, descricao)
ON CONFLICT (empresa_id, preset_key) DO NOTHING;

-- Semeia os mesmos 4 presets para empresas novas.
CREATE OR REPLACE FUNCTION public.criar_permissao_presets_padrao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.permissao_presets (empresa_id, origem, preset_key, nome, descricao, permissoes) VALUES
    (NEW.id, 'padrao', 'nenhum',      'Nenhum',      'Remove todo o acesso aos módulos', public.montar_permissoes_preset_padrao('nenhum')),
    (NEW.id, 'padrao', 'leitura',     'Leitura',     'Apenas visualização, sem criar/editar/excluir', public.montar_permissoes_preset_padrao('leitura')),
    (NEW.id, 'padrao', 'operacional', 'Operacional', 'Visualizar, criar e editar, sem excluir e sem funcionalidades administrativas', public.montar_permissoes_preset_padrao('operacional')),
    (NEW.id, 'padrao', 'total',       'Total',       'Acesso completo a todos os módulos e funcionalidades', public.montar_permissoes_preset_padrao('total'))
  ON CONFLICT (empresa_id, preset_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_permissao_presets_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_permissao_presets_padrao();
