// Miolo puro da sincronização de calendário — SEM dependência externa, de propósito.
//
// 🔴 Este arquivo roda em DOIS mundos: no Deno (as funções de borda `calendario-sincronizar` e
// `calendario-google`) e no Node (os testes Vitest, via reexport em `src/lib/calendario/*`). Por
// isso NÃO pode importar `date-fns` (o Deno não resolve o import "solto") nem nada de ambiente —
// toda a matemática de data é feita à mão. É a fonte ÚNICA de `paraGoogle`/`paraRepply` e das
// regras de conflito; os arquivos em `src/lib/calendario/` só reexportam daqui.

// ---- Mapeamento evento Repply ↔ recurso do Google -------------------------------------------

/** Um evento do Repply reduzido ao que a sincronização precisa. inicio/fim são ISO timestamptz. */
export interface EventoParaSincronizar {
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
}

export interface PontoGoogle {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface RecursoGoogle {
  summary: string;
  description?: string;
  start: PontoGoogle;
  end: PontoGoogle;
}

/** A data (AAAA-MM-DD) de um instante ISO — o dia-inteiro do Repply já vem à meia-noite. */
function dataISO(instante: string): string {
  return instante.slice(0, 10);
}

/**
 * Soma `n` dias a uma data AAAA-MM-DD, ancorando ao MEIO-DIA LOCAL (sem 'Z') — mesma família do
 * começo ao fim, imune a qualquer fuso do host (CLAUDE.md §7.12). Devolve AAAA-MM-DD. Feito à mão
 * para não depender de `date-fns` (ver o topo do arquivo).
 */
function somaDias(dataAAAAMMDD: string, n: number): string {
  const d = new Date(dataAAAAMMDD + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function paraGoogle(e: EventoParaSincronizar, fusoHorario: string): RecursoGoogle {
  const base: RecursoGoogle = { summary: e.titulo, start: {}, end: {} };
  if (e.descricao) base.description = e.descricao;

  if (e.diaInteiro) {
    // Google usa data-fim EXCLUSIVA: o dia seguinte ao último dia do evento.
    base.start = { date: dataISO(e.inicio) };
    base.end = { date: somaDias(dataISO(e.fim), 1) };
  } else {
    base.start = { dateTime: e.inicio, timeZone: fusoHorario };
    base.end = { dateTime: e.fim, timeZone: fusoHorario };
  }
  return base;
}

export function paraRepply(g: RecursoGoogle): {
  titulo: string; descricao: string | null; inicio: string; fim: string; diaInteiro: boolean;
} {
  const titulo = g.summary ?? '(sem título)';
  const descricao = g.description ?? null;

  if (g.start.date && g.end.date) {
    const inicio = g.start.date + 'T00:00:00.000Z';
    // Desfaz a data-fim exclusiva: último dia real = fim exclusivo - 1 dia, às 23:59:59.
    const ultimoDia = somaDias(g.end.date, -1);
    return { titulo, descricao, inicio, fim: ultimoDia + 'T23:59:59.000Z', diaInteiro: true };
  }

  return {
    titulo, descricao,
    inicio: g.start.dateTime!, fim: g.end.dateTime!, diaInteiro: false,
  };
}

// ---- Conflito e proteções da sincronização --------------------------------------------------

/** Mais recente vence; empate favorece o Repply (a fonte oficial do evento). */
export function quemVence(repplyAtualizadoEm: string, googleAtualizadoEm: string): 'repply' | 'google' {
  const r = new Date(repplyAtualizadoEm).getTime();
  const g = new Date(googleAtualizadoEm).getTime();
  return g > r ? 'google' : 'repply';
}

/** Disjuntor: acima disto, uma passada de sincronização PARA em vez de apagar em massa. */
export const LIMITE_EXCLUSAO_EM_LOTE = 20;

export function excedeDisjuntor(qtdParaApagar: number): boolean {
  return qtdParaApagar > LIMITE_EXCLUSAO_EM_LOTE;
}

/** ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6): count===0 é recusa; null nunca é. */
export function deveTratarComoRecusa(count: number | null): boolean {
  return count === 0;
}
