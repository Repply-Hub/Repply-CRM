import { useState } from "react";
import {
  format,
  subDays,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TOGGLE_LIST_CLASS,
  TOGGLE_ITEM_CLASS,
} from "@/lib/toggle-group-styles";
import { mesDoCalendario, useMesVisivel } from "@/components/shared/mes-calendario";

export interface DateRange {
  from: Date;
  to: Date;
}

const presets = [
  {
    label: "Todos",
    range: () => ({ from: new Date(2000, 0, 1), to: new Date() }),
  },
  {
    label: "Hoje",
    range: () => ({ from: startOfDay(new Date()), to: new Date() }),
  },
  {
    label: "Últimos 7 dias",
    range: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    label: "Últimos 30 dias",
    range: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: "Este mês",
    range: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: "Últimos 3 meses",
    range: () => ({ from: subMonths(new Date(), 3), to: new Date() }),
  },
  {
    label: "Últimos 6 meses",
    range: () => ({ from: subMonths(new Date(), 6), to: new Date() }),
  },
  {
    label: "Este ano",
    range: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

// Um só dropdown (Atalhos + calendário), mas com "De:"/"Até:" como abas
// separadas dentro dele — cada uma com seu campo próprio — em vez de um único
// calendário em modo "range" (2 cliques). O modo range do react-day-picker
// decide o que um clique faz olhando pro range JÁ selecionado (addToRange): uma
// vez que `value` já vem completo (from e to preenchidos, sempre o caso aqui),
// todo clique só estica uma ponta do período ANTIGO, nunca começa um período
// novo do zero — dava pra ficar preso sem conseguir trocar as duas datas.
// Selecionar dia único por aba não tem essa ambiguidade: cada clique sempre
// define exatamente aquele campo, sem interpretar contra um estado anterior.
export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [campo, setCampo] = useState<"de" | "ate">("de");

  // Abrir no mês da data que já está no campo em edição, em vez do mês atual.
  // Filtrando março/2024, fechar e reabrir a aba jogava a pessoa em agosto/2026
  // — 29 cliques na setinha pra voltar. Ver `mes-calendario.ts` pro porquê.
  //
  // Aqui `defaultMonth` sozinho NÃO resolveria: o <Calendar> abaixo é o mesmo
  // elemento nas duas abas, então trocar de "De" pra "Até" não remonta nada e o
  // mês inicial nunca seria recalculado. Por isso a forma controlada, com o
  // `campo` e o `open` na chave: cada troca de aba e cada reabertura do popover
  // volta pro mês certo, e no meio disso a navegação continua livre.
  const mesVisivel = useMesVisivel(
    campo === "de"
      ? mesDoCalendario(value.from, value.to)
      : mesDoCalendario(value.to, value.from),
    `${campo}|${open}`,
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setCampo("de");
  };

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    if (campo === "de") {
      onChange({ from: date, to: date > value.to ? date : value.to });
      setCampo("ate"); // avança pro próximo campo — dá pra escolher os dois sem reabrir a aba
    } else {
      onChange({ from: date < value.from ? date : value.from, to: date });
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-start text-left font-normal gap-2 h-9 px-3 text-sm border-border/60"
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">De:</span>{" "}
          {format(value.from, "dd MMM yyyy", { locale: ptBR })}
          <span className="text-muted-foreground">Até:</span>{" "}
          {format(value.to, "dd MMM yyyy", { locale: ptBR })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-r border-border p-3 space-y-1 min-w-[160px]">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Atalhos
            </p>
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  onChange(preset.range());
                  setOpen(false);
                }}
                className="block w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="p-3 space-y-3 min-w-[300px]">
            <ToggleGroup
              type="single"
              value={campo}
              onValueChange={(v) => v && setCampo(v as "de" | "ate")}
              className={cn(TOGGLE_LIST_CLASS, "w-full")}
            >
              <ToggleGroupItem
                value="de"
                className={cn(TOGGLE_ITEM_CLASS, "flex-1 whitespace-nowrap")}
              >
                De: {format(value.from, "dd MMM yyyy", { locale: ptBR })}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="ate"
                className={cn(TOGGLE_ITEM_CLASS, "flex-1 whitespace-nowrap")}
              >
                Até: {format(value.to, "dd MMM yyyy", { locale: ptBR })}
              </ToggleGroupItem>
            </ToggleGroup>
            <Calendar
              mode="single"
              selected={campo === "de" ? value.from : value.to}
              month={mesVisivel.month}
              onMonthChange={mesVisivel.onMonthChange}
              onSelect={handleSelect}
              disabled={
                campo === "de" ? { after: value.to } : { before: value.from }
              }
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
