import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
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
      // `useContatosComEsteTelefone` pagina contatos; não é o alvo destes testes, mas o mock
      // precisa existir para o módulo carregar sem estourar.
      select: () => ({
        not: () => ({ range: async () => ({ data: [], error: null }) }),
      }),
    }),
  },
}));

import {
  useDesvincularConversa,
  useVincularContatoExistente,
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
