import { format, isToday, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HardHat } from 'lucide-react';
import { getMonthGrid, eventsForDay } from './calendarUtils';
import type { CalendarEvent } from './types';

const WEEK_DAYS_FULL  = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEK_DAYS_SHORT = ['S',   'T',   'Q',   'Q',   'S',   'S',   'D'  ];

interface CalendarMonthViewProps {
  date: Date;
  events: CalendarEvent[];
  onClickDay: (date: Date) => void;
  onClickEvent: (event: CalendarEvent) => void;
}

export function CalendarMonthView({
  date,
  events,
  onClickDay,
  onClickEvent,
}: CalendarMonthViewProps) {
  const grid = getMonthGrid(date);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 border-b shrink-0">
        {WEEK_DAYS_FULL.map((d, i) => (
          <div
            key={d}
            className="py-1.5 sm:py-2 text-center font-medium text-muted-foreground uppercase tracking-wide"
          >
            <span className="hidden sm:inline text-[11px]">{d}</span>
            <span className="sm:hidden text-[10px]">{WEEK_DAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>

      {/* Grade do mês */}
      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateRows: `repeat(${grid.length}, 1fr)` }}
      >
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day) => {
              const dayEvents = eventsForDay(events, day);
              const today = isToday(day);
              const currentMonth = isSameMonth(day, date);

              return (
                <div
                  key={day.toISOString()}
                  className={`border-t border-l p-0.5 sm:p-1 min-h-[56px] sm:min-h-[80px] cursor-pointer hover:bg-muted/30 transition-colors overflow-hidden ${
                    !currentMonth ? 'opacity-40' : ''
                  }`}
                  onClick={() => onClickDay(day)}
                >
                  {/* Número do dia */}
                  <div className="flex justify-center mb-0.5 sm:mb-1">
                    <span
                      className={`text-[11px] sm:text-xs font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${
                        today
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Eventos — mobile mostra só pontos coloridos, desktop mostra chips */}
                  <div className="hidden sm:block space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onClickEvent(ev); }}
                        onKeyDown={(e) => e.key === 'Enter' && onClickEvent(ev)}
                        className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white leading-tight cursor-pointer hover:brightness-90"
                        style={{ backgroundColor: ev.cor }}
                      >
                        {!ev.diaInteiro && (
                          <span className="opacity-80 mr-0.5">{format(ev.inicio, 'HH:mm')}</span>
                        )}
                        {ev.obraId && <HardHat className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}
                        {ev.titulo}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} mais</p>
                    )}
                  </div>

                  {/* Mobile: pontos coloridos */}
                  {dayEvents.length > 0 && (
                    <div className="sm:hidden flex flex-wrap gap-0.5 justify-center">
                      {dayEvents.slice(0, 4).map((ev) => (
                        <div
                          key={ev.id}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: ev.cor }}
                        />
                      ))}
                      {dayEvents.length > 4 && (
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
