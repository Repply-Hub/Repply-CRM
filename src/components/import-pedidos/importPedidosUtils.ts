import { getExtraDisplayName, getExtraHeaders, type ExtraMappingValue } from '@/components/import/MappingStep';

export type FieldKey = 'cliente' | 'fabricante' | 'valor' | 'observacoes' | 'status' | 'data_pedido';

export const FIELDS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: 'cliente', label: 'Cliente', required: false },
  { key: 'fabricante', label: 'Fabricante', required: false },
  { key: 'valor', label: 'Valor', required: false },
  { key: 'status', label: 'Etapa/Status', required: false },
  { key: 'data_pedido', label: 'Data', required: false },
  { key: 'observacoes', label: 'Observações', required: false },
];

const EMPTY_MAPPING: Record<FieldKey, string> = {
  cliente: '',
  fabricante: '',
  valor: '',
  observacoes: '',
  status: '',
  data_pedido: '',
};

const FIELD_KEYS = Object.keys(EMPTY_MAPPING) as FieldKey[];

const HEADER_RULES: Record<FieldKey, Array<{ pattern: RegExp; score: number }>> = {
  cliente: [
    { pattern: /^cliente$/, score: 100 },
    { pattern: /^empresa$/, score: 100 },
    { pattern: /cliente/, score: 85 },
    { pattern: /empresa/, score: 85 },
    { pattern: /razao/, score: 75 },
    { pattern: /construtora/, score: 75 },
    { pattern: /nome.*cliente/, score: 70 },
  ],
  fabricante: [
    { pattern: /^fabricante$/, score: 100 },
    { pattern: /^pipeline$/, score: 96 },
    { pattern: /fabricante/, score: 85 },
    { pattern: /pipeline/, score: 92 },
    { pattern: /fornecedor/, score: 82 },
    { pattern: /marca/, score: 76 },
    { pattern: /fabrica/, score: 74 },
    { pattern: /industria/, score: 72 },
  ],
  valor: [
    { pattern: /^valor$/, score: 100 },
    { pattern: /^renda$/, score: 100 },
    { pattern: /^faturamento$/, score: 95 },
    { pattern: /valor/, score: 85 },
    { pattern: /renda/, score: 85 },
    { pattern: /total/, score: 76 },
    { pattern: /preco/, score: 76 },
    { pattern: /orcamento/, score: 68 },
    { pattern: /receita/, score: 66 },
  ],
  status: [
    { pattern: /^status$/, score: 100 },
    { pattern: /^etapa$/, score: 98 },
    { pattern: /^fase$/, score: 98 },
    { pattern: /classificacao/, score: 95 },
    { pattern: /status/, score: 88 },
    { pattern: /etapa/, score: 86 },
    { pattern: /fase/, score: 90 },
    { pattern: /estagio/, score: 82 },
    { pattern: /pipeline stage/, score: 84 },
  ],
  data_pedido: [
    { pattern: /^data$/, score: 100 },
    { pattern: /^criado$/, score: 98 },
    { pattern: /^criado\s*em$/, score: 98 },
    { pattern: /data/, score: 85 },
    { pattern: /criado/, score: 80 },
    { pattern: /date/, score: 85 },
  ],
  observacoes: [
    { pattern: /^nome\s+do\s+negocio$/, score: 100 },
    { pattern: /^titulo\s+do\s+negocio$/, score: 95 },
    { pattern: /^vendedor$/, score: 90 },
    { pattern: /^responsavel$/, score: 90 },
    { pattern: /vendedor/, score: 85 },
    { pattern: /responsavel/, score: 85 },
    { pattern: /observa/, score: 95 },
    { pattern: /obs/, score: 92 },
    { pattern: /nota/, score: 88 },
    { pattern: /descri/, score: 78 },
    { pattern: /detalhe/, score: 76 },
    { pattern: /nome\s+do\s+negocio/, score: 90 },
    { pattern: /titulo/, score: 68 },
  ],
};

const MIN_SCORE: Record<FieldKey, number> = {
  cliente: 70,
  fabricante: 70,
  valor: 66,
  observacoes: 68,
  status: 70,
  data_pedido: 70,
};

const STATUS_RULES: Array<{ status: string; patterns: RegExp[] }> = [
  { status: 'fechamento', patterns: [/fech/, /ganho/, /concluid/, /won/] },
  { status: 'negociacao', patterns: [/negocia/, /tratativa/] },
  { status: 'enviado', patterns: [/enviad/, /apresentad/, /proposta/] },
  { status: 'elaboracao', patterns: [/elabora/, /orcamento/, /cotacao/, /em andamento/] },
  { status: 'novo_lead', patterns: [/novo lead/, /\blead\b/, /\bnovo\b/] },
];

