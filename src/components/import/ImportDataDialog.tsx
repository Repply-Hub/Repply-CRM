import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { MappingStep, sanitizeImportedRows, type FieldDef } from '@/components/import/MappingStep';
import { parseImportFile } from '@/lib/import/file-parser';
import { useBulkImport, type ImportType } from '@/hooks/use-bulk-import';
import { useToast } from '@/hooks/use-toast';

const CLIENTES_FIELDS: FieldDef[] = [
  { key: 'empresa', label: 'Empresa', required: false },
  { key: 'razao_social', label: 'Razão Social', required: false },
  { key: 'tipo', label: 'Tipo', required: true },
  { key: 'cnpj', label: 'CNPJ', required: false },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'logradouro', label: 'Logradouro', required: false },
  { key: 'numero', label: 'Número', required: false },
  { key: 'complemento', label: 'Complemento', required: false },
  { key: 'bairro', label: 'Bairro', required: false },
  { key: 'cidade', label: 'Cidade', required: false },
  { key: 'uf', label: 'UF', required: false },
  { key: 'cep', label: 'CEP', required: false },
  { key: 'data_criacao', label: 'Data de Criação', required: false },
];

const NEGOCIOS_FIELDS: FieldDef[] = [
  { key: 'cliente', label: 'Cliente', required: true },
  { key: 'fabricante', label: 'Fabricante', required: true },
  { key: 'obra', label: 'Obra', required: false },
  { key: 'valor', label: 'Valor', required: true },
  { key: 'observacoes', label: 'Observações', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'data_pedido', label: 'Data do Negócio', required: false },
];

type Step = 'upload' | 'mapping' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importType: ImportType;
}

export function ImportDataDialog({ open, onOpenChange, importType }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | string[]>>({});
  const [extras, setExtras] = useState<Record<string, any>>({});
  const [result, setResult] = useState<{ total: number; inserted: number; ignored: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { importClientes, importNegocios, importing, progress } = useBulkImport();
  const { toast } = useToast();

  const fields = importType === 'clientes' ? CLIENTES_FIELDS : NEGOCIOS_FIELDS;

  const canProceed = fields
    .filter((f) => f.required)
    .every((f) => {
      const v = mapping[f.key];
      return Array.isArray(v) ? v.length > 0 : Boolean(v);
    });

  async function handleFileSelect(selected: File) {
    try {
      const parsed = await parseImportFile(selected);
      if (parsed.rawData.length === 0) {
        toast({ variant: 'destructive', title: 'Arquivo vazio', description: 'Nenhuma linha de dados encontrada.' });
        return;
      }
      setFile(selected);
      setHeaders(parsed.headers);
      setRawData(parsed.rawData);
      setMapping({});
      setExtras({});
      setStep('mapping');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao ler arquivo', description: (err as Error).message });
    }
  }

  async function handleConfirm() {
    if (isSubmitting || importing) return;
    setIsSubmitting(true);
    try {
      const payload = sanitizeImportedRows({ rawData, fields, mapping, extras });
      const summary = importType === 'clientes'
        ? await importClientes(payload, file?.name)
        : await importNegocios(payload, file?.name);
      setResult(summary);
      setStep('done');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro na importação',
        description: (err as Error).message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setRawData([]);
    setMapping({});
    setExtras({});
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {importType === 'clientes' ? 'Clientes' : 'Negócios'}</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Envie um arquivo .xlsx, .xls ou .csv'}
            {step === 'mapping' && 'Confira o mapeamento das colunas antes de importar'}
            {step === 'done' && 'Importação finalizada'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed rounded-xl">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <Input
              type="file"
              accept=".csv,.xls,.xlsx"
              className="max-w-xs"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) handleFileSelect(selected);
              }}
            />
          </div>
        )}

        {step === 'mapping' && file && (
          <MappingStep
            fileName={file.name}
            rawData={rawData}
            headers={headers}
            mapping={mapping}
            setMapping={setMapping}
            extras={extras}
            setExtras={setExtras}
            visibleFields={fields}
            onReset={() => setStep('upload')}
            onAutoDetect={() => setMapping({})}
            onClearAll={() => { setMapping({}); setExtras({}); }}
            canProceed={canProceed}
            onNext={() => {}}
          />
        )}

        {step === 'done' && result && (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center gap-2">
              {result.ignored === result.total ? (
                <XCircle className="h-8 w-8 text-destructive" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              )}
              <p className="text-lg font-semibold">Importação concluída</p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/50 rounded-xl p-4 border">
                <div className="text-2xl font-bold">{result.total}</div>
                <div className="text-xs text-muted-foreground mt-1">No arquivo</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-green-700">{result.inserted}</div>
                <div className="text-xs text-green-600 mt-1">Importados</div>
              </div>
              <div className={`rounded-xl p-4 border ${result.ignored > 0 ? 'bg-red-50 border-red-200' : 'bg-muted/50'}`}>
                <div className={`text-2xl font-bold ${result.ignored > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                  {result.ignored}
                </div>
                <div className={`text-xs mt-1 ${result.ignored > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  Ignorados
                </div>
              </div>
            </div>

            {result.ignored > 0 && Object.keys(result.motivosFalha).length > 0 && (
              <div className="bg-muted/30 rounded-xl p-4 border">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Motivos de falha
                </p>
                <div className="space-y-1.5">
                  {Object.entries(result.motivosFalha).map(([motivo, count]) => (
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

        {importing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-center text-muted-foreground">Importando... {progress}%</p>
          </div>
        )}

        <DialogFooter>
          {step === 'mapping' && (
            <Button onClick={handleConfirm} disabled={isSubmitting || importing || !canProceed}>
              {(isSubmitting || importing) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSubmitting || importing ? 'Importando...' : 'Confirmar e Importar'}
            </Button>
          )}
          {step === 'done' && <Button onClick={handleClose}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
