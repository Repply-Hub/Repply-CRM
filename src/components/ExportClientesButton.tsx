import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
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
        <Button variant="outline" size="sm" disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportFile('xlsx')} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFile('csv')} className="gap-2">
          <FileText className="h-4 w-4" /> CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
