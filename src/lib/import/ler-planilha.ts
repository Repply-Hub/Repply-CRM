import * as XLSX from 'xlsx';
import { expandMergedCells } from './expand-merged-cells';

/**
 * O ÚNICO lugar onde uma planilha de importação é lida.
 *
 * 🔴 POR QUE ESTE ARQUIVO PRECISOU EXISTIR. O bug de dia e mês trocados foi corrigido em
 * 20/08/2026 (commit `446779ff`) — e voltou em 01/09/2026, quando o Lucas importou 2.358
 * negócios e 786 saíram com a data invertida. O conserto nunca tinha sido revertido: ele
 * estava em `file-parser.ts`, que **nenhuma tela renderizada chama**. Existiam TRÊS leituras
 * de planilha independentes no projeto, e a que a MD usa (`ImportPedidosDialog`) tinha a sua
 * própria, sem a proteção.
 *
 * Medido em produção em 01/09/2026, na importação das 14:10:
 *
 *   linhas com dia 13..31 (o "13" denuncia o formato americano, o conversor acerta) ... 1.572
 *     delas, em meses de setembro a dezembro .............................................. 0
 *   linhas com dia 01..12 (ambíguo, o conversor chuta) ................................... 786
 *     delas, em meses de setembro a dezembro ............................................ 294
 *
 * Zero contra 37,4% no mesmo arquivo é a assinatura da troca — e as 294 caíram em datas que
 * ainda não aconteceram. Nenhuma linha foi rejeitada.
 *
 * A lição não é sobre datas, é sobre duplicação: **o conserto certo no arquivo errado não
 * conserta nada.** Por isso a leitura mora aqui, sozinha.
 */

/**
 * Reescreve o texto exibido das células de data para ISO (`AAAA-MM-DD`, com `THH:mm` quando
 * há hora).
 *
 * POR QUE ISTO EXISTE: `sheet_to_json` com `raw: false` devolve o texto FORMATADO da célula.
 * A planilha do Bitrix traz a data com o formato curto embutido do Excel (`m/d/yy`), que é
 * **americano** — então o SheetJS escreve `"8/12/26"` para 12 de agosto de 2026.
 *
 * Daí para frente ninguém mais consegue saber se `8/12` é 8 de dezembro ou 12 de agosto, e
 * `sanitizeFieldValue` precisa adivinhar.
 *
 * A informação inequívoca existe na célula. Este passo simplesmente para de jogá-la fora.
 *
 * 🔴 Mexe em `w` (o texto exibido) e não no valor, porque é `w` que o `raw: false` lê. Isso
 * quer dizer que chamar esta função numa leitura com `raw: true` **não faz absolutamente
 * nada** — foi medido, e é a pegadinha que quase fez o conserto nascer inútil de novo na
 * tela de Clientes. Quem lê com `raw: true` recebe a célula de data como `Date` de verdade
 * (por causa de `cellDates`) e não precisa desta função.
 */
export function normalizarDatas(sheet: XLSX.WorkSheet): void {
  if (!sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);

  const dois = (n: number) => String(n).padStart(2, '0');

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell || cell.t !== 'd' || !(cell.v instanceof Date)) continue;

      const d = cell.v;
      // Getters locais, e não `toISOString()`: com `cellDates` o SheetJS constrói o Date com
      // o construtor local. Usar UTC aqui deslocaria a data em um dia para quem está a oeste
      // de Greenwich — que é o caso do Brasil inteiro (CLAUDE.md §7.12).
      const data = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
      const temHora = d.getHours() || d.getMinutes() || d.getSeconds();
      cell.w = temHora ? `${data}T${dois(d.getHours())}:${dois(d.getMinutes())}` : data;
    }
  }
}

/**
 * Abre a planilha e devolve uma linha por objeto, chaveada pelo cabeçalho.
 *
 * 🔴 CSV é lido por outro caminho, e não é capricho. Medido com o SheetJS 0.18.5 do projeto:
 *
 *   | no arquivo     | lido como as telas liam | lido com `raw: true` |
 *   |----------------|-------------------------|----------------------|
 *   | `12/08/2026`   | `12/8/26`               | `12/08/2026`         |
 *   | `2026-08-12`   | **`8/11/26`**           | `2026-08-12`         |
 *   | `AÇÃO`         | **`AÃÃO`**              | `AÇÃO`               |
 *
 * O parser de CSV do SheetJS reinterpreta a data sozinho, em ordem americana, ANTES de
 * qualquer código nosso — e a data em ISO volta com **um dia a menos**. Ou seja: exportar
 * Negócios, abrir no Excel, salvar como CSV e reimportar recuava a base inteira em um dia.
 * O acento se perdia junto, porque `type: 'array'` num CSV lê byte a byte e não sabe que
 * aquilo é UTF-8.
 *
 * `raw: true` desliga a interpretação e entrega o texto como está escrito; `file.text()`
 * decodifica como texto de verdade. A decisão de qual segmento é dia e qual é mês passa a
 * ser tomada depois, olhando a coluna inteira (`ordem-de-data.ts`).
 */
export interface OpcoesDeLeitura {
  /**
   * Devolver número como número, em vez do texto formatado.
   *
   * 🔴 PRECISA EXISTIR POR CAUSA DO CNPJ. Medido com o xlsx 0.18.5 do projeto: com o texto
   * formatado, a célula `12345678000190` volta como **`"1.23457E+13"`**, e a limpeza de
   * não-dígitos transforma isso no CNPJ inexistente `12345713`. Quem importa Clientes
   * precisa deste modo; quem importa Negócios não tem coluna numérica longa e usa o texto,
   * que é o que o restante daquela tela sempre esperou.
   *
   * Neste modo a célula de data chega como `Date` de verdade (por causa de `cellDates`), e
   * `sanitizeFieldValue` já sabe lidar com ela sem adivinhar nada — por isso
   * `normalizarDatas`, que só escreve no texto exibido, não faz falta aqui.
   */
  preservarNumeros?: boolean;
}

export async function lerPlanilhaComoObjetos(
  file: File,
  opcoes: OpcoesDeLeitura = {},
): Promise<Record<string, unknown>[]> {
  const nome = file.name.toLowerCase();
  let workbook: XLSX.WorkBook;

  if (nome.endsWith('.csv')) {
    workbook = XLSX.read(await file.text(), { type: 'string', raw: true });
  } else {
    // `cellDates` faz o SheetJS resolver a célula de data para um Date de verdade em vez de
    // deixá-la como número solto — é o que permite `normalizarDatas` reconhecê-la.
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  // A ordem importa: `expandMergedCells` copia a célula âncora para as vagas do bloco
  // mesclado, e `normalizarDatas` precisa rodar DEPOIS para alcançar cada cópia.
  expandMergedCells(sheet);
  normalizarDatas(sheet);

  // Modo objeto de propósito, e não `header: 1`: é o SheetJS que resolve cabeçalho vazio
  // (vira `__EMPTY`) e cabeçalho repetido (vira `Data`, `Data_1`). Montar as linhas à mão a
  // partir de uma lista de cabeçalhos filtrada desalinha as colunas quando falta um título
  // no meio — ver o comentário em `file-parser.ts`.
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: Boolean(opcoes.preservarNumeros),
  });
}
