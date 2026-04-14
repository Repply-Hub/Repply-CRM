import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

interface ParsedRow {
  empresa: string;
  tipo: string;
  cnpj?: string;
  razao_social?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  nome_contato?: string;
}

const COLUMN_MAP: [RegExp, keyof ParsedRow][] = [
  // Order matters: more specific patterns first
  [/^(razao\s*social|razao_social)$/, 'razao_social'],
  [/^(nome\s*fantasia|nome_fantasia)$/, 'empresa'],
  [/^(empresa|nome)$/, 'empresa'],
  [/^(tipo|segmento|categoria)$/, 'tipo'],
  [/^(cnpj|cpf|cpf\s*\/?\s*cnpj)$/, 'cnpj'],
  [/^(e-?mail)$/, 'email'],
  [/^(telefone|phone|fone|celular|tel)$/, 'telefone'],
  [/^(endereco|endere[cç]o|address)$/, 'endereco'],
  [/^(contato|nome\s*contato|nome_contato|responsavel|responsável)$/, 'nome_contato'],
];

const TIPO_MAP: Record<string, string> = {
  construtora: 'construtora',
  loja: 'loja',
  'pessoa física': 'pessoa_fisica',
  'pessoa fisica': 'pessoa_fisica',
  pessoa_fisica: 'pessoa_fisica',
  pf: 'pessoa_fisica',
  condomínio: 'condominio',
  condominio: 'condominio',
  hospital: 'hospital',
  distribuidor: 'distribuidor',
  hotel: 'hotel',
  escola: 'escola',
  instalador: 'instalador',
};

function normalizeHeader(h: string): keyof ParsedRow | null {
  const key = h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [pattern, field] of COLUMN_MAP) {
    if (pattern.test(key)) return field;
  }
  return null;
}

interface ImportClientesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  target?: 'empresas' | 'contatos';
}

export function ImportClientesDialog({ open: controlledOpen, onOpenChange: controlledOnOpenChange, hideTrigger, target = 'empresas' }: ImportClientesDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [rows, setRows] = useState<ParsedRow[]>([]);
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
      const mappedHeaders: Record<string, keyof ParsedRow> = {};
      const usedFields = new Set<keyof ParsedRow>();
      
      // First pass: exact regex match
      headers.forEach(h => {
        const mapped = normalizeHeader(h);
        if (mapped && !usedFields.has(mapped)) {
          mappedHeaders[h] = mapped;
          usedFields.add(mapped);
        }
      });

      // Second pass: partial/fuzzy match for unmapped headers
      const partialMap: [string, keyof ParsedRow][] = [
        ['empresa', 'empresa'], ['nome', 'empresa'], ['razao', 'razao_social'],
        ['cnpj', 'cnpj'], ['cpf', 'cnpj'], ['mail', 'email'],
        ['tel', 'telefone'], ['fone', 'telefone'], ['ender', 'endereco'],
        ['contato', 'nome_contato'], ['responsavel', 'nome_contato'],
      ];
      headers.forEach(h => {
        if (mappedHeaders[h]) return;
        const norm = h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const [partial, field] of partialMap) {
          if (!usedFields.has(field) && norm.includes(partial)) {
            mappedHeaders[h] = field;
            usedFields.add(field);
            break;
          }
        }
      });

      const unmapped = headers.filter(h => !mappedHeaders[h]);
      if (unmapped.length > 0) {
        console.log('Colunas não mapeadas:', unmapped);
      }
      console.log('Mapeamento de colunas:', mappedHeaders);

      if (!Object.values(mappedHeaders).includes('empresa')) {
        toast.error(`Coluna "Empresa" ou "Nome" não encontrada. Colunas do arquivo: ${headers.join(', ')}`);
        return;
      }

      const parsed: ParsedRow[] = json.map(row => {
        const result: ParsedRow = { empresa: '', tipo: 'construtora' };
        for (const [original, mapped] of Object.entries(mappedHeaders)) {
          const val = row[original]?.toString().trim() || '';
          if (mapped === 'tipo') {
            result.tipo = TIPO_MAP[val.toLowerCase()] || 'construtora';
          } else {
            (result as any)[mapped] = val || undefined;
          }
        }
        return result;
      }).filter(r => r.empresa);

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
      const BATCH = 500;
      let imported = 0;

      for (let i = 0; i < rows.length; i += BATCH) {
        if (target === 'contatos') {
          const batch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa || 'Sem empresa',
            nome_contato: r.nome_contato || null,
            email: r.email || null,
            telefone: r.telefone || null,
            cargo: null as string | null,
            vendedor_id: vid,
          }));
          const { error } = await supabase.from('contatos').insert(batch);
          if (error) throw error;
        } else {
          const batch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa,
            tipo: r.tipo || 'construtora',
            cnpj: r.cnpj || null,
            razao_social: r.razao_social || null,
            email: r.email || null,
            telefone: r.telefone || null,
            endereco: r.endereco || null,
            nome_contato: r.nome_contato || null,
            vendedor_id: vid,
          }));
          const { error } = await supabase.from('clientes').insert(batch);
          if (error) throw error;
        }
        imported += rows.slice(i, i + BATCH).length;
      }

      qc.invalidateQueries({ queryKey: [target === 'contatos' ? 'contatos' : 'clientes'] });
      toast.success(`${imported} ${target === 'contatos' ? 'contatos' : 'clientes'} importados com sucesso!`);
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || 'erro desconhecido'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-1" /> Importar
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar {target === 'contatos' ? 'Contatos' : 'Empresas'}
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
            <p className="text-xs text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv</p>
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
              Verifique os dados antes de importar. Colunas reconhecidas automaticamente.
            </div>

            <div className="flex-1 max-h-[400px] border rounded-lg overflow-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs sticky top-0 bg-muted/50">#</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Empresa</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Tipo</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">CNPJ</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Email</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Telefone</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Endereço</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{r.empresa}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.tipo}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.cnpj || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.email || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.telefone || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[200px] truncate">{r.endereco || '-'}</TableCell>
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
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Importar {rows.length} {target === 'contatos' ? 'contatos' : 'empresas'}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
