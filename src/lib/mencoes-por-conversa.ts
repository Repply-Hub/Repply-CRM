/** Menções ainda não vistas, contadas por conversa — o que acende o @ em cada lugar. */
export interface MencaoNaoLida {
  id: string;
  origem: 'chat' | 'whatsapp_nota';
  conversa_chave: string;
}

export function contarPorChave(lista: MencaoNaoLida[]) {
  const chat: Record<string, number> = {};
  const whatsapp: Record<string, number> = {};
  for (const m of lista) {
    const alvo = m.origem === 'chat' ? chat : whatsapp;
    alvo[m.conversa_chave] = (alvo[m.conversa_chave] ?? 0) + 1;
  }
  const soma = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  return { chat, whatsapp, totalChat: soma(chat), totalWhatsapp: soma(whatsapp) };
}
