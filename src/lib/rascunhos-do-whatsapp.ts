/**
 * O que a pessoa escreveu e ainda não mandou, POR CONVERSA.
 *
 * 🔴 O defeito que isto conserta: `WhatsAppInbox` tinha um `useState("")` só para
 * a tela inteira. Começar a escrever numa conversa e trocar de chat levava o
 * texto junto — e a pessoa mandava para a pessoa errada.
 *
 * Vive no navegador daquela pessoa, e não no banco, por decisão do dono do
 * produto (09/09/2026): é o comportamento do WhatsApp Web, não custa tabela nova
 * e um texto meio escrito não passa a existir no servidor.
 *
 * A chave inclui o id do usuário porque duas pessoas dividem computador — sem
 * isso, o rascunho de uma apareceria para a outra.
 */

type Rascunhos = Record<string, string>;

function chave(usuarioId: string): string {
  return `repply_wa_rascunhos_${usuarioId}`;
}

function gravar(usuarioId: string, r: Rascunhos): Rascunhos {
  try {
    localStorage.setItem(chave(usuarioId), JSON.stringify(r));
  } catch {
    /* sem armazenamento: o rascunho vale só enquanto a aba estiver aberta */
  }
  return r;
}

export function lerRascunhos(usuarioId: string): Rascunhos {
  try {
    const cru = localStorage.getItem(chave(usuarioId));
    if (!cru) return {};
    const lido = JSON.parse(cru);
    // Lixo gravado por uma versão antiga não pode derrubar a tela inteira.
    if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return {};
    const limpo: Rascunhos = {};
    for (const [k, v] of Object.entries(lido)) {
      if (typeof v === 'string' && v.trim()) limpo[k] = v;
    }
    return limpo;
  } catch {
    return {};
  }
}

export function gravarRascunho(usuarioId: string, conversaId: string, texto: string): Rascunhos {
  const atual = lerRascunhos(usuarioId);
  // Só espaço não é rascunho: seria um selo vermelho eterno sem nada escrito.
  if (!texto.trim()) return limparRascunho(usuarioId, conversaId);
  return gravar(usuarioId, { ...atual, [conversaId]: texto });
}

export function limparRascunho(usuarioId: string, conversaId: string): Rascunhos {
  const { [conversaId]: _fora, ...resto } = lerRascunhos(usuarioId);
  return gravar(usuarioId, resto);
}

/**
 * Descarta rascunho de conversa que não existe mais. Sem isto o mapa cresce para
 * sempre. Lista vazia NÃO poda: significa "a lista ainda não chegou", e podar
 * ali apagaria tudo enquanto a tela carrega.
 */
export function podarRascunhos(usuarioId: string, idsVivos: string[]): Rascunhos {
  const atual = lerRascunhos(usuarioId);
  if (idsVivos.length === 0) return atual;
  const vivos = new Set(idsVivos);
  const podado: Rascunhos = {};
  for (const [id, texto] of Object.entries(atual)) {
    if (vivos.has(id)) podado[id] = texto;
  }
  return gravar(usuarioId, podado);
}
