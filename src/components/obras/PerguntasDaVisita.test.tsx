import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RESPOSTAS_VAZIAS, type RespostasDaVisita } from '@/lib/analise-da-visita';

/**
 * `PerguntasDaVisita` é um componente CONTROLADO: não guarda estado próprio, só reflete `valor`
 * e chama `onChange` com o próximo valor inteiro. Por isso cada teste monta o `valor` de
 * partida que o cenário precisa, em vez de clicar duas vezes esperando que o componente lembre.
 */

let contatosMockados: { id: string; nomeContato: string | null; cargo: string | null; email: string | null; telefone: string | null }[] = [];
vi.mock('@/hooks/use-obra-contatos', () => ({
  useContatosDoCliente: () => ({ data: contatosMockados, isLoading: false }),
}));

import { PerguntasDaVisita } from './PerguntasDaVisita';

afterEach(() => {
  cleanup();
  contatosMockados = [];
  vi.clearAllMocks();
});

function montar(valorInicial: RespostasDaVisita = RESPOSTAS_VAZIAS) {
  const onChange = vi.fn();
  const utils = render(
    <PerguntasDaVisita
      valor={valorInicial}
      onChange={onChange}
      clienteId="cliente-1"
      clienteEmpresa="Obra Exemplo Ltda"
    />,
  );
  return { onChange, ...utils };
}

describe('fase da obra', () => {
  it('mostra os seis botões de fase', () => {
    montar();
    ['Fundação', 'Estrutura', 'Alvenaria', 'Instalações', 'Acabamento', 'Entrega'].forEach((rotulo) => {
      expect(screen.getByRole('button', { name: rotulo })).toBeInTheDocument();
    });
  });

  it('tocar numa fase escolhe ela', () => {
    const { onChange } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Acabamento' }));
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, fase: 'acabamento' });
  });

  it('🔴 tocar de novo na fase JÁ escolhida desmarca — resposta opcional volta a ficar vazia', () => {
    const { onChange } = montar({ ...RESPOSTAS_VAZIAS, fase: 'acabamento' });
    fireEvent.click(screen.getByRole('button', { name: 'Acabamento' }));
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, fase: '' });
  });
});

describe('concorrente visto', () => {
  it('o botão "Nenhum" preenche a palavra Nenhum', () => {
    const { onChange } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Nenhum' }));
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, concorrentes: 'Nenhum' });
  });

  it('dá para digitar o nome da marca', () => {
    const { onChange } = montar();
    fireEvent.change(screen.getByPlaceholderText('Qual marca?'), { target: { value: 'Marca Exemplo' } });
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, concorrentes: 'Marca Exemplo' });
  });
});

describe('próximo passo', () => {
  it('digitar o texto chama onChange com o texto', () => {
    const { onChange } = montar();
    fireEvent.change(screen.getByPlaceholderText('O que fazer a seguir?'), {
      target: { value: 'Mandar proposta de louças' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, proximoPasso: 'Mandar proposta de louças' });
  });

  it('escolher a data chama onChange com a data', () => {
    const { onChange, container } = montar();
    const campoData = container.querySelector('input[type="date"]')!;
    fireEvent.change(campoData, { target: { value: '2026-09-20' } });
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, proximoPassoEm: '2026-09-20' });
  });

  it('🔴 mostra a frase de ajuda "sem data, não vira tarefa"', () => {
    montar();
    expect(screen.getByText(/sem data, não vira tarefa/i)).toBeInTheDocument();
  });
});

describe('caixinha "criar tarefa de acompanhamento"', () => {
  it('🔴 sem data, a caixinha NÃO aparece — só o aviso "sem data, não vira tarefa"', () => {
    montar({ ...RESPOSTAS_VAZIAS, proximoPasso: 'Mandar proposta de louças' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/sem data, não vira tarefa/i)).toBeInTheDocument();
  });

  it('com próximo passo e data preenchidos, a caixinha aparece marcada por padrão', () => {
    montar({
      ...RESPOSTAS_VAZIAS,
      proximoPasso: 'Mandar proposta de louças',
      proximoPassoEm: '2026-09-20',
    });
    expect(screen.queryByText(/sem data, não vira tarefa/i)).not.toBeInTheDocument();
    const caixinha = screen.getByRole('checkbox');
    expect(caixinha).toBeInTheDocument();
    expect(caixinha).toBeChecked();
  });

  it('clicar na caixinha marcada chama onChange com criarTarefa: false', () => {
    const { onChange } = montar({
      ...RESPOSTAS_VAZIAS,
      proximoPasso: 'Mandar proposta de louças',
      proximoPassoEm: '2026-09-20',
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({
      ...RESPOSTAS_VAZIAS,
      proximoPasso: 'Mandar proposta de louças',
      proximoPassoEm: '2026-09-20',
      criarTarefa: false,
    });
  });
});

describe('mais alguma coisa (texto livre)', () => {
  it('digitar chama onChange com a observação', () => {
    const { onChange } = montar();
    fireEvent.change(screen.getByPlaceholderText('O que você viu na obra?'), {
      target: { value: 'Obra parada por chuva' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...RESPOSTAS_VAZIAS, observacao: 'Obra parada por chuva' });
  });
});

describe('com quem falou', () => {
  it('sempre tem a opção "não informar"', () => {
    montar();
    fireEvent.click(screen.getByRole('combobox'));
    // Aparece duas vezes de propósito: uma vez como valor selecionado no gatilho (é o padrão,
    // "não informar" começa marcado) e uma vez na lista aberta — por isso `getAllByText`.
    expect(screen.getAllByText('— não informar').length).toBeGreaterThan(0);
  });

  it('lista os contatos do cliente vindos de useContatosDoCliente', () => {
    contatosMockados = [
      { id: 'contato-1', nomeContato: 'Pessoa Exemplo', cargo: null, email: null, telefone: null },
    ];
    montar();
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Pessoa Exemplo')).toBeInTheDocument();
  });
});
