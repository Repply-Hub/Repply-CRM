import * as React from "react";
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  onActionClick?: () => void;
  actionLabel?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecione uma opção...",
  emptyMessage = "Nenhuma opção encontrada.",
  className,
  onActionClick,
  actionLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);

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
          {selectedOption ? selectedOption.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command 
          filter={(value, search) => {
            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
            return 0;
          }}
        >
          <CommandInput placeholder={`Buscar ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty className="py-2 text-center text-sm">
              {emptyMessage}
              {onActionClick && actionLabel && (
                <div className="mt-2 px-2 border-t pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
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
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {onActionClick && actionLabel && (
              <div className="p-1 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
