import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, ArrowRight, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { validateFile } from '@/lib/file-validation';
import { MappingStep, sanitizeImportedRows, type ExtraMappingValue } from '@/components/import/MappingStep';
import { ImportInstructionsStep } from '@/components/import/ImportInstructionsStep';
import { stringToEndereco, fetchCepData, maskCep, unmaskCep } from '@/lib/cep';
import { matchUsuarioByNome, type UsuarioLite } from '@/lib/import/match-usuario';

const IMPORT_ALLOWED_EXT = ['.xlsx', '.xls', '.csv'];

type FieldKey = 'empresa' | 'razao_social' | 'tipo' | 'cnpj' | 'email' | 'telefone' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep' | 'nome_contato' | 'cargo' | 'classificacao' | 'data_criacao' | 'criado_por';

const FIELDS: { key: FieldKey; label: string; required: boolean; forContatos?: boolean }[] = [
  { key: 'tipo', label: 'Tipo / Segmento', required: false },
  { key: 'cnpj', label: 'CNPJ / CPF', required: false },
  { key: 'empresa', label: 'Empresa/Nome Fantasia', required: false },
  { key: 'razao_social', label: 'Razão social', required: false },
  { key: 'nome_contato', label: 'Contato da empresa', required: false },
  { key: 'cargo', label: 'Cargo', required: false, forContatos: true },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'logradouro', label: 'Logradouro / Rua', required: false },
  { key: 'numero', label: 'Número', required: false },
  { key: 'complemento', label: 'Complemento', required: false },
  { key: 'bairro', label: 'Bairro', required: false },
  { key: 'cidade', label: 'Cidade', required: false },
  { key: 'uf', label: 'UF', required: false },
  { key: 'cep', label: 'CEP', required: false },
  { key: 'classificacao', label: 'Classificação', required: false },
  { key: 'data_criacao', label: 'Data de Criação', required: false },
  { key: 'criado_por', label: 'Criado por', required: false },
];

const TIPO_MAP: Record<string, string> = {
  construtora: 'construtora',
  loja: 'loja',
  'pessoa física': 'pessoa fisica',
  'pessoa fisica': 'pessoa fisica',
  pessoa_fisica: 'pessoa fisica',
  pf: 'pessoa fisica',
  condomínio: 'condominio',
  condominio: 'condominio',
  hospital: 'hospital',
  distribuidor: 'distribuidor',
  hotel: 'hotel',
  escola: 'escola',
  instalador: 'instalador',
};

const FIELD_EXAMPLES: Partial<Record<FieldKey, string>> = {
  empresa: 'Construtora Exemplo Ltda',
  nome_contato: 'João Silva',
  razao_social: 'Construtora Exemplo Ltda',
  tipo: 'construtora',
  cnpj: '00.000.000/0001-00',
  email: 'contato@exemplo.com.br',
  telefone: '(11) 91234-5678',
  logradouro: 'Rua Exemplo',
  numero: '123',
  complemento: 'Sala 4',
  bairro: 'Centro',
  cidade: 'São Paulo',
  uf: 'SP',
  cep: '01000-000',
  cargo: 'Comprador',
  classificacao: 'A',
  data_criacao: '2026-01-15',
  criado_por: 'João Silva',
};

