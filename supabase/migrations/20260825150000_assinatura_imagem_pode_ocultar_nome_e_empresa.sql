-- ============================================================================
-- Assinatura em modo imagem pode ocultar nome e nome da empresa no rodapé
-- ============================================================================
--
-- `montarRodapeEmailHtml` (src/lib/assinatura-email.ts) sempre escreve o nome
-- do usuário e "MD Representações" embaixo da assinatura no rodapé do
-- e-mail — inclusive quando a assinatura já é uma IMAGEM que o próprio
-- usuário preparou com esses dois dados desenhados dentro dela. Resultado:
-- nome e empresa apareciam duplicados no e-mail enviado.
--
-- Dois interruptores por usuário, independentes (a imagem pode já trazer só
-- um dos dois), e só valem quando a assinatura está em modo imagem
-- (`ehAssinaturaImagem`) — no modo texto o nome sempre aparece, como hoje.
-- Default `true` para não mudar o que já é enviado para quem nunca tocar
-- nessa opção nova.
-- ============================================================================

alter table public.usuarios
  add column assinatura_imagem_mostrar_nome boolean not null default true,
  add column assinatura_imagem_mostrar_empresa boolean not null default true;

comment on column public.usuarios.assinatura_imagem_mostrar_nome is
  'Só vale quando assinatura_email é uma assinatura em modo imagem (ver ehAssinaturaImagem em src/lib/assinatura-email.ts). Controla se o nome do usuário aparece de novo no rodapé do e-mail, embaixo da imagem.';

comment on column public.usuarios.assinatura_imagem_mostrar_empresa is
  'Só vale quando assinatura_email é uma assinatura em modo imagem. Controla se o nome da empresa aparece de novo no rodapé do e-mail, embaixo da imagem.';
