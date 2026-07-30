-- Até agora `contatos.empresa` era só texto solto, gravado uma vez no momento da
-- criação/vinculação (via seletor de empresa) e nunca mais sincronizado — se a empresa
-- fosse renomeada depois, o texto do contato ficava desatualizado. Adiciona um vínculo de
-- verdade para a coluna "Empresa do contato" sempre refletir o nome atual da empresa.
--
-- Também adiciona criado_por_usuario_id, mesmo padrão já usado em clientes: não reaproveita
-- contatos.usuario_id porque esse já significa "vendedor responsável atual" e, em
-- importações, é preenchido com quem RODOU a importação — não necessariamente quem criou
-- o registro originalmente no sistema de origem.
-- ON DELETE SET NULL em cliente_id: um contato pode existir sem empresa vinculada (já é o
-- comportamento hoje via texto livre "Sem empresa"), então excluir a empresa não deve
-- travar nem arrastar a exclusão do contato — só desvincula.
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criado_por_usuario_id UUID REFERENCES public.usuarios(id);

CREATE INDEX IF NOT EXISTS idx_contatos_cliente_id ON public.contatos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contatos_criado_por_usuario_id ON public.contatos(criado_por_usuario_id);
