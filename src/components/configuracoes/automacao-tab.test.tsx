import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Estado dos esboços (config, gravações e equipe) — trocado por teste. Nomes INVENTADOS (§6.9).
const estado = vi.hoisted(() => ({
  config: { data: undefined as unknown, isLoading: false },
  isPending: false,
  gravados: [] as { chave: string; valor: unknown }[],
  equipe: { data: [] as { id: string; nome: string }[] },
}));

vi.mock('@/hooks/use-configuracoes-automacao', async (importOriginal) => ({
  // Mantém PADROES_DA_PAUTA de verdade — é dele que a config de teste parte.
  ...(await importOriginal<typeof import('@/hooks/use-configuracoes-automacao')>()),
  useConfiguracoesAutomacao: () => estado.config,
  useSalvarConfiguracaoAutomacao: () => ({
    mutateAsync: (arg: { chave: string; valor: unknown }) => {
      estado.gravados.push(arg);
      return Promise.resolve();
    },
    isPending: estado.isPending,
  }),
}));
vi.mock('@/hooks/use-clientes', () => ({ useVendedores: () => estado.equipe }));

import { PADROES_DA_PAUTA } from '@/hooks/use-configuracoes-automacao';
import { AutomacaoTab } from './AutomacaoTab';

const equipeExemplo = [
  { id: 'u-1', nome: 'Ana Souza' },
  { id: 'u-2', nome: 'Bruno Lima' },
];

function prepara({ email = true, excluidos = [] as string[] }) {
  estado.config = {
    data: { ...PADROES_DA_PAUTA, pauta_resumo_email: email, pauta_resumo_excluidos: excluidos },
    isLoading: false,
  };
  estado.equipe = { data: equipeExemplo };
  estado.gravados = [];
}

afterEach(cleanup);

describe('AutomacaoTab — quem recebe o e-mail da pauta', () => {
  it('todos marcados por padrão (lista de excluídos vazia)', () => {
    prepara({ email: true, excluidos: [] });
    render(<AutomacaoTab empresaId="emp-1" />);

    const caixas = screen.getAllByRole('checkbox');
    expect(caixas).toHaveLength(2);
    caixas.forEach((c) => expect(c).toBeChecked());
  });

  it('quem já está na lista de excluídos aparece desmarcado', () => {
    prepara({ email: true, excluidos: ['u-1'] });
    render(<AutomacaoTab empresaId="emp-1" />);

    // A ordem das caixas segue a da equipe: [Ana, Bruno].
    const [ana, bruno] = screen.getAllByRole('checkbox');
    expect(ana).not.toBeChecked();
    expect(bruno).toBeChecked();
  });

  it('desmarcar uma pessoa grava a lista de excluídos com o id dela', () => {
    prepara({ email: true, excluidos: [] });
    render(<AutomacaoTab empresaId="emp-1" />);

    fireEvent.click(screen.getAllByRole('checkbox')[0]); // desmarca "Ana Souza" (u-1)

    expect(estado.gravados).toContainEqual({ chave: 'pauta_resumo_excluidos', valor: ['u-1'] });
  });

  it('com o resumo por e-mail desligado, as caixas ficam desabilitadas', () => {
    prepara({ email: false, excluidos: [] });
    render(<AutomacaoTab empresaId="emp-1" />);

    screen.getAllByRole('checkbox').forEach((c) => expect(c).toBeDisabled());
  });
});
