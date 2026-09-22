/**
 * Um endereço no formato que o Nylas grava em `email_mensagens.destinatarios`/
 * `cc`/`bcc` (jsonb): `{ name?, email }` — ver migration
 * `20260804121322_email_nylas.sql` e `mensagemParaLinha` em
 * `supabase/functions/_shared/nylas.ts`. `email` vem opcional aqui só porque a
 * coluna é `Json` no tipo gerado (`types.ts`); item sem endereço é descartado
 * na exibição.
 *
 * Tipo compartilhado pelo leitor e por cada mensagem da conversa; os helpers de
 * exibição (separarRemetente, ListaDeEnderecos…) vivem em `MensagemConversa`,
 * o único que os usa.
 */
export interface EnderecoDoEmail {
  name?: string | null;
  email?: string | null;
}
