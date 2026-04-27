import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBulkCreatePrecos } from '@/hooks/use-fabricantes';
import { useFabricantes } from '@/hooks/use-clientes';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, Factory } from 'lucide-react';
import { toast } from 'sonner';
import { validateFile } from '@/lib/file-validation';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFabricanteChange?: (id: string) => void;
}

const TARGET_FIELDS = [
  { key: 'descricao_material', label: 'Descrição *', required: true },
  { key: 'referencia', label: 'Referência' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'preco_unitario', label: 'Preço unitário *', required: true },
  { key: 'unidade', label: 'Unidade' },
  { key: 'fabricante_nome', label: 'Nome do Fabricante (para roteamento)' },
] as const;

type TargetKey = typeof TARGET_FIELDS[number]['key'];

const SKIP = '__skip__';

function autoMap(header: string): TargetKey | null {
  const h = header.toLowerCase().trim();
  if (/(desc|produto|material|item)/.test(h)) return 'descricao_material';
  if (/(ref|cód|cod|sku)/.test(h)) return 'referencia';
  if (/(categ|linha|grupo|famíl|famil)/.test(h)) return 'categoria';
  if (/(preço|preco|valor)/.test(h)) return 'preco_unitario';
  if (/(un|medida)/.test(h)) return 'unidade';
  if (/(fab|marca|fornec)/.test(h)) return 'fabricante_nome';
  return null;
}

export function GlobalImportCatalogoDialog({ open, onOpenChange, onFabricanteChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetKey | typeof SKIP>>({});
  const [parsing, setParsing] = useState(false);
  const [selectedFabricanteId, setSelectedFabricanteId] = useState<string>('');
  const { data: fabricantes } = useFabricantes();
  const bulk = useBulkCreatePrecos();

  const reset = () => {
    setFile(null); setHeaders([]); setRows([]); setMapping({}); setSelectedFabricanteId('');
  };

  const handleFile = async (f: File) => {
    if (!validateFile(f, { allowedExtensions: ['.xlsx', '.xls', '.csv'] })) return;
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (json.length === 0) {
        toast.error('Planilha vazia');
        return;
      }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRows(json);
      const map: Record<string, TargetKey | typeof SKIP> = {};
      hdrs.forEach(h => {
        const t = autoMap(h);
        map[h] = t ?? SKIP;
      });
      setMapping(map);
      setFile(f);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao ler planilha');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    const descCol = Object.entries(mapping).find(([, v]) => v === 'descricao_material')?.[0];
    const precoCol = Object.entries(mapping).find(([, v]) => v === 'preco_unitario')?.[0];
    const fabCol = Object.entries(mapping).find(([, v]) => v === 'fabricante_nome')?.[0];

    if (!descCol || !precoCol) {
      toast.error('Mapeie pelo menos Descrição e Preço unitário');
      return;
    }

    if (!selectedFabricanteId && !fabCol) {
      toast.error('Selecione um fabricante ou mapeie a coluna de Fabricante');
      return;
    }

    const recordsByFab: Record<string, any[]> = {};

    rows.forEach(row => {
      const get = (target: TargetKey) => {
        const col = Object.entries(mapping).find(([, v]) => v === target)?.[0];
        if (!col) return undefined;
        const v = row[col];
        return v === '' ? undefined : v;
      };

      const precoRaw = get('preco_unitario');
      const preco = typeof precoRaw === 'number'
        ? precoRaw
        : parseFloat(String(precoRaw ?? '').replace(/\./g, '').replace(',', '.'));
      
      const fabNameFromRow = get('fabricante_nome');
      let fabId = selectedFabricanteId;

      if (fabNameFromRow && fabricantes) {
        const matchedFab = fabricantes.find(f => 
          f.nome.toLowerCase().trim() === String(fabNameFromRow).toLowerCase().trim()
        );
        if (matchedFab) {
          fabId = matchedFab.id;
        }
      }

      if (!fabId) return;

      const descricao = String(get('descricao_material') ?? '').trim();
      if (!descricao || isNaN(preco) || preco <= 0) return;

      if (!recordsByFab[fabId]) recordsByFab[fabId] = [];
      
      recordsByFab[fabId].push({
        fabricante_id: fabId,
        descricao_material: descricao,
        referencia: get('referencia') ? String(get('referencia')).trim() : null,
        categoria: get('categoria') ? String(get('categoria')).trim() : null,
        unidade: get('unidade') ? String(get('unidade')).trim() : null,
        preco_unitario: preco,
        vigente: true,
      });
    });

    const allRecords = Object.values(recordsByFab).flat();

    if (allRecords.length === 0) {
      toast.error('Nenhuma linha válida encontrada');
      return;
    }

    try {
      const { inserted } = await bulk.mutateAsync(allRecords);
      toast.success(`${inserted} produto(s) importado(s)!`);
      
      // If we only imported for one fabricante, select it
      const uniqueFabIds = Object.keys(recordsByFab);
      if (uniqueFabIds.length === 1 && onFabricanteChange) {
        onFabricanteChange(uniqueFabIds[0]);
      } else if (selectedFabricanteId && onFabricanteChange) {
        onFabricanteChange(selectedFabricanteId);
      }

      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Falha na importação');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Catálogo (Geral)</DialogTitle>
          <DialogDescription>
            Importe produtos e direcione para os fabricantes corretos.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Selecione uma planilha (.xlsx, .xls ou .csv)</p>
            <p className="text-xs text-muted-foreground mb-4">
              Pode conter colunas de descrição, referência, categoria, preço, unidade e fabricante.
            </p>
            <input
              id="global-catalogo-import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button asChild variant="outline" disabled={parsing}>
              <label htmlFor="global-catalogo-import-file" className="cursor-pointer gap-2">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Escolher arquivo
              </label>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg p-3">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="font-medium truncate">{file.name}</span>
              <span className="text-muted-foreground ml-auto">{rows.length} linhas</span>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Fabricante Padrão</Label>
              <p className="text-xs text-muted-foreground">
                Usado para linhas onde o fabricante não for identificado na planilha.
              </p>
              <Select value={selectedFabricanteId} onValueChange={setSelectedFabricanteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um fabricante..." />
                </SelectTrigger>
                <SelectContent>
                  {fabricantes?.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Mapeamento de colunas</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 mt-2">
                {headers.map(h => (
                  <div key={h} className="grid grid-cols-2 gap-3 items-center">
                    <div className="text-sm font-medium truncate" title={h}>{h}</div>
                    <Select
                      value={mapping[h] ?? SKIP}
                      onValueChange={(v) => setMapping(prev => ({ ...prev, [h]: v as any }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>Ignorar</SelectItem>
                        {TARGET_FIELDS.map(t => (
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={reset} disabled={bulk.isPending}>
                Trocar arquivo
              </Button>
              <Button onClick={handleImport} disabled={bulk.isPending} className="gap-1.5">
                {bulk.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Importar e Direcionar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
