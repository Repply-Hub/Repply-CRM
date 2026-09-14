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
