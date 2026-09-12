import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  LIMITE_DE_LEMBRETES,
  OPCOES_DE_LEMBRETE,
  normalizarLembretes,
  rotuloDoLembrete,
} from '@/lib/lembretes-do-evento';

type Unidade = 'minutos' | 'horas' | 'dias';
const EM_MINUTOS: Record<Unidade, number> = { minutos: 1, horas: 60, dias: 1440 };

// Seletor nativo de propósito: abre o seletor do próprio celular, e é o mais
// fácil de usar com o dedo numa lista curta.
const SELECT =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
  value: number[];
  onChange: (lembretes: number[]) => void;
  disabled?: boolean;
}

export function LembretesField({ value, onChange, disabled }: Props) {
  const [personalizando, setPersonalizando] = useState(false);
  const [quanto, setQuanto] = useState('30');
  const [unidade, setUnidade] = useState<Unidade>('minutos');

  const acrescentar = (minutos: number) => onChange(normalizarLembretes([...value, minutos]));
  const disponiveis = OPCOES_DE_LEMBRETE.filter((m) => !value.includes(m));
  const podeAcrescentar = !disabled && value.length < LIMITE_DE_LEMBRETES;

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
        Lembretes para os participantes
      </Label>

      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && <span className="text-sm text-muted-foreground">Sem lembrete</span>}
        {value.map((m) => (
          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
            {rotuloDoLembrete(m)}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remover ${rotuloDoLembrete(m)}`}
                onClick={() => onChange(value.filter((x) => x !== m))}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {podeAcrescentar && !personalizando && (
        <select
          aria-label="Adicionar lembrete"
          className={SELECT}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'personalizado') setPersonalizando(true);
            else if (v) acrescentar(Number(v));
          }}
        >
          <option value="">+ Adicionar lembrete</option>
          {disponiveis.map((m) => (
            <option key={m} value={m}>{rotuloDoLembrete(m)}</option>
          ))}
          <option value="personalizado">Personalizado…</option>
        </select>
      )}

      {podeAcrescentar && personalizando && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Quanto tempo antes"
            type="number"
            min={1}
            value={quanto}
            onChange={(e) => setQuanto(e.target.value)}
            className="h-9 w-20"
          />
          <select
            aria-label="Unidade"
            className={SELECT}
            value={unidade}
            onChange={(e) => setUnidade(e.target.value as Unidade)}
          >
            <option value="minutos">minutos</option>
            <option value="horas">horas</option>
            <option value="dias">dias</option>
          </select>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const minutos = Number(quanto) * EM_MINUTOS[unidade];
              if (Number.isInteger(minutos) && minutos > 0) acrescentar(minutos);
              setPersonalizando(false);
            }}
          >
            Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPersonalizando(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
