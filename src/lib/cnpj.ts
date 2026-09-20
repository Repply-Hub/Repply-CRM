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

// ─── CPF e o campo que aceita os dois ──────────────────────────────────

/**
 * Dígito verificador do CPF. Todos os dígitos iguais (`111.111.111-11`) PASSAM na conta e não
 * existem — por isso a recusa por regra, igual à do CNPJ.
 */
export function isValidCpfDigits(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += parseInt(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === parseInt(d[9]) && digito(10) === parseInt(d[10]);
}

// Máscara: 000.000.000-00
export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Máscara do campo que aceita os dois: até 11 dígitos desenha CPF; de 12 em diante, CNPJ. */
export function maskCpfOuCnpj(value: string): string {
  const digitos = value.replace(/\D/g, '');
  return digitos.length <= 11 ? maskCpf(digitos) : maskCnpj(digitos);
}

/**
 * Para MOSTRAR um documento gravado. O banco tem os dois formatos (só dígitos e com máscara), e
 * o que está fora do formato volta como veio: inventar máscara em número incompleto mostraria um
 * documento que não existe.
 */
export function formatarDocumento(valor: string | null | undefined): string {
  const bruto = (valor ?? '').trim();
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length === 14) return maskCnpj(digitos);
  if (digitos.length === 11) return maskCpf(digitos);
  return bruto;
}

export type ClasseDoDocumento = 'vazio' | 'inalterado' | 'incompleto' | 'invalido' | 'cpf' | 'cnpj';
/** O que o campo sabe depois de conferir: `cnpj` vira um dos casos da consulta à Receita. */
export type ResultadoDoDocumento = Exclude<ClasseDoDocumento, 'cnpj'> | CasoDaConsulta;
export type SeNaoExistir = 'bloquear' | 'avisar';

/**
 * O que o número digitado é, sem consultar ninguém.
 *
 * 🔴 CPF ou CNPJ é decidido pelo NÚMERO DE DÍGITOS, nunca pelo tipo do cliente (decisão do dono do
 * produto, 11/09/2026). É o que faz o campo valer para os tipos que as empresas ainda vão criar.
 *
 * `valorJaGravado`: enquanto o campo tiver o mesmo número do banco, ele é `inalterado` e não se
 * confere nada. Medido em 11/09/2026: 325 clientes têm documento com 5, 9, 10, 12 ou 13 dígitos;
 * conferir sempre travaria a edição deles até para trocar o telefone.
 */
export function classificarDocumento(
  valor: string | null | undefined,
  opcoes: { aceitaCpf?: boolean; valorJaGravado?: string | null } = {},
): ClasseDoDocumento {
  const digitos = unmaskCnpj(valor ?? '');
  if (!digitos) return 'vazio';
  if (opcoes.valorJaGravado && digitos === unmaskCnpj(opcoes.valorJaGravado)) return 'inalterado';
  if (digitos.length === 14) return isValidCnpjDigits(digitos) ? 'cnpj' : 'invalido';
  if (opcoes.aceitaCpf && digitos.length === 11) return isValidCpfDigits(digitos) ? 'cpf' : 'invalido';
  return 'incompleto';
}

/**
 * Pode salvar? Número digitado errado trava em qualquer tela. A Receita dizendo que não existe só
 * trava fábrica. Serviço fora ou lento NUNCA trava — seria barrar cadastro legítimo por culpa de
 * um serviço de fora. Campo vazio libera: a obrigatoriedade é regra de cada formulário.
 */
export function resultadoPermiteSalvar(resultado: ResultadoDoDocumento, seNaoExistir: SeNaoExistir): boolean {
  if (resultado === 'invalido' || resultado === 'incompleto') return false;
  if (resultado === 'nao_existe') return seNaoExistir === 'avisar';
  return true;
}

/** A frase de cada caso — as da §4.1 do desenho de 11/09/2026. Tela nenhuma escreve a sua. */
export function mensagemDoDocumento(
  resultado: ResultadoDoDocumento,
  opcoes: { seNaoExistir: SeNaoExistir; aceitaCpf?: boolean },
): { tom: 'erro' | 'aviso'; texto: string } | null {
  switch (resultado) {
    case 'invalido':
      return {
        tom: 'erro',
        texto: opcoes.aceitaCpf ? 'CPF ou CNPJ inválido — confira os dígitos.' : 'CNPJ inválido — confira os dígitos.',
      };
    case 'incompleto':
      return { tom: 'erro', texto: opcoes.aceitaCpf ? 'CPF tem 11 dígitos e CNPJ tem 14.' : 'O CNPJ tem 14 dígitos.' };
    case 'nao_existe':
      return opcoes.seNaoExistir === 'bloquear'
        ? { tom: 'erro', texto: 'A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ.' }
        : {
            tom: 'aviso',
            texto:
              'A Receita ainda não tem este CNPJ. Empresa aberta há pouco tempo pode levar semanas para aparecer — o cadastro segue com o número.',
          };
    case 'servico_falhou':
      return { tom: 'aviso', texto: 'Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência.' };
    case 'demorou':
      return { tom: 'aviso', texto: 'A consulta à Receita demorou demais. O cadastro segue com o CNPJ, sem a conferência.' };
    default:
      return null;
  }
}

// ─── Documento repetido na mesma empresa ───────────────────────────────

/** A trava de unicidade de `clientes` (migration `20260709174302_clientes_cnpj_unique_por_empresa.sql`). */
const TRAVA_DOCUMENTO_DUPLICADO = 'clientes_empresa_id_cnpj_key';

export const MENSAGEM_DOCUMENTO_DUPLICADO = 'Já existe um cliente com este CPF ou CNPJ.';

/**
 * A gravação em `clientes` caiu na trava de documento repetido na mesma empresa?
 *
 * 🔴 Erro do Supabase NÃO é um `Error` (CLAUDE.md §4.6): é objeto simples com `code`, `message`,
 * `details`. `23505` é violação de unicidade em geral — hoje `clientes` só tem esta trava, então
 * o código já bastaria —, mas conferir também o nome da trava mantém a função certa se um dia
 * nascer outra trava de unicidade na tabela, sem precisar mexer em quem chama.
 */
export function ehDocumentoDuplicado(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const o = erro as { code?: unknown; message?: unknown; details?: unknown };
  if (o.code !== '23505') return false;
  const texto = [o.message, o.details].filter((p): p is string => typeof p === 'string').join(' ');
  return texto.includes(TRAVA_DOCUMENTO_DUPLICADO);
}
