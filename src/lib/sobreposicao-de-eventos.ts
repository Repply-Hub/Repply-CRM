/**
 * Onde cada evento se encaixa quando dois compromissos disputam o mesmo horário.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 27/08/2026 todo bloco da agenda era desenhado com a mesma
 * posição — `absolute left-0.5 right-0.5` (`TimeGridView.tsx:54`) — sem nenhum cálculo de
 * choque. Dois compromissos às 9h ficavam exatamente um SOBRE o outro: o de baixo sumia
 * inteiro e não dava nem para clicar nele. Era o "itens sobrepostos" que o Lucas relatou.
 *
 * A saída é a de qualquer agenda: quem disputa o mesmo horário divide a largura. Esta função
 * só decide QUAL fatia cabe a cada um; quem desenha é o `TimeGridView`.
 *
 * Função pura para poder ser fixada em teste — as armadilhas aqui (encostar não é sobrepor,
 * coluna reaproveitada, grupo encadeado) são fáceis de errar e difíceis de ver na tela.
 */

export interface FaixaDeTempo {
  inicio: Date;
  fim: Date;
}

export interface Encaixe<T> {
  evento: T;
  /** Qual fatia, contando do zero. */
  coluna: number;
  /** Em quantas fatias a largura foi dividida NESTE grupo de choque. */
  colunas: number;
}

export function distribuirEmColunas<T extends FaixaDeTempo>(eventos: T[]): Encaixe<T>[] {
  if (!eventos.length) return [];

  // Dado torto existe na base: se o fim vier antes do início, trate a faixa como instantânea
  // em vez de deixar o cálculo enlouquecer. A agenda tem que continuar desenhando o resto.
  const faixa = (e: T) => {
    const i = e.inicio.getTime();
    const f = e.fim.getTime();
    return { i, f: Math.max(i, f) };
  };

  const ordenados = [...eventos]
    .map((evento, entrada) => ({ evento, entrada, ...faixa(evento) }))
    // Por início; empate desfeito pelo mais longo primeiro, e depois pela ordem de entrada —
    // sem esse último critério a mesma lista embaralhada daria resultado diferente.
    .sort((a, b) => a.i - b.i || b.f - a.f || a.entrada - b.entrada);

  const resultado: Encaixe<T>[] = [];

  // Um GRUPO é um trecho contínuo em que sempre há alguém acontecendo. Todo mundo do grupo
  // divide a MESMA quantidade de colunas, mesmo quem não encosta em todo mundo: a e c podem
  // não se sobrepor, mas se ambos sobrepõem b, os três precisam caber lado a lado.
  let grupo: typeof ordenados = [];
  let fimDoGrupo = -Infinity;

  const fecharGrupo = () => {
    if (!grupo.length) return;

    // `fimPorColuna[k]` guarda quando a coluna k ficou livre. Cada evento entra na PRIMEIRA
    // coluna já livre — é isso que reaproveita espaço em vez de abrir coluna nova à toa.
    const fimPorColuna: number[] = [];
    const colunaDe = new Map<number, number>();

    for (const item of grupo) {
      let k = fimPorColuna.findIndex((livreEm) => livreEm <= item.i);
      if (k === -1) {
        k = fimPorColuna.length;
        fimPorColuna.push(item.f);
      } else {
        fimPorColuna[k] = item.f;
      }
      colunaDe.set(item.entrada, k);
    }

    const colunas = fimPorColuna.length;
    for (const item of grupo) {
      resultado.push({ evento: item.evento, coluna: colunaDe.get(item.entrada)!, colunas });
    }

    grupo = [];
    fimDoGrupo = -Infinity;
  };

  for (const item of ordenados) {
    // 🔴 `>=`, não `>`. Terminar às 10h e começar às 10h NÃO é sobreposição — é o
    // compromisso seguinte. Com `>` a agenda de quem marca horários colados ficaria com
    // metade da largura sem motivo.
    if (item.i >= fimDoGrupo) fecharGrupo();

    grupo.push(item);
    fimDoGrupo = Math.max(fimDoGrupo, item.f);
  }
  fecharGrupo();

  return resultado;
}
