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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useVendedores } from '@/hooks/use-clientes';
import { useCreateVendedor } from '@/hooks/use-mutations';
import { usePermissoes, useUpsertPermissao, MODULOS, type Permissao } from '@/hooks/use-permissoes';
import { Plus, Sun, Moon, Monitor, Loader2, Pencil, Trash2, Shield, Users, Eye, PenLine, Trash, Clock, ChevronRight, History } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

const themeOptions = [
  { value: 'light' as const, label: 'Claro', icon: Sun, desc: 'Tema claro padrão' },
  { value: 'dark' as const, label: 'Escuro', icon: Moon, desc: 'Reduz o brilho da tela' },
  { value: 'system' as const, label: 'Sistema', icon: Monitor, desc: 'Segue a preferência do SO' },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
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

// Inline Permission Editor for selected vendedor
function InlinePermissaoEditor({ vendedor }: { vendedor: { id: string; nome: string; role: string } }) {
  const { data: permissoes, isLoading } = usePermissoes(vendedor.id);
  const upsert = useUpsertPermissao();
  const { user } = useAuth();
  const isGestor = vendedor.role === 'gestor';

  const getPermissao = (modulo: string): Permissao | undefined =>
    permissoes?.find(p => p.modulo === modulo);

  const handleToggle = async (modulo: string, campo: keyof Pick<Permissao, 'pode_ver' | 'pode_criar' | 'pode_editar' | 'pode_excluir'>, currentVal: boolean) => {
    const existing = getPermissao(modulo);
    const newData = {
      vendedor_id: vendedor.id,
      modulo,
      pode_ver: campo === 'pode_ver' ? !currentVal : (existing?.pode_ver ?? true),
      pode_criar: campo === 'pode_criar' ? !currentVal : (existing?.pode_criar ?? false),
      pode_editar: campo === 'pode_editar' ? !currentVal : (existing?.pode_editar ?? false),
      pode_excluir: campo === 'pode_excluir' ? !currentVal : (existing?.pode_excluir ?? false),
    };

    upsert.mutate(newData);

    // Audit log
    await supabase.from('audit_permissoes').insert({
      admin_id: user?.id ?? '',
      vendedor_id: vendedor.id,
      acao: `Alterou ${campo} de ${modulo}`,
      detalhes: { campo, modulo, de: currentVal, para: !currentVal },
    });
  };

  if (isGestor) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Shield className="h-5 w-5 text-primary" />
        <p className="text-sm">Gestores possuem acesso total a todos os módulos.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[140px]">Módulo</TableHead>
            <TableHead className="text-center w-24">
              <div className="flex items-center justify-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Ver
              </div>
            </TableHead>
            <TableHead className="text-center w-24">
              <div className="flex items-center justify-center gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Criar
              </div>
            </TableHead>
            <TableHead className="text-center w-24">
              <div className="flex items-center justify-center gap-1.5">
                <PenLine className="h-3.5 w-3.5" /> Editar
              </div>
            </TableHead>
            <TableHead className="text-center w-24">
              <div className="flex items-center justify-center gap-1.5">
                <Trash className="h-3.5 w-3.5" /> Excluir
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(() => {
            const allVer = MODULOS.every(m => (getPermissao(m.key)?.pode_ver ?? true));
            const allCriar = MODULOS.every(m => (getPermissao(m.key)?.pode_criar ?? false));
            const allEditar = MODULOS.every(m => (getPermissao(m.key)?.pode_editar ?? false));
            const allExcluir = MODULOS.every(m => (getPermissao(m.key)?.pode_excluir ?? false));

            const handleToggleAll = async (campo: keyof Pick<Permissao, 'pode_ver' | 'pode_criar' | 'pode_editar' | 'pode_excluir'>, currentAll: boolean) => {
              for (const mod of MODULOS) {
                const existing = getPermissao(mod.key);
                const currentVal = campo === 'pode_ver' ? (existing?.pode_ver ?? true) :
                  campo === 'pode_criar' ? (existing?.pode_criar ?? false) :
                  campo === 'pode_editar' ? (existing?.pode_editar ?? false) :
                  (existing?.pode_excluir ?? false);
                if (currentVal === currentAll) {
                  await handleToggle(mod.key, campo, currentVal);
                }
              }
            };

            return (
              <>
                <TableRow className="bg-muted/30 border-b-2 border-border">
                  <TableCell className="font-semibold text-sm text-primary">Todos</TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={allVer} onCheckedChange={() => handleToggleAll('pode_ver', allVer)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={allCriar} onCheckedChange={() => handleToggleAll('pode_criar', allCriar)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={allEditar} onCheckedChange={() => handleToggleAll('pode_editar', allEditar)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={allExcluir} onCheckedChange={() => handleToggleAll('pode_excluir', allExcluir)} />
                  </TableCell>
                </TableRow>
                {MODULOS.map(mod => {
                  const perm = getPermissao(mod.key);
                  const ver = perm?.pode_ver ?? true;
                  const criar = perm?.pode_criar ?? false;
                  const editar = perm?.pode_editar ?? false;
                  const excluir = perm?.pode_excluir ?? false;
                  return (
                    <TableRow key={mod.key}>
                      <TableCell className="font-medium text-sm">{mod.label}</TableCell>
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
              </>
            );
          })()}
        </TableBody>
      </Table>
    </div>
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
        <div><Label>Telefone</Label><Input name="telefone" defaultValue={vendedor.telefone ?? ''} placeholder="(00) 00000-0000" /></div>
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

function AuditLog() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit_permissoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_permissoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: vendedores } = useVendedores();

  const getVendedorNome = (id: string) => vendedores?.find(v => v.id === id)?.nome ?? id;

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (!logs || logs.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Nenhuma alteração registrada ainda.</p>;
  }

  return (
    <ScrollArea className="max-h-72">
      <div className="space-y-2 p-1">
        {logs.map(log => {
          const d = new Date(log.created_at);
          const detalhes = log.detalhes as { campo?: string; modulo?: string; de?: boolean; para?: boolean } | null;
          return (
            <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">
                  <span className="font-medium">{getVendedorNome(log.vendedor_id)}</span>
                  {' — '}
                  <span className="text-muted-foreground">{log.acao}</span>
                </p>
                {detalhes && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {detalhes.de ? '✅' : '❌'} → {detalhes.para ? '✅' : '❌'}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {d.toLocaleDateString('pt-BR')} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

const Configuracoes = () => {
  const [alertDays, setAlertDays] = useState('5');
  const { data: vendedoresData, isLoading: loadV } = useVendedores();
  const createVendedor = useCreateVendedor();
  const [vendedorDialog, setVendedorDialog] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<null | { id: string; nome: string; email: string; telefone: string | null; role: string }>(null);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      toast.success('Vendedor removido!');
      setSelectedVendedor(null);
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

  const activeVendedor = vendedoresData?.find(v => v.id === selectedVendedor);

  return (
    <AppLayout title="Configurações" subtitle="Gerencie vendedores, permissões e automações">
      <div className="p-6">
        <Tabs defaultValue="vendedores">
          <TabsList>
            <TabsTrigger value="vendedores" className="gap-1.5"><Users className="h-4 w-4" /> Vendedores</TabsTrigger>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="automacao">Automação</TabsTrigger>
          </TabsList>

          <TabsContent value="aparencia" className="mt-4 max-w-xl"><ThemeSelector /></TabsContent>

          <TabsContent value="vendedores" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
              {/* Left: User list */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base">Equipe</CardTitle>
                    <CardDescription>{vendedoresData?.length ?? 0} vendedores cadastrados</CardDescription>
                  </div>
                  <Dialog open={vendedorDialog} onOpenChange={setVendedorDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo</Button>
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
                <CardContent className="p-0">
                  {loadV ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(vendedoresData ?? []).map(v => (
                        <button
                          key={v.id}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                            selectedVendedor === v.id && "bg-accent/70"
                          )}
                          onClick={() => setSelectedVendedor(v.id)}
                        >
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-primary">{v.nome.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{v.nome}</p>
                            <p className="text-xs text-muted-foreground truncate">{v.email}</p>
                          </div>
                          <Badge variant={v.role === 'gestor' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                            {v.role}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Right: Permissions & Details */}
              <div className="space-y-4">
                {activeVendedor ? (
                  <>
                    {/* Vendedor details header */}
                    <Card>
                      <CardContent className="pt-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-lg font-bold text-primary">{activeVendedor.nome.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">{activeVendedor.nome}</h3>
                              <p className="text-sm text-muted-foreground">{activeVendedor.email}</p>
                              {activeVendedor.telefone && (
                                <p className="text-xs text-muted-foreground">{activeVendedor.telefone}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Dialog open={editingVendedor?.id === activeVendedor.id} onOpenChange={(open) => !open && setEditingVendedor(null)}>
                              <Button variant="outline" size="sm" onClick={() => setEditingVendedor(activeVendedor)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                              </Button>
                              {editingVendedor?.id === activeVendedor.id && (
                                <EditVendedorDialog vendedor={editingVendedor} onClose={() => setEditingVendedor(null)} />
                              )}
                            </Dialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir vendedor?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. Todos os dados associados a "{activeVendedor.nome}" serão removidos.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(activeVendedor.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Permissions */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" /> Permissões por Módulo
                        </CardTitle>
                        <CardDescription>Controle granular de acesso para {activeVendedor.nome}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <InlinePermissaoEditor vendedor={activeVendedor} />
                      </CardContent>
                    </Card>

                    {/* Audit Trail */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <History className="h-4 w-4 text-muted-foreground" /> Histórico de Alterações
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AuditLog />
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Selecione um vendedor na lista para gerenciar suas permissões</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
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
