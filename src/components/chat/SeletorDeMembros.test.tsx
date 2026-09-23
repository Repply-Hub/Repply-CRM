import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { SeletorDeMembros } from './SeletorDeMembros';

const membros = [
  { id: 'eu', nome: 'Eu Mesmo', role: 'gestor' },
  { id: 'a', nome: 'Ana Souza', role: 'vendedor' },
  { id: 'b', nome: 'Bruno Lima', role: 'vendedor' },
];

it('não lista o próprio usuário e alterna a seleção', () => {
  const onChange = vi.fn();
  render(<SeletorDeMembros titulo="Membros" membros={membros} meuId="eu" selecionados={[]} onChange={onChange} />);
  expect(screen.queryByText('Eu Mesmo')).toBeNull();
  fireEvent.click(screen.getByText('Ana Souza'));
  expect(onChange).toHaveBeenCalledWith(['a']);
});

it('"Selecionar todos" marca todos os outros; "Remover todos" limpa', () => {
  const onChange = vi.fn();
  const { rerender } = render(<SeletorDeMembros titulo="Membros" membros={membros} meuId="eu" selecionados={[]} onChange={onChange} />);
  fireEvent.click(screen.getByText('Selecionar todos'));
  expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  rerender(<SeletorDeMembros titulo="Membros" membros={membros} meuId="eu" selecionados={['a', 'b']} onChange={onChange} />);
  fireEvent.click(screen.getByText('Remover todos'));
  expect(onChange).toHaveBeenCalledWith([]);
});
