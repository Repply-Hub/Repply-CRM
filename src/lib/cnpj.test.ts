import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { consultarCnpj, telefoneDaReceita } from './cnpj';

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
