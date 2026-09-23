import { describe, it, expect } from 'vitest';
import {
  erroDoEndereco,
  estadoDaRedefinicao,
  explicacaoDoErroDoLink,
} from './link-de-recuperacao';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a tela de escolher a nova senha saiba de onde a pessoa veio
 * antes de desenhar o formulário (item 59 da dívida técnica).
 *
 * 🔴 POR QUE. O link de redefinição vale no máximo UMA HORA, e antivírus de e-mail corporativo
 * costuma abrir o endereço sozinho para checar segurança — queimando o link antes de a pessoa
 * clicar. Quando isso acontece, o Supabase devolve a pessoa para a nossa tela com o motivo
 * escrito no fim do endereço. A tela ignorava isso e desenhava o formulário como se estivesse
 * tudo bem: a pessoa digitava a senha duas vezes e só então levava um aviso genérico, sem
 * nenhum botão para sair.
 *
 * E havia o caso caro: num computador compartilhado, com um colega logado em outra aba, a
 * biblioteca do Supabase PRESERVA a sessão que já existia quando o link falha (está escrito no
 * código dela: "Don't remove existing session on URL login failure"). O formulário então trocava
 * a senha de quem estava logado, não a de quem clicou no link — e anunciava sucesso.
 *
 * A defesa é ler o endereço ANTES de desenhar: com erro ali, nenhum formulário aparece.
 * Detalhe da biblioteca que torna isso possível: no caminho do erro ela lança a exceção ANTES de
 * limpar o endereço, então o motivo continua lá para nós lermos. No caminho de sucesso ela limpa
 * (`window.location.hash = ''`), e aí quem avisa é o evento de recuperação.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

describe('erroDoEndereco', () => {
  it('🔴 lê o motivo que o Supabase deixou no fim do endereço', () => {
    const erro = erroDoEndereco(
      'https://exemplo.com.br/redefinir-senha#error=access_denied&error_code=otp_expired' +
        '&error_description=Email+link+is+invalid+or+has+expired',
    );

    expect(erro).toEqual({
      codigo: 'otp_expired',
      descricao: 'Email link is invalid or has expired',
    });
  });

  it('lê o motivo quando ele vem na parte de busca, e não no fim', () => {
    const erro = erroDoEndereco(
      'https://exemplo.com.br/redefinir-senha?error=access_denied&error_code=otp_expired',
    );

    expect(erro?.codigo).toBe('otp_expired');
  });

  it('endereço limpo não é erro', () => {
    expect(erroDoEndereco('https://exemplo.com.br/redefinir-senha')).toBeNull();
  });

  it('🔴 link que deu certo não é erro — o token no endereço não pode ser lido como falha', () => {
    expect(
      erroDoEndereco(
        'https://exemplo.com.br/redefinir-senha#access_token=abc.def.ghi&type=recovery',
      ),
    ).toBeNull();
  });

  it('cai no código genérico quando só a descrição veio', () => {
    const erro = erroDoEndereco('https://exemplo.com.br/redefinir-senha#error_description=Algo+ruim');

    expect(erro).toEqual({ codigo: 'desconhecido', descricao: 'Algo ruim' });
  });

  it('endereço sem sentido não derruba a tela', () => {
    expect(erroDoEndereco('nem isso é um endereço')).toBeNull();
  });
});

describe('estadoDaRedefinicao', () => {
  it('🔴 o erro no endereço manda, mesmo com sessão aberta no navegador', () => {
    // O caso do computador compartilhado: o link falhou, mas a sessão do colega continua viva.
    expect(
      estadoDaRedefinicao({
        erro: { codigo: 'otp_expired', descricao: 'expirou' },
        veioDoLink: true,
        apuracaoTerminou: true,
      }),
    ).toBe('link-invalido');
  });

  it('o erro decide antes mesmo de a apuração terminar', () => {
    expect(
      estadoDaRedefinicao({
        erro: { codigo: 'otp_expired', descricao: 'expirou' },
        veioDoLink: false,
        apuracaoTerminou: false,
      }),
    ).toBe('link-invalido');
  });

  it('quem veio pelo link vê o formulário', () => {
    expect(
      estadoDaRedefinicao({ erro: null, veioDoLink: true, apuracaoTerminou: true }),
    ).toBe('pronto');
  });

  it('🔴 enquanto não se sabe, a tela espera — nunca chuta "sem link"', () => {
    expect(
      estadoDaRedefinicao({ erro: null, veioDoLink: false, apuracaoTerminou: false }),
    ).toBe('apurando');
  });

  it('apuração terminada e nenhum sinal: a pessoa não veio de link nenhum', () => {
    expect(
      estadoDaRedefinicao({ erro: null, veioDoLink: false, apuracaoTerminou: true }),
    ).toBe('sem-link');
  });
});

describe('explicacaoDoErroDoLink', () => {
  it('explica o link vencido dizendo quanto ele dura', () => {
    const frase = explicacaoDoErroDoLink({ codigo: 'otp_expired', descricao: 'seja lá o que for' });

    expect(frase).toMatch(/1 hora/);
    expect(frase.toLowerCase()).toContain('link');
  });

  it('trata "acesso negado" como link já usado, que é o que ele significa aqui', () => {
    expect(explicacaoDoErroDoLink({ codigo: 'access_denied', descricao: '' })).toMatch(/1 hora/);
  });

  it('🔴 código desconhecido não inventa motivo', () => {
    const frase = explicacaoDoErroDoLink({ codigo: 'coisa_nova_do_supabase', descricao: '' });

    expect(frase).not.toMatch(/1 hora/);
    expect(frase.length).toBeGreaterThan(10);
  });
});
