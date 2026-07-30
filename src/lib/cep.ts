export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

export function unmaskCep(value: string): string {
  return value.replace(/\D/g, '');
}

export interface CepData {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
}

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchCepData(cep: string): Promise<CepData> {
  const digits = cep.replace(/\D/g, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('CEP não encontrado');
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Consulta de CEP expirou. Verifique sua conexão e tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface EnderecoFields {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const emptyEndereco: EnderecoFields = {
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
};

export function enderecoToString(e: EnderecoFields): string {
  return [
    e.logradouro,
    e.numero,
    e.complemento,
    e.bairro,
    e.cidade && e.uf ? `${e.cidade} - ${e.uf}` : e.cidade || e.uf,
    e.cep,
  ].filter(Boolean).join(', ');
}

export const UF_SET = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

// Extrai um CEP de qualquer posição da string (não só no final) — endereços reais têm o
// CEP em qualquer lugar: rotulado ("Cep:59151-610 Parnamirim/RN") ou solto no meio/fim.
// Prioriza um trecho rotulado com "cep"; sem rótulo, exige separador entre os blocos de
// 5 e 3 dígitos (evita casar 8 dígitos soltos que não tenham nada a ver com CEP).
function extractCep(s: string): { cep: string; rest: string } | null {
  const labeled = s.match(/cep[:\s.]*?(\d{2}\.?\d{3})[-.\s]?(\d{3})\b/i);
  const match = labeled ?? s.match(/\b(\d{2}\.?\d{3})[-.](\d{3})\b/);
  if (!match) return null;

  const digits = (match[1] + match[2]).replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const rest = (s.slice(0, match.index) + ' ' + s.slice(match.index! + match[0].length))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,.\-–—/]+|[\s,.\-–—/]+$/g, '')
    .trim();

  return { cep: `${digits.slice(0, 5)}-${digits.slice(5)}`, rest };
}

// Extrai uma UF válida colada ao final da string, aceitando espaço, vírgula, traço (curto
// ou longo) ou barra como separador (ex: "Natal RN", "Natal-RN", "Natal/RN", "Natal – RN").
function extractUf(s: string): { uf: string; rest: string } | null {
  const match = s.match(/[\s,.\-–—/]+([A-Za-z]{2})\s*$/);
  if (!match) return null;
  const uf = match[1].toUpperCase();
  if (!UF_SET.has(uf)) return null;
  return { uf, rest: s.slice(0, match.index).trim() };
}

// Endereços exportados de outros sistemas (ex: Bitrix24) costumam vir como um único
// bloco "Rua, Número, Bairro, Cidade UF – CEP (lat, lng)", sem vírgula/traço separando
// cidade, UF e CEP como o resto do parser abaixo espera. Normaliza esse formato compacto
// para "..., Cidade - UF, CEP" antes de seguir o parsing normal por vírgula.
function normalizeEnderecoCompacto(addr: string): string {
  let s = addr.trim();

  // Remove sufixo de coordenadas "(lat, lng)" ou qualquer parêntese final.
  s = s.replace(/\s*\([^()]*\)\s*$/, '').trim();

  const cepResult = extractCep(s);
  let cep = '';
  if (cepResult) {
    cep = cepResult.cep;
    s = cepResult.rest;
  }

  const ufResult = extractUf(s);
  if (ufResult) {
    s = ufResult.rest ? `${ufResult.rest} - ${ufResult.uf}` : ufResult.uf;
  }

  if (cep) s += `, ${cep}`;
  return s;
}

// Endereços com pouca ou nenhuma vírgula acabam empurrando trechos inteiros (bairro,
// cidade, UF) para dentro do que seria o "número" quando o resto do texto está separado
// por traço em vez de vírgula. Só aceita o campo inteiro se ele já parece um número de
// verdade; senão, extrai só o token inicial (número ou "SN") e descarta o resto — melhor
// ficar vazio do que carregar lixo para o campo errado.
function sanitizeNumero(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(\d+[a-zA-Z]?|s\/?n|km\s*\d+)$/i.test(trimmed)) return trimmed;
  const leading = trimmed.match(/^(\d+[a-zA-Z]?|s\/?n)\b/i);
  return leading ? leading[1] : '';
}

export function stringToEndereco(addr: string): EnderecoFields {
  if (!addr) return { ...emptyEndereco };
  const rawParts = normalizeEnderecoCompacto(addr).split(',').map(s => s.trim()).filter(p => p !== '');

  // Remove o CEP (se o último trecho for um) antes de decidir a posição dos outros
  // campos — assim ele nunca é confundido com cidade/bairro quando o texto original não
  // tinha vírgula suficiente para separar tudo (ver normalizeEnderecoCompacto/extractCep).
  let cep = '';
  let parts = rawParts;
  const lastPart = rawParts[rawParts.length - 1] || '';
  if (/^\d{5}-?\d{3}$/.test(lastPart.replace(/\s/g, ''))) {
    cep = lastPart;
    parts = rawParts.slice(0, -1);
  }

  const logradouro = parts[0] || '';
  const numero = sanitizeNumero(parts[1] || '');
  // Formato variável: "log, num, bairro, cidade - UF" ou "log, num, complemento, bairro, cidade - UF"
  let complemento = '';
  let bairro = '';
  let cidadeUfRaw = '';

  if (parts.length >= 5) {
    complemento = parts[2] || '';
    bairro = parts[3] || '';
    cidadeUfRaw = parts.slice(4).join(', ');
  } else if (parts.length === 4) {
    bairro = parts[2] || '';
    cidadeUfRaw = parts[3] || '';
  } else if (parts.length === 3) {
    cidadeUfRaw = parts[2] || '';
  }

  const ufResult = extractUf(cidadeUfRaw);
  const cidade = ufResult ? ufResult.rest : cidadeUfRaw;
  const uf = ufResult ? ufResult.uf : '';

  return { cep: maskCep(cep), logradouro, numero, complemento, bairro, cidade, uf };
}
