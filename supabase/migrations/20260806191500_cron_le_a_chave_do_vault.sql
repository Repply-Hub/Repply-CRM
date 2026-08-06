-- Os crons passam a buscar a credencial no Vault, e param de chamar sem ela.
--
-- O PROBLEMA, medido e não suposto. O cron do email-sync roda de 15 em 15 min
-- desde que foi criado e `cron.job_run_details` diz "succeeded" em todas as
-- execuções — mas "succeeded" ali significa apenas que o `net.http_post` foi
-- ENFILEIRADO. A resposta real está em `net._http_response`, e é 401:
--
--     {"error":"Sua sessão expirou. Entre novamente."}
--
-- Porque `current_setting('app.settings.service_role_key', true)` devolve vazio:
-- não há linha nenhuma em `pg_db_role_setting` com esse nome, nem por banco nem
-- por papel. O comando montava `Authorization: Bearer ` com o valor em branco, o
-- cliente HTTP aparava o espaço final, e a Edge Function recebia o token
-- literal "Bearer" — que não é a chave de serviço nem um JWT válido.
--
-- Resultado: a varredura periódica NUNCA rodou. Tudo que existe hoje no CRM veio
-- do webhook ou de alguém apertando "atualizar".
--
-- POR QUE O VAULT. Guardar em `app.settings.*` exige `ALTER DATABASE ... SET` e
-- uma reconexão para valer — o que na prática significa reiniciar o banco de
-- produção, e foi por isso que isto ficou pendente. O Vault já vem instalado,
-- aceita a chave por uma única chamada de função e vale na execução seguinte,
-- sem reinício e sem janela de manutenção.
--
-- FALTA UM PASSO, QUE NÃO PODE SER FEITO AQUI: gravar a chave. Ela é um segredo
-- e não entra num arquivo versionado. No SQL Editor do painel, uma vez:
--
--     select vault.create_secret(
--       'SUA_SERVICE_ROLE_KEY',
--       'service_role_key',
--       'Usada pelos crons para chamar as Edge Functions'
--     );
--
-- Enquanto isso não for feito, o email-sync simplesmente NÃO é chamado, em vez
-- de bater num 401 a cada 15 minutos. O `raise warning` deixa o motivo no log do
-- Postgres, para o próximo que investigar não repetir este diagnóstico. O
-- eventos-lembrete continua rodando: ele não confere token e já responde 200
-- hoje — desligá-lo por falta de chave seria quebrar o que funciona.

CREATE OR REPLACE FUNCTION public.chave_de_servico_dos_crons()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_chave text;
BEGIN
  -- Vault primeiro; `app.settings` fica como caminho antigo, para o dia em que
  -- alguém tiver configurado por lá e não quiser migrar agora.
  SELECT decrypted_secret INTO v_chave
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF v_chave IS NULL OR btrim(v_chave) = '' THEN
    v_chave := nullif(btrim(coalesce(current_setting('app.settings.service_role_key', true), '')), '');
  END IF;

  RETURN v_chave;
END;
$$;

REVOKE ALL ON FUNCTION public.chave_de_servico_dos_crons() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chave_de_servico_dos_crons() FROM anon, authenticated;

COMMENT ON FUNCTION public.chave_de_servico_dos_crons() IS
  'Credencial que os crons usam para chamar Edge Functions. SECURITY DEFINER para ler o Vault; sem EXECUTE para anon/authenticated, senão qualquer login leria a chave de serviço.';

/**
 * Chama uma Edge Function pelo pg_net, ou não chama nada se não houver chave.
 *
 * Centralizar aqui evita que o próximo cron repita o `coalesce(...)` que causou
 * este defeito — e faz a ausência de credencial virar um aviso legível em vez de
 * um 401 silencioso que ninguém lê.
 *
 * `p_exige_chave` existe porque as duas pontas não são iguais: o email-sync
 * RECUSA sem credencial (401), então chamá-lo sem ela é puro desperdício; já o
 * eventos-lembrete não confere token nenhum e responde 200 — desligá-lo por
 * falta de chave seria quebrar um lembrete que funciona para consertar outro
 * que não funciona.
 *
 * Sem chave e sem exigência, vai SEM `Authorization` nenhum, em vez de mandar um
 * "Bearer " vazio. Era exatamente esse cabeçalho meia-boca que o cliente HTTP
 * aparava para o literal "Bearer" e que produzia o 401 do email-sync.
 */
CREATE OR REPLACE FUNCTION public.chamar_edge_function(
  p_funcao text,
  p_corpo jsonb DEFAULT '{}'::jsonb,
  p_timeout_ms integer DEFAULT 120000,
  p_exige_chave boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  v_chave      text := public.chave_de_servico_dos_crons();
  v_cabecalhos jsonb := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  IF v_chave IS NULL AND p_exige_chave THEN
    RAISE WARNING
      '[cron] % não foi chamada: nenhuma credencial. Grave a chave com vault.create_secret(<chave>, ''service_role_key'').',
      p_funcao;
    RETURN;
  END IF;

  IF v_chave IS NOT NULL THEN
    v_cabecalhos := v_cabecalhos || jsonb_build_object('Authorization', 'Bearer ' || v_chave);
  END IF;

  PERFORM net.http_post(
    url := 'https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/' || p_funcao,
    headers := v_cabecalhos,
    body := p_corpo,
    timeout_milliseconds := p_timeout_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chamar_edge_function(text, jsonb, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chamar_edge_function(text, jsonb, integer, boolean) FROM anon, authenticated;

-- Reaponta os dois crons existentes para o caminho novo.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'email-sync'),
  command := $cmd$ SELECT public.chamar_edge_function('email-sync', '{"limit":50}'::jsonb, 120000, true) $cmd$
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'eventos-lembrete'),
  command := $cmd$ SELECT public.chamar_edge_function('eventos-lembrete', '{}'::jsonb, 60000, false) $cmd$
);
