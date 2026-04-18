import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileSpreadsheet, X, ArrowRight, Sparkles, Search, Check, Minus, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type FieldKey =
  | 'empresa' | 'razao_social' | 'tipo' | 'cnpj' | 'email'
  | 'telefone' | 'endereco' | 'nome_contato' | 'cargo';

export interface FieldDef {
  key: FieldKey;
  label: string;
  required: boolean;
  forContatos?: boolean;
}

interface Props {
  fileName: string;
  rawData: Record<string, any>[];
  headers: string[];
  mapping: Record<FieldKey, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<FieldKey, string>>>;
  visibleFields: FieldDef[];
  onReset: () => void;
  onAutoDetect: () => void;
  onClearAll: () => void;
  canProceed: boolean;
  onNext: () => void;
}

const NONE = '__none__';

export function MappingStep({
  fileName, rawData, headers, mapping, setMapping, visibleFields,
  onReset, onAutoDetect, onClearAll, canProceed, onNext,
}: Props) {
  const [search, setSearch] = useState('');

  // Reverse map: column → field
  const columnToField = useMemo(() => {
    const m: Record<string, FieldKey | undefined> = {};
    (Object.keys(mapping) as FieldKey[]).forEach(k => {
      const col = mapping[k];
      if (col) m[col] = k;
    });
    return m;
  }, [mapping]);

  const setColumnField = (column: string, field: FieldKey | typeof NONE) => {
    setMapping(prev => {
      const next = { ...prev };
      // Clear any field already mapped to this column
      (Object.keys(next) as FieldKey[]).forEach(k => {
        if (next[k] === column) next[k] = '';
      });
      if (field !== NONE) {
        // Clear previous column for that field
        next[field] = column;
      }
      return next;
    });
  };

  const filteredHeaders = useMemo(() => {
    if (!search) return headers;
    const q = search.toLowerCase();
    return headers.filter(h => h.toLowerCase().includes(q));
  }, [headers, search]);

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const requiredMissing = visibleFields.filter(f => f.required && !mapping[f.key]);

  const sample = (col: string) => {
    for (const row of rawData) {
      const v = row[col];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return '';
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <FileSpreadsheet className="h-3 w-3" />
            {fileName}
          </Badge>
          <Badge variant="outline">{rawData.length} linhas</Badge>
          <Badge variant="outline">{headers.length} colunas</Badge>
          <Badge variant={mappedCount > 0 ? 'default' : 'outline'}>
            {mappedCount} mapeada{mappedCount === 1 ? '' : 's'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onAutoDetect} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Auto-detectar
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearAll}>Limpar</Button>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="h-4 w-4 mr-1" /> Trocar
          </Button>
        </div>
      </div>

      {/* Required fields summary */}
      {requiredMissing.length > 0 && (
        <div className="flex items-center gap-2 text-xs bg-warning/10 text-warning-foreground border border-warning/30 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0" />
          <span>
            Para continuar, mapeie:{' '}
            {requiredMissing.map((f, i) => (
              <span key={f.key} className="font-medium">
                {f.label}{i < requiredMissing.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar coluna da planilha..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Column list */}
      <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 border-b text-xs font-medium text-muted-foreground sticky top-0 z-10">
          <div className="col-span-5">Coluna da planilha</div>
          <div className="col-span-3">Exemplo</div>
          <div className="col-span-4">Campo no sistema</div>
        </div>
        {filteredHeaders.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nenhuma coluna encontrada para "{search}"
          </div>
        )}
        {filteredHeaders.map((h) => {
          const field = columnToField[h];
          const fieldDef = visibleFields.find(f => f.key === field);
          const ignored = !field;
          return (
            <div
              key={h}
              className={cn(
                'grid grid-cols-12 gap-2 px-3 py-2 items-center border-b last:border-0 text-sm hover:bg-muted/30 transition-colors',
                ignored && 'opacity-60'
              )}
            >
              <div className="col-span-5 flex items-center gap-2 min-w-0">
                <div className={cn(
                  'h-6 w-6 rounded-md flex items-center justify-center shrink-0',
                  field ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {field ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                </div>
                <span className="font-medium truncate" title={h}>{h}</span>
              </div>
              <div className="col-span-3 text-xs text-muted-foreground truncate" title={sample(h)}>
                {sample(h) || <span className="italic">vazio</span>}
              </div>
              <div className="col-span-4">
                <Select
                  value={field ?? NONE}
                  onValueChange={(v) => setColumnField(h, v as any)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Não mapear" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-muted-foreground">
                      — Não importar —
                    </SelectItem>
                    {visibleFields.map(f => {
                      const usedBy = mapping[f.key];
                      const usedElsewhere = usedBy && usedBy !== h;
                      return (
                        <SelectItem key={f.key} value={f.key}>
                          <span className="flex items-center gap-1.5">
                            {f.label}
                            {f.required && <span className="text-destructive">*</span>}
                            {usedElsewhere && (
                              <span className="text-[10px] text-muted-foreground">
                                (em uso: {usedBy})
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">
          Apenas colunas mapeadas serão importadas. As demais são ignoradas.
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset}>Cancelar</Button>
          <Button disabled={!canProceed} onClick={onNext}>
            Pré-visualizar <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
