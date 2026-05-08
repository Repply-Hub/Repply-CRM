import { useState } from 'react';
import { format, subDays, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface DateRange {
  from: Date;
  to: Date;
}

const presets = [
  { label: 'Todos', range: () => ({ from: new Date(2000, 0, 1), to: new Date() }) },
  { label: 'Últimos 7 dias', range: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: 'Últimos 30 dias', range: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: 'Este mês', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Últimos 3 meses', range: () => ({ from: subMonths(new Date(), 3), to: new Date() }) },
  { label: 'Últimos 6 meses', range: () => ({ from: subMonths(new Date(), 6), to: new Date() }) },
  { label: 'Este ano', range: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const handlePreset = (preset: (typeof presets)[number]) => {
    onChange(preset.range());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal gap-2 h-9 px-3 text-sm border-border/60',
            !value && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {value.from && value.to
            ? `${format(value.from, 'dd MMM yyyy', { locale: ptBR })} — ${format(value.to, 'dd MMM yyyy', { locale: ptBR })}`
            : 'Selecione o período'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-r border-border p-3 space-y-1 min-w-[160px]">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Atalhos</p>
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className="block w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            <Calendar
              mode="range"
              selected={{ from: value.from, to: value.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onChange({ from: range.from, to: range.to });
                } else if (range?.from) {
                  onChange({ from: range.from, to: range.from });
                }
              }}
              numberOfMonths={2}
              locale={ptBR}
              className="pointer-events-auto"
              captionLayout="dropdown-buttons"
              fromYear={2000}
              toYear={new Date().getFullYear() + 10}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