function normalizeText(v: string): string {
  return v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const AUTO_RULES: Record<FieldKey, RegExp[]> = {
  empresa: [/^empresa$/, /^nome\s*fantasia$/, /^nome\s*da\s*empresa$/, /^razao\s*social$/, /empresa/, /fantasia/],
  razao_social: [/^razao\s*social$/, /razao/],
  tipo: [/^tipo$/, /segmento/, /segemento/, /segmento\s*de\s*atuacao/, /segemento\s*de\s*atuacao/, /categoria/],
  cnpj: [/^cnpj$/, /^cpf$/, /cpf.*cnpj/, /cnpj/, /cpf/],
  email: [/^e-?mail$/, /mail/],
  telefone: [/^telefone$/, /^telefone\s*de\s*trabalho$/, /^fone$/, /^celular$/, /^tel$/, /telefone/, /celular/, /fone/],
  logradouro: [/^logradouro$/, /^rua$/, /logradouro/, /rua/, /address/, /endereco/],
  numero: [/^numero$/, /numero/, /number/, /num/],
  complemento: [/^complemento$/, /complemento/],
  bairro: [/^bairro$/, /bairro/, /neighborhood/, /suburb/],
  cidade: [/^cidade$/, /cidade/, /city/],
  uf: [/^uf$/, /^estado$/, /uf/, /estado/, /state/],
  cep: [/^cep$/, /cep/, /zip/, /postcode/],
  nome_contato: [
    /^nome$/, /^nome\s*completo$/, /^primeiro\s*nome$/, /^first\s*name$/, /^full\s*name$/, /^nome\s*proprio$/,
    /^nome\s*contato$/, /^nome\s*do\s*contato$/, /^contato\s*da\s*empresa$/, /^responsavel$/, /^pessoa$/,
    /^contato\s*principal$/, /^contato$/,
    /responsavel/, /^nome\b/, /first.*name/, /full.*name/
  ],
  cargo: [/^cargo$/, /cargo/, /funcao/, /posicao/],
  classificacao: [/^classificacao$/, /^classificacao.*cliente$/, /^rank$/, /^ranking$/, /^score$/, /classificacao/],
  data_criacao: [/^data\s*criacao$/, /^criado$/, /^criado\s*em$/, /^data\s*cadastro$/],
  criado_por: [/^criado\s*por$/, /^created\s*by$/, /criado\s*por/, /created\s*by/],
};

function autoDetectMapping(headers: string[], fields: { key: FieldKey; label: string }[]): Record<FieldKey, string> {
  const result: Record<FieldKey, string> = {
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
    telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
    cidade: '', uf: '', cep: '',
    nome_contato: '', cargo: '',
    classificacao: '', data_criacao: '', criado_por: '',
  };

  const used = new Set<string>();
  
  // Usar regras específicas primeiro para garantir precisão
  fields.forEach(f => {
    const field = f.key;
    for (const h of headers) {
      if (used.has(h)) continue;
      const norm = normalizeText(h);
      if (AUTO_RULES[field].some(r => r.test(norm))) {
        result[field] = h;
        used.add(h);
        break;
      }
    }
  });

  return result;
}

function autoDetectExtras(headers: string[], mappedHeaders: Iterable<string>) {
  const used = new Set(mappedHeaders);
  const extraRules = [/vendedor/, /responsavel\s*cadastro/, /origem/, /setor/, /departamento/];
  const observationsRules = [/observacoes/, /obs/, /nota/, /observacao/];
  
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (used.has(header)) return acc;
    const norm = normalizeText(header);
    
    // Prioriza regras normais
    if (extraRules.some(rule => rule.test(norm))) {
      acc[header] = header.trim();
    } 
    // Regras de observações (usando \b para evitar conflito com contato)
    else if (observationsRules.some(rule => rule.test(norm))) {
      // Se a regra for /nota/, usamos \b para ser exato
      if (norm.includes('nota') && !/\bnota\b/.test(norm)) return acc;
      acc[header] = header.trim();
    }
    
    return acc;
  }, {});
}

