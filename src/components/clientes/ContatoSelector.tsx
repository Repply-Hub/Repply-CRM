import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/** O mínimo que o seletor precisa de um contato. Recebe a lista pronta em vez de buscar
 * sozinho porque cada tela já tem a sua (uma delas exclui os contatos do próprio cliente). */
export interface ContatoOpcao {
  id: string;
  nome_contato?: string | null;
  empresa?: string | null;
  email?: string | null;
  telefone?: string | null;
}

interface ContatoSelectorProps {
  contatos: ContatoOpcao[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
}

/** Teto de linhas desenhadas de uma vez. Sem ele o navegador monta os 1.091 contatos da MD
 * a cada tecla digitada e o campo engasga. Quem não achou nos 100 primeiros refina a busca. */
const LIMITE_VISIVEL = 100;

/** Minúsculas e sem acento dos dois lados: quem procura "jose" tem que achar "José". */
const normalizar = (v?: string | null) =>
  (v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const soDigitos = (v?: string | null) => (v ?? '').replace(/\D/g, '');

const rotuloDe = (c: ContatoOpcao) => c.nome_contato?.trim() || c.email?.trim() || 'Contato sem nome';

/** Segunda linha da opção: é ela que separa dois "João Silva" na lista. */
const detalheDe = (c: ContatoOpcao) =>
  [c.empresa, c.email, c.telefone].map(v => v?.trim()).filter(Boolean).join(' · ');

/**
 * Escolha de UM contato com busca por nome, empresa, e-mail e telefone.
 *
 * Não usa o `SearchableSelect` de propósito: ele identifica cada item pelo RÓTULO
 * (SearchableSelect.tsx:113) e, com mais de mil contatos, nome repetido é regra, não
 * exceção — dois itens de mesmo rótulo passariam a responder como um só. Aqui o item é
 * identificado pelo id, que é único por construção. É o mesmo desenho do EmpresaSelector,
 * que já faz isso com os 1.305 clientes.
 */
export function ContatoSelector({
  contatos,
  value,
  onValueChange,
  placeholder = 'Escolha um contato...',
  emptyMessage = 'Nenhum contato encontrado.',
  className,
}: ContatoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');

  // O texto de busca de cada contato é montado uma vez só, não a cada tecla.
  const indexados = useMemo(
    () =>
      contatos.map(c => ({
        contato: c,
        alvo: normalizar([c.nome_contato, c.empresa, c.email, c.telefone].filter(Boolean).join(' ')),
        telefoneDigitos: soDigitos(c.telefone),
      })),
    [contatos]
  );

  const filtrados = useMemo(() => {
    const termo = normalizar(busca).trim();
    if (!termo) return indexados.map(i => i.contato);
    // Telefone é digitado com máscara ou sem; comparar só os dígitos faz "84 99999" achar
    // "(84) 99999-0000".
    const digitos = soDigitos(busca);
    return indexados
      .filter(i => i.alvo.includes(termo) || (digitos.length >= 3 && i.telefoneDigitos.includes(digitos)))
      .map(i => i.contato);
  }, [indexados, busca]);

  const visiveis = filtrados.slice(0, LIMITE_VISIVEL);
  const selecionado = useMemo(() => contatos.find(c => c.id === value), [contatos, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate">
            {selecionado
              ? `${rotuloDe(selecionado)}${selecionado.empresa ? ` (${selecionado.empresa})` : ''}`
              : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={e => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome, empresa, e-mail ou telefone..."
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList className="max-h-[300px]">
            <CommandGroup>
              {visiveis.map(c => {
                const detalhe = detalheDe(c);
                return (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onValueChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{rotuloDe(c)}</span>
                      {detalhe && (
                        <span className="truncate text-[10px] text-muted-foreground">{detalhe}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
          </CommandList>
          {filtrados.length > visiveis.length && (
            <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              Mostrando {visiveis.length} de {filtrados.length}. Continue digitando para refinar.
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
