import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { AlertCircle, ArrowRight, CheckCircle2, EyeOff, FileSpreadsheet, Info, Plus, Search, Sparkles, X, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SupabaseFieldType = 'text' | 'cnpj' | 'phone' | 'email' | 'date' | 'number' | 'status';

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  forContatos?: boolean;
  type?: SupabaseFieldType;
}

const NONE = '__none__';

const FIELD_HINTS: Record<string, { desc: string; example?: string; storage?: string; synonyms?: string[]; type?: SupabaseFieldType }> = {
  empresa: { desc: 'Nome principal da empresa.', example: 'Engecomp Soluções LTDA', storage: 'clientes.empresa', synonyms: ['empresa', 'nome fantasia', 'cliente', 'companhia'] },
  razao_social: { desc: 'Razão social completa registrada.', example: 'ENGECOMP SOLUÇÕES EM ENGENHARIA LTDA', storage: 'clientes.razao_social', synonyms: ['razao social', 'razão social', 'social reason'] },
  tipo: { desc: 'Categoria ou segmento do cliente.', example: 'construtora', storage: 'clientes.tipo', synonyms: ['tipo', 'segmento', 'segmento de atuação', 'segmento de atuacao', 'categoria', 'segemento', 'segemento de atuacao'] },
  cnpj: { desc: 'CNPJ ou CPF, salvo apenas com números.', example: '12.345.678/0001-90', storage: 'clientes.cnpj', synonyms: ['cnpj', 'cpf', 'documento', 'cpf cnpj'], type: 'cnpj' },
  email: { desc: 'E-mail principal.', example: 'contato@empresa.com.br', storage: 'clientes.email', synonyms: ['email', 'e-mail', 'mail'], type: 'email' },
  telefone: { desc: 'Telefone com DDD. Para mais de um número, separe por vírgula.', example: '(84) 99999-9999, (84) 98888-8888', storage: 'clientes.telefone', synonyms: ['telefone', 'telefone de trabalho', 'fone', 'celular', 'whatsapp', 'tel'], type: 'phone' },
  logradouro: { desc: 'Rua, avenida ou logradouro.', example: 'Av. Hermes da Fonseca', storage: 'clientes.logradouro', synonyms: ['logradouro', 'rua', 'address', 'endereco'] },
  numero: { desc: 'Número do endereço.', example: '123', storage: 'clientes.numero', synonyms: ['numero', 'número', 'number', 'num'] },
  bairro: { desc: 'Bairro do endereço.', example: 'Petrópolis', storage: 'clientes.bairro', synonyms: ['bairro', 'neighborhood', 'suburb'] },
  cidade: { desc: 'Cidade do endereço.', example: 'Natal', storage: 'clientes.cidade', synonyms: ['cidade', 'city'] },
  uf: { desc: 'Estado / Unidade Federativa (ex: RN, SP).', example: 'RN', storage: 'clientes.uf', synonyms: ['uf', 'estado', 'state'] },
  cep: { desc: 'CEP do endereço.', example: '59020-000', storage: 'clientes.cep', synonyms: ['cep', 'zip', 'postcode'] },
  complemento: { desc: 'Complemento do endereço.', example: 'Sala 101', storage: 'clientes.complemento', synonyms: ['complemento'] },
  data_criacao: { desc: 'Data de criação original, convertida para formato ISO quando possível.', example: '2024-01-31', storage: 'clientes.data_criacao', synonyms: ['data criacao', 'data criação', 'criado', 'criado em', 'data cadastro'], type: 'date' },
  cliente: { desc: 'Nome da empresa cliente.', example: 'Engecomp Soluções LTDA', storage: 'pedidos.cliente_id', synonyms: ['cliente', 'empresa', 'construtora'] },
  fabricante: { desc: 'Nome do fabricante.', example: 'Tigre', storage: 'pedidos.fabricante_id', synonyms: ['fabricante', 'fornecedor', 'marca', 'pipeline'] },
  valor: { desc: 'Valor total convertido para número.', example: '15420.75', storage: 'pedidos.valor_total', synonyms: ['valor', 'total', 'preco', 'preço', 'orcamento'], type: 'number' },
  observacoes: { desc: 'Notas livres sobre o registro.', example: 'Entrega prevista para 15/12', storage: 'pedidos.observacoes', synonyms: ['observacoes', 'observações', 'obs', 'nota', 'descricao'] },
  status: { desc: 'Etapa do pipeline normalizada.', example: 'novo_lead', storage: 'pedidos.status', synonyms: ['status', 'etapa', 'fase', 'classificacao'], type: 'status' },
  data_pedido: { desc: 'Data do pedido convertida para YYYY-MM-DD.', example: '2024-01-31', storage: 'pedidos.data_pedido', synonyms: ['data', 'data pedido', 'criado em', 'date'], type: 'date' },
};

