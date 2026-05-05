import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { validateFile } from '@/lib/file-validation';
import { MappingStep, sanitizeImportedRows, getExtraDisplayName, type ExtraMappingValue, type FieldDef } from '@/components/import/MappingStep';

const IMPORT_ALLOWED_EXT = ['.xlsx', '.xls', '.csv'];
import {
  FIELDS,
  createEmptyMapping,
  detectImportPedidosMapping,
  getImportedPedidosRows,
  getSheetHeaders,
  type FieldKey,
} from '@/components/import-pedidos/importPedidosUtils';

const VISIBLE_FIELDS: FieldDef[] = FIELDS.map(f => ({ key: f.key, label: f.label, required: f.required }));

interface ImportPedidosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportPedidosDialog({ open, onOpenChange }: ImportPedidosDialogProps) {
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string | string[]>>(createEmptyMapping());
  const [fieldDefaultValues, setFieldDefaultValues] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, ExtraMappingValue>>({});
  const [customColumns, setCustomColumns] = useState<Record<string, string>>({});
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(() => {
    return localStorage.getItem('import_pedidos_autosave') === 'true';
  });
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setRawData([]);
    setHeaders([]);
    setMapping(createEmptyMapping());
    setFieldDefaultValues({});
    setExtras({});
    setCustomColumns({});
    setFieldLabels({});
    setFileName('');
    setStep('upload');
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveAsDefault = (active: boolean) => {
    setIsAutoSaveEnabled(active);
    localStorage.setItem('import_pedidos_autosave', String(active));
    
    if (active) {
      localStorage.setItem('import_pedidos_mapping', JSON.stringify(mapping));
      localStorage.setItem('import_pedidos_defaults', JSON.stringify(fieldDefaultValues));
      localStorage.setItem('import_pedidos_custom', JSON.stringify(customColumns));
      localStorage.setItem('import_pedidos_labels', JSON.stringify(fieldLabels));
      toast.success('Mapeamento e valores padrões serão salvos automaticamente.');
    } else {
      toast.info('Alterações não serão salvas como padrão.');
    }
  };

  const loadDefaults = () => {
    const savedMapping = localStorage.getItem('import_pedidos_mapping');
    const savedDefaults = localStorage.getItem('import_pedidos_defaults');
    const savedCustom = localStorage.getItem('import_pedidos_custom');
    const savedLabels = localStorage.getItem('import_pedidos_labels');
    
    if (savedMapping) setMapping(JSON.parse(savedMapping));
    if (savedDefaults) setFieldDefaultValues(JSON.parse(savedDefaults));
    if (savedCustom) setCustomColumns(JSON.parse(savedCustom));
    if (savedLabels) setFieldLabels(JSON.parse(savedLabels));
    
    // Sincronizar labels com as configurações globais da tabela se existirem
    const globalLabels = localStorage.getItem('pedidos_custom_labels');
    if (globalLabels) {
      const parsedGlobal = JSON.parse(globalLabels);
      setFieldLabels(prev => ({ ...prev, ...parsedGlobal }));
    }
  };

