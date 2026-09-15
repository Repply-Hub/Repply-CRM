import { format, startOfYear } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/shared/DateRangePicker';

/**
 * O período OPCIONAL do painel "No geral" — pedido de 15/09/2026.
 *
 * 🔴 DESLIGADO POR PADRÃO. Enquanto `dataDe`/`dataAte` estão vazios, mostra só o botão "Período" e o
 * bloco continua mostrando tudo — inclusive os parados mais antigos, que é o motivo de o filtro
 * nascer desligado (ver `RadarDeRisco.tsx`). Ao ativar, reaproveita o `DateRangePicker` já
 * existente, que cuida das armadilhas de calendário do §7.13; um "×" limpa e volta ao desligado.
 *
 * Vale para TODOS — não depende da chave `pauta_de_todos` (ao contrário do filtro de responsável).
 *
 * Datas em texto `AAAA-MM-DD`. Ler do texto com âncora de meio-dia e gravar com `format` local são
 * as duas pontas certas do fuso (§7.12): nenhuma conversão que recue um dia.
 */
export function PeriodoDoPainel({
  dataDe,
  dataAte,
  onChange,
}: {
  dataDe?: string;
  dataAte?: string;
  onChange: (periodo: { dataDe?: string; dataAte?: string }) => void;
}) {
  const ativo = !!(dataDe && dataAte);

  if (!ativo) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-2 border-border/60 text-muted-foreground"
        onClick={() => {
          // Ativa num período amplo (o ano corrente): quem clica quer NARROW; começar no ano evita
          // a lista sumir de vez, e o passo seguinte é escolher um atalho ("Últimos 3 meses" etc.).
          const hoje = new Date();
          onChange({
            dataDe: format(startOfYear(hoje), 'yyyy-MM-dd'),
            dataAte: format(hoje, 'yyyy-MM-dd'),
          });
        }}
      >
        <CalendarDays className="h-4 w-4" />
        Período
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <DateRangePicker
        value={{ from: new Date(`${dataDe}T12:00:00`), to: new Date(`${dataAte}T12:00:00`) }}
        onChange={(r) =>
          onChange({ dataDe: format(r.from, 'yyyy-MM-dd'), dataAte: format(r.to, 'yyyy-MM-dd') })
        }
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground"
        aria-label="Limpar período"
        onClick={() => onChange({ dataDe: undefined, dataAte: undefined })}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