interface EnderecoRow {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

// Quando a linha só trouxe o CEP (sem logradouro/bairro/cidade mapeados ou preenchidos),
// busca o endereço via BrasilAPI e completa os demais campos. Deduplica por CEP e limita
// a concorrência para não disparar centenas de requisições de uma vez em importações grandes.
async function enrichRowsWithCep<T extends EnderecoRow>(rows: T[]): Promise<T[]> {
  const pendentes = rows.filter(r => r.cep && !(r.logradouro && r.bairro && r.cidade));
  const cepsUnicos = Array.from(new Set(
    pendentes.map(r => unmaskCep(r.cep!)).filter(d => d.length === 8)
  ));
  if (cepsUnicos.length === 0) return rows;

  const cache = new Map<string, Awaited<ReturnType<typeof fetchCepData>> | null>();
  const CONCURRENCY = 6;
  let cursor = 0;
  const worker = async () => {
    while (cursor < cepsUnicos.length) {
      const digits = cepsUnicos[cursor++];
      try {
        cache.set(digits, await fetchCepData(digits));
      } catch {
        cache.set(digits, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cepsUnicos.length) }, worker));

  return rows.map(row => {
    if (!row.cep) return row;
    const digits = unmaskCep(row.cep);
    if (digits.length !== 8) return row;
    if (row.logradouro && row.bairro && row.cidade) return row;
    const data = cache.get(digits);
    if (!data) return row;
    return {
      ...row,
      cep: maskCep(digits),
      logradouro: row.logradouro || data.street || row.logradouro,
      bairro: row.bairro || data.neighborhood || row.bairro,
      cidade: row.cidade || data.city || row.cidade,
      uf: row.uf || data.state || row.uf,
    };
  });
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

  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string | string[]>>({
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
    telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
    cidade: '', uf: '', cep: '',
    nome_contato: '', cargo: '',
    classificacao: '', data_criacao: '', criado_por: '',
  });
  const [fieldDefaultValues, setFieldDefaultValues] = useState<Record<string, string>>({});
  // extras: column name (planilha) -> nome no sistema (campos_extras)
  const [extras, setExtras] = useState<Record<string, ExtraMappingValue>>({});
  // customColumns: nome → valor padrão (colunas criadas do zero, não vêm da planilha)
  const [customColumns, setCustomColumns] = useState<Record<string, string>>({});
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(() => {
    return localStorage.getItem(`import_clientes_${target}_autosave`) === 'true';
  });
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [enrichingCep, setEnrichingCep] = useState(false);
  const [step, setStep] = useState<'instructions' | 'upload' | 'mapping' | 'preview'>('instructions');
  const [previewRowsSnapshot, setPreviewRowsSnapshot] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // Usuários da empresa para vincular "Criado por" a um nome já cadastrado no sistema
  // (RLS já escopa por empresa — não precisa filtrar por empresa_id aqui).
  const { data: usuariosEmpresa } = useQuery({
    queryKey: ['usuarios_empresa_nomes'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios').select('id, nome');
      if (error) throw error;
      return (data ?? []) as UsuarioLite[];
    },
  });

  const visibleFields = useMemo(
    () => FIELDS.filter(f => target === 'contatos' || !f.forContatos),
    [target]
  );

  const templateFields = useMemo(
    () => visibleFields.map(f => ({ label: f.label, example: FIELD_EXAMPLES[f.key] })),
    [visibleFields]
  );

  const reset = () => {
    setRawData([]);
    setHeaders([]);
    setMapping({
      empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
      telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
      cidade: '', uf: '', cep: '',
      nome_contato: '', cargo: '',
      classificacao: '', data_criacao: '', criado_por: '',
    });
    setFieldDefaultValues({});
    setExtras({});
    setCustomColumns({});
    setFileName('');
    setStep('instructions');
    setPreviewRowsSnapshot([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveAsDefault = (active: boolean) => {
    setIsAutoSaveEnabled(active);
    const key = `import_clientes_${target}_`;
    localStorage.setItem(`${key}autosave`, String(active));
    
    if (active) {
      localStorage.setItem(`${key}mapping`, JSON.stringify(mapping));
      localStorage.setItem(`${key}defaults`, JSON.stringify(fieldDefaultValues));
      localStorage.setItem(`${key}custom`, JSON.stringify(customColumns));
      toast.success('Mapeamento e valores padrões serão salvos automaticamente.');
    } else {
      toast.info('Alterações não serão salvas como padrão.');
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

      const cols = Array.from(new Set(json.flatMap(r => Object.keys(r))));
      setRawData(json);
      setHeaders(cols);

      const auto = autoDetectMapping(cols, visibleFields);
      setMapping(auto);
      setExtras(autoDetectExtras(cols, Object.values(auto).filter(Boolean)));
      setCustomColumns({});
      setFieldDefaultValues({});

      const key = `import_clientes_${target}_`;
      const savedMapping = localStorage.getItem(`${key}mapping`);
      const savedDefaults = localStorage.getItem(`${key}defaults`);
      const savedCustom = localStorage.getItem(`${key}custom`);

      if (savedMapping) {
        const parsed = JSON.parse(savedMapping);
        const mergedMapping = { ...auto };
        Object.entries(parsed).forEach(([k, v]) => {
          if (v && cols.includes(v as string)) {
            mergedMapping[k as FieldKey] = v as string;
          }
        });
        setMapping(mergedMapping);
      }

      if (savedDefaults) setFieldDefaultValues(JSON.parse(savedDefaults));
      if (savedCustom) setCustomColumns(JSON.parse(savedCustom));

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

  const hasValue = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  };

  const mergeExtraFields = (
    current: Record<string, string> = {},
    incoming: Record<string, string> = {},
  ) => {
    const merged = { ...current };
    Object.entries(incoming).forEach(([key, value]) => {
      if (hasValue(value)) merged[key] = value;
    });
    return merged;
  };

  const mergeRowsByCnpj = (rows: ReturnType<typeof getMappedRowsBase>) => {
    const grouped = new Map<string, (typeof rows)[number]>();
    const result: typeof rows = [];

    rows.forEach((row) => {
      const cnpjKey = row.cnpj?.trim();
      if (!cnpjKey) {
        result.push(row);
        return;
      }

      const existing = grouped.get(cnpjKey);
      if (!existing) {
        const cloned = {
          ...row,
          campos_extras: { ...(row.campos_extras || {}) },
        };
        grouped.set(cnpjKey, cloned);
        result.push(cloned);
        return;
      }

      (Object.keys(row) as Array<keyof typeof row>).forEach((key) => {
        if (key === 'campos_extras') {
          existing.campos_extras = mergeExtraFields(existing.campos_extras, row.campos_extras);
          return;
        }

        const incomingValue = row[key];
        if (hasValue(incomingValue)) {
          existing[key] = incomingValue;
        }
      });
    });

    return result;
  };

  const getMappedRowsBase = (sanitizedRows = sanitizeImportedRows({ rawData, fields: visibleFields, mapping, extras, customColumns, fieldDefaultValues }), shouldFilter = true) => {
    const mapped = sanitizedRows
      .map(row => {
        const get = (k: FieldKey) => (row[k] ?? '').toString().trim();
        const empresa = get('empresa');
        const razao_social = get('razao_social');
        const cnpj = get('cnpj');
        const nome_contato = get('nome_contato');
        const tipoRaw = get('tipo');

        // Resolve o nome da empresa usando fallbacks se necessário
        let resolvedEmpresa = empresa;
        if (!resolvedEmpresa) {
          if (target === 'contatos') {
            resolvedEmpresa = nome_contato ? 'Sem empresa' : '';
          } else {
            resolvedEmpresa = razao_social || cnpj || '';
          }
        }

        // Se a coluna de logradouro veio com o endereço inteiro em um único campo
        // (ex: "Rua X, 320, Bairro Y, Cidade UF – CEP", comum em exports do Bitrix24)
        // e os campos estruturados não foram mapeados/preenchidos separadamente,
        // distribui automaticamente para número/bairro/cidade/UF/CEP.
        let logradouro = get('logradouro') || undefined;
        let numero = get('numero') || undefined;
        let complemento = get('complemento') || undefined;
        let bairro = get('bairro') || undefined;
        let cidade = get('cidade') || undefined;
        let uf = get('uf') || undefined;
        let cep = get('cep') || undefined;

        if (logradouro && logradouro.includes(',') && !(numero && bairro && cidade)) {
          const parsed = stringToEndereco(logradouro);
          logradouro = parsed.logradouro || logradouro;
          numero = numero || parsed.numero || undefined;
          complemento = complemento || parsed.complemento || undefined;
          bairro = bairro || parsed.bairro || undefined;
          cidade = cidade || parsed.cidade || undefined;
          uf = uf || parsed.uf || undefined;
          cep = cep || parsed.cep || undefined;
        }

        // "Criado por" vira a FK clientes.criado_por_usuario_id quando o nome da planilha
        // bate com um usuário da empresa (tolera acento/maiúscula/pequena variação de
        // digitação). Sem match, guarda o texto original em campos_extras para revisão
        // manual depois — igual ao que já é feito para "Vendedor" na importação de negócios.
        const criadoPorRaw = get('criado_por');
        const criadoPorMatch = criadoPorRaw ? matchUsuarioByNome(criadoPorRaw, usuariosEmpresa ?? []) : null;
        const camposExtras = { ...(row.campos_extras as Record<string, string> || {}) };
        if (criadoPorRaw && !criadoPorMatch?.exact) camposExtras['Criado por Original'] = criadoPorRaw;

        return {
          empresa: resolvedEmpresa,
          razao_social: razao_social || undefined,
          tipo: TIPO_MAP[tipoRaw.toLowerCase()] || (tipoRaw ? tipoRaw.toLowerCase() : undefined),
          cnpj: cnpj || undefined,
          email: get('email') || undefined,
          telefone: get('telefone') || undefined,
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          uf,
          cep,
          nome_contato: nome_contato || undefined,
          cargo: get('cargo') || undefined,
          classificacao: get('classificacao') || undefined,
          data_criacao: get('data_criacao') || undefined,
          criado_por_usuario_id: criadoPorMatch?.usuarioId,
          // Só para exibição na prévia — preparedBatch monta o payload de insert campo a
          // campo, então essa chave extra nunca chega a ser gravada no banco.
          criado_por_nome: criadoPorMatch ? criadoPorMatch.usuarioNome : criadoPorRaw || undefined,
          campos_extras: camposExtras,
        };
      });
    
    if (!shouldFilter) return mapped;
    return mapped.filter(r => target === 'contatos' ? (r.empresa || r.nome_contato) : (r.empresa || r.razao_social || r.cnpj));
  };

  const getMappedRows = (sanitizedRows?: ReturnType<typeof sanitizeImportedRows>) => {
    const mappedRows = getMappedRowsBase(sanitizedRows);
    return target === 'empresas' ? mergeRowsByCnpj(mappedRows) : mappedRows;
  };

  // Mostra a prévia imediatamente com o que já foi mapeado e, em segundo plano,
  // completa por CEP as linhas de empresa que só trouxeram o CEP.
  const advanceToPreview = (sanitizedRows?: ReturnType<typeof sanitizeImportedRows>) => {
    const mapped = getMappedRows(sanitizedRows);
    if (mapped.length === 0) {
      toast.error('Nenhum registro válido com o mapeamento atual');
      return false;
    }
    setPreviewRowsSnapshot(mapped);
    setStep('preview');

    if (target === 'empresas') {
      setEnrichingCep(true);
      enrichRowsWithCep(mapped)
        .then(setPreviewRowsSnapshot)
        .finally(() => setEnrichingCep(false));
    }
    return true;
  };

  const canProceed = Boolean(mapping.empresa) || Boolean(mapping.razao_social) || Boolean(mapping.cnpj) || Boolean(mapping.nome_contato) || Boolean(mapping.email);

  const previewRows = useMemo(() => (step === 'preview' ? previewRowsSnapshot : []), [step, previewRowsSnapshot]);

  // Lista de campos extras únicos para mostrar no preview (com nome final) — "Criado por"
  // tem coluna própria na prévia (não é genérico), então não entra nessa lista. "Criado por
  // Original" também fica de fora: já aparece dentro da própria coluna "Criado por" quando
  // não há match, não precisa duplicar como campo extra genérico.
  const extraFieldNames = useMemo(
    () => Array.from(new Set(previewRowsSnapshot.flatMap(row => Object.keys(row.campos_extras || {}))))
      .filter(name => name !== 'Criado por' && name !== 'Criado por Original'),
    [previewRowsSnapshot]
  );

  const handleImport = async () => {
    const allRows = getMappedRows();
    const rows = previewRowsSnapshot.length > 0 ? [...previewRowsSnapshot] : allRows;
    const ignoredRows = rawData.filter((_, index) => {
      const mappedRow = allRows[index];
      if (!mappedRow) return true;
      return target === 'contatos' 
        ? !(mappedRow.empresa || mappedRow.nome_contato) 
        : !(mappedRow.empresa || mappedRow.razao_social || mappedRow.cnpj);
    });

    if (rows.length === 0) {
      toast.error('Nenhum registro válido após o mapeamento');
      return;
    }

    setImporting(true);

    try {
      const { data: vid, error: rpcError } = await supabase.rpc('get_my_vendedor_id');
      if (rpcError || !vid) {
        console.error('Erro ao buscar ID do usuário:', rpcError);
        throw new Error('Não foi possível identificar seu perfil de usuário. Verifique se seu cadastro está completo.');
      }

      // Salvar linhas ignoradas para revisão posterior
      if (ignoredRows.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const ignoredBatch = ignoredRows.map(row => ({
            usuario_id: user.id,
            tipo_importacao: `clientes_${target}`,
            dados_originais: row,
            motivo_ignorado: target === 'contatos' ? 'Falta Empresa ou Nome' : 'Falta Empresa, Razão Social ou CNPJ'
          }));
          
          const { error: ignoreError } = await supabase
            .from('linhas_ignoradas_importacao')
            .insert(ignoredBatch);
          
          if (ignoreError) console.error('Erro ao salvar linhas ignoradas:', ignoreError);
        }
      }

      // Resolve "Empresa do contato" (texto) para um cliente_id real quando o nome bate
      // com exatamente uma empresa já cadastrada — ambíguo (mais de uma) fica sem vínculo,
      // mantém só o texto (nunca adivinha errado). Sem nenhuma correspondência, cria a
      // empresa na hora (mesmo comportamento do import de Negócios via resolveClienteId),
      // para que os dois fluxos fiquem sincronizados.
      let clienteIdPorNomeEmpresa: Map<string, string> | null = null;
      if (target === 'contatos') {
        const { data: clientesExistentes, error: clientesError } = await supabase
          .from('clientes')
          .select('id, empresa');
        if (clientesError) throw clientesError;
        const contagemPorNome = new Map<string, number>();
        const idPorNome = new Map<string, string>();
        (clientesExistentes ?? []).forEach(c => {
          if (!c.empresa) return;
          const chave = c.empresa.trim().toLowerCase();
          contagemPorNome.set(chave, (contagemPorNome.get(chave) ?? 0) + 1);
          idPorNome.set(chave, c.id);
        });
        clienteIdPorNomeEmpresa = new Map(
          Array.from(idPorNome.entries()).filter(([chave]) => contagemPorNome.get(chave) === 1)
        );

        // Nomes de empresa citados nos contatos que não bateram com nenhum cliente
        // existente (chave ambígua não entra aqui) — precisam ser criados antes do
        // insert dos contatos, senão cliente_id ficaria null para toda empresa nova.
        // "Sem empresa" é o placeholder usado quando o contato não trouxe empresa
        // nenhuma (ver getMappedRowsBase) — nunca deve virar um cliente de verdade.
        const nomesParaCriar = new Map<string, string>();
        allRows.forEach(r => {
          const nome = r.empresa?.trim();
          if (!nome) return;
          const chave = nome.toLowerCase();
          if (chave === 'sem empresa') return;
          if (contagemPorNome.has(chave)) return; // já existe (única ou ambígua)
          if (!nomesParaCriar.has(chave)) nomesParaCriar.set(chave, nome);
        });

        if (nomesParaCriar.size > 0) {
          const novos = Array.from(nomesParaCriar.values());
          const { data: criados, error: criarError } = await supabase
            .from('clientes')
            .insert(novos.map(nome => ({ empresa: nome, tipo: 'cliente', usuario_id: vid })))
            .select('id, empresa');

          if (criarError) {
            // Lote falhou: cria um por um para maximizar aproveitamento
            for (const nome of novos) {
              const { data: single } = await supabase
                .from('clientes')
                .insert({ empresa: nome, tipo: 'cliente', usuario_id: vid })
                .select('id, empresa')
                .single();
              if (single) clienteIdPorNomeEmpresa.set(single.empresa!.trim().toLowerCase(), single.id);
            }
          } else {
            criados?.forEach(c => clienteIdPorNomeEmpresa!.set(c.empresa!.trim().toLowerCase(), c.id));
          }
        }
      }

      const BATCH = 500;
      let imported = 0;
      console.debug('[ImportClientes] preview snapshot usado na confirmação', rows.slice(0, 5));

      for (let i = 0; i < rows.length; i += BATCH) {
        if (target === 'contatos') {
          const batch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa || (r.nome_contato ? 'Sem empresa' : 'Sem empresa'),
            cliente_id: r.empresa ? clienteIdPorNomeEmpresa?.get(r.empresa.trim().toLowerCase()) || null : null,
            nome_contato: r.nome_contato || r.empresa || null,
            email: r.email || null,
            telefone: r.telefone || null,
            cargo: r.cargo || null,
            logradouro: r.logradouro || null,
            numero: r.numero || null,
            complemento: r.complemento || null,
            bairro: r.bairro || null,
            cidade: r.cidade || null,
            uf: r.uf || null,
            cep: r.cep || null,
            classificacao: r.classificacao || null,
            data_criacao: r.data_criacao || null,
            campos_extras: r.campos_extras || {},
            usuario_id: vid,
            criado_por_usuario_id: r.criado_por_usuario_id || null,
          }));
          console.debug('[ImportClientes] batch final contatos', batch.slice(0, 5));
          const { data: saved, error } = await supabase
            .from('contatos')
            .insert(batch)
            .select('id,empresa,cliente_id,nome_contato,email,telefone,cargo,logradouro,numero,complemento,bairro,cidade,uf,cep,classificacao,data_criacao,campos_extras,criado_por_usuario_id');
          if (error) throw error;
          console.debug('[ImportClientes] contatos salvos', saved?.slice(0, 5));
        } else {
          const preparedBatch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa,
            tipo: r.tipo || 'construtora',
            cnpj: r.cnpj || null,
            razao_social: r.razao_social || null,
            email: r.email || null,
            telefone: r.telefone || null,
            logradouro: r.logradouro || null,
            numero: r.numero || null,
            complemento: r.complemento || null,
            bairro: r.bairro || null,
            cidade: r.cidade || null,
            uf: r.uf || null,
            cep: r.cep || null,
            nome_contato: r.nome_contato || null,
            classificacao: r.classificacao || null,
            data_criacao: r.data_criacao || null,
            campos_extras: r.campos_extras || {},
            usuario_id: vid,
            criado_por_usuario_id: r.criado_por_usuario_id || null,
          }));

          const cnpjs = Array.from(new Set(preparedBatch.map(r => r.cnpj).filter(Boolean))) as string[];
          const existingByKey = new Map<string, any>();
          if (cnpjs.length > 0) {
            const { data: existingRows, error: existingError } = await supabase
              .from('clientes')
              .select('id,empresa,tipo,cnpj,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,nome_contato,classificacao,data_criacao,campos_extras,usuario_id,criado_por_usuario_id')
              .in('cnpj', cnpjs)
              .eq('usuario_id', vid);
            if (existingError) throw existingError;
            existingRows?.forEach(row => {
              if (row.cnpj) existingByKey.set(row.cnpj, row);
            });
          }

          const batch = preparedBatch.map((incoming) => {
            const existing = incoming.cnpj ? existingByKey.get(incoming.cnpj) : undefined;
            if (!existing) {
              return incoming;
            }
            return {
              id: existing.id,
              empresa: hasValue(incoming.empresa) ? incoming.empresa : existing.empresa,
              tipo: hasValue(incoming.tipo) ? incoming.tipo : existing.tipo || 'construtora',
              cnpj: incoming.cnpj,
              razao_social: hasValue(incoming.razao_social) ? incoming.razao_social : existing.razao_social,
              email: hasValue(incoming.email) ? incoming.email : existing.email,
              telefone: hasValue(incoming.telefone) ? incoming.telefone : existing.telefone,
              logradouro: hasValue(incoming.logradouro) ? incoming.logradouro : existing.logradouro,
              numero: hasValue(incoming.numero) ? incoming.numero : existing.numero,
              complemento: hasValue(incoming.complemento) ? incoming.complemento : existing.complemento,
              bairro: hasValue(incoming.bairro) ? incoming.bairro : existing.bairro,
              cidade: hasValue(incoming.cidade) ? incoming.cidade : existing.cidade,
              uf: hasValue(incoming.uf) ? incoming.uf : existing.uf,
              cep: hasValue(incoming.cep) ? incoming.cep : existing.cep,
              nome_contato: hasValue(incoming.nome_contato) ? incoming.nome_contato : existing.nome_contato,
              classificacao: hasValue(incoming.classificacao) ? incoming.classificacao : existing.classificacao,
              data_criacao: hasValue(incoming.data_criacao) ? incoming.data_criacao : existing.data_criacao,
              campos_extras: mergeExtraFields(existing.campos_extras || {}, incoming.campos_extras || {}),
              usuario_id: existing.usuario_id,
              criado_por_usuario_id: hasValue(incoming.criado_por_usuario_id) ? incoming.criado_por_usuario_id : existing.criado_por_usuario_id,
            };
          }) as any[];
          console.debug('[ImportClientes] batch final clientes', batch.slice(0, 5));
          const inserts = batch.filter(r => !r.id);
          const updates = batch.filter(r => r.id);

          let totalSaved: any[] = [];
          if (inserts.length > 0) {
            const { data: saved, error: insertError } = await supabase
              .from('clientes')
              .insert(inserts)
              .select('id,empresa,tipo,cnpj,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,nome_contato,classificacao,data_criacao,campos_extras,criado_por_usuario_id');
            if (insertError) throw insertError;
            totalSaved = totalSaved.concat(saved || []);
            console.debug('[ImportClientes] clientes novos inseridos', saved?.slice(0, 3));
          }
          if (updates.length > 0) {
            for (const row of updates) {
              const { id, ...updateData } = row;
              const { data: saved, error: updateError } = await supabase
                .from('clientes')
                .update(updateData)
                .eq('id', id)
                .select('id,empresa,tipo,cnpj,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,nome_contato,classificacao,data_criacao,campos_extras,criado_por_usuario_id');
              if (updateError) throw updateError;
              totalSaved = totalSaved.concat(saved || []);
            }
            console.debug('[ImportClientes] clientes existentes atualizados', updates.length);
          }
        }
        imported += rows.slice(i, i + BATCH).length;
        setImportProgress(Math.min(95, Math.floor((imported / rows.length) * 100)));
      }

