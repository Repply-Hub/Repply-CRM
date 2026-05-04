import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, ArrowRight, CheckCircle2, EyeOff, FileSpreadsheet, Info, Plus, Search, Sparkles, X } from 'lucide-react';
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
}) {
  const { rawData, fields, mapping, extras = {}, customColumns = {}, fieldDefaultValues = {} } = params;
  return rawData.map((row) => {
    const payload: Record<string, unknown> = {};
    fields.forEach((field) => {
      const header = mapping[field.key];
      const defaultValue = fieldDefaultValues[field.key];
      
      let rawValue = header ? row[header] : undefined;
      
      // Se não tem valor da planilha ou o cabeçalho não foi mapeado, usa o valor padrão se existir
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
  visibleFields: FieldDef[];
  onReset: () => void;
  onAutoDetect: () => void;
  onClearAll: () => void;
  onSaveAsDefault?: () => void;
  canProceed: boolean;
  onNext: (payload?: Record<string, unknown>[]) => void;
}

export function MappingStep({
  fileName, rawData, headers, mapping, setMapping, fieldDefaultValues = {}, setFieldDefaultValues, extras, setExtras,
  customColumns = {}, setCustomColumns, visibleFields,
  onReset, onAutoDetect, onClearAll, onSaveAsDefault, canProceed, onNext,
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

  const addExtra = (header: string) => setExtras((prev) => ({ ...prev, [header]: prev[header] || header }));
  const removeExtra = (header: string) => setExtras((prev) => {
    const next = { ...prev };
    delete next[header];
    return next;
  });

  const handleContinue = () => {
    const payload = sanitizeImportedRows({ rawData, fields: visibleFields, mapping, extras, customColumns, fieldDefaultValues });
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
              {onSaveAsDefault && (
                <Button variant="outline" size="sm" onClick={onSaveAsDefault} className="gap-1.5 h-8 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Salvar como padrão
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClearAll} className="h-8 px-2">Limpar</Button>
              <Button variant="ghost" size="sm" onClick={onReset} className="h-8 px-2"><X className="h-3.5 w-3.5 mr-1" /> Trocar arquivo</Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap px-4 py-2.5">
            <Badge variant="outline">{visibleFields.length} campos do schema</Badge>
            <Badge className="bg-primary text-primary-foreground hover:bg-primary">{mappedCount} mapeados</Badge>
            <Badge variant="secondary">{headers.length - usedHeaders.size} cabeçalhos livres</Badge>
            {extraCount > 0 && <Badge className="bg-accent text-accent-foreground hover:bg-accent">+{extraCount} extras</Badge>}
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

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-[minmax(180px,1fr)_minmax(200px,260px)_minmax(120px,160px)_minmax(140px,1fr)] items-center gap-4 px-4 py-2 border-b bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                <div key={field.key} className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_minmax(200px,260px)_minmax(120px,160px)_minmax(140px,1fr)] gap-3 md:gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate">{field.label}</span>
                      {field.required && <span className="text-destructive text-sm">*</span>}
                      <FieldInfo fieldKey={field.key} />
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
                      <SelectItem value={NONE} className="text-muted-foreground"><span className="flex items-center gap-1.5"><EyeOff className="h-3 w-3" /> Não importar</span></SelectItem>
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
                    <Input 
                      placeholder="Padrão" 
                      value={defaultValue} 
                      onChange={(e) => setFieldDefaultValues?.(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="h-9 text-xs"
                    />
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
                        <div className="truncate" title={String(sanitizedSample ?? '')}>
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
          </div>
        </div>

        {unmappedHeaders.length > 0 && (
          <div className="rounded-xl border border-dashed bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">Cabeçalhos não usados</div>
                <div className="text-[11px] text-muted-foreground">Marque apenas o que deve ir para campos_extras.</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {unmappedHeaders.map((header) => {
                const active = header in extras;
                return (
                  <button
                    key={header}
                    type="button"
                    onClick={() => active ? removeExtra(header) : addExtra(header)}
                    className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors', active ? 'bg-accent text-accent-foreground border-accent' : 'bg-background text-muted-foreground border-border hover:bg-muted')}
                  >
                    {active ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {header}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {setCustomColumns && (
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="text-xs font-semibold text-foreground">Campos extras manuais</div>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do campo extra"
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
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-xs font-mono min-w-0 flex-1 truncate">{name}</span>
                    <Input value={value} onChange={(event) => setCustomColumns((prev) => ({ ...prev, [name]: event.target.value }))} className="h-8 text-xs w-36" placeholder="Valor padrão" />
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setCustomColumns((prev) => { const next = { ...prev }; delete next[name]; return next; })}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
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
