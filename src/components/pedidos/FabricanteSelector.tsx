import { useState, useMemo } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFabricantes } from '@/hooks/use-clientes';
import { useCreateFabricanteCompleto } from '@/hooks/use-novo-pedido';
import { fabricanteEstaAtivo } from '@/lib/ordem-de-fabricantes';
import { toast } from 'sonner';

interface FabricanteSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function FabricanteSelector({ value, onValueChange, placeholder = "Selecionar fabricante..." }: FabricanteSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newFab, setNewFab] = useState({
    nome: '',
    cnpj: '',
  });

  const { data: fabricantes, isLoading } = useFabricantes();
  const createFabricante = useCreateFabricanteCompleto();

  // A lista chega do hook já com as marcas inativas por último (`useFabricantes`), e este
  // filtro preserva a ordem — `Array.prototype.filter` não reordena nada.
  const filteredFabricantes = useMemo(() => {
    if (!fabricantes) return [];
    if (!searchTerm) return fabricantes;
    const search = searchTerm.toLowerCase();
    return fabricantes.filter((f) => 
      f.nome?.toLowerCase().includes(search) || 
      f.cnpj?.includes(search)
    );
  }, [fabricantes, searchTerm]);

  const selectedFab = useMemo(() => 
    fabricantes?.find((f) => f.id === value), 
  [fabricantes, value]);

  const handleCreate = async () => {
    if (!newFab.nome) {
      toast.error('O nome do fabricante é obrigatório');
      return;
    }

    try {
      const result = await createFabricante.mutateAsync(newFab);
      toast.success('Fabricante cadastrado com sucesso!');
      setDialogOpen(false);
      if (result?.id) {
        onValueChange(result.id);
      }
      setNewFab({ nome: '', cnpj: '' });
    } catch (error: any) {
      toast.error('Erro ao cadastrar fabricante: ' + error.message);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {/* O negócio antigo de uma marca desativada continua abrindo com ela
                escolhida — o selo no botão explica por que aquele nome não aparece mais no
                topo da lista, sem sugerir que algo está errado com o negócio. */}
            {selectedFab ? (
              <span className="flex items-center gap-1.5 truncate">
                <span className="truncate">{selectedFab.nome}</span>
                {!fabricanteEstaAtivo(selectedFab) && (
                  <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    Inativa
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar fabricante..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty className="py-2 px-2">
                <p className="text-xs text-muted-foreground mb-2 text-center">Nenhum fabricante encontrado.</p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full gap-2 text-xs"
                  onClick={() => {
                    setNewFab(prev => ({ ...prev, nome: searchTerm }));
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Cadastrar "{searchTerm}"
                </Button>
              </CommandEmpty>
              <CommandGroup>
                {filteredFabricantes.map((fab) => (
                  <CommandItem
                    key={fab.id}
                    value={fab.id}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === fab.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        {fab.nome}
                        {/* Marca que a empresa não representa mais. Continua escolhível —
                            negócio antigo pode precisar ser corrigido para ela —, só está
                            no fim da lista e avisa o porquê. */}
                        {!fabricanteEstaAtivo(fab) && (
                          <span className="rounded border border-border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                            Inativa
                          </span>
                        )}
                      </span>
                      {fab.cnpj && (
                        <span className="text-[10px] text-muted-foreground">{fab.cnpj}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {searchTerm && filteredFabricantes.length > 0 && (
              <div className="p-1 border-t">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="w-full justify-start gap-2 text-xs font-normal"
                  onClick={() => {
                    setNewFab(prev => ({ ...prev, nome: searchTerm }));
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Novo fabricante: "{searchTerm}"
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Fabricante</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fab-name">Nome do Fabricante *</Label>
              <Input
                id="fab-name"
                value={newFab.nome}
                onChange={(e) => setNewFab({ ...newFab, nome: e.target.value })}
                placeholder="Ex: Tigre, Deca"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fab-cnpj">CNPJ</Label>
              <Input
                id="fab-cnpj"
                value={newFab.cnpj}
                onChange={(e) => setNewFab({ ...newFab, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createFabricante.isPending}>
              {createFabricante.isPending ? 'Salvando...' : 'Cadastrar e Selecionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
