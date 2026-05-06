import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X, ArrowRight, Plus, Pencil, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const [importProgress, setImportProgress] = useState(0);
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  
  // Obter colunas existentes para reutilização no mapeamento
  const existingColumns = useMemo(() => {
    const saved = localStorage.getItem('pedidos_all_columns');
    if (saved) {
      try {
        return JSON.parse(saved) as Array<{ id: string; label: string; isCustom?: boolean }>;
      } catch (e) {
        return [];
      }
    }
    return [];
  }, [open]);

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
    setImportProgress(0);
    setIgnoredColumns([]);
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
      fieldLabels,
      existingColumns
    });
    
    // Garantir que os campos básicos existam no objeto de retorno para o preview/import
    return (sanitized as any[]).map(item => {
      const { campos_extras, ...rest } = item;
      return {
        negocio: rest.negocio || '',
        cliente: rest.cliente || '',
        contato: rest.contato || '',
        obra: rest.obra || '',
        fabricante: rest.fabricante || '',
        valor: typeof rest.valor === 'number' ? rest.valor : 0,
        vendedor: rest.vendedor || '',
        status: rest.status || 'novo_lead',
        data_pedido: rest.data_pedido || undefined,
        observacoes: rest.observacoes || '',
        campos_extras: campos_extras || {}
      };
    });
  };

  const previewRows = useMemo(
    () => {
      if (step !== 'preview') return [];
      
      const rows = getMappedRows();
      
      // Identificar colunas ignoradas
      const mappedColumns = new Set<string>();
      Object.values(mapping).forEach(val => {
        if (typeof val === 'string' && val) mappedColumns.add(val);
        else if (Array.isArray(val)) val.forEach(v => mappedColumns.add(v));
      });
      Object.values(extras).forEach(val => {
        if (typeof val === 'string' && val) mappedColumns.add(val);
      });
      
      const ignored = headers.filter(h => h && !mappedColumns.has(h));
      setIgnoredColumns(ignored);
      
      return rows;
    },
    [step, mapping, rawData, extras, customColumns, fieldDefaultValues, fieldLabels, headers]
  );

  const extraFieldInfos = useMemo(
    () => {
      const infos: Array<{ id: string; label: string }> = [];
      
      Object.entries(extras).forEach(([col, value]) => {
        const label = getExtraDisplayName(col, value).trim();
        // Tenta encontrar se já existe um ID mapeado (via Label::ID)
        const id = (typeof value === 'string' && value.includes('::')) 
          ? value.split('::')[1] 
          : label;
        
        if (label) infos.push({ id, label });
      });

      Object.keys(customColumns).forEach(name => {
        if (name.trim()) infos.push({ id: name.trim(), label: name.trim() });
      });

      // Remover duplicatas de ID
      const unique: Array<{ id: string; label: string }> = [];
      const usedIds = new Set<string>();
      infos.forEach(info => {
        if (!usedIds.has(info.id)) {
          unique.push(info);
          usedIds.add(info.id);
        }
      });
      return unique;
    },
    [extras, customColumns]
  );

  const handleImport = async () => {
    const allRows = getMappedRows();
    const rows = allRows.filter(r => r.cliente && r.fabricante);
    
    if (rows.length === 0) {
      toast.error('Nenhum registro válido para importar. Verifique se as colunas de Cliente e Fabricante estão mapeadas e preenchidas.');
      return;
    }
    
    if (rows.length < allRows.length) {
      toast.info(`${allRows.length - rows.length} linhas foram ignoradas por não possuírem Cliente ou Fabricante.`);
    }
    setImporting(true);
    setImportProgress(0);
    try {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      if (!vid) throw new Error('Vendedor não encontrado');

      // Atualizar nomes das colunas (padrão e extras) para salvar como colunas na página de Negócios
      const savedAllColumns = localStorage.getItem('pedidos_all_columns');
      let currentColumns: any[] = savedAllColumns ? JSON.parse(savedAllColumns) : [...VISIBLE_FIELDS.map(f => ({ id: f.key, label: f.label, type: 'text' }))];
      const savedVisible = localStorage.getItem('pedidos_visible_columns');
      let currentVisible: string[] = savedVisible ? JSON.parse(savedVisible) : currentColumns.map((c: any) => c.id);
      let hasChanges = false;
      let visibleChanged = false;

      // Garantir que as colunas padrão existem no currentColumns (sem duplicar)
      VISIBLE_FIELDS.forEach(f => {
        if (!currentColumns.some(c => c.id === f.key)) {
          currentColumns.push({ id: f.key, label: f.label, type: 'text' });
          hasChanges = true;
        }
      });

      // Atualizar labels dos campos padrão que foram renomeados
      Object.entries(fieldLabels).forEach(([key, label]) => {
        const col = currentColumns.find((c: any) => c.id === key);
        if (col && col.label !== label) {
          col.label = label;
          hasChanges = true;
        }
      });

      // Adicionar colunas extras (de mapeamento extra e colunas customizadas)
      extraFieldInfos.forEach((info) => {
        const { id, label } = info;
        const lowerLabel = label.toLowerCase().trim();
        const mainName = label.includes(', ') ? label.split(', ')[0] : label;
        const lowerMainName = mainName.toLowerCase().trim();

        // Procurar se já existe uma coluna com o mesmo nome principal OU o mesmo ID
        const existingCol = currentColumns.find(c => 
          c.id === id ||
          c.label.toLowerCase().trim() === lowerMainName || 
          c.id.toLowerCase().trim() === lowerMainName ||
          c.id === mainName
        );

        let finalId = existingCol?.id;
        
        if (!existingCol) {
          finalId = id;
          currentColumns.push({ id: finalId, label: mainName, type: 'text', isCustom: true });
          hasChanges = true;
        }

        if (finalId && !currentVisible.includes(finalId)) {
          // Inserir após a coluna de etapa (status) se for nova
          const statusIdx = currentVisible.indexOf('etapa');
          if (statusIdx !== -1) {
            currentVisible.splice(statusIdx + 1, 0, finalId);
          } else {
            currentVisible.push(finalId);
          }
          visibleChanged = true;
        }
      });

      if (hasChanges) {
        // Remove duplicatas físicas se existirem por erro anterior antes de salvar
        const uniqueColumns = Array.from(new Map(currentColumns.map(c => [c.id, c])).values());
        // Filtrar possíveis colunas repetidas indesejadas (ex: Contato repetido muitas vezes)
        // Se houver muitas colunas com o mesmo nome base ou IDs muito similares, podemos limpar.
        // Mas por enquanto vamos focar em garantir que o ID seja único.
        localStorage.setItem('pedidos_all_columns', JSON.stringify(uniqueColumns));
      }
      if (visibleChanged) {
        const uniqueVisible = Array.from(new Set(currentVisible));
        localStorage.setItem('pedidos_visible_columns', JSON.stringify(uniqueVisible));
      }
      if (hasChanges || visibleChanged) {
        window.dispatchEvent(new Event('storage'));
      }

      // Função auxiliar para buscar todas as linhas (contornando o limite de 1000 do Supabase)
      const fetchAll = async (table: any, columns: string) => {
        let allData: any[] = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase.from(table).select(columns).range(from, from + limit - 1);
          if (error) throw error;
          if (!data || data.length === 0) {
            hasMore = false;
          } else {
            allData = [...allData, ...data];
            hasMore = data.length === limit;
            from += limit;
          }
        }
        return allData;
      };

      const clientes = await fetchAll('clientes', 'id, empresa');
      const fabricantes = await fetchAll('fabricantes', 'id, nome');
      const todosVendedores = await fetchAll('usuarios', 'id, nome');
      const obras = await fetchAll('obras', 'id, nome_obra, cliente_id');

      const clienteMap = new Map((clientes ?? []).map(c => [c.empresa.toLowerCase().trim(), c.id]));
      const fabricanteMap = new Map((fabricantes ?? []).map(f => [f.nome.toLowerCase().trim(), f.id]));
      const vendedorMap = new Map((todosVendedores ?? []).map(v => [v.nome?.toLowerCase().trim() || '', v.id]));
      const obraMap = new Map((obras ?? []).map(o => [`${o.cliente_id}|${o.nome_obra?.toLowerCase().trim()}`, o.id]));

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

      // Processar obras faltantes
      const obraRows = rows.filter(r => r.obra && r.obra.trim() !== '');
      const missingObras = obraRows.filter(r => {
        const clientId = clienteMap.get(r.cliente.toLowerCase().trim());
        if (!clientId) return false;
        return !obraMap.has(`${clientId}|${r.obra.toLowerCase().trim()}`);
      });

      if (missingObras.length > 0) {
        const uniqueMissingObras = Array.from(new Map(missingObras.map(r => {
          const clientId = clienteMap.get(r.cliente.toLowerCase().trim());
          return [`${clientId}|${r.obra.toLowerCase().trim()}`, { nome_obra: r.obra, cliente_id: clientId }];
        })).values());

        const { data: newObras, error } = await supabase.from('obras').insert(uniqueMissingObras).select('id, nome_obra, cliente_id');
        if (error) throw error;
        newObras?.forEach(o => obraMap.set(`${o.cliente_id}|${o.nome_obra?.toLowerCase().trim()}`, o.id));
      }

      const BATCH = 200;
      let imported = 0;
      setImportProgress(10); // Iniciando processamento

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map(r => {
          const clientId = clienteMap.get(r.cliente.toLowerCase().trim())!;
          const obraId = r.obra ? obraMap.get(`${clientId}|${r.obra.toLowerCase().trim()}`) : null;
          const importedVendedorId = r.vendedor ? vendedorMap.get(r.vendedor.toLowerCase().trim()) : null;
          
          // Se o vendedor da planilha não existir no sistema, salvamos o nome dele como um campo extra
          const finalCamposExtras = { ...(r.campos_extras || {}) };
          if (r.vendedor && !importedVendedorId) {
            finalCamposExtras['Vendedor Original'] = r.vendedor;
          }
          
          // Salva o contato como campo extra
          if (r.contato) {
            finalCamposExtras['Contato'] = r.contato;
          }
          
          // Salva o título do negócio se ele for diferente do nome do cliente
          // Se não houver título na planilha, usamos o nome da obra ou o nome do cliente como padrão
          if (r.negocio) {
            finalCamposExtras['Negócio'] = r.negocio;
          } else if (r.obra) {
            finalCamposExtras['Negócio'] = r.obra;
          } else {
            finalCamposExtras['Negócio'] = r.cliente;
          }

          return {
            cliente_id: clientId,
            obra_id: obraId,
            fabricante_id: fabricanteMap.get(r.fabricante.toLowerCase().trim())!,
            usuario_id: importedVendedorId || vid,
            status: r.status,
            valor_total: r.valor || null,
            observacoes: r.observacoes || null,
            campos_extras: finalCamposExtras,
            data_pedido: r.data_pedido || new Date().toLocaleDateString('en-CA'), // en-CA retorna YYYY-MM-DD
            created_at: r.data_pedido ? `${r.data_pedido}T12:00:00.000Z` : new Date().toISOString(),
            prazo_resposta: r.status === 'fechamento' ? (r.data_pedido || new Date().toLocaleDateString('en-CA')) : null,
          };
        });
        const { error } = await supabase.from('pedidos').insert(batch);
        if (error) throw error;
        imported += batch.length;
        setImportProgress(Math.min(95, 10 + Math.floor((imported / rows.length) * 85)));
      }

      setImportProgress(100);

      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['vw_indicadores_usuario'] });
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-muted/30 shrink-0 border-b flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2.5 text-xl font-bold">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span>Importar Negócios</span>
                <span className="text-xs font-normal text-muted-foreground">Converta sua planilha em novas oportunidades de venda</span>
              </div>
            </DialogTitle>
          </div>
          
          {step !== 'upload' && (
            <div className="flex items-center gap-4 bg-background/50 px-4 py-2 rounded-xl border border-border/50 shadow-sm self-start">
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

        {importing && (
          <div className="px-6 py-2 border-b bg-primary/5 space-y-1.5 animate-in fade-in slide-in-from-top-1 shrink-0">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
              <span>Processando importação...</span>
              <span>{importProgress}%</span>
            </div>
            <Progress value={importProgress} className="h-1" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {step === 'upload' && (
          <div
            className="border-2 border-dashed border-border rounded-2xl p-16 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/[0.02] transition-all group relative overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300">
                <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Arraste seu arquivo aqui</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Ou clique para selecionar um arquivo <span className="font-semibold text-primary">.xlsx, .xls ou .csv</span> do seu computador
              </p>
              
              <div className="flex flex-col gap-3 max-w-sm mx-auto">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50 text-left">
                  <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">Detecção Inteligente</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">Mapeamos automaticamente as colunas da sua planilha.</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50 text-left">
                  <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-sm">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">Campos Personalizados</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">Adicione informações extras que não existem no sistema.</span>
                  </div>
                </div>
              </div>
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
          <div className="bg-muted/30 rounded-xl border border-border/50 shadow-sm overflow-hidden flex flex-col h-full animate-in fade-in zoom-in-95 duration-200">
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
              existingColumns={existingColumns}
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
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border/50 shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">{fileName}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] font-bold py-0 h-5 bg-background">{previewRows.length} registros válidos</Badge>
                    {extraFieldInfos.length > 0 && (
                      <Badge className="bg-accent/10 text-accent-foreground border-accent/20 text-[10px] font-bold py-0 h-5">
                        +{extraFieldInfos.length} campos extras
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('mapping')} className="h-9 px-3 text-muted-foreground hover:text-foreground">
                <Pencil className="h-4 w-4 mr-2" /> Alterar mapeamento
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-amber-900">Importação Automática</span>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Clientes e fabricantes não encontrados serão criados automaticamente com base no mapeamento.
                  </p>
                </div>
              </div>

              {ignoredColumns.length > 0 && (
                <div className="bg-muted/50 border border-border/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0 border border-border/50">
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Colunas Ignoradas</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ignoredColumns.slice(0, 5).map(col => (
                        <Badge key={col} variant="outline" className="text-[9px] font-normal py-0 h-4 px-1.5 bg-background">
                          {col}
                        </Badge>
                      ))}
                      {ignoredColumns.length > 5 && (
                        <span className="text-[9px] text-muted-foreground px-1">+{ignoredColumns.length - 5} outras</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs sticky top-0 bg-muted/50">#</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Cliente</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Fabricante</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Negócio</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Obra</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Vendedor</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Valor</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Etapa</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Data</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Obs</TableHead>
                    {extraFieldInfos.map(info => (
                      <TableHead key={info.id} className="text-xs sticky top-0 bg-accent/40 text-accent-foreground whitespace-nowrap">
                        {info.label} <span className="text-[10px] opacity-70">(extra)</span>
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
                      <TableCell className="text-xs whitespace-nowrap max-w-[120px] truncate">{r.negocio || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[120px] truncate">{r.obra || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[100px] truncate">{r.vendedor || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.valor ? r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{stageLabel(r.status)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.data_pedido ? r.data_pedido.split('-').reverse().join('/') : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[150px] truncate">{r.observacoes || '-'}</TableCell>
                      {extraFieldInfos.map(info => (
                        <TableCell key={info.id} className="text-xs whitespace-nowrap max-w-[200px] truncate bg-accent/10">
                          {r.campos_extras?.[info.id] || r.campos_extras?.[info.label] || '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>


          </div>
        )}
        </div>

        {step === 'mapping' && (
          <div className="flex justify-end items-center gap-3 border-t bg-muted/30 px-6 py-4 shrink-0">
            <Button variant="ghost" onClick={reset}>Cancelar</Button>
            <Button 
              onClick={() => {
                const mapped = getMappedRows();
                if (mapped.length === 0) {
                  toast.error('Nenhum registro válido com o mapeamento atual');
                  return;
                }
                setStep('preview');
              }} 
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
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Importar {previewRows.length} negócios</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
