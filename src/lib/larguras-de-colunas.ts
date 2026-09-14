/**
 * AS LARGURAS DAS COLUNAS DE UMA TABELA QUE A PESSOA PODE AJUSTAR — pedido do dono do produto em
 * 14/09/2026 para a tabela do time da tela "Hoje": por padrão tudo cabe no espaço da página, e
 * quem quiser arrasta a borda do título. O ajuste fica guardado NO NAVEGADOR daquela pessoa.
 *
 * 🔴 O GUARDADO NUNCA QUEBRA A TABELA. `localStorage` pode lançar erro (aba anônima, navegador que
 * bloqueia armazenamento) e pode trazer lixo — texto que não é JSON, uma versão antiga com uma
 * coluna a menos, um número negativo. Em qualquer desses casos vale a largura-padrão da coluna.
 *
 * Regra pura, sem React: é o que deixa testar cada caso sem montar a tabela.
 */
export type ColunaAjustavel = {
  /** Nome estável da coluna no guardado. Mudar o nome perde o ajuste que as pessoas fizeram. */
  chave: string;
  /** Largura em pixels com que a coluna nasce. */
  padrao: number;
  /** Menor largura aceita: sem ela, arrastar podia esmagar a coluna até sumir. */
  minima: number;
};

export type Larguras = Record<string, number>;

type Leitor = Pick<Storage, 'getItem'>;
type Gravador = Pick<Storage, 'setItem'>;

function armazenamentoDoNavegador(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Só acessar `window.localStorage` já lança erro em alguns navegadores com armazenamento bloqueado.
    return null;
  }
}

function larguraValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

export function largurasPadrao(colunas: ColunaAjustavel[]): Larguras {
  const resultado: Larguras = {};
  for (const c of colunas) resultado[c.chave] = c.padrao;
  return resultado;
}

export function lerLarguras(
  chaveGuardada: string,
  colunas: ColunaAjustavel[],
  armazenamento: Leitor | null = armazenamentoDoNavegador(),
): Larguras {
  const padrao = largurasPadrao(colunas);
  if (!armazenamento) return padrao;

  let bruto: string | null;
  try {
    bruto = armazenamento.getItem(chaveGuardada);
  } catch {
    return padrao;
  }
  if (!bruto) return padrao;

  let guardado: unknown;
  try {
    guardado = JSON.parse(bruto);
  } catch {
    return padrao;
  }
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return padrao;

  const resultado: Larguras = {};
  for (const c of colunas) {
    const valor = (guardado as Record<string, unknown>)[c.chave];
    resultado[c.chave] = larguraValida(valor) ? Math.max(c.minima, Math.round(valor)) : c.padrao;
  }
  return resultado;
}

export function gravarLarguras(
  chaveGuardada: string,
  larguras: Larguras,
  armazenamento: Gravador | null = armazenamentoDoNavegador(),
): void {
  if (!armazenamento) return;
  try {
    armazenamento.setItem(chaveGuardada, JSON.stringify(larguras));
  } catch {
    // Sem onde guardar, o ajuste vale só até recarregar a página. Não é motivo para quebrar a tela.
  }
}

export function ajustarLargura(larguras: Larguras, coluna: ColunaAjustavel, novaLargura: number): Larguras {
  return { ...larguras, [coluna.chave]: Math.max(coluna.minima, Math.round(novaLargura)) };
}

export function restaurarColuna(larguras: Larguras, coluna: ColunaAjustavel): Larguras {
  return { ...larguras, [coluna.chave]: coluna.padrao };
}

export function somaDasLarguras(larguras: Larguras, colunas: ColunaAjustavel[]): number {
  return colunas.reduce((soma, c) => soma + (larguras[c.chave] ?? c.padrao), 0);
}
