import * as React from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Seletor com busca do formulário de tarefas.
 *
 * POR QUE NÃO É O `SearchableSelect` COMPARTILHADO:
 * ele resolve o caso simples, mas guarda o texto digitado dentro de si e só
 * compara com o `label` da opção. Os dois campos desta tela precisam de mais:
 *
 * 1. "Empresa (cliente)" tem que achar por razão social e CNPJ além do nome —
 *    a MD tem 35 nomes repetidos cobrindo 70 clientes, e sem o CNPJ na tela os
 *    dois "Construtora Silva" ficam indistinguíveis. Daí a `descricao`, que
 *    aparece embaixo do nome E entra na busca.
 * 2. "Negócio" precisa mandar o que foi digitado para QUEM CHAMA, porque a
 *    procura de verdade acontece no servidor (são 11.907 negócios, e o dropdown
 *    só recebe uma fatia). Daí o `aoBuscar`.
 * 3. `aviso` é o rodapé honesto: quando a lista está cortada, a tela diz isso
 *    em vez de deixar a pessoa concluir que o registro não existe.
 *
 * A busca ignora acento nos dois lados: quem digita "orcamento" acha
 * "Orçamento", que é como a maioria digita com pressa.
 */

export interface OpcaoComBusca {
  value: string;
  label: string;
  /** Segunda linha da opção (CNPJ, cliente, fabricante). Também entra na busca. */
  descricao?: string;
}

interface SeletorComBuscaProps {
  options: OpcaoComBusca[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Recebe o texto digitado — use quando a procura de verdade for no servidor. */
  aoBuscar?: (termo: string) => void;
  /** Rodapé fixo do dropdown, para avisar que a lista está limitada. */
  aviso?: string;
  carregando?: boolean;
  className?: string;
  contentClassName?: string;
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function SeletorComBusca({
  options,
  value,
  onValueChange,
  placeholder = 'Selecione uma opção...',
  searchPlaceholder,
  emptyMessage = 'Nenhuma opção encontrada.',
  aoBuscar,
  aviso,
  carregando,
  className,
  contentClassName,
}: SeletorComBuscaProps) {
  const [aberto, setAberto] = React.useState(false);
  const [termo, setTermo] = React.useState('');

  const mudarTermo = (novo: string) => {
    setTermo(novo);
    aoBuscar?.(novo);
  };

  // O filtro local continua valendo mesmo quando a busca é no servidor: ele afina o
  // que já chegou enquanto a resposta nova não vem, e cobre as letras iniciais que
  // ainda não são suficientes para consultar o servidor.
  const filtradas = React.useMemo(() => {
    const busca = semAcento(termo.trim());
    if (!busca) return options;
    return options.filter((o) => semAcento(`${o.label} ${o.descricao ?? ''}`).includes(busca));
  }, [options, termo]);

  const selecionada = options.find((o) => o.value === value);

  return (
    <Popover
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o);
        if (!o) mudarTermo('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          className={cn('w-full justify-between font-normal', !selecionada && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selecionada ? selecionada.label : placeholder}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-[var(--radix-popover-trigger-width)] p-0', contentClassName)}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder ?? 'Buscar...'}
            value={termo}
            onValueChange={mudarTermo}
          />
          <CommandList className="max-h-[240px]">
            {carregando ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando...
              </div>
            ) : (
              <>
                <CommandEmpty className="py-6 text-center text-sm">{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  {filtradas.map((opcao) => (
                    <CommandItem
                      key={opcao.value}
                      value={opcao.value}
                      onSelect={() => {
                        onValueChange(opcao.value);
                        setAberto(false);
                        mudarTermo('');
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === opcao.value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{opcao.label}</span>
                        {opcao.descricao && (
                          <span className="truncate text-[10px] text-muted-foreground">{opcao.descricao}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {aviso && (
            <p className="border-t px-2 py-1.5 text-[10px] leading-tight text-muted-foreground">{aviso}</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
