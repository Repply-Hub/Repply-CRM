/**
 * CÓPIA para Deno de `src/lib/dom-natal-licencas.ts`. Deno não importa de `src/`.
 * **As duas precisam concordar** — mesma situação de `_shared/whatsapp.ts` vs
 * `src/hooks/whatsapp-phone.ts` (CLAUDE.md §7.1). Se mexer numa, mexa na outra.
 * Os testes ficam no lado de `src/` (`dom-natal-licencas.test.ts`).
 */


export type TipoLicenca = 'Licença Prévia' | 'Licença de Instalação' | 'Licença de Operação';

export interface PublicacaoDeLicenca {
  tipo: TipoLicenca;
  texto: string;
}

/** Cabeçalhos de ato que aparecem em CAIXA ALTA no começo de uma linha. Servem para
 *  cortar o diário em blocos — cada ato começa num destes. */
const CABECALHO_DE_ATO =
  /^\s*(PORTARIA|DECRETO|LEI(?:\s+COMPLEMENTAR)?|RESOLU[ÇC][ÃA]O|INSTRU[ÇC][ÃA]O\s+NORMATIVA|EXTRATO|AVISO|EDITAL|COMUNICADO|TERMO\s+(?:DE|ADITIVO)|DESPACHO|ERRATA|RESENHA|ATA|CHAMAMENTO|SECRETARIA\s+MUNICIPAL|GABINETE\s+DO)\b/;

const RE_LP = /Licen[çc]a\s+Pr[ée]via(?:\s*[-–]?\s*LP)?/i;
const RE_LI = /Licen[çc]a\s+de\s+Instala[çc][ãa]o(?:\s*[-–]?\s*LI)?/i;
const RE_LO = /Licen[çc]a\s+(?:Ambiental\s+)?de\s+Opera[çc][ãa]o(?:\s*[-–]?\s*LO)?/i;

const RE_CNPJ = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/;

/**
 * Quebra o texto da edição em blocos candidatos. Combina dois cortes:
 *  1. linha em branco dupla (parágrafo) — é o que os scrapers antigos já usavam;
 *  2. início de um novo cabeçalho de ato em CAIXA ALTA.
 * Blocos muito curtos (< 40 chars) são colados no anterior para não fragmentar demais.
 */
export function segmentarBlocos(textoPdf: string): string[] {
  if (!textoPdf) return [];
  const normalizado = textoPdf.replace(/\r\n?/g, '\n');

  const brutos: string[] = [];
  for (const paragrafo of normalizado.split(/\n\s*\n+/)) {
    let atual = '';
    for (const linha of paragrafo.split('\n')) {
      if (atual && CABECALHO_DE_ATO.test(linha)) {
        brutos.push(atual);
        atual = linha;
      } else {
        atual = atual ? `${atual}\n${linha}` : linha;
      }
    }
    if (atual) brutos.push(atual);
  }

  const blocos: string[] = [];
  for (const b of brutos) {
    const limpo = b.trim();
    if (!limpo) continue;
    if (limpo.length < 40 && blocos.length > 0) {
      blocos[blocos.length - 1] += `\n${limpo}`;
    } else {
      blocos.push(limpo);
    }
  }
  return blocos;
}

/** Qual tipo de licença o bloco menciona (o primeiro que casar), ou `null`. */
export function classificarTipoLicenca(bloco: string): TipoLicenca | null {
  if (RE_LP.test(bloco)) return 'Licença Prévia';
  if (RE_LI.test(bloco)) return 'Licença de Instalação';
  if (RE_LO.test(bloco)) return 'Licença de Operação';
  return null;
}

/**
 * O bloco parece TEXTO DE NORMA (portaria, decreto, lei, resolução) e não uma publicação
 * de ato concreto. É o guarda contra o falso positivo conhecido.
 */
