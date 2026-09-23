import { describe, it, expect, vi, afterEach } from 'vitest';
import { traduzirErroAuth } from './erros-auth';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a recusa de uma senha chegue à pessoa dizendo o que houve com
 * A SENHA — e não como se o link tivesse vencido.
 *
 * 🔴 POR QUE AGORA. O diagnóstico do próprio Supabase recomenda ligar a proteção contra senhas
 * vazadas, e esse é um interruptor no painel, a um clique. No dia em que ele for ligado, toda
 * senha recusada por ser fraca ou por já ter vazado volta como erro do servidor. Se a tela
 * responder "o link pode ter expirado", a pessoa pede link novo, escolhe a MESMA senha, leva a
 * mesma recusa, e roda esse ciclo sem nunca descobrir que o problema é a senha — uma melhoria de
 * segurança virando bloqueio de acesso.
 *
 * Por isso as três recusas de senha entram aqui ANTES de o interruptor ser ligado.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

afterEach(() => vi.restoreAllMocks());

describe('traduzirErroAuth — recusas de senha', () => {
  it('🔴 senha que já vazou diz que é a SENHA, não o link', () => {
    const frase = traduzirErroAuth(
      'Password is known to be weak and easy to guess, please choose a different one.',
    );

    expect(frase).toMatch(/vazamento|vazad/i);
    expect(frase).not.toMatch(/link/i);
  });

  it('senha igual à anterior explica o que mudar', () => {
    expect(traduzirErroAuth('New password should be different from the old password.')).toMatch(
      /diferente/i,
    );
  });

  it('senha curta demais continua traduzida', () => {
    expect(traduzirErroAuth('Password should be at least 6 characters')).toMatch(/6 caracteres/);
  });

  it('erro conhecido não vai para o console', () => {
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {});

    traduzirErroAuth('Password is known to be weak and easy to guess, please choose a different one.');

    expect(console_).not.toHaveBeenCalled();
  });

  it('🔴 erro desconhecido não inventa causa e registra o texto real para o diagnóstico', () => {
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {});

    const frase = traduzirErroAuth('Something nobody mapped yet');

    expect(frase).not.toMatch(/senha|link/i);
    expect(console_).toHaveBeenCalled();
  });
});
