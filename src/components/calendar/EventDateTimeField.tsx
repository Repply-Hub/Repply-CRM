import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface EventDateTimeFieldProps {
  label: string;
  type: 'date' | 'datetime-local';
  value: string;
  onChange: (value: string) => void;
}

type PickerCapableInput = HTMLInputElement & {
  showPicker?: () => void;
};

export function EventDateTimeField({
  label,
  type,
  value,
  onChange,
}: EventDateTimeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const supportsShowPicker = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype;

  const openPicker = () => {
    const input = inputRef.current as PickerCapableInput | null;
    if (!input) return;

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
  };

  return (
    <div className="space-y-1.5 min-w-0">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(event) => {
            if (!supportsShowPicker) return;
            event.preventDefault();
            openPicker();
          }}
          className={cn(
            'w-full text-sm',
            supportsShowPicker &&
              'appearance-none pr-12 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:w-10 [&::-webkit-calendar-picker-indicator]:h-10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-clear-button]:appearance-none',
          )}
          style={supportsShowPicker ? { colorScheme: 'normal' } : undefined}
        />
        {supportsShowPicker && (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              openPicker();
            }}
            aria-label={`Abrir seletor de ${label.toLowerCase()}`}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md border-l border-border bg-muted/40 p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}