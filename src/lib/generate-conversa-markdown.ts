import type { ConversaExportRow, ConversaParaExportar } from '@/lib/generate-conversa-pdf';

// Evita que a mensagem do contato seja lida como estrutura do documento: um
// "# " no início de linha viraria título, e ``` abriria um bloco de código
// que "vaza" por cima do resto do arquivo até encontrar outro fechamento.
function escaparMarkdown(texto: string): string {
  if (!texto) return texto;
  return texto
    .split('\n')
    .map((linha) => linha.replace(/^(\s*)(#{1,6}\s)/, '$1\\$2'))
    .join('\n')
    .replace(/```/g, '\\`\\`\\`');
}

function blocoMensagens(linhas: ConversaExportRow[]): string {
  if (linhas.length === 0) return '_Nenhuma mensagem no período selecionado._';
  return linhas
    .map((l) => {
      const corpo = escaparMarkdown(l.mensagem).trim();
      return `### ${l.dataHora} — ${l.remetente} (${l.tipo})\n\n${corpo || '_(sem conteúdo)_'}`;
    })
    .join('\n\n');
}

function cabecalhoExportacao(titulo: string, periodo: string): string {
  const geradoEm = `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`;
  return `# ${titulo}\n\n**Período:** ${periodo}  \n**Gerado em:** ${geradoEm}\n\n---\n\n`;
}

function baixarMarkdown(conteudo: string, nomeArquivo: string) {
  const blob = new Blob([conteudo], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function generateConversaMarkdown(
  linhas: ConversaExportRow[],
  contato: string,
  periodo: string,
) {
  const conteudo = cabecalhoExportacao(`Conversa — ${contato}`, periodo) + blocoMensagens(linhas) + '\n';

  const nomeArquivo = contato.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'conversa';
  baixarMarkdown(conteudo, `conversa-${nomeArquivo}-${new Date().toISOString().slice(0, 10)}.md`);
}

// Exportação consolidada: um único arquivo, cada conversa como uma seção com
// o próprio nome como título — mesmo critério do PDF/Excel (ver
// generate-conversa-pdf.ts e generate-conversa-excel.ts).
export function generateConversasMarkdown(conversas: ConversaParaExportar[], periodo: string) {
  const secoes = conversas
    .map((c) => `## ${c.nomeContato}\n\n${blocoMensagens(c.linhas)}`)
    .join('\n\n---\n\n');

  const conteudo = cabecalhoExportacao('Conversas exportadas', periodo) + secoes + '\n';
  baixarMarkdown(conteudo, `todas-as-conversas-${new Date().toISOString().slice(0, 10)}.md`);
}
