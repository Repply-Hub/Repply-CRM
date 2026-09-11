import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a caixinha "Criar tarefa" mande ao banco a escolha que a pessoa
 * fez na tela.
 *
 * 🔴 POR QUE ELE EXISTE. A caixinha É a Tarefa 4 inteira — o padrão marcado, o desmarcar e o
 * reiniciar ao trocar de negócio são o produto, não detalhe de implementação. E até 10/09/2026
 * NENHUM teste montava este diálogo: trocar `checked={criarTarefa}` por `checked={!criarTarefa}`,
 * ou apagar o `setCriarTarefa(true)` do efeito de reabertura, passava por `npm run test`, pelo
 * `tsc` e pelo `build` sem um arruído. O teste ao lado (`use-pauta`) chama o hook direto e o
 * esboço dele ignora os argumentos — ele prova as invalidações, não o que sai no fio.
 *
 * Por isso cada caso aqui olha o ARGUMENTO QUE CHEGOU AO `rpc`, e não o que a tela desenhou:
 * a tela pode estar bonita e o quarto argumento sair trocado.
 */

/** O que foi pedido ao servidor. É a única testemunha que interessa. */
const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return { error: null };
    },
  },
}));

const avisos: Array<{ titulo: string; extra?: { description?: string } }> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (titulo: string, extra?: { description?: string }) => avisos.push({ titulo, extra }),
    error: (titulo: string) => avisos.push({ titulo }),
  },
}));

import { DialogoRetorno } from './DialogoRetorno';

function desenhar(props: Partial<React.ComponentProps<typeof DialogoRetorno>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const aoFechar = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <DialogoRetorno
        aberto
        aoFechar={aoFechar}
        pedidoId="ped-1"
        tituloDoNegocio="Obra Vila Real — Portobello"
        responsavel={null}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { aoFechar, ...utils };
}

const caixinha = () => screen.getByRole('checkbox');
const campoMotivo = () => screen.getByLabelText(/por que sai da pauta/i);
const botaoMarcar = () => screen.getByRole('button', { name: /marcar retorno/i });

/** O gesto inteiro: escrever o motivo (o botão fica travado sem ele) e mandar. */
async function marcarRetorno() {
  fireEvent.change(campoMotivo(), { target: { value: 'cliente decide depois da obra' } });
  fireEvent.click(botaoMarcar());
  await waitFor(() => expect(chamadas).toHaveLength(1));
}

beforeEach(() => {
  chamadas.length = 0;
  avisos.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a caixinha "Criar tarefa"', () => {
  it('🔴 nasce MARCADA — é o padrão do produto, não o do componente', () => {
    desenhar();
    expect(caixinha()).toBeChecked();
  });

  it('🔴 marcada, manda `p_criar_tarefa: true` ao banco', async () => {
    desenhar();
    await marcarRetorno();

    expect(chamadas[0].nome).toBe('registrar_retorno');
    expect(chamadas[0].args.p_criar_tarefa).toBe(true);
  });

  it('🔴 desmarcada, manda `false` — e `false` de verdade, não `undefined`', async () => {
    desenhar();
    fireEvent.click(caixinha());
    expect(caixinha()).not.toBeChecked();

    await marcarRetorno();

    expect(chamadas[0].args.p_criar_tarefa).toBe(false);
  });

  /**
   * O rótulo do `Label` é ligado por `htmlFor`, então clicar no TEXTO tem de alternar a caixa.
   * Sem isso a área de clique encolhe para 16 pixels — e a pessoa que clica no texto conclui
   * que a caixinha não responde.
   */
  it('clicar no texto do rótulo alterna a caixa', () => {
    desenhar();
    fireEvent.click(screen.getByText(/criar uma tarefa para mim/i));
    expect(caixinha()).not.toBeChecked();
  });

  /**
   * 🔴 Desmarcada UMA vez, a caixinha ficaria desmarcada em todos os negócios seguintes da
   * sessão se o efeito de reabertura não a reiniciasse — e o padrão do produto é criar a tarefa.
   * O diálogo fica MONTADO o tempo todo (`Hoje.tsx` só troca `aberto`), então não há
   * desmontagem para zerar o estado sozinha.
   */
  it('🔴 reabrir para outro negócio volta a marcada', () => {
    const { rerender } = desenhar();
    fireEvent.click(caixinha());
    expect(caixinha()).not.toBeChecked();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { aoFechar: vi.fn(), tituloDoNegocio: 'Outro negócio', responsavel: null };
    rerender(
      <QueryClientProvider client={qc}>
        <DialogoRetorno aberto={false} pedidoId="ped-1" {...props} />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={qc}>
        <DialogoRetorno aberto pedidoId="ped-2" {...props} />
      </QueryClientProvider>,
    );

    expect(caixinha()).toBeChecked();
  });
});

describe('o rótulo diz para quem a tarefa vai', () => {
  it('negócio de colega: o nome dele no rótulo', () => {
    desenhar({ responsavel: 'Érika Marques' });
    expect(screen.getByText('Criar tarefa para Érika Marques')).toBeInTheDocument();
  });

  it('negócio próprio: primeira pessoa', () => {
    desenhar({ responsavel: null });
    expect(screen.getByText('Criar uma tarefa para mim')).toBeInTheDocument();
  });
});

describe('o aviso de sucesso', () => {
  it('🔴 só promete tarefa quando a caixinha estava marcada', async () => {
    desenhar({ responsavel: 'Érika Marques' });
    await marcarRetorno();

    expect(avisos[0].extra?.description).toBe('Uma tarefa foi criada para Érika Marques.');
  });

  it('🔴 desmarcada, NÃO promete tarefa nenhuma', async () => {
    desenhar({ responsavel: 'Érika Marques' });
    fireEvent.click(caixinha());
    await marcarRetorno();

    expect(avisos[0].extra?.description).toBeUndefined();
  });
});