function normalizeText(value: unknown): string {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getHeaderScore(field: FieldKey, header: string): number {
  return HEADER_RULES[field].reduce((best, rule) => {
    return rule.pattern.test(header) ? Math.max(best, rule.score) : best;
  }, 0);
}

function getSampleScore(field: FieldKey, header: string, sampleValues: unknown[]): number {
  const normalizedSamples = sampleValues.map(normalizeText).filter(Boolean);

  if (!normalizedSamples.length) return 0;

  if (field === 'status') {
    const matches = normalizedSamples.filter((value) => resolveImportedPedidoStatus(value) !== 'novo_lead' || /novo|lead/.test(value)).length;
    return Math.min(matches * 4, 16);
  }

  if (field === 'valor') {
    const numericValues = normalizedSamples.filter((value) => parseNumber(value) > 0).length;
    return Math.min(numericValues * 3, 12);
  }

  if (field === 'fabricante' && header.includes('pipeline')) {
    return 10;
  }

  if (field === 'cliente' && header === 'empresa') {
    return 10;
  }

  return 0;
}

export function createEmptyMapping(): Record<FieldKey, string> {
  return { ...EMPTY_MAPPING };
}

export function getSheetHeaders(rows: Record<string, unknown>[]): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

export function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  const raw = value.toString().replace(/[^\d,.-]/g, '');
  if (!raw) return 0;

  if (raw.includes(',') && raw.includes('.')) {
    const normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
    return parseFloat(normalized) || 0;
  }

  if (raw.includes(',')) {
    // If there's a comma, we check if it's potentially a decimal separator or thousands separator
    // For Brazilian Portuguese format: 1.234,56 -> 1234.56
    // If it ends with ,XX it's likely a decimal
    const parts = raw.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
    }
    // Otherwise treat as thousands separator (less common for comma, but possible in some formats)
    return parseFloat(raw.replace(/,/g, '')) || 0;
  }

  return parseFloat(raw) || 0;
}

export function resolveImportedPedidoStatus(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized) return 'novo_lead';

  for (const rule of STATUS_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.status;
    }
  }

  return 'novo_lead';
}

export function detectImportPedidosMapping(
  headers: string[],
  rows: Record<string, unknown>[]
): Record<FieldKey, string> {
  const candidates = headers.flatMap((header) => {
    const normalizedHeader = normalizeText(header);
    const sampleValues = rows.slice(0, 25).map((row) => row[header]);

    return FIELD_KEYS.map((field) => ({
      field,
      header,
      score: getHeaderScore(field, normalizedHeader) + getSampleScore(field, normalizedHeader, sampleValues),
    })).filter((candidate) => candidate.score >= MIN_SCORE[candidate.field]);
  });

  candidates.sort((a, b) => b.score - a.score);

  const mapping = createEmptyMapping();
  const usedHeaders = new Set<string>();

  for (const candidate of candidates) {
    if (mapping[candidate.field] || usedHeaders.has(candidate.header)) continue;
    mapping[candidate.field] = candidate.header;
    usedHeaders.add(candidate.header);
  }

  return mapping;
}

export function getImportedPedidosRows(
  rows: Record<string, unknown>[],
  mapping: Record<FieldKey, string>,
  extras: Record<string, ExtraMappingValue> = {},
  customColumns: Record<string, string> = {}
) {
  return rows
    .map((row) => {
      const cliente = mapping.cliente ? row[mapping.cliente]?.toString().trim() || '' : '';
      const fabricante = mapping.fabricante ? row[mapping.fabricante]?.toString().trim() || '' : '';
      const valor = mapping.valor ? parseNumber(row[mapping.valor]) : 0;
      const observacoes = mapping.observacoes ? row[mapping.observacoes]?.toString().trim() || '' : '';
      const status = mapping.status ? resolveImportedPedidoStatus(row[mapping.status]) : 'novo_lead';
      const data_pedido = mapping.data_pedido ? row[mapping.data_pedido]?.toString().trim() : undefined;

      const campos_extras: Record<string, string> = {};
      Object.entries(extras).forEach(([key, value]) => {
        const name = getExtraDisplayName(key, value);
        const directValue = row[name] ?? row[key];
        const mergedValue = getExtraHeaders(key, value).map((header) => row[header]).filter((item) => String(item ?? '').trim() !== '').join(' ');
        const v = String(directValue ?? mergedValue ?? '').trim();
        if (v !== '') campos_extras[name] = v;
      });
      // Colunas criadas do zero (valor padrão aplicado a todas as linhas)
      Object.entries(customColumns).forEach(([name, value]) => {
        const v = (value ?? '').toString().trim();
        if (v !== '' && name.trim()) campos_extras[name.trim()] = v;
      });

      return { cliente, fabricante, valor, observacoes, status, data_pedido, campos_extras };
    })
    .filter((row) => row.cliente && row.fabricante);
}