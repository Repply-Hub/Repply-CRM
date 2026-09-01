/**
 * CÓPIA para Deno de `src/lib/dom-extremoz-licencas.ts`. Deno não importa de `src/`.
 * **As duas precisam concordar** — mesma situação de `_shared/whatsapp.ts` vs
 * `src/hooks/whatsapp-phone.ts` (CLAUDE.md §7.1) e da lib gêmea do DOM Natal. Se mexer
 * numa, mexa na outra. Os testes ficam no lado de `src/` (`dom-extremoz-licencas.test.ts`).
 */

export type TipoLicenca = 'Licença Prévia' | 'Licença de Instalação' | 'Licença de Operação';

export interface PublicacaoExtremoz {
  tipo: TipoLicenca;
  /** Fase da obra. Vai para a coluna `prioridade` (nome enganoso — ver cabeçalho). */
  prioridade: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  telefone: string;
  email: string;
  enderecoEmpresa: string;
  quadroSocietario: string;
  obraDescricao: string;
  /** Trecho da edição que sustenta a publicação, aparado em 2000 caracteres. */
  texto: string;
}

// ── Data da edição ────────────────────────────────────────────────────────────────

const MESES: Record<string, string> = {
  janeiro: '01', jan: '01',
  fevereiro: '02', fev: '02',
  marco: '03', mar: '03',
  abril: '04', abr: '04',
  maio: '05', mai: '05',
  junho: '06', jun: '06',
  julho: '07', jul: '07',
  agosto: '08', ago: '08',
  setembro: '09', set: '09', sete: '09',
  outubro: '10', out: '10',
  novembro: '11', nov: '11',
  dezembro: '12', dez: '12',
};

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Data da edição em ISO (`AAAA-MM-DD`), deduzida do nome do arquivo ou da URL. `null`
 * quando não dá para saber o dia — a listagem de Extremoz nomeia os arquivos como
 * "31-de-Agosto-de-2026.pdf", então o caminho normal acerta; o `null` é para a edição
 * extraordinária de nome livre. Sem inventar dia 1º (seria uma data falsa numa coluna
 * que a tela ordena).
 */
export function parseDataEdicao(urlOuNome: string): string | null {
  if (!urlOuNome) return null;
  const bruto = semAcento(urlOuNome);

  // 1) ISO literal em qualquer lugar
  const iso = bruto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso && +iso[2] >= 1 && +iso[2] <= 12 && +iso[3] >= 1 && +iso[3] <= 31) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  // 2) DD/MM/AAAA literal
  const br = bruto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br && +br[2] >= 1 && +br[2] <= 12 && +br[1] >= 1 && +br[1] <= 31) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  // 3) "31-de-agosto-de-2026" / "2 de dezembro de 2025" (com hífen, espaço ou _)
  const ext = bruto.match(/(\d{1,2})[-\s_]+de[-\s_]+([a-z]+)[-\s_]+de[-\s_]+(\d{4})/);
  if (ext) {
    const mes = MESES[ext[2]];
    const dia = ext[1].padStart(2, '0');
    if (mes && +dia >= 1 && +dia <= 31) return `${ext[3]}-${mes}-${dia}`;
  }

  // 4) Sem dia: nada. (O caminho /uploads/AAAA/MM/ daria ano-mês, mas não o dia.)
  return null;
}

// ── Reconhecimento de licença ─────────────────────────────────────────────────────

const RE_CNPJ = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/;
const RE_CNPJ_G = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g;

// CNPJs que aparecem no RODAPÉ de toda página do diário (a própria Prefeitura de
// Extremoz — "Rua Capitão José da Penha… CNPJ: 08.204.497/0001-71" — 3.255 vezes na
// amostra de 127 edições) e no cabeçalho da Câmara. Nunca são o requerente da licença;
// quando um bloco os captura é lixo de paginação. Ignorados na escolha do CNPJ.
const CNPJS_DO_DIARIO = new Set(['08204497000171', '12640728000167']);

