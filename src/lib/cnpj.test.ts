import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  consultarCnpj,
  telefoneDaReceita,
  isValidCpfDigits,
  maskCpf,
  maskCpfOuCnpj,
  formatarDocumento,
  classificarDocumento,
  resultadoPermiteSalvar,
  mensagemDoDocumento,
  ehDocumentoDuplicado,
} from './cnpj';

/**
 * O telefone que a consulta de CNPJ traz da Receita.
 *
 * 🔴 POR QUE ISTO EXISTE (relatado pelo Lucas em 11/09/2026: "achei estranho o telefone que
 * puxou"). O BrasilAPI devolve o telefone só em dígitos, com o DDD grudado no número — a
 * Petrobras volta como `ddd_telefone_1: "2121660000"`, medido em 11/09/2026. As telas de
 * Clientes e Fabricantes jogavam esse texto cru no campo, e a pessoa via `2121660000`.
 */
describe('telefoneDaReceita', () => {
  it('formata o fixo que a Receita devolve em dígitos, com o DDD grudado', () => {
    expect(telefoneDaReceita({ ddd_telefone_1: '2121660000' })).toBe('(21) 2166-0000');
  });

  it('formata o celular de onze dígitos', () => {
    expect(telefoneDaReceita({ ddd_telefone_1: '84999887766' })).toBe('(84) 99988-7766');
  });

  it('telefone ausente na Receita vira campo vazio, e não o texto "undefined"', () => {
    expect(telefoneDaReceita({ ddd_telefone_1: '' })).toBe('');
    expect(telefoneDaReceita({ ddd_telefone_1: undefined as unknown as string })).toBe('');
  });

  it('formato que não é telefone brasileiro volta como veio, sem inventar número', () => {
    // A própria Receita guarda lixo em alguns cadastros: o fax da Petrobras volta "213224".
    expect(telefoneDaReceita({ ddd_telefone_1: '213224' })).toBe('213224');
  });
});

function respostaDoServico(status: number, corpo: unknown, corpoQuebrado = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (corpoQuebrado) throw new SyntaxError('Unexpected token <');
      return corpo;
    },
  } as unknown as Response;
}

