import { describe, it, expect } from 'vitest';
import { comNegocio } from './use-negocio-no-endereco';

describe('comNegocio', () => {
  it('acrescenta o negócio sem apagar os outros filtros', () => {
    const antes = new URLSearchParams('etapas=negociacao&fabricantes=abc');
    const depois = comNegocio(antes, 'n-1');
    expect(depois.get('negocio')).toBe('n-1');
    expect(depois.get('etapas')).toBe('negociacao');
    expect(depois.get('fabricantes')).toBe('abc');
  });

  it('remove o parâmetro quando o negócio é nulo, e preserva o resto', () => {
    const antes = new URLSearchParams('negocio=n-1&etapas=negociacao');
    const depois = comNegocio(antes, null);
    expect(depois.has('negocio')).toBe(false);
    expect(depois.get('etapas')).toBe('negociacao');
  });

  it('não modifica o objeto recebido', () => {
    const antes = new URLSearchParams('etapas=negociacao');
    comNegocio(antes, 'n-1');
    expect(antes.has('negocio')).toBe(false);
  });
});
