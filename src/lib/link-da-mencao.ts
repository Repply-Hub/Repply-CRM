/**
 * Liga o aviso do sininho (`notificacoes.tipo = 'mencao'`) à conversa que o gerou, pelo
 * mesmo `link` que os gatilhos de `supabase/migrations/20260911140000_mencoes.sql` gravam
 * (§5 chat, §6 nota do WhatsApp). Usado só para MARCAR como lido ao abrir a conversa — o
 * clique no próprio aviso usa o link como já está gravado, sem passar por aqui.
 *
 * Chat: um link só por conversa (`/chat?conversa=<chave>`) — `<chave>` é 'geral' ou
 * 'grupo_<id>' —, então basta igualdade.
 *
 * Nota do WhatsApp: cada nota grava o PRÓPRIO id no fim do link
 * (`/whatsapp?conversaId=<chave>&mensagemId=<idDaNota>`), então o que identifica a
 * conversa é só o COMEÇO do link — daí o curinga.
 */
export interface FiltroDeLinkDaConversa {
  tipo: 'igual' | 'comeca_com';
  /** Para 'igual', o link exato. Para 'comeca_com', já com o curinga (%) do SQL LIKE. */
  valor: string;
}

export function filtroDeLinkDaConversa(
  origem: 'chat' | 'whatsapp_nota',
  chave: string,
): FiltroDeLinkDaConversa {
  if (origem === 'chat') {
    return { tipo: 'igual', valor: `/chat?conversa=${chave}` };
  }
  return { tipo: 'comeca_com', valor: `/whatsapp?conversaId=${chave}&mensagemId=%` };
}
