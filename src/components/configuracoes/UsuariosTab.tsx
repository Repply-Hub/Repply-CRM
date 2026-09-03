import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVendedores, useVendedoresRemovidos } from '@/hooks/use-clientes';
import { useCreateVendedor } from '@/hooks/use-mutations';
import { usePermissoes, useUpsertPermissao, MODULOS, type Permissao } from '@/hooks/use-permissoes';
import { usePermissaoPresets, useApplyPermissaoPreset, useCreatePermissaoPreset, type PresetModuloPermissoes } from '@/hooks/use-permissao-presets';
import { Plus, Loader2, Pencil, Trash2, Shield, Users, Eye, PenLine, Trash, ChevronRight, History, CalendarIcon, Search, Building2, Crown, UserPlus, X, ChevronDown, ChevronUp, Mail, Phone, RotateCcw, UserX, Save } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { PerfilSelect } from './PerfilSelect';
import { CodigoAcessoButton } from './CodigoAcessoButton';
import { PermissaoMatrizChecklist } from './PermissaoMatrizChecklist';
import { PermissaoPresetsDialog } from './PermissaoPresetsDialog';

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
      const { error } = await supabase.from('usuarios').update(data).eq('id', vendedor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
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
        <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" defaultValue={vendedor.nome} /></div>
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

// ─── Inline Permissions Editor (card-based) ───
function InlinePermissaoEditor({ vendedor }: { vendedor: { id: string; nome: string; role: string; empresa_id?: string | null } }) {
  const { data: permissoes, isLoading } = usePermissoes(vendedor.id);
  const { data: todosUsuarios } = useVendedores();
  const upsert = useUpsertPermissao();
  const { user, profile } = useAuth();
  const isGestor = vendedor.role === 'gestor' || vendedor.role === 'admin' || vendedor.role === 'empresa';
  const roleConfig = getRoleConfig(vendedor.role);
  const usuariosNoPapel = (todosUsuarios ?? []).filter(u => u.role === vendedor.role).length;
  const empresaId = vendedor.empresa_id ?? profile?.empresa_id;
  const { data: presets } = usePermissaoPresets(empresaId);
  const applyPreset = useApplyPermissaoPreset();
  const createPreset = useCreatePermissaoPreset();
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetNome, setPresetNome] = useState('');
  const [presetDescricao, setPresetDescricao] = useState('');

  const getPermissao = (modulo: string): Permissao | undefined =>
    permissoes?.find(p => p.modulo === modulo);

  const handleSalvarComoPreset = () => {
    if (!presetNome.trim()) return;
    const permissoesAtuais = MODULOS.reduce((acc, mod) => {
      const perm = getPermissao(mod.key);
      acc[mod.key] = {
        pode_ver: perm?.pode_ver ?? true,
        pode_criar: perm?.pode_criar ?? false,
        pode_editar: perm?.pode_editar ?? false,
        pode_excluir: perm?.pode_excluir ?? false,
        funcionalidades: perm?.funcionalidades ?? {},
      };
      return acc;
    }, {} as Record<string, PresetModuloPermissoes>);
    createPreset.mutate(
      { nome: presetNome.trim(), descricao: presetDescricao.trim() || undefined, permissoes: permissoesAtuais },
      { onSuccess: () => { setSavePresetOpen(false); setPresetNome(''); setPresetDescricao(''); } }
    );
  };

  const updatePermissao = async (modulo: string, updates: Partial<Pick<Permissao, 'pode_ver' | 'pode_criar' | 'pode_editar' | 'pode_excluir' | 'funcionalidades'>>) => {
    const existing = getPermissao(modulo);
    const newData = {
      usuario_id: vendedor.id,
      modulo,
      pode_ver: updates.pode_ver ?? existing?.pode_ver ?? true,
      pode_criar: updates.pode_criar ?? existing?.pode_criar ?? false,
      pode_editar: updates.pode_editar ?? existing?.pode_editar ?? false,
      pode_excluir: updates.pode_excluir ?? existing?.pode_excluir ?? false,
      funcionalidades: updates.funcionalidades ?? existing?.funcionalidades ?? {},
    };
    upsert.mutate(newData);
    const campo = Object.keys(updates)[0];
    await supabase.from('audit_permissoes').insert({
      admin_id: user?.id ?? '',
      usuario_id: vendedor.id,
      acao: campo === 'funcionalidades' ? `Alterou funcionalidade de ${modulo}` : `Alterou ${campo} de ${modulo}`,
      detalhes: { campo, modulo } as any,
    });
  };

  if (isGestor) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground bg-primary/5 rounded-lg border border-primary/10">
        <Shield className="h-5 w-5 text-primary" />
        <p className="text-sm">Gestores possuem <strong className="text-foreground">acesso total</strong> a todos os módulos.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {/* Cabeçalho: título do bloco à esquerda, presets alinhados à direita na mesma
          linha. `flex-none` = fica preso no topo enquanto a lista de módulos rola. */}
      <div className="flex flex-none flex-col lg:flex-row lg:items-start gap-3 lg:gap-4 justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Quem vê o quê<span className="text-primary">.</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Perfil {roleConfig.label} · {usuariosNoPapel} usuário{usuariosNoPapel === 1 ? '' : 's'} neste papel
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap lg:justify-end lg:shrink-0">
          <span className="text-xs text-muted-foreground">Presets:</span>
          {(presets ?? []).map(preset => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={applyPreset.isPending}
              onClick={() => applyPreset.mutate({ usuarioId: vendedor.id, preset, adminId: user?.id ?? '' })}
            >
              {preset.nome}
            </Button>
          ))}
        {empresaId && (
          <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground">
                <Save className="h-3.5 w-3.5" /> Salvar como preset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Salvar permissões de {vendedor.nome} como preset</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground -mt-2">
                Cria um novo preset com exatamente as permissões configuradas agora para este usuário, pronto para aplicar em outros.
              </p>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={presetNome} onChange={e => setPresetNome(e.target.value)} placeholder="Ex: Vendedor sem calendário" />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição (opcional)</Label>
                  <Input value={presetDescricao} onChange={e => setPresetDescricao(e.target.value)} placeholder="Ex: Igual ao vendedor padrão, sem acesso ao Calendário" />
                </div>
                <DialogFooter>
                  <Button onClick={handleSalvarComoPreset} disabled={!presetNome.trim() || createPreset.isPending}>
                    {createPreset.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : 'Salvar preset'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <PermissaoMatrizChecklist
          getValue={modulo => {
            const perm = getPermissao(modulo);
            return {
              pode_ver: perm?.pode_ver ?? true,
              pode_criar: perm?.pode_criar ?? false,
              pode_editar: perm?.pode_editar ?? false,
              pode_excluir: perm?.pode_excluir ?? false,
              funcionalidades: perm?.funcionalidades ?? {},
            };
          }}
          onChange={(modulo, updates) => updatePermissao(modulo, updates)}
        />
      </div>
    </div>
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
    const matchesSearch = !search || getVendedorNome(log.usuario_id).toLowerCase().includes(search.toLowerCase()) || log.acao.toLowerCase().includes(search.toLowerCase());
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
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex flex-col sm:flex-row gap-2 flex-none">
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
            <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} defaultMonth={dateFrom ?? dateTo} locale={ptBR} captionLayout="dropdown-buttons" fromYear={2020} toYear={new Date().getFullYear() + 1} className="p-3 pointer-events-auto" /></PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1', dateTo && 'border-primary')}>
                <CalendarIcon className="h-3 w-3" />
                {dateTo ? format(dateTo, 'dd/MM/yy') : 'Até'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} defaultMonth={dateTo ?? dateFrom} locale={ptBR} captionLayout="dropdown-buttons" fromYear={2020} toYear={new Date().getFullYear() + 1} className="p-3 pointer-events-auto" /></PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}><X className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap flex-none">
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
        <ScrollArea className="flex-1 min-h-0">
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
                                <span className="text-sm font-medium text-foreground">{getVendedorNome(log.usuario_id)}</span>
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
      <div className="flex items-center justify-between pt-1 border-t border-border flex-none">
        <span className="text-[10px] text-muted-foreground">{filtered.length} alteração(ões)</span>
        <span className="text-[10px] text-muted-foreground">{dateKeys.length} dia(s)</span>
      </div>
    </div>
  );
}

