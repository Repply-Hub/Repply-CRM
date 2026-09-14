/**
 * O endereço de cada conversa do chat interno: `/chat?conversa=geral`,
 * `/chat?conversa=grupo_<id>`, `/chat?conversa=dm_<id>` — as mesmas chaves que os
 * contadores de não lidas já usam (`useUnreadChatByTarget`). Até 11/09/2026 o aviso de
 * chat levava só para `/chat`, e a pessoa tinha de procurar a conversa.
 */
export type AlvoDoChat =
  | { type: 'geral' }
  | { type: 'grupo'; grupoId: string }
  | { type: 'dm'; memberId: string; recipientId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function alvoDaChave(chave: string | null | undefined): AlvoDoChat | null {
  if (chave === 'geral') return { type: 'geral' };
  const m = /^(grupo|dm)_(.+)$/.exec(chave ?? '');
  if (!m || !UUID.test(m[2])) return null;
  return m[1] === 'grupo'
    ? { type: 'grupo', grupoId: m[2] }
    : { type: 'dm', memberId: m[2], recipientId: m[2] };
}

export function chaveDoAlvo(alvo: AlvoDoChat): string {
  if (alvo.type === 'geral') return 'geral';
  return alvo.type === 'grupo' ? `grupo_${alvo.grupoId}` : `dm_${alvo.memberId}`;
}

/**
 * A chave do alvo a partir de uma linha de `chat_mensagens` (a do banco ou a
 * do payload do realtime — as duas têm os três campos abaixo). Mesma regra
 * que `useUnreadChatByTarget` já usa para contar não lidas por conversa:
 * grupo manda; senão, `recipient_id` preenchido é mensagem direta PARA mim, e
 * o outro lado da conversa é quem mandou (`usuario_id`), não o destinatário;
 * sem nenhum dos dois, é o Geral.
 */
export function chaveDaMensagemDoChat(msg: {
  grupo_id: string | null;
  recipient_id: string | null;
  usuario_id: string;
}): string {
  if (msg.grupo_id) return `grupo_${msg.grupo_id}`;
  if (msg.recipient_id) return `dm_${msg.usuario_id}`;
  return 'geral';
}

/**
 * O alvo inicial do chat a partir do parâmetro `?conversa=` da URL. É só
 * `alvoDaChave` com um nome que fala do lugar que a chama — extraído para a
 * tela (`Chat.tsx`) poder testar essa decisão sem se montar inteira, que
 * puxaria cliente do Supabase e uma dezena de hooks só para isto.
 */
export function alvoInicialDaUrl(conversa: string | null): AlvoDoChat | null {
  return alvoDaChave(conversa);
}
