import { useMemo } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface UsuarioOption {
  id: string;
  nome: string;
}

interface Props {
  value: string; // CSV de nomes
  onChange: (value: string) => void;
  usuarios: UsuarioOption[];
  placeholder?: string;
}

export function ParticipantesMultiSelect({ value, onChange, usuarios, placeholder = 'Selecione participantes...' }: Props) {
  const selected = useMemo(
    () => value.split(',').map(s => s.trim()).filter(Boolean),
    [value]
  );

  const toggle = (nome: string) => {
    const next = selected.includes(nome)
      ? selected.filter(x => x !== nome)
      : [...selected, nome];
    onChange(next.join(', '));
  };

  const remove = (nome: string) => {
    onChange(selected.filter(x => x !== nome).join(', '));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map(nome => (
                <Badge key={nome} variant="secondary" className="gap-1 pr-1">
                  {nome}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); remove(nome); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); remove(nome); } }}
                    className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="max-h-72 overflow-y-auto overscroll-contain">
          <div className="p-1">
            {usuarios.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                Nenhum usuário disponível
              </p>
            ) : (
              usuarios.map(u => {
                const isSel = selected.includes(u.nome);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.nome)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                      isSel && 'bg-accent/60'
                    )}
                  >
                    <span>{u.nome}</span>
                    {isSel && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
