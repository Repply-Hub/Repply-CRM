import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function EventDateTimeField({
  label,
  type,
  value,
  onChange,
}: EventDateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [hourText, setHourText] = useState('09');
  const [minuteText, setMinuteText] = useState('00');
  const date = useMemo(() => parseValue(value, type), [value, type]);
  const isDateTime = type === 'datetime-local';

  // Ao abrir, sincroniza os campos digitáveis de hora/minuto com o valor atual — permite
  // corrigir o horário direto no teclado, campo a campo, além de escolher a data pelo
  // calendário; ambos convergem pro mesmo `onChange`.
  useEffect(() => {
    if (open) {
      setHourText(date ? format(date, 'HH') : '09');
      setMinuteText(date ? format(date, 'mm') : '00');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const commitHour = () => {
    const n = parseInt(hourText, 10);
    if (Number.isNaN(n)) {
      setHourText(date ? format(date, 'HH') : '09');
      return;
    }
    const clamped = clamp(n, 0, 23);
    const base = date ?? new Date();
    const next = new Date(base);
    next.setHours(clamped, parseInt(minuteText, 10) || 0, 0, 0);
    emit(next);
    setHourText(clamped.toString().padStart(2, '0'));
  };

  const commitMinute = () => {
    const n = parseInt(minuteText, 10);
    if (Number.isNaN(n)) {
      setMinuteText(date ? format(date, 'mm') : '00');
      return;
    }
    const clamped = clamp(n, 0, 59);
    const base = date ?? new Date();
    const next = new Date(base);
    next.setHours(parseInt(hourText, 10) || 0, clamped, 0, 0);
    emit(next);
    setMinuteText(clamped.toString().padStart(2, '0'));
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
          <div className="flex">
            {isDateTime && (
              <div className="flex flex-col items-center gap-2 border-r p-3 min-w-[140px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="text-sm">Horário</span>
                </div>
                <Input
                  value={hourText}
                  onChange={e => setHourText(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  onBlur={commitHour}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitHour();
                    }
                  }}
                  placeholder="HH"
                  inputMode="numeric"
                  maxLength={2}
                  className="h-8 w-[52px] text-center"
                />
                <span className="text-sm text-muted-foreground">:</span>
                <Input
                  value={minuteText}
                  onChange={e => setMinuteText(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  onBlur={commitMinute}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitMinute();
                    }
                  }}
                  placeholder="MM"
                  inputMode="numeric"
                  maxLength={2}
                  className="h-8 w-[52px] text-center"
                />
              </div>
            )}
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
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
