import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVendedores } from '@/hooks/use-clientes';
import { useCreateVendedor } from '@/hooks/use-mutations';
import { usePermissoes, useUpsertPermissao, MODULOS, type Permissao } from '@/hooks/use-permissoes';
import { Plus, Loader2, Pencil, Trash2, Shield, Users, Eye, PenLine, Trash, ChevronRight, History, CalendarIcon, Search, Building2, Crown, UserPlus, X, ChevronDown, ChevronUp, Mail, Phone } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { PerfilSelect } from './PerfilSelect';
import { CodigoAcessoButton } from './CodigoAcessoButton';

// ─── Role utils ───
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Users; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  admin: { label: 'Admin', color: 'text-red-500', icon: Crown, badgeVariant: 'destructive' },
  empresa: { label: 'Empresa', color: 'text-primary', icon: Building2, badgeVariant: 'default' },
  gestor: { label: 'Gestor', color: 'text-primary', icon: Shield, badgeVariant: 'outline' },
  vendedor: { label: 'Vendedor', color: 'text-muted-foreground', icon: Users, badgeVariant: 'secondary' },
};

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] || { label: role, color: 'text-muted-foreground', icon: Users, badgeVariant: 'secondary' as const };
}

// ─── Edit Dialog ───
function EditVendedorDialog({ vendedor, onClose }: { vendedor: { id: string; nome: string; email: string; telefone: string | null; role: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: async (data: { nome: string; email: string; telefone?: string; role: string }) => {
      const { error } = await supabase.from('vendedores').update(data).eq('id', vendedor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      toast.success('Usuário atualizado!');
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
      <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" required defaultValue={vendedor.nome} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" required defaultValue={vendedor.email} /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input name="telefone" defaultValue={vendedor.telefone ?? ''} placeholder="(00) 00000-0000" /></div>
        <div className="space-y-1.5">
          <Label>Perfil</Label>
          <PerfilSelect name="role" defaultValue={vendedor.role} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : 'Salvar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─── Inline Permissions Editor ───
function InlinePermissaoEditor({ vendedor }: { vendedor: { id: string; nome: string; role: string } }) {
  const { data: permissoes, isLoading } = usePermissoes(vendedor.id);
  const upsert = useUpsertPermissao();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isGestor = vendedor.role === 'gestor' || vendedor.role === 'admin';

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
    await supabase.from('audit_permissoes').insert({
      admin_id: user?.id ?? '',
      vendedor_id: vendedor.id,
      acao: `Alterou ${campo} de ${modulo}`,
      detalhes: { campo, modulo, de: currentVal, para: !currentVal },
    });
  };

  if (isGestor) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
        <Shield className="h-5 w-5 text-primary" />
        <p className="text-sm">Gestores possuem acesso total a todos os módulos.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

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
    <TooltipProvider>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="min-w-[140px]">Módulo</TableHead>
              <TableHead className="text-center w-20">
                <Tooltip><TooltipTrigger asChild><div className="flex items-center justify-center gap-1"><Eye className="h-3.5 w-3.5" /> Ver</div></TooltipTrigger><TooltipContent>Permissão de visualização</TooltipContent></Tooltip>
              </TableHead>
              <TableHead className="text-center w-20">
                <Tooltip><TooltipTrigger asChild><div className="flex items-center justify-center gap-1"><Plus className="h-3.5 w-3.5" /> Criar</div></TooltipTrigger><TooltipContent>Permissão de criação</TooltipContent></Tooltip>
              </TableHead>
              <TableHead className="text-center w-20">
                <Tooltip><TooltipTrigger asChild><div className="flex items-center justify-center gap-1"><PenLine className="h-3.5 w-3.5" /> Editar</div></TooltipTrigger><TooltipContent>Permissão de edição</TooltipContent></Tooltip>
              </TableHead>
              <TableHead className="text-center w-20">
                <Tooltip><TooltipTrigger asChild><div className="flex items-center justify-center gap-1"><Trash className="h-3.5 w-3.5" /> Excluir</div></TooltipTrigger><TooltipContent>Permissão de exclusão</TooltipContent></Tooltip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/30 border-b-2 border-border">
              <TableCell className="font-semibold text-sm text-primary">Todos</TableCell>
              <TableCell className="text-center"><Checkbox checked={allVer} onCheckedChange={() => handleToggleAll('pode_ver', allVer)} /></TableCell>
              <TableCell className="text-center"><Checkbox checked={allCriar} onCheckedChange={() => handleToggleAll('pode_criar', allCriar)} /></TableCell>
              <TableCell className="text-center"><Checkbox checked={allEditar} onCheckedChange={() => handleToggleAll('pode_editar', allEditar)} /></TableCell>
              <TableCell className="text-center"><Checkbox checked={allExcluir} onCheckedChange={() => handleToggleAll('pode_excluir', allExcluir)} /></TableCell>
            </TableRow>
            {MODULOS.map(mod => {
              const perm = getPermissao(mod.key);
              const ver = perm?.pode_ver ?? true;
              const criar = perm?.pode_criar ?? false;
              const editar = perm?.pode_editar ?? false;
              const excluir = perm?.pode_excluir ?? false;
              return (
                <TableRow key={mod.key} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="font-medium text-sm">{mod.label}</TableCell>
                  <TableCell className="text-center"><Checkbox checked={ver} onCheckedChange={() => handleToggle(mod.key, 'pode_ver', ver)} /></TableCell>
                  <TableCell className="text-center"><Checkbox checked={criar} onCheckedChange={() => handleToggle(mod.key, 'pode_criar', criar)} /></TableCell>
                  <TableCell className="text-center"><Checkbox checked={editar} onCheckedChange={() => handleToggle(mod.key, 'pode_editar', editar)} /></TableCell>
                  <TableCell className="text-center"><Checkbox checked={excluir} onCheckedChange={() => handleToggle(mod.key, 'pode_excluir', excluir)} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

// ─── Audit Log (compact) ───
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
      const { data, error } = await supabase.from('audit_permissoes').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const { data: vendedores } = useVendedores();
  const getVendedorNome = (id: string) => vendedores?.find(v => v.id === id)?.nome ?? id;

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!logs || logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="h-8 w-8 text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
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

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, log) => {
    const dateKey = new Date(log.created_at).toLocaleDateString('pt-BR');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});
  const dateKeys = Object.keys(grouped);
  const isExpanded = (key: string) => expandedDates.size === 0 ? key === dateKeys[0] : expandedDates.has(key);
  const toggleDate = (key: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev.size === 0 ? [dateKeys[0]] : prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filterItems = [
    { label: 'Visualização', color: 'bg-blue-500', activeColor: 'bg-blue-500 text-white' },
    { label: 'Criação', color: 'bg-emerald-500', activeColor: 'bg-emerald-500 text-white' },
    { label: 'Edição', color: 'bg-amber-500', activeColor: 'bg-amber-500 text-white' },
    { label: 'Exclusão', color: 'bg-red-500', activeColor: 'bg-red-500 text-white' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar alterações..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1', dateFrom && 'border-primary')}>
                <CalendarIcon className="h-3 w-3" />
                {dateFrom ? format(dateFrom, 'dd/MM/yy') : 'De'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" /></PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1', dateTo && 'border-primary')}>
                <CalendarIcon className="h-3 w-3" />
                {dateTo ? format(dateTo, 'dd/MM/yy') : 'Até'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" /></PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}><X className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {[{ label: 'Todos', active: !activeFilter }, ...filterItems.map(f => ({ ...f, active: activeFilter === f.label }))].map((f, i) => (
          <button
            key={f.label}
            onClick={() => setActiveFilter(f.label === 'Todos' ? null : activeFilter === f.label ? null : f.label)}
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
              f.active
                ? i === 0 ? 'bg-primary text-primary-foreground border-primary' : cn((f as any).activeColor, 'border-transparent')
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            {i > 0 && <span className={cn('inline-block h-2 w-2 rounded-full mr-1.5', f.active ? 'bg-white/80' : (f as any).color)} />}
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado encontrado.</p>
      ) : (
        <ScrollArea className="h-[350px]">
          <div className="space-y-0.5">
            {dateKeys.map(dateKey => {
              const items = grouped[dateKey];
              const expanded = isExpanded(dateKey);
              return (
                <div key={dateKey}>
                  <button onClick={() => toggleDate(dateKey)} className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors" aria-expanded={expanded}>
                    <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                    <span className="text-xs font-semibold text-foreground">{dateKey}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{items.length}</Badge>
                  </button>
                  {expanded && (
                    <div className="ml-4 border-l-2 border-border pl-4 space-y-0 pb-2">
                      {items.map(log => {
                        const d = new Date(log.created_at);
                        const meta = getActionMeta(log.acao);
                        const Icon = meta.icon;
                        const detalhes = log.detalhes as { campo?: string; modulo?: string; de?: boolean; para?: boolean; modulos?: string } | null;
                        const isBulk = detalhes?.modulos === 'todos';
                        return (
                          <div key={log.id} className="relative flex items-start gap-3 py-2 group">
                            <div className={cn('absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full border-2 border-background', meta.color === 'text-blue-500' ? 'bg-blue-500' : meta.color === 'text-emerald-500' ? 'bg-emerald-500' : meta.color === 'text-amber-500' ? 'bg-amber-500' : meta.color === 'text-red-500' ? 'bg-red-500' : 'bg-primary')} />
                            <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', meta.bgColor)}>
                              <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{getVendedorNome(log.vendedor_id)}</span>
                                {isBulk && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary">Todos</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{log.acao}</p>
                              {detalhes && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={cn('inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full', detalhes.de ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500')}>{detalhes.de ? '✓ Ativo' : '✕ Inativo'}</span>
                                  <span className="text-muted-foreground text-[10px]">→</span>
                                  <span className={cn('inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full', detalhes.para ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500')}>{detalhes.para ? '✓ Ativo' : '✕ Inativo'}</span>
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">{d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
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
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <span className="text-[10px] text-muted-foreground">{filtered.length} alteração(ões)</span>
        <span className="text-[10px] text-muted-foreground">{dateKeys.length} dia(s)</span>
      </div>
    </div>
  );
}

// ─── User Detail Panel ───
function UserDetailPanel({ vendedor, isGestor, onEdit, onDelete, currentUserId }: {
  vendedor: { id: string; nome: string; email: string; telefone: string | null; role: string; user_id: string | null };
  isGestor: boolean;
  onEdit: () => void;
  onDelete: () => void;
  currentUserId?: string;
}) {
  const [activeSection, setActiveSection] = useState<'permissoes' | 'historico'>('permissoes');
  const roleConfig = getRoleConfig(vendedor.role);
  const iniciais = vendedor.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const isSelf = vendedor.user_id === currentUserId;

  return (
    <div className="space-y-4">
      {/* User header card */}
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary to-primary/50" />
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/20">
              <span className="text-xl font-bold text-primary">{iniciais}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-foreground truncate">{vendedor.nome}</h3>
                <Badge variant={roleConfig.badgeVariant} className="text-[10px] shrink-0">
                  {roleConfig.label}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1.5">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {vendedor.email}
                </span>
                {vendedor.telefone && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {vendedor.telefone}
                  </span>
                )}
              </div>
            </div>
          </div>
          {!isSelf && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Todos os dados de "{vendedor.nome}" serão removidos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section tabs */}
      {isGestor && (
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg border border-border">
          <button
            onClick={() => setActiveSection('permissoes')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all',
              activeSection === 'permissoes' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Shield className="h-4 w-4" /> Permissões
          </button>
          <button
            onClick={() => setActiveSection('historico')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all',
              activeSection === 'historico' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="h-4 w-4" /> Histórico
          </button>
        </div>
      )}

      {/* Section content */}
      {isGestor && activeSection === 'permissoes' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Permissões por Módulo</CardTitle>
            <CardDescription className="text-xs">Controle granular de acesso para {vendedor.nome}</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <InlinePermissaoEditor vendedor={vendedor} />
          </CardContent>
        </Card>
      )}

      {isGestor && activeSection === 'historico' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Histórico de Alterações</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditLog />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Usuarios Tab ───
export function UsuariosTab() {
  const { data: vendedoresData, isLoading: loadV } = useVendedores();
  const createVendedor = useCreateVendedor();
  const [vendedorDialog, setVendedorDialog] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<null | { id: string; nome: string; email: string; telefone: string | null; role: string }>(null);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todas');
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

  const { data: isAdmin } = useQuery({
    queryKey: ['is_admin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (error) throw error;
      return data as boolean;
    },
  });

  const { data: empresasData } = useQuery({
    queryKey: ['empresas_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('id, nome').order('nome');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: customPerfis } = useQuery({
    queryKey: ['perfis_customizados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis_customizados').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredVendedores = useMemo(() => {
    if (!vendedoresData) return [];
    let result = vendedoresData;
    if (empresaFilter !== 'todas') {
      result = result.filter(v => v.empresa_id === empresaFilter);
    }
    if (roleFilter !== 'todos') {
      result = result.filter(v => v.role === roleFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(v => v.nome.toLowerCase().includes(q) || v.email.toLowerCase().includes(q));
    }
    return result;
  }, [vendedoresData, empresaFilter, roleFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      toast.success('Usuário removido!');
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
      toast.success('Usuário cadastrado!');
      setVendedorDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const activeVendedor = vendedoresData?.find(v => v.id === selectedVendedor);

  // Role counts
  const roleCounts = useMemo(() => {
    if (!vendedoresData) return {};
    return vendedoresData.reduce<Record<string, number>>((acc, v) => {
      acc[v.role] = (acc[v.role] || 0) + 1;
      return acc;
    }, {});
  }, [vendedoresData]);

  // Build all role options (default + custom)
  const allRoleOptions = useMemo(() => {
    const defaults = [
      { value: 'admin', label: 'Admin' },
      { value: 'empresa', label: 'Empresa' },
      { value: 'gestor', label: 'Gestor' },
      { value: 'vendedor', label: 'Vendedor' },
    ];
    const custom = (customPerfis ?? []).map(p => ({ value: p.slug, label: p.nome }));
    return [...defaults, ...custom];
  }, [customPerfis]);

  return (
    <div className="space-y-4">
      {/* Top bar: stats + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{vendedoresData?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground -mt-0.5">usuários</p>
            </div>
          </div>
          {/* Role chips */}
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(roleCounts).sort(([a], [b]) => {
              const order = ['admin', 'empresa', 'gestor', 'vendedor'];
              return order.indexOf(a) - order.indexOf(b);
            }).map(([role, count]) => {
              const cfg = getRoleConfig(role);
              return (
                <button
                  key={role}
                  onClick={() => setRoleFilter(roleFilter === role ? 'todos' : role)}
                  className={cn(
                    'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-all',
                    roleFilter === role
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent hover:border-accent'
                  )}
                >
                  {cfg.label} <span className="font-bold">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CodigoAcessoButton />
          <Dialog open={vendedorDialog} onOpenChange={setVendedorDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 shadow-sm">
                <UserPlus className="h-4 w-4" /> Novo Usuário
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Usuário</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateVendedor} className="space-y-4 mt-2">
              <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" required placeholder="Nome completo" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" required placeholder="email@exemplo.com" /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input name="telefone" placeholder="(00) 0000-0000" /></div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <PerfilSelect name="role" defaultValue="vendedor" />
              </div>
              <Button type="submit" className="w-full" disabled={createVendedor.isPending}>
                {createVendedor.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : 'Cadastrar Usuário'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && empresasData && empresasData.length > 0 && (
          <Select value={empresaFilter} onValueChange={(val) => { setEmpresaFilter(val); setSelectedVendedor(null); }}>
            <SelectTrigger className="w-fit max-w-full shrink-0 whitespace-nowrap">
              <SelectValue placeholder="Filtrar por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {empresasData.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Main content: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* Left: User list */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {loadV ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredVendedores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Users className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p>
                {searchQuery && <p className="text-xs text-muted-foreground/60 mt-1">Tente outro termo de busca</p>}
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-380px)] min-h-[300px]">
                {(() => {
                  const roleOrder = ['admin', 'empresa', 'gestor', 'vendedor'];
                  const groupedByRole = roleOrder.reduce<Record<string, typeof filteredVendedores>>((acc, role) => {
                    const items = filteredVendedores.filter(v => v.role === role);
                    if (items.length > 0) acc[role] = items;
                    return acc;
                  }, {});

                  // Add custom roles not in default order
                  const customRoles = [...new Set(filteredVendedores.map(v => v.role))].filter(r => !roleOrder.includes(r));
                  customRoles.forEach(role => {
                    const items = filteredVendedores.filter(v => v.role === role);
                    if (items.length > 0) groupedByRole[role] = items;
                  });

                  return Object.entries(groupedByRole).map(([role, items]) => {
                    const cfg = getRoleConfig(role);
                    const RoleIcon = cfg.icon;
                    return (
                      <div key={role}>
                        <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border sticky top-0 z-10">
                          <RoleIcon className={cn('h-3.5 w-3.5', cfg.color)} />
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{cfg.label}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ml-auto">{items.length}</Badge>
                        </div>
                        <div className="divide-y divide-border">
                          {items.map(v => (
                            <button
                              key={v.id}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-accent/50',
                                selectedVendedor === v.id && 'bg-accent/70 border-l-2 border-l-primary'
                              )}
                              onClick={() => setSelectedVendedor(v.id)}
                            >
                              <div className={cn(
                                'h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
                                selectedVendedor === v.id ? 'bg-primary text-primary-foreground' : 'bg-primary/10'
                              )}>
                                <span className={cn('text-sm font-bold', selectedVendedor === v.id ? '' : 'text-primary')}>
                                  {v.nome.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{v.nome}</p>
                                <p className="text-xs text-muted-foreground truncate">{v.email}</p>
                              </div>
                              <ChevronRight className={cn(
                                'h-4 w-4 shrink-0 transition-colors',
                                selectedVendedor === v.id ? 'text-primary' : 'text-muted-foreground/50'
                              )} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Right: Detail */}
        <div>
          {activeVendedor ? (
            <>
              <Dialog open={editingVendedor?.id === activeVendedor.id} onOpenChange={(open) => !open && setEditingVendedor(null)}>
                {editingVendedor?.id === activeVendedor.id && (
                  <EditVendedorDialog vendedor={editingVendedor} onClose={() => setEditingVendedor(null)} />
                )}
              </Dialog>
              <UserDetailPanel
                vendedor={activeVendedor}
                isGestor={!!isGestor}
                onEdit={() => setEditingVendedor(activeVendedor)}
                onDelete={() => deleteMutation.mutate(activeVendedor.id)}
                currentUserId={user?.id}
              />
            </>
          ) : (
            <Card className="h-full min-h-[400px]">
              <CardContent className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Selecione um usuário</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Clique em um usuário na lista para ver detalhes e permissões</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