function normalizeText(value: unknown): string {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }
  return matrix[a.length][b.length];
}

function fuzzyScore(field: FieldDef, header: string): number {
  const normalizedHeader = normalizeText(header);
  if (!normalizedHeader) return 0;

  const terms = Array.from(new Set([
    field.key,
    field.label,
    ...(FIELD_HINTS[field.key]?.synonyms ?? []),
  ].map(normalizeText).filter(Boolean)));

  return terms.reduce((best, term) => {
    if (normalizedHeader === term) return Math.max(best, 100);
    if (normalizedHeader.includes(term) || term.includes(normalizedHeader)) return Math.max(best, 86);
    const maxLen = Math.max(normalizedHeader.length, term.length);
    const similarity = maxLen === 0 ? 0 : 1 - levenshtein(normalizedHeader, term) / maxLen;
    return Math.max(best, Math.round(similarity * 82));
  }, 0);
}

export function detectFuzzyMapping(headers: string[], fields: FieldDef[]): Record<string, string> {
  const candidates = fields.flatMap((field) => headers.map((header) => ({ field: field.key, header, score: fuzzyScore(field, header) })));
  candidates.sort((a, b) => b.score - a.score);

  const next: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.score < 68 || next[candidate.field] || usedHeaders.has(candidate.header)) continue;
    next[candidate.field] = candidate.header;
    usedHeaders.add(candidate.header);
  }
  fields.forEach((field) => { if (!(field.key in next)) next[field.key] = ''; });
  return next;
}

export function getFieldType(field: FieldDef | string): SupabaseFieldType {
  const key = typeof field === 'string' ? field : field.key;
  const explicit = typeof field === 'string' ? undefined : field.type;
  if (explicit) return explicit;
  if (FIELD_HINTS[key]?.type) return FIELD_HINTS[key].type!;
  if (/cnpj|cpf|documento/.test(key)) return 'cnpj';
  if (/telefone|celular|whatsapp|fone/.test(key)) return 'phone';
  if (/email|e_mail/.test(key)) return 'email';
  if (/data|date|prazo/.test(key)) return 'date';
  if (/valor|preco|total|quantidade/.test(key)) return 'number';
  if (/status|etapa|fase/.test(key)) return 'status';
  return 'text';
}

