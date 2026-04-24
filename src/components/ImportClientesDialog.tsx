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
import { MappingStep } from '@/components/import/MappingStep';

const IMPORT_ALLOWED_EXT = ['.xlsx', '.xls', '.csv'];

type FieldKey = 'empresa' | 'razao_social' | 'tipo' | 'cnpj' | 'email' | 'telefone' | 'endereco' | 'nome_contato' | 'sobrenome_contato' | 'cargo' | 'classificacao' | 'data_criacao';

const FIELDS: { key: FieldKey; label: string; required: boolean; forContatos?: boolean }[] = [
  { key: 'empresa', label: 'Empresa', required: false },
  { key: 'nome_contato', label: 'Nome', required: false },
  { key: 'sobrenome_contato', label: 'Sobrenome', required: false },
  { key: 'razao_social', label: 'Razão social', required: false },
  { key: 'tipo', label: 'Tipo / Segmento', required: false },
  { key: 'cnpj', label: 'CNPJ / CPF', required: false },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'endereco', label: 'Endereço', required: false },
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
  tipo: [/^tipo$/, /segmento/, /categoria/],
  cnpj: [/^cnpj$/, /^cpf$/, /cpf.*cnpj/, /cnpj/, /cpf/],
  email: [/^e-?mail$/, /mail/],
  telefone: [/^telefone$/, /^fone$/, /^celular$/, /^tel$/, /telefone/, /celular/, /fone/, /\btel\b/],
  endereco: [/^endereco$/, /endereco/, /address/],
  nome_contato: [
    /^nome$/, /^nome\s*completo$/, /^primeiro\s*nome$/, /^first\s*name$/, /^full\s*name$/, /^nome\s*proprio$/,
    /^contato$/, /^nome\s*contato$/, /^nome\s*do\s*contato$/, /^responsavel$/, /^pessoa$/,
    /^criado\s*por$/, /^contato\s*principal$/,
    /contato/, /responsavel/, /^nome\b/, /first.*name/, /full.*name/
  ],
  sobrenome_contato: [
    /^sobrenome$/, /^ultimo\s*nome$/, /^last\s*name$/, /^surname$/, /^apelido$/,
    /sobrenome/, /last.*name/, /surname/,
  ],
  cargo: [/^cargo$/, /cargo/, /funcao/, /posicao/],
  classificacao: [/^classificacao$/, /^classificacao.*cliente$/, /^rank$/, /^ranking$/, /^score$/, /classificacao/],
  data_criacao: [/^data\s*criacao$/, /^criado$/, /^criado\s*em$/, /^data\s*cadastro$/, /criado/],
};

