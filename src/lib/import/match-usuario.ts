export interface UsuarioLite {
  id: string;
  nome: string;
}

export interface VendedorMatch {
  usuarioId: string;
  usuarioNome: string;
  exact: boolean;
}

const SIMILARITY_THRESHOLD = 0.82;

function normalizeNome(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Casa o nome de um responsável vindo da planilha contra os usuários reais da empresa,
 * tolerando acentos, maiúsculas/minúsculas e pequenas variações de digitação
 * (ex: "José da Silva" vs "Jose Silva"). Retorna null se nada bater com confiança
 * suficiente — nesse caso o negócio deve cair no usuário que está importando.
 */
export function matchUsuarioByNome(nomeRaw: string, usuarios: UsuarioLite[]): VendedorMatch | null {
  const alvo = normalizeNome(nomeRaw);
  if (!alvo || usuarios.length === 0) return null;

  let best: { usuario: UsuarioLite; score: number } | null = null;
  for (const usuario of usuarios) {
    const nomeNormalizado = normalizeNome(usuario.nome ?? '');
    if (!nomeNormalizado) continue;

    if (nomeNormalizado === alvo) {
      return { usuarioId: usuario.id, usuarioNome: usuario.nome, exact: true };
    }

    const maxLen = Math.max(nomeNormalizado.length, alvo.length);
    const similarity = maxLen === 0 ? 0 : 1 - levenshtein(nomeNormalizado, alvo) / maxLen;
    if (!best || similarity > best.score) best = { usuario, score: similarity };
  }

  if (best && best.score >= SIMILARITY_THRESHOLD) {
    return { usuarioId: best.usuario.id, usuarioNome: best.usuario.nome, exact: false };
  }
  return null;
}
