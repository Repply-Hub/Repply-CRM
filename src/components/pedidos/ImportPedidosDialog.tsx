import { useState, useRef, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X, ArrowRight, Plus, Pencil, EyeOff, FolderKanban, UserCheck, UserX, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { validateFile } from '@/lib/file-validation';
import { lerPlanilhaComoObjetos } from '@/lib/import/ler-planilha';
import { diagnosticarDatasDaPlanilha } from '@/lib/import/ordem-de-data';
import { conferirDatasImportadas, textoDoAviso } from '@/lib/import/conferencia-de-datas';
import { MappingStep, sanitizeImportedRows, getExtraDisplayName, type ExtraMappingValue, type FieldDef } from '@/components/import/MappingStep';
import { ImportInstructionsStep } from '@/components/import/ImportInstructionsStep';
import { useBulkImport } from '@/hooks/use-bulk-import';
import { useAuth } from '@/hooks/use-auth';
import { useFunis } from '@/hooks/use-funis';
import { useIsGestor } from '@/hooks/use-novo-pedido';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useQuery } from '@tanstack/react-query';
import { matchUsuarioByNome, type UsuarioLite } from '@/lib/import/match-usuario';

const IMPORT_ALLOWED_EXT = ['.xlsx', '.xls', '.csv'];
import {
  FIELDS,
  createEmptyMapping,
  detectImportPedidosMapping,
  getImportedPedidosRows,
  getSheetHeaders,
  matchPedidoStatusToColuna,
  type FieldKey,
} from '@/components/import-pedidos/importPedidosUtils';
import { LinkAnexoPrivado } from '@/components/shared/LinkAnexoPrivado';

const VISIBLE_FIELDS: FieldDef[] = FIELDS.map(f => ({ key: f.key, label: f.label, required: f.required }));

const FIELD_EXAMPLES: Partial<Record<FieldKey, string>> = {
  negocio: 'Construtora Exemplo | Tigre',
  cliente: 'Construtora Exemplo Ltda',
  contato: 'João Silva',
  obra: 'Rua Exemplo, 123 - Centro',
  fabricante: 'Tigre',
  valor: '1500.00',
  vendedor: 'Nome do Vendedor',
  status: 'novo lead',
  marcador: 'Quente',
  data_pedido: '2026-01-15',
  prazo_resposta: '2026-01-30',
  observacoes: 'Observação livre',
  pdf_url: 'https://cdn.bitrix24.com.br/.../anexo.pdf',
};
const TEMPLATE_FIELDS = FIELDS.map(f => ({ label: f.label, example: FIELD_EXAMPLES[f.key] }));

