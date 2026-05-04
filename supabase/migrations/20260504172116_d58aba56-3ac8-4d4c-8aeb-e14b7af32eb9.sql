-- 1. AJUSTE NA TABELA CLIENTES (Garantir que empresa_id existe)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'empresa_id') THEN
        ALTER TABLE public.clientes ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
    END IF;
END $$;

-- 2. LIMPEZA DE VIEWS
DROP VIEW IF EXISTS public.vw_pedidos_inativos CASCADE;
DROP VIEW IF EXISTS public.vw_indicadores_vendedor CASCADE;
DROP VIEW IF EXISTS public.vw_indicadores_usuario CASCADE;
DROP VIEW IF EXISTS public.vw_velocidade_por_fabricante CASCADE;
DROP VIEW IF EXISTS public.vw_faturamento_mensal CASCADE;

-- 3. FUNÇÕES E EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 4. TABELAS DE SUPORTE
CREATE TABLE IF NOT EXISTS public.fabricantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id),
    nome TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. RECRIAR VIEWS
CREATE OR REPLACE VIEW public.vw_faturamento_mensal AS
 SELECT u.empresa_id,
    to_char(date_trunc('month', p.data_pedido::timestamp), 'YYYY-MM') AS mes_ano,
    to_char(date_trunc('month', p.data_pedido::timestamp), 'Mon/YY') AS mes,
    COALESCE(sum(p.valor_total), 0) AS faturamento_total,
    count(p.id) AS qtd_pedidos_fechados,
    CASE WHEN count(p.id) > 0 THEN COALESCE(sum(p.valor_total), 0) / count(p.id) ELSE 0 END AS ticket_medio
   FROM public.pedidos p 
   JOIN public.usuarios u ON p.usuario_id = u.id
  WHERE p.status = 'fechamento'
  GROUP BY u.empresa_id, date_trunc('month', p.data_pedido::timestamp)
  ORDER BY date_trunc('month', p.data_pedido::timestamp);

CREATE OR REPLACE VIEW public.vw_indicadores_usuario AS
 SELECT u.id AS usuario_id, u.nome AS usuario_nome, u.empresa_id,
    count(p.id) AS total_pedidos,
    count(p.id) FILTER (WHERE p.status = 'novo_lead') AS qtd_novo_lead,
    count(p.id) FILTER (WHERE p.status = 'elaborando') AS qtd_elaborando,
    count(p.id) FILTER (WHERE p.status = 'enviado') AS qtd_enviado,
    count(p.id) FILTER (WHERE p.status = 'negociacao') AS qtd_negociacao,
    count(p.id) FILTER (WHERE p.status = 'fechamento') AS qtd_fechado,
    count(p.id) FILTER (WHERE p.status = 'perdido') AS qtd_perdido,
    COALESCE(avg(p.valor_total) FILTER (WHERE p.status = 'fechamento'), 0) AS ticket_medio_fechado
   FROM public.usuarios u 
   LEFT JOIN public.pedidos p ON p.usuario_id = u.id
  GROUP BY u.id, u.nome, u.empresa_id;

CREATE OR REPLACE VIEW public.vw_indicadores_vendedor AS SELECT * FROM public.vw_indicadores_usuario;

CREATE OR REPLACE VIEW public.vw_velocidade_por_fabricante AS
 SELECT f.id AS fabricante_id, f.nome AS fabricante_nome, u.empresa_id, count(p.id) AS total_pedidos
   FROM public.fabricantes f 
   JOIN public.pedidos p ON p.fabricante_id = f.id 
   JOIN public.usuarios u ON p.usuario_id = u.id
  GROUP BY f.id, f.nome, u.empresa_id;

CREATE OR REPLACE VIEW public.vw_pedidos_inativos AS
 SELECT p.id AS pedido_id, p.status, p.updated_at AS ultima_atualizacao,
    (EXTRACT(day FROM (now() - p.updated_at)))::integer AS dias_parado,
    c.empresa AS cliente_nome, u.nome AS usuario_nome
   FROM public.pedidos p 
   JOIN public.clientes c ON c.id = p.cliente_id 
   JOIN public.usuarios u ON u.id = p.usuario_id
  WHERE p.status NOT IN ('fechado', 'perdido');

-- 6. POLÍTICAS RLS
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso por empresa" ON public.clientes;
DROP POLICY IF EXISTS "Acesso pedidos empresa" ON public.pedidos;

CREATE POLICY "Acesso por empresa" ON public.clientes 
FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Acesso pedidos empresa" ON public.pedidos 
FOR ALL USING (
    usuario_id IN (SELECT id FROM public.usuarios WHERE empresa_id = (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1))
);

