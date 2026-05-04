import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { validateFile } from '@/lib/file-validation';
import { MappingStep, sanitizeImportedRows } from '@/components/import/MappingStep';

const IMPORT_ALLOWED_EXT = ['.xlsx', '.xls', '.csv'];

type FieldKey = 'empresa' | 'razao_social' | 'tipo' | 'cnpj' | 'email' | 'telefone' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep' | 'nome_contato' | 'sobrenome_contato' | 'cargo' | 'classificacao' | 'data_criacao';

const FIELDS: { key: FieldKey; label: string; required: boolean; forContatos?: boolean }[] = [
  { key: 'empresa', label: 'Empresa', required: false },
  { key: 'nome_contato', label: 'Nome', required: false },
  { key: 'sobrenome_contato', label: 'Sobrenome', required: false },
  { key: 'razao_social', label: 'Razão social', required: false },
  { key: 'tipo', label: 'Tipo / Segmento', required: false },
  { key: 'cnpj', label: 'CNPJ / CPF', required: false },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'logradouro', label: 'Logradouro / Rua', required: false },
  { key: 'numero', label: 'Número', required: false },
  { key: 'complemento', label: 'Complemento', required: false },
  { key: 'bairro', label: 'Bairro', required: false },
  { key: 'cidade', label: 'Cidade', required: false },
  { key: 'uf', label: 'UF', required: false },
  { key: 'cep', label: 'CEP', required: false },
  { key: 'cargo', label: 'Cargo', required: false, forContatos: true },
  { key: 'classificacao', label: 'Classificação', required: false },
  { key: 'data_criacao', label: 'Data de Criação', required: false },
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

