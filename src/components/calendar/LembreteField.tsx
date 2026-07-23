import { useMemo, useState, useEffect } from 'react';
import { BellRing } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LembreteFieldProps {
  value: number | null;
  onChange: (minutos: number | null) => void;
}

const PRESETS = [
  { key: 'none', label: 'Sem lembrete', minutos: null },
  { key: '15m', label: '15 minutos antes', minutos: 15 },
  { key: '30m', label: '30 minutos antes', minutos: 30 },
  { key: '1h', label: '1 hora antes', minutos: 60 },
  { key: '2h', label: '2 horas antes', minutos: 120 },
  { key: '1d', label: '1 dia antes', minutos: 1440 },
  { key: '2d', label: '2 dias antes', minutos: 2880 },
] as const;

type UnidadePersonalizada = 'minutos' | 'horas' | 'dias';

const UNIDADE_EM_MINUTOS: Record<UnidadePersonalizada, number> = {
  minutos: 1,
  horas: 60,
  dias: 1440,
};

function presetKeyFor(minutos: number | null): string {
  const preset = PRESETS.find((p) => p.minutos === minutos);
  return preset ? preset.key : minutos == null ? 'none' : 'custom';
}

export function LembreteField({ value, onChange }: LembreteFieldProps) {
  const [selectedKey, setSelectedKey] = useState(() => presetKeyFor(value));
  const [customValue, setCustomValue] = useState(() =>
    value && presetKeyFor(value) === 'custom' ? String(value) : '15',
  );
  const [customUnidade, setCustomUnidade] = useState<UnidadePersonalizada>('minutos');

  // Sincroniza quando o valor externo muda (ex.: ao abrir o dialog para editar outro evento).
  useEffect(() => {
    setSelectedKey(presetKeyFor(value));
  }, [value]);

  const isCustom = selectedKey === 'custom';

  const handlePresetChange = (key: string) => {
    setSelectedKey(key);
    if (key === 'custom') {
      const minutos = Number(customValue) * UNIDADE_EM_MINUTOS[customUnidade];
      onChange(minutos > 0 ? minutos : null);
      return;
    }
    const preset = PRESETS.find((p) => p.key === key);
    onChange(preset?.minutos ?? null);
  };

  const handleCustomValueChange = (raw: string) => {
    setCustomValue(raw);
    const minutos = Number(raw) * UNIDADE_EM_MINUTOS[customUnidade];
    onChange(minutos > 0 ? minutos : null);
  };

  const handleCustomUnidadeChange = (unidade: UnidadePersonalizada) => {
    setCustomUnidade(unidade);
    const minutos = Number(customValue) * UNIDADE_EM_MINUTOS[unidade];
    onChange(minutos > 0 ? minutos : null);
  };

  const options = useMemo(
    () => [...PRESETS, { key: 'custom', label: 'Personalizado…', minutos: null }],
    [],
  );

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
        Lembrete para os participantes
      </Label>
      <div className="flex gap-2">
        <Select value={selectedKey} onValueChange={handlePresetChange}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isCustom && (
          <>
            <Input
              type="number"
              min={1}
              value={customValue}
              onChange={(e) => handleCustomValueChange(e.target.value)}
              className="w-20"
            />
            <Select value={customUnidade} onValueChange={handleCustomUnidadeChange}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutos">minutos</SelectItem>
                <SelectItem value="horas">horas</SelectItem>
                <SelectItem value="dias">dias</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>
  );
}
