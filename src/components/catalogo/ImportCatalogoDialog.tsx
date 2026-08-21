import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useBulkCreatePrecos } from '@/hooks/use-fabricantes';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { validateFile } from '@/lib/file-validation';
import { ImportInstructionsStep, type TemplateField } from '@/components/import/ImportInstructionsStep';
import { MappingStep, sanitizeImportedRows, type ExtraMappingValue, type FieldDef, detectFuzzyMapping } from '@/components/import/MappingStep';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fabricanteId: string;
  fabricanteNome?: string;
}

const VISIBLE_FIELDS: FieldDef[] = [
  { key: 'descricao_material', label: 'Produto', required: true, type: 'text' },
  { key: 'imagem_url', label: 'Fotos', required: false, type: 'text' },
  { key: 'estoque_disponivel', label: 'Estoque Disponível', required: false, type: 'number' },
  { key: 'unidade', label: 'Unidade de Medida', required: false, type: 'text' },
  { key: 'preco_unitario', label: 'Preço de Varejo', required: true, type: 'number' },
  { key: 'referencia', label: 'Referência', required: false, type: 'text' },
  { key: 'categoria', label: 'Categoria', required: false, type: 'text' },
];

const FIELD_EXAMPLES: Record<string, string> = {
  descricao_material: 'Tubo PVC 100mm',
  imagem_url: 'https://exemplo.com/foto.jpg',
  estoque_disponivel: '50',
  unidade: 'UN',
  preco_unitario: '45.90',
  referencia: 'REF-1234',
  categoria: 'Tubos e Conexões',
};
const TEMPLATE_FIELDS: TemplateField[] = VISIBLE_FIELDS.map(f => ({ label: f.label, example: FIELD_EXAMPLES[f.key] }));

