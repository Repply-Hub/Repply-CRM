import { telefoneParaCadastro } from './contato-da-conversa';

// Mask: 00.000.000/0000-00
export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// Remove mask
export function unmaskCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

// Local digit validation
export function isValidCnpjDigits(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (slice: string, weights: number[]) => {
    const sum = slice.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 13), w2);

  return parseInt(digits[12]) === d1 && parseInt(digits[13]) === d2;
}

export interface CnpjData {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  ddd_telefone_1: string;
}

const FETCH_TIMEOUT_MS = 10_000;

// Fetch from BrasilAPI (free, no key)
export async function fetchCnpjData(cnpj: string): Promise<CnpjData> {
  const digits = cnpj.replace(/\D/g, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('CNPJ não encontrado na base da Receita Federal');
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Consulta de CNPJ expirou. Verifique sua conexão e tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * O telefone da Receita, pronto para o campo do formulário.
 *
 * 🔴 O BrasilAPI devolve o telefone só em dígitos, com o DDD grudado no número: a Petrobras
 * volta como `"2121660000"` (medido em 11/09/2026). Jogar isso direto no campo — o que Clientes
 * e Fabricantes faziam — mostrava um número que ninguém reconhece como telefone.
 *
 * Reaproveita `telefoneParaCadastro`, o formatador que o campo de telefone de Fabricantes já usa
 * ao sair do campo: assim o número que a consulta preenche sai no mesmo formato do que a pessoa
 * digita. Formato que não é telefone brasileiro volta como veio — a própria Receita guarda lixo
 * em alguns cadastros, e inventar um número a partir dele seria pior que mostrar o original.
 */
export function telefoneDaReceita(dados: Pick<CnpjData, 'ddd_telefone_1'>): string {
  return telefoneParaCadastro(dados?.ddd_telefone_1);
}
