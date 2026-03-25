import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  isSameDay,
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

export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => isSameDay(e.inicio, day));
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
