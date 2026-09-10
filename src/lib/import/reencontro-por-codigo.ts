/**
 * O reencontro: qual linha da planilha corresponde a qual negócio que já existe.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE. A deduplicação por conteúdo foi removida em 03/09/2026
 * (`23b3d6c9`): linha repetida passou a ser cadastrada como negócio novo, sem conferência
 * nenhuma. Sem um identificador explícito na planilha, a ida e volta
 * "exportar → anotar no Excel → devolver ao CRM" duplica a base inteira — 12.474 negócios
 * novos ao lado dos velhos, medido em 09/09/2026.
 *
 * A coluna "Código/ID" (Tarefa 1) é o identificador. Este arquivo decide, para cada linha,
 * qual dos quatro destinos ela tem. Nada aqui toca rede, React ou banco.
 *
 * Ver `docs/superpowers/specs/2026-09-09-codigo-id-na-exportacao-design.md` §5.B.
 */

/**
 * O formato do identificador de negócio (`pedidos.id`, um uuid).
 *
 * 🔴 NÃO É FRESCURA DE VALIDAÇÃO. O Postgres recusa a consulta INTEIRA quando um dos valores
 * do `in (...)` está fora do formato — `invalid input syntax for type uuid`. Uma única célula
 * com "abc", ou com o cabeçalho "Código/ID" colado por engano no corpo da planilha, derrubaria
 * a busca dos outros 12 mil códigos válidos junto. Por isso o que não casa nunca chega ao banco.
 */
const FORMATO_DO_CODIGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Onde a linha vai parar. */
export type BaldeDaLinha = 'atualiza' | 'sem_codigo' | 'nao_encontrado' | 'repetido';

export interface LinhaClassificada<T> {
  linha: T;
  /** Posição na planilha, começando em 0. É como a tela aponta a linha para a pessoa. */
  indice: number;
  balde: BaldeDaLinha;
  /** O código já aparado e em caixa baixa. Vazio quando o balde é `sem_codigo`. */
  codigo: string;
}

export interface ClassificacaoDeLinhas<T> {
  /** Todas as linhas, na ordem da planilha. Cada uma aparece aqui exatamente uma vez. */
  todas: LinhaClassificada<T>[];
  atualiza: LinhaClassificada<T>[];
  semCodigo: LinhaClassificada<T>[];
  naoEncontrado: LinhaClassificada<T>[];
  repetido: LinhaClassificada<T>[];
  /**
   * Nenhuma linha trouxe código?
   *
   * É o que distingue uma importação de BASE NOVA (o arquivo do Bitrix, a planilha de um
   * cliente novo) de uma VOLTA de exportação nossa com uma célula apagada por acidente. A
   * caixinha "criar os sem código como negócios novos" nasce marcada só no primeiro caso
   * (decisão 11 do desenho).
   */
  arquivoInteiroSemCodigo: boolean;
}

/** O código de uma linha, aparado e em caixa baixa. Vazio quando não há nada escrito. */
function codigoDaLinha(linha: { codigo?: unknown }): string {
  const bruto = linha.codigo;
  if (typeof bruto !== 'string' && typeof bruto !== 'number') return '';
  return String(bruto).trim().toLowerCase();
}

/**
 * Os códigos que vale a pena perguntar ao banco: só os que têm o formato certo, sem repetição.
 *
 * Quem chama usa isto para montar o `in (...)`. O que ficou de fora não some — vira
 * `nao_encontrado` em `classificarPorCodigo`, que é o destino honesto: o sistema não consegue
 * distinguir "não existe" de "existe e é de outra empresa", porque a regra de segurança do
 * banco simplesmente não devolve a linha nos dois casos.
 */
export function codigosParaConsultar(linhas: { codigo?: unknown }[]): string[] {
  const unicos = new Set<string>();
  for (const linha of linhas) {
    const codigo = codigoDaLinha(linha);
    if (codigo && FORMATO_DO_CODIGO.test(codigo)) unicos.add(codigo);
  }
  return [...unicos];
}

export function classificarPorCodigo<T extends { codigo?: unknown }>(
  linhas: T[],
  codigosQueExistem: ReadonlySet<string>,
): ClassificacaoDeLinhas<T> {
  // Primeira passada: quantas linhas carregam cada código. É o que revela a contradição —
  // o mesmo código em duas linhas — antes de decidir qualquer destino.
  const vezes = new Map<string, number>();
  for (const linha of linhas) {
    const codigo = codigoDaLinha(linha);
    if (codigo) vezes.set(codigo, (vezes.get(codigo) ?? 0) + 1);
  }

  const todas: LinhaClassificada<T>[] = linhas.map((linha, indice) => {
    const codigo = codigoDaLinha(linha);

    if (!codigo) return { linha, indice, balde: 'sem_codigo' as const, codigo: '' };

    // Repetido decide antes de tudo, inclusive antes de "não encontrado": duas linhas
    // mandando coisas diferentes no mesmo negócio é o problema maior, e é o que a pessoa
    // precisa ver para consertar a planilha.
    if ((vezes.get(codigo) ?? 0) > 1) return { linha, indice, balde: 'repetido' as const, codigo };

    if (!FORMATO_DO_CODIGO.test(codigo) || !codigosQueExistem.has(codigo)) {
      return { linha, indice, balde: 'nao_encontrado' as const, codigo };
    }

    return { linha, indice, balde: 'atualiza' as const, codigo };
  });

  const doBalde = (balde: BaldeDaLinha) => todas.filter(l => l.balde === balde);

  return {
    todas,
    atualiza: doBalde('atualiza'),
    semCodigo: doBalde('sem_codigo'),
    naoEncontrado: doBalde('nao_encontrado'),
    repetido: doBalde('repetido'),
    // `vezes` só recebe código não vazio, então tamanho zero significa que ninguém trouxe
    // nada escrito — inclusive quando o texto era inválido, que conta como ter trazido.
    arquivoInteiroSemCodigo: vezes.size === 0,
  };
}