export function sanitizeFieldValue(value: unknown, type: SupabaseFieldType): string | number | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!raw) return undefined;

  if (type === 'cnpj') return raw.replace(/\D/g, '') || undefined;
  if (type === 'phone') {
    const phones = raw
      .split(/[,;|/]+/)
      .map(phone => phone.replace(/\D/g, ''))
      .filter(Boolean);
    return phones.join(', ') || undefined;
  }
  if (type === 'email') return raw.toLowerCase();
  if (type === 'number') {
    const cleaned = raw.replace(/[^\d,.-]/g, '');
    const normalized = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (type === 'date') {
    if (typeof value === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
      return excelEpoch.toISOString().slice(0, 10);
    }
    const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (br) {
      const year = br[3].length === 2 ? `20${br[3]}` : br[3];
      return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
  }
  if (type === 'status') {
    const normalized = normalizeText(raw);
    if (/fech|ganho|concluid|won/.test(normalized)) return 'fechamento';
    if (/negocia|tratativa/.test(normalized)) return 'negociacao';
    if (/enviad|apresentad|proposta/.test(normalized)) return 'enviado';
    if (/elabora|orcamento|cotacao|andamento/.test(normalized)) return 'elaboracao';
    if (/novo|lead/.test(normalized)) return 'novo_lead';
    return normalized.replace(/\s+/g, '_') || undefined;
  }
  return raw.replace(/\s+/g, ' ').trim() || undefined;
}

export function sanitizeImportedRows(params: {
  rawData: Record<string, unknown>[];
  fields: FieldDef[];
  mapping: Record<string, string>;
  extras?: Record<string, string>;
  customColumns?: Record<string, string>;
  fieldDefaultValues?: Record<string, string>;
  fieldLabels?: Record<string, string>;
}) {
  const { rawData, fields, mapping, extras = {}, customColumns = {}, fieldDefaultValues = {}, fieldLabels = {} } = params;
  return rawData.map((row) => {
    const payload: Record<string, unknown> = {};
    fields.forEach((field) => {
      const header = mapping[field.key];
      const customLabel = fieldLabels[field.key];
      const defaultValue = fieldDefaultValues[field.key];
      
      let rawValue = undefined;
      
      // Tenta encontrar o valor pelo mapeamento direto
      if (header && row[header] !== undefined) {
        rawValue = row[header];
      } 
      // Se não mapeado explicitamente, tenta encontrar por nome customizado (label)
      else if (customLabel && row[customLabel] !== undefined) {
        rawValue = row[customLabel];
      }
      // Se não mapeado nem por label, tenta encontrar pela label padrão
      else if (field.label && row[field.label] !== undefined) {
        rawValue = row[field.label];
      }
      
      // Se ainda não tem valor da planilha, usa o valor padrão se existir
      if ((rawValue === undefined || rawValue === null || rawValue === '') && defaultValue !== undefined) {
        rawValue = defaultValue;
      }

      const sanitized = sanitizeFieldValue(rawValue, getFieldType(field));
      if (sanitized !== undefined && sanitized !== '') payload[field.key] = sanitized;
    });

    const campos_extras: Record<string, string> = {};
    Object.entries(extras).forEach(([header, name]) => {
      const sanitized = sanitizeFieldValue(row[header], 'text');
      if (sanitized !== undefined && String(sanitized).trim()) {
        const key = (name || header).trim();
        if (key) campos_extras[key] = String(sanitized);
      }
    });
    Object.entries(customColumns).forEach(([name, value]) => {
      const sanitized = sanitizeFieldValue(value, 'text');
      if (sanitized !== undefined && String(sanitized).trim() && name.trim()) campos_extras[name.trim()] = String(sanitized);
    });
    payload.campos_extras = campos_extras;
    return payload;
  });
}

function FieldInfo({ fieldKey }: { fieldKey: string }) {
  const hint = FIELD_HINTS[fieldKey];
  if (!hint) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="z-[220] max-w-[280px] space-y-1">
        <p className="text-xs">{hint.desc}</p>
        {hint.example && <p className="text-[10px] text-muted-foreground"><span className="font-semibold">Exemplo:</span> <span className="font-mono">{hint.example}</span></p>}
        {hint.storage && <p className="text-[10px] text-muted-foreground"><span className="font-semibold">Salvo em:</span> <span className="font-mono">{hint.storage}</span></p>}
      </TooltipContent>
    </Tooltip>
  );
}

interface Props {
  fileName: string;
  rawData: Record<string, any>[];
  headers: string[];
  mapping: Record<string, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fieldDefaultValues?: Record<string, string>;
  setFieldDefaultValues?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  extras: Record<string, string>;
  setExtras: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  customColumns?: Record<string, string>;
  setCustomColumns?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fieldLabels?: Record<string, string>;
  setFieldLabels?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  visibleFields: FieldDef[];
  onReset: () => void;
  onAutoDetect: () => void;
  onClearAll: () => void;
  onSaveAsDefault?: (active: boolean) => void;
  isAutoSaveEnabled?: boolean;
  canProceed: boolean;
  onNext: (payload?: Record<string, unknown>[]) => void;
}

