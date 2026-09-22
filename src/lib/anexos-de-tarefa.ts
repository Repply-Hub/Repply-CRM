import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './file-validation';
import { filenameFromUrl } from './download-file';

/**
 * O que pode ser anexado a uma TAREFA: lista ampla "de escritório" (decisão do dono do produto,
 * 22/09/2026). Tarefa é trabalho interno, não orçamento — por isso mais larga que a de negócio.
 */
export const TIPOS_DE_ANEXO_DE_TAREFA_ACEITOS = [
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
] as const;

export const EXTENSOES_DE_ANEXO_DE_TAREFA_ACEITAS = [
  '.pdf', '.jpg', '.jpeg', '.png',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip',
] as const;

export const ACCEPT_DO_CAMPO_DE_TAREFA = EXTENSOES_DE_ANEXO_DE_TAREFA_ACEITAS.join(',');

export interface ArquivoParaAnexar { name: string; size: number; type: string }

/**
 * Confere tamanho, depois EXTENSÃO (sempre exigida — sobrevive a `type` vazio de app de celular)
 * E o tipo MIME quando o navegador informou algum. Devolve a frase em PT-BR ou null.
 */
export function recusaDoAnexoDeTarefa(arquivo: ArquivoParaAnexar): string | null {
  if (arquivo.size > MAX_FILE_SIZE_BYTES) {
    return `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_MB} MB.`;
  }
  const nome = (arquivo.name ?? '').toLowerCase();
  const extensaoAceita = EXTENSOES_DE_ANEXO_DE_TAREFA_ACEITAS.some((ext) => nome.endsWith(ext));
  const tipoAceito = (TIPOS_DE_ANEXO_DE_TAREFA_ACEITOS as readonly string[]).includes(arquivo.type);
  const passa = extensaoAceita && (!arquivo.type || tipoAceito);
  if (!passa) {
    return 'Tipo de arquivo não aceito. Envie PDF, imagem, Word, Excel, PowerPoint, texto/CSV ou ZIP.';
  }
  return null;
}

/** true para imagem — decide entre miniatura e ícone. */
export function ehImagem(tipo?: string | null): boolean {
  return !!tipo && tipo.startsWith('image/');
}

/** Tamanho em PT-BR: uma casa em MB, KB inteiro abaixo de 1 MB, vazio sem bytes. */
export function tamanhoLegivel(bytes?: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  const kb = Math.round(bytes / 1024);
  if (kb >= 1024) return '1,0 MB';
  return `${kb} KB`;
}

/** Nome do arquivo a partir do fim do endereço (uma decodificação só, via filenameFromUrl). */
export function nomeDoAnexo(url: string): string {
  return filenameFromUrl(url, 'anexo');
}

/** Mais novo em cima. Estável, não muta o array recebido. */
export function ordenarAnexos<T extends { created_at: string }>(anexos: readonly T[]): T[] {
  return [...anexos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