function autoDetectMapping(headers: string[]): Record<FieldKey, string> {
  const result: Record<FieldKey, string> = {
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
    telefone: '', endereco: '', nome_contato: '', sobrenome_contato: '', cargo: '',
    classificacao: '', data_criacao: '',
  };
  const used = new Set<string>();
  // First pass: exact patterns
  (Object.keys(AUTO_RULES) as FieldKey[]).forEach(field => {
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
    telefone: '', endereco: '', nome_contato: '', sobrenome_contato: '', cargo: '',
    classificacao: '', data_criacao: '',
  });
  // extras: column name (planilha) -> nome no sistema (campos_extras)
  const [extras, setExtras] = useState<Record<string, string>>({});
  // customColumns: nome → valor padrão (colunas criadas do zero, não vêm da planilha)
  const [customColumns, setCustomColumns] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
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
      telefone: '', endereco: '', nome_contato: '', sobrenome_contato: '', cargo: '',
      classificacao: '', data_criacao: '',
    });
    setExtras({});
    setCustomColumns({});
    setFileName('');
    setStep('upload');
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

      const auto = autoDetectMapping(cols);
      setMapping(auto);
      setExtras({});
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

  const getMappedRows = () => {
    return rawData
      .map(row => {
        const get = (k: FieldKey) => {
          const col = mapping[k];
          if (!col) return '';
          return (row[col] ?? '').toString().trim();
        };
        const empresa = get('empresa');
        const razao_social = get('razao_social');
        const cnpj = get('cnpj');
        const primeiro = get('nome_contato');
        const sobrenome = get('sobrenome_contato');
        const nome_contato = [primeiro, sobrenome].filter(Boolean).join(' ').trim();
        const tipoRaw = get('tipo');

        // Monta campos_extras com base nas colunas marcadas como "novas" (vindas da planilha)
        const campos_extras: Record<string, string> = {};
        Object.entries(extras).forEach(([col, name]) => {
          const v = (row[col] ?? '').toString().trim();
          if (v !== '') campos_extras[name || col] = v;
        });
        // Adiciona colunas criadas do zero (valor padrão aplicado a todas as linhas)
        Object.entries(customColumns).forEach(([name, value]) => {
          const v = (value ?? '').toString().trim();
          if (v !== '' && name.trim()) campos_extras[name.trim()] = v;
        });

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
          tipo: TIPO_MAP[tipoRaw.toLowerCase()] || (tipoRaw ? tipoRaw.toLowerCase() : 'construtora'),
          cnpj: cnpj || undefined,
          email: get('email') || undefined,
          telefone: get('telefone') || undefined,
          endereco: get('endereco') || undefined,
          nome_contato: nome_contato || undefined,
          cargo: get('cargo') || undefined,
          classificacao: get('classificacao') || undefined,
          data_criacao: get('data_criacao') || undefined,
          campos_extras,
        };
      })
      .filter(r => target === 'contatos' ? (r.empresa || r.nome_contato) : (r.empresa || r.razao_social || r.cnpj));
  };

  const canProceed = Boolean(mapping.empresa) || Boolean(mapping.razao_social) || Boolean(mapping.cnpj) || Boolean(mapping.nome_contato) || Boolean(mapping.sobrenome_contato) || Boolean(mapping.email);

  const previewRows = useMemo(() => (step === 'preview' ? getMappedRows() : []), [step, mapping, rawData, extras, customColumns]);

  // Lista de campos extras únicos para mostrar no preview (com nome final)
  const extraFieldNames = useMemo(
    () => Array.from(new Set([
      ...Object.entries(extras).map(([col, name]) => (name || col).trim()),
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
      const BATCH = 500;
      let imported = 0;

      for (let i = 0; i < rows.length; i += BATCH) {
        if (target === 'contatos') {
          const batch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa || (r.nome_contato ? 'Sem empresa' : 'Sem empresa'),
            nome_contato: r.nome_contato || r.empresa || null,
            email: r.email || null,
            telefone: r.telefone || null,
            cargo: r.cargo || null,
            classificacao: r.classificacao || null,
            data_criacao: r.data_criacao || null,
            campos_extras: r.campos_extras || {},
            usuario_id: vid,
          }));
          const { error } = await supabase.from('contatos').insert(batch);
          if (error) throw error;
        } else {
          const batch = rows.slice(i, i + BATCH).map(r => ({
            empresa: r.empresa,
            tipo: r.tipo || 'construtora',
            cnpj: r.cnpj || null,
            razao_social: r.razao_social || null,
            email: r.email || null,
            telefone: r.telefone || null,
            endereco: r.endereco || null,
            nome_contato: r.nome_contato || null,
            classificacao: r.classificacao || null,
            data_criacao: r.data_criacao || null,
            campos_extras: r.campos_extras || {},
            usuario_id: vid,
          }));
          const { error } = await supabase.from('clientes').upsert(batch, {
            onConflict: 'cnpj',
          });
          if (error) throw error;
        }
        imported += rows.slice(i, i + BATCH).length;
      }

      qc.invalidateQueries({ queryKey: [target === 'contatos' ? 'contatos' : 'clientes'] });
      toast.success(`${imported} ${target === 'contatos' ? 'contatos' : 'clientes'} importados com sucesso!`);
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || 'erro desconhecido'));
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
              const auto = autoDetectMapping(headers);
              setMapping(auto);
              
              // Auto-detect extras: any column not mapped to a standard field
              const used = new Set(Object.values(auto).filter(Boolean));
              const newExtras: Record<string, string> = {};
              
              // Keywords that suggest a column should be an extra field rather than ignored
              const extraKeywords = [/classificacao/, /criado/, /data/, /obs/, /nota/, /vendedor/, /origem/, /setor/, /departamento/];
              
              headers.forEach(h => {
                if (!used.has(h)) {
                  const norm = normalizeText(h);
                  if (extraKeywords.some(r => r.test(norm))) {
                    newExtras[h] = h;
                  }
                }
              });
              setExtras(newExtras);
            }}
            onClearAll={() => {
              setMapping({
                empresa: '', razao_social: '', tipo: '', cnpj: '', email: '',
                telefone: '', endereco: '', nome_contato: '', sobrenome_contato: '', cargo: '',
                classificacao: '', data_criacao: '',
              });
              setExtras({});
              setCustomColumns({});
            }}
            canProceed={canProceed}
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
                    {target === 'empresas' && <TableHead className="text-xs sticky top-0 bg-muted/50">Endereço</TableHead>}
                    {target === 'contatos' && <TableHead className="text-xs sticky top-0 bg-muted/50">Cargo</TableHead>}
...
                      <TableCell className="text-xs font-medium whitespace-nowrap">{r.empresa}</TableCell>
                      {target === 'contatos' && <TableCell className="text-xs whitespace-nowrap">{r.nome_contato || '-'}</TableCell>}
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap">{r.tipo}</TableCell>}
                      <TableCell className="text-xs whitespace-nowrap">{r.cnpj || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.email || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.telefone || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.classificacao || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{r.data_criacao || '-'}</TableCell>
                      {target === 'empresas' && <TableCell className="text-xs whitespace-nowrap max-w-[200px] truncate">{r.endereco || '-'}</TableCell>}
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

