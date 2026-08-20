import * as XLSX from 'xlsx';
import type { ConversaExportRow } from '@/lib/generate-conversa-pdf';

export function generateConversaExcel(linhas: ConversaExportRow[], contato: string) {
  const rows = linhas.map(l => ({
    'Data/Hora': l.dataHora,
    Remetente: l.remetente,
    Tipo: l.tipo,
    Mensagem: l.mensagem,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, // Data/Hora
    { wch: 24 }, // Remetente
    { wch: 14 }, // Tipo
    { wch: 70 }, // Mensagem
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conversa');

  const nomeArquivo = contato.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'conversa';
  XLSX.writeFile(wb, `conversa-${nomeArquivo}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
