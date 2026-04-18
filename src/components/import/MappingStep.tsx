import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  FileSpreadsheet, X, ArrowRight, Sparkles, Search, Check, EyeOff, AlertCircle, Plus, Pencil,
  CheckCircle2, Trash2, Wand2, GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  forContatos?: boolean;
}

const NONE = '__none__';
const EXTRA_PREFIX = '__extra__:';

interface Props {
  fileName: string;
  rawData: Record<string, any>[];
  headers: string[];
  mapping: Record<string, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  extras: Record<string, string>;
  setExtras: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Colunas criadas do zero pelo usuário: nome → valor padrão aplicado a todas as linhas */
  customColumns?: Record<string, string>;
  setCustomColumns?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  visibleFields: FieldDef[];
  onReset: () => void;
  onAutoDetect: () => void;
  onClearAll: () => void;
  canProceed: boolean;
  onNext: () => void;
}

type FilterMode = 'todas' | 'mapeadas' | 'novas' | 'ignoradas' | 'pendentes';

export function MappingStep({
  fileName, rawData, headers, mapping, setMapping, extras, setExtras,
  customColumns = {}, setCustomColumns, visibleFields,
  onReset, onAutoDetect, onClearAll, canProceed, onNext,
}: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('todas');
  const [editingExtra, setEditingExtra] = useState<string | null>(null);
  const [extraDraft, setExtraDraft] = useState<string>('');
  const [newColName, setNewColName] = useState('');

  const startEditExtra = (column: string) => {
    setEditingExtra(column);
    setExtraDraft(extras[column] ?? column);
  };
  const cancelEditExtra = () => {
    setEditingExtra(null);
    setExtraDraft('');
  };
  const saveEditExtra = (column: string) => {
    const value = extraDraft.trim() || column;
    setExtras(prev => ({ ...prev, [column]: value }));
    setEditingExtra(null);
    setExtraDraft('');
  };
  // Ordem customizada das colunas via drag-and-drop. Se vazio, usa headers original.
  const [headerOrder, setHeaderOrder] = useState<string[]>([]);
  const [draggingHeader, setDraggingHeader] = useState<string | null>(null);
  const [dragOverHeader, setDragOverHeader] = useState<string | null>(null);

  // Sincroniza ordem quando headers mudam (novo arquivo)
  const orderedHeaders = useMemo(() => {
    if (headerOrder.length === 0) return headers;
    const knownSet = new Set(headerOrder);
    const ordered = headerOrder.filter(h => headers.includes(h));
    const newOnes = headers.filter(h => !knownSet.has(h));
    return [...ordered, ...newOnes];
  }, [headers, headerOrder]);

  const moveHeader = (from: string, to: string) => {
    if (from === to) return;
    const base = orderedHeaders.slice();
    const fromIdx = base.indexOf(from);
    const toIdx = base.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    base.splice(fromIdx, 1);
    base.splice(toIdx, 0, from);
    setHeaderOrder(base);
  };

  const customNames = useMemo(() => Object.keys(customColumns), [customColumns]);
  const customCount = customNames.length;

  const addCustomColumn = () => {
    if (!setCustomColumns) return;
    const base = newColName.trim() || 'Nova coluna';
    let name = base;
    let i = 2;
    const taken = new Set([...headers, ...customNames]);
    while (taken.has(name)) { name = `${base} ${i++}`; }
    setCustomColumns(prev => ({ ...prev, [name]: '' }));
    setNewColName('');
    setEditingExtra(name);
  };

  const updateCustomValue = (name: string, value: string) => {
    setCustomColumns?.(prev => ({ ...prev, [name]: value }));
  };

  const renameCustomColumn = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const taken = new Set([...headers, ...customNames.filter(n => n !== oldName)]);
    if (taken.has(trimmed)) return;
    setCustomColumns?.(prev => {
      const next: Record<string, string> = {};
      Object.keys(prev).forEach(k => {
        if (k === oldName) next[trimmed] = prev[k];
        else next[k] = prev[k];
      });
      return next;
    });
    setEditingExtra(trimmed);
  };

  const removeCustomColumn = (name: string) => {
    setCustomColumns?.(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const columnToField = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    Object.keys(mapping).forEach(k => {
      const col = mapping[k];
      if (col) m[col] = k;
    });
    return m;
  }, [mapping]);

  const setColumnSelection = (column: string, value: string) => {
    setExtras(prev => {
      if (!(column in prev)) return prev;
      const next = { ...prev };
      delete next[column];
      return next;
    });

    if (value === NONE) {
      setMapping(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (next[k] === column) next[k] = ''; });
        return next;
      });
      return;
    }

    if (value.startsWith(EXTRA_PREFIX)) {
      setMapping(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (next[k] === column) next[k] = ''; });
        return next;
      });
      setExtras(prev => ({ ...prev, [column]: column }));
      setEditingExtra(column);
      return;
    }

    setMapping(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[k] === column) next[k] = ''; });
      next[value] = column;
      return next;
    });
  };

  const renameExtra = (column: string, newName: string) => {
    setExtras(prev => ({ ...prev, [column]: newName }));
  };

  const sample = (col: string) => {
    for (const row of rawData) {
      const v = row[col];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return '';
  };

  const getStatus = (col: string): 'mapeada' | 'nova' | 'ignorada' => {
    if (columnToField[col]) return 'mapeada';
    if (col in extras) return 'nova';
    return 'ignorada';
  };

  const getSelectionValue = (column: string): string => {
    const field = columnToField[column];
    if (field) return field;
    if (column in extras) return EXTRA_PREFIX + column;
    return NONE;
  };

  // Counters
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const extrasCount = Object.keys(extras).length;
  const ignoredCount = headers.length - mappedCount - extrasCount;
  const requiredMissing = visibleFields.filter(f => f.required && !mapping[f.key]);
  const unmappedFields = useMemo(
    () => visibleFields.filter(f => !mapping[f.key]),
    [visibleFields, mapping]
  );

  const assignFieldToColumn = (fieldKey: string, column: string) => {
    if (!column) return;
    setExtras(prev => {
      if (!(column in prev)) return prev;
      const next = { ...prev };
      delete next[column];
      return next;
    });
    setMapping(prev => {
      const next = { ...prev };
      // Limpa qualquer outro field que apontava p/ essa coluna
      Object.keys(next).forEach(k => { if (next[k] === column) next[k] = ''; });
      next[fieldKey] = column;
      return next;
    });
  };

  const filteredHeaders = useMemo(() => {
    let list = orderedHeaders;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(h => h.toLowerCase().includes(q));
    }
    if (filter !== 'todas') {
      list = list.filter(h => {
        const s = getStatus(h);
        if (filter === 'mapeadas') return s === 'mapeada';
        if (filter === 'novas') return s === 'nova';
        if (filter === 'ignoradas') return s === 'ignorada';
        if (filter === 'pendentes') return s === 'ignorada';
        return true;
      });
    }
    return list;
  }, [orderedHeaders, search, filter, columnToField, extras]);

  // Bulk actions for current filter selection
  const bulkSetAllExtras = () => {
    const targets = filteredHeaders.filter(h => getStatus(h) !== 'mapeada');
    if (targets.length === 0) return;
    setExtras(prev => {
      const next = { ...prev };
      targets.forEach(h => { next[h] = h; });
      return next;
    });
  };

  const bulkIgnoreAll = () => {
    const targets = filteredHeaders.filter(h => getStatus(h) !== 'mapeada');
    if (targets.length === 0) return;
    setExtras(prev => {
      const next = { ...prev };
      targets.forEach(h => { delete next[h]; });
      return next;
    });
  };

  const FilterChip = ({ value, label, count, tone }: { value: FilterMode; label: string; count: number; tone?: string }) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border transition-colors',
        filter === value
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
      <span className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold',
        filter === value ? 'bg-primary-foreground/20 text-primary-foreground' : tone || 'bg-muted text-foreground'
      )}>
        {count}
      </span>
    </button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        {/* Top summary card */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30 rounded-t-xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {rawData.length} linhas · {headers.length} colunas detectadas
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={onAutoDetect} className="gap-1.5 h-8">
                    <Sparkles className="h-3.5 w-3.5" /> Auto
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Detectar automaticamente os campos pelo nome da coluna</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onClearAll} className="h-8 px-2">Limpar</Button>
                </TooltipTrigger>
                <TooltipContent>Remover todos os mapeamentos</TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="sm" onClick={onReset} className="h-8 px-2">
                <X className="h-3.5 w-3.5 mr-1" /> Trocar arquivo
              </Button>
            </div>
          </div>

          {/* Status pills row */}
          <div className="flex items-center gap-2 flex-wrap px-4 py-2.5">
            <FilterChip value="todas" label="Todas" count={headers.length} />
            <FilterChip value="mapeadas" label="Mapeadas" count={mappedCount} tone="bg-primary/10 text-primary" />
            <FilterChip value="novas" label="Novas" count={extrasCount} tone="bg-accent text-accent-foreground" />
            <FilterChip value="ignoradas" label="Ignoradas" count={ignoredCount} tone="bg-muted text-muted-foreground" />
          </div>
        </div>

        {/* Required missing alert */}
        {requiredMissing.length > 0 && (
          <div className="flex items-start gap-2.5 text-xs bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-warning-foreground">
              <span className="font-semibold">Campo obrigatório pendente: </span>
              {requiredMissing.map((f, i) => (
                <span key={f.key} className="font-medium">
                  {f.label}{i < requiredMissing.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search + bulk */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar coluna..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {filter !== 'todas' && filter !== 'mapeadas' && (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={bulkSetAllExtras} className="h-9 gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Tudo como nova
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Marca todas as colunas filtradas como novas</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={bulkIgnoreAll} className="h-9 gap-1.5">
                    <EyeOff className="h-3.5 w-3.5" /> Ignorar todas
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ignora todas as colunas filtradas</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Criar coluna do zero */}
        {setCustomColumns && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-accent/50 bg-accent/10 px-3 py-2">
            <Wand2 className="h-4 w-4 text-accent-foreground shrink-0" />
            <Input
              placeholder="Criar coluna do zero (ex: Origem da campanha)"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomColumn(); } }}
              className="h-8 flex-1 bg-background text-xs"
            />
            <Button
              type="button"
              size="sm"
              onClick={addCustomColumn}
              className="h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
        )}

        {/* Mapping list */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border bg-card">
          {/* Custom columns section (criadas do zero) */}
          {customCount > 0 && (
            <div className="border-b bg-accent/5">
              <div className="px-4 py-2 flex items-center gap-2 bg-accent/15 border-b border-accent/20">
                <Wand2 className="h-3.5 w-3.5 text-accent-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
                  Colunas criadas do zero ({customCount})
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Valor aplicado a todas as {rawData.length} linhas
                </span>
              </div>
              <ul className="divide-y divide-accent/15">
                {customNames.map((name) => (
                  <li key={name} className="px-4 py-3 hover:bg-accent/10 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground border border-accent flex items-center justify-center shrink-0 mt-0.5">
                        <Wand2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            value={name}
                            onChange={(e) => renameCustomColumn(name, e.target.value)}
                            onFocus={() => setEditingExtra(name)}
                            onBlur={() => setEditingExtra(null)}
                            placeholder="Nome da nova coluna"
                            className={cn(
                              'h-8 text-sm font-semibold flex-1',
                              editingExtra === name && 'ring-1 ring-accent border-accent'
                            )}
                          />
                          <Badge className="h-5 text-[10px] gap-1 bg-accent text-accent-foreground border-accent hover:bg-accent shrink-0">
                            <Wand2 className="h-2.5 w-2.5" />
                            Do zero
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Salvo em <span className="font-mono text-foreground/80">campos_extras.{name}</span>
                        </div>
                      </div>
                      <div className="w-[220px] shrink-0">
                        <Input
                          value={customColumns[name] ?? ''}
                          onChange={(e) => updateCustomValue(name, e.target.value)}
                          placeholder="Valor padrão (opcional)"
                          className="h-8 text-xs"
                        />
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCustomColumn(name)}
                            className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remover coluna</TooltipContent>
                      </Tooltip>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filteredHeaders.length === 0 && customCount === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? `Nenhuma coluna encontrada para "${search}"` : 'Nenhuma coluna neste filtro'}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filteredHeaders.map((h) => {
                const status = getStatus(h);
                const field = columnToField[h];
                const isExtra = status === 'nova';
                const ignored = status === 'ignorada';
                const selectionValue = getSelectionValue(h);
                const exampleValue = sample(h);
                const fieldDef = field ? visibleFields.find(f => f.key === field) : null;

                return (
                  <li
                    key={h}
                    draggable
                    onDragStart={(e) => {
                      setDraggingHeader(h);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', h);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (draggingHeader && draggingHeader !== h) setDragOverHeader(h);
                    }}
                    onDragLeave={() => {
                      setDragOverHeader(prev => (prev === h ? null : prev));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = draggingHeader || e.dataTransfer.getData('text/plain');
                      if (from && from !== h) moveHeader(from, h);
                      setDraggingHeader(null);
                      setDragOverHeader(null);
                    }}
                    onDragEnd={() => {
                      setDraggingHeader(null);
                      setDragOverHeader(null);
                    }}
                    className={cn(
                      'group px-4 py-3 transition-colors',
                      isExtra && 'bg-accent/20',
                      field && 'bg-primary/[0.03]',
                      ignored && 'opacity-75',
                      'hover:bg-muted/40',
                      draggingHeader === h && 'opacity-40',
                      dragOverHeader === h && 'border-t-2 border-primary'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      {/* Drag handle */}
                      <button
                        type="button"
                        aria-label="Arrastar para reordenar"
                        className="shrink-0 mt-2 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>

                      {/* Status indicator */}
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border',
                        field && 'bg-primary/10 text-primary border-primary/20',
                        isExtra && 'bg-accent text-accent-foreground border-accent',
                        ignored && 'bg-muted text-muted-foreground border-border'
                      )}>
                        {field ? <CheckCircle2 className="h-4 w-4" /> : isExtra ? <Plus className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </div>

                      {/* Column info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate" title={h}>
                            {h}
                          </span>
                          {field && fieldDef && (
                            <Badge variant="outline" className="h-5 text-[10px] gap-1 border-primary/30 text-primary bg-primary/5">
                              <Check className="h-2.5 w-2.5" />
                              {fieldDef.label}
                              {fieldDef.required && <span className="text-destructive ml-0.5">*</span>}
                            </Badge>
                          )}
                          {isExtra && (
                            <Badge className="h-5 text-[10px] gap-1 bg-accent text-accent-foreground border-accent hover:bg-accent">
                              <Plus className="h-2.5 w-2.5" />
                              Nova coluna
                            </Badge>
                          )}
                          {ignored && (
                            <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                              Ignorada
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={exampleValue}>
                          {exampleValue ? (
                            <>Ex: <span className="font-mono text-foreground/80">{exampleValue}</span></>
                          ) : (
                            <span className="italic">sem exemplo</span>
                          )}
                        </div>
                      </div>

                      {/* Action: select field */}
                      <div className="w-[240px] shrink-0 flex flex-col gap-2">
                        <Select value={selectionValue} onValueChange={(v) => setColumnSelection(h, v)}>
                          <SelectTrigger className={cn(
                            'h-9 text-xs',
                            field && 'border-primary/40',
                            isExtra && 'border-accent',
                          )}>
                            <SelectValue placeholder="Escolher destino..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[280px]">
                            <SelectGroup>
                              <SelectItem value={NONE} className="text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  <EyeOff className="h-3 w-3" />
                                  Não importar
                                </span>
                              </SelectItem>
                              <SelectItem value={EXTRA_PREFIX + h} className="text-accent-foreground font-medium">
                                <span className="flex items-center gap-1.5">
                                  <Plus className="h-3 w-3" />
                                  Adicionar como nova coluna
                                </span>
                              </SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Campos do sistema
                              </SelectLabel>
                              {visibleFields.map(f => {
                                const usedBy = mapping[f.key];
                                const usedElsewhere = usedBy && usedBy !== h;
                                return (
                                  <SelectItem key={f.key} value={f.key}>
                                    <span className="flex items-center gap-1.5">
                                      <span>{f.label}</span>
                                      {f.required && <span className="text-destructive">*</span>}
                                      {usedElsewhere && (
                                        <span className="text-[10px] text-muted-foreground italic">
                                          (em {usedBy})
                                        </span>
                                      )}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectGroup>
                          </SelectContent>
                        </Select>

                        {isExtra && (
                          <div className="rounded-md border border-accent/30 bg-accent/10 p-1.5 space-y-1">
                            <label className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground/80">
                              <span className="flex items-center gap-1">
                                <Pencil className="h-2.5 w-2.5" />
                                Nome no sistema
                              </span>
                              {editingExtra !== h && (
                                <button
                                  type="button"
                                  onClick={() => startEditExtra(h)}
                                  className="text-[10px] font-medium normal-case text-accent-foreground hover:underline"
                                >
                                  Editar
                                </button>
                              )}
                            </label>

                            {editingExtra === h ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  value={extraDraft}
                                  onChange={(e) => setExtraDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveEditExtra(h); }
                                    if (e.key === 'Escape') { e.preventDefault(); cancelEditExtra(); }
                                  }}
                                  placeholder="Ex: origem_lead"
                                  className="h-7 flex-1 text-xs bg-background border-accent ring-1 ring-accent"
                                />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => saveEditExtra(h)}
                                      className="h-7 w-7 p-0 shrink-0 bg-accent hover:bg-accent/90 text-accent-foreground"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Salvar (Enter)</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={cancelEditExtra}
                                      className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Cancelar (Esc)</TooltipContent>
                                </Tooltip>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditExtra(h)}
                                className="w-full text-left h-7 px-2 text-xs rounded border border-accent/30 bg-background/60 hover:bg-background hover:border-accent/60 transition-colors truncate"
                                title={extras[h] ?? h}
                              >
                                <span className="font-mono text-foreground/90">{extras[h] ?? h}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-accent-foreground" />
            Colunas <span className="font-medium text-accent-foreground">novas</span> são salvas em "campos extras" — nada se perde.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onReset} size="sm">Cancelar</Button>
            <Button disabled={!canProceed} onClick={onNext} size="sm" className="gap-1.5">
              Pré-visualizar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
