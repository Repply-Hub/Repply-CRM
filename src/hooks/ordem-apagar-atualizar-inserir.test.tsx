import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: a ordem em que `useUpdateEvento` fala com o banco quando o
 * organizador reconcilia participantes — apagar quem saiu, DEPOIS atualizar o grupo, e só
 * ENTÃO inserir quem entrou (Bloco 3, item B).
 *
 * 🔴 POR QUE A ORDEM IMPORTA. Na ordem antiga (atualizar, depois apagar) quem era retirado
 * ainda tinha a própria linha alcançada pelo `update` — e por isso recebia "evento alterado"
 * um instante antes de "cancelado para você" (a migration `20260911130000` grava um aviso de
 * "alteracao" quando início/fim mudam, e um de "retirado" quando a linha do participante é
 * apagada). Apagando primeiro, o `update(...).eq('grupo_id', ...)` de baixo já não alcança
 * mais essas linhas — só quem continua no grupo é avisado de mudança.
 *
 * Este teste não muda comportamento nenhum (ele já existe em `use-eventos.ts`); só prende a
 * ordem para uma refatoração futura não inverter os passos em silêncio.
 */

const ordemDasChamadas: string[] = [];

/** As linhas que já existem no grupo, antes da edição — cada teste ajusta a sua. */
const linhasExistentes: { current: { user_id: string }[] } = { current: [] };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'organizador' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: linhasExistentes.current, error: null }),
      }),
      delete: () => {
        ordemDasChamadas.push('delete');
        return {
          eq: () => ({
            in: async () => ({ error: null }),
          }),
        };
      },
      update: () => {
        ordemDasChamadas.push('update');
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => {
        ordemDasChamadas.push('insert');
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

// Dados inventados, sem nada real de cliente ou de equipe (CLAUDE.md §6.9).
function formDeExemplo(participantes: string[]): EventoForm {
  return {
    titulo: 'Reunião de exemplo',
    descricao: '',
    inicio: '2026-10-01T10:00',
    fim: '2026-10-01T11:00',
    diaInteiro: false,
    tipoCalendario: 'empresa',
    cor: '#1e3a5f',
    participantes,
    lembretes: [60],
    avisarParticipantes: true,
  };
}

beforeEach(() => {
  ordemDasChamadas.length = 0;
  linhasExistentes.current = [{ user_id: 'organizador' }, { user_id: 'saiu-1' }];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useUpdateEvento — ordem de gravação do organizador', () => {
  it('apaga quem saiu, depois atualiza o grupo, e só então insere quem entrou', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateEvento(), { wrapper });

    // 'saiu-1' sai (existia e não está mais na seleção); 'entrou-1' é novo.
    await act(async () => {
      await result.current.mutateAsync({
        id: 'evento-1',
        form: formDeExemplo(['organizador', 'entrou-1']),
        grupoId: 'grupo-1',
        criadoPor: 'organizador',
      });
    });

    expect(ordemDasChamadas).toEqual(['delete', 'update', 'insert']);
  });

  it('sem ninguém saindo, some o delete — mas update continua antes do insert', async () => {
    linhasExistentes.current = [{ user_id: 'organizador' }];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateEvento(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'evento-1',
        form: formDeExemplo(['organizador', 'entrou-1']),
        grupoId: 'grupo-1',
        criadoPor: 'organizador',
      });
    });

    expect(ordemDasChamadas).toEqual(['update', 'insert']);
  });

  it('sem ninguém entrando, some o insert — mas delete continua antes do update', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateEvento(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'evento-1',
        form: formDeExemplo(['organizador']),
        grupoId: 'grupo-1',
        criadoPor: 'organizador',
      });
    });

    expect(ordemDasChamadas).toEqual(['delete', 'update']);
  });
});
