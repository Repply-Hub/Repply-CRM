-- =============================================================================
-- E-MAIL VIA NYLAS v3 — caixa da empresa, compartilhada pelo time
-- =============================================================================
-- Substitui o caminho Gmail OAuth direto (gmail_tokens/emails/emails_recebidos),
-- que é modelado por auth.users e não tem empresa_id. Aquelas tabelas continuam
-- de pé nesta release — estão com ZERO linhas, então não há migração de dado, e
-- manter o caminho antigo intacto significa que ligar o Nylas não pode quebrar
-- nada. Removê-las fica para a release seguinte.
--
-- POR QUE NÃO REAPROVEITAR emails/emails_recebidos:
--   1. A chave de tenancy é `user_id` com policy `auth.uid() = user_id`. O
--      requisito é caixa DA EMPRESA. Não dá para consertar com ALTER TABLE sem
--      deixar uma tabela cujo nome e histórico descrevem outro modelo.
--   2. As duas são assimétricas (destinatario TEXT vs destinatarios TEXT[],
--      corpo+html vs só corpo_html) e o Message do Nylas é o MESMO objeto nas
--      duas direções. Mapear em duas tabelas divergentes duplicaria a lógica do
--      webhook e impediria montar thread.
--   3. emails_recebidos.resend_id já guarda o message.id do Gmail — um segundo
--      significado para a mesma coluna. O Nylas seria o terceiro.

-- pg_trgm serve à busca por assunto/remetente, que na tela é ILIKE '%termo%' e
-- não usa índice B-tree. No schema `extensions` porque extensão em `public`
-- dispara aviso do advisor de segurança.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Contas conectadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  provedor TEXT NOT NULL,
  email TEXT NOT NULL,
  nome_exibicao TEXT,

  status TEXT NOT NULL DEFAULT 'conectada',
  ultimo_erro TEXT,

  -- Id da pasta no provedor. No Google o filtro `in` da API do Nylas exige o ID
  -- da label, não o nome — resolvido uma vez na conexão e cacheado aqui para o
  -- sync não gastar uma chamada a /folders por execução.
  pasta_inbox_id TEXT,
  pasta_sent_id TEXT,

  conectado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  conectado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_sync_em TIMESTAMPTZ,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_contas DROP CONSTRAINT IF EXISTS email_contas_provedor_check;
ALTER TABLE public.email_contas ADD CONSTRAINT email_contas_provedor_check
  CHECK (provedor IN ('google', 'microsoft', 'imap', 'icloud', 'yahoo'));

ALTER TABLE public.email_contas DROP CONSTRAINT IF EXISTS email_contas_status_check;
ALTER TABLE public.email_contas ADD CONSTRAINT email_contas_status_check
  CHECK (status IN ('conectada', 'revogada', 'erro'));

-- UMA caixa por empresa (decisão do produto: o time compartilha comercial@...).
-- Como UNIQUE e não como PRIMARY KEY: se um dia a regra virar N caixas, basta
-- derrubar este índice. Se `empresa_id` fosse a PK, mudar exigiria recriar
-- email_mensagens junto, porque a FK muda.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_contas_empresa
  ON public.email_contas (empresa_id);

ALTER TABLE public.email_contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_contas_select ON public.email_contas;
CREATE POLICY email_contas_select ON public.email_contas
FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

