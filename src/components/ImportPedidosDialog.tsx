import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

const STATUS_MAP: Record<string, string> = {
  'novo lead': 'novo_lead', 'novo_lead': 'novo_lead', 'novo': 'novo_lead', 'lead': 'novo_lead',
  'elaboração': 'elaboracao', 'elaboracao': 'elaboracao', 'elaborando': 'elaboracao',
  'enviado': 'enviado',
  'negociação': 'negociacao', 'negociacao': 'negociacao',
  'fechamento': 'fechamento', 'fechado': 'fechamento', 'ganho': 'fechamento',
};

type FieldKey = 'cliente' | 'fabricante' | 'valor' | 'observacoes' | 'status';

const FIELDS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: 'cliente', label: 'Cliente', required: true },
  { key: 'fabricante', label: 'Fabricante', required: true },
  { key: 'valor', label: 'Valor', required: false },
  { key: 'status', label: 'Etapa/Status', required: false },
  { key: 'observacoes', label: 'Observações', required: false },
];

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
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ cliente: '', fabricante: '', valor: '', observacoes: '', status: '' });
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setRawData([]);
    setHeaders([]);
    setMapping({ cliente: '', fabricante: '', valor: '', observacoes: '', status: '' });
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

      const cols = Object.keys(json[0]);
      setRawData(json);
      setHeaders(cols);

      // Auto-detect mapping
      const autoMap: Record<FieldKey, string> = { cliente: '', fabricante: '', valor: '', observacoes: '', status: '' };
      const used = new Set<string>();
      const patterns: [RegExp[], FieldKey][] = [
        [[/cliente/i, /empresa/i, /nome.*cliente/i, /razao/i], 'cliente'],
        [[/fabricante/i, /fornecedor/i, /fabrica/i], 'fabricante'],
        [[/valor/i, /total/i, /preco/i, /preço/i], 'valor'],
        [[/obs/i, /observa/i, /notas/i, /descri/i], 'observacoes'],
        [[/status/i, /etapa/i, /fase/i, /estagio/i], 'status'],
      ];
      for (const [regexps, field] of patterns) {
        for (const col of cols) {
          if (used.has(col)) continue;
          const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (regexps.some(r => r.test(norm))) {
            autoMap[field] = col;
            used.add(col);
            break;
          }
        }
      }
      setMapping(autoMap);
      // Se mapeou as obrigatórias automaticamente, vai direto pro preview
      if (autoMap.cliente && autoMap.fabricante) {
        setStep('preview');
        toast.success(`${json.length} registros mapeados automaticamente`);
      } else {
        setStep('mapping');
        toast.info(`Mapeie as colunas obrigatórias (Cliente e Fabricante)`);
      }
    } catch (err: any) {
      toast.error('Erro ao ler o arquivo: ' + (err.message || 'formato inválido'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const canProceedToPreview = mapping.cliente && mapping.fabricante;

  const getMappedRows = () => {
    return rawData.map(row => {
      const cliente = mapping.cliente ? (row[mapping.cliente]?.toString().trim() || '') : '';
      const fabricante = mapping.fabricante ? (row[mapping.fabricante]?.toString().trim() || '') : '';
      const valor = mapping.valor ? parseNumber(row[mapping.valor]) : 0;
      const observacoes = mapping.observacoes ? (row[mapping.observacoes]?.toString().trim() || '') : '';
      let status = 'novo_lead';
      if (mapping.status) {
        const norm = (row[mapping.status]?.toString() || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        status = STATUS_MAP[norm] || 'novo_lead';
      }
      return { cliente, fabricante, valor, observacoes, status };
    }).filter(r => r.cliente && r.fabricante);
  };

  const handleImport = async () => {
    const rows = getMappedRows();
    if (rows.length === 0) {
      toast.error('Nenhum registro válido após o mapeamento');
      return;
    }
    setImporting(true);
    try {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      if (!vid) throw new Error('Vendedor não encontrado');

      const { data: clientes } = await supabase.from('clientes').select('id, empresa');
      const { data: fabricantes } = await supabase.from('fabricantes').select('id, nome');

      const clienteMap = new Map((clientes ?? []).map(c => [c.empresa.toLowerCase().trim(), c.id]));
      const fabricanteMap = new Map((fabricantes ?? []).map(f => [f.nome.toLowerCase().trim(), f.id]));

      const missingClientes = [...new Set(rows.map(r => r.cliente))].filter(c => !clienteMap.has(c.toLowerCase().trim()));
      if (missingClientes.length > 0) {
        const { data: newClientes, error } = await supabase.from('clientes').insert(
          missingClientes.map(c => ({ empresa: c, tipo: 'construtora', vendedor_id: vid }))
        ).select('id, empresa');
        if (error) throw error;
        newClientes?.forEach(c => clienteMap.set(c.empresa.toLowerCase().trim(), c.id));
      }

      const missingFabricantes = [...new Set(rows.map(r => r.fabricante))].filter(f => !fabricanteMap.has(f.toLowerCase().trim()));
      if (missingFabricantes.length > 0) {
        const { data: newFabs, error } = await supabase.from('fabricantes').insert(
          missingFabricantes.map(f => ({ nome: f }))
        ).select('id, nome');
        if (error) throw error;
        newFabs?.forEach(f => fabricanteMap.set(f.nome.toLowerCase().trim(), f.id));
      }

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

  const previewRows = step === 'preview' ? getMappedRows() : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Negócios
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Badge variant={step === 'upload' ? 'default' : 'secondary'} className="text-xs">1. Upload</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 'mapping' ? 'default' : 'secondary'} className="text-xs">2. Mapear Colunas</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 'preview' ? 'default' : 'secondary'} className="text-xs">3. Confirmar</Badge>
        </div>

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
              <p className="font-medium mb-1">Qualquer planilha é aceita!</p>
              <p>Na próxima etapa, você poderá mapear as colunas da sua planilha para os campos do sistema.</p>
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

        {step === 'mapping' && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {fileName} — {rawData.length} linhas
              </Badge>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Trocar arquivo
              </Button>
            </div>

            <div className="text-sm font-medium text-foreground">Mapeie as colunas da sua planilha:</div>

            <div className="grid gap-3">
              {FIELDS.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <div className="w-36 text-sm flex items-center gap-1.5">
                    {field.label}
                    {field.required && <span className="text-destructive text-xs">*</span>}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Select
                    value={mapping[field.key] || '_none_'}
                    onValueChange={(v) => setMapping(prev => ({ ...prev, [field.key]: v === '_none_' ? '' : v }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar coluna..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none_">— Não mapear —</SelectItem>
                      {headers.map(h => (
                        <SelectItem key={h} value={h}>
                          {h}
                          <span className="ml-2 text-muted-foreground text-xs">
                            (ex: {rawData[0]?.[h]?.toString().slice(0, 30) || '—'})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview sample from raw data */}
            <div className="flex-1 max-h-[200px] border rounded-lg overflow-auto mt-2">
              <Table className="min-w-[400px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs sticky top-0 bg-muted/50">#</TableHead>
                    {headers.slice(0, 6).map(h => (
                      <TableHead key={h} className="text-xs sticky top-0 bg-muted/50 whitespace-nowrap">{h}</TableHead>
                    ))}
                    {headers.length > 6 && <TableHead className="text-xs sticky top-0 bg-muted/50">...</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawData.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      {headers.slice(0, 6).map(h => (
                        <TableCell key={h} className="text-xs whitespace-nowrap max-w-[150px] truncate">
                          {row[h]?.toString() || '—'}
                        </TableCell>
                      ))}
                      {headers.length > 6 && <TableCell className="text-xs text-muted-foreground">…</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button
                disabled={!canProceedToPreview}
                onClick={() => {
                  const mapped = getMappedRows();
                  if (mapped.length === 0) {
                    toast.error('Nenhum registro válido com o mapeamento atual');
                    return;
                  }
                  setStep('preview');
                }}
              >
                Próximo — Pré-visualizar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
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
                <Badge variant="outline">{previewRows.length} registros válidos</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                <X className="h-4 w-4 mr-1" /> Voltar ao mapeamento
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
                  {previewRows.slice(0, 50).map((r, i) => (
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
              {previewRows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Mostrando 50 de {previewRows.length} registros
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Importar {previewRows.length} negócios</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