function normalizeText(v: string): string {
  return v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const AUTO_RULES: Record<FieldKey, RegExp[]> = {
  empresa: [/^empresa$/, /^nome\s*fantasia$/, /^nome\s*da\s*empresa$/, /^razao\s*social$/, /empresa/, /fantasia/],
  razao_social: [/^razao\s*social$/, /razao/],
  tipo: [/^tipo$/, /segmento/, /segemento/, /segmento\s*de\s*atuacao/, /segemento\s*de\s*atuacao/, /categoria/],
  cnpj: [/^cnpj$/, /^cpf$/, /cpf.*cnpj/, /cnpj/, /cpf/],
  email: [/^e-?mail$/, /mail/],
  telefone: [/^telefone$/, /^telefone\s*de\s*trabalho$/, /^fone$/, /^celular$/, /^tel$/, /telefone/, /celular/, /fone/, /\btel\b/],
  logradouro: [/^logradouro$/, /^rua$/, /logradouro/, /rua/, /address/, /endereco/],
  numero: [/^numero$/, /numero/, /number/, /num/],
  complemento: [/^complemento$/, /complemento/],
  bairro: [/^bairro$/, /bairro/, /neighborhood/, /suburb/],
  cidade: [/^cidade$/, /cidade/, /city/],
  uf: [/^uf$/, /^estado$/, /uf/, /estado/, /state/],
  cep: [/^cep$/, /cep/, /zip/, /postcode/],
  nome_contato: [
    /^nome$/, /^nome\s*completo$/, /^primeiro\s*nome$/, /^first\s*name$/, /^full\s*name$/, /^nome\s*proprio$/,
    /^contato$/, /^nome\s*contato$/, /^nome\s*do\s*contato$/, /^responsavel$/, /^pessoa$/,
    /^contato\s*principal$/,
    /contato/, /responsavel/, /^nome\b/, /first.*name/, /full.*name/
  ],
  sobrenome_contato: [
    /^sobrenome$/, /^ultimo\s*nome$/, /^last\s*name$/, /^surname$/, /^apelido$/,
    /sobrenome/, /last.*name/, /surname/,
  ],
  cargo: [/^cargo$/, /cargo/, /funcao/, /posicao/],
  classificacao: [/^classificacao$/, /^classificacao.*cliente$/, /^rank$/, /^ranking$/, /^score$/, /classificacao/],
  data_criacao: [/^data\s*criacao$/, /^criado$/, /^criado\s*em$/, /^data\s*cadastro$/],
};

function autoDetectMapping(headers: string[], fields: { key: FieldKey; label: string }[]): Record<FieldKey, string> {
  const result: Record<FieldKey, string> = {
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
    telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
    cidade: '', uf: '', cep: '',
    nome_contato: '', sobrenome_contato: '', cargo: '',
    classificacao: '', data_criacao: '',
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
  const extraRules = [/^criado\s*por$/, /^created\s*by$/, /vendedor/, /responsavel\s*cadastro/, /origem/, /observacoes/, /obs/, /nota/, /setor/, /departamento/];
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (used.has(header)) return acc;
    const norm = normalizeText(header);
    if (extraRules.some(rule => rule.test(norm))) acc[header] = header.trim();
    return acc;
  }, {});
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
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
    telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
    cidade: '', uf: '', cep: '',
    nome_contato: '', sobrenome_contato: '', cargo: '',
    classificacao: '', data_criacao: '',
  });
  const [fieldDefaultValues, setFieldDefaultValues] = useState<Record<string, string>>({});
  // extras: column name (planilha) -> nome no sistema (campos_extras)
  const [extras, setExtras] = useState<Record<string, string>>({});
  // customColumns: nome → valor padrão (colunas criadas do zero, não vêm da planilha)
  const [customColumns, setCustomColumns] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [previewRowsSnapshot, setPreviewRowsSnapshot] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const visibleFields = useMemo(
    () => FIELDS.filter(f => target === 'contatos' || !f.forContatos),
    [target]
  );

  const reset = () => {
    setRawData([]);
    setHeaders([]);
    setMapping({
      empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
      telefone: '', logradouro: '', numero: '', complemento: '', bairro: '',
      cidade: '', uf: '', cep: '',
      nome_contato: '', sobrenome_contato: '', cargo: '',
      classificacao: '', data_criacao: '',
    });
    setExtras({});
    setCustomColumns({});
    setFileName('');
    setStep('upload');
    setPreviewRowsSnapshot([]);
    if (fileRef.current) fileRef.current.value = '';
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

  const getMappedRowsBase = (sanitizedRows = sanitizeImportedRows({ rawData, fields: visibleFields, mapping, extras, customColumns })) => {
    return sanitizedRows
      .map(row => {
        const get = (k: FieldKey) => (row[k] ?? '').toString().trim();
        const empresa = get('empresa');
        const razao_social = get('razao_social');
        const cnpj = get('cnpj');
        const primeiro = get('nome_contato');
        const sobrenome = get('sobrenome_contato');
        const nome_contato = [primeiro, sobrenome].filter(Boolean).join(' ').trim();
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

        return {
          empresa: resolvedEmpresa,
          razao_social: razao_social || undefined,
          tipo: TIPO_MAP[tipoRaw.toLowerCase()] || (tipoRaw ? tipoRaw.toLowerCase() : undefined),
          cnpj: cnpj || undefined,
          email: get('email') || undefined,
          telefone: get('telefone') || undefined,
          logradouro: get('logradouro') || undefined,
          numero: get('numero') || undefined,
          complemento: get('complemento') || undefined,
          bairro: get('bairro') || undefined,
          cidade: get('cidade') || undefined,
          uf: get('uf') || undefined,
          cep: get('cep') || undefined,
          nome_contato: nome_contato || undefined,
          cargo: get('cargo') || undefined,
          classificacao: get('classificacao') || undefined,
          data_criacao: get('data_criacao') || undefined,
          campos_extras: (row.campos_extras as Record<string, string>) || {},
        };
      })
      .filter(r => target === 'contatos' ? (r.empresa || r.nome_contato) : (r.empresa || r.razao_social || r.cnpj));
  };

  const getMappedRows = (sanitizedRows?: ReturnType<typeof sanitizeImportedRows>) => {
    const mappedRows = getMappedRowsBase(sanitizedRows);
    return target === 'empresas' ? mergeRowsByCnpj(mappedRows) : mappedRows;
  };

  const canProceed = Boolean(mapping.empresa) || Boolean(mapping.razao_social) || Boolean(mapping.cnpj) || Boolean(mapping.nome_contato) || Boolean(mapping.sobrenome_contato) || Boolean(mapping.email);

  const previewRows = useMemo(() => (step === 'preview' ? previewRowsSnapshot : []), [step, previewRowsSnapshot]);

  // Lista de campos extras únicos para mostrar no preview (com nome final)
  const extraFieldNames = useMemo(
    () => Array.from(new Set(previewRowsSnapshot.flatMap(row => Object.keys(row.campos_extras || {})))),
    [previewRowsSnapshot]
  );

  const handleImport = async () => {
    const rows = previewRowsSnapshot.length > 0 ? [...previewRowsSnapshot] : getMappedRows();
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
      const BATCH = 500;
      let imported = 0;
      console.debug('[ImportClientes] preview snapshot usado na confirmação', rows.slice(0, 5));

      for (let i = 0; i < rows.length; i += BATCH) {
        if (target === 'contatos') {
          const batch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa || (r.nome_contato ? 'Sem empresa' : 'Sem empresa'),
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
          }));
          console.debug('[ImportClientes] batch final contatos', batch.slice(0, 5));
          const { data: saved, error } = await supabase
            .from('contatos')
            .insert(batch)
            .select('id,empresa,nome_contato,email,telefone,cargo,logradouro,numero,complemento,bairro,cidade,uf,cep,classificacao,data_criacao,campos_extras');
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
          }));

          const cnpjs = Array.from(new Set(preparedBatch.map(r => r.cnpj).filter(Boolean))) as string[];
          const existingByKey = new Map<string, any>();
          if (cnpjs.length > 0) {
            const { data: existingRows, error: existingError } = await supabase
              .from('clientes')
              .select('id,empresa,tipo,cnpj,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,nome_contato,classificacao,data_criacao,campos_extras,usuario_id')
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
              .select('id,empresa,tipo,cnpj,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,nome_contato,classificacao,data_criacao,campos_extras');
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
                .select('id,empresa,tipo,cnpj,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,nome_contato,classificacao,data_criacao,campos_extras');
              if (updateError) throw updateError;
              totalSaved = totalSaved.concat(saved || []);
            }
            console.debug('[ImportClientes] clientes existentes atualizados', updates.length);
          }
        }
        imported += rows.slice(i, i + BATCH).length;
      }

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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar {target === 'contatos' ? 'Contatos' : 'Empresas'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Badge variant={step === 'upload' ? 'default' : 'secondary'} className="text-xs">
            1. Origem
          </Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 'mapping' ? 'default' : 'secondary'} className="text-xs">2. Mapear Colunas</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 'preview' ? 'default' : 'secondary'} className="text-xs">3. Confirmar</Badge>
        </div>

        {step === 'upload' && (
          <div
            className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
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

        {step === 'mapping' && (
          <MappingStep
            fileName={fileName}
            rawData={rawData}
            headers={headers}
            mapping={mapping}
            setMapping={setMapping as React.Dispatch<React.SetStateAction<Record<string, string>>>}
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
                nome_contato: '', sobrenome_contato: '', cargo: '',
                classificacao: '', data_criacao: '',
              });
              setExtras({});
              setCustomColumns({});
            }}
            canProceed={canProceed}
            onNext={(payload) => {
              const mapped = getMappedRows(payload);
              if (mapped.length === 0) {
                toast.error('Nenhum registro válido com o mapeamento atual');
                return;
              }
              setPreviewRowsSnapshot(mapped);
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
                <Badge variant="outline">{previewRows.length} registros</Badge>
                {extraFieldNames.length > 0 && (
                  <Badge className="bg-accent text-accent-foreground border-accent">
                    +{extraFieldNames.length} coluna{extraFieldNames.length === 1 ? '' : 's'} extra{extraFieldNames.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                <X className="h-4 w-4 mr-1" /> Voltar ao mapeamento
              </Button>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Verifique os dados antes de importar.{' '}
              {extraFieldNames.length > 0 && (
                <span>
                  Colunas extras serão salvas em <span className="font-medium">campos_extras</span>: {extraFieldNames.join(', ')}.
                </span>
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
                    {extraFieldNames.map(name => (
                      <TableHead key={name} className="text-xs sticky top-0 bg-muted/50">{name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px] text-muted-foreground">{i + 1}</TableCell>
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
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Importar {previewRows.length} {target === 'contatos' ? 'contatos' : 'empresas'}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

