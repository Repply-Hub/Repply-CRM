import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Upload } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ViewMode } from './types';

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onNewEvent: () => void;
  onImport?: () => void;
}

const VIEW_LABELS: Record<ViewMode, { full: string; short: string }> = {
  dia: { full: 'Dia', short: 'D' },
  semana: { full: 'Semana', short: 'S' },
  mes: { full: 'Mês', short: 'M' },
};

function getTitle(date: Date, viewMode: ViewMode): string {
  if (viewMode === 'mes') {
    return format(date, 'MMMM yyyy', { locale: ptBR });
  }
  if (viewMode === 'semana') {
    const monday = new Date(date);
    const day = monday.getDay();
    monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
    const sunday = addDays(monday, 6);
    if (monday.getMonth() === sunday.getMonth()) {
      return format(monday, 'MMMM yyyy', { locale: ptBR });
    }
    return `${format(monday, 'MMM', { locale: ptBR })} – ${format(sunday, 'MMM yyyy', { locale: ptBR })}`;
  }
  return format(date, "d 'de' MMMM, yyyy", { locale: ptBR });
}

export function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onNavigate,
  onNewEvent,
  onImport,
}: CalendarHeaderProps) {
  const isMobile = useIsMobile();
  return (
    <>
      {/* Navegação */}
      <div className="flex items-center bg-muted/30 rounded-lg p-0.5 border">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-orange-50 hover:text-orange-600" onClick={() => onNavigate('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-xs font-bold hover:bg-orange-50 hover:text-orange-600 transition-colors"
          onClick={() => onNavigate('today')}
        >
          {isMobile ? <CalendarIcon className="h-4 w-4" /> : "Hoje"}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-orange-50 hover:text-orange-600" onClick={() => onNavigate('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Seletor de visualização */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(val) => val && onViewModeChange(val as ViewMode)}
        className="bg-muted/30 p-0.5 rounded-lg border"
      >
        {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
          <ToggleGroupItem
            key={mode}
            value={mode}
            variant="default"
            size="sm"
            className="h-7 px-2.5 sm:px-4 text-xs font-bold hover:bg-orange-50 hover:text-orange-600 data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:text-foreground rounded-md transition-all"
          >
            {isMobile ? VIEW_LABELS[mode].short : VIEW_LABELS[mode].full}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex-1" />

      {onImport && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 px-3 shadow-sm transition-all font-bold"
          onClick={onImport}
        >
          <Upload className="h-3.5 w-3.5" />
          {!isMobile && "Importar"}
        </Button>
      )}

      <Button
        size="sm"
        className="h-8 gap-1.5 px-3 bg-primary hover:bg-primary/80 shadow-sm transition-all text-white font-bold"
        onClick={onNewEvent}
      >
        <Plus className="h-3.5 w-3.5" />
        {!isMobile && "Novo evento"}
      </Button>
    </>
  );
}
