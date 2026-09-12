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

/** Prazo da consulta. Passou disso, o caso é `demorou` — nunca "não existe". */
export const PRAZO_DA_CONSULTA_MS = 10_000;

export type CasoDaConsulta = 'encontrado' | 'nao_existe' | 'servico_falhou' | 'demorou';

export type ResultadoDaConsulta =
  | { caso: 'encontrado'; dados: CnpjData }
  | { caso: Exclude<CasoDaConsulta, 'encontrado'> };

/**
 * A ÚNICA porta do sistema para o BrasilAPI de CNPJ — `src/test/uma-consulta-de-cnpj-so.test.ts`
 * falha se nascer outra.
 *
 * 🔴 Devolve O QUE ACONTECEU, em quatro casos, e nunca lança. A versão anterior
 * (`fetchCnpjData`) transformava qualquer resposta que não fosse 200 em "CNPJ não encontrado":
 * recusa do Cloudflare (403), excesso de consultas (429) e servidor fora (5xx) saíam com a mesma
 * frase de empresa inexistente. Com a fábrica passando a BLOQUEAR CNPJ inexistente, essa mistura
 * barraria cadastro legítimo por culpa de um serviço de fora.
 *
 * Só é `nao_existe` o 404 com o corpo do próprio BrasilAPI (`"type":"not_found"`, medido em
 * 11/09/2026). Um 404 sem esse corpo veio de outro lugar, e conta como falha do serviço.
 */
export async function consultarCnpj(
  cnpj: string,
  prazoMs = PRAZO_DA_CONSULTA_MS,
): Promise<ResultadoDaConsulta> {
  const digitos = unmaskCnpj(cnpj);
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), prazoMs);

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, {
      signal: controle.signal,
    });
    if (res.ok) return { caso: 'encontrado', dados: (await res.json()) as CnpjData };
    if (res.status === 404) {
      const corpo = await res.json().catch(() => null);
      return corpo?.type === 'not_found' ? { caso: 'nao_existe' } : { caso: 'servico_falhou' };
    }
    return { caso: 'servico_falhou' };
  } catch {
    return controle.signal.aborted ? { caso: 'demorou' } : { caso: 'servico_falhou' };
  } finally {
    clearTimeout(relogio);
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