export function MappingStep({
  fileName, rawData, headers, mapping, setMapping, fieldDefaultValues = {}, setFieldDefaultValues, extras, setExtras,
  customColumns = {}, setCustomColumns, fieldLabels = {}, setFieldLabels, visibleFields,
  onReset, onAutoDetect, onClearAll, onSaveAsDefault, isAutoSaveEnabled = false, canProceed, onNext,
}: Props) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (headers.length === 0 || visibleFields.length === 0) return;
    setMapping((prev) => {
      const fuzzy = detectFuzzyMapping(headers, visibleFields);
      const used = new Set(Object.values(prev).filter(Boolean));
      let changed = false;
      const next = { ...prev };
      visibleFields.forEach((field) => {
        if (next[field.key] || !fuzzy[field.key] || used.has(fuzzy[field.key])) return;
        next[field.key] = fuzzy[field.key];
        used.add(fuzzy[field.key]);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [headers, visibleFields, setMapping]);

  const usedHeaders = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const requiredMissing = visibleFields.filter((field) => field.required && !mapping[field.key]);
  const mappedCount = visibleFields.filter((field) => Boolean(mapping[field.key])).length;
  const extraCount = Object.keys(extras).length + Object.keys(customColumns).length;
  const filteredFields = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return visibleFields;
    return visibleFields.filter((field) => normalizeText(`${field.label} ${field.key}`).includes(q));
  }, [search, visibleFields]);

  const sample = (header?: string) => {
    if (!header) return '';
    for (const row of rawData) {
      const value = row[header];
      if (value !== undefined && value !== null && value !== '') return String(value);
    }
    return '';
  };

  const setFieldHeader = (fieldKey: string, value: string) => {
    setMapping((prev) => ({ ...prev, [fieldKey]: value === NONE ? '' : value }));
  };

  const addExtra = (header: string) => {
    setExtras((prev) => ({ ...prev, [header]: header }));
  };

  const removeExtra = (header: string) => setExtras((prev) => {
    const next = { ...prev };
    delete next[header];
    return next;
  });

  const handleExtraHeaderChange = (oldHeader: string, newHeader: string) => {
    if (oldHeader === newHeader) return;
    setExtras(prev => {
      const next = { ...prev };
      const currentName = next[oldHeader];
      delete next[oldHeader];
      if (newHeader !== NONE) {
        next[newHeader] = currentName;
      }
      return next;
    });
  };

  const handleContinue = () => {
    const payload = sanitizeImportedRows({ rawData, fields: visibleFields, mapping, extras, customColumns, fieldDefaultValues, fieldLabels });
    onNext(payload);
  };

  const unmappedHeaders = headers.filter((header) => !usedHeaders.has(header));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30 rounded-t-xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{fileName}</div>
                <div className="text-xs text-muted-foreground">{rawData.length} linhas · {headers.length} cabeçalhos encontrados</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={onAutoDetect} className="gap-1.5 h-8"><Sparkles className="h-3.5 w-3.5" /> Auto</Button>
              <Button variant="ghost" size="sm" onClick={onClearAll} className="h-8 px-2">Limpar</Button>
              <Button variant="ghost" size="sm" onClick={onReset} className="h-8 px-2"><X className="h-3.5 w-3.5 mr-1" /> Trocar arquivo</Button>
            </div>
          </div>
          <div className="flex flex-col border-t bg-muted/10 divide-y divide-border/30">
            <div className="flex items-center gap-2 flex-wrap px-4 py-2.5">
              <Badge variant="outline" className="font-normal border-border/60">{visibleFields.length} campos do schema</Badge>
              <Badge className="bg-primary text-primary-foreground hover:bg-primary font-medium">{mappedCount} mapeados</Badge>
              <Badge variant="secondary" className="font-normal">{headers.length - usedHeaders.size} cabeçalhos livres</Badge>
              {extraCount > 0 && <Badge className="bg-accent text-accent-foreground hover:bg-accent font-medium">+{extraCount} extras</Badge>}
            </div>
            
            {(Object.keys(extras).length > 0 || Object.keys(customColumns).length > 0) && (
              <div className="px-4 py-2.5 space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Campos Extras Ativos</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(extras).map(([header, name]) => (
                    <Badge key={header} variant="secondary" className="pl-1.5 pr-1 py-0.5 h-6 flex items-center gap-1.5 bg-accent/10 border-accent/20 text-accent-foreground group hover:bg-accent/20 transition-colors">
                      <Sparkles className="h-3 w-3 text-accent" />
                      <span className="text-[10px] font-medium max-w-[150px] truncate" title={`${header} -> ${name}`}>{name || header}</span>
                      <button 
                        onClick={() => removeExtra(header)}
                        className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-accent/30 transition-colors"
                        title="Remover"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {Object.entries(customColumns).map(([name, value]) => (
                    <Badge key={name} variant="secondary" className="pl-1.5 pr-1 py-0.5 h-6 flex items-center gap-1.5 bg-primary/5 border-primary/20 text-primary group hover:bg-primary/10 transition-colors">
                      <Plus className="h-3 w-3" />
                      <span className="text-[10px] font-medium max-w-[150px] truncate" title={`${name}: ${value}`}>{name}</span>
                      <button 
                        onClick={() => setCustomColumns?.((prev) => { const next = { ...prev }; delete next[name]; return next; })}
                        className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-primary/20 transition-colors"
                        title="Remover"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {requiredMissing.length > 0 && (
          <div className="flex items-start gap-2.5 text-xs bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-warning-foreground"><span className="font-semibold">Campo obrigatório pendente: </span>{requiredMissing.map((f) => f.label).join(', ')}</div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar campo do schema..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9 h-9" />
        </div>

        <div className="rounded-xl border bg-card overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[minmax(180px,1fr)_minmax(200px,260px)_minmax(120px,160px)_minmax(200px,1.5fr)] items-center gap-4 px-4 py-2 border-b bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Campo do schema</span>
              <span>Cabeçalho da planilha</span>
              <span>Valor padrão</span>
              <span>Prévia sanitizada</span>
            </div>
            <div className="divide-y">
            {filteredFields.map((field) => {
              const selectedHeader = mapping[field.key] || '';
              const defaultValue = fieldDefaultValues[field.key] || '';
              const rawSample = sample(selectedHeader);
              const effectiveRawSample = (rawSample !== undefined && rawSample !== null && rawSample !== '') ? rawSample : defaultValue;
              const sanitizedSample = sanitizeFieldValue(effectiveRawSample, getFieldType(field));
              const score = selectedHeader ? fuzzyScore(field, selectedHeader) : 0;
              
              return (
                <div key={field.key} className="grid grid-cols-[minmax(180px,1fr)_minmax(200px,260px)_minmax(120px,160px)_minmax(200px,1.5fr)] gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Input
                          value={fieldLabels[field.key] || field.label}
                          onChange={(e) => setFieldLabels?.(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="h-7 text-sm font-semibold text-foreground bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 truncate"
                        />
                        {field.required && <span className="text-destructive text-sm">*</span>}
                        <FieldInfo fieldKey={field.key} />
                        
                        {['etapa', 'vendedor', 'acoes'].includes(field.key) && (
                          <button
                            onClick={() => {
                              // Aqui removeria o campo da lista visível se houvesse a função setVisibleFields
                              // Como é uma prop vindo de cima (visibleFields), apenas mostramos o ícone por consistência visual
                            }}
                            className="text-muted-foreground hover:text-destructive transition-colors ml-auto"
                            title="Remover campo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span className="font-mono">{field.key}</span>
                      <span>·</span>
                      <span>{getFieldType(field)}</span>
                    </div>
                  </div>

                  <Select value={selectedHeader || NONE} onValueChange={(value) => setFieldHeader(field.key, value)}>
                    <SelectTrigger className={cn('h-9 text-xs', selectedHeader && 'border-primary/40')}>
                      <SelectValue placeholder="Não importar" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[320px]" position="popper">
                      <SelectItem 
                        value={NONE} 
                        className="text-muted-foreground"
                        disabled={['cliente', 'obra', 'fabricante', 'valor'].includes(field.key)}
                      >
                        <span className="flex items-center gap-1.5">
                          <EyeOff className="h-3 w-3" /> 
                          Não importar 
                          {['cliente', 'obra', 'fabricante', 'valor'].includes(field.key) && (
                            <span className="text-[10px] text-destructive italic shrink-0 ml-1">obrigatório</span>
                          )}
                        </span>
                      </SelectItem>
                      {headers.map((header) => {
                        const inUseByOther = usedHeaders.has(header) && selectedHeader !== header;
                        return (
                          <SelectItem key={header} value={header}>
                            <span className="flex items-center gap-2 max-w-[280px]">
                              <span className="truncate">{header}</span>
                              {inUseByOther && <span className="text-[10px] text-muted-foreground italic shrink-0">em uso</span>}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <div>
                    <Select 
                      value={defaultValue === 'Sim' || defaultValue === 'Não' ? defaultValue : ''} 
                      onValueChange={(value) => setFieldDefaultValues?.(prev => ({ ...prev, [field.key]: value }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Padrão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sim">Sim</SelectItem>
                        <SelectItem value="Não">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 rounded-md border bg-background px-3 py-2 text-xs">
                    {(selectedHeader || defaultValue) ? (
                      <>
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                          {selectedHeader ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              <span>Fuzzy {score}%</span>
                            </>
                          ) : (
                            <span className="text-[10px] bg-accent/20 text-accent-foreground px-1.5 py-0.5 rounded">Usando padrão</span>
                          )}
                        </div>
                        <div className="break-all" title={String(sanitizedSample ?? '')}>
                          <span className="text-muted-foreground">Valor:</span>{' '}
                          <span className="font-mono text-foreground">{sanitizedSample === undefined ? '-' : String(sanitizedSample)}</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">Campo não será enviado</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Campos extras dinâmicos (cabeçalhos selecionados da planilha) */}
            {Object.entries(extras).map(([header, name]) => {
              const rawSample = sample(header);
              const sanitizedSample = sanitizeFieldValue(rawSample, 'text');
              
              return (
                <div key={header} className="grid grid-cols-[minmax(180px,1fr)_minmax(200px,260px)_minmax(120px,160px)_minmax(200px,1.5fr)] gap-4 px-4 py-3 hover:bg-accent/5 transition-colors bg-accent/5 animate-in fade-in slide-in-from-top-1 border-t border-accent/10">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Input
                        value={name}
                        onChange={(e) => setExtras(prev => ({ ...prev, [header]: e.target.value }))}
                        className="h-7 text-sm font-semibold text-foreground bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <Badge variant="outline" className="text-[9px] font-bold h-4 px-1.5 border-accent/30 text-accent uppercase">Extra</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span className="font-mono text-[10px]">header: {header}</span>
                    </div>
                  </div>

                  <Select 
                    value={header || NONE} 
                    onValueChange={(value) => handleExtraHeaderChange(header, value)}
                  >
                    <SelectTrigger className={cn('h-9 text-xs border-accent/40 bg-accent/5')}>
                      <SelectValue placeholder="Selecione o cabeçalho" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[320px]" position="popper">
                      <SelectItem value={NONE} className="text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <EyeOff className="h-3 w-3" /> 
                          Não importar
                        </span>
                      </SelectItem>
                      {headers.map((h) => {
                        const inUseByOther = (usedHeaders.has(h) || Object.keys(extras).includes(h)) && header !== h;
                        return (
                          <SelectItem key={h} value={h}>
                            <span className="flex items-center gap-2 max-w-[280px]">
                              <span className="truncate">{h}</span>
                              {inUseByOther && <span className="text-[10px] text-muted-foreground italic shrink-0">em uso</span>}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <div>
                    <Select value="Padrão" disabled>
                      <SelectTrigger className="h-9 text-xs bg-muted/20">
                        <SelectValue placeholder="Padrão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Padrão">Padrão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-xs relative">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 text-accent">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-tight">Mapeado</span>
                      </div>
                      <button 
                        onClick={() => removeExtra(header)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover mapeamento"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="break-all" title={String(sanitizedSample ?? '')}>
                      <span className="text-muted-foreground">Valor:</span>{' '}
                      <span className="font-mono text-foreground">{sanitizedSample === undefined ? '-' : String(sanitizedSample)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Cabeçalhos da Planilha</div>
              <div className="text-[11px] text-muted-foreground">Adicione como campo extra para importar dados adicionais.</div>
            </div>
            {unmappedHeaders.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[10px] font-bold uppercase"
                onClick={() => {
                  const nextExtras = { ...extras };
                  unmappedHeaders.forEach(h => {
                    nextExtras[h] = h;
                  });
                  setExtras(nextExtras);
                }}
              >
                Mapear todos como extras
              </Button>
            )}
          </div>
          <div className="p-4 flex flex-col gap-4">
            {unmappedHeaders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {unmappedHeaders.map((header) => (
                  <button
                    key={header}
                    type="button"
                    onClick={() => addExtra(header)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background text-muted-foreground border-border hover:bg-muted transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {header}
                  </button>
                ))}
              </div>
            )}

            {Object.keys(extras).length > 0 && (
              <div className={cn("space-y-3", unmappedHeaders.length > 0 && "pt-4 border-t border-border/40")}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Personalizar Nomes das Colunas Extras
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(extras).map(([header, name]) => (
                    <div key={header} className="flex flex-col gap-1.5 p-3 rounded-lg border bg-accent/5 border-accent/20">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground truncate" title={`Origem: ${header}`}>
                          Origem: {header}
                        </span>
                        <button 
                          onClick={() => removeExtra(header)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <Input
                        value={name}
                        placeholder="Nome na visualização..."
                        onChange={(e) => setExtras(prev => ({ ...prev, [header]: e.target.value }))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {unmappedHeaders.length === 0 && Object.keys(extras).length === 0 && (
              <div className="text-center py-4 text-xs text-muted-foreground">
                Todos os cabeçalhos da planilha já foram mapeados.
              </div>
            )}
          </div>
        </div>

        {setCustomColumns && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-2 bg-muted/40 border-b">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Campos extras manuais</div>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do campo extra..."
                  className="h-9 text-xs"
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const value = event.currentTarget.value.trim();
                    if (!value) return;
                    setCustomColumns((prev) => ({ ...prev, [value]: prev[value] ?? '' }));
                    event.currentTarget.value = '';
                  }}
                />
              </div>
              {Object.keys(customColumns).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(customColumns).map(([name, value]) => (
                    <div key={name} className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-lg border border-border/50">
                      <span className="text-xs font-mono min-w-0 flex-1 truncate pl-1">{name}</span>
                      <Input value={value} onChange={(event) => setCustomColumns((prev) => ({ ...prev, [name]: event.target.value }))} className="h-7 text-xs w-28 bg-background" placeholder="Valor" />
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive" onClick={() => setCustomColumns((prev) => { const next = { ...prev }; delete next[name]; return next; })}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-accent-foreground" />
            Ao continuar, CNPJ/telefone, números, datas e status serão sanitizados antes do preview.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onReset} size="sm">Cancelar</Button>
            <Button disabled={!canProceed || requiredMissing.length > 0} onClick={handleContinue} size="sm" className="gap-1.5">
              Pré-visualizar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