/** Primeiro CNPJ do texto que não seja lixo de rodapé/cabeçalho do diário. `''` se não houver. */
function cnpjDoRequerente(texto: string): string {
  for (const bruto of texto.match(RE_CNPJ_G) ?? []) {
    const limpo = bruto.replace(/\s/g, '');
    if (!CNPJS_DO_DIARIO.has(limpo.replace(/\D/g, ''))) return limpo;
  }
  return '';
}

// Conectores que podem aparecer entre "licença" e o núcleo do tipo. Lista FECHADA de
// propósito — "simplificada" NÃO entra (Licença Simplificada é outro tipo, fora do
// escopo LP/LI/LO). Cobre, além do formato direto "licença de operação":
//   "licença ambiental de operação"
//   "licença [de] regularização de operação"   ← LRO, o caso que faltava
//   "licença regularização de operação"        (grafia do diário, sem o "de")
//   "licença [de] renovação de operação"
//   "renovação da Licença de Operação"         (o "de operação" casa direto)
//   "licença operacional"                      (sinônimo de "de operação")
// Ordem de teste prévia → instalação → operação: mantém "Licença de Instalação e
// Operação (LIO)" classificada como Instalação, como já era.
const CONECTOR_DO_TIPO =
  '(?:ambiental\\s+|municipal\\s+|de\\s+|para\\s+|regulariza[çc][aã]o\\s+|renova[çc][aã]o\\s+){0,3}';
const RE_TIPO_PREVIA = new RegExp(`licen[çc]a\\s+${CONECTOR_DO_TIPO}pr[eé]via`, 'i');
const RE_TIPO_INSTALACAO = new RegExp(`licen[çc]a\\s+${CONECTOR_DO_TIPO}instala[çc][aã]o`, 'i');
const RE_TIPO_OPERACAO = new RegExp(`licen[çc]a\\s+${CONECTOR_DO_TIPO}opera(?:[çc][aã]o|cional)`, 'i');

// "licença [de/para] regularização" sem operação/instalação/prévia por perto. Não
// deveria existir sozinho — regularização é sempre DE operação ou DE instalação.
const RE_REGULARIZACAO_SOLTA = /licen[çc]a\s+(?:de\s+|para\s+)?regulariza[çc][aã]o/i;

/**
 * Qual tipo o bloco menciona (o primeiro que casar), ou `null`.
 *
 * "Regularização de operação/instalação" (LRO/LRI) conta como o tipo-base — o Lucas
 * decidiu em 01/09/2026 que entra como LO/LI normal, sem distinção na tela (a palavra
 * "regularização" continua visível no bloco_texto). "Licença de regularização" sem tipo
 * explícito é registrada para revisão e não classificada.
 *
 * Aceita a sigla isolada (LP/LI/LO em CAIXA ALTA) só quando o bloco também fala em
 * "licença/licenciamento" — senão "LI" casaria com algarismo romano e "LO" com qualquer
 * coisa. NÃO cobre "Licença Simplificada (LS)" — é outro tipo, fora do escopo LP/LI/LO.
 */
export function classificarTipoLicenca(bloco: string): TipoLicenca | null {
  if (RE_TIPO_PREVIA.test(bloco)) return 'Licença Prévia';
  if (RE_TIPO_INSTALACAO.test(bloco)) return 'Licença de Instalação';
  if (RE_TIPO_OPERACAO.test(bloco)) return 'Licença de Operação';

  if (RE_REGULARIZACAO_SOLTA.test(bloco)) {
    console.warn(
      '[dom-extremoz] "licença de regularização" sem tipo (operação/instalação/prévia) — revisar manualmente: ' +
        bloco.replace(/\s+/g, ' ').trim().slice(0, 200),
    );
  }

  if (/licen[çc]a|licenciamento/i.test(bloco)) {
    if (/\bLP\b/.test(bloco)) return 'Licença Prévia';
    if (/\bLRI\b|\bLI\b/.test(bloco)) return 'Licença de Instalação';
    if (/\bLRO\b|\bLIO\b|\bRLO\b|\bLO\b/.test(bloco)) return 'Licença de Operação';
  }
  return null;
}

