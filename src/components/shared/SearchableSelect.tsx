import * as React from "react";
import { Check, ChevronDown, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { correspondeBusca } from "@/lib/texto-busca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
  value: string;
  label: string;
  /** Texto do badge mostrado à direita da opção (ex: "Meta adicionada") — omitido não
   * renderiza nada. Não afeta seleção/filtro, é só um indicador visual na lista. */
  badge?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  /** Sobrescreve a largura do dropdown (por padrão acompanha a largura do trigger) — útil
   * quando o campo fica num grid estreito mas as opções têm rótulos longos. */
  contentClassName?: string;
  onActionClick?: () => void;
  actionLabel?: string;
  /** Rótulo (`option.label`) que a lista deve trazer visível assim que abrir, em vez de
   * começar do topo — ex: o ano corrente num seletor de ano com centenas de opções. Não
   * muda a seleção, só a posição inicial do scroll. */
  scrollToLabel?: string;
  /** Sobrescreve o placeholder do campo de busca dentro do dropdown — por padrão é
   * derivado de `placeholder` ("Buscar <placeholder em minúsculas>..."), o que fica
   * estranho quando `placeholder` já é uma frase (ex: "Selecione o vendedor"). */
  searchPlaceholder?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecione uma opção...",
  emptyMessage = "Nenhuma opção encontrada.",
  className,
  contentClassName,
  onActionClick,
  actionLabel,
  scrollToLabel,
  searchPlaceholder,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  // O Popover só monta o conteúdo quando abre, então o item alvo só existe no DOM
  // no próximo frame — por isso o requestAnimationFrame em vez de rodar no mesmo tick.
  React.useEffect(() => {
    if (!open || !scrollToLabel) return;
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-value="${scrollToLabel}"]`)
        ?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, scrollToLabel]);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align="start"
      >
        <div className="flex flex-col">
          <Command
            className="flex flex-col"
            filter={(value, search) => (correspondeBusca(value, search) ? 1 : 0)}
          >
            <CommandInput placeholder={searchPlaceholder ?? `Buscar ${placeholder.toLowerCase()}...`} />
            <CommandList ref={listRef} className="max-h-[200px] overflow-y-auto overflow-x-hidden">
              <CommandEmpty className="py-6 text-center text-sm">
                {emptyMessage}
              </CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                    {option.badge && (
                      <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] font-medium">
                        {option.badge}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          
          {onActionClick && actionLabel && (
            <div className="p-1 border-t bg-popover">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 h-9"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onActionClick();
                  setOpen(false);
                }}
              >
                <Plus className="mr-2 h-3 w-3" />
                {actionLabel}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
