import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import { useCreateVendedor, useCreateFabricante } from '@/hooks/use-mutations';
import { Plus, Upload, Sun, Moon, Monitor, Loader2 } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const themeOptions = [
  { value: 'light' as const, label: 'Claro', icon: Sun, desc: 'Tema claro padrão' },
  { value: 'dark' as const, label: 'Escuro', icon: Moon, desc: 'Reduz o brilho da tela' },
  { value: 'system' as const, label: 'Sistema', icon: Monitor, desc: 'Segue a preferência do SO' },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Tema</CardTitle>
        <CardDescription>Escolha o modo de exibição da interface</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                theme === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              )}
            >
              <opt.icon className={cn('h-6 w-6', theme === opt.value ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground text-center">{opt.desc}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const Configuracoes = () => {
  const [alertDays, setAlertDays] = useState('5');
  const { data: vendedoresData, isLoading: loadV } = useVendedores();
  const { data: fabricantesData, isLoading: loadF } = useFabricantes();
  const createVendedor = useCreateVendedor();
  const createFabricante = useCreateFabricante();
  const [vendedorDialog, setVendedorDialog] = useState(false);
  const [fabricanteDialog, setFabricanteDialog] = useState(false);

  const handleCreateVendedor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await createVendedor.mutateAsync({
        nome: form.get('nome') as string,
        email: form.get('email') as string,
        telefone: (form.get('telefone') as string) || undefined,
        role: (form.get('role') as string) || 'vendedor',
      });
      toast.success('Vendedor cadastrado!');
      setVendedorDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateFabricante = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await createFabricante.mutateAsync({
        nome: form.get('nome') as string,
        cnpj: (form.get('cnpj') as string) || undefined,
        nome_contato: (form.get('nome_contato') as string) || undefined,
        telefone: (form.get('telefone') as string) || undefined,
      });
      toast.success('Fabricante cadastrado!');
      setFabricanteDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie vendedores, automações e tabelas de preço</p>
        </div>

        <Tabs defaultValue="aparencia">
          <TabsList>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
            <TabsTrigger value="automacao">Automação</TabsTrigger>
            <TabsTrigger value="tabelas">Fabricantes</TabsTrigger>
          </TabsList>

          <TabsContent value="aparencia" className="mt-4"><ThemeSelector /></TabsContent>

          <TabsContent value="vendedores" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Vendedores</CardTitle>
                  <CardDescription>Cadastro e permissões dos vendedores</CardDescription>
                </div>
                <Dialog open={vendedorDialog} onOpenChange={setVendedorDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Vendedor</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Cadastrar Vendedor</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreateVendedor} className="space-y-4 mt-2">
                      <div><Label>Nome</Label><Input name="nome" required placeholder="Nome completo" /></div>
                      <div><Label>Email</Label><Input name="email" type="email" required placeholder="email@exemplo.com" /></div>
                      <div><Label>Telefone</Label><Input name="telefone" placeholder="(00) 0000-0000" /></div>
                      <div>
                        <Label>Perfil</Label>
                        <Select name="role" defaultValue="vendedor">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vendedor">Vendedor</SelectItem>
                            <SelectItem value="gestor">Gestor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" className="w-full" disabled={createVendedor.isPending}>
                        {createVendedor.isPending ? 'Salvando...' : 'Salvar Vendedor'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {loadV ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(vendedoresData ?? []).map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.nome}</TableCell>
                          <TableCell>{v.email}</TableCell>
                          <TableCell><Badge variant={v.role === 'gestor' ? 'default' : 'secondary'}>{v.role}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automacao" className="mt-4">
            <div className="grid gap-4 max-w-xl">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alertas de Inatividade</CardTitle>
                  <CardDescription>Configure o tempo máximo que um pedido pode ficar parado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>Dias para alerta:</Label>
                    <Input type="number" value={alertDays} onChange={e => setAlertDays(e.target.value)} className="w-20" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Notificação por email</p>
                      <p className="text-xs text-muted-foreground">Enviar email quando o pedido ficar parado</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Notificação no sistema</p>
                      <p className="text-xs text-muted-foreground">Mostrar alerta visual no Kanban</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tabelas" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Fabricantes</CardTitle>
                  <CardDescription>Fabricantes cadastrados</CardDescription>
                </div>
                <Dialog open={fabricanteDialog} onOpenChange={setFabricanteDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Fabricante</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Cadastrar Fabricante</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreateFabricante} className="space-y-4 mt-2">
                      <div><Label>Nome</Label><Input name="nome" required placeholder="Nome do fabricante" /></div>
                      <div><Label>CNPJ</Label><Input name="cnpj" placeholder="00.000.000/0000-00" /></div>
                      <div><Label>Contato</Label><Input name="nome_contato" placeholder="Nome do contato" /></div>
                      <div><Label>Telefone</Label><Input name="telefone" placeholder="(00) 0000-0000" /></div>
                      <Button type="submit" className="w-full" disabled={createFabricante.isPending}>
                        {createFabricante.isPending ? 'Salvando...' : 'Salvar Fabricante'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {loadF ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fabricante</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Última Atualização Preço</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fabricantesData ?? []).map(f => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.nome}</TableCell>
                          <TableCell>{f.cnpj ?? '-'}</TableCell>
                          <TableCell>{f.nome_contato ?? '-'}</TableCell>
                          <TableCell>{f.ultima_atualizacao_preco ? new Date(f.ultima_atualizacao_preco).toLocaleDateString('pt-BR') : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