/**
 * O bloco parece TEXTO DE NORMA (portaria, decreto, lei, resolução) e não uma publicação
 * de ato concreto. Guarda contra o falso positivo conhecido do DOM Natal ("emissão de
 * Licença de Operação" dentro de um artigo de regulamento). Portado de `dom-natal-licencas.ts`.
 */
export function pareceContextoNormativo(bloco: string): boolean {
  const temCabecalhoDeNorma =
    /\b(portaria|decreto|resolu[çc][ãa]o|instru[çc][ãa]o normativa|lei(\s+complementar)?)\s+n[ºo°.\s]/i.test(bloco);
  const temLinguagemDeNorma =
    /\bregulamenta\b|\bconsiderando\b|\bd[áa] outras provid[êe]ncias\b|\bfica\s+(instituíd|estabelecid|aprovad|regulamentad)/i.test(bloco) ||
    /\bart(?:igo)?\.?\s*\d+[ºo°]?\b/i.test(bloco);
  if (temCabecalhoDeNorma && temLinguagemDeNorma) return true;

  if (/\bemiss[ãa]o\s+(conjunta\s+)?de\s+(certid[ãa]o|licen[çc]a)/i.test(bloco)) return true;
  if (/(^|\n)\s*(?:[ivx]{1,4}|\d{1,2})\s*[–-]\s+\S/i.test(bloco) && /emiss[ãa]o de|instruir processos/i.test(bloco.toLowerCase())) {
    return true;
  }
  if (/instruir\s+processos\s+destinados/i.test(bloco)) return true;
  return false;
}

/**
 * O bloco COMEÇA com o cabeçalho de um aviso de licença ambiental do diário de Extremoz
 * ("PEDIDO DE LICENÇA…", "CONCESSÃO DE LICENÇA…", "LICENÇA DE REGULARIZAÇÃO…"). Quando é
 * o caso, ele É a publicação — mesmo que a cauda do bloco tenha grudado o próximo ato
 * (portaria com "Art. Nº"), o que faria `pareceContextoNormativo` vetar por engano.
 * Só a segmentação parte o bloco no cabeçalho; o começo é confiável, a cauda não.
 */
export function comecaComoAvisoDeLicenca(bloco: string): boolean {
  return /^\s*(?:(?:PEDIDO|CONCESS[ÃA]O|RENOVA[ÇC][ÃA]O)\s+D[EA]\s+LICEN[ÇC]A|LICEN[ÇC]A\s+(?:DE\s+REGULARIZA[ÇC][ÃA]O|SIMPLIFICADA|PR[ÉE]VIA|AMBIENTAL|DE\s+INSTALA[ÇC][ÃA]O|DE\s+OPERA[ÇC][ÃA]O))/i.test(bloco);
}

// ── Extração de campos (portada de portal-scraper) ────────────────────────────────

