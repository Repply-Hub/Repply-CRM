/**
 * A regra do robô de conferência: o número não pode piorar (item 45 da dívida técnica).
 *
 * 🔴 POR QUE NÃO É "PASSAR LIMPO". Este projeto convive com saldo herdado — o lint tem
 * centenas de problemas antigos e o TypeScript, dezenas de erros. Exigir zero recusaria todo
 * envio no primeiro dia, e o robô seria desligado na primeira semana. A regra que o projeto
 * escolheu, e que já estava escrita no `CLAUDE.md` §9, é **o número não subir**. Isto aqui só
 * deixa de depender de alguém lembrar.
 *
 * A regra tem DOIS lados, e o segundo é o que a faz durar:
 *   subiu  -> recusa. É erro novo entrando.
 *   desceu -> passa, MAS avisa para baixar a linha de base. Sem isso, um conserto abre folga e
 *             a próxima regressão cabe dentro dela sem ninguém notar.
 *
 * `testes` anda ao contrário: o que não pode é CAIR. Apagar teste é o jeito silencioso de
 * ficar verde.
 *
 * Arquivo `.mjs` de propósito: roda no GitHub Actions com `node`, sem build e sem TypeScript.
 * O teste dele é `src/test/linha-de-base.test.ts` (o vitest só varre `src/`, mas importar
 * daqui funciona).
 */

/** O que cada métrica significa e para que lado ela piora. */
const METRICAS = [
  { chave: 'tsc', rotulo: 'erros de tipo', piora: 'subir' },
  { chave: 'lint', rotulo: 'problemas de lint', piora: 'subir' },
  { chave: 'testes', rotulo: 'testes que passam', piora: 'cair' },
];

/**
 * @param {Record<string, number>} base   o que está commitado em `.github/linha-de-base.json`
 * @param {Record<string, number>} agora  o que esta execução mediu
 * @returns {{ ok: boolean, problemas: Array<{metrica: string, base: number, agora: number, mensagem: string}>, avisos: string[] }}
 */
export function compararComALinhaDeBase(base, agora) {
  const problemas = [];
  const avisos = [];

  for (const { chave, rotulo, piora } of METRICAS) {
    const valorAgora = agora?.[chave];
    const valorBase = base?.[chave];

    // 🔴 Chave faltando NÃO vira zero. Com `?? 0`, uma linha de base incompleta faria o robô
    // tratar tudo como regressão e recusar qualquer envio — e alguém o desligaria no dia
    // seguinte. Melhor falhar dizendo o que falta.
    if (typeof valorBase !== 'number') {
      problemas.push({
        metrica: chave,
        base: NaN,
        agora: valorAgora,
        mensagem: `A linha de base não tem "${chave}". Acrescente em .github/linha-de-base.json.`,
      });
      continue;
    }
    if (typeof valorAgora !== 'number') {
      problemas.push({
        metrica: chave,
        base: valorBase,
        agora: NaN,
        mensagem: `Não consegui medir "${chave}" nesta execução.`,
      });
      continue;
    }

    const piorou = piora === 'subir' ? valorAgora > valorBase : valorAgora < valorBase;
    const melhorou = piora === 'subir' ? valorAgora < valorBase : valorAgora > valorBase;

    if (piorou) {
      problemas.push({
        metrica: chave,
        base: valorBase,
        agora: valorAgora,
        mensagem:
          piora === 'subir'
            ? `${rotulo}: era ${valorBase}, agora ${valorAgora}. O que entrou neste envio tem erro novo.`
            : `${rotulo}: era ${valorBase}, agora ${valorAgora}. Teste sumiu — apagar teste não é consertar.`,
      });
    } else if (melhorou) {
      avisos.push(
        `${rotulo}: melhorou de ${valorBase} para ${valorAgora}. ` +
          `Baixe a linha de base para ${valorAgora} em .github/linha-de-base.json, ` +
          `senão essa folga vira esconderijo da próxima regressão.`,
      );
    }
  }

  return { ok: problemas.length === 0, problemas, avisos };
}

/**
 * 🔴 TIRA OS CÓDIGOS DE COR ANTES DE CONTAR. O vitest e o eslint colorem a saída, e os códigos
 * de escape caem NO MEIO das palavras e dos números: "Tests \u001b[22m \u001b[32m2411 passed".
 * Um `match` no texto cru não casa e devolve NaN — e um robô que não consegue ler o número ou
 * recusa todo envio (e é desligado) ou aprova qualquer regressão. Peguei isso na mão medindo a
 * linha de base: o `grep` voltou vazio e eu quase anotei o número errado.
 */
function semCores(saida) {
  return String(saida ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

/** Extrai o número de erros de `npx tsc --noEmit -p tsconfig.app.json`. */
export function contarErrosDeTipo(saida) {
  return (semCores(saida).match(/error TS\d+/g) ?? []).length;
}

/** Extrai o total de problemas do resumo do eslint ("✖ 416 problems (…)"). */
export function contarProblemasDeLint(saida) {
  const m = semCores(saida).match(/✖\s*(\d+)\s+problem/);
  return m ? Number(m[1]) : 0;
}

/**
 * Extrai quantos testes passaram do resumo do vitest ("Tests  2411 passed (2411)").
 *
 * Devolve `NaN` quando não achou — de propósito. Zero seria "nenhum teste passou", que a
 * comparação leria como regressão gigante; `NaN` faz a comparação dizer "não consegui medir",
 * que é a verdade.
 */
export function contarTestesQuePassaram(saida) {
  const m = semCores(saida).match(/Tests\s+(\d+)\s+passed/);
  return m ? Number(m[1]) : NaN;
}