-- Sem INSERT/UPDATE/DELETE para authenticated: conectar e desconectar passam por
-- Edge Function, que além de gravar aqui precisa revogar o grant no Nylas.
-- Apagar a linha direto do cliente deixaria o grant órfão lá — e conta conectada
-- é a unidade de cobrança do Nylas (US$ 2/mês acima das 5 do plano gratuito).
REVOKE INSERT, UPDATE, DELETE ON public.email_contas FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A credencial — só service_role enxerga
-- ---------------------------------------------------------------------------
-- RLS é por LINHA, não por coluna. Os usuários da empresa precisam de SELECT em
-- email_contas para a tela saber qual caixa está ligada; se o grant morasse lá,
-- essa mesma policy entregaria a credencial. GRANT por coluna resolveria, mas
-- quebra `select('*')` do supabase-js em runtime e exige lembrar da lista toda
-- vez que uma coluna nova aparecer. Tabela separada é a mesma proteção sem
-- manutenção.
CREATE TABLE IF NOT EXISTS public.email_conta_grants (
  conta_id UUID PRIMARY KEY REFERENCES public.email_contas(id) ON DELETE CASCADE,

  -- O Nylas cria UM grant por endereço de e-mail POR APLICAÇÃO. Se duas empresas
  -- tentarem conectar a mesma caixa, ele devolve o MESMO grant_id e este UNIQUE
  -- estoura — de propósito, para o callback poder recusar com mensagem clara em
  -- vez de silenciosamente dar a uma empresa acesso à caixa da outra.
  grant_id TEXT NOT NULL UNIQUE,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_conta_grants ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: RLS ligado sem policy é negação total.
REVOKE ALL ON public.email_conta_grants FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. State do OAuth (CSRF) — uso único
-- ---------------------------------------------------------------------------
-- O callback chega SEM JWT: é o navegador voltando do provedor, igual ao
-- stripe-webhook. Sem um segredo de ida e volta, qualquer um chamaria o callback
-- com um code próprio e amarraria a caixa dele à empresa de outro cliente.
CREATE TABLE IF NOT EXISTS public.email_conexao_estados (
  state TEXT PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  provedor TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Janela curta: o usuário vai ao provedor e volta em segundos.
  expira_em TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes'
);

CREATE INDEX IF NOT EXISTS idx_email_conexao_estados_expira
  ON public.email_conexao_estados (expira_em);

ALTER TABLE public.email_conexao_estados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_conexao_estados FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Mensagens — recebidas E enviadas na mesma tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Desnormalizado de propósito: toda policy e todo índice de listagem partem
  -- daqui, e um JOIN em email_contas por linha não paga.
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.email_contas(id) ON DELETE CASCADE,

  nylas_message_id TEXT NOT NULL,
  nylas_thread_id TEXT,

  -- Derivada comparando from[0].email com email_contas.email, NUNCA da origem da
  -- escrita: o e-mail que nós enviamos volta pelo webhook message.created, e
  -- classificar por origem daria duas classificações para a mesma mensagem.
  direcao TEXT NOT NULL,

  remetente_nome TEXT,
  remetente_email TEXT,
  destinatarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to JSONB NOT NULL DEFAULT '[]'::jsonb,

  assunto TEXT,
  snippet TEXT,
  -- NULL até alguém abrir a mensagem: GET /messages devolve snippet, não body.
  -- O corpo custa uma chamada por mensagem e é buscado sob demanda.
  corpo_html TEXT,

  tem_anexo BOOLEAN NOT NULL DEFAULT false,
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,

  pastas TEXT[] NOT NULL DEFAULT '{}',
  lido BOOLEAN NOT NULL DEFAULT false,
  favorito BOOLEAN NOT NULL DEFAULT false,
  -- Exclusão lógica: apagar de verdade faria o sync ressuscitar a mensagem.
  excluido BOOLEAN NOT NULL DEFAULT false,

  envio_status TEXT,
  envio_erro TEXT,
  enviado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,

  data_mensagem TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_mensagens DROP CONSTRAINT IF EXISTS email_mensagens_direcao_check;
ALTER TABLE public.email_mensagens ADD CONSTRAINT email_mensagens_direcao_check
  CHECK (direcao IN ('recebido', 'enviado'));

ALTER TABLE public.email_mensagens DROP CONSTRAINT IF EXISTS email_mensagens_envio_status_check;
ALTER TABLE public.email_mensagens ADD CONSTRAINT email_mensagens_envio_status_check
  CHECK (envio_status IS NULL OR envio_status IN ('enviando','enviado','falhou','bounce'));

-- Deduplicação POR CONTA, não global: o mesmo message_id pode existir em grants
-- diferentes. (É o erro que whatsapp_mensagens tem hoje, com UNIQUE(wamid)
-- global engolindo mensagem de outra empresa em silêncio.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_mensagens_conta_msg
  ON public.email_mensagens (conta_id, nylas_message_id);

CREATE INDEX IF NOT EXISTS idx_email_mensagens_lista
  ON public.email_mensagens (empresa_id, direcao, data_mensagem DESC)
  WHERE excluido = false;

CREATE INDEX IF NOT EXISTS idx_email_mensagens_nao_lidas
  ON public.email_mensagens (empresa_id)
  WHERE direcao = 'recebido' AND lido = false AND excluido = false;

CREATE INDEX IF NOT EXISTS idx_email_mensagens_thread
  ON public.email_mensagens (conta_id, nylas_thread_id)
  WHERE nylas_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_mensagens_busca
  ON public.email_mensagens
  USING gin ((coalesce(assunto,'') || ' ' || coalesce(remetente_email,'')) extensions.gin_trgm_ops);

ALTER TABLE public.email_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_mensagens_select ON public.email_mensagens;
CREATE POLICY email_mensagens_select ON public.email_mensagens
FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

-- UPDATE existe porque a tela marca lido/favorito/excluído sem ida à Edge
-- Function. O RLS limita as LINHAS; o GRANT por coluna limita os CAMPOS — sem
-- ele o usuário poderia reescrever corpo_html de uma mensagem recebida.
-- Aqui o GRANT por coluna é seguro (diferente do caso do grant_id): restringe
-- UPDATE, não SELECT, então nenhum select('*') quebra.
DROP POLICY IF EXISTS email_mensagens_update ON public.email_mensagens;
CREATE POLICY email_mensagens_update ON public.email_mensagens
FOR UPDATE TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id())
WITH CHECK (is_admin() OR empresa_id = get_my_empresa_id());

REVOKE UPDATE ON public.email_mensagens FROM anon, authenticated;
GRANT UPDATE (lido, favorito, excluido) ON public.email_mensagens TO authenticated;

-- Quem escreve é o webhook/sync com service_role. Exclusão é lógica.
REVOKE INSERT, DELETE ON public.email_mensagens FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Idempotência do webhook
-- ---------------------------------------------------------------------------
-- O Nylas garante entrega at-least-once e faz até 3 tentativas: duplicata é
-- regra, não exceção. O UNIQUE de email_mensagens já protege o INSERT, mas
-- eventos de transição (message.updated, grant.expired) não são naturalmente
-- idempotentes. Mesmo padrão de stripe_eventos.
CREATE TABLE IF NOT EXISTS public.email_webhook_eventos (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  grant_id TEXT,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_webhook_eventos_recebido
  ON public.email_webhook_eventos (recebido_em);

ALTER TABLE public.email_webhook_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_webhook_eventos FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. updated_at — reusa a função que o resto do schema já usa
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_email_contas_updated_at ON public.email_contas;
CREATE TRIGGER trg_email_contas_updated_at
BEFORE UPDATE ON public.email_contas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_email_mensagens_updated_at ON public.email_mensagens;
CREATE TRIGGER trg_email_mensagens_updated_at
BEFORE UPDATE ON public.email_mensagens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. Realtime — a tela precisa ver o que o webhook escreveu
-- ---------------------------------------------------------------------------
-- Quem insere é o service_role dentro da Edge Function; sem replicação, a caixa
-- de entrada só atualizaria no refetch. Guardado porque ADD TABLE não é
-- idempotente e estoura se a tabela já estiver na publicação.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.email_mensagens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.email_contas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Marcação do caminho antigo
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.gmail_tokens IS
  'OBSOLETA — substituída por email_contas/email_conta_grants (Nylas). Zero linhas. Remover na release seguinte.';
COMMENT ON TABLE public.emails IS
  'OBSOLETA — substituída por email_mensagens (direcao=enviado). Zero linhas.';
COMMENT ON TABLE public.emails_recebidos IS
  'OBSOLETA — substituída por email_mensagens (direcao=recebido). Zero linhas.';

COMMENT ON TABLE public.email_contas IS
  'Caixa de e-mail da empresa conectada via Nylas, compartilhada pelo time. O grant fica em email_conta_grants.';
COMMENT ON TABLE public.email_conta_grants IS
  'Credencial Nylas (grant_id). RLS sem policy: só service_role acessa.';
COMMENT ON COLUMN public.email_mensagens.direcao IS
  'Derivada de from[0].email vs email_contas.email — nunca da origem da escrita.';
