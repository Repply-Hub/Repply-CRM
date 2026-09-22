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

/** Separa "Fulano <fulano@x.com>" em nome e endereço. */
export function separarRemetente(valor?: string | null): { nome: string; endereco: string } {
  const bruto = (valor ?? '').trim();
  if (!bruto) return { nome: 'Desconhecido', endereco: '' };
  const m = bruto.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { nome: m[1].trim() || m[2], endereco: m[2] };
  return { nome: bruto, endereco: bruto.includes('@') ? bruto : '' };
}

/**
 * Quem mostrar numa linha da BUSCA GLOBAL: o remetente (recebido) ou
 * "Para: destinatários" (enviado, onde o remetente é a própria caixa).
 */
export function quemDoResultado(r: {
  tipo: 'sent' | 'received';
  remetente: string;
  destinatarios: EnderecoDoEmail[];
}): string {
  if (r.tipo === 'sent') {
    const nomes = (r.destinatarios ?? [])
      .map((d) => (d?.name?.trim() || d?.email?.trim() || '').trim())
      .filter(Boolean);
    return nomes.length ? `Para: ${nomes.join(', ')}` : 'Para: (sem destinatário)';
  }
  return separarRemetente(r.remetente).nome;
}