// ─── User Detail Panel ───
function UserDetailPanel({ vendedor, isGestor, onEdit, onDelete, currentUserId, empresaNome }: {
  vendedor: { id: string; nome: string; email: string; telefone: string | null; role: string; user_id: string | null; avatar_url?: string | null; empresa_id?: string | null };
  isGestor: boolean;
  onEdit: () => void;
  onDelete: () => void;
  currentUserId?: string;
  empresaNome?: string | null;
}) {
  const [activeSection, setActiveSection] = useState<'permissoes' | 'historico'>('permissoes');
  const roleConfig = getRoleConfig(vendedor.role);
  const iniciais = vendedor.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const isSelf = vendedor.user_id === currentUserId;

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* User header card */}
      <Card className="overflow-hidden flex-none">
        <div className="h-1.5 bg-gradient-to-r from-primary to-primary/50" />
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/20 overflow-hidden">
              {vendedor.avatar_url ? (
                <img src={vendedor.avatar_url} alt={vendedor.nome} className="h-full w-full object-cover" />
              ) : (
                <span className="text-foreground font-bold text-lg text-primary">{iniciais}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
              <div className="min-w-0">
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
                {empresaNome && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                    <Building2 className="h-3.5 w-3.5" /> {empresaNome}
                  </span>
                )}
              </div>
              {!isSelf && (
                <div className="flex gap-2 shrink-0">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section tabs */}
      {isGestor && (
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg border border-border flex-none">
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
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardContent className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col overflow-hidden">
            <InlinePermissaoEditor vendedor={vendedor} />
          </CardContent>
        </Card>
      )}

      {isGestor && activeSection === 'historico' && (
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 flex-none">
            <CardTitle className="text-sm font-medium">Histórico de Alterações</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
  const { data: vendedoresRemovidos } = useVendedoresRemovidos();
  const [showRemovidos, setShowRemovidos] = useState(false);
  const [reativarDialog, setReativarDialog] = useState(false);
  const createVendedor = useCreateVendedor();
  const [vendedorDialog, setVendedorDialog] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<null | { id: string; nome: string; email: string; telefone: string | null; role: string }>(null);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todas');
  const qc = useQueryClient();
  const { user, profile } = useAuth();

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
      const { data, error } = await supabase.from('empresas').select('id, nome, nome_fantasia, cnpj').order('nome');
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
      result = result.filter(v => (v.nome || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q));
    }
    return result;
  }, [vendedoresData, empresaFilter, roleFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['usuarios_removidos'] });
      toast.success('Usuário removido!');
      setSelectedVendedor(null);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ deleted_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['usuarios_removidos'] });
      toast.success('Usuário restaurado com sucesso!');
    },
  });

  const reativarMutation = useMutation({
    mutationFn: async (data: { email: string; nome: string; role: string; empresa_id: string }) => {
      const { data: result, error } = await supabase.rpc('restaurar_usuario_por_email', {
        p_email: data.email,
        p_nome: data.nome,
        p_role: data.role,
        p_empresa_id: data.empresa_id || null,
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['usuarios_removidos'] });
      toast.success('Usuário reativado com sucesso!');
      setReativarDialog(false);
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Erro ao reativar usuário');
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
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Top bar: stats, busca, filtros e ações — tudo inline */}
      <div className="flex items-center gap-2 flex-wrap flex-none">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{vendedoresData?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground -mt-0.5">usuários</p>
          </div>
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[190px] shrink-0 gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Filtrar por perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os perfis ({vendedoresData?.length ?? 0})</SelectItem>
            {Object.entries(roleCounts).sort(([a], [b]) => {
              const order = ['admin', 'empresa', 'gestor', 'vendedor'];
              return order.indexOf(a) - order.indexOf(b);
            }).map(([role, count]) => {
              const cfg = getRoleConfig(role);
              return (
                <SelectItem key={role} value={role}>
                  {cfg.label} ({count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {isAdmin && empresasData && empresasData.length > 0 && (
          <Select value={empresaFilter} onValueChange={(val) => { setEmpresaFilter(val); setSelectedVendedor(null); }}>
            <SelectTrigger className="w-fit max-w-full shrink-0 whitespace-nowrap">
              <SelectValue placeholder="Filtrar por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {(() => {
                const nomeCounts = empresasData.reduce<Record<string, number>>((acc, e) => {
                  const key = e.nome ?? '';
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {});
                return empresasData.map(emp => {
                  const isDuplicate = (nomeCounts[emp.nome ?? ''] ?? 0) > 1;
                  const subtitulo = emp.cnpj ?? emp.nome_fantasia ?? null;
                  return (
                    <SelectItem key={emp.id} value={emp.id}>
                      <span className="flex flex-col">
                        <span>{emp.nome}</span>
                        {isDuplicate && subtitulo && (
                          <span className="text-[11px] text-muted-foreground">{subtitulo}</span>
                        )}
                      </span>
                    </SelectItem>
                  );
                });
              })()}
            </SelectContent>
          </Select>
        )}

        {isAdmin && (
          <Dialog open={reativarDialog} onOpenChange={setReativarDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10">
                <RotateCcw className="h-3.5 w-3.5" />
                Reativar conta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reativar usuário por email</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground -mt-2">
                Use quando o usuário foi removido mas ainda tem conta de acesso. O sistema vai localizar a conta pelo email e reativar o perfil.
              </p>
              <form
                className="space-y-4 mt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  reativarMutation.mutate({
                    email: form.get('email') as string,
                    nome: form.get('nome') as string,
                    role: form.get('role') as string,
                    empresa_id: form.get('empresa_id') as string,
                  });
                }}
              >
                <div className="space-y-1.5">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input name="email" type="email" required placeholder="email@usuario.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input name="nome" placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Perfil</Label>
                  <PerfilSelect name="role" defaultValue="vendedor" />
                </div>
                {empresasData && empresasData.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Empresa</Label>
                    <Select name="empresa_id">
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {empresasData.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={reativarMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {reativarMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Reativando...</> : 'Reativar usuário'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        {isGestor && profile?.empresa_id && (
          <PermissaoPresetsDialog empresaId={profile.empresa_id} meuUsuarioId={profile?.id} />
        )}
        <CodigoAcessoButton />
      </div>

      {/* Usuários removidos (somente admin) */}
      {isAdmin && (vendedoresRemovidos?.length ?? 0) > 0 && (
        <Card className="border-destructive/20 flex-none">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowRemovidos(v => !v)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-destructive" />
                <CardTitle className="text-sm font-medium text-destructive">
                  Usuários Removidos
                </CardTitle>
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {vendedoresRemovidos?.length}
                </Badge>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showRemovidos && 'rotate-180')} />
            </div>
            <CardDescription className="text-xs">
              Usuários removidos ainda possuem conta de acesso. Restaure para reativar.
            </CardDescription>
          </CardHeader>
          {showRemovidos && (
            <CardContent className="pt-0">
              <div className="divide-y divide-border rounded-md border border-border overflow-y-auto max-h-64">
                {vendedoresRemovidos?.map(v => {
                  const iniciais = (v.nome ?? v.email).split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                  const roleConfig = getRoleConfig(v.role);
                  return (
                    <div key={v.id} className="flex items-center gap-3 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {v.avatar_url ? (
                          <img src={v.avatar_url} alt={v.nome ?? ''} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">{iniciais}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate text-muted-foreground">{v.nome ?? '—'}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">{roleConfig.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground/70 truncate">{v.email}</p>
                        {v.deleted_at && (
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                            Removido em {new Date(v.deleted_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-1.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                            disabled={restoreMutation.isPending}
                          >
                            {restoreMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Restaurar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restaurar usuário?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{v.nome ?? v.email}" voltará a ter acesso ao sistema com o perfil e permissões anteriores.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => restoreMutation.mutate(v.id)}
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              Restaurar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Main content: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 flex-1 min-h-0 lg:grid-rows-1">
        {/* Left: User list */}
        <Card className="overflow-hidden flex flex-col min-h-0 h-full">
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            {loadV ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredVendedores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Users className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p>
                {searchQuery && <p className="text-xs text-muted-foreground/60 mt-1">Tente outro termo de busca</p>}
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0" scrollBarClassName="z-20">
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
                        <div className={cn(
                          'flex items-center gap-2 px-4 py-2 bg-muted border-b border-border sticky top-0',
                          role === 'gestor' ? 'z-30' : 'z-10',
                        )}>
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
                                'h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors overflow-hidden',
                                selectedVendedor === v.id ? 'bg-primary text-primary-foreground' : 'bg-primary/10'
                              )}>
                                {v.avatar_url ? (
                                  <img src={v.avatar_url} alt={v.nome} className="h-full w-full object-cover" />
                                ) : (
                                  <span className={cn('text-sm font-bold', selectedVendedor === v.id ? '' : 'text-primary')}>
                                    {v.nome.charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{v.nome}</p>
                                <p className="text-xs text-muted-foreground truncate">{v.email}</p>
                                {isAdmin && v.empresa_id && (
                                  <p className="text-[11px] text-muted-foreground/70 truncate flex items-center gap-1 mt-0.5">
                                    <Building2 className="h-3 w-3 shrink-0" />
                                    {empresasData?.find(e => e.id === v.empresa_id)?.nome ?? '—'}
                                  </p>
                                )}
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
        <div className="h-full min-h-0 overflow-hidden">
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
                empresaNome={isAdmin && activeVendedor.empresa_id ? (empresasData?.find(e => e.id === activeVendedor.empresa_id)?.nome ?? null) : null}
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