function limpar(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function extrairFaseObra(texto: string): string {
  const padroes = [
    /(implanta[çc][ãa]o[^,.]{0,80})/i,
    /(instala[çc][ãa]o[^,.]{0,80})/i,
    /(opera[çc][ãa]o[^,.]{0,80})/i,
    /(constru[çc][ãa]o[^,.]{0,80})/i,
    /(amplia[çc][ãa]o[^,.]{0,80})/i,
    /(reforma[^,.]{0,80})/i,
  ];
  for (const p of padroes) {
    const m = texto.match(p);
    if (m?.[1]) return limpar(m[1]);
  }
  return '';
}

export function extrairObraDescricao(texto: string): string {
  const padroes = [
    /(?:para\s+(?:a\s+|o\s+)?)((?:CONSTRU[ÇC][ÃA]O|REFORMA|AMPLIA[ÇC][ÃA]O|IMPLANTA[ÇC][ÃA]O|PAVIMENTA[ÇC][ÃA]O|LOTEAMENTO)[\s\S]{3,120}?)(?:[,.]|\s+localiz)/i,
    /empreendimento\s+(?:imobili[áa]rio\s+)?denominado\s+([\s\S]{5,100}?)(?:[,.]|\s+localiz)/i,
    /(constru[çc][ãa]o\s+residencial\s+[^,.]{0,80})/i,
    /(pavimenta[çc][ãa]o[^,.]{3,100})/i,
  ];
  for (const p of padroes) {
    const m = texto.match(p);
    if (m?.[1]) return limpar(m[1]);
  }
  return '';
}

export function extrairEmail(texto: string): string {
  return texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
}

export function extrairRazaoSocial(texto: string, cnpj: string): string {
  if (!cnpj) return '';
  const escapado = cnpj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const padrao = new RegExp(
    `([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\\s\\-.&]{3,80}?)\\s*,?\\s*(?:CNPJ|C\\.N\\.P\\.J)[:\\s/nº°-]*${escapado}`,
    'i',
  );
  const m = texto.match(padrao);
  return m ? limpar(m[1]).toUpperCase() : '';
}

export function extrairTelefone(texto: string): string {
  // BR: (84) 99999-9999 / 84 3232-1234. Evita casar pedaços de CNPJ exigindo DDD entre parênteses OU um separador claro.
  const m = texto.match(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}|\b\d{2}\s\d{4,5}-\d{4}\b/);
  return m ? limpar(m[0]) : '';
}

export function extrairEndereco(texto: string): string {
  const m =
    texto.match(/(?:localizad[oa]|situad[oa])\s+(?:na|no|em|à|a)\s+([^,.;\n]{6,120})/i) ??
    texto.match(/\b(?:Rua|Av\.?|Avenida|Rodovia|BR-?\d+|Estrada|Travessa)\s+[^,.;\n]{4,120}/i);
  if (!m) return '';
  return limpar(m[1] ?? m[0]);
}

// ── Segmentação ──────────────────────────────────────────────────────────────────

/** Cabeçalhos de ato em CAIXA ALTA no começo da linha. Portado de `dom-natal-licencas.ts`. */
// Cabeçalhos de ato em CAIXA ALTA no começo da linha — pontos de corte entre blocos.
// Além dos atos genéricos (portados do DOM Natal), inclui os cabeçalhos dos AVISOS DE
// LICENÇA AMBIENTAL do diário de Extremoz ("PEDIDO DE LICENÇA...", "CONCESSÃO DE
// LICENÇA...", "LICENÇA DE REGULARIZAÇÃO...", etc.). Sem eles, o texto sem linha em
// branco (saída do pdf-parse) gruda o aviso ambiental no ato anterior (contrato,
// portaria) e o bloco inteiro é ou classificado com o CNPJ errado, ou vetado como norma.
const CABECALHO_DE_ATO =
  /^\s*(PORTARIA|DECRETO|LEI(?:\s+COMPLEMENTAR)?|RESOLU[ÇC][ÃA]O|INSTRU[ÇC][ÃA]O\s+NORMATIVA|EXTRATO|AVISO|EDITAL|COMUNICADO|TERMO\s+(?:DE|ADITIVO)|DESPACHO|ERRATA|RESENHA|ATA|CHAMAMENTO|NOTIFICA[ÇC][ÃA]O|SECRETARIA\s+MUNICIPAL|GABINETE\s+DO|(?:PEDIDO|CONCESS[ÃA]O|RENOVA[ÇC][ÃA]O)\s+D[EA]\s+LICEN[ÇC]A|LICEN[ÇC]A\s+(?:DE\s+REGULARIZA[ÇC][ÃA]O|SIMPLIFICADA|PR[ÉE]VIA|DE\s+INSTALA[ÇC][ÃA]O|DE\s+OPERA[ÇC][ÃA]O|AMBIENTAL))\b/;

