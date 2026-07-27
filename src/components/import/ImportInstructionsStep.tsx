import { Button } from '@/components/ui/button';
import { Download, ArrowRight, CheckCircle2, Lightbulb } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface TemplateField {
  label: string;
  example?: string;
}

/** Gera e baixa uma planilha .xlsx só com o cabeçalho (+ uma linha de exemplo) dos campos suportados. */
export function downloadImportTemplate(fileName: string, fields: TemplateField[]) {
  const headers = fields.map((f) => f.label);
  const exampleRow = fields.map((f) => f.example ?? '');
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
  XLSX.writeFile(wb, fileName);
}

interface ImportInstructionsStepProps {
  templateFileName: string;
  templateFields: TemplateField[];
  onContinue: () => void;
  extraTips?: string[];
}

const DEFAULT_TIPS = [
  'Evite células mescladas, cada linha deve ter todos os campos preenchidos individualmente.',
  'Use uma única linha de cabeçalho, na primeira linha da planilha.',
  'Não deixe linhas ou colunas em branco entre os dados.',
];

export function ImportInstructionsStep({ templateFileName, templateFields, onContinue, extraTips }: ImportInstructionsStepProps) {
  const tips = [
    'Adapte sua planilha para usar as mesmas colunas da nossa planilha modelo, isso garante que o mapeamento automático funcione melhor e evita linhas ignoradas na importação.',
    ...(extraTips ?? []),
    ...DEFAULT_TIPS,
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground">Antes de importar, siga essas boas práticas</h3>
        </div>
        <ul className="space-y-2.5">
          {tips.map((tip, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-6 transition-colors hover:bg-primary/[0.05]">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-sm border border-primary/10">
            <Download className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Planilha modelo</p>
            <p className="text-xs text-muted-foreground max-w-md">
              Baixe o modelo com as colunas esperadas pelo sistema e use como base para organizar seus dados antes de importar.
            </p>
          </div>
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => downloadImportTemplate(templateFileName, templateFields)}>
          <Download className="h-4 w-4 mr-2" /> Baixar planilha modelo
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={onContinue} className="h-10 px-6 font-bold shadow-lg shadow-primary/20">
          Continuar <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
