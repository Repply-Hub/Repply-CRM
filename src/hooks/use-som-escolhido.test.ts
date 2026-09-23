import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { somEscolhido, useSomEscolhido } from './use-som-escolhido';

beforeEach(() => localStorage.clear());

describe('som escolhido', () => {
  it('sem escolha, é o padrão', () => {
    expect(somEscolhido()).toBe('toque-suave');
    expect(renderHook(() => useSomEscolhido()).result.current.id).toBe('toque-suave');
  });

  it('escolher grava no navegador e muda na hora', () => {
    const { result } = renderHook(() => useSomEscolhido());
    act(() => result.current.escolher('sino'));
    expect(result.current.id).toBe('sino');
    expect(localStorage.getItem('repply_som_notificacao')).toBe('sino');
    expect(somEscolhido()).toBe('sino');
  });

  it('valor estranho no navegador vale como padrão', () => {
    localStorage.setItem('repply_som_notificacao', 'som-apagado');
    expect(somEscolhido()).toBe('toque-suave');
  });

  it('escolher um id desconhecido grava o padrão, nunca lixo', () => {
    const { result } = renderHook(() => useSomEscolhido());
    act(() => result.current.escolher('inventado'));
    expect(localStorage.getItem('repply_som_notificacao')).toBe('toque-suave');
  });
});
