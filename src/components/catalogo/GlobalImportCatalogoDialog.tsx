import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBulkCreatePrecos } from '@/hooks/use-fabricantes';
import { useFabricantes } from '@/hooks/use-clientes';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { validateFile } from '@/lib/file-validation';
import { MappingStep, sanitizeImportedRows, type FieldDef, detectFuzzyMapping } from '@/components/import/MappingStep';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const VISIBLE_FIELDS: FieldDef[] = [
  { key: 'descricao_material', label: 'Descrição', required: true, type: 'text' },
  { key: 'referencia', label: 'Referência', required: false, type: 'text' },
  { key: 'categoria', label: 'Categoria', required: false, type: 'text' },
  { key: 'preco_unitario', label: 'Preço unitário', required: true, type: 'number' },
  { key: 'unidade', label: 'Unidade', required: false, type: 'text' },
  { key: 'fabricante_nome', label: 'Fabricante', required: false, type: 'text' },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFabricanteChange?: (id: string) => void;
}

export function GlobalImportCatalogoDialog({ open, onOpenChange, onFabricanteChange }: Props) {
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fieldDefaultValues, setFieldDefaultValues] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [customColumns, setCustomColumns] = useState<Record<string, string>>({});
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(() => {
    return localStorage.getItem('import_catalogo_autosave') === 'true';
  });
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [selectedFabricanteId, setSelectedFabricanteId] = useState<string>('');
  
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: fabricantes } = useFabricantes();
  const bulk = useBulkCreatePrecos();
  const qc = useQueryClient();

  const reset = () => {
    setRawData([]);
    setHeaders([]);
    setMapping({});
    setFieldDefaultValues({});
    setExtras({});
    setCustomColumns({});
    setFileName('');
    setSelectedFabricanteId('');
    setStep('upload');
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveAsDefault = () => {
    localStorage.setItem('import_catalogo_mapping', JSON.stringify(mapping));
    localStorage.setItem('import_catalogo_defaults', JSON.stringify(fieldDefaultValues));
    localStorage.setItem('import_catalogo_custom', JSON.stringify(customColumns));
    toast.success('Configurações de importação salvas como padrão!');
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

      const autoMap = detectFuzzyMapping(cols, VISIBLE_FIELDS);
      setMapping(autoMap);
      setFieldDefaultValues({});
      setExtras({});
      setCustomColumns({});

      const savedMapping = localStorage.getItem('import_catalogo_mapping');
      const savedDefaults = localStorage.getItem('import_catalogo_defaults');
      const savedCustom = localStorage.getItem('import_catalogo_custom');

      if (savedMapping) {
        const parsed = JSON.parse(savedMapping);
        const mergedMapping = { ...autoMap };
        Object.entries(parsed).forEach(([k, v]) => {
          if (v && cols.includes(v as string)) mergedMapping[k] = v as string;
        });
        setMapping(mergedMapping);
      }
      if (savedDefaults) setFieldDefaultValues(JSON.parse(savedDefaults));
      if (savedCustom) setCustomColumns(JSON.parse(savedCustom));

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

  const canProceedToPreview = Boolean(mapping.descricao_material && mapping.preco_unitario && (mapping.fabricante_nome || selectedFabricanteId));

  const getMappedRows = () => {
    const sanitized = sanitizeImportedRows({ 
      rawData, 
      fields: VISIBLE_FIELDS, 
      mapping, 
      extras, 
      customColumns,
      fieldDefaultValues
    });
    
    const recordsByFab: Record<string, any[]> = {};

    sanitized.forEach(row => {
      let fabId = selectedFabricanteId;
      const fabName = row.fabricante_nome ? String(row.fabricante_nome).toLowerCase().trim() : '';

      if (fabName && fabricantes) {
        const matched = fabricantes.find(f => f.nome.toLowerCase().trim() === fabName);
        if (matched) fabId = matched.id;
      }

      if (!fabId) return;

      if (!recordsByFab[fabId]) recordsByFab[fabId] = [];
      recordsByFab[fabId].push({
        fabricante_id: fabId,
        descricao_material: row.descricao_material,
        referencia: row.referencia || null,
        categoria: row.categoria || null,
        unidade: row.unidade || null,
        preco_unitario: Number(row.preco_unitario),
        vigente: true,
        campos_extras: row.campos_extras || {},
      });
    });

    return recordsByFab;
  };

  const previewData = useMemo(() => {
    if (step !== 'preview') return { recordsByFab: {}, allRecords: [], uniqueFabIds: [] };
    const recordsByFab = getMappedRows();
    const allRecords = Object.values(recordsByFab).flat();
    const uniqueFabIds = Object.keys(recordsByFab);
    return { recordsByFab, allRecords, uniqueFabIds };
  }, [step, mapping, rawData, extras, customColumns, selectedFabricanteId, fabricantes]);

  const handleImport = async () => {
    const { allRecords, uniqueFabIds } = previewData;
    if (allRecords.length === 0) {
      toast.error('Nenhum registro válido encontrado');
      return;
    }

    setImporting(true);
    try {
      const { inserted } = await bulk.mutateAsync(allRecords);
      toast.success(`${inserted} produtos importados com sucesso!`);
      
      if (uniqueFabIds.length === 1 && onFabricanteChange) {
        onFabricanteChange(uniqueFabIds[0]);
      } else if (selectedFabricanteId && onFabricanteChange) {
        onFabricanteChange(selectedFabricanteId);
      }

      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || 'erro desconhecido'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Catálogo (Geral)
          </DialogTitle>
          <DialogDescription>
            Importe produtos e direcione para os fabricantes corretos usando mapeamento inteligente.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div
            className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
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
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Fabricante Padrão (Opcional)</Label>
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
              onSaveAsDefault={saveAsDefault}
              canProceed={canProceedToPreview}
              onNext={() => setStep('preview')}
            />
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
                <Badge variant="outline">{previewData.allRecords.length} produtos válidos</Badge>
                <Badge variant="outline">{previewData.uniqueFabIds.length} fabricantes identificados</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                <X className="h-4 w-4 mr-1" /> Voltar
              </Button>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-xs">Fabricante</TableHead>
                    <TableHead className="text-xs">Preço</TableHead>
                    <TableHead className="text-xs">Categoria</TableHead>
                    <TableHead className="text-xs">Referência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.allRecords.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{r.descricao_material}</TableCell>
                      <TableCell className="text-xs">
                        {fabricantes?.find(f => f.id === r.fabricante_id)?.nome || '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                      <TableCell className="text-xs">{r.categoria || '-'}</TableCell>
                      <TableCell className="text-xs">{r.referencia || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {previewData.allRecords.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Mostrando 50 de {previewData.allRecords.length} produtos
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Importar {previewData.allRecords.length} produtos</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