export function pareceContextoNormativo(bloco: string): boolean {
  const b = bloco.toLowerCase();

  const temCabecalhoDeNorma =
    /\b(portaria|decreto|resolu[çc][ãa]o|instru[çc][ãa]o normativa|lei(\s+complementar)?)\s+n[ºo°.\s]/i.test(bloco);
  const temLinguagemDeNorma =
    /\bregulamenta\b|\bconsiderando\b|\bd[áa] outras provid[êe]ncias\b|\bfica\s+(instituíd|estabelecid|aprovad|regulamentad)/i.test(bloco) ||
    /\bart(?:igo)?\.?\s*\d+[ºo°]?\b/i.test(bloco);
  if (temCabecalhoDeNorma && temLinguagemDeNorma) return true;

  // "emissão de Licença de..." / "emissão conjunta de Certidão ... e Licença de Operação"
  // — a licença citada como hipótese/finalidade, não concedida a ninguém.
  if (/\bemiss[ãa]o\s+(conjunta\s+)?de\s+(certid[ãa]o|licen[çc]a)/i.test(bloco)) return true;

  // Item de lista enumerada ("II – emissão de ...", "III - ...")
  if (/(^|\n)\s*(?:[ivx]{1,4}|\d{1,2})\s*[–-]\s+\S/i.test(bloco) && /emiss[ãa]o de|instruir processos/i.test(b)) {
    return true;
  }
  if (/instruir\s+processos\s+destinados/i.test(bloco)) return true;

  return false;
}

/**
 * O bloco tem um SINAL positivo de que é uma publicação de licença ambiental de verdade:
 * requerimento/concessão, número de licença, ou CNPJ de empreendedor junto de obra.
 */
export function temSinalDePublicacaoReal(bloco: string): boolean {
  const temTipo = classificarTipoLicenca(bloco) !== null;
  if (!temTipo) return false;

  // "torna público que requereu/recebeu ..." — a forma clássica do aviso do empreendedor.
  if (/torna\s+p[úu]blico\s+que\s+(requereu|recebeu|obteve|solicitou|lhe\s+foi\s+concedid)/i.test(bloco)) {
    return true;
  }

  // verbo de ato + licença perto
  if (
    /\b(requereu|requerimento\s+d[ae]|recebeu|obteve|solicitou|concede[u]?|concess[ãa]o\s+d[ae]|deferi(?:u|da|do|mento)|indeferi(?:u|da|do|mento)|renova[çc][ãa]o\s+d[ae]|prorroga[çc][ãa]o\s+d[ae])\b[\s\S]{0,90}?licen[çc]a\s+(pr[ée]via|de\s+instala[çc][ãa]o|de\s+opera[çc][ãa]o|ambiental)/i.test(bloco) ||
    /licen[çc]a\s+(pr[ée]via|de\s+instala[çc][ãa]o|de\s+opera[çc][ãa]o|ambiental)[\s\S]{0,90}?\b(foi\s+)?(requerid|concedid|deferid|indeferid|renovad|emitid)/i.test(bloco)
  ) {
    return true;
  }

  // número de licença: "Licença de Operação nº 123/2026", "LO n. 45/2026"
  if (/licen[çc]a\s+(pr[ée]via|de\s+instala[çc][ãa]o|de\s+opera[çc][ãa]o)\s*(?:ambiental\s*)?(?:n[ºo°.]|c[óo]d(?:igo)?\.?|[-–]\s*(?:LP|LI|LO))\s*[:\-]?\s*\d/i.test(bloco)) {
    return true;
  }

  // CNPJ de empreendedor + menção de obra/empreendimento no mesmo bloco da licença
  if (
    RE_CNPJ.test(bloco) &&
    /(empreendimento|empreendedor|obra|constru[çc][ãa]o|loteamento|edifica[çc][ãa]o|parcelamento\s+do\s+solo)/i.test(bloco)
  ) {
    return true;
  }

  return false;
}

/**
 * Extrai as publicações de LP/LI/LO de uma edição inteira do DOM. Retorna só o que passou
 * pelos três testes: menciona o tipo, NÃO é texto de norma, e tem sinal de ato real.
 * O `texto` sai aparado em 2000 caracteres (é o que cabe em `licencas_natal.bloco_texto`).
 */
export function extrairPublicacoesDeLicenca(textoPdf: string): PublicacaoDeLicenca[] {
  const achados: PublicacaoDeLicenca[] = [];
  for (const bloco of segmentarBlocos(textoPdf)) {
    const tipo = classificarTipoLicenca(bloco);
    if (!tipo) continue;
    if (pareceContextoNormativo(bloco)) continue;
    if (!temSinalDePublicacaoReal(bloco)) continue;
    achados.push({ tipo, texto: bloco.slice(0, 2000) });
  }
  return achados;
}
