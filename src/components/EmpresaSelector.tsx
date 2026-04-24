import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClientes } from '@/hooks/use-clientes';
import { useCreateCliente } from '@/hooks/use-mutations';
import { toast } from 'sonner';

interface EmpresaSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function EmpresaSelector({ value, onValueChange, placeholder = "Selecionar empresa..." }: EmpresaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create cliente state
  const [newEmpresa, setNewEmpresa] = useState({
    empresa: '',
    tipo: 'construtora',
    cnpj: '',
  });

  const { data: clientes, isLoading } = useClientes();
  const createCliente = useCreateCliente();

  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    if (!searchTerm) return clientes;
    const search = searchTerm.toLowerCase();
    return clientes.filter((c) => 
      c.empresa?.toLowerCase().includes(search) || 
      c.razao_social?.toLowerCase().includes(search) ||
      c.cnpj?.includes(search)
    );
  }, [clientes, searchTerm]);

  const selectedCliente = useMemo(() => 
    clientes?.find((c) => c.id === value), 
  [clientes, value]);

  const handleCreate = async () => {
    if (!newEmpresa.empresa) {
      toast.error('O nome da empresa é obrigatório');
      return;
    }

    try {
      const result = await createCliente.mutateAsync(newEmpresa);
      toast.success('Empresa cadastrada com sucesso!');
      setDialogOpen(false);
      if (result?.id) {
        onValueChange(result.id);
      }
      setNewEmpresa({ empresa: '', tipo: 'construtora', cnpj: '' });
    } catch (error: any) {
      toast.error('Erro ao cadastrar empresa: ' + error.message);
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
            {selectedCliente ? selectedCliente.empresa : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar empresa..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty className="py-2 px-2">
                <p className="text-xs text-muted-foreground mb-2 text-center">Nenhuma empresa encontrada.</p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full gap-2 text-xs"
                  onClick={() => {
                    setNewEmpresa(prev => ({ ...prev, empresa: searchTerm }));
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Cadastrar "{searchTerm}"
                </Button>
              </CommandEmpty>
              <CommandGroup>
                {filteredClientes.map((cliente) => (
                  <CommandItem
                    key={cliente.id}
                    value={cliente.id}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === cliente.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{cliente.empresa}</span>
                      {cliente.cnpj && (
                        <span className="text-[10px] text-muted-foreground">{cliente.cnpj}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {searchTerm && filteredClientes.length > 0 && (
              <div className="p-1 border-t">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="w-full justify-start gap-2 text-xs font-normal"
                  onClick={() => {
                    setNewEmpresa(prev => ({ ...prev, empresa: searchTerm }));
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Nova empresa: "{searchTerm}"
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome da Empresa *</Label>
              <Input
                id="name"
                value={newEmpresa.empresa}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, empresa: e.target.value })}
                placeholder="Ex: Engecomp Soluções"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select 
                value={newEmpresa.tipo} 
                onValueChange={(v) => setNewEmpresa({ ...newEmpresa, tipo: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construtora">Construtora</SelectItem>
                  <SelectItem value="loja">Loja</SelectItem>
                  <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                  <SelectItem value="condominio">Condomínio</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="distribuidor">Distribuidor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cnpj">CNPJ / CPF</Label>
              <Input
                id="cnpj"
                value={newEmpresa.cnpj}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createCliente.isPending}>
              {createCliente.isPending ? 'Salvando...' : 'Cadastrar e Selecionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
