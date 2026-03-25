import { useEffect, useRef, useState } from 'react';
import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  HOUR_HEIGHT,
  getEventTopPx,
  getEventHeightPx,
  getCurrentTimePx,
  eventsForDay,
  timedEvents,
  allDayEvents,
  yPxToDate,
} from './calendarUtils';
import type { CalendarEvent } from './types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const GUTTER_WIDTH = 44;

interface TimeGridViewProps {
  days: Date[];
  events: CalendarEvent[];
  onClickSlot: (date: Date) => void;
  onClickEvent: (event: CalendarEvent) => void;
}

function EventBlock({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  const top = getEventTopPx(event.inicio);
  const height = getEventHeightPx(event.inicio, event.fim);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      onKeyDown={(e) => e.key === 'Enter' && onClick(event)}
      className="absolute left-0.5 right-0.5 rounded px-1 sm:px-1.5 py-0.5 text-white text-[10px] sm:text-[11px] font-medium overflow-hidden cursor-pointer hover:brightness-90 transition-all z-10"
      style={{ top, height, backgroundColor: event.cor }}
    >
      <p className="truncate leading-tight">{event.titulo}</p>
      {height > 30 && (
        <p className="truncate leading-tight opacity-80">
          {format(event.inicio, 'HH:mm')} – {format(event.fim, 'HH:mm')}
        </p>
      )}
    </div>
  );
}

function AllDayChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(event)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(event)}
      className="truncate rounded px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-white cursor-pointer hover:brightness-90 mb-0.5"
      style={{ backgroundColor: event.cor }}
    >
      {event.titulo}
    </div>
  );
}

export function TimeGridView({ days, events, onClickSlot, onClickEvent }: TimeGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTimePx, setCurrentTimePx] = useState(getCurrentTimePx());
  const isCurrentPeriod = days.some((d) => isToday(d));

  // Auto-scroll para horário atual (ou 8h)
  useEffect(() => {
    const scrollTarget = () => {
      const target = isCurrentPeriod ? Math.max(currentTimePx - 100, 0) : 7 * HOUR_HEIGHT;
      scrollRef.current?.scrollTo({ top: target, behavior: 'smooth' });
    };

    // Pequeno atraso para garantir que o container esteja renderizado e com altura final
    const timer = setTimeout(scrollTarget, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length, days[0]?.toISOString()]);

  // Atualiza linha do tempo a cada minuto
  useEffect(() => {
    const interval = setInterval(() => setCurrentTimePx(getCurrentTimePx()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleColumnClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const yInColumn = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    onClickSlot(yPxToDate(day, yInColumn));
  };

  const colTemplate = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Cabeçalho fixo com dias */}
      <div
        className="border-b bg-background shrink-0"
        style={{ display: 'grid', gridTemplateColumns: colTemplate }}
      >
        <div className="text-[9px] text-muted-foreground flex items-end justify-end pr-1.5 pb-1">
          {days.length > 1 ? 'Dia' : ''}
        </div>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`flex flex-col items-center py-1.5 sm:py-2 border-l border-border/30 ${isToday(day) ? 'text-primary' : 'text-muted-foreground'
              }`}
          >
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wide">
              {format(day, days.length === 1 ? 'EEEE' : 'EEE', { locale: ptBR })}
            </span>
            <span
              className={`text-sm sm:text-base font-semibold leading-none mt-0.5 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : ''
                }`}
            >
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Linha de eventos de dia inteiro */}
      {days.some((d) => allDayEvents(eventsForDay(events, d)).length > 0) && (
        <div
          className="border-b bg-muted/20 shrink-0"
          style={{ display: 'grid', gridTemplateColumns: colTemplate }}
        >
          <div className="text-[8px] text-muted-foreground flex items-center justify-end pr-1.5">
            <span className="hidden sm:block">dia int.</span>
          </div>
          {days.map((day) => (
            <div key={day.toISOString()} className="border-l border-border/30 px-0.5 py-0.5 min-h-[20px] sm:min-h-[24px]">
              {allDayEvents(eventsForDay(events, day)).map((ev) => (
                <AllDayChip key={ev.id} event={ev} onClick={onClickEvent} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Grade de horários (scrollável) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>

          {/* Coluna de horas */}
          <div className="shrink-0 relative select-none" style={{ width: GUTTER_WIDTH }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 text-[9px] sm:text-[10px] text-muted-foreground"
                style={{ top: h * HOUR_HEIGHT - 7, display: h === 0 ? 'none' : 'block' }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
            {/* Label da hora atual */}
            {isCurrentPeriod && (
              <div
                className="absolute right-1 text-[9px] sm:text-[10px] font-medium text-red-500 z-20"
                style={{ top: currentTimePx - 7 }}
              >
                {format(new Date(), 'HH:mm')}
              </div>
            )}
          </div>

          {/* Colunas dos dias */}
          <div
            className="flex-1 relative"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="relative border-l border-border/20"
                style={isToday(day) ? { backgroundColor: 'rgba(59,130,246,0.04)' } : {}}
                onClick={(e) => handleColumnClick(day, e)}
              >
                {/* Linhas de hora */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-border/20 pointer-events-none"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}
                {/* Linhas de meia hora */}
                {HOURS.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute w-full border-t border-border/10 border-dashed pointer-events-none"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}
                {/* Eventos do dia */}
                {timedEvents(eventsForDay(events, day)).map((ev) => (
                  <EventBlock key={ev.id} event={ev} onClick={onClickEvent} />
                ))}
              </div>
            ))}

            {/* Indicador de hora atual */}
            {isCurrentPeriod && (
              <div
                className="absolute left-0 right-0 flex items-center z-20 pointer-events-none"
                style={{ top: currentTimePx }}
              >
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500 shrink-0 -ml-1" />
                <div className="flex-1 border-t border-red-500" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
