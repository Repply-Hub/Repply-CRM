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

export function EventDateTimeField({
  label,
  type,
  value,
  onChange,
}: EventDateTimeFieldProps) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full text-sm pr-12 picker-with-custom-icon [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-clear-button]:appearance-none',
          )}
          style={{ colorScheme: 'normal' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md border-l border-border bg-muted/40 text-muted-foreground"
        >
          <CalendarDays className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
