import { useState, useMemo } from 'react';
import { format } from 'date-fns';
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
import { Plus, Sun, Moon, Monitor, Loader2, Pencil, Trash2, Shield, Users, Eye, PenLine, Trash, Clock, ChevronRight, History, CalendarIcon, UserCircle, Lock, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sun className="h-4 w-4 text-primary" /> Aparência
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex bg-muted/30 p-1 rounded-md border border-border">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-sm text-xs font-medium transition-all',
                theme === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <opt.icon className={cn('h-3.5 w-3.5', theme === opt.value ? 'text-primary' : 'text-muted-foreground')} />
              <span>{opt.label}</span>
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
  const qc = useQueryClient();
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
              const newValue = !currentAll;
              const rows = MODULOS.map(mod => {
                const existing = getPermissao(mod.key);
                return {
                  vendedor_id: vendedor.id,
                  modulo: mod.key,
                  pode_ver: campo === 'pode_ver' ? newValue : (existing?.pode_ver ?? true),
                  pode_criar: campo === 'pode_criar' ? newValue : (existing?.pode_criar ?? false),
                  pode_editar: campo === 'pode_editar' ? newValue : (existing?.pode_editar ?? false),
                  pode_excluir: campo === 'pode_excluir' ? newValue : (existing?.pode_excluir ?? false),
                };
              });
              const { error } = await supabase.from('permissoes_vendedor').upsert(rows, { onConflict: 'vendedor_id,modulo' });
              if (error) { toast.error('Erro ao atualizar permissões'); return; }
              await supabase.from('audit_permissoes').insert({
                admin_id: user?.id ?? '',
                vendedor_id: vendedor.id,
                acao: `Alterou ${campo} de TODOS os módulos para ${newValue ? 'ativo' : 'inativo'}`,
                detalhes: { campo, para: newValue, modulos: 'todos' } as any,
              });
              qc.invalidateQueries({ queryKey: ['permissoes_vendedor', vendedor.id] });
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

function getActionMeta(acao: string) {
  if (acao.includes('pode_ver')) return { icon: Eye, color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Visualização' };
  if (acao.includes('pode_criar')) return { icon: Plus, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', label: 'Criação' };
  if (acao.includes('pode_editar')) return { icon: PenLine, color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: 'Edição' };
  if (acao.includes('pode_excluir')) return { icon: Trash, color: 'text-red-500', bgColor: 'bg-red-500/10', label: 'Exclusão' };
  return { icon: Shield, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Permissão' };
}

function AuditLog() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit_permissoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_permissoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: vendedores } = useVendedores();
  const getVendedorNome = (id: string) => vendedores?.find(v => v.id === id)?.nome ?? id;

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (!logs || logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <History className="h-10 w-10 text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">As mudanças de permissão aparecerão aqui.</p>
      </div>
    );
  }

  const filtered = logs.filter(log => {
    const matchesSearch = !search || getVendedorNome(log.vendedor_id).toLowerCase().includes(search.toLowerCase()) || log.acao.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !activeFilter || getActionMeta(log.acao).label === activeFilter;
    const logDate = new Date(log.created_at);
    const matchesDateFrom = !dateFrom || logDate >= new Date(dateFrom.setHours(0, 0, 0, 0));
    const matchesDateTo = !dateTo || logDate <= new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59);
    return matchesSearch && matchesFilter && matchesDateFrom && matchesDateTo;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, log) => {
    const dateKey = new Date(log.created_at).toLocaleDateString('pt-BR');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped);

  // Auto-expand first group
  const isExpanded = (key: string) => expandedDates.size === 0 ? key === dateKeys[0] : expandedDates.has(key);
  const toggleDate = (key: string) => {
    setExpandedDates(prev => {
      // Initialize from auto-expand state if untouched
      const next = new Set(prev.size === 0 ? [dateKeys[0]] : prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Filter buttons
  const filterItems = [
    { label: 'Visualização', color: 'bg-blue-500', activeColor: 'bg-blue-500 text-white' },
    { label: 'Criação', color: 'bg-emerald-500', activeColor: 'bg-emerald-500 text-white' },
    { label: 'Edição', color: 'bg-amber-500', activeColor: 'bg-amber-500 text-white' },
    { label: 'Exclusão', color: 'bg-red-500', activeColor: 'bg-red-500 text-white' },
  ];

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative w-full">
        <Eye className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar alterações..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Filter buttons & Date range */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveFilter(null)}
          className={cn(
            'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
            !activeFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'
          )}
        >
          Todos
        </button>
        {filterItems.map(f => (
          <button
            key={f.label}
            onClick={() => setActiveFilter(activeFilter === f.label ? null : f.label)}
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5',
              activeFilter === f.label ? cn(f.activeColor, 'border-transparent') : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', activeFilter === f.label ? 'bg-white/80' : f.color)} />
            {f.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Date range pickers */}
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-7 text-[11px] gap-1', dateFrom && 'border-primary')}>
                <CalendarIcon className="h-3 w-3" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'De'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <span className="text-[10px] text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-7 text-[11px] gap-1', dateTo && 'border-primary')}>
                <CalendarIcon className="h-3 w-3" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Até'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado encontrado.</p>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-1">
            {dateKeys.map(dateKey => {
              const items = grouped[dateKey];
              const expanded = isExpanded(dateKey);
              return (
                <div key={dateKey}>
                  {/* Date group header */}
                  <button
                    onClick={() => toggleDate(dateKey)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
                    aria-expanded={expanded}
                  >
                    <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                    <span className="text-xs font-semibold text-foreground">{dateKey}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{items.length}</Badge>
                  </button>

                  {/* Timeline items */}
                  {expanded && (
                    <div className="ml-4 border-l-2 border-border pl-4 space-y-0 pb-2">
                      {items.map((log, idx) => {
                        const d = new Date(log.created_at);
                        const meta = getActionMeta(log.acao);
                        const Icon = meta.icon;
                        const detalhes = log.detalhes as { campo?: string; modulo?: string; de?: boolean; para?: boolean; modulos?: string } | null;
                        const isBulk = detalhes?.modulos === 'todos';

                        return (
                          <div key={log.id} className="relative flex items-start gap-3 py-2 group">
                            {/* Timeline dot */}
                            <div className={cn('absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full border-2 border-background', meta.bgColor.replace('/10', ''), meta.color === 'text-blue-500' ? 'bg-blue-500' : meta.color === 'text-emerald-500' ? 'bg-emerald-500' : meta.color === 'text-amber-500' ? 'bg-amber-500' : meta.color === 'text-red-500' ? 'bg-red-500' : 'bg-primary')} />

                            {/* Icon */}
                            <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', meta.bgColor)}>
                              <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{getVendedorNome(log.vendedor_id)}</span>
                                {isBulk && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary">Todos</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{log.acao}</p>
                              {detalhes && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full', detalhes.de ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500')}>
                                    {detalhes.de ? '✓ Ativo' : '✕ Inativo'}
                                  </span>
                                  <span className="text-muted-foreground text-[10px]">→</span>
                                  <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full', detalhes.para ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500')}>
                                    {detalhes.para ? '✓ Ativo' : '✕ Inativo'}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Time */}
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                              {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <span className="text-[10px] text-muted-foreground">{filtered.length} alteração(ões) encontrada(s)</span>
        <span className="text-[10px] text-muted-foreground">{dateKeys.length} dia(s)</span>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();

  const { data: perfil, isLoading } = useQuery({
    queryKey: ['meu_perfil', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, nome, email, telefone, role')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updatePerfil = useMutation({
    mutationFn: async (dados: { nome: string; telefone: string }) => {
      const { error } = await supabase
        .from('vendedores')
        .update(dados)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu_perfil', user?.id] });
      toast.success('Perfil atualizado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateEmail = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      // sync email in vendedores
      await supabase.from('vendedores').update({ email }).eq('user_id', user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu_perfil', user?.id] });
      toast.success('Email atualizado! Verifique sua caixa de entrada para confirmar.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSenha = useMutation({
    mutationFn: async ({ novaSenha }: { novaSenha: string }) => {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Senha alterada com sucesso!'),
    onError: (e: any) => toast.error(e.message),
  });

  const deletarConta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_current_user' as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Conta excluída.');
      await signOut();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSalvarPerfil = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updatePerfil.mutate({
      nome: form.get('nome') as string,
      telefone: form.get('telefone') as string,
    });
  };

  const handleSalvarEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updateEmail.mutate(form.get('email') as string);
  };

  const handleSalvarSenha = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nova = form.get('nova_senha') as string;
    const confirmar = form.get('confirmar_senha') as string;
    if (nova !== confirmar) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (nova.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    updateSenha.mutate({ novaSenha: nova });
    e.currentTarget.reset();
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!perfil) return null;

  const iniciais = perfil.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Coluna Esquerda: Informações e Email */}
      <div className="space-y-4">
        {/* Informações pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-primary" /> Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seu nome e telefone</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Avatar */}
            <div className="flex items-center gap-4 mb-5">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-primary">{iniciais}</span>
              </div>
              <div>
                <p className="font-semibold">{perfil.nome}</p>
                <p className="text-sm text-muted-foreground">{perfil.email}</p>
                <Badge variant={perfil.role === 'gestor' ? 'default' : 'secondary'} className="text-[10px] mt-1">
                  {perfil.role === 'gestor' ? 'Gestor' : 'Vendedor'}
                </Badge>
              </div>
            </div>

            <form onSubmit={handleSalvarPerfil} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input name="nome" required defaultValue={perfil.nome} placeholder="Seu nome completo" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input name="telefone" defaultValue={perfil.telefone ?? ''} placeholder="(00) 00000-0000" className="h-10" />
              </div>
              <Button type="submit" size="sm" disabled={updatePerfil.isPending}>
                {updatePerfil.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar alterações
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email</CardTitle>
            <CardDescription>Alterar o email requer confirmação no novo endereço</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Novo email</Label>
                <Input name="email" type="email" required defaultValue={perfil.email} className="h-10" />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={updateEmail.isPending}>
                {updateEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Atualizar email
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Coluna Direita: Aparência, Segurança e Perigo */}
      <div className="space-y-4">
        {/* Aparência */}
        <ThemeSelector />

        {/* Segurança / Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Segurança
            </CardTitle>
            <CardDescription>Altere sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarSenha} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <Input name="nova_senha" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar nova senha</Label>
                <Input name="confirmar_senha" type="password" required minLength={6} placeholder="Repita a senha" className="h-10" />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={updateSenha.isPending}>
                {updateSenha.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Alterar senha
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Zona de perigo */}
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Zona de Perigo
            </CardTitle>
            <CardDescription>Ações irreversíveis para a sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Excluir conta</p>
                <p className="text-xs text-muted-foreground">Remove permanentemente seus dados e acesso ao sistema</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir conta
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é <strong>permanente e irreversível</strong>. Todos os seus dados — clientes, pedidos e obras associados — serão perdidos. Você será desconectado imediatamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deletarConta.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deletarConta.isPending}
                    >
                      {deletarConta.isPending ? 'Excluindo...' : 'Sim, excluir minha conta'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Configuracoes = () => {
  const [alertDays, setAlertDays] = useState('5');
  const { data: vendedoresData, isLoading: loadV } = useVendedores();
  const createVendedor = useCreateVendedor();
  const [vendedorDialog, setVendedorDialog] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<null | { id: string; nome: string; email: string; telefone: string | null; role: string }>(null);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [equipePage, setEquipePage] = useState(0);
  const [empresaFilter, setEmpresaFilter] = useState<string>('todas');
  const EQUIPE_PER_PAGE = 5;
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: isGestor } = useQuery({
    queryKey: ['is_gestor'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_gestor');
      if (error) throw error;
      return data as boolean;
    },
  });

  // Fetch clientes for empresa filter (gestor only)
  const { data: clientesData } = useQuery({
    queryKey: ['clientes_empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('empresa, vendedor_id')
        .order('empresa');
      if (error) throw error;
      return data;
    },
    enabled: !!isGestor,
  });

  const empresasUnicas = useMemo(() => {
    if (!clientesData) return [];
    const set = new Set(clientesData.map(c => c.empresa));
    return Array.from(set).sort();
  }, [clientesData]);

  const filteredVendedores = useMemo(() => {
    if (!vendedoresData) return [];
    if (empresaFilter === 'todas') return vendedoresData;
    const vendedorIds = new Set(
      clientesData?.filter(c => c.empresa === empresaFilter).map(c => c.vendedor_id).filter(Boolean)
    );
    return vendedoresData.filter(v => vendedorIds.has(v.id));
  }, [vendedoresData, empresaFilter, clientesData]);

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
    <AppLayout title="Configurações" subtitle={isGestor ? "Gerencie usuários, permissões e automações" : "Gerencie vendedores, permissões e automações"}>
      <div className="p-6">
        <Tabs defaultValue="perfil">
          <TabsList>
            <TabsTrigger value="perfil" className="gap-1.5"><UserCircle className="h-4 w-4" /> Perfil</TabsTrigger>
            <TabsTrigger value="vendedores" className="gap-1.5"><Users className="h-4 w-4" /> {isGestor ? 'Usuários' : 'Vendedores'}</TabsTrigger>
            <TabsTrigger value="automacao">Automação</TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="mt-4"><ProfileTab /></TabsContent>

          <TabsContent value="vendedores" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
              {/* Left: User list */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base">{isGestor ? 'Usuários' : 'Equipe'}</CardTitle>
                    <CardDescription>{filteredVendedores.length} {isGestor ? 'usuários' : 'vendedores'} {empresaFilter !== 'todas' ? `na empresa "${empresaFilter}"` : 'cadastrados'}</CardDescription>
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
                  {/* Empresa filter for gestor */}
                  {isGestor && empresasUnicas.length > 0 && (
                    <div className="px-4 pt-3 pb-2">
                      <Select value={empresaFilter} onValueChange={(val) => { setEmpresaFilter(val); setEquipePage(0); setSelectedVendedor(null); }}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Filtrar por empresa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas as empresas</SelectItem>
                          {empresasUnicas.map(emp => (
                            <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {loadV ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <>
                      {/* Grouped by role */}
                      {(() => {
                        const gestores = filteredVendedores.filter(v => v.role === 'gestor');
                        const vendedores = filteredVendedores.filter(v => v.role === 'vendedor');

                        const renderSection = (title: string, icon: React.ReactNode, items: typeof filteredVendedores, badgeVariant: 'default' | 'secondary') => {
                          if (items.length === 0) return null;
                          return (
                            <div key={title}>
                              <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border">
                                {icon}
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ml-auto">{items.length}</Badge>
                              </div>
                              <div className="divide-y divide-border">
                                {items.map(v => (
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
                                    <Badge variant={badgeVariant} className="shrink-0 text-[10px]">
                                      {v.role === 'gestor' ? 'Gestor' : 'Vendedor'}
                                    </Badge>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <>
                            {renderSection('Gestores', <Shield className="h-3.5 w-3.5 text-primary" />, gestores, 'default')}
                            {renderSection('Vendedores', <Users className="h-3.5 w-3.5 text-muted-foreground" />, vendedores, 'secondary')}
                          </>
                        );
                      })()}
                    </>
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
                          {activeVendedor.user_id !== user?.id && (
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
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Permissions - only visible to gestor */}
                    {isGestor && (
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
                    )}

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
                      <p className="text-sm text-muted-foreground">Selecione um usuário na lista para gerenciar suas permissões</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="automacao" className="mt-4">
            <div className="grid gap-4">
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
