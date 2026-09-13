import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  LIMITE_DE_LEMBRETES,
  OPCOES_DE_LEMBRETE,
  minutosPersonalizados,
  normalizarLembretes,
  rotuloDoLembrete,
  type UnidadeDeLembrete,
} from '@/lib/lembretes-do-evento';

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
  const [unidade, setUnidade] = useState<UnidadeDeLembrete>('minutos');
  // 🔴 Bloco 3, item C. `null` = "ainda não tentou" (esconde a frase); string = o erro a mostrar.
  const [erro, setErro] = useState<string | null>(null);

  const acrescentar = (minutos: number) => onChange(normalizarLembretes([...value, minutos]));
  const cancelarPersonalizado = () => {
    setPersonalizando(false);
    setErro(null);
    setQuanto('30');
  };
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
          {/* 🔴 `type="text" inputMode="decimal"`, não `type="number"` — CLAUDE.md §7.10. O
              navegador devolve string vazia para "1,5" num campo `number` (vírgula não é
              dígito para ele), e o formulário fechava como se o lembrete tivesse entrado,
              sem avisar nada. `inputMode="decimal"` só troca o teclado no celular. */}
          <Input
            aria-label="Quanto tempo antes"
            type="text"
            inputMode="decimal"
            value={quanto}
            onChange={(e) => {
              setQuanto(e.target.value);
              setErro(null);
            }}
            className="h-9 w-20"
          />
          <select
            aria-label="Unidade"
            className={SELECT}
            value={unidade}
            onChange={(e) => {
              setUnidade(e.target.value as UnidadeDeLembrete);
              setErro(null);
            }}
          >
            <option value="minutos">minutos</option>
            <option value="horas">horas</option>
            <option value="dias">dias</option>
          </select>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const minutos = minutosPersonalizados(quanto, unidade);
              if (minutos === null) {
                setErro('Não deu para usar esse tempo. Use um número de minutos inteiro, até 30 dias.');
                return;
              }
              acrescentar(minutos);
              cancelarPersonalizado();
            }}
          >
            Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancelarPersonalizado}>
            Cancelar
          </Button>
          {erro && <p className="w-full text-xs text-destructive">{erro}</p>}
        </div>
      )}
    </div>
  );
}
