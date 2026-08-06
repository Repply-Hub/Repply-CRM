import { useState, useRef, useMemo } from "react";
import { addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppLayout } from "@/components/layout/AppLayout";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { TimeGridView } from "@/components/calendar/TimeGridView";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { EventDialog } from "@/components/calendar/EventDialog";
import { getWeekDays } from "@/components/calendar/calendarUtils";
import type { ViewMode, CalendarType, EventoForm, CalendarEvent } from "@/components/calendar/types";
import { CALENDAR_COLORS } from "@/components/calendar/types";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import {
  useCalendarEvents,
  useCreateEvento,
  useBulkCreateEventos,
  useUpdateEvento,
  useDeleteEvento,
} from "@/hooks/use-eventos";
import { toast } from "sonner";
import { validateFile } from "@/lib/file-validation";

const ICS_ALLOWED_EXT = ['.ics'];

const CALENDAR_LABELS: Record<CalendarType, string> = {
  pessoal: "Meu calendário",
  empresa: "Calendário da empresa",
};

// --- ICS parser ---
function parseICSDate(value: string): { date: Date; allDay: boolean } {
  // All-day: 8 digits only (VALUE=DATE)
  if (/^\d{8}$/.test(value)) {
    const y = parseInt(value.slice(0, 4));
    const m = parseInt(value.slice(4, 6)) - 1;
    const d = parseInt(value.slice(6, 8));
    return { date: new Date(y, m, d), allDay: true };
  }
  // UTC datetime (ends with Z)
  if (value.endsWith("Z")) {
    const y = parseInt(value.slice(0, 4));
    const mo = parseInt(value.slice(4, 6)) - 1;
    const d = parseInt(value.slice(6, 8));
    const h = parseInt(value.slice(9, 11));
    const mi = parseInt(value.slice(11, 13));
    const s = parseInt(value.slice(13, 15)) || 0;
    return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
  }
  // Local datetime
  const y = parseInt(value.slice(0, 4));
  const mo = parseInt(value.slice(4, 6)) - 1;
  const d = parseInt(value.slice(6, 8));
  const h = parseInt(value.slice(9, 11));
  const mi = parseInt(value.slice(11, 13));
  const s = parseInt(value.slice(13, 15)) || 0;
  return { date: new Date(y, mo, d, h, mi, s), allDay: false };
}

function parseICS(content: string, calendarType: CalendarType = "empresa"): EventoForm[] {
  const events: EventoForm[] = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = veventRegex.exec(content)) !== null) {
    const block = match[1];
    // Unfold folded lines (RFC 5545: CRLF + whitespace)
    const unfolded = block.replace(/\r?\n[ \t]/g, "");
    const lines = unfolded.split(/\r?\n/);
    const props: Record<string, string> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const keyFull = line.slice(0, colonIdx).trim().toUpperCase();
      const value = line.slice(colonIdx + 1).trim();
      // Strip parameters (e.g. DTSTART;TZID=America/Sao_Paulo → DTSTART)
      const baseKey = keyFull.split(";")[0];
      if (!(baseKey in props)) props[baseKey] = value;
    }
    if (!props["DTSTART"]) continue;
    const titulo = (props["SUMMARY"] || "Sem título").replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
    const descricao = (props["DESCRIPTION"] || "").replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
    const { date: inicioDate, allDay } = parseICSDate(props["DTSTART"]);
    const { date: fimDate } = parseICSDate(props["DTEND"] || props["DTSTART"]);
    const fmt = allDay ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm";
    events.push({
      titulo,
      descricao,
      inicio: format(inicioDate, fmt),
      fim: format(fimDate, fmt),
      diaInteiro: allDay,
      tipoCalendario: calendarType,
      cor: CALENDAR_COLORS[calendarType],
      lembreteMinutos: null,
    });
  }
  return events;
}