      setImportProgress(100);

      qc.invalidateQueries({ queryKey: [target === 'contatos' ? 'contatos' : 'clientes'] });
      toast.success(`${imported} ${target === 'contatos' ? 'contatos' : 'clientes'} importados com sucesso!`);
      reset();
      setOpen(false);
    } catch (err: any) {
      console.error('Erro na importação:', err);
      let msg = err.message || 'erro desconhecido';
      if (msg.includes('row-level security')) {
        msg = 'Erro de permissão: você pode estar tentando atualizar um registro que pertence a outro usuário ou sua conta não tem permissão para esta ação.';
      }
      toast.error('Erro na importação: ' + msg);
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-muted/30 shrink-0 border-b flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2.5 text-foreground font-bold text-lg">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span>Importar {target === 'contatos' ? 'Contatos' : 'Empresas'}</span>
                <span className="text-xs font-normal text-muted-foreground">Adicione múltiplos registros de uma só vez</span>
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
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-1" />
                </div>
              )}
            </div>
          )}
        </DialogHeader>


        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {step === 'instructions' && (
            <ImportInstructionsStep
              templateFileName={`modelo-importacao-${target === 'contatos' ? 'contatos' : 'empresas'}.xlsx`}
              templateFields={templateFields}
              extraTips={target === 'contatos'
                ? ['Empresa ou Nome do contato precisam estar preenchidos em cada linha.']
                : ['Empresa, Razão Social ou CNPJ precisam estar preenchidos em cada linha.']}
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
              visibleFields={visibleFields}
              onReset={reset}
              onAutoDetect={() => {
                const auto = autoDetectMapping(headers, visibleFields);
                setMapping(auto);
                setExtras(autoDetectExtras(headers, Object.values(auto).filter(Boolean)));
              }}
              onClearAll={() => {
                setMapping({
                  empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
                  telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
                  cidade: '', uf: '', cep: '',
                  nome_contato: '', cargo: '',
                  classificacao: '', data_criacao: '', criado_por: '',
                });
                setExtras({});
                setCustomColumns({});
                setFieldDefaultValues({});
              }}
              onSaveAsDefault={saveAsDefault}
              isAutoSaveEnabled={isAutoSaveEnabled}
              canProceed={canProceed}
              onNext={(payload) => {
                advanceToPreview(payload);
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
                    {extraFieldNames.length > 0 && (
                      <Badge className="bg-accent/10 text-accent-foreground border-accent/20 text-[10px] font-bold py-0 h-5">
                        +{extraFieldNames.length} campo{extraFieldNames.length === 1 ? '' : 's'} extra{extraFieldNames.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {enrichingCep && (
                      <Badge variant="outline" className="text-[10px] font-bold py-0 h-5 bg-background gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Completando endereços pelo CEP...
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
                  <span className="text-xs font-bold text-amber-900">Verifique antes de importar</span>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Confira os dados na prévia abaixo. Registros existentes com o mesmo CNPJ serão atualizados, não duplicados.
                  </p>
                </div>
              </div>

              {extraFieldNames.length > 0 && (
                <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <span className="text-xs font-bold text-accent-foreground">Campos extras</span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed truncate" title={extraFieldNames.join(', ')}>
                      Serão salvos em <span className="font-medium">campos_extras</span>: {extraFieldNames.join(', ')}.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs sticky top-0 bg-muted/50">#</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Empresa</TableHead>
                    {target === 'contatos' && <TableHead className="text-xs sticky top-0 bg-muted/50">Contato</TableHead>}
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">Tipo</TableHead>}
                    <TableHead className="text-xs sticky top-0 bg-muted/50">CNPJ</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Email</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Telefone</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Classif.</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-muted/50">Criado</TableHead>
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">Logradouro</TableHead>}
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">Bairro</TableHead>}
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">Cidade</TableHead>}
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">UF</TableHead>}
                    {target === 'contatos' && <TableHead className="text-xs sticky top-0 bg-muted/50">Cargo</TableHead>}
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">Criado por</TableHead>}
                    {extraFieldNames.map(name => (
                      <TableHead key={name} className="text-xs sticky top-0 bg-muted/50">{name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{r.empresa}</TableCell>
                      {target === 'contatos' && <TableCell className="text-xs whitespace-nowrap">{r.nome_contato || '-'}</TableCell>}
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap">{r.tipo}</TableCell>}
                      <TableCell className="text-xs whitespace-nowrap">{r.cnpj || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.email || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.telefone || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.classificacao || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{r.data_criacao || '-'}</TableCell>
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap max-w-[200px] truncate">{r.logradouro || '-'}</TableCell>}
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap">{r.bairro || '-'}</TableCell>}
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap">{r.cidade || '-'}</TableCell>}
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap">{r.uf || '-'}</TableCell>}
                      {target === 'contatos' && <TableCell className="text-xs whitespace-nowrap">{r.cargo || '-'}</TableCell>}
                      {target === 'empresas' && (
                        <TableCell className="text-xs whitespace-nowrap max-w-[160px]">
                          {r.criado_por_nome ? (
                            r.criado_por_usuario_id ? (
                              <span className="inline-flex items-center gap-1 truncate" title="Vinculado a um usuário da empresa">
                                <UserCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
                                <span className="truncate">{r.criado_por_nome}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 truncate text-muted-foreground" title="Nenhum usuário da empresa bate com esse nome — fica só como texto">
                                <UserX className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                <span className="truncate">{r.criado_por_nome}</span>
                              </span>
                            )
                          ) : '-'}
                        </TableCell>
                      )}
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

          </div>
        )}
        </div>

        {step === 'mapping' && (
          <div className="flex justify-end items-center gap-3 border-t bg-muted/30 px-6 py-4 shrink-0">
            <Button variant="ghost" onClick={reset}>Cancelar</Button>
            <Button
              onClick={() => advanceToPreview()}
              className="h-10 px-6 font-bold shadow-lg shadow-primary/20"
              disabled={!canProceed}
            >
              Revisar Importação <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex justify-end items-center gap-3 border-t bg-muted/30 px-6 py-4 shrink-0">
            <Button variant="ghost" onClick={() => setStep('mapping')} disabled={importing}>Voltar</Button>
            <Button onClick={handleImport} disabled={importing || enrichingCep} className="h-10 px-6 font-bold shadow-lg shadow-primary/20">
              {importing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
              ) : enrichingCep ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Completando endereços...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Importar {previewRows.length} {target === 'contatos' ? 'contatos' : 'empresas'}</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

