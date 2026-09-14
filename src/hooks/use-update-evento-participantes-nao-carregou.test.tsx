import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: a defesa de `useUpdateEvento` do Bloco 3, item A, passo 4 —
 * "não carregou" não pode virar "retirar todo mundo".
 *
 * `EventDialog` grava `undefined` em `form.participantes` enquanto a consulta de participantes
 * existentes não voltou, e só troca para um array (mesmo vazio) depois que ela resolve — ver
 * o comentário em `EventDialog.tsx` perto de `participantes: undefined,`. É essa distinção que
 * o hook usa aqui: `undefined` é recusado sem tocar o banco; `[]` (a pessoa esvaziou a seleção
 * de propósito, deixando só quem organiza) segue o caminho de sempre.
 *
 * Na prática, com o botão Salvar desabilitado enquanto a consulta não volta (também deste
 * bloco), este caminho só dispara se algum código futuro chamar `useUpdateEvento` sem passar
 * pelo `EventDialog` — é rede de segurança, não o conserto principal.
 */

const chamadasAoBanco: string[] = [];

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'organizador' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => {
          chamadasAoBanco.push('select');
          return { data: [{ user_id: 'organizador' }, { user_id: 'convidado-1' }], error: null };
        },
      }),
      delete: () => {
        chamadasAoBanco.push('delete');
        return { eq: () => ({ in: async () => ({ error: null }) }) };
      },
      update: () => {
        chamadasAoBanco.push('update');
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => {
        chamadasAoBanco.push('insert');
        return { error: null };
      },
    }),
  },
}));

import { useUpdateEvento } from './use-eventos';
import type { EventoForm } from '@/components/calendar/types';

function envolver() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

function formSemParticipantesCarregados(): EventoForm {
  return {
    titulo: 'Reunião de exemplo',
    descricao: '',
    inicio: '2026-10-01T10:00',
    fim: '2026-10-01T11:00',
    diaInteiro: false,
    tipoCalendario: 'empresa',
    cor: '#1e3a5f',
    participantes: undefined,
    lembretes: [60],
    avisarParticipantes: true,
  };
}

beforeEach(() => {
  chamadasAoBanco.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useUpdateEvento — defesa contra salvar antes de carregar participantes', () => {
  it('🔴 participantes undefined recusa salvar e não toca o banco', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateEvento(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: 'evento-1',
          form: formSemParticipantesCarregados(),
          grupoId: 'grupo-1',
          criadoPor: 'organizador',
        }),
      ).rejects.toThrow('A lista de participantes não carregou; nada foi alterado.');
    });

    expect(chamadasAoBanco).toHaveLength(0);
  });

  it('participantes [] (esvaziado de propósito) segue o caminho normal — não é a mesma coisa', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateEvento(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'evento-1',
        form: { ...formSemParticipantesCarregados(), participantes: [] },
        grupoId: 'grupo-1',
        criadoPor: 'organizador',
      });
    });

    // Chegou a falar com o banco — a recusa de cima não pegou este caso.
    expect(chamadasAoBanco).toContain('select');
    expect(chamadasAoBanco).toContain('update');
  });

  it('participante comum (não organiza) não é afetado pela defesa', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateEvento(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: 'evento-1',
          form: formSemParticipantesCarregados(),
          // Sem grupoId/criadoPor — ou criadoPor != user — não é o organizador.
        }),
      ).resolves.toBeUndefined();
    });

    expect(chamadasAoBanco).toEqual(['update']);
  });
});
