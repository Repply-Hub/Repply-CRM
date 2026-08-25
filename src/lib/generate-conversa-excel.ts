import * as XLSX from 'xlsx';
import type { ConversaExportRow, ConversaParaExportar } from '@/lib/generate-conversa-pdf';

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

// Nome de aba do Excel: até 31 caracteres e sem : \ / ? * [ ] (limite do
// formato). Sanitiza e desambigua repetições — dois contatos podem cair no
// mesmo nome depois de truncado.
function nomeAbaValido(nome: string, usados: Set<string>): string {
  const base = nome.replace(/[:\\/?*[\]]/g, '').trim().slice(0, 31) || 'Conversa';
  let candidato = base;
  let sufixo = 2;
  while (usados.has(candidato.toLowerCase())) {
    const marcador = ` (${sufixo})`;
    candidato = base.slice(0, 31 - marcador.length) + marcador;
    sufixo++;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

// Exportação consolidada: uma aba por conversa, com o nome do contato/grupo
// escrito na primeira linha da própria planilha — visível assim que a aba
// abre, sem depender de olhar o nome (truncado) da abinha embaixo.
export function generateConversasExcel(conversas: ConversaParaExportar[]) {
  const wb = XLSX.utils.book_new();
  const nomesUsados = new Set<string>();

  for (const conversa of conversas) {
    const rows = conversa.linhas.map(l => ({
      'Data/Hora': l.dataHora,
      Remetente: l.remetente,
      Tipo: l.tipo,
      Mensagem: l.mensagem,
    }));

    const ws = XLSX.utils.aoa_to_sheet([[conversa.nomeContato]]);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A3' });
    ws['!cols'] = [
      { wch: 18 }, // Data/Hora
      { wch: 24 }, // Remetente
      { wch: 14 }, // Tipo
      { wch: 70 }, // Mensagem
    ];

    XLSX.utils.book_append_sheet(wb, ws, nomeAbaValido(conversa.nomeContato, nomesUsados));
  }

  XLSX.writeFile(wb, `todas-as-conversas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
