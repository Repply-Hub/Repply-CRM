import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { mockClients } from '@/data/mockData';
import { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Building2, Store, User, MapPin } from 'lucide-react';

const tipoIcons = { construtora: Building2, loja: Store, pessoa_fisica: User };
const tipoLabels = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física' };

const Clientes = () => {
  const [clients] = useState<Client[]>(mockClients);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipo, setTipo] = useState<Client['tipo']>('construtora');

  const filtered = clients.filter(c =>
    c.razaoSocial.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">{clients.length} cadastrados</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Cadastrar Cliente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={(v) => setTipo(v as Client['tipo'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="construtora">Construtora</SelectItem>
                      <SelectItem value="loja">Loja</SelectItem>
                      <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{tipo === 'pessoa_fisica' ? 'Nome Completo' : 'Razão Social'}</Label>
                  <Input placeholder={tipo === 'pessoa_fisica' ? 'Nome completo' : 'Razão social da empresa'} />
                </div>
                <div>
                  <Label>{tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                  <Input placeholder={tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" placeholder="email@exemplo.com" /></div>
                  <div><Label>Telefone</Label><Input placeholder="(00) 0000-0000" /></div>
                </div>
                <div><Label>Endereço</Label><Input placeholder="Rua, número" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cidade</Label><Input placeholder="Cidade" /></div>
                  <div><Label>Estado</Label><Input placeholder="UF" /></div>
                </div>

                {tipo === 'construtora' && (
                  <div className="border-t border-border pt-4">
                    <h4 className="text-sm font-semibold text-foreground mb-3">Obras Vinculadas</h4>
                    <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                      <div><Label>Nome da Obra</Label><Input placeholder="Ex: Ed. Solar" /></div>
                      <div><Label>Endereço da Obra</Label><Input placeholder="Endereço" /></div>
                      <div><Label>Responsável</Label><Input placeholder="Nome do responsável" /></div>
                      <Button variant="outline" size="sm" className="w-full"><Plus className="h-3 w-3 mr-1" /> Adicionar Obra</Button>
                    </div>
                  </div>
                )}

                <Button className="w-full">Salvar Cliente</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(client => {
            const Icon = tipoIcons[client.tipo];
            return (
              <Card key={client.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm truncate">{client.razaoSocial}</CardTitle>
                      <Badge variant="secondary" className="text-[10px] mt-1">{tipoLabels[client.tipo]}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-xs space-y-1 text-muted-foreground">
                  <p>{client.cnpj || client.cpf}</p>
                  <p>{client.email}</p>
                  <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.cidade}/{client.estado}</p>
                  {client.obras && (
                    <p className="text-primary font-medium">{client.obras.length} obra(s) vinculada(s)</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default Clientes;
