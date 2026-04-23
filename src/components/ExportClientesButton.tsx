import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, FileDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ExportClientesButtonProps {
  data: any[];
  type: 'empresas' | 'contatos';
}

export function ExportClientesButton({ data, type }: ExportClientesButtonProps) {
  const [exporting, setExporting] = useState(false);

  const prepareData = () => {
    if (type === 'empresas') {
      return data.map(c => ({
        Nome: c.empresa || '',
        Tipo: c.tipo || '',
        'CPF/CNPJ': c.cnpj || '',
        'Razão Social': c.razao_social || '',
        Email: c.email || '',
        Telefone: c.telefone || '',
        Endereço: c.endereco || '',
        Contato: c.nome_contato || '',
      }));
    }
    return data.map(c => ({
      Nome: c.nome_contato || '',
      Empresa: c.empresa || '',
      Email: c.email || '',
      Telefone: c.telefone || '',
      Cargo: c.cargo || '',
    }));
  };

  const exportFile = (format: 'xlsx' | 'csv') => {
    if (data.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    setExporting(true);
    try {
      const rows = prepareData();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type === 'empresas' ? 'Empresas' : 'Contatos');

      const fileName = `${type}_${new Date().toISOString().slice(0, 10)}.${format}`;
      if (format === 'csv') {
        XLSX.writeFile(wb, fileName, { bookType: 'csv' });
      } else {
        XLSX.writeFile(wb, fileName);
      }
      toast.success(`Arquivo exportado: ${fileName}`);
    } catch (err: any) {
      toast.error('Erro ao exportar: ' + (err.message || 'erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          disabled={exporting}
          className="w-full flex items-center justify-between px-2.5 py-2 text-[13px] font-medium rounded-lg hover:bg-muted/80 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span>Exportar</span>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportFile('xlsx')} className="gap-3 text-[13px]">
          <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFile('csv')} className="gap-3 text-[13px]">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" /> CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
