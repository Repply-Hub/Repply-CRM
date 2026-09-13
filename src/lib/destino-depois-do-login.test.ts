import { describe, it, expect } from 'vitest';
import { destinoDepoisDoLogin } from './destino-depois-do-login';

/**
 * O QUE ESTE ARQUIVO PRENDE: `destinoDepoisDoLogin` só aceita caminho INTERNO (Bloco 3,
 * item E) — as sete entradas abaixo são as mesmas do brief, verbatim.
 */
describe('destinoDepoisDoLogin', () => {
  it('caminho interno com query: mantém como veio', () => {
    expect(destinoDepoisDoLogin('/calendario?data=2026-09-16')).toBe('/calendario?data=2026-09-16');
  });

  it('mantém o hash também', () => {
    expect(destinoDepoisDoLogin('/calendario#dia-16')).toBe('/calendario#dia-16');
  });

  it('//evil.com — protocolo-relativo, recusa', () => {
    expect(destinoDepoisDoLogin('//evil.com')).toBeNull();
  });

  it('https://x — tem esquema, recusa', () => {
    expect(destinoDepoisDoLogin('https://x')).toBeNull();
  });

  it('javascript:alert(1) — esquema perigoso, recusa', () => {
    expect(destinoDepoisDoLogin('javascript:alert(1)')).toBeNull();
  });

  it('/login — não volta para o próprio login', () => {
    expect(destinoDepoisDoLogin('/login')).toBeNull();
  });

  it('um número — não é string, recusa', () => {
    expect(destinoDepoisDoLogin(42)).toBeNull();
  });

  it('null — recusa', () => {
    expect(destinoDepoisDoLogin(null)).toBeNull();
  });

  it('/\\evil.com — barra invertida disfarçada de "//", recusa', () => {
    expect(destinoDepoisDoLogin('/\\evil.com')).toBeNull();
  });

  it('/javascript:alert(1) — esquema perigoso mesmo começando com "/", recusa', () => {
    expect(destinoDepoisDoLogin('/javascript:alert(1)')).toBeNull();
  });

  it('undefined — recusa', () => {
    expect(destinoDepoisDoLogin(undefined)).toBeNull();
  });

  it('"/" sozinho é caminho interno válido', () => {
    expect(destinoDepoisDoLogin('/')).toBe('/');
  });
});
