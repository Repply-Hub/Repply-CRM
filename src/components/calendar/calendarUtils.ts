import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  isSameDay,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { CalendarEvent } from './types';

export const HOUR_HEIGHT = 60; // px por hora — 24h = 1440px total

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // segunda
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthGrid(date: Date): Date[][] {
  const firstOfMonth = startOfMonth(date);
  const lastOfMonth = endOfMonth(date);
  const gridStart = startOfWeek(firstOfMonth, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(lastOfMonth, { weekStartsOn: 1 });

  const weeks: Date[][] = [];
  let current = new Date(gridStart);
  while (current <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current = addDays(current, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function getEventTopPx(date: Date): number {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
}

export function getEventHeightPx(start: Date, end: Date): number {
  const diffMins = (end.getTime() - start.getTime()) / 60000;
  return Math.max((diffMins / 60) * HOUR_HEIGHT, 22);
}

export function getCurrentTimePx(): number {
  const now = new Date();
  return getEventTopPx(now);
}

/**
 * Os compromissos que CRUZAM este dia — não só os que começam nele.
 *
 * Até 22/09/2026 era `isSameDay(e.inicio, day)`, e uma feira de três dias ou uma viagem de
 * representação de 10 a 12 aparecia só no dia 10: os dias 11 e 12 pareciam livres e alguém
 * marcava visita em cima. O dado sempre esteve certo (o dia inteiro é gravado até 23:59:59 do
 * último dia); errado estava o desenho.
 *
 * Quem termina EXATAMENTE à meia-noite não invade o dia seguinte — senão toda reunião que vira
 * o dia apareceria numa madrugada em que ninguém tem nada marcado. E um marco instantâneo
 * (início igual ao fim, como a meia-noite de um lembrete) continua aparecendo no dia dele.
 */
export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const inicioDoDia = startOfDay(day).getTime();
  const fimDoDia = endOfDay(day).getTime();
  return events.filter((e) => {
    const inicio = e.inicio.getTime();
    // Fim antes do início existe na base; tratar como instantâneo em vez de sumir com a linha.
    const fim = Math.max(e.fim?.getTime() ?? inicio, inicio);
    const comecaAntesDeAcabarODia = inicio <= fimDoDia;
    const aindaEstaAcontecendo = fim > inicioDoDia;
    const comecaNesteDia = inicio >= inicioDoDia;
    return comecaAntesDeAcabarODia && (aindaEstaAcontecendo || comecaNesteDia);
  });
}

/**
 * O pedaço do compromisso que cabe DENTRO deste dia.
 *
 * A grade de horas posiciona o bloco pela hora de início e o estica pela duração. Sem recortar,
 * um compromisso que começou ontem às 8h seria desenhado hoje às 8h e com a altura dos dois dias
 * — apareceria no dia certo, na hora errada. No dia do meio o pedaço ocupa o dia inteiro.
 */
export function recorteNoDia(evento: CalendarEvent, day: Date): { inicio: Date; fim: Date } {
  const inicioDoDia = startOfDay(day);
  const fimDoDia = endOfDay(day);
  return {
    inicio: evento.inicio < inicioDoDia ? inicioDoDia : evento.inicio,
    fim: evento.fim > fimDoDia ? fimDoDia : evento.fim,
  };
}

export function timedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => !e.diaInteiro);
}

export function allDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.diaInteiro);
}

// Dado um clique em Y pixels dentro da grade, retorna a hora correspondente
export function yPxToDate(baseDate: Date, yPx: number): Date {
  const totalMins = Math.round((yPx / HOUR_HEIGHT) * 60);
  const hours = Math.floor(totalMins / 60);
  const minutes = Math.round((totalMins % 60) / 30) * 30; // arredonda p/ 30min
  const result = new Date(baseDate);
  result.setHours(Math.min(hours, 23), minutes, 0, 0);
  return result;
}
