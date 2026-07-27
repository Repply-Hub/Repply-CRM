import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { MODULOS, type Funcionalidade } from '@/hooks/use-permissoes';
import {
  Plus, Eye, PenLine, Trash, ChevronDown, Search, Building2, Import, FileDown,
  Filter, ArrowRightLeft, MessageCircle, FileText, ToggleLeft, UserCheck, UsersRound,
  FileUp, Shield, Key, CalendarIcon, Globe, DollarSign, Users, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MatrixModuloValue {
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
  funcionalidades: Record<string, boolean>;
}

function getFuncIcon(icon: Funcionalidade['icon']) {
  const map: Record<string, typeof Import> = {
    import: Import, export: FileDown, filter: Filter, move: ArrowRightLeft,
    whatsapp: MessageCircle, pdf: FileText, status: ToggleLeft,
    assign: UserCheck, group: UsersRound, file: FileUp, users: Users,
    shield: Shield, key: Key, ics: CalendarIcon, scraping: Globe, prices: DollarSign,
  };
  return map[icon] || Info;
}

function getModuloIcon(key: string) {
  const map: Record<string, typeof Shield> = {
    dashboard: FileText, pipeline: ArrowRightLeft, clientes: Building2,
    contatos: Users, pedidos: FileText, obras: Shield, fabricantes: DollarSign,
    portal: Globe, calendario: CalendarIcon, tarefas: UserCheck,
    chat: MessageCircle, configuracoes: Shield,
  };
  return map[key] || Shield;
}

// ─── Reusable module-by-module permission matrix (used both to edit a user's
// permissões and to edit a preset's definition) ───
export function PermissaoMatrixEditor({
  getValue,
  onChange,
  defaultVer = true,
}: {
  getValue: (moduloKey: string) => MatrixModuloValue | undefined;
  onChange: (moduloKey: string, updates: Partial<MatrixModuloValue>) => void;
  defaultVer?: boolean;
}) {
  const [expandedModulo, setExpandedModulo] = useState<string | null>(null);
  const [searchModulo, setSearchModulo] = useState('');

  const getPermCount = (modKey: string) => {
    const mod = MODULOS.find(m => m.key === modKey);
    const perm = getValue(modKey);
    const crudActive = [perm?.pode_ver ?? defaultVer, perm?.pode_criar ?? false, perm?.pode_editar ?? false, perm?.pode_excluir ?? false].filter(Boolean).length;
    const funcActive = (mod?.funcionalidades ?? []).filter(f => perm?.funcionalidades?.[f.key] ?? false).length;
    const total = 4 + (mod?.funcionalidades?.length ?? 0);
    return { active: crudActive + funcActive, total };
  };

  const filteredModulos = MODULOS.filter(m =>
    !searchModulo || m.label.toLowerCase().includes(searchModulo.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar módulo..."
          value={searchModulo}
          onChange={e => setSearchModulo(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      <div className="space-y-2">
        {filteredModulos.map(mod => {
          const perm = getValue(mod.key);
          const ver = perm?.pode_ver ?? defaultVer;
          const criar = perm?.pode_criar ?? false;
          const editar = perm?.pode_editar ?? false;
          const excluir = perm?.pode_excluir ?? false;
          const isExpanded = expandedModulo === mod.key;
          const counts = getPermCount(mod.key);
          const ModIcon = getModuloIcon(mod.key);
          const hasFuncs = mod.funcionalidades.length > 0;
          const completionPct = (counts.active / counts.total) * 100;

          return (
            <div
              key={mod.key}
              className={cn(
                "rounded-lg border transition-all overflow-hidden",
                ver ? "border-border bg-card" : "border-border/50 bg-muted/20",
                isExpanded && "border-primary/30 shadow-sm"
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedModulo(isExpanded ? null : mod.key)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  ver ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <ModIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", !ver && "text-muted-foreground")}>{mod.label}</span>
                    {!ver && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Sem acesso</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-1 flex-1 max-w-[100px] bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all rounded-full",
                          completionPct === 100 ? "bg-primary" : completionPct > 50 ? "bg-primary/70" : "bg-muted-foreground/40"
                        )}
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">{counts.active}/{counts.total}</span>
                  </div>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4 bg-muted/10">
                  <div className="flex items-center justify-between p-3 rounded-md bg-background border border-border">
                    <div className="flex items-start gap-3 flex-1">
                      <Eye className={cn("h-4 w-4 mt-0.5 shrink-0", ver ? "text-primary" : "text-muted-foreground/50")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Acesso ao módulo</p>
                        <p className="text-xs text-muted-foreground">{mod.descricoes.ver}</p>
                      </div>
                    </div>
                    <Switch
                      checked={ver}
                      onCheckedChange={() => onChange(mod.key, { pode_ver: !ver })}
                    />
                  </div>

                  {ver && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Ações Permitidas</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { key: 'pode_criar', icon: Plus, label: 'Criar', desc: mod.descricoes.criar, value: criar, color: 'emerald' },
                          { key: 'pode_editar', icon: PenLine, label: 'Editar', desc: mod.descricoes.editar, value: editar, color: 'amber' },
                          { key: 'pode_excluir', icon: Trash, label: 'Excluir', desc: mod.descricoes.excluir, value: excluir, color: 'red' },
                        ].map(action => {
                          const ActionIcon = action.icon;
                          const colorClasses = {
                            emerald: action.value ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border',
                            amber: action.value ? 'border-amber-500/30 bg-amber-500/5' : 'border-border',
                            red: action.value ? 'border-red-500/30 bg-red-500/5' : 'border-border',
                          }[action.color];
                          const iconColor = {
                            emerald: action.value ? 'text-emerald-500' : 'text-muted-foreground/40',
                            amber: action.value ? 'text-amber-500' : 'text-muted-foreground/40',
                            red: action.value ? 'text-red-500' : 'text-muted-foreground/40',
                          }[action.color];
                          return (
                            <button
                              key={action.key}
                              type="button"
                              onClick={() => onChange(mod.key, { [action.key]: !action.value } as Partial<MatrixModuloValue>)}
                              className={cn(
                                "flex items-start gap-2 p-3 rounded-md border text-left transition-all hover:bg-muted/50",
                                colorClasses
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <ActionIcon className={cn("h-4 w-4 shrink-0", iconColor)} />
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm font-medium", !action.value && "text-muted-foreground")}>{action.label}</p>
                                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{action.desc}</p>
                                </div>
                              </div>
                              <Checkbox checked={action.value} className="mt-0.5 shrink-0 pointer-events-none" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {ver && hasFuncs && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Funcionalidades Específicas</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {mod.funcionalidades.map(func => {
                          const FuncIcon = getFuncIcon(func.icon);
                          const isActive = perm?.funcionalidades?.[func.key] ?? false;
                          return (
                            <button
                              key={func.key}
                              type="button"
                              onClick={() => onChange(mod.key, { funcionalidades: { ...(perm?.funcionalidades ?? {}), [func.key]: !isActive } })}
                              className={cn(
                                "flex items-start gap-2 p-3 rounded-md border text-left transition-all hover:bg-muted/50",
                                isActive ? "border-primary/30 bg-primary/5" : "border-border"
                              )}
                            >
                              <FuncIcon className={cn("h-4 w-4 shrink-0 mt-0.5", isActive ? "text-primary" : "text-muted-foreground/40")} />
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-sm font-medium", !isActive && "text-muted-foreground")}>{func.label}</p>
                                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{func.descricao}</p>
                              </div>
                              <Switch checked={isActive} className="shrink-0 pointer-events-none scale-75 origin-right" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredModulos.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum módulo encontrado.
        </div>
      )}
    </div>
  );
}
