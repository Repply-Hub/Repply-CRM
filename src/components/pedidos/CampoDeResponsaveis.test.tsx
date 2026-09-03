import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CampoDeResponsaveis, type ResponsavelSelecionado } from './CampoDeResponsaveis';

/**
 * O campo único de responsáveis, com a estrela.
 *
 * 🔴 O QUE ESTES TESTES PROTEGEM são as regras que decidem DINHEIRO, não a aparência:
 *   · sempre há exatamente um principal (quem leva o valor);
 *   · o principal não pode ser removido — a estrela tem de passar antes;
 *   · trocar a estrela move o valor para uma pessoa só.
 * Errar qualquer uma move comissão sem ninguém perceber.
 */

const PESSOAS = [
  { id: 'u1', nome: 'Ana Lima', avatarUrl: null },
  { id: 'u2', nome: 'Bruno Sá', avatarUrl: null },
  { id: 'u3', nome: 'Carla Dias', avatarUrl: null },
];

function montar(value: ResponsavelSelecionado[]) {
  const onChange = vi.fn();
  render(<CampoDeResponsaveis pessoas={PESSOAS} value={value} onChange={onChange} />);
  return { onChange };
}

// A estrela de um participante tem nome acessível "Tornar <nome> quem leva o valor".
const estrelaParaPromover = (nome: string) =>
  screen.getByRole('button', { name: new RegExp(`Tornar ${nome}`, 'i') });

afterEach(cleanup);

describe('CampoDeResponsaveis', () => {
  it('mostra as pessoas selecionadas, principal primeiro', () => {
    montar([
      { usuarioId: 'u2', principal: false },
      { usuarioId: 'u1', principal: true },
    ]);
    const itens = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(itens[0]).toContain('Ana Lima'); // principal vem primeiro
    expect(itens[1]).toContain('Bruno Sá');
  });

  it('🔴 o primeiro a entrar já vira o principal', () => {
    const { onChange } = montar([]);
    fireEvent.click(screen.getByRole('button', { name: /adicionar pessoa/i }));
    fireEvent.click(screen.getByText('Ana Lima'));
    expect(onChange).toHaveBeenCalledWith([{ usuarioId: 'u1', principal: true }]);
  });

  it('quem entra depois é participante, não principal', () => {
    const { onChange } = montar([{ usuarioId: 'u1', principal: true }]);
    fireEvent.click(screen.getByRole('button', { name: /adicionar pessoa/i }));
    fireEvent.click(screen.getByText('Bruno Sá'));
    expect(onChange).toHaveBeenCalledWith([
      { usuarioId: 'u1', principal: true },
      { usuarioId: 'u2', principal: false },
    ]);
  });

  it('🔴 trocar a estrela deixa UM principal só', () => {
    const { onChange } = montar([
      { usuarioId: 'u1', principal: true },
      { usuarioId: 'u2', principal: false },
    ]);
    fireEvent.click(estrelaParaPromover('Bruno Sá'));
    expect(onChange).toHaveBeenCalledWith([
      { usuarioId: 'u1', principal: false },
      { usuarioId: 'u2', principal: true },
    ]);
  });

  it('🔴 o principal NÃO tem botão de remover', () => {
    montar([
      { usuarioId: 'u1', principal: true },
      { usuarioId: 'u2', principal: false },
    ]);
    expect(screen.queryByRole('button', { name: /remover ana lima/i })).toBeNull();
    expect(screen.getByRole('button', { name: /remover bruno sá/i })).toBeTruthy();
  });

  it('remover um participante o tira da lista', () => {
    const { onChange } = montar([
      { usuarioId: 'u1', principal: true },
      { usuarioId: 'u2', principal: false },
    ]);
    fireEvent.click(screen.getByRole('button', { name: /remover bruno sá/i }));
    expect(onChange).toHaveBeenCalledWith([{ usuarioId: 'u1', principal: true }]);
  });

  it('🔴 os botões de estrela e remover são do tipo "button" — não submetem formulário', () => {
    // O campo mora dentro do <form> de cadastro/edição. Um botão sem type="button" salvaria o
    // negócio ao clicar na estrela.
    montar([
      { usuarioId: 'u1', principal: true },
      { usuarioId: 'u2', principal: false },
    ]);
    for (const b of screen.getAllByRole('button')) {
      expect(b.getAttribute('type')).toBe('button');
    }
  });

  it('não oferece para adicionar quem já está na lista', () => {
    montar([{ usuarioId: 'u1', principal: true }]);
    fireEvent.click(screen.getByRole('button', { name: /adicionar pessoa/i }));
    // Ana aparece na lista de selecionados, mas NÃO como opção para adicionar de novo.
    expect(screen.queryByRole('option', { name: /ana lima/i })).toBeNull();
    expect(screen.getByRole('option', { name: /bruno sá/i })).toBeTruthy();
  });

  it('desabilitado trava as ações mas ainda mostra quem é', () => {
    const onChange = vi.fn();
    render(
      <CampoDeResponsaveis
        pessoas={PESSOAS}
        value={[{ usuarioId: 'u1', principal: true }]}
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.getByText('Ana Lima')).toBeTruthy();
    expect(screen.getByRole('button', { name: /adicionar pessoa/i })).toBeDisabled();
  });
});
