import { describe, it, expect } from 'vitest';
import { enderecoDeRetorno, APP_CANONICO } from './endereco-de-retorno';

/**
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Em 27/08/2026 o Lucas pediu redefinição de senha e recebeu no e-mail um link para
 * `http://localhost:3000`. A causa raiz estava fora do código — o **Site URL** da
 * autenticação no Supabase apontava para localhost, e o Supabase usa esse valor sempre
 * que o endereço pedido pelo app não está na lista de endereços autorizados.
 *
 * Medido em 31/08/2026 nos registros de autenticação: 3.306 requisições, **634 endereços
 * de internet distintos**, e o destino efetivo era `http://localhost:3000` em TODAS —
 * usuários reais da MD, da JHS e da PR & Cocentino, de cidades diferentes. Detalhe que
 * confirma: o servidor de desenvolvimento deste projeto roda na porta **8080**, então
 * `localhost:3000` não correspondia nem à produção nem ao ambiente local — era sobra do
 * andaime original.
 *
 * ESTE ARQUIVO NÃO CONSERTA AQUILO. A configuração é de painel.
 *
 * O que ele conserta é a fragilidade que estava ao lado: o app montava o link com
 * `window.location.origin`, que é "onde o navegador está agora". Da produção dá certo;
 * de uma prévia da Vercel manda o link da prévia — que não está autorizada, e aí o
 * Supabase cai no Site URL de novo, em silêncio.
 *
 * A regra que estes testes fixam: em máquina de desenvolvimento vale o endereço local
 * (senão ninguém consegue testar); em qualquer outro lugar vale o endereço canônico.
 */
describe('enderecoDeRetorno', () => {
  it('na produção, devolve o endereço canônico', () => {
    expect(enderecoDeRetorno('https://crm.repplyhub.com.br', '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
  });

  it('🔴 numa prévia da Vercel, devolve a PRODUÇÃO — não a prévia', () => {
    // É o caso que o `window.location.origin` errava. O link da prévia não está na lista
    // de endereços autorizados, então o Supabase o descartaria e cairia no Site URL.
    // Mandar a produção é o único destino que funciona de verdade.
    expect(enderecoDeRetorno('https://repply-crm-git-branch-repply1.vercel.app', '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
  });

  it('em máquina de desenvolvimento, devolve o endereço local', () => {
    // Sem isto, quem roda `npm run dev` não consegue testar redefinição de senha:
    // clicaria no e-mail e cairia na produção.
    expect(enderecoDeRetorno('http://localhost:8080', '/redefinir-senha'))
      .toBe('http://localhost:8080/redefinir-senha');
  });

  it('reconhece as três formas de dizer "esta máquina"', () => {
    expect(enderecoDeRetorno('http://127.0.0.1:8080', '/x')).toBe('http://127.0.0.1:8080/x');
    expect(enderecoDeRetorno('http://[::1]:8080', '/x')).toBe('http://[::1]:8080/x');
    expect(enderecoDeRetorno('http://localhost:5173', '/x')).toBe('http://localhost:5173/x');
  });

  it('não confunde um domínio que apenas CONTÉM "localhost"', () => {
    // `localhost.exemplo.com` é um domínio público como outro qualquer. Casar por
    // substring o trataria como máquina de desenvolvimento e mandaria o link para lá.
    expect(enderecoDeRetorno('https://localhost.exemplo.com', '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
    expect(enderecoDeRetorno('https://naolocalhost.com.br', '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
  });

  it('devolve o canônico quando não há origem nenhuma', () => {
    // Cenário de servidor ou de teste, onde `window` não existe.
    expect(enderecoDeRetorno('', '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
    expect(enderecoDeRetorno(undefined, '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
  });

  it('não duplica nem engole a barra do caminho', () => {
    expect(enderecoDeRetorno('https://crm.repplyhub.com.br/', '/redefinir-senha'))
      .toBe('https://crm.repplyhub.com.br/redefinir-senha');
    expect(enderecoDeRetorno('http://localhost:8080/', '/redefinir-senha'))
      .toBe('http://localhost:8080/redefinir-senha');
  });

  it('o endereço canônico não tem barra no fim', () => {
    // Se tivesse, toda montagem viraria `//caminho` e o Supabase recusaria por não bater
    // com a lista de endereços autorizados.
    expect(APP_CANONICO.endsWith('/')).toBe(false);
  });
});