export function ImportCatalogoDialog({ open, onOpenChange, fabricanteId, fabricanteNome }: Props) {
  const [step, setStep] = useState<'instructions' | 'upload' | 'mapping' | 'preview'>('instructions');
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | string[]>>({});
  const [fieldDefaultValues, setFieldDefaultValues] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, ExtraMappingValue>>({});
  const [customColumns, setCustomColumns] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulk = useBulkCreatePrecos();

  const reset = () => {
    setStep('instructions');
    setRawData([]);
    setHeaders([]);
    setMapping({});
    setFieldDefaultValues({});
    setExtras({});
    setCustomColumns({});
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    if (!validateFile(file, { allowedExtensions: ['.xlsx', '.xls', '.csv'] })) return;
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      if (json.length === 0) {
        toast.error('Arquivo vazio ou sem dados válidos');
        return;
      }

      const cols = Array.from(new Set(json.flatMap((row) => Object.keys(row))));
      setRawData(json);
      setHeaders(cols);
      setMapping(detectFuzzyMapping(cols, VISIBLE_FIELDS));
      setFieldDefaultValues({});
      setExtras({});
      setCustomColumns({});
      setStep('mapping');
      toast.success(`${json.length} linhas lidas. Confira o mapeamento.`);
    } catch (err: any) {
      toast.error('Erro ao ler o arquivo: ' + (err.message || 'formato inválido'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const canProceedToPreview = Boolean(mapping.descricao_material && mapping.preco_unitario);

  const previewData = useMemo(() => {
    if (step !== 'preview') return { records: [], ignoredCount: 0 };
    const sanitized = sanitizeImportedRows({
      rawData,
      fields: VISIBLE_FIELDS,
      mapping,
      extras,
      customColumns,
      fieldDefaultValues,
    });

    let ignoredCount = 0;
    const records = sanitized.reduce<any[]>((acc, row) => {
      const isValid = row.descricao_material && Number(row.preco_unitario) > 0;
      if (!isValid) { ignoredCount++; return acc; }
      acc.push({
        fabricante_id: fabricanteId,
        descricao_material: row.descricao_material,
        referencia: row.referencia || null,
        categoria: row.categoria || null,
        unidade: row.unidade || null,
        imagem_url: row.imagem_url || null,
        estoque_disponivel: row.estoque_disponivel !== undefined && row.estoque_disponivel !== '' ? Number(row.estoque_disponivel) : null,
        preco_unitario: Number(row.preco_unitario),
        vigente: true,
        campos_extras: row.campos_extras || {},
      });
      return acc;
    }, []);

    return { records, ignoredCount };
  }, [step, rawData, mapping, extras, customColumns, fieldDefaultValues, fabricanteId]);

  const handleImport = async () => {
    if (previewData.records.length === 0) {
      toast.error('Nenhum registro válido encontrado');
      return;
    }

    setImporting(true);
    try {
      const { inserted } = await bulk.mutateAsync(previewData.records);
      toast.success(`${inserted} produto(s) importado(s)!`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Falha na importação');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      {/* `dvh` e não `vh`: no celular `100vh` mede a tela COM a barra de endereço
          escondida, então o rodapé do diálogo fica atrás da barra do navegador. */}
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-muted/30 shrink-0 border-b flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2.5 text-foreground font-bold text-lg">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span>Importar Catálogo</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {fabricanteNome ? `Fabricante: ${fabricanteNome}` : 'Importação em massa de produtos via planilha'}
                </span>
              </div>
            </DialogTitle>
          </div>

          {(step === 'mapping' || step === 'preview') && (
            <div className="flex items-center gap-4 bg-background/50 px-4 py-2 rounded-xl border border-border/50 shadow-sm w-fit">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all",
                  step === 'mapping' ? "bg-primary border-primary text-primary-foreground shadow-sm" : "bg-muted border-border text-muted-foreground"
                )}>
                  1
                </div>
                <span className={cn("text-[11px] font-bold uppercase tracking-wider", step === 'mapping' ? "text-primary" : "text-muted-foreground")}>
                  Mapeamento
                </span>
              </div>

              <ArrowRight className="h-3 w-3 text-muted-foreground/30" />

              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all",
                  step === 'preview' ? "bg-primary border-primary text-primary-foreground shadow-sm" : "bg-muted border-border text-muted-foreground"
                )}>
                  2
                </div>
                <span className={cn("text-[11px] font-bold uppercase tracking-wider", step === 'preview' ? "text-primary" : "text-muted-foreground")}>
                  Revisão
                </span>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {step === 'instructions' && (
            <ImportInstructionsStep
              templateFileName="modelo-importacao-catalogo.xlsx"
              templateFields={TEMPLATE_FIELDS}
              extraTips={['Produto e Preço de Varejo precisam estar preenchidos em cada linha.']}
              onContinue={() => setStep('upload')}
            />
          )}

          {step === 'upload' && (
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 sm:p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">Arraste a planilha aqui ou clique para selecionar</p>
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

          {step === 'mapping' && (
            <div className="bg-muted/30 rounded-xl border border-border/50 shadow-sm overflow-hidden">
              <MappingStep
                fileName={fileName}
                rawData={rawData}
                headers={headers}
                mapping={mapping}
                setMapping={setMapping as any}
                fieldDefaultValues={fieldDefaultValues}
                setFieldDefaultValues={setFieldDefaultValues}
                extras={extras}
                setExtras={setExtras}
                customColumns={customColumns}
                setCustomColumns={setCustomColumns}
                visibleFields={VISIBLE_FIELDS}
                onReset={reset}
                onAutoDetect={() => { setMapping(detectFuzzyMapping(headers, VISIBLE_FIELDS)); setExtras({}); }}
                onClearAll={() => { setMapping({}); setExtras({}); setCustomColumns({}); setFieldDefaultValues({}); }}
                canProceed={canProceedToPreview}
                onNext={() => setStep('preview')}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
                <Badge variant="outline">{previewData.records.length} produtos válidos</Badge>
                {previewData.ignoredCount > 0 && (
                  <Badge variant="outline">{previewData.ignoredCount} linhas ignoradas</Badge>
                )}
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                      <TableHead className="text-xs">Preço</TableHead>
                      <TableHead className="text-xs">Categoria</TableHead>
                      <TableHead className="text-xs">Referência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.records.slice(0, 50).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs font-medium">{r.descricao_material}</TableCell>
                        <TableCell className="text-xs">
                          {r.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </TableCell>
                        <TableCell className="text-xs">{r.categoria || '-'}</TableCell>
                        <TableCell className="text-xs">{r.referencia || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewData.records.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Mostrando 50 de {previewData.records.length} produtos
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {step === 'mapping' && (
          <div className="flex justify-end items-center gap-3 border-t bg-muted/30 px-6 py-4 shrink-0">
            <Button variant="ghost" onClick={reset}>Cancelar</Button>
            <Button
              onClick={() => setStep('preview')}
              className="h-10 px-6 font-bold shadow-lg shadow-primary/20"
              disabled={!canProceedToPreview}
            >
              Revisar Importação <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex justify-end items-center gap-3 border-t bg-muted/30 px-6 py-4 shrink-0">
            <Button variant="ghost" onClick={() => setStep('mapping')} disabled={importing}>Voltar</Button>
            <Button onClick={handleImport} disabled={importing} className="h-10 px-6 font-bold shadow-lg shadow-primary/20">
              {importing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Importar {previewData.records.length} produtos</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
