import { describe, it, expect } from 'vitest';
import { papelDoToken } from '../../supabase/functions/_shared/papel-do-token';

/**
 * Monta um JWT de mentira — cabeçalho e payload de verdade em base64url, mas com
 * assinatura qualquer. `papelDoToken` só lê o payload; quem confere a assinatura é o
 * gateway do Supabase (`verify_jwt = true`), então o teste não precisa (e não deve)
 * assinar nada de verdade. Nenhuma chave real entra aqui.
 */
function tokenFalso(payload: unknown): string {
  const paraBase64Url = (valor: unknown) =>
    btoa(JSON.stringify(valor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cabecalho = { alg: 'HS256', typ: 'JWT' };
  return `${paraBase64Url(cabecalho)}.${paraBase64Url(payload)}.assinatura-de-mentira`;
}

describe('papelDoToken', () => {
  it('token do service_role devolve "service_role"', () => {
    const token = tokenFalso({ role: 'service_role', iss: 'supabase' });
    expect(papelDoToken(token)).toBe('service_role');
  });

  it('token de usuário logado devolve "authenticated"', () => {
    const token = tokenFalso({ role: 'authenticated', sub: 'usuario-de-teste' });
    expect(papelDoToken(token)).toBe('authenticated');
  });

  it('texto que não tem cara de JWT devolve null', () => {
    expect(papelDoToken('isto não é um token')).toBeNull();
  });

  it('chave no formato novo sb_secret_... devolve null (não é JWT)', () => {
    expect(papelDoToken('sb_secret_abcdefghijklmnopqrstuvwxyz0123456789')).toBeNull();
  });

  it('texto vazio devolve null', () => {
    expect(papelDoToken('')).toBeNull();
  });

  it('payload que não decodifica como JSON devolve null', () => {
    const paraBase64Url = (texto: string) =>
      btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `${paraBase64Url('{"alg":"HS256"}')}.${paraBase64Url('isso não é json')}.assinatura`;
    expect(papelDoToken(token)).toBeNull();
  });
});
