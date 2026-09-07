import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A gravação do vínculo entre conversa de WhatsApp e contato do CRM.
 *
 * 🔴 TRÊS COISAS AQUI SÃO DECISÃO, NÃO DETALHE — e as três falham em silêncio:
 *
 *   1. DESVINCULAR APAGA OS DOIS, empresa e pessoa. Limpar só a pessoa deixaria a conversa com
 *      empresa e sem contato, e nesse estado o bloco de reconhecimento continua escondido — o
 *      "desvincular" não devolveria a conversa ao estado de onde ela veio, que é todo o ponto.
 *
 *   2. UPDATE QUE NÃO CASA LINHA NENHUMA NÃO É ERRO no PostgREST: é sucesso com zero linhas. É
 *      assim que a regra de segurança do banco recusa. Sem conferir, a tela diz "desvinculado"
 *      sobre coisa que continua vinculada — o defeito repetido em quatro telas deste sistema.
 *
 *   3. VINCULAR SÓ MANDA `cliente_id` QUANDO EXISTE UM. Mandar `null` quando o contato não tem
 *      empresa apagaria a empresa que a conversa já tinha por outro caminho.
 */

let respostaDoUpdate: { data: unknown; error: unknown } = { data: [{ id: 'conv-1' }], error: null };
const atualizou = vi.fn();
/** Registra qualquer `.not(...)` na consulta de reconhecimento — ver o teste do Djair. */
const filtrouContatos = vi.fn();
const contatosDoBanco = [
  { id: 'c-1', nome_contato: 'Djair - Licenge', telefone: null, cargo: null, cliente_id: 'cli-1', empresa: null, cliente: { empresa: 'Construtora Licenge Ltda' } },
  { id: 'c-2', nome_contato: 'Nara - Licenge', telefone: '(84) 3388-0040', cargo: null, cliente_id: 'cli-1', empresa: null, cliente: { empresa: 'Construtora Licenge Ltda' } },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
      update: (payload: unknown) => {
        atualizou(tabela, payload);
        return {
          eq: () => ({
            select: async () => respostaDoUpdate,
          }),
        };
      },
      // A consulta de reconhecimento. O mock aceita `.not(...)` mas ANOTA a chamada: é assim
      // que o teste do Djair percebe se alguém devolver o filtro de telefone.
      select: () => {
        const cadeia = {
          not: (...args: unknown[]) => {
            filtrouContatos(...args);
            return cadeia;
          },
          range: async () => ({ data: contatosDoBanco, error: null }),
        };
        return cadeia;
      },
    }),
  },
}));

import {
  useDesvincularConversa,
  useVincularContatoExistente,
  useContatosParaVincular,
} from './use-contato-por-telefone';

function envolver() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

/** O que foi mandado para `whatsapp_conversas` no último update. */
function ultimoUpdate() {
  const chamada = [...atualizou.mock.calls].reverse().find(([t]) => t === 'whatsapp_conversas');
  return chamada ? (chamada[1] as Record<string, unknown>) : null;
}

beforeEach(() => {
  respostaDoUpdate = { data: [{ id: 'conv-1' }], error: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useDesvincularConversa', () => {
  it('🔴 apaga a pessoa E a empresa — só a pessoa deixaria a conversa num limbo', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDesvincularConversa(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversaId: 'conv-1' });
    });

    expect(ultimoUpdate()).toEqual({ contato_id: null, cliente_id: null });
  });

  it('🔴 zero linhas gravadas NÃO é sucesso — é a regra de segurança recusando', async () => {
    respostaDoUpdate = { data: [], error: null }; // como o PostgREST responde quando a RLS filtra
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDesvincularConversa(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ conversaId: 'conv-1' });
      }),
    ).rejects.toThrow(/regra de segurança/i);
  });

  it('erro do banco sobe em vez de virar sucesso silencioso', async () => {
    respostaDoUpdate = { data: null, error: { message: 'boom', code: '42501' } };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDesvincularConversa(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ conversaId: 'conv-1' });
      }),
    ).rejects.toBeTruthy();
  });
});

describe('useVincularContatoExistente', () => {
  it('manda a empresa junto quando o contato tem uma', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useVincularContatoExistente(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversaId: 'conv-1',
        contatoId: 'ct-9',
        clienteId: 'cli-7',
      });
    });

    expect(ultimoUpdate()).toEqual({ contato_id: 'ct-9', cliente_id: 'cli-7' });
  });

  it('🔴 NÃO manda cliente_id quando o contato não tem empresa — apagaria a que já estava lá', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useVincularContatoExistente(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversaId: 'conv-1', contatoId: 'ct-9', clienteId: null });
    });

    expect(ultimoUpdate()).toEqual({ contato_id: 'ct-9' });
    expect(ultimoUpdate()).not.toHaveProperty('cliente_id');
  });

  it('zero linhas gravadas também é recusa aqui', async () => {
    respostaDoUpdate = { data: [], error: null };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useVincularContatoExistente(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ conversaId: 'conv-1', contatoId: 'ct-9' });
      }),
    ).rejects.toThrow(/regra de segurança/i);
  });
});

describe('a busca de contatos para reconhecer NÃO exclui quem está sem telefone', () => {
  it('🔴 traz o contato sem telefone — é a ficha "Djair - Licenge" do caso real de 06/09/2026', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useContatosParaVincular(true), { wrapper });

    await waitFor(() => expect(result.current.carregando).toBe(false));

    const semTelefone = result.current.contatos.find((c) => c.telefone === null);
    expect(
      semTelefone,
      'A consulta voltou a esconder quem está sem telefone. Foi assim que o chat do Djair ' +
        'ofereceu só "Cadastrar como contato", embora ele tivesse três fichas no CRM — e são ' +
        '196 contatos nessa situação nesta base.',
    ).toBeDefined();
    expect(semTelefone?.nome_contato).toBe('Djair - Licenge');
  });

  it('🔴 nenhum `.not()` é aplicado à consulta — o filtro de telefone não pode voltar', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useContatosParaVincular(true), { wrapper });

    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(
      filtrouContatos.mock.calls,
      'Alguém adicionou um filtro na consulta de reconhecimento. Se for `telefone is null`, ' +
        'ele apaga o casamento por NOME e a busca à mão de quem não tem telefone gravado.',
    ).toEqual([]);
  });

  it('o nome da empresa vem do vínculo quando o contato não tem o texto solto', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useContatosParaVincular(true), { wrapper });

    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(result.current.contatos.map((c) => c.empresa)).toEqual([
      'Construtora Licenge Ltda',
      'Construtora Licenge Ltda',
    ]);
  });
});
