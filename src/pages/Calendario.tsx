import { useState } from 'react';
import { addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/AppLayout';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { CalendarHeader } from '@/components/calendar/CalendarHeader';
import { TimeGridView } from '@/components/calendar/TimeGridView';
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView';
import { EventDialog } from '@/components/calendar/EventDialog';
import { getWeekDays } from '@/components/calendar/calendarUtils';
import type { ViewMode, CalendarType, EventoForm, CalendarEvent } from '@/components/calendar/types';
import { CALENDAR_COLORS } from '@/components/calendar/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  useCalendarEvents,
  useCreateEvento,
  useUpdateEvento,
  useDeleteEvento,
} from '@/hooks/use-eventos';
import { toast } from 'sonner';

const CALENDAR_LABELS: Record<CalendarType, string> = {
  pessoal: 'Meu calendário',
  empresa: 'Calendário da empresa',
};

export default function Calendario() {
  const [viewMode, setViewMode] = useState<ViewMode>('semana');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [visibleCalendars, setVisibleCalendars] = useState<Set<CalendarType>>(
    new Set(['pessoal', 'empresa']),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialSlot, setInitialSlot] = useState<Partial<EventoForm>>({});
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const isMobile = useIsMobile();
  const events = useCalendarEvents(visibleCalendars);
  const { mutate: createEvento } = useCreateEvento();
  const { mutate: updateEvento } = useUpdateEvento();
  const { mutate: deleteEvento } = useDeleteEvento();

  // --- Navegação ---
  const navigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') { setCurrentDate(new Date()); return; }
    const sign = direction === 'next' ? 1 : -1;
    setCurrentDate((d) => {
      if (viewMode === 'dia') return sign > 0 ? addDays(d, 1) : subDays(d, 1);
      if (viewMode === 'semana') return sign > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      return sign > 0 ? addMonths(d, 1) : subMonths(d, 1);
    });
  };

  // --- Calendário lateral: clique em dia muda para visão dia ---
  const handleMiniCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setCurrentDate(date);
    if (viewMode === 'mes') setViewMode('dia');
  };

  // --- Toggle de tipo de calendário ---
  const toggleCalendar = (type: CalendarType) => {
    setVisibleCalendars((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  // --- Abertura de dialog ---
  const openNewEvent = (slot?: Partial<EventoForm>) => {
    setEditingEvent(null);
    setInitialSlot(slot ?? {});
    setDialogOpen(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    if (!event.editavel) return; // prazos/contatos são read-only
    setEditingEvent(event);
    setInitialSlot({});
    setDialogOpen(true);
  };

  const handleClickSlot = (date: Date) => {
    const inicio = format(date, "yyyy-MM-dd'T'HH:mm");
    const fimDate = new Date(date.getTime() + 60 * 60 * 1000);
    const fim = format(fimDate, "yyyy-MM-dd'T'HH:mm");
    openNewEvent({ inicio, fim });
  };

  // --- Salvar evento ---
  const handleSave = (form: EventoForm) => {
    if (editingEvent) {
      updateEvento(
        { id: editingEvent.id, form },
        {
          onSuccess: () => toast.success('Evento atualizado'),
          onError: () => toast.error('Erro ao atualizar evento'),
        },
      );
    } else {
      createEvento(form, {
        onSuccess: () => toast.success('Evento criado'),
        onError: () => toast.error('Erro ao criar evento'),
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteEvento(id, {
      onSuccess: () => toast.success('Evento excluído'),
      onError: () => toast.error('Erro ao excluir evento'),
    });
  };

  // --- Dias para a TimeGridView ---
  // Mobile: semana exibe 3 dias centrados no dia atual
  const gridDays =
    viewMode === 'semana'
      ? isMobile
        ? [subDays(currentDate, 1), currentDate, addDays(currentDate, 1)]
        : getWeekDays(currentDate)
      : [currentDate];

  const headerContent = (
    <CalendarHeader
      currentDate={currentDate}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onNavigate={navigate}
      onNewEvent={() => openNewEvent()}
    />
  );

  return (
    <AppLayout headerContent={headerContent} mainClassName="flex-1 overflow-hidden flex flex-col">
      <ErrorBoundary>
      <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Sidebar esquerda — oculta em mobile */}
          <aside className="hidden lg:flex w-56 border-r flex-col gap-5 p-3 shrink-0 overflow-y-auto min-h-0">
            {/* Mini calendário — células w-7 (28px) × 7 = 196px + p-2 = 212px < 224px */}
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={handleMiniCalendarSelect}
              locale={ptBR}
              className="p-2 w-full"
              classNames={{
                months: 'w-full',
                month: 'w-full space-y-2',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-xs font-medium',
                nav: 'space-x-1 flex items-center',
                nav_button: 'h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100 border rounded-md inline-flex items-center justify-center',
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse',
                head_row: 'flex',
                head_cell: 'text-muted-foreground rounded-md w-7 font-normal text-[0.65rem] text-center',
                row: 'flex w-full mt-1',
                cell: 'h-7 w-7 text-center text-xs p-0 relative focus-within:relative focus-within:z-20',
                day: 'h-7 w-7 p-0 font-normal text-[0.7rem] rounded-md hover:bg-accent aria-selected:opacity-100',
                day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                day_today: 'bg-accent text-accent-foreground',
                day_outside: 'text-muted-foreground opacity-50',
                day_disabled: 'text-muted-foreground opacity-50',
                day_hidden: 'invisible',
              }}
            />

            {/* Tipos de calendário */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Calendários
              </p>
              {(Object.entries(CALENDAR_LABELS) as [CalendarType, string][]).map(([type, label]) => (
                <div key={type} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: CALENDAR_COLORS[type] }}
                  />
                  <Label htmlFor={`cal-${type}`} className="flex-1 text-xs cursor-pointer leading-tight">
                    {label}
                  </Label>
                  <Switch
                    id={`cal-${type}`}
                    checked={visibleCalendars.has(type)}
                    onCheckedChange={() => toggleCalendar(type)}
                    className="scale-75 shrink-0"
                  />
                </div>
              ))}

              {/* Legenda de eventos automáticos */}
              <div className="pt-2 space-y-2 border-t">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Automáticos
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[#f97316]" />
                  <span className="text-xs text-muted-foreground">Prazos</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[#6b7280]" />
                  <span className="text-xs text-muted-foreground">Contatos</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Vista do calendário */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'mes' ? (
              <CalendarMonthView
                date={currentDate}
                events={events}
                onClickDay={(day) => {
                  setCurrentDate(day);
                  setViewMode('dia');
                }}
                onClickEvent={openEditEvent}
              />
            ) : (
              <TimeGridView
                days={gridDays}
                events={events}
                onClickSlot={handleClickSlot}
                onClickEvent={openEditEvent}
              />
            )}
          </div>
        </div>

      {/* Dialog de criação/edição */}
      <EventDialog
        open={dialogOpen}
        initialData={initialSlot}
        editingEvent={editingEvent}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      </ErrorBoundary>
    </AppLayout>
  );
}
