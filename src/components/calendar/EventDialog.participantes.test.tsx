import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: a trava do botão Salvar (e do seletor de participantes) nos
 * estados da consulta de participantes existentes, ao editar um evento (Bloco 3, item A).
 *
 * Salvar uma edição ANTES de essa consulta voltar fazia `useUpdateEvento` apagar todo mundo
 * que não coubesse na lista (ainda vazia) — o banco então manda "Evento cancelado para você"
 * por chat e e-mail a cada participante retirado.
 *
 * 🔴 USA UM QueryClient DE VERDADE — só a chamada ao Supabase é simulada. A primeira versão
 * deste arquivo mockava `useEventoParticipantes` inteiro, e por isso não via a brecha real:
 * com cache quente (reabrir o MESMO evento), `isLoading` do React Query já nasce falso assim
 * que existe QUALQUER dado em cache (`isLoading = isPending && isFetching`), e o efeito que
 * copia a lista para o formulário via só `participantesExistentes` truthy — nenhum dos dois
 * olhava se um refetch estava em andamento. Salvar liberava na hora, e o formulário podia
 * copiar a lista VELHA por cima da nova, num reabrir. Só um QueryClient de verdade, com uma
 * promessa controlável no lugar da chamada ao banco, expõe essa corrida — um mock estático
 * do hook não tem como reproduzi-la, porque não existe transição de estado nenhuma para
 * observar.
 */

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'organizador' } }),
}));

/** Mutável: os testes que precisam listar funcionários (para ver o "N selecionado(s)")
 *  preenchem antes de montar; os demais deixam vazio, que já basta para os estados de
 *  Salvar (a seção "Participantes" nem precisa renderizar para isso). */
const funcionariosMock: { data: { id: string; user_id: string; nome: string; email: string }[] } = {
  data: [],
};
vi.mock('@/hooks/use-clientes', () => ({
  useVendedores: () => ({ data: funcionariosMock.data, refetch: vi.fn() }),
}));

/** Cada chamada de `.eq()` (dentro de `useEventoParticipantes`) cria uma promessa nova, e
 *  guarda o resolvedor/rejeitador dela aqui — é assim que o teste controla EXATAMENTE
 *  quando cada busca "chega do banco", sem depender de temporizador nenhum. */
let resolverBusca: ((linhas: { user_id: string }[]) => void) | null = null;
let rejeitarBusca: ((erro: unknown) => void) | null = null;
let chamadasAoSupabase = 0;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => {
          chamadasAoSupabase += 1;
          return new Promise((resolve, reject) => {
            resolverBusca = (linhas) => resolve({ data: linhas, error: null });
            rejeitarBusca = (erro) => reject(erro);
          });
        },
      }),
    }),
  },
}));

import { EventDialog } from './EventDialog';
import type { CalendarEvent } from './types';

// Dado inventado, sem nada real de cliente ou de equipe (CLAUDE.md §6.9).
const eventoDeExemplo: CalendarEvent = {
  id: 'evento-1',
  titulo: 'Reunião de exemplo',
  inicio: new Date('2026-10-01T10:00:00'),
  fim: new Date('2026-10-01T11:00:00'),
  diaInteiro: false,
  tipoCalendario: 'empresa',
  cor: '#1e3a5f',
  editavel: true,
  podeEditar: true,
  grupoId: 'grupo-1',
  criadoPor: 'organizador',
};

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  resolverBusca = null;
  rejeitarBusca = null;
  chamadasAoSupabase = 0;
  funcionariosMock.data = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function botaoSalvar() {
  return screen.getByRole('button', { name: 'Salvar' });
}

function montar(open: boolean, onSave: (form: unknown) => void = () => {}) {
  return render(
    <QueryClientProvider client={qc}>
      <EventDialog open={open} editingEvent={eventoDeExemplo} onClose={() => {}} onSave={onSave} />
    </QueryClientProvider>,
  );
}

