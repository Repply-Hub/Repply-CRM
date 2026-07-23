import { useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EventDateTimeFieldProps {
  label: string;
  type: 'date' | 'datetime-local';
  value: string;
  onChange: (value: string) => void;
}

const DATE_FMT = 'yyyy-MM-dd';
const DATETIME_FMT = "yyyy-MM-dd'T'HH:mm";

function parseValue(value: string, type: 'date' | 'datetime-local'): Date | null {
  if (!value) return null;
  const fmt = type === 'date' ? DATE_FMT : DATETIME_FMT;
  const parsed = parse(value, fmt, new Date());
  return isValid(parsed) ? parsed : null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

export function EventDateTimeField({
  label,
  type,
  value,
  onChange,
}: EventDateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const date = useMemo(() => parseValue(value, type), [value, type]);
  const isDateTime = type === 'datetime-local';

  const hour = date ? format(date, 'HH') : '09';
  const minute = date ? format(date, 'mm') : '00';

  const emit = (next: Date) => {
    onChange(format(next, isDateTime ? DATETIME_FMT : DATE_FMT));
  };

  const handleDateSelect = (selected: Date | undefined) => {
    if (!selected) return;
    const base = date ?? new Date();
    const next = new Date(selected);
    if (isDateTime) {
      next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    emit(next);
    if (!isDateTime) setOpen(false);
  };

  const handleHourChange = (h: string) => {
    const base = date ?? new Date();
    const next = new Date(base);
    next.setHours(parseInt(h, 10), parseInt(minute, 10), 0, 0);
    emit(next);
  };

  const handleMinuteChange = (m: string) => {
    const base = date ?? new Date();
    const next = new Date(base);
    next.setHours(parseInt(hour, 10), parseInt(m, 10), 0, 0);
    emit(next);
  };

  const display = date
    ? isDateTime
      ? format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
      : format(date, 'dd/MM/yyyy', { locale: ptBR })
    : 'Selecionar';

  return (
    <div className="space-y-1.5 min-w-0">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start font-normal text-sm h-10',
              !date && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={handleDateSelect}
            locale={ptBR}
            initialFocus
            captionLayout="dropdown-buttons"
            fromYear={2000}
            toYear={new Date().getFullYear() + 10}
            className={cn('p-3 pointer-events-auto')}
          />
          {isDateTime && (
            <div className="flex items-center gap-2 border-t p-3">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Horário</span>
              <div className="ml-auto flex items-center gap-1">
                <Select value={hour} onValueChange={handleHourChange}>
                  <SelectTrigger className="h-8 w-[68px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">:</span>
                <Select value={minute} onValueChange={handleMinuteChange}>
                  <SelectTrigger className="h-8 w-[68px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {MINUTES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
