import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useClientes } from '@/hooks/use-clientes';
import { useCreateCliente } from '@/hooks/use-mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Building2, Store, User, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física' };

const Clientes = () => {
  const { data: clients, isLoading } = useClientes();
  const createCliente = useCreateCliente();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipo, setTipo] = useState('construtora');

  const filtered = (clients ?? []).filter(c =>
    c.empresa.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await createCliente.mutateAsync({
        empresa: form.get('empresa') as string,
        tipo,
        cnpj: (form.get('cnpj') as string) || undefined,
        email: (form.get('email') as string) || undefined,
        telefone: (form.get('telefone') as string) || undefined,
        endereco: (form.get('endereco') as string) || undefined,
      });
      toast.success('Cliente cadastrado com sucesso!');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">{clients?.length ?? 0} cadastrados</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Cadastrar Cliente</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div>
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="construtora">Construtora</SelectItem>
                      <SelectItem value="loja">Loja</SelectItem>
                      <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Nome / Razão Social</Label><Input name="empresa" required placeholder="Nome da empresa ou pessoa" /></div>
                <div><Label>{tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label><Input name="cnpj" placeholder={tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                  <div><Label>Telefone</Label><Input name="telefone" placeholder="(00) 0000-0000" /></div>
                </div>
                <div><Label>Endereço</Label><Input name="endereco" placeholder="Rua, número, cidade - UF" /></div>
                <Button type="submit" className="w-full" disabled={createCliente.isPending}>
                  {createCliente.isPending ? 'Salvando...' : 'Salvar Cliente'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar clientes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(client => {
              const Icon = tipoIcons[client.tipo] ?? Building2;
              return (
                <Card key={client.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm truncate">{client.empresa}</CardTitle>
                        <Badge variant="secondary" className="text-[10px] mt-1">{tipoLabels[client.tipo] ?? client.tipo}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 text-muted-foreground">
                    {client.cnpj && <p>{client.cnpj}</p>}
                    {client.email && <p>{client.email}</p>}
                    {client.endereco && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.endereco}</p>}
                    {client.obras && client.obras.length > 0 && (
                      <p className="text-primary font-medium">{client.obras.length} obra(s) vinculada(s)</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Clientes;
