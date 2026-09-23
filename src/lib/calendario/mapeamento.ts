import { addDays, subDays, format } from 'date-fns';

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

/** Data (AAAA-MM-DD) do instante — os timestamptz de dia-inteiro do Repply já vêm à meia-noite UTC. */
function dataISO(instante: string): string {
  return instante.slice(0, 10);
}

export function paraGoogle(e: EventoParaSincronizar, fusoHorario: string): RecursoGoogle {
  const base: RecursoGoogle = { summary: e.titulo, start: {}, end: {} };
  if (e.descricao) base.description = e.descricao;

  if (e.diaInteiro) {
    // Google usa data-fim EXCLUSIVA: o dia seguinte ao último dia do evento.
    const inicio = dataISO(e.inicio);
    const fimExclusivo = format(addDays(new Date(dataISO(e.fim) + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
    base.start = { date: inicio };
    base.end = { date: fimExclusivo };
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
    const ultimoDia = format(subDays(new Date(g.end.date + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
    return { titulo, descricao, inicio, fim: ultimoDia + 'T23:59:59.000Z', diaInteiro: true };
  }

  return {
    titulo, descricao,
    inicio: g.start.dateTime!, fim: g.end.dateTime!, diaInteiro: false,
  };
}
