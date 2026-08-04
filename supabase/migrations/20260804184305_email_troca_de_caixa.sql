-- Permite TROCAR a caixa de e-mail da empresa escolhendo o que fazer com o
-- historico ja sincronizado.
--
-- Ate aqui, desconectar era destrutivo sem alternativa: email_mensagens.conta_id
-- era NOT NULL com ON DELETE CASCADE, entao apagar a conta levava junto TODA a
-- correspondencia guardada no CRM. Quem so queria trocar de endereco perdia o
-- historico sem ter como evitar.

-- 1) A mensagem passa a poder viver sem conta. O vinculo com a EMPRESA
--    (empresa_id, NOT NULL) e que sustenta o RLS -- as duas policies de
--    email_mensagens usam empresa_id e nunca conta_id, entao mensagem orfa
--    continua isolada por empresa exatamente como antes. (Verificado nos dois
--    sentidos: a empresa dona ve as mensagens orfas, outra empresa ve zero.)
ALTER TABLE public.email_mensagens ALTER COLUMN conta_id DROP NOT NULL;

ALTER TABLE public.email_mensagens DROP CONSTRAINT email_mensagens_conta_id_fkey;
ALTER TABLE public.email_mensagens
  ADD CONSTRAINT email_mensagens_conta_id_fkey
  FOREIGN KEY (conta_id) REFERENCES public.email_contas(id) ON DELETE SET NULL;

-- 2) De qual caixa a mensagem veio.
--    Sem isto, preservar o historico produziria uma lista sem sentido depois de
--    uma troca: mensagens de dois enderecos diferentes misturadas e sem forma de
--    distinguir. E preenchida no momento da desconexao, para as linhas que
--    sobrevivem.
ALTER TABLE public.email_mensagens ADD COLUMN caixa_origem TEXT;

COMMENT ON COLUMN public.email_mensagens.caixa_origem IS
  'Endereco da caixa de onde a mensagem veio. Preenchido ao desconectar preservando o historico; nulo enquanto a conta de origem ainda existe (o endereco esta em email_contas).';

-- 3) O indice de deduplicacao vira PARCIAL.
--    Ele existe para o upsert do sync nao duplicar mensagem (on_conflict). Com
--    conta_id anulavel ele perderia sentido para as linhas arquivadas de todo
--    jeito -- no Postgres, NULLs contam como distintos num indice unico, entao
--    linhas arquivadas nunca colidem entre si. Declarar a parcialidade e
--    honesto sobre isso e ainda mantem o indice menor.
DROP INDEX IF EXISTS public.uniq_email_mensagens_conta_msg;
CREATE UNIQUE INDEX uniq_email_mensagens_conta_msg
  ON public.email_mensagens (conta_id, nylas_message_id)
  WHERE conta_id IS NOT NULL;

-- Consulta do historico arquivado sem varrer a tabela toda.
CREATE INDEX idx_email_mensagens_arquivadas
  ON public.email_mensagens (empresa_id, data_mensagem DESC)
  WHERE conta_id IS NULL;
