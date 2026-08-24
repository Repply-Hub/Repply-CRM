import { describe, expect, it } from 'vitest';
import { getIconComponent, isExternalUrl, looksLikeDomain } from './sidebar-icons';

describe('isExternalUrl', () => {
  it('reconhece URL com protocolo explícito', () => {
    expect(isExternalUrl('https://site.com')).toBe(true);
    expect(isExternalUrl('http://site.com')).toBe(true);
  });

  it('não reconhece domínio sem protocolo nem rota interna', () => {
    expect(isExternalUrl('google.com')).toBe(false);
    expect(isExternalUrl('/clientes')).toBe(false);
    expect(isExternalUrl('relatorios')).toBe(false);
  });
});

describe('looksLikeDomain', () => {
  it('reconhece domínio digitado sem protocolo', () => {
    expect(looksLikeDomain('google.com')).toBe(true);
    expect(looksLikeDomain('www.receita.rn.gov.br')).toBe(true);
    expect(looksLikeDomain('wa.me/5584999999999')).toBe(true);
  });

  it('não reconhece rota interna como domínio', () => {
    expect(looksLikeDomain('/clientes')).toBe(false);
    expect(looksLikeDomain('relatorios')).toBe(false);
    expect(looksLikeDomain('pedidos/123')).toBe(false);
  });

  it('não reconhece URL que já tem protocolo (isExternalUrl já resolve)', () => {
    expect(looksLikeDomain('https://google.com')).toBe(false);
  });

  it('ignora string vazia', () => {
    expect(looksLikeDomain('')).toBe(false);
    expect(looksLikeDomain('   ')).toBe(false);
  });
});

describe('getIconComponent', () => {
  it('devolve o ícone cadastrado', () => {
    expect(getIconComponent('Users')).toBeDefined();
  });

  it('nunca devolve undefined — cai no ícone genérico se o nome não existir mais no catálogo', () => {
    expect(getIconComponent('IconeQueNaoExisteMais')).toBeDefined();
  });
});
