import { useState, useMemo, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClientes } from '@/hooks/use-clientes';
import { useCreateCliente } from '@/hooks/use-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useClientesTipos } from '@/hooks/use-clientes-tipos';
import { tipoPadrao } from '@/lib/tipos-de-cliente';
import { toast } from 'sonner';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits } from '@/lib/cnpj';
import { correspondeBusca } from '@/lib/texto-busca';

interface EmpresaSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function EmpresaSelector({ value, onValueChange, placeholder = "Selecionar empresa..." }: EmpresaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create cliente state. Tipo começa vazio -- a lista de tipos vem do banco e ainda não
  // chegou na primeira pintura; o efeito abaixo preenche assim que ela carregar.
  const [newEmpresa, setNewEmpresa] = useState({
    empresa: '',
    tipo: '',
    cnpj: '',
    email: '',
    telefone: '',
  });

  const { data: clientes, isLoading } = useClientes();
  const createCliente = useCreateCliente();
  const { profile } = useAuth();
  const empresaIdAtual = profile?.empresa_id ?? profile?.empresas?.id;
  // A lista de tipos é da EMPRESA (tabela clientes_tipos), igual Clientes.tsx: este atalho
  // de cadastro rápido cria cliente de verdade, então não pode oferecer uma lista fixa
  // diferente da tela de Clientes.
  const { data: tiposDeCliente } = useClientesTipos(empresaIdAtual);
  const tipos = useMemo(() => tiposDeCliente ?? [], [tiposDeCliente]);

  // A lista chega depois da primeira pintura: este efeito dá ao campo Tipo o primeiro
  // item da empresa assim que ela carrega, no lugar do "construtora" cravado no código.
  useEffect(() => {
    if (!newEmpresa.tipo && tipos.length > 0) {
      setNewEmpresa(prev => ({ ...prev, tipo: tipoPadrao(tipos) }));
    }
  }, [tipos, newEmpresa.tipo]);

  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    if (!searchTerm) return clientes;
    // Busca sem acento e sem caixa: "jeronimo" acha "Jerônimo". O CNPJ casa pelos dígitos
    // crus, que não têm acento.
    return clientes.filter((c) =>
      correspondeBusca(c.empresa, searchTerm) ||
      correspondeBusca(c.razao_social, searchTerm) ||
      c.cnpj?.includes(searchTerm.trim())
    );
  }, [clientes, searchTerm]);

  const selectedCliente = useMemo(() => 
    clientes?.find((c) => c.id === value), 
  [clientes, value]);

  const handleCreate = async () => {
    if (!newEmpresa.empresa.trim()) {
      toast.error('O nome da empresa é obrigatório');
      return;
    }
    if (unmaskCnpj(newEmpresa.cnpj).length !== 14) {
      toast.error('Informe um CNPJ válido');
      return;
    }
    if (!isValidCnpjDigits(unmaskCnpj(newEmpresa.cnpj))) {
      toast.error('CNPJ inválido');
      return;
    }
    if (!newEmpresa.email.trim()) {
      toast.error('O e-mail da empresa é obrigatório');
      return;
    }
    if (!newEmpresa.telefone.trim()) {
      toast.error('O telefone da empresa é obrigatório');
      return;
    }
    // `clientes.tipo` é NOT NULL no banco, mas string vazia SATISFAZ essa trava -- e
    // `opcoesDeFiltro` descarta valor vazio, então o cliente ficaria invisível no filtro
    // de Tipo. O campo nasce vazio e só é preenchido quando a lista da empresa chega (efeito
    // acima); se a consulta falhar ou demorar, ele continua vazio. Sem esta trava, o cadastro
    // rápido gravaria o cliente mesmo assim e ainda mostraria "sucesso".
    if (!newEmpresa.tipo.trim()) {
      toast.error('Escolha o tipo do cliente.');
      return;
    }

    try {
      const result = await createCliente.mutateAsync({
        ...newEmpresa,
        cnpj: unmaskCnpj(newEmpresa.cnpj),
      });
      toast.success('Empresa cadastrada com sucesso!');
      setDialogOpen(false);
      if (result?.id) {
        onValueChange(result.id);
      }
      setNewEmpresa({ empresa: '', tipo: tipoPadrao(tipos), cnpj: '', email: '', telefone: '' });
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
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[--radix-popover-trigger-width] p-0" 
          align="start"
          onWheel={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar empresa..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList className="max-h-[300px]">
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
                  {tipos.map(t => (
                    <SelectItem key={t.id} value={t.slug}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                value={newEmpresa.cnpj}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, cnpj: maskCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={newEmpresa.email}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, email: e.target.value })}
                placeholder="contato@empresa.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input
                id="telefone"
                value={newEmpresa.telefone}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
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
