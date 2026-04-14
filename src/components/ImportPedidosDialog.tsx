import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

interface ParsedPedido {
  cliente: string;
  fabricante: string;
  valor: number;
  observacoes?: string;
  status: string;
}

const STATUS_MAP: Record<string, string> = {
  'novo lead': 'novo_lead',
  'novo_lead': 'novo_lead',
  'novo': 'novo_lead',
  'lead': 'novo_lead',
  'elaboração': 'elaboracao',
  'elaboracao': 'elaboracao',
  'elaborando': 'elaboracao',
  'enviado': 'enviado',
  'negociação': 'negociacao',
  'negociacao': 'negociacao',
  'fechamento': 'fechamento',
  'fechado': 'fechamento',
  'ganho': 'fechamento',
};

const COLUMN_MAP: [RegExp, keyof ParsedPedido][] = [
  [/^(cliente|empresa|nome\s*cliente)$/i, 'cliente'],
  [/^(fabricante|fornecedor|fabrica)$/i, 'fabricante'],
  [/^(valor|valor\s*total|total|preco|preço)$/i, 'valor'],
  [/^(obs|observa[cç][oõ]es|notas|descri[cç][aã]o)$/i, 'observacoes'],
  [/^(status|etapa|fase|estagio|estágio)$/i, 'status'],
];

function normalizeHeader(h: string): keyof ParsedPedido | null {
  const key = h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [pattern, field] of COLUMN_MAP) {
    if (pattern.test(key)) return field;
  }
  // partial match
  const partials: [string, keyof ParsedPedido][] = [
    ['cliente', 'cliente'], ['empresa', 'cliente'], ['fabricante', 'fabricante'],
    ['fornecedor', 'fabricante'], ['valor', 'valor'], ['total', 'valor'],
    ['obs', 'observacoes'], ['status', 'status'], ['etapa', 'status'],
  ];
  for (const [partial, field] of partials) {
    if (key.includes(partial)) return field;
  }
  return null;
}

function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = val.toString().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

interface ImportPedidosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportPedidosDialog({ open, onOpenChange }: ImportPedidosDialogProps) {
  const [rows, setRows] = useState<ParsedPedido[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setRows([]);
    setFileName('');
    setStep('upload');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (json.length === 0) {
        toast.error('Arquivo vazio ou sem dados válidos');
        return;
      }

      const headers = Object.keys(json[0]);
      const mappedHeaders: Record<string, keyof ParsedPedido> = {};
      const usedFields = new Set<keyof ParsedPedido>();

      headers.forEach(h => {
        const mapped = normalizeHeader(h);
        if (mapped && !usedFields.has(mapped)) {
          mappedHeaders[h] = mapped;
          usedFields.add(mapped);
        }
      });

      if (!Object.values(mappedHeaders).includes('cliente')) {
        toast.error(`Coluna "Cliente" não encontrada. Colunas: ${headers.join(', ')}`);
        return;
      }
      if (!Object.values(mappedHeaders).includes('fabricante')) {
        toast.error(`Coluna "Fabricante" não encontrada. Colunas: ${headers.join(', ')}`);
        return;
      }

      const parsed: ParsedPedido[] = json.map(row => {
        const result: ParsedPedido = { cliente: '', fabricante: '', valor: 0, status: 'novo_lead' };
        for (const [original, mapped] of Object.entries(mappedHeaders)) {
          const val = row[original];
          if (mapped === 'valor') {
            result.valor = parseNumber(val);
          } else if (mapped === 'status') {
            const norm = (val?.toString() || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            result.status = STATUS_MAP[norm] || 'novo_lead';
          } else {
            (result as any)[mapped] = val?.toString().trim() || '';
          }
        }
        return result;
      }).filter(r => r.cliente && r.fabricante);

      if (parsed.length === 0) {
        toast.error('Nenhum registro válido encontrado');
        return;
      }

      setRows(parsed);
      setStep('preview');
      toast.success(`${parsed.length} registros encontrados`);
    } catch (err: any) {
      toast.error('Erro ao ler o arquivo: ' + (err.message || 'formato inválido'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      if (!vid) throw new Error('Vendedor não encontrado');

      // Get existing clientes and fabricantes to match by name
      const { data: clientes } = await supabase.from('clientes').select('id, empresa');
      const { data: fabricantes } = await supabase.from('fabricantes').select('id, nome');

      const clienteMap = new Map((clientes ?? []).map(c => [c.empresa.toLowerCase().trim(), c.id]));
      const fabricanteMap = new Map((fabricantes ?? []).map(f => [f.nome.toLowerCase().trim(), f.id]));

      // Create missing clientes
      const missingClientes = [...new Set(rows.map(r => r.cliente))].filter(c => !clienteMap.has(c.toLowerCase().trim()));
      if (missingClientes.length > 0) {
        const { data: newClientes, error } = await supabase.from('clientes').insert(
          missingClientes.map(c => ({ empresa: c, tipo: 'construtora', vendedor_id: vid }))
        ).select('id, empresa');
        if (error) throw error;
        newClientes?.forEach(c => clienteMap.set(c.empresa.toLowerCase().trim(), c.id));
      }

      // Create missing fabricantes
      const missingFabricantes = [...new Set(rows.map(r => r.fabricante))].filter(f => !fabricanteMap.has(f.toLowerCase().trim()));
      if (missingFabricantes.length > 0) {
        const { data: newFabs, error } = await supabase.from('fabricantes').insert(
          missingFabricantes.map(f => ({ nome: f }))
        ).select('id, nome');
        if (error) throw error;
        newFabs?.forEach(f => fabricanteMap.set(f.nome.toLowerCase().trim(), f.id));
      }

      // Insert pedidos in batches
      const BATCH = 200;
      let imported = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map(r => ({
          cliente_id: clienteMap.get(r.cliente.toLowerCase().trim())!,
          fabricante_id: fabricanteMap.get(r.fabricante.toLowerCase().trim())!,
          vendedor_id: vid,
          status: r.status,
          valor_total: r.valor || null,
          observacoes: r.observacoes || null,
          data_pedido: new Date().toISOString().split('T')[0],
        }));
        const { error } = await supabase.from('pedidos').insert(batch);
        if (error) throw error;
        imported += batch.length;
      }

      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast.success(`${imported} negócios importados com sucesso!`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || 'erro desconhecido'));
    } finally {
      setImporting(false);
    }
  };

  const stageLabel = (s: string) => {
    const labels: Record<string, string> = {
      novo_lead: 'Novo Lead', elaboracao: 'Elaboração', enviado: 'Enviado',
      negociacao: 'Negociação', fechamento: 'Fechamento',
    };
    return labels[s] || s;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Negócios
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">Arraste o arquivo aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mb-3">Formatos aceitos: .xlsx, .xls, .csv</p>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 max-w-md mx-auto text-left">
              <p className="font-medium mb-1">Colunas esperadas:</p>
              <p><strong>Cliente</strong> (obrigatório), <strong>Fabricante</strong> (obrigatório), Valor, Status/Etapa, Observações</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
                <Badge variant="outline">{rows.length} registros</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Trocar arquivo
              </Button>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
              Clientes e fabricantes não encontrados serão criados automaticamente.
            </div>

            <div className="flex-1 max-h-[400px] border rounded-lg overflow-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs sticky top-0 bg-muted/50">#</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Cliente</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Fabricante</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Valor</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Etapa</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Obs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{r.cliente}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.fabricante}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.valor ? r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{stageLabel(r.status)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[150px] truncate">{r.observacoes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Mostrando 50 de {rows.length} registros
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Importar {rows.length} negócios</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
