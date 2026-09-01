import type { DiagnosticoDeColuna } from './ordem-de-data';

/**
 * A conferência que roda na PRÉVIA da importação, antes de qualquer linha ir para o banco.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE. Em 01/09/2026, 786 dos 2.358 negócios importados entraram
 * com dia e mês trocados — e **nada avisou**. Nenhuma linha foi rejeitada, nenhum número
 * pareceu estranho na tela, e o erro só apareceu quando alguém foi olhar o painel.
 *
 * O sinal que teria pegado tudo custava uma comparação: 294 daqueles negócios ficaram com
 * **data de criação em setembro a dezembro de 2026** — meses que ainda não aconteceram.
 *
 * 🔴 E POR QUE É "DATA NO FUTURO", e não uma estatística mais fina. A alternativa óbvia
 * seria procurar distribuição estranha na coluna, e ela NÃO teria funcionado: a troca só
 * atingiu as linhas cujo dia real era de 1 a 12, então as outras 1.572 mantiveram dia acima
 * de 12 e o histograma continuou com cara normal. O que ficou impossível foi só isto —
 * negócio criado no futuro. É de custo zero, não tem falso positivo, e é exatamente o que
 * ninguém pensou em conferir.
 *
 * 🔴 FECHAMENTO no futuro é DIFERENTE, e não é alarme. `prazo_resposta` é a data de
 * fechamento e, para negócio aberto, ela é uma PREVISÃO — estar à frente de hoje é o normal
 * dela (CLAUDE.md §4.4). Contar as duas juntas transformaria o aviso em ruído, e aviso que
 * aparece sempre é aviso que ninguém lê.
 */

export interface LinhaParaConferencia {
  data_pedido?: unknown;
  prazo_resposta?: unknown;
}

export interface ColunaIndecidida {
  cabecalho: string;
  ambiguas: number;
  total: number;
  exemplo?: string;
}

export interface ColunaEmConflito {
  cabecalho: string;
  exemploBr?: string;
  exemploUs?: string;
}

export interface AvisoDeDatas {
  /** Negócios com data de CRIAÇÃO depois de hoje. Isso não existe: é o sinal da troca. */
  criacaoNoFuturo: number;
  /** A mais distante delas, em `AAAA-MM-DD`, para a mensagem poder ser concreta. */
  criacaoMaisDistante?: string;
  /** Fechamento depois de hoje. Legítimo para negócio aberto — informa, não alarma. */
  fechamentoNoFuturo: number;
  /** Colunas em que nenhuma linha provou se é dia/mês ou mês/dia. */
  colunasIndecididas: ColunaIndecidida[];
  /** Colunas com datas nos dois formatos — a planilha tem linha errada de qualquer jeito. */
  colunasEmConflito: ColunaEmConflito[];
  /** Vale segurar a mão de quem vai importar? Só a criação no futuro pesa aqui. */
  grave: boolean;
}

/** `AAAA-MM-DD` no fuso de quem está olhando a tela — nunca `toISOString`, que é UTC. */
function diaLocal(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/**
 * As datas chegam aqui já convertidas, em `AAAA-MM-DD` (às vezes com hora colada). A
 * comparação é feita como TEXTO de propósito: nesse formato a ordem alfabética é a ordem
 * cronológica, e nenhum `new Date` entra na conta — que é justamente onde o fuso horário
 * costuma roubar um dia (CLAUDE.md §7.12).
 */
function soODia(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const dia = valor.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
}

export function conferirDatasImportadas(
  linhas: readonly LinhaParaConferencia[],
  diagnosticos: Readonly<Record<string, DiagnosticoDeColuna>> = {},
  // Injetado para o teste não apodrecer sozinho quando o calendário virar.
  hoje: Date = new Date(),
): AvisoDeDatas {
  const limite = diaLocal(hoje);

  let criacaoNoFuturo = 0;
  let criacaoMaisDistante: string | undefined;
  let fechamentoNoFuturo = 0;

  for (const linha of linhas ?? []) {
    const criacao = soODia(linha?.data_pedido);
    if (criacao && criacao > limite) {
      criacaoNoFuturo++;
      if (!criacaoMaisDistante || criacao > criacaoMaisDistante) criacaoMaisDistante = criacao;
    }

    const fechamento = soODia(linha?.prazo_resposta);
    if (fechamento && fechamento > limite) fechamentoNoFuturo++;
  }

  const colunasIndecididas: ColunaIndecidida[] = [];
  const colunasEmConflito: ColunaEmConflito[] = [];

  for (const [cabecalho, d] of Object.entries(diagnosticos ?? {})) {
    if (d.conflito) {
      colunasEmConflito.push({ cabecalho, exemploBr: d.exemploBr, exemploUs: d.exemploUs });
    } else if (!d.decidida && d.ambiguas > 0) {
      colunasIndecididas.push({ cabecalho, ambiguas: d.ambiguas, total: d.total, exemplo: d.exemplo });
    }
  }

  return {
    criacaoNoFuturo,
    criacaoMaisDistante,
    fechamentoNoFuturo,
    colunasIndecididas,
    colunasEmConflito,
    grave: criacaoNoFuturo > 0,
  };
}

/** A frase que vai para a tela. Vazia quando não há nada a dizer. */
export function textoDoAviso(aviso: AvisoDeDatas): string[] {
  const frases: string[] = [];

  if (aviso.criacaoNoFuturo > 0) {
    const quantos = aviso.criacaoNoFuturo === 1
      ? '1 negócio ficou com data de criação no futuro'
      : `${aviso.criacaoNoFuturo} negócios ficaram com data de criação no futuro`;
    const ate = aviso.criacaoMaisDistante
      ? ` (o mais distante em ${aviso.criacaoMaisDistante.split('-').reverse().join('/')})`
      : '';
    frases.push(
      `${quantos}${ate}. Data de criação no futuro não existe — quase sempre é dia e mês trocados na planilha.`,
    );
  }

  aviso.colunasEmConflito.forEach((c) => {
    const exemplos = [c.exemploBr, c.exemploUs].filter(Boolean).join(' e ');
    frases.push(
      `A coluna "${c.cabecalho}" tem datas escritas de dois jeitos${exemplos ? ` (${exemplos})` : ''}. Uma parte dela vai entrar errada.`,
    );
  });

  aviso.colunasIndecididas.forEach((c) => {
    frases.push(
      `Não deu para saber se a coluna "${c.cabecalho}" está em dia/mês ou mês/dia: todas as ${c.total} datas cabem nos dois. Estamos lendo como dia/mês${c.exemplo ? `, então ${c.exemplo} é dia ${Number(c.exemplo.split(/[/-]/)[0])}` : ''}.`,
    );
  });

  return frases;
}
