/**
 * Regras de anexo de e-mail — só função pura, para fixar em teste sem renderizar
 * componente (este projeto testa função pura e deixa componente para o
 * compilador e o navegador).
 *
 * O teto de 20 MB é do e-mail INTEIRO, não por arquivo: o limite do Nylas para
 * envio multipart é 25 MB somando tudo, e 20 deixa margem para o corpo e os
 * cabeçalhos. A função de servidor `email-enviar` repete essa conta antes de
 * montar o multipart — a tela só evita o ida-e-volta.
 */

/** Teto somado de todos os anexos de um e-mail. */
export const TETO_TOTAL_ANEXOS_BYTES = 20 * 1024 * 1024;

/** Quantos anexos no máximo por e-mail. Trava de sanidade, não limite do Nylas. */
export const MAX_ANEXOS = 10;

/**
 * Extensões barradas: executável e script que a maioria dos provedores recusa no
 * destino de qualquer jeito (ou joga direto no spam), e que são o vetor clássico
 * de vírus por anexo. Tudo o mais passa — PDF, imagem, Office, zip, CAD…
 *
 * Casa com extensão dupla também (`orcamento.pdf.exe`): a checagem olha o fim do
 * nome, então o `.exe` final é pego mesmo com `.pdf` antes.
 */
export const EXTENSOES_BLOQUEADAS = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.cpl',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsh', '.ps1',
  '.jar', '.msc', '.hta', '.reg', '.lnk', '.dll',
] as const;

/** `true` quando o nome termina numa extensão barrada (ver `EXTENSOES_BLOQUEADAS`). */
export function extensaoBloqueada(nome: string): boolean {
  const limpo = (nome ?? '').trim().toLowerCase();
  return EXTENSOES_BLOQUEADAS.some((ext) => limpo.endsWith(ext));
}

export interface AnexoJaPresente {
  nome_arquivo: string;
  tamanho: number;
}

export interface ResultadoValidacaoAnexos {
  /** Os arquivos que podem ser anexados, na ordem em que vieram. */
  aceitos: File[];
  /** Um motivo legível por arquivo recusado, para juntar num toast. */
  rejeitados: Array<{ nome: string; motivo: string }>;
}

/**
 * Decide quais dos arquivos recém-escolhidos entram, dado o que já está
 * anexado. Para de aceitar quando estoura a contagem ou o teto de bytes — e o
 * teto conta o que já existe MAIS o que está entrando, arquivo a arquivo, para
 * a mensagem dizer exatamente onde parou.
 */
export function validarSelecaoDeAnexos(
  jaAnexados: AnexoJaPresente[],
  selecionados: File[],
): ResultadoValidacaoAnexos {
  const aceitos: File[] = [];
  const rejeitados: Array<{ nome: string; motivo: string }> = [];

  let total = jaAnexados.reduce((s, a) => s + (a.tamanho || 0), 0);
  let contagem = jaAnexados.length;

  for (const arquivo of selecionados) {
    if (extensaoBloqueada(arquivo.name)) {
      rejeitados.push({ nome: arquivo.name, motivo: 'tipo de arquivo não permitido' });
      continue;
    }
    if (arquivo.size === 0) {
      rejeitados.push({ nome: arquivo.name, motivo: 'arquivo vazio' });
      continue;
    }
    if (contagem >= MAX_ANEXOS) {
      rejeitados.push({ nome: arquivo.name, motivo: `máximo de ${MAX_ANEXOS} anexos` });
      continue;
    }
    if (total + arquivo.size > TETO_TOTAL_ANEXOS_BYTES) {
      rejeitados.push({ nome: arquivo.name, motivo: 'passaria do limite de 20 MB no e-mail' });
      continue;
    }
    aceitos.push(arquivo);
    total += arquivo.size;
    contagem += 1;
  }

  return { aceitos, rejeitados };
}

/**
 * Uma frase juntando os arquivos recusados, para um toast só.
 * Vazio quando nada foi recusado.
 */
export function mensagemDeRejeicao(rejeitados: Array<{ nome: string; motivo: string }>): string {
  if (rejeitados.length === 0) return '';
  if (rejeitados.length === 1) {
    return `"${rejeitados[0].nome}" não foi anexado: ${rejeitados[0].motivo}.`;
  }
  const lista = rejeitados.map((r) => `"${r.nome}" (${r.motivo})`).join('; ');
  return `${rejeitados.length} arquivos não foram anexados: ${lista}.`;
}