interface ImportPedidosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** As duas etapas que encerram um negócio. Fora daqui, "data de fechamento" não se aplica. */
const ETAPAS_FINAIS = new Set(['fechamento', 'perdido']);

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
  const { importNegocios, progress } = useBulkImport();
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([]);
  const [step, setStep] = useState<'instructions' | 'upload' | 'mapping' | 'preview' | 'done'>('instructions');
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: funis } = useFunis(empresaId);
  const [funilId, setFunilId] = useState<string | undefined>(undefined);
  // Colunas reais do funil selecionado — usadas na prévia pra mostrar o badge de etapa
  // de verdade (mesma cor/nome do Kanban), em vez de um mapa fixo de 5 palavras-chave
  // que não conhece as etapas customizadas da empresa.
  const { data: kanbanColunas } = useKanbanColunas(empresaId, funilId);
  const { data: isGestor } = useIsGestor();
  // Usuários da empresa para vincular a coluna Responsável/Vendedor por nome (só gestores atribuem para outros).
  const { data: usuariosEmpresa } = useQuery({
    queryKey: ['usuarios_empresa_nomes', empresaId],
    enabled: Boolean(isGestor),
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios').select('id, nome');
      if (error) throw error;
      return (data ?? []) as UsuarioLite[];
    },
  });
  useEffect(() => {
    if (!funis || funis.length === 0 || funilId) return;
    setFunilId((funis.find(f => f.is_padrao) ?? funis[0]).id);
  }, [funis, funilId]);
  const [importResult, setImportResult] = useState<{
    totalNoArquivo: number;
    totalValidados: number;
    totalIgnoradosValidacao: number;
    totalInseridos: number;
    totalFalharam: number;
    motivosFalha: Record<string, number>;
  } | null>(null);
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
    setStep('instructions');
    setIgnoredColumns([]);
    setImportResult(null);
    setFunilId(funis?.find(f => f.is_padrao)?.id ?? funis?.[0]?.id);
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
      // 🔴 A leitura da planilha NÃO mora mais aqui. Esta tela tinha a sua própria, sem
      // `cellDates` — e por isso o conserto de dia/mês trocados de 20/08/2026, que só entrou
      // em `file-parser.ts`, nunca alcançou a importação que a MD de fato usa. Em 01/09/2026
      // o erro reapareceu: 786 dos 2.358 negócios importados entraram com dia e mês
      // invertidos. Ver `src/lib/import/ler-planilha.ts`.
      const json = (await lerPlanilhaComoObjetos(file)) as Record<string, any>[];

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

  const canProceedToPreview = Boolean(mapping.cliente && mapping.fabricante);

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
      const negocio = rest.negocio || '';
      // Fallback: alguns exports de CRM deixam a coluna Cliente vazia, mas o título
      // do negócio segue o padrão "Cliente | Fabricante" — resgata o nome daí.
      let cliente = rest.cliente || '';
      if (!cliente && negocio.includes('|')) {
        const possivelCliente = negocio.split('|')[0].trim();
        if (possivelCliente) cliente = possivelCliente;
      }
      return {
        negocio,
        cliente,
        contato: rest.contato || '',
        obra: rest.obra || '',
        fabricante: rest.fabricante || '',
        valor: typeof rest.valor === 'number' ? rest.valor : 0,
        vendedor: rest.vendedor || '',
        status: rest.status || 'novo lead',
        marcador: rest.marcador || '',
        data_pedido: rest.data_pedido || undefined,
        prazo_resposta: rest.prazo_resposta || undefined,
        observacoes: rest.observacoes || '',
        pdf_url: rest.pdf_url || '',
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

  /**
   * 🔴 A conferência que faltava em 01/09/2026. Ela olha as datas JÁ convertidas — as mesmas
   * que a tabela abaixo mostra e que a importação vai gravar — e procura o impossível:
   * negócio criado depois de hoje. Naquela importação isso aconteceu 294 vezes e nada disse
   * nada. Ver `src/lib/import/conferencia-de-datas.ts`.
   */
  const avisoDeDatas = useMemo(() => {
    if (step !== 'preview' || previewRows.length === 0) return null;
    const cabecalhos = Array.from(new Set(rawData.flatMap(linha => Object.keys(linha))));
    const aviso = conferirDatasImportadas(previewRows, diagnosticarDatasDaPlanilha(rawData, cabecalhos));
    const frases = textoDoAviso(aviso);
    return frases.length > 0 ? { ...aviso, frases } : null;
  }, [step, previewRows, rawData]);

  // Vincula o nome da coluna Responsável/Vendedor a um usuário real da empresa (por nome,
  // tolerando acentos/variação de digitação) para mostrar o resultado já no preview.
  const vendedorMatches = useMemo(() => {
    if (!isGestor || !usuariosEmpresa || usuariosEmpresa.length === 0) return new Map<string, ReturnType<typeof matchUsuarioByNome>>();
    const map = new Map<string, ReturnType<typeof matchUsuarioByNome>>();
    previewRows.forEach(r => {
      if (!r.vendedor || map.has(r.vendedor)) return;
      map.set(r.vendedor, matchUsuarioByNome(r.vendedor, usuariosEmpresa));
    });
    return map;
  }, [previewRows, usuariosEmpresa, isGestor]);

  const handleImport = async () => {
    if (importing) return;
    const allRows = getMappedRows();
    // Linhas com campo de data inválido (ex: "30/12/2022 18:01" → parse falhou)
    const dateErrorRows = allRows.reduce<Array<{ raw: Record<string, unknown>; motivo: string }>>(
      (acc, r, idx) => {
        if ((r as any).__dateError) acc.push({ raw: rawData[idx], motivo: (r as any).__dateError });
        return acc;
      }, []
    );
    const rows = allRows.filter(r => !((r as any).__dateError) && r.cliente && r.fabricante);
    const ignoredRowsData = rawData.filter((_, index) => {
      const mapped = allRows[index];
      return !((mapped as any).__dateError) && !(mapped.cliente && mapped.fabricante);
    });
    
    if (rows.length === 0) {
      toast.error('Nenhum registro válido para importar. Verifique se as colunas de Cliente e Fabricante estão mapeadas e preenchidas.');
      return;
    }
    
    setImporting(true);
    try {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      if (!vid) throw new Error('Vendedor não encontrado');

      const { data: isGestorNow } = await supabase.rpc('is_gestor');

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // Log rows sem cliente/fabricante para revisão posterior
      if (ignoredRowsData.length > 0 && userId) {
        const { error: ignoreError } = await supabase
          .from('linhas_ignoradas_importacao')
          .insert(ignoredRowsData.map(row => ({
            usuario_id: userId,
            tipo_importacao: 'negocios',
            dados_originais: row,
            motivo_ignorado: 'Falta Cliente ou Fabricante',
          })));
        if (ignoreError) console.error('Erro ao salvar linhas ignoradas:', ignoreError);
      }

      // Atualizar labels dos campos padrão que foram renomeados (não cria nem duplica itens do
      // card: apenas ajusta o rótulo de colunas padrão já existentes na configuração da página).
      const savedAllColumns = localStorage.getItem('pedidos_all_columns');
      if (savedAllColumns && Object.keys(fieldLabels).length > 0) {
        try {
          const currentColumns: any[] = JSON.parse(savedAllColumns);
          let labelsChanged = false;
          Object.entries(fieldLabels).forEach(([key, label]) => {
            const col = currentColumns.find((c: any) => c.id === key);
            if (col && col.label !== label) {
              col.label = label;
              labelsChanged = true;
            }
          });
          if (labelsChanged) {
            localStorage.setItem('pedidos_all_columns', JSON.stringify(currentColumns));
            window.dispatchEvent(new Event('storage'));
          }
        } catch (e) {}
      }

      // Os campos extras/customizados mapeados na importação são salvos em campos_extras de
      // cada pedido (ver enrichedRows abaixo) sem criar novos "Itens do card" — eles só passam a
      // aparecer no card se já existir (ou o usuário criar depois) um item com o mesmo id/label.

      // Busca vendedores para vincular a coluna Responsável/Vendedor por nome (somente se
      // gestor) — reaproveita a lista já carregada para o preview quando disponível.
      let usuariosParaMatch: UsuarioLite[] = usuariosEmpresa ?? [];
      if (isGestorNow && usuariosParaMatch.length === 0) {
        const { data: vends } = await supabase.from('usuarios').select('id, nome');
        usuariosParaMatch = vends ?? [];
      }

      // Pré-processa linhas: enriquece campos_extras e resolve usuario_id para gestor.
      // Resolução de clientes/fabricantes, hashing e batch paralelo ficam no hook.
      const enrichedRows: Record<string, unknown>[] = rows.map(r => {
        const campos_extras = { ...(r.campos_extras || {}) };
        const match = isGestorNow && r.vendedor ? matchUsuarioByNome(r.vendedor, usuariosParaMatch) : null;
        const resolvedUserId = match?.usuarioId ?? null;

        // Guarda o nome original sempre que não houve match exato — tanto para auditoria
        // de matches aproximados quanto para revisão manual quando ninguém bateu.
        if (r.vendedor && (!match || !match.exact)) campos_extras['Vendedor Original'] = r.vendedor;
        if (r.contato) campos_extras['Contato'] = r.contato;
        if (r.negocio) campos_extras['Negócio'] = r.negocio;
        else if (r.obra) campos_extras['Negócio'] = r.obra;
        else campos_extras['Negócio'] = r.cliente;

        return {
          ...r,
          campos_extras,
          data_pedido: r.data_pedido || new Date().toLocaleDateString('en-CA'),
          created_at: r.data_pedido ? `${r.data_pedido.slice(0, 10)}T12:00:00.000Z` : new Date().toISOString(),
          // Etapa final (ganho OU perda) sem data de fechamento na planilha cai na data
          // de criação, nunca no dia da importação. O gatilho do banco
          // (fn_set_pedido_fechado_em) carimba `current_date` quando a linha chega vazia —
          // e foi exatamente assim que a coluna `fechado_em` foi envenenada: 11.653
          // negócios de 2022 a 2026 gravados como se tivessem fechado em 18/08/2026.
          // Mandar a data de criação preenchida daqui impede o carimbo de entrar.
          prazo_resposta: r.prazo_resposta || (ETAPAS_FINAIS.has(r.status) ? (r.data_pedido || new Date().toLocaleDateString('en-CA')) : null),
          usuario_id: resolvedUserId || vid,
        };
      });

      const summary = await importNegocios(enrichedRows, undefined, funilId, empresaId);

      // Log linhas com data inválida (filtradas antes do hook — não chegam ao importNegocios)
      if (userId) {
        for (const { raw, motivo } of dateErrorRows) {
          await supabase.from('linhas_ignoradas_importacao').insert({
            usuario_id: userId,
            tipo_importacao: 'negocios',
            dados_originais: raw,
            motivo_ignorado: motivo,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['vw_faturamento_mensal'] });
      qc.invalidateQueries({ queryKey: ['dashboard_indicadores_vendedor'] });

      setImportResult({
        totalNoArquivo: rawData.length,
        totalValidados: rows.length,
        totalIgnoradosValidacao: ignoredRowsData.length,
        totalInseridos: summary.inserted,
        totalFalharam: summary.ignored + dateErrorRows.length,
        motivosFalha: summary.motivosFalha,
      });
      setStep('done');
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || 'erro desconhecido'));
    } finally {
      setImporting(false);
    }
  };

  // Resolve o texto cru da planilha pra coluna real do funil (mesma lógica usada no
  // insert, em use-bulk-import.ts) — a prévia mostra exatamente a etapa em que o negócio
  // vai cair, com o badge de verdade, em vez de um texto solto sem cor.
  const resolveStageColuna = (rawStatus: string) => {
    if (!kanbanColunas || kanbanColunas.length === 0) return null;
    const slug = matchPedidoStatusToColuna(rawStatus, kanbanColunas);
    return kanbanColunas.find(c => c.slug === slug) ?? null;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-muted/30 shrink-0 border-b flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2.5 text-foreground font-bold text-lg">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span>Importar Negócios</span>
                <span className="text-xs font-normal text-muted-foreground">Converta sua planilha em novas oportunidades de venda</span>
              </div>
            </DialogTitle>
          </div>
          
          {((step === 'mapping' || step === 'preview') || importing) && (
            <div className="flex items-center justify-between w-full">
              {step !== 'upload' ? (
                <div className="flex items-center gap-4 bg-background/50 px-4 py-2 rounded-xl border border-border/50 shadow-sm">
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
              ) : <div />}
              
              {importing && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 bg-background/50 p-2 px-3 rounded-lg border border-primary/20 min-w-[200px]">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span>Importando...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1" />
                </div>
              )}
            </div>
          )}
        </DialogHeader>


        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {step === 'instructions' && (
            <ImportInstructionsStep
              templateFileName="modelo-importacao-negocios.xlsx"
              templateFields={TEMPLATE_FIELDS}
              extraTips={['Cliente e Fabricante são campos obrigatórios, confira se estão preenchidos em todas as linhas antes de importar.']}
              onContinue={() => setStep('upload')}
            />
          )}

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

            {funis && funis.length > 1 && (
              <div className="flex items-center gap-3 bg-card p-4 rounded-xl border border-border/50 shadow-sm">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FolderKanban className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-xs font-bold text-foreground">Em qual funil importar?</span>
                  <span className="text-[11px] text-muted-foreground">Este sistema tem mais de um funil de vendas — escolha onde os negócios importados devem entrar.</span>
                </div>
                <Select value={funilId} onValueChange={setFunilId}>
                  <SelectTrigger className="h-9 w-fit min-w-[160px] shrink-0 text-sm">
                    <SelectValue placeholder="Selecione o funil" />
                  </SelectTrigger>
                  <SelectContent>
                    {funis.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {avisoDeDatas && (
              <div
                className={cn(
                  'rounded-xl border p-4 flex items-start gap-3',
                  avisoDeDatas.grave
                    ? 'bg-destructive/5 border-destructive/30'
                    : 'bg-amber-500/5 border-amber-500/20',
                )}
              >
                <div
                  className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                    avisoDeDatas.grave ? 'bg-destructive/10' : 'bg-amber-500/10',
                  )}
                >
                  <AlertTriangle className={cn('h-4 w-4', avisoDeDatas.grave ? 'text-destructive' : 'text-amber-600')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={cn('text-xs font-bold', avisoDeDatas.grave ? 'text-destructive' : 'text-amber-900')}>
                    Confira as datas antes de importar
                  </span>
                  {avisoDeDatas.frases.map((frase) => (
                    <p
                      key={frase}
                      className={cn('text-[11px] leading-relaxed', avisoDeDatas.grave ? 'text-destructive/90' : 'text-amber-800')}
                    >
                      {frase}
                    </p>
                  ))}
                </div>
              </div>
            )}

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

              {isGestor && vendedorMatches.size > 0 && (
                <div className="bg-muted/50 border border-border/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0 border border-border/50">
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Responsável vinculado por nome</span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3 text-green-600" /> encontrado na empresa</span>
                      <span className="inline-flex items-center gap-1"><UserX className="h-3 w-3 text-muted-foreground/70" /> sem match, fica com você</span>
                    </p>
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
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Endereço</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Vendedor</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Valor</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Etapa</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Marcador</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Data</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Obs</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Anexo</TableHead>
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
                      <TableCell className="text-xs whitespace-nowrap max-w-[140px]">
                        {r.vendedor ? (
                          isGestor ? (
                            (() => {
                              const match = vendedorMatches.get(r.vendedor);
                              return match ? (
                                <span
                                  className={cn('inline-flex items-center gap-1 truncate', match.exact ? 'text-foreground' : 'text-amber-700')}
                                  title={match.exact ? undefined : `Vinculado por aproximação de nome a "${match.usuarioNome}"`}
                                >
                                  <UserCheck className={cn('h-3.5 w-3.5 shrink-0', match.exact ? 'text-green-600' : 'text-amber-600')} />
                                  <span className="truncate">{match.usuarioNome}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 truncate text-muted-foreground" title="Nenhum usuário da empresa bate com esse nome — o negócio ficará com você como responsável">
                                  <UserX className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                  <span className="truncate">{r.vendedor}</span>
                                </span>
                              );
                            })()
                          ) : (
                            <span className="truncate block">{r.vendedor}</span>
                          )
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.valor ? r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {(() => {
                          const coluna = resolveStageColuna(r.status);
                          return coluna
                            ? <Badge className={`bg-${coluna.cor} text-white`}>{coluna.nome}</Badge>
                            : <span className="text-muted-foreground">{r.status || '-'}</span>;
                        })()}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.marcador || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.data_pedido ? r.data_pedido.split('-').reverse().join('/') : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[150px] truncate">{r.observacoes || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.pdf_url ? (
                          <LinkAnexoPrivado
                            url={r.pdf_url}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            title={r.pdf_url}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </LinkAnexoPrivado>
                        ) : '-'}
                      </TableCell>
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

        {step === 'done' && importResult && (
          <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-center gap-3 py-2">
              {importResult.totalInseridos === 0 && importResult.totalFalharam > 0 ? (
                <X className="h-10 w-10 text-destructive" />
              ) : (
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              )}
              <div>
                <h3 className="font-bold text-lg">Importação concluída</h3>
                <p className="text-sm text-muted-foreground">{importResult.totalNoArquivo} linhas no arquivo</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-xl p-4 border text-center">
                <div className="text-3xl font-bold">{importResult.totalNoArquivo}</div>
                <div className="text-xs text-muted-foreground mt-1">Total no arquivo</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-700">{importResult.totalInseridos}</div>
                <div className="text-xs text-green-600 mt-1">Importados com sucesso</div>
              </div>
              {importResult.totalIgnoradosValidacao > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-amber-700">{importResult.totalIgnoradosValidacao}</div>
                  <div className="text-xs text-amber-600 mt-1">Sem cliente ou fabricante</div>
                </div>
              )}
              {importResult.totalFalharam > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-red-700">{importResult.totalFalharam}</div>
                  <div className="text-xs text-red-600 mt-1">Falhas de inserção</div>
                </div>
              )}
            </div>

            {Object.keys(importResult.motivosFalha).length > 0 && (
              <div className="bg-muted/30 rounded-xl p-4 border">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Motivos de falha
                </p>
                <div className="space-y-1.5">
                  {Object.entries(importResult.motivosFalha).map(([motivo, count]) => (
                    <div key={motivo} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground truncate">{motivo}</span>
                      <Badge variant="outline" className="shrink-0">{count}×</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <Button onClick={handleImport} disabled={importing || !funilId} className="h-10 px-6 font-bold shadow-lg shadow-primary/20">
              {importing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Importar {previewRows.length} negócios</>
              )}
            </Button>
          </div>
        )}

        {step === 'done' && (
          <div className="flex justify-end items-center gap-3 border-t bg-muted/30 px-6 py-4 shrink-0">
            <Button onClick={() => { reset(); onOpenChange(false); }} className="h-10 px-6 font-bold">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