-- 7. DEMAIS TABELAS
CREATE TABLE IF NOT EXISTS public.audit_permissoes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_id UUID REFERENCES public.usuarios(id), usuario_id UUID REFERENCES public.usuarios(id), acao TEXT NOT NULL, detalhes JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.automation_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tipo TEXT, pedido_id UUID, cliente_id UUID, status TEXT, detalhes JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.chat_grupos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT, descricao TEXT, empresa_id UUID REFERENCES public.empresas(id), criado_por UUID REFERENCES public.usuarios(id), created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.chat_grupo_membros (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), grupo_id UUID REFERENCES public.chat_grupos(id) ON DELETE CASCADE, usuario_id UUID REFERENCES public.usuarios(id), created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.chat_mensagens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conteudo TEXT, usuario_id UUID REFERENCES public.usuarios(id), empresa_id UUID REFERENCES public.empresas(id), grupo_id UUID REFERENCES public.chat_grupos(id), recipient_id UUID REFERENCES public.usuarios(id), arquivo_url TEXT, arquivo_nome TEXT, arquivo_tipo TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.colunas_customizadas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id UUID REFERENCES public.empresas(id), tabela TEXT, nome_coluna TEXT, label TEXT, tipo TEXT, options JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.configuracoes_automacao (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id UUID REFERENCES public.empresas(id), tipo TEXT, configuracao JSONB, ativa BOOLEAN DEFAULT true, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.contatos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id UUID REFERENCES public.clientes(id), nome TEXT, email TEXT, telefone TEXT, cargo TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.debug_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), message TEXT, level TEXT, data JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.emails (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), para TEXT, assunto TEXT, corpo TEXT, status TEXT, metadata JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.emails_recebidos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), de TEXT, assunto TEXT, corpo_html TEXT, message_id TEXT, data_recebimento TIMESTAMP WITH TIME ZONE, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.eventos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id), titulo TEXT NOT NULL, descricao TEXT, data_inicio TIMESTAMP WITH TIME ZONE NOT NULL, data_fim TIMESTAMP WITH TIME ZONE, cor TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.gmail_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id) UNIQUE, access_token TEXT, refresh_token TEXT, expiry_date BIGINT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.historico_contatos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id UUID REFERENCES public.clientes(id), usuario_id UUID REFERENCES public.usuarios(id), tipo TEXT, descricao TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.itens_pedido (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE, descricao TEXT, quantidade INTEGER DEFAULT 1, valor_unitario NUMERIC DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.kanban_colunas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id UUID REFERENCES public.empresas(id), slug TEXT NOT NULL, nome TEXT NOT NULL, cor TEXT, ordem INTEGER DEFAULT 0, is_sistema BOOLEAN DEFAULT false, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.licencas_extremoz (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), obra_id UUID REFERENCES public.obras(id), numero TEXT, validade DATE, status TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.licencas_idema (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), obra_id UUID REFERENCES public.obras(id), numero TEXT, validade DATE, status TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.licencas_natal (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), obra_id UUID REFERENCES public.obras(id), numero TEXT, validade DATE, status TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.mensagens_whatsapp (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), cliente_id UUID REFERENCES public.clientes(id), conteudo TEXT, status TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.notificacoes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), titulo TEXT, mensagem TEXT, lida BOOLEAN DEFAULT false, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.perfis_customizados (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id UUID REFERENCES public.empresas(id), nome TEXT NOT NULL, permissoes JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.permissoes_usuario (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id) UNIQUE, modulo TEXT, pode_ver BOOLEAN DEFAULT true, pode_criar BOOLEAN DEFAULT false, pode_editar BOOLEAN DEFAULT false, pode_excluir BOOLEAN DEFAULT false, funcionalidades JSONB DEFAULT '{}', created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.sidebar_preferences (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id) UNIQUE, collapsed BOOLEAN DEFAULT false, order_preference TEXT[], created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.status_obras (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id UUID REFERENCES public.empresas(id), slug TEXT NOT NULL, nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, cor TEXT, is_sistema BOOLEAN DEFAULT false, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.tabela_precos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), fabricante_id UUID REFERENCES public.fabricantes(id), produto TEXT, preco NUMERIC, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.tarefas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), pedido_id UUID REFERENCES public.pedidos(id), titulo TEXT, descricao TEXT, prazo TIMESTAMP WITH TIME ZONE, concluida BOOLEAN DEFAULT false, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.user_domains (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), domain TEXT, verified BOOLEAN DEFAULT false, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.user_integrations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID REFERENCES public.usuarios(id), provider TEXT, settings JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());