/**
 * Quebra o texto da edição em blocos: por parágrafo (linha em branco dupla) e por início
 * de um novo cabeçalho de ato. Blocos com menos de 40 caracteres são colados no anterior.
 * Idêntico ao `segmentarBlocos` do DOM Natal.
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

/** Janela de ±caracteres ao redor de cada CNPJ distinto. Reserva para quando o PDF vem
 *  sem quebras de parágrafo e a segmentação devolve um bloco só. */
function janelasPorCnpj(texto: string): string[] {
  const janelas: string[] = [];
  for (const raw of texto.match(RE_CNPJ_G) ?? []) {
    const idx = texto.indexOf(raw);
    if (idx === -1) continue;
    const janela = texto.slice(Math.max(0, idx - 400), Math.min(texto.length, idx + 600));
    if (!janelas.includes(janela)) janelas.push(janela);
  }
  return janelas.length > 0 ? janelas : [texto.slice(0, 1500)];
}

/**
 * Blocos candidatos de uma edição. Segmenta por parágrafo/cabeçalho de ato; se isso
 * degenerar num bloco único num texto grande (PDF sem quebras), cai para janelas ao
 * redor de cada CNPJ.
 */
export function blocosCandidatos(textoPdf: string): string[] {
  if (!textoPdf) return [];
  const blocos = segmentarBlocos(textoPdf);
  if (blocos.length <= 1 && textoPdf.length > 2500) {
    return janelasPorCnpj(textoPdf.replace(/\r\n?/g, '\n'));
  }
  return blocos;
}

// ── Relevância ───────────────────────────────────────────────────────────────────

/**
 * A publicação tem dado suficiente para virar uma linha na tela. Mesma régua do
 * `isRelevantExtremozEntry` do scraper antigo: tem tipo E pelo menos um campo útil.
 */
export function ehPublicacaoRelevante(p: PublicacaoExtremoz): boolean {
  return Boolean(
    p.tipo &&
      (p.prioridade || p.email || p.razaoSocial || p.obraDescricao || p.cnpj),
  );
}

/**
 * Extrai as publicações de LP/LI/LO de uma edição inteira do DOM Extremoz. Devolve só o
 * que: menciona o tipo, NÃO é texto de norma, e tem algum dado de núcleo. `texto` sai
 * aparado em 2000 caracteres (é o que alimenta `licencas_extremoz.bloco_texto` e o hash
 * de dedupe).
 */
export function extrairPublicacoesDeLicenca(textoPdf: string): PublicacaoExtremoz[] {
  const achados: PublicacaoExtremoz[] = [];
  const vistos = new Set<string>();

  for (const bloco of blocosCandidatos(textoPdf)) {
    const tipo = classificarTipoLicenca(bloco);
    if (!tipo) continue;
    if (pareceContextoNormativo(bloco) && !comecaComoAvisoDeLicenca(bloco)) continue;

    // Quando o bloco começa como aviso mas ficou longo (a cauda grudou o próximo ato),
    // extrai os campos só do começo — é ali que estão o CNPJ e o endereço do requerente.
    const alcance =
      comecaComoAvisoDeLicenca(bloco) && bloco.length > 1800 ? bloco.slice(0, 1500) : bloco;

    const cnpj = cnpjDoRequerente(alcance);
    const pub: PublicacaoExtremoz = {
      tipo,
      prioridade: extrairFaseObra(alcance),
      cnpj,
      razaoSocial: extrairRazaoSocial(alcance, cnpj),
      nomeFantasia: '',
      telefone: extrairTelefone(alcance),
      email: extrairEmail(alcance),
      enderecoEmpresa: extrairEndereco(alcance),
      quadroSocietario: '',
      obraDescricao: extrairObraDescricao(alcance),
      texto: bloco.trim().slice(0, 2000),
    };
    if (!ehPublicacaoRelevante(pub)) continue;

    const chave = `${pub.tipo}|${pub.cnpj}|${pub.texto.slice(0, 120)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    achados.push(pub);
  }
  return achados;
}
