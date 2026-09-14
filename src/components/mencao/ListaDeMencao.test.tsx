import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ListaDeMencao, TODOS } from './ListaDeMencao';

afterEach(cleanup);

const SUG = [
  { id: TODOS, rotulo: '@todos', detalhe: 'avisa as 12 pessoas desta conversa' },
  { id: 'u1', rotulo: 'Ângela Souza' },
];

describe('ListaDeMencao', () => {
  it('a barra de busca mostra o que foi digitado depois do @', () => {
    render(<ListaDeMencao consulta="eri" sugestoes={SUG} ativa={0} onEscolher={() => {}} mensagemVazia="" />);
    expect(screen.getByText('eri')).toBeTruthy();
  });

  it('@todos vem primeiro, com quantas pessoas avisa', () => {
    render(<ListaDeMencao consulta="" sugestoes={SUG} ativa={0} onEscolher={() => {}} mensagemVazia="" />);
    const opcoes = screen.getAllByRole('option');
    expect(opcoes[0].textContent).toContain('@todos');
    expect(opcoes[0].textContent).toContain('avisa as 12 pessoas desta conversa');
  });

  it('clicar escolhe — no mousedown, para o campo não perder o foco', () => {
    const onEscolher = vi.fn();
    render(<ListaDeMencao consulta="" sugestoes={SUG} ativa={0} onEscolher={onEscolher} mensagemVazia="" />);
    fireEvent.mouseDown(screen.getByRole('option', { name: /Ângela Souza/ }));
    expect(onEscolher).toHaveBeenCalledWith(SUG[1]);
  });

  it('sem ninguém, mostra a mensagem de vazio', () => {
    render(
      <ListaDeMencao consulta="" sugestoes={[]} ativa={0} onEscolher={() => {}}
        mensagemVazia="Ninguém atende este número, então não há a quem mencionar." />,
    );
    expect(screen.getByText('Ninguém atende este número, então não há a quem mencionar.')).toBeTruthy();
  });

  it('marca a opção ativa para as setas do teclado', () => {
    render(<ListaDeMencao consulta="" sugestoes={SUG} ativa={1} onEscolher={() => {}} mensagemVazia="" />);
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
  });
});
