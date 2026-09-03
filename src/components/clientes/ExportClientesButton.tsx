import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type ExportType = 'empresas' | 'contatos';
type ExportFormat = 'xlsx' | 'csv';

const prepareData = (data: any[], type: ExportType) => {
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

/**
 * Gera e baixa o arquivo de exportação (Excel ou CSV) da lista de empresas ou
 * contatos. Função pura de efeito colateral — chame direto de um item de menu,
 * sem gatilho de dropdown aninhado (era o que travava o botão: o item de menu
 * não repassa ref/onClick, então o Radix não conseguia abrir o submenu).
 */
export function exportarClientes(data: any[], type: ExportType, format: ExportFormat) {
  if (!data || data.length === 0) {
    toast.error('Nenhum dado para exportar');
    return;
  }
  try {
    const rows = prepareData(data, type);
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
    toast.error('Erro ao exportar: ' + (err?.message || 'erro desconhecido'));
  }
}
