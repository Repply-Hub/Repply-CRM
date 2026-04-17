import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  const openPicker = () => {
    const input = inputRef.current as PickerCapableInput | null;
    if (!input) return;

    input.focus();

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.click();
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
          className="w-full pr-12 text-sm [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label={`Abrir seletor de ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md bg-transparent p-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}