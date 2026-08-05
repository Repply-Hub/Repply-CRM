-- Faltava o caso do e-mail NOVO.
--
-- A regra de conversa (20260805131001) resolve a RESPOSTA: a enviada é visível
-- para quem enxerga a conversa de origem. Mas quem tem acesso só a um marcador
-- e clica em "Escrever" cria uma mensagem sem conversa de origem — nenhuma
-- recebida para ancorar — e ela ficava invisível para o próprio remetente, para
-- sempre. A pessoa envia, vê o aviso de sucesso, e o e-mail não aparece em
-- Enviados.
--
-- O critério que faltava é o mais simples de todos: VOCÊ SEMPRE VÊ O QUE VOCÊ
-- ENVIOU. Não alarga nada — é a própria correspondência da pessoa.
--
-- Fica na POLICY e não dentro de `tenho_acesso_a_mensagem` porque `enviado_por`
-- é uma coluna comum da própria linha avaliada: não precisa de SECURITY DEFINER
-- nem de mais um parâmetro na função.
--
-- DEPENDE de `enviado_por` ser realmente gravado. Não era: o upsert do
-- email-enviar usava `ignoreDuplicates: true` e o webhook `message.created`
-- vence a corrida — medido, 27 de 27 mensagens enviadas em produção tinham
-- `enviado_por`, `corpo_html` e `envio_status` NULOS. Corrigido na mesma
-- entrega, em supabase/functions/email-enviar/index.ts.
ALTER POLICY email_mensagens_select ON public.email_mensagens
  USING (
    empresa_id = public.get_my_empresa_id()
    AND (
      enviado_por = public.get_my_usuario_id()
      OR public.tenho_acesso_a_mensagem(conta_id, pastas, nylas_thread_id, direcao)
    )
  );

ALTER POLICY email_mensagens_update ON public.email_mensagens
  USING (
    empresa_id = public.get_my_empresa_id()
    AND (
      enviado_por = public.get_my_usuario_id()
      OR public.tenho_acesso_a_mensagem(conta_id, pastas, nylas_thread_id, direcao)
    )
  )
  WITH CHECK (
    empresa_id = public.get_my_empresa_id()
    AND (
      enviado_por = public.get_my_usuario_id()
      OR public.tenho_acesso_a_mensagem(conta_id, pastas, nylas_thread_id, direcao)
    )
  );

-- A regra lê `enviado_por` a cada linha; sem índice, filtrar "o que eu enviei"
-- é varredura.
CREATE INDEX IF NOT EXISTS idx_email_mensagens_enviado_por
  ON public.email_mensagens (enviado_por)
  WHERE enviado_por IS NOT NULL;