  const handleFile = async (file: File) => {
    if (!validateFile(file, { allowedExtensions: IMPORT_ALLOWED_EXT })) return;
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

      const cols = getSheetHeaders(json);
      setRawData(json);
      setHeaders(cols);

      const autoMap = detectImportPedidosMapping(cols, json);
      setMapping(autoMap);
      setExtras({});
      setCustomColumns({});
      setFieldDefaultValues({});
      
      // Carregar padrões salvos se existirem
      const savedMapping = localStorage.getItem('import_pedidos_mapping');
      const savedDefaults = localStorage.getItem('import_pedidos_defaults');
      const savedCustom = localStorage.getItem('import_pedidos_custom');
      const savedLabels = localStorage.getItem('import_pedidos_labels');
      
      if (savedMapping) {
        const parsed = JSON.parse(savedMapping);
        // Só aplica se as colunas existirem no arquivo atual
        const mergedMapping = { ...autoMap };
        Object.entries(parsed).forEach(([key, val]) => {
          if (val && cols.includes(val as string)) {
            mergedMapping[key as FieldKey] = val as string;
          }
        });
        setMapping(mergedMapping);
      }
      
      if (savedDefaults) setFieldDefaultValues(JSON.parse(savedDefaults));
      if (savedCustom) setCustomColumns(JSON.parse(savedCustom));
      if (savedLabels) setFieldLabels(JSON.parse(savedLabels));

      // Sincronizar labels com as configurações globais da tabela se existirem
      const globalLabels = localStorage.getItem('pedidos_custom_labels');
      if (globalLabels) {
        const parsedGlobal = JSON.parse(globalLabels);
        setFieldLabels(prev => ({ ...prev, ...parsedGlobal }));
      }

      setStep('mapping');
      toast.success(`${json.length} linhas lidas. Confira o mapeamento de colunas.`);
    } catch (err: any) {
      toast.error('Erro ao ler o arquivo: ' + (err.message || 'formato inválido'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const canProceedToPreview = Boolean(mapping.cliente || mapping.fabricante);

  const getMappedRows = () => {
    const sanitized = sanitizeImportedRows({ 
      rawData, 
      fields: VISIBLE_FIELDS, 
      mapping, 
      extras, 
      customColumns, 
      fieldDefaultValues, 
      fieldLabels 
    });
    
    const remappedRows = (sanitized as any[]).map(item => {
      const { campos_extras, ...rest } = item;
      return {
        ...rest,
        ...(campos_extras || {})
      };
    });

    return getImportedPedidosRows(
      remappedRows,
      Object.fromEntries(VISIBLE_FIELDS.map((field) => [field.key, field.key])) as Record<FieldKey, any>,
      extras,
      customColumns
    );
  };

  const previewRows = useMemo(
    () => (step === 'preview' ? getMappedRows() : []),
    [step, mapping, rawData, extras, customColumns]
  );

  const extraFieldNames = useMemo(
    () => Array.from(new Set([
      ...Object.entries(extras).map(([col, value]) => getExtraDisplayName(col, value).trim()),
      ...Object.keys(customColumns).map(n => n.trim()),
    ].filter(Boolean))),
    [extras, customColumns]
  );

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

      // Atualizar nomes das colunas (padrão e extras) para salvar como colunas na página de Negócios
      const savedAllColumns = localStorage.getItem('pedidos_all_columns');
      let currentColumns = savedAllColumns ? JSON.parse(savedAllColumns) : [...VISIBLE_FIELDS.map(f => ({ id: f.key, label: f.label, type: 'text' }))];
      let hasChanges = false;

      // Atualizar labels dos campos padrão que foram renomeados
      Object.entries(fieldLabels).forEach(([key, label]) => {
        const col = currentColumns.find((c: any) => c.id === key);
        if (col && col.label !== label) {
          col.label = label;
          hasChanges = true;
        }
      });

      // A funcionalidade de adicionar automaticamente colunas extras foi removida
      // para evitar a criação de colunas indesejadas (ex: endereço obra_1).
      // Os usuários podem adicionar colunas manualmente se necessário nas configurações de colunas.


      if (hasChanges) {
        localStorage.setItem('pedidos_all_columns', JSON.stringify(currentColumns));
        // Forçar atualização na página de Negócios se o hook useTableSettings estiver ouvindo
        window.dispatchEvent(new Event('storage'));
      }

      const { data: clientes } = await supabase.from('clientes').select('id, empresa');
      const { data: fabricantes } = await supabase.from('fabricantes').select('id, nome');

      const clienteMap = new Map((clientes ?? []).map(c => [c.empresa.toLowerCase().trim(), c.id]));
      const fabricanteMap = new Map((fabricantes ?? []).map(f => [f.nome.toLowerCase().trim(), f.id]));

      const missingClientes = [...new Set(rows.map(r => r.cliente))].filter(c => !clienteMap.has(c.toLowerCase().trim()));
      if (missingClientes.length > 0) {
        const { data: newClientes, error } = await supabase.from('clientes').insert(
          missingClientes.map(c => ({ empresa: c, tipo: 'construtora', usuario_id: vid }))
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
          usuario_id: vid,
          status: r.status,
          valor_total: r.valor || null,
          observacoes: r.observacoes || null,
          campos_extras: r.campos_extras || {},
          data_pedido: (() => {
            if (!r.data_pedido) return new Date().toISOString().split('T')[0];
            const d = new Date(r.data_pedido);
            return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
          })(),
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto flex flex-col">
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
              <p className="font-medium mb-1">Qualquer planilha é aceita!</p>
              <p>Colunas que não existirem no sistema podem ser adicionadas como "novas" durante o mapeamento.</p>
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
          <MappingStep
            fileName={fileName}
            rawData={rawData}
            headers={headers}
            mapping={mapping}
            setMapping={setMapping as React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>}
            fieldDefaultValues={fieldDefaultValues}
            setFieldDefaultValues={setFieldDefaultValues}
            extras={extras}
            setExtras={setExtras}
            customColumns={customColumns}
            setCustomColumns={setCustomColumns}
            fieldLabels={fieldLabels}
            setFieldLabels={setFieldLabels}
            visibleFields={VISIBLE_FIELDS}
            onReset={reset}
            onAutoDetect={() => { setMapping(detectImportPedidosMapping(headers, rawData)); setExtras({}); }}
            onClearAll={() => { setMapping(createEmptyMapping()); setExtras({}); setCustomColumns({}); setFieldDefaultValues({}); }}
            onSaveAsDefault={saveAsDefault}
            isAutoSaveEnabled={isAutoSaveEnabled}
            canProceed={canProceedToPreview}
            onNext={() => {
              const mapped = getMappedRows();
              if (mapped.length === 0) {
                toast.error('Nenhum registro válido com o mapeamento atual');
                return;
              }
              setStep('preview');
            }}
          />
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
                <Badge variant="outline">{previewRows.length} registros válidos</Badge>
                {extraFieldNames.length > 0 && (
                  <Badge className="bg-accent text-accent-foreground border-accent">
                    +{extraFieldNames.length} extra{extraFieldNames.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                <X className="h-4 w-4 mr-1" /> Voltar ao mapeamento
              </Button>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Clientes e fabricantes não encontrados serão criados automaticamente.
              {extraFieldNames.length > 0 && (
                <span>Extras: {extraFieldNames.join(', ')}.</span>
              )}
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs sticky top-0 bg-muted/50">#</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Cliente</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Fabricante</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Valor</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Etapa</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Data</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Obs</TableHead>
                    {extraFieldNames.map(name => (
                      <TableHead key={name} className="text-xs sticky top-0 bg-accent/40 text-accent-foreground whitespace-nowrap">
                        {name} <span className="text-[10px] opacity-70">(extra)</span>
                      </TableHead>
                    ))}
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
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.data_pedido ? new Date(r.data_pedido).toLocaleDateString('pt-BR') : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[150px] truncate">{r.observacoes || '-'}</TableCell>
                      {extraFieldNames.map(name => (
                        <TableCell key={name} className="text-xs whitespace-nowrap max-w-[200px] truncate bg-accent/10">
                          {r.campos_extras?.[name] || '-'}
                        </TableCell>
                      ))}
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
