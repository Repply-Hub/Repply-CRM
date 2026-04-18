import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FieldDef } from '@/components/import/MappingStep';

interface Props {
  open: boolean;
  onClose: () => void;
  fields: FieldDef[];
  target: 'empresas' | 'contatos';
}

const SAMPLE: Record<string, string> = {
  empresa: 'Construtora Exemplo Ltda',
  razao_social: 'Construtora Exemplo Ltda',
  tipo: 'construtora',
  cnpj: '12.345.678/0001-90',
  email: 'contato@exemplo.com.br',
  telefone: '(84) 99999-9999',
  endereco: 'Av. Principal, 100, Centro, Natal/RN',
  nome_contato: 'João Silva',
  cargo: 'Gerente',
};

export function TemplateBuilder({ open, onClose, fields, target }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(fields.filter(f => f.required || ['cnpj', 'email', 'telefone'].includes(f.key)).map(f => f.key))
  );

  if (!open) return null;

  const toggle = (k: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const download = () => {
    const cols = fields.filter(f => selected.has(f.key));
    if (cols.length === 0) {
      toast.error('Selecione pelo menos uma coluna');
      return;
    }
    const headers = cols.map(c => c.label);
    const sampleRow = cols.map(c => SAMPLE[c.key] || '');
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, target === 'contatos' ? 'Contatos' : 'Empresas');
    XLSX.writeFile(wb, `modelo-${target}.xlsx`);
    toast.success('Planilha-modelo baixada!');
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-lg max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Baixar planilha-modelo</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Selecione as colunas que devem aparecer na planilha. Vamos gerar um arquivo .xlsx com os cabeçalhos e uma linha de exemplo para você preencher.
        </p>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 mb-4">
          {fields.map(f => {
            const checked = selected.has(f.key);
            const id = `tmpl-${f.key}`;
            return (
              <label
                key={f.key}
                htmlFor={id}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={() => toggle(f.key)}
                  disabled={f.required}
                />
                <span className="text-sm flex-1">{f.label}</span>
                {f.required && <span className="text-xs text-muted-foreground">obrigatório</span>}
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={download} className="gap-1.5">
            <Download className="h-4 w-4" /> Baixar modelo
          </Button>
        </div>
      </div>
    </div>
  );
}
