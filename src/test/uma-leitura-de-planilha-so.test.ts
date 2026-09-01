import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Só existe UM lugar no projeto que abre uma planilha de importação.
 *
 * 🔴 O BUG QUE ISTO IMPEDE — e ele já aconteceu duas vezes, com o mesmo conserto.
 *
 * Em 20/08/2026 o dia e o mês trocados na importação do Bitrix24 foram corrigidos: a leitura
 * passou a usar `cellDates` e a normalizar a data antes de qualquer adivinhação. O conserto
 * foi medido contra 26.181 datas reais, deu 100%, e foi dado como resolvido.
 *
 * Em 01/09/2026 o Lucas importou 2.358 negócios e **786 entraram com dia e mês trocados**.
 *
 * O conserto nunca tinha sido revertido. Ele estava em `file-parser.ts`, que **nenhuma tela
 * renderizada chamava**, enquanto a tela que a MD usa de verdade tinha a sua PRÓPRIA leitura
 * de planilha, escrita antes e nunca migrada. Havia três leituras independentes no projeto.
 * As 26.181 datas foram validadas pelo caminho que ninguém usava.
 *
 * A lição não é sobre datas: **o conserto certo no arquivo errado não conserta nada.** E
 * nenhum teste de comportamento pega isso, porque cada leitura passa nos seus próprios
 * testes. Só um teste estrutural — este — percebe o nascimento de uma quarta.
 *
 * SE ESTE TESTE FALHOU: não acrescente o arquivo novo à lista de exceções sem pensar. O
 * caminho certo quase sempre é chamar `lerPlanilhaComoObjetos` de
 * `src/lib/import/ler-planilha.ts`, que já cuida de célula mesclada, data, acento em CSV e
 * número longo. A lista abaixo é para quem lê planilha para OUTRA coisa que não importar.
 */

const RAIZ = join(process.cwd(), 'src');

/**
 * Quem pode abrir planilha por conta própria, e por quê.
 *
 * `FilePreviewDialog` não importa nada: ele mostra o anexo que alguém mandou no chat, para
 * a pessoa olhar. Não grava linha no banco, então a conversão de data não o alcança.
 */
const PODEM_LER_PLANILHA = [
  'lib/import/ler-planilha.ts',
  'lib/import/file-parser.ts',
  'components/chat/FilePreviewDialog.tsx',
];

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, achados);
    } else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe('uma leitura de planilha só', () => {
  it('🔴 nenhum arquivo novo abre planilha por conta própria', () => {
    const permitidos = new Set(PODEM_LER_PLANILHA);

    const infratores = arquivosDeCodigo(RAIZ)
      .filter((caminho) => /XLSX\.read\s*\(/.test(readFileSync(caminho, 'utf8')))
      .map((caminho) => relative(RAIZ, caminho).split('\\').join('/'))
      .filter((relativo) => !permitidos.has(relativo));

    expect(infratores).toEqual([]);
  });

  it('as telas de importação não montam as linhas sozinhas', () => {
    // `sheet_to_json` é o passo em que a planilha vira linha; fora do leitor comum, ele
    // significa que alguém remontou o caminho inteiro à mão outra vez.
    //
    // A busca é pela CHAMADA qualificada, e não pelo nome solto: `expand-merged-cells.ts`
    // cita a função em comentário para explicar o que faz, e comentário não é código.
    const permitidos = new Set(PODEM_LER_PLANILHA);

    const infratores = arquivosDeCodigo(RAIZ)
      .filter((caminho) => /XLSX\.utils\.sheet_to_json/.test(readFileSync(caminho, 'utf8')))
      .map((caminho) => relative(RAIZ, caminho).split('\\').join('/'))
      .filter((relativo) => !permitidos.has(relativo));

    expect(infratores).toEqual([]);
  });
});
