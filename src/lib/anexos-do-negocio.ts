import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './file-validation';
import { filenameFromUrl } from './download-file';

/**
 * O que pode ser anexado a um negócio: PDF e imagem (decisão do dono do produto, 12/09/2026).
 * Não é "qualquer arquivo" — planilha e Word ninguém abre no celular em obra, e o balde cresce
 * sem controle.
 */
export const TIPOS_DE_ANEXO_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const EXTENSOES_DE_ANEXO_ACEITAS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;
export const ACCEPT_DO_CAMPO = EXTENSOES_DE_ANEXO_ACEITAS.join(',');

export interface ArquivoParaAnexar {
  name: string;
  size: number;
  type: string;
}

/**
 * 🔴 CONFERE TIPO **E** EXTENSÃO. O navegador nem sempre informa o tipo (arquivo vindo de
 * aplicativo de celular chega com `type` vazio), e o `accept` do campo é só sugestão: arrastar
 * um arquivo para a área de envio passa por cima dele. Devolve a frase pronta em PT-BR — a tela
 * não escreve a sua — ou `null` quando o arquivo pode subir.
 */
export function recusaDoAnexo(arquivo: ArquivoParaAnexar): string | null {
  if (arquivo.size > MAX_FILE_SIZE_BYTES) {
    return `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_MB} MB.`;
  }

  const nomeEmMinusculo = (arquivo.name ?? '').toLowerCase();
  const extensaoAceita = EXTENSOES_DE_ANEXO_ACEITAS.some((ext) => nomeEmMinusculo.endsWith(ext));
  const tipoAceito = (TIPOS_DE_ANEXO_ACEITOS as readonly string[]).includes(arquivo.type);

  // A EXTENSÃO é sempre exigida — é o sinal que sobrevive mesmo quando o navegador não manda
  // tipo nenhum. O TIPO entra como checagem A MAIS sempre que o navegador informou algum: sem
  // isso, um arquivo renomeado (".exe" batizado de "foto.png" no nome, mas com o tipo de imagem
  // que o navegador detectou de verdade) passaria pela extensão sozinha. As duas têm de bater.
  const passa = extensaoAceita && (!arquivo.type || tipoAceito);
  if (!passa) {
    return 'Tipo de arquivo não aceito. Envie um PDF ou uma imagem.';
  }

  return null;
}

/** `true` para imagem — é o que decide entre mostrar miniatura ou ícone de arquivo. */
export function ehImagem(tipo?: string | null): boolean {
  return !!tipo && tipo.startsWith('image/');
}

/**
 * Tira o nome do arquivo do fim do endereço, com os espaços de volta.
 * `filenameFromUrl` já desfaz a codificação do último segmento; o `decodeURIComponent` extra
 * aqui é rede de segurança própria da lista de anexos — endereço herdado pode ter porcentagem
 * solta (`%` sozinho, sem dois dígitos depois) e isso não pode quebrar a lista inteira.
 */
export function nomeDoAnexo(url: string): string {
  const nome = filenameFromUrl(url, 'anexo.pdf');
  try {
    return decodeURIComponent(nome);
  } catch {
    return nome;
  }
}

/**
 * Tamanho em português: vírgula decimal, uma casa em MB; abaixo de 1 MB escreve KB inteiro.
 * Sem tamanho (`0`/`null`/`undefined`), devolve vazio em vez de inventar número.
 */
export function tamanhoLegivel(bytes?: number | null): string {
  if (!bytes) return '';

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1).replace('.', ',')} MB`;
  }

  const kb = Math.round(bytes / 1024);
  return `${kb} KB`;
}

export interface AnexoNaLista {
  id: string;
  nome: string;
  created_at: string;
}

/**
 * O mais novo em cima — é o desenho que o Lucas pediu. Estável e não muta o array recebido: a
 * tela pode continuar usando a lista original enquanto esta é só a ordenada para exibir.
 */
export function ordenarAnexos<T extends { created_at: string }>(anexos: readonly T[]): T[] {
  return [...anexos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * O que a coluna da lista de negócios mostra: o primeiro anexo (já ordenado por quem chama) e
 * quantos ficaram de fora — o "+N" que não precisa listar todos.
 */
export function resumoDaColunaDeAnexos<T extends { nome: string }>(
  anexos: readonly T[],
): { primeiro: T | null; extras: number } {
  if (anexos.length === 0) return { primeiro: null, extras: 0 };
  return { primeiro: anexos[0], extras: anexos.length - 1 };
}
