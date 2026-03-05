import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useClientes } from '@/hooks/use-clientes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Building2, Store, User, MapPin, Loader2 } from 'lucide-react';

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física' };

const Clientes = () => {
  const { data: clients, isLoading } = useClientes();
  const [search, setSearch] = useState('');

  const filtered = (clients ?? []).filter(c =>
    c.empresa.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">{clients?.length ?? 0} cadastrados</p>
          </div>
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button>
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
