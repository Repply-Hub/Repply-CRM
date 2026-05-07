import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBulkCreatePrecos } from '@/hooks/use-fabricantes';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateFile } from '@/lib/file-validation';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fabricanteId: string;
  fabricanteNome?: string;
}

const TARGET_FIELDS = [
  { key: 'descricao_material', label: 'Produto', required: true },
  { key: 'imagem_url', label: 'Fotos' },
  { key: 'estoque_disponivel', label: 'Estoque disponível' },
  { key: 'unidade', label: 'Unidade de medida' },
  { key: 'preco_unitario', label: 'Preço de varejo', required: true },
  { key: 'referencia', label: 'Referência' },
  { key: 'categoria', label: 'Categoria' },
] as const;

type TargetKey = typeof TARGET_FIELDS[number]['key'];

const SKIP = '__skip__';

function autoMap(header: string): TargetKey | null {
  const h = header.toLowerCase().trim();
  if (h === 'produto') return 'descricao_material';
  if (h === 'fotos') return 'imagem_url';
  if (h === 'estoque disponível') return 'estoque_disponivel';
  if (h === 'unidade de medida') return 'unidade';
  if (h === 'preço de varejo') return 'preco_unitario';
  
  if (/(produto|desc|material|item)/.test(h)) return 'descricao_material';
  if (/(foto|img|imagem|url)/.test(h)) return 'imagem_url';
  if (/(estoque|disponível|disponivel|qtd|quant)/.test(h)) return 'estoque_disponivel';
  if (/(unidade|medida|un)/.test(h)) return 'unidade';
  if (/(preço|preco|valor|varejo)/.test(h)) return 'preco_unitario';
  if (/(ref|cód|cod|sku)/.test(h)) return 'referencia';
  if (/(categ|linha|grupo|famíl|famil)/.test(h)) return 'categoria';
  return null;
}

export function ImportCatalogoDialog({ open, onOpenChange, fabricanteId, fabricanteNome }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetKey | typeof SKIP>>({});
  const [parsing, setParsing] = useState(false);
  const bulk = useBulkCreatePrecos();

  const reset = () => {
    setFile(null); setHeaders([]); setRows([]); setMapping({});
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
    if (!descCol || !precoCol) {
      toast.error('Mapeie pelo menos Produto e Preço de Varejo');
      return;
    }

    const records = rows.map((row, index) => {
      const get = (target: TargetKey) => {
        const col = Object.entries(mapping).find(([, v]) => v === target)?.[0];
        if (!col) return undefined;
        const v = row[col];
        return v === '' || v === undefined || v === null ? undefined : v;
      };

      const precoRaw = get('preco_unitario');
      let preco = 0;
      if (typeof precoRaw === 'number') {
        preco = precoRaw;
      } else if (precoRaw) {
        // Handle various currency formats: R$ 1.234,56 or 1234.56
        const sanitized = String(precoRaw)
          .replace(/[^\d,.]/g, '') // remove currency symbols and letters
          .trim();
        
        if (sanitized.includes(',') && sanitized.includes('.')) {
          // Format like 1.234,56
          preco = parseFloat(sanitized.replace(/\./g, '').replace(',', '.'));
        } else if (sanitized.includes(',')) {
          // Format like 1234,56
          preco = parseFloat(sanitized.replace(',', '.'));
        } else {
          // Format like 1234.56
          preco = parseFloat(sanitized);
        }
      }

      const estoqueRaw = get('estoque_disponivel');
      let estoque = null;
      if (estoqueRaw !== undefined && estoqueRaw !== null && estoqueRaw !== '') {
        if (typeof estoqueRaw === 'number') {
          estoque = estoqueRaw;
        } else {
          const sanitized = String(estoqueRaw).replace(/[^\d,.]/g, '').replace(',', '.');
          estoque = parseFloat(sanitized);
        }
      }

      const descricao = String(get('descricao_material') ?? '').trim();

      return {
        fabricante_id: fabricanteId,
        descricao_material: descricao,
        referencia: get('referencia') ? String(get('referencia')).trim() : null,
        categoria: get('categoria') ? String(get('categoria')).trim() : null,
        unidade: get('unidade') ? String(get('unidade')).trim() : null,
        imagem_url: get('imagem_url') ? String(get('imagem_url')).trim() : null,
        estoque_disponivel: (estoque !== null && !isNaN(estoque)) ? estoque : null,
        preco_unitario: preco,
        vigente: true,
      };
    }).filter(r => r.descricao_material && !isNaN(r.preco_unitario));

    if (records.length === 0) {
      const descColExists = !!descCol;
      const precoColExists = !!precoCol;
      console.log('Dados processados para depuração:', {
        rowsSample: rows.slice(0, 3),
        mapping,
        descColExists,
        precoColExists
      });
      toast.error('Nenhuma linha válida encontrada. Verifique se as colunas de "Produto" e "Preço de varejo" estão corretamente preenchidas.');
      return;
    }

    try {
      const { inserted } = await bulk.mutateAsync(records);
      toast.success(`${inserted} produto(s) importado(s)!`);
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
          <DialogTitle>Importar Catálogo</DialogTitle>
          <DialogDescription>
            {fabricanteNome ? `Fabricante: ${fabricanteNome}` : 'Importação em massa de produtos via planilha.'}
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Selecione uma planilha (.xlsx, .xls ou .csv)</p>
            <p className="text-xs text-muted-foreground mb-4">
              Colunas reconhecidas: produto, fotos, estoque disponível, unidade de medida, preço de varejo, referência, categoria
            </p>
            <input
              id="catalogo-import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button asChild variant="outline" disabled={parsing}>
              <label htmlFor="catalogo-import-file" className="cursor-pointer gap-2">
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

            <div>
              <Label className="text-sm">Mapeamento de colunas</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Associe as colunas da planilha aos campos do catálogo.
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
                Importar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