export default function Calendario() {
  const [viewMode, setViewMode] = useState<ViewMode>("semana");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [month, setMonth] = useState(new Date());
  const [visibleCalendars, setVisibleCalendars] = useState<Set<CalendarType>>(new Set(["pessoal", "empresa"]));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialSlot, setInitialSlot] = useState<Partial<EventoForm>>({});
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [isImporting, setIsImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCalendarType, setImportCalendarType] = useState<CalendarType>("empresa");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isMobile = useIsMobile();
  const events = useCalendarEvents(visibleCalendars);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e => 
      e.titulo.toLowerCase().includes(q) || 
      (e.descricao?.toLowerCase().includes(q))
    );
  }, [events, searchQuery]);

  const { mutate: createEvento } = useCreateEvento();
  const { mutateAsync: bulkCreateEventos } = useBulkCreateEventos();
  const { mutate: updateEvento } = useUpdateEvento();
  const { mutate: deleteEvento } = useDeleteEvento();

  // --- Navegação ---
  const navigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      const now = new Date();
      setCurrentDate(now);
      setMonth(now);
      return;
    }
    const sign = direction === "next" ? 1 : -1;
    setCurrentDate((d) => {
      let nextDate: Date;
      if (viewMode === "dia") nextDate = sign > 0 ? addDays(d, 1) : subDays(d, 1);
      else if (viewMode === "semana") nextDate = sign > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      else nextDate = sign > 0 ? addMonths(d, 1) : subMonths(d, 1);
      
      setMonth(nextDate);
      return nextDate;
    });
  };

  // --- Calendário lateral: clique em dia muda para visão dia ---
  const handleMiniCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setCurrentDate(date);
    if (viewMode === "mes") setViewMode("dia");
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

  const handleCreateRange = (start: Date, end: Date) => {
    const inicio = format(start, "yyyy-MM-dd'T'HH:mm");
    const fim = format(end, "yyyy-MM-dd'T'HH:mm");
    openNewEvent({ inicio, fim });
  };

  // --- Salvar evento ---
  const handleSave = (form: EventoForm) => {
    if (editingEvent) {
      updateEvento(
        { id: editingEvent.id, form, grupoId: editingEvent.grupoId, criadoPor: editingEvent.criadoPor },
        {
          onSuccess: () => toast.success("Evento atualizado"),
          onError: () => toast.error("Erro ao atualizar evento"),
        },
      );
    } else {
      createEvento(form, {
        onSuccess: () => toast.success("Evento criado"),
        onError: () => toast.error("Erro ao criar evento"),
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteEvento(id, {
      onSuccess: () => toast.success("Evento excluído"),
      onError: () => toast.error("Erro ao excluir evento"),
    });
  };

  // --- Importar ICS ---
  const handleImportClick = () => {
    setImportDialogOpen(true);
  };

  const handleSelectFile = () => {
    importInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!validateFile(file, { allowedExtensions: ICS_ALLOWED_EXT })) return;
    setPendingFile(file);
  };

  const handleConfirmImport = async () => {
    if (!pendingFile) return;
    setImportDialogOpen(false);
    setIsImporting(true);
    const toastId = toast.loading("Importando agenda...");
    try {
      const content = await pendingFile.text();
      const parsed = parseICS(content, importCalendarType);
      if (parsed.length === 0) {
        toast.dismiss(toastId);
        toast.warning("Nenhum evento encontrado no arquivo.");
        setIsImporting(false);
        setPendingFile(null);
        return;
      }
      const inserted = await bulkCreateEventos(parsed);
      toast.dismiss(toastId);
      const count = inserted ?? parsed.length;
      if (count === 0) {
        toast.warning("Nenhum evento foi gravado. Verifique as permissões do calendário.");
        setIsImporting(false);
        setPendingFile(null);
        return;
      }
      toast.success(`${count} evento${count !== 1 ? "s" : ""} importado${count !== 1 ? "s" : ""} com sucesso`);
    } catch {
      toast.dismiss(toastId);
      toast.error("Erro ao ler o arquivo. Verifique se é um arquivo .ics válido.");
    } finally {
      setIsImporting(false);
      setPendingFile(null);
    }
  };

  // --- Dias para a TimeGridView ---
  // Mobile: semana exibe 3 dias centrados no dia atual
  const gridDays =
    viewMode === "semana"
      ? isMobile
        ? [subDays(currentDate, 1), currentDate, addDays(currentDate, 1)]
        : getWeekDays(currentDate)
      : [currentDate];

  const calendarTitle = viewMode === 'mes'
    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
    : viewMode === 'semana'
      ? (() => {
          const monday = new Date(currentDate);
          const day = monday.getDay();
          monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
          const sunday = addDays(monday, 6);
          if (monday.getMonth() === sunday.getMonth()) return format(monday, 'MMMM yyyy', { locale: ptBR });
          return `${format(monday, 'MMM', { locale: ptBR })} – ${format(sunday, 'MMM yyyy', { locale: ptBR })}`;
        })()
      : format(currentDate, "d 'de' MMMM, yyyy", { locale: ptBR });

  return (
    <AppLayout title="Calendário" subtitle={calendarTitle} mainClassName="flex-1 overflow-hidden flex flex-col">
      <input
        ref={importInputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={handleFileSelected}
        disabled={isImporting}
      />
      <ErrorBoundary>
        {/* Toolbar com botões do calendário */}
        <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 md:px-6 py-2 border-b shrink-0">
          <CalendarHeader
            currentDate={currentDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onNavigate={navigate}
            onNewEvent={() => openNewEvent()}
            onImport={handleImportClick}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </div>
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Sidebar esquerda — oculta em mobile */}
          <aside className="hidden lg:flex w-56 border-r flex-col gap-5 p-3 shrink-0 overflow-y-auto min-h-0">

            {/* Mini calendário — células w-7 (28px) × 7 = 196px + p-2 = 212px < 224px */}
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={handleMiniCalendarSelect}
              month={month}
              onMonthChange={setMonth}
              locale={ptBR}
              className="p-2 w-full"
              captionLayout="dropdown-buttons"
              fromYear={1950}
              toYear={new Date().getFullYear()}
              classNames={{
                months: "w-full",
                month: "w-full space-y-2",
                caption: "flex justify-center pt-1 relative items-center gap-1",
                caption_dropdowns: "flex justify-center gap-1",
                vhidden: "hidden",
                dropdown: "bg-transparent border-none text-[10px] font-medium focus:ring-0 cursor-pointer p-0",
                caption_label: "text-xs font-medium hidden",
                nav: "hidden",
                nav_button:
                  "hidden",
                nav_button_previous: "hidden",
                nav_button_next: "hidden",
                table: "w-full border-collapse",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[0.65rem] text-center",
                row: "flex w-full mt-1",
                cell: "h-7 w-7 text-center text-xs p-0 relative focus-within:relative focus-within:z-20",
                day: "h-7 w-7 p-0 font-normal text-[0.7rem] rounded-md hover:bg-accent aria-selected:opacity-100",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-50",
                day_hidden: "invisible",
              }}
            />

            {/* Tipos de calendário */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Calendários</p>
              {(Object.entries(CALENDAR_LABELS) as [CalendarType, string][]).map(([type, label]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: CALENDAR_COLORS[type] }} />
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
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Automáticos</p>
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
            {viewMode === "mes" ? (
              <CalendarMonthView
                date={currentDate}
                events={filteredEvents}
                onClickDay={(day) => {
                  setCurrentDate(day);
                  setViewMode("dia");
                }}
                onClickEvent={openEditEvent}
              />
            ) : (
              <TimeGridView
                days={gridDays}
                events={filteredEvents}
                onClickSlot={handleClickSlot}
                onCreateRange={handleCreateRange}
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

        {/* Dialog de importação */}
        <Dialog
          open={importDialogOpen}
          onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) setPendingFile(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Importar agenda (.ics)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Tipo de calendário</Label>
                <Select value={importCalendarType} onValueChange={(v) => setImportCalendarType(v as CalendarType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoal">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CALENDAR_COLORS.pessoal }} />
                        Meu calendário
                      </div>
                    </SelectItem>
                    <SelectItem value="empresa">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CALENDAR_COLORS.empresa }} />
                        Calendário da empresa
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <Button variant="outline" className="w-full justify-start" onClick={handleSelectFile}>
                  {pendingFile ? pendingFile.name : "Selecionar arquivo"}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setImportDialogOpen(false);
                  setPendingFile(null);
                }}
              >
                Cancelar
              </Button>
              <Button disabled={!pendingFile || isImporting} onClick={handleConfirmImport}>
                Importar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ErrorBoundary>
    </AppLayout>
  );
}
