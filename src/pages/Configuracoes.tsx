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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useVendedores } from '@/hooks/use-clientes';
import { useCreateVendedor } from '@/hooks/use-mutations';
import { usePermissoes, useUpsertPermissao, MODULOS, type Permissao } from '@/hooks/use-permissoes';
import { Plus, Sun, Moon, Monitor, Loader2, Pencil, Trash2, Shield } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

function PermissoesDialog({ vendedor }: { vendedor: { id: string; nome: string; role: string } }) {
  const { data: permissoes, isLoading } = usePermissoes(vendedor.id);
  const upsert = useUpsertPermissao();
  const isGestor = vendedor.role === 'gestor';

  const getPermissao = (modulo: string): Permissao | undefined =>
    permissoes?.find(p => p.modulo === modulo);

  const handleToggle = (modulo: string, campo: keyof Pick<Permissao, 'pode_ver' | 'pode_criar' | 'pode_editar' | 'pode_excluir'>, currentVal: boolean) => {
    const existing = getPermissao(modulo);
    upsert.mutate({
      vendedor_id: vendedor.id,
      modulo,
      pode_ver: campo === 'pode_ver' ? !currentVal : (existing?.pode_ver ?? true),
      pode_criar: campo === 'pode_criar' ? !currentVal : (existing?.pode_criar ?? false),
      pode_editar: campo === 'pode_editar' ? !currentVal : (existing?.pode_editar ?? false),
      pode_excluir: campo === 'pode_excluir' ? !currentVal : (existing?.pode_excluir ?? false),
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Permissões">
          <Shield className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissões — {vendedor.nome}</DialogTitle>
        </DialogHeader>
        {isGestor ? (
          <p className="text-sm text-muted-foreground py-4">Gestores possuem acesso total a todos os módulos.</p>
        ) : isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead className="text-center w-20">Ver</TableHead>
                <TableHead className="text-center w-20">Criar</TableHead>
                <TableHead className="text-center w-20">Editar</TableHead>
                <TableHead className="text-center w-20">Excluir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODULOS.map(mod => {
                const perm = getPermissao(mod.key);
                const ver = perm?.pode_ver ?? true;
                const criar = perm?.pode_criar ?? false;
                const editar = perm?.pode_editar ?? false;
                const excluir = perm?.pode_excluir ?? false;
                return (
                  <TableRow key={mod.key}>
                    <TableCell className="font-medium">{mod.label}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={ver} onCheckedChange={() => handleToggle(mod.key, 'pode_ver', ver)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={criar} onCheckedChange={() => handleToggle(mod.key, 'pode_criar', criar)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={editar} onCheckedChange={() => handleToggle(mod.key, 'pode_editar', editar)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={excluir} onCheckedChange={() => handleToggle(mod.key, 'pode_excluir', excluir)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditVendedorDialog({ vendedor, onClose }: { vendedor: { id: string; nome: string; email: string; telefone: string | null; role: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: async (data: { nome: string; email: string; telefone?: string; role: string }) => {
      const { error } = await supabase.from('vendedores').update(data).eq('id', vendedor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      toast.success('Vendedor atualizado!');
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updateMutation.mutate({
      nome: form.get('nome') as string,
      email: form.get('email') as string,
      telefone: (form.get('telefone') as string) || undefined,
      role: form.get('role') as string,
    });
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Editar Vendedor</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div><Label>Nome</Label><Input name="nome" required defaultValue={vendedor.nome} /></div>
        <div><Label>Email</Label><Input name="email" type="email" required defaultValue={vendedor.email} /></div>
        <div><Label>Telefone</Label><Input name="telefone" defaultValue={vendedor.telefone ?? ''} /></div>
        <div>
          <Label>Perfil</Label>
          <Select name="role" defaultValue={vendedor.role}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vendedor">Vendedor</SelectItem>
              <SelectItem value="gestor">Gestor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

const Configuracoes = () => {
  const [alertDays, setAlertDays] = useState('5');
  const { data: vendedoresData, isLoading: loadV } = useVendedores();
  const createVendedor = useCreateVendedor();
  const [vendedorDialog, setVendedorDialog] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<null | { id: string; nome: string; email: string; telefone: string | null; role: string }>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      toast.success('Vendedor removido!');
    },
  });

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

  return (
    <AppLayout title="Configurações" subtitle="Gerencie vendedores, permissões e automações">
      <div className="p-6">

        <Tabs defaultValue="vendedores">
          <TabsList>
            <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="automacao">Automação</TabsTrigger>
          </TabsList>

          <TabsContent value="aparencia" className="mt-4"><ThemeSelector /></TabsContent>

          <TabsContent value="vendedores" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Vendedores & Permissões</CardTitle>
                  <CardDescription>Gerencie usuários e controle de acesso por módulo</CardDescription>
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
                        <TableHead>Telefone</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(vendedoresData ?? []).map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.nome}</TableCell>
                          <TableCell className="text-muted-foreground">{v.email}</TableCell>
                          <TableCell className="text-muted-foreground">{v.telefone || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={v.role === 'gestor' ? 'default' : 'secondary'}>{v.role}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <PermissoesDialog vendedor={v} />
                              <Dialog open={editingVendedor?.id === v.id} onOpenChange={(open) => !open && setEditingVendedor(null)}>
                                <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditingVendedor(v)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {editingVendedor?.id === v.id && (
                                  <EditVendedorDialog vendedor={editingVendedor} onClose={() => setEditingVendedor(null)} />
                                )}
                              </Dialog>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" title="Excluir" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir vendedor?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. Todos os dados associados a "{v.nome}" serão removidos.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(v.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
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
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
