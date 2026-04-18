import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ArrowRight, X, ClipboardPaste, Columns3 } from 'lucide-react';
import { toast } from 'sonner';
import type { FieldDef } from '@/components/import/MappingStep';

interface Props {
  fields: FieldDef[];
  onCancel: () => void;
  onConfirm: (rows: Record<string, string>[], headers: string[]) => void;
}

const EMPTY_ROW = (allHeaders: string[]) =>
  allHeaders.reduce((acc, h) => ({ ...acc, [h]: '' }), {} as Record<string, string>);

export function ManualEntryStep({ fields, onCancel, onConfirm }: Props) {
  const baseHeaders = useMemo(() => fields.map(f => f.label), [fields]);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>(() => [
    EMPTY_ROW(baseHeaders), EMPTY_ROW(baseHeaders), EMPTY_ROW(baseHeaders),
  ]);
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  const headers = useMemo(() => [...baseHeaders, ...extraColumns], [baseHeaders, extraColumns]);

  const updateCell = (rowIdx: number, header: string, value: string) => {
    setRows(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [header]: value };
      return next;
    });
  };

  const addRow = () => setRows(prev => [...prev, EMPTY_ROW(headers)]);
  const removeRow = (idx: number) => setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const handleAddColumn = () => {
    const name = newColName.trim();
    if (!name) {
      toast.error('Informe um nome para a coluna');
      return;
    }
    if (headers.some(h => h.toLowerCase() === name.toLowerCase())) {
      toast.error('Já existe uma coluna com esse nome');
      return;
    }
    setExtraColumns(prev => [...prev, name]);
    setRows(prev => prev.map(r => ({ ...r, [name]: '' })));
    setNewColName('');
    setNewColOpen(false);
    toast.success(`Coluna "${name}" adicionada`);
  };

  const removeExtraColumn = (name: string) => {
    setExtraColumns(prev => prev.filter(c => c !== name));
    setRows(prev => prev.map(r => {
      const { [name]: _, ...rest } = r;
      return rest;
    }));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    const matrix = lines.map(l => l.split('\t'));

    setRows(prev => {
      const next = [...prev];
      while (next.length < rowIdx + matrix.length) next.push(EMPTY_ROW(headers));
      matrix.forEach((cells, r) => {
        const targetRow = { ...next[rowIdx + r] };
        cells.forEach((val, c) => {
          const header = headers[colIdx + c];
          if (header) targetRow[header] = val.trim();
        });
        next[rowIdx + r] = targetRow;
      });
      return next;
    });
    toast.success(`${matrix.length} linha(s) coladas`);
  };

  const handleConfirm = () => {
    const filled = rows.filter(r => Object.values(r).some(v => v && v.trim() !== ''));
    if (filled.length === 0) {
      toast.error('Preencha pelo menos uma linha');
      return;
    }
    onConfirm(filled, headers);
  };

  const filledCount = rows.filter(r => Object.values(r).some(v => v && v.trim() !== '')).length;

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default">Entrada manual</Badge>
          <Badge variant="outline">{filledCount} linha{filledCount === 1 ? '' : 's'} preenchida{filledCount === 1 ? '' : 's'}</Badge>
          <Badge variant="outline">{headers.length} colunas</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewColOpen(true)} className="gap-1.5">
            <Columns3 className="h-3.5 w-3.5" /> Nova coluna
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2">
        <ClipboardPaste className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-muted-foreground">
          Dica: copie várias células do Excel/Sheets e cole (Ctrl+V) em qualquer célula. Use "Nova coluna" para adicionar campos extras.
        </span>
      </div>

      <div ref={tableRef} className="flex-1 min-h-0 overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
            <tr>
              <th className="px-2 py-2 text-xs font-medium text-muted-foreground w-10 text-center">#</th>
              {fields.map(f => (
                <th key={f.key} className="px-2 py-2 text-xs font-medium text-left whitespace-nowrap">
                  {f.label}
                  {f.required && <span className="text-destructive ml-0.5">*</span>}
                </th>
              ))}
              {extraColumns.map(col => (
                <th key={col} className="px-2 py-2 text-xs font-medium text-left whitespace-nowrap">
                  <div className="flex items-center gap-1 group">
                    <span className="text-primary">{col}</span>
                    <button
                      onClick={() => removeExtraColumn(col)}
                      className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
                      title="Remover coluna"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="border-t hover:bg-muted/20">
                <td className="px-2 py-1 text-xs text-muted-foreground text-center">{rIdx + 1}</td>
                {headers.map((h, cIdx) => (
                  <td key={h} className="p-1 min-w-[140px]">
                    <Input
                      value={row[h] ?? ''}
                      onChange={(e) => updateCell(rIdx, h, e.target.value)}
                      onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                      className="h-8 text-xs border-transparent hover:border-input focus-visible:border-input rounded-sm"
                      placeholder="—"
                    />
                  </td>
                ))}
                <td className="p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(rIdx)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Adicionar linha
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={filledCount === 0}>
            Pré-visualizar <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <Dialog open={newColOpen} onOpenChange={setNewColOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova coluna</DialogTitle>
            <DialogDescription>
              Adicione uma coluna extra para organizar dados além dos campos padrão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-col-name">Nome da coluna</Label>
            <Input
              id="new-col-name"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
              placeholder="Ex: Observações, Origem, Segmento..."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewColOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddColumn}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