describe('EventDialog — Salvar espera os participantes existentes (QueryClient de verdade)', () => {
  it('primeira abertura: Salvar nasce desabilitado, mostrando "Carregando participantes…"', () => {
    montar(true);

    expect(botaoSalvar()).toBeDisabled();
    expect(screen.getByText('Carregando participantes…')).toBeTruthy();
    expect(chamadasAoSupabase).toBe(1);
  });

  it('sucesso: Salvar libera assim que a busca resolve, e a mensagem de carregando some', async () => {
    montar(true);
    expect(botaoSalvar()).toBeDisabled();

    act(() => {
      resolverBusca!([{ user_id: 'organizador' }]);
    });

    await waitFor(() => expect(botaoSalvar()).not.toBeDisabled());
    expect(screen.queryByText('Carregando participantes…')).toBeNull();
  });

  it('erro: Salvar continua desabilitado, mostra a frase e "Tentar de novo" refaz a busca', async () => {
    montar(true);

    act(() => {
      rejeitarBusca!(new Error('rede ruim'));
    });

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar os participantes.')).toBeTruthy(),
    );
    expect(botaoSalvar()).toBeDisabled();

    const chamadasAntes = chamadasAoSupabase;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(chamadasAoSupabase).toBe(chamadasAntes + 1);

    act(() => {
      resolverBusca!([{ user_id: 'organizador' }]);
    });
    await waitFor(() => expect(botaoSalvar()).not.toBeDisabled());
  });

  it(
    '🔴 reabrir com cache quente: Salvar trava de novo durante o refetch forçado, e só ' +
      'aceita a lista quando ela chega mais nova que o pedido de abrir',
    async () => {
      funcionariosMock.data = [
        { id: 'f1', user_id: 'organizador', nome: 'Fulano Organizador', email: 'fulano@exemplo.com' },
        { id: 'f2', user_id: 'convidado-novo', nome: 'Beltrano Convidado', email: 'beltrano@exemplo.com' },
      ];
      const onSave = vi.fn();

      // (a) abre uma vez, a lista original chega, fecha.
      const { rerender } = montar(false, onSave);
      const abrirOuFechar = (open: boolean) =>
        rerender(
          <QueryClientProvider client={qc}>
            <EventDialog open={open} editingEvent={eventoDeExemplo} onClose={() => {}} onSave={onSave} />
          </QueryClientProvider>,
        );

      abrirOuFechar(true);
      expect(botaoSalvar()).toBeDisabled();
      act(() => {
        resolverBusca!([{ user_id: 'organizador' }]);
      });
      await waitFor(() => expect(botaoSalvar()).not.toBeDisabled());
      expect(chamadasAoSupabase).toBe(1);

      abrirOuFechar(false);

      // (b) a próxima busca vai devolver uma lista DIFERENTE (organizador + um convidado
      // novo) — é só o que `resolverBusca` vai entregar da próxima vez.

      // (c) reabre com o cache quente: isto é o teste crítico. Antes deste conserto,
      // `isLoading` já nascia falso aqui (o cache já tinha o `data` de (a)), e Salvar
      // liberava na hora — mesmo com o refetch forçado (`invalidateQueries` do efeito de
      // abertura) ainda em andamento.
      abrirOuFechar(true);
      expect(botaoSalvar()).toBeDisabled();
      expect(screen.getByText('Carregando participantes…')).toBeTruthy();
      // O seletor de participantes também trava — o organizador não pode editar uma
      // seleção que está prestes a ser substituída.
      expect(screen.getByRole('button', { name: /Selecionar funcionários|selecionado/ })).toBeDisabled();
      expect(chamadasAoSupabase).toBe(2);

      // (d) resolve com a lista nova — Salvar libera, e o formulário reflete a lista NOVA
      // (nunca a velha, mesmo que ela tenha ficado visível por um instante no cache).
      act(() => {
        resolverBusca!([{ user_id: 'organizador' }, { user_id: 'convidado-novo' }]);
      });
      await waitFor(() => expect(botaoSalvar()).not.toBeDisabled());
      expect(screen.getByText('2 selecionado(s)')).toBeTruthy();

      fireEvent.click(botaoSalvar());
      expect(onSave).toHaveBeenCalledTimes(1);
      expect((onSave.mock.calls[0][0] as { participantes: string[] }).participantes).toEqual([
        'organizador',
        'convidado-novo',
      ]);
    },
  );
});
