import { describe, it, expect } from 'vitest';
import {
  pessoaCancelouAConexao,
  detalheDoProvedorParaGuardar,
} from '../../supabase/functions/_shared/nylas';

/**
 * O defeito que estes testes fixam: `email-callback` tratava QUALQUER `error`
 * do provedor como "a pessoa cancelou", devolvia `conexao=cancelada` e jogava a
 * explicação no lixo. Falha de verdade chegava ao usuário como "Conexão
 * cancelada" — uma mentira — e nós não ficávamos com nada para investigar.
 */
describe('pessoaCancelouAConexao', () => {
  it('reconhece a desistência de verdade', () => {
    // `access_denied` é o código do padrão OAuth para "a pessoa disse não".
    expect(pessoaCancelouAConexao('access_denied')).toBe(true);
    expect(pessoaCancelouAConexao('user_denied')).toBe(true);
    expect(pessoaCancelouAConexao('user_cancelled')).toBe(true);
    expect(pessoaCancelouAConexao('cancelled')).toBe(true);
  });

  it('não confunde falha do provedor com desistência', () => {
    // Os três que a documentação da Nylas lista para o fluxo hospedado.
    expect(pessoaCancelouAConexao('provider_not_responding')).toBe(false);
    expect(pessoaCancelouAConexao('invalid_authentication')).toBe(false);
    expect(pessoaCancelouAConexao('auth_limit_reached')).toBe(false);
    expect(pessoaCancelouAConexao('server_error')).toBe(false);
  });

  it('não depende de maiúscula nem de espaço sobrando', () => {
    expect(pessoaCancelouAConexao(' Access_Denied ')).toBe(true);
  });

  it('sem código não é desistência — é falha sem nome', () => {
    expect(pessoaCancelouAConexao('')).toBe(false);
    expect(pessoaCancelouAConexao(null)).toBe(false);
    expect(pessoaCancelouAConexao(undefined)).toBe(false);
  });
});

describe('detalheDoProvedorParaGuardar', () => {
  it('mantém a frase do provedor, que é a parte útil', () => {
    expect(detalheDoProvedorParaGuardar('Invalid credentials for imap.locaweb.com.br'))
      .toBe('Invalid credentials for imap.locaweb.com.br');
  });

  it('corta frase muito longa em vez de guardar tudo', () => {
    const longa = 'x'.repeat(500);
    const guardado = detalheDoProvedorParaGuardar(longa);
    expect(guardado.length).toBe(300);
  });

  it('colapsa espaço e quebra de linha', () => {
    expect(detalheDoProvedorParaGuardar('erro\n  no   servidor')).toBe('erro no servidor');
  });

  it('devolve vazio quando não veio nada', () => {
    expect(detalheDoProvedorParaGuardar('')).toBe('');
    expect(detalheDoProvedorParaGuardar(null)).toBe('');
    expect(detalheDoProvedorParaGuardar(undefined)).toBe('');
  });

  it('🔴 nunca guarda algo que pareça credencial', () => {
    // A descrição vem do provedor e cai no nosso banco. Se um dia ela ecoar o
    // que foi enviado, uma senha não pode ficar gravada aqui.
    expect(detalheDoProvedorParaGuardar('login failed password=segredo123'))
      .toBe('login failed password=[oculto]');
    expect(detalheDoProvedorParaGuardar('imap_password: abc def'))
      .toBe('imap_password: [oculto] def');
    expect(detalheDoProvedorParaGuardar('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
      .toBe('Bearer [oculto]');
  });
});