describe('consultarCnpj — o que a Receita respondeu', () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    fetchFalso.mockReset();
    vi.stubGlobal('fetch', fetchFalso);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 é encontrado, com os dados — e a consulta vai só com os dígitos', async () => {
    fetchFalso.mockResolvedValue(respostaDoServico(200, { razao_social: 'Empresa Exemplo Ltda' }));
    const r = await consultarCnpj('11.222.333/0001-81');
    expect(r.caso).toBe('encontrado');
    expect(r.caso === 'encontrado' && r.dados.razao_social).toBe('Empresa Exemplo Ltda');
    expect(fetchFalso.mock.calls[0][0]).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
  });

  it('404 com o corpo do BrasilAPI é nao_existe', async () => {
    fetchFalso.mockResolvedValue(
      respostaDoServico(404, { type: 'not_found', name: 'NotFoundError', message: 'CNPJ não encontrado.' }),
    );
    await expect(consultarCnpj('98765432000198')).resolves.toEqual({ caso: 'nao_existe' });
  });

  it('404 sem o corpo do BrasilAPI é servico_falhou — só a Receita confirmando bloqueia fábrica', async () => {
    fetchFalso.mockResolvedValue(respostaDoServico(404, null, true));
    await expect(consultarCnpj('98765432000198')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it.each([403, 429, 500, 502, 503])('%i é servico_falhou', async (status) => {
    fetchFalso.mockResolvedValue(respostaDoServico(status, { message: 'erro' }));
    await expect(consultarCnpj('11222333000181')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it('erro de rede é servico_falhou', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(consultarCnpj('11222333000181')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it('200 com corpo quebrado é servico_falhou', async () => {
    fetchFalso.mockResolvedValue(respostaDoServico(200, null, true));
    await expect(consultarCnpj('11222333000181')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it('passou do prazo é demorou — nunca "não existe"', async () => {
    fetchFalso.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_ok, rejeitar) => {
          init.signal!.addEventListener('abort', () =>
            rejeitar(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    await expect(consultarCnpj('11222333000181', 20)).resolves.toEqual({ caso: 'demorou' });
  });
});

describe('isValidCpfDigits', () => {
  it('aceita CPF com dígitos verificadores certos, com ou sem máscara', () => {
    expect(isValidCpfDigits('52998224725')).toBe(true);
    expect(isValidCpfDigits('529.982.247-25')).toBe(true);
    expect(isValidCpfDigits('11144477735')).toBe(true);
  });
  it('recusa dígito verificador errado', () => {
    expect(isValidCpfDigits('52998224724')).toBe(false);
  });
  it('recusa todos os dígitos iguais — passam na conta e não existem', () => {
    expect(isValidCpfDigits('11111111111')).toBe(false);
    expect(isValidCpfDigits('00000000000')).toBe(false);
  });
  it('recusa tamanho diferente de 11', () => {
    expect(isValidCpfDigits('5299822472')).toBe(false);
    expect(isValidCpfDigits('529982247250')).toBe(false);
  });
});

describe('maskCpfOuCnpj — a máscara acompanha o número de dígitos', () => {
  it('até 11 dígitos desenha CPF', () => {
    expect(maskCpfOuCnpj('52998224725')).toBe('529.982.247-25');
    expect(maskCpfOuCnpj('5299')).toBe('529.9');
  });
  it('de 12 em diante desenha CNPJ, e para no 14º', () => {
    expect(maskCpfOuCnpj('529.982.247-251')).toBe('52.998.224/7251');
    expect(maskCpfOuCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskCpfOuCnpj('112223330001819')).toBe('11.222.333/0001-81');
  });
});

describe('formatarDocumento — só para MOSTRAR', () => {
  it('14 dígitos ganha máscara de CNPJ, 11 de CPF', () => {
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
  });
  it('já mascarado continua igual', () => {
    expect(formatarDocumento('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });
  it('fora do formato volta como veio — mostrar número inventado seria pior', () => {
    expect(formatarDocumento('1122233300018')).toBe('1122233300018');
    expect(formatarDocumento('')).toBe('');
    expect(formatarDocumento(null)).toBe('');
  });
});

describe('classificarDocumento', () => {
  it('vazio é vazio', () => {
    expect(classificarDocumento('')).toBe('vazio');
    expect(classificarDocumento('   ')).toBe('vazio');
    expect(classificarDocumento(null)).toBe('vazio');
  });
  it('14 dígitos certos é cnpj, em qualquer campo', () => {
    expect(classificarDocumento('11.222.333/0001-81')).toBe('cnpj');
    expect(classificarDocumento('11222333000181', { aceitaCpf: true })).toBe('cnpj');
  });
  it('14 dígitos com verificador errado é invalido', () => {
    expect(classificarDocumento('11222333000182')).toBe('invalido');
  });
  it('11 dígitos só é CPF onde o campo aceita CPF', () => {
    expect(classificarDocumento('52998224725', { aceitaCpf: true })).toBe('cpf');
    expect(classificarDocumento('52998224725')).toBe('incompleto');
  });
  it('CPF com verificador errado é invalido', () => {
    expect(classificarDocumento('52998224724', { aceitaCpf: true })).toBe('invalido');
  });
  it('12 ou 13 dígitos não é nem CPF nem CNPJ', () => {
    expect(classificarDocumento('529982247251', { aceitaCpf: true })).toBe('incompleto');
    expect(classificarDocumento('1122233300018', { aceitaCpf: true })).toBe('incompleto');
  });
  it('documento gravado que ninguém mexeu é inalterado, mesmo fora do formato', () => {
    expect(
      classificarDocumento('11.222.333/0001-8', { aceitaCpf: true, valorJaGravado: '1122233300018' }),
    ).toBe('inalterado');
    expect(classificarDocumento('11.222.333/0001-81', { valorJaGravado: '11222333000181' })).toBe('inalterado');
  });
  it('mexeu no documento gravado, volta a conferir', () => {
    expect(
      classificarDocumento('11222333000182', { aceitaCpf: true, valorJaGravado: '1122233300018' }),
    ).toBe('invalido');
  });
});

describe('resultadoPermiteSalvar', () => {
  it('fábrica não salva com CNPJ que a Receita confirma não existir', () => {
    expect(resultadoPermiteSalvar('nao_existe', 'bloquear')).toBe(false);
  });
  it('cliente salva mesmo assim', () => {
    expect(resultadoPermiteSalvar('nao_existe', 'avisar')).toBe(true);
  });
  it.each(['servico_falhou', 'demorou'] as const)('%s nunca trava — a culpa é do serviço', (r) => {
    expect(resultadoPermiteSalvar(r, 'bloquear')).toBe(true);
    expect(resultadoPermiteSalvar(r, 'avisar')).toBe(true);
  });
  it.each(['invalido', 'incompleto'] as const)('%s trava em qualquer tela — é número digitado errado', (r) => {
    expect(resultadoPermiteSalvar(r, 'bloquear')).toBe(false);
    expect(resultadoPermiteSalvar(r, 'avisar')).toBe(false);
  });
  it.each(['vazio', 'inalterado', 'cpf', 'encontrado'] as const)('%s libera', (r) => {
    expect(resultadoPermiteSalvar(r, 'bloquear')).toBe(true);
  });
});

describe('mensagemDoDocumento — as frases da §4.1 do desenho', () => {
  it('fábrica: não existe é erro, com a saída de cadastrar sem CNPJ', () => {
    expect(mensagemDoDocumento('nao_existe', { seNaoExistir: 'bloquear' })).toEqual({
      tom: 'erro',
      texto: 'A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ.',
    });
  });
  it('cliente: não existe é aviso', () => {
    expect(mensagemDoDocumento('nao_existe', { seNaoExistir: 'avisar' })).toEqual({
      tom: 'aviso',
      texto:
        'A Receita ainda não tem este CNPJ. Empresa aberta há pouco tempo pode levar semanas para aparecer — o cadastro segue com o número.',
    });
  });
  it('serviço fora e demora são aviso nas duas regras', () => {
    expect(mensagemDoDocumento('servico_falhou', { seNaoExistir: 'bloquear' })).toEqual({
      tom: 'aviso',
      texto: 'Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência.',
    });
    expect(mensagemDoDocumento('demorou', { seNaoExistir: 'avisar' })).toEqual({
      tom: 'aviso',
      texto: 'A consulta à Receita demorou demais. O cadastro segue com o CNPJ, sem a conferência.',
    });
  });
  it('campo que aceita CPF explica os dois tamanhos', () => {
    expect(mensagemDoDocumento('incompleto', { seNaoExistir: 'avisar', aceitaCpf: true })?.texto).toBe(
      'CPF tem 11 dígitos e CNPJ tem 14.',
    );
    expect(mensagemDoDocumento('incompleto', { seNaoExistir: 'bloquear' })?.texto).toBe('O CNPJ tem 14 dígitos.');
  });
  it.each(['encontrado', 'cpf', 'vazio', 'inalterado'] as const)('%s: nada a dizer', (r) => {
    expect(mensagemDoDocumento(r, { seNaoExistir: 'avisar' })).toBeNull();
  });
});

describe('ehDocumentoDuplicado — a trava de CPF/CNPJ repetido na mesma empresa', () => {
  it('código 23505 com o nome da trava de documento é duplicado', () => {
    expect(
      ehDocumentoDuplicado({
        code: '23505',
        message: 'duplicate key value violates unique constraint "clientes_empresa_id_cnpj_key"',
        details: 'Key (empresa_id, cnpj)=(...) already exists.',
      }),
    ).toBe(true);
  });
  it('código 23505 de OUTRA trava não é documento duplicado', () => {
    expect(
      ehDocumentoDuplicado({
        code: '23505',
        message: 'duplicate key value violates unique constraint "outra_trava_qualquer_key"',
      }),
    ).toBe(false);
  });
  it('outro código não é duplicado', () => {
    expect(ehDocumentoDuplicado({ code: '23503', message: 'violates foreign key constraint' })).toBe(false);
  });
  it('null não é duplicado', () => {
    expect(ehDocumentoDuplicado(null)).toBe(false);
  });
  it('um Error comum não é duplicado — erro do Supabase não é Error (CLAUDE.md §4.6)', () => {
    expect(ehDocumentoDuplicado(new Error('falha ao salvar'))).toBe(false);
  });
});
