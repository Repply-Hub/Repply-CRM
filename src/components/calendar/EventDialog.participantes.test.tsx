import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: a trava do botão Salvar nos três estados da consulta de
 * participantes existentes, ao editar um evento (Bloco 3, item A, regras 1 e 2).
 *
 * Salvar uma edição ANTES de essa consulta voltar fazia `useUpdateEvento` apagar todo mundo
 * que não coubesse na lista (ainda vazia) — o banco então manda "Evento cancelado para você"
 * por chat e e-mail a cada participante retirado. A trava real é o `disabled` do botão; este
 * arquivo prende os TRÊS estados que o alimentam (carregando, erro, sucesso), não o hook em si
 * (esse é `use-update-evento-participantes-nao-carregou.test.tsx`).
 */

const participantes: {
  data: string[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'organizador' } }),
}));

vi.mock('@/hooks/use-clientes', () => ({
  useVendedores: () => ({ data: [], refetch: vi.fn() }),
}));

vi.mock('@/hooks/use-eventos', () => ({
  useEventoParticipantes: () => participantes,
  buscarConflitosDeVisita: vi.fn().mockResolvedValue([]),
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

function renderDialog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <EventDialog
        open
        editingEvent={eventoDeExemplo}
        onClose={() => {}}
        onSave={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  participantes.data = undefined;
  participantes.isLoading = false;
  participantes.isError = false;
});

function botaoSalvar() {
  return screen.getByRole('button', { name: 'Salvar' });
}

describe('EventDialog — Salvar espera os participantes existentes', () => {
  it('carregando: Salvar desabilitado e mostra "Carregando participantes…"', () => {
    participantes.isLoading = true;
    renderDialog();

    expect(botaoSalvar()).toBeDisabled();
    expect(screen.getByText('Carregando participantes…')).toBeTruthy();
  });

  it('erro: Salvar continua desabilitado, mostra a frase e "Tentar de novo" refaz a consulta', () => {
    participantes.isError = true;
    renderDialog();

    expect(botaoSalvar()).toBeDisabled();
    expect(screen.getByText('Não foi possível carregar os participantes.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(participantes.refetch).toHaveBeenCalledTimes(1);
  });

  it('sucesso: Salvar fica habilitado e as mensagens de carregando/erro somem', () => {
    participantes.data = ['organizador'];
    renderDialog();

    expect(botaoSalvar()).not.toBeDisabled();
    expect(screen.queryByText('Carregando participantes…')).toBeNull();
    expect(screen.queryByText('Não foi possível carregar os participantes.')).toBeNull();
  });
});
