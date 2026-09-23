import { describe, it, expect } from 'vitest';
import {
  podeConectarNumero,
  lerRespostaDeConexao,
  estaConectadoNaResposta,
} from './whatsapp-instancia';

/**
 * O QUE ESTE ARQUIVO PRENDE: quem pode conectar um número de WhatsApp, e como se lê a resposta
 * da operadora (item 74 da dívida técnica, passo 2).
 *
 * 🔴 POR QUE. Conectar, conferir e desconectar saíam DO NAVEGADOR, com a chave da operadora no
 * cabeçalho — por isso a chave precisava chegar ao navegador de 21 pessoas. A credencial vale
 * FORA do produto: trancar o CRM não a invalida. As três chamadas passam a sair de uma função
 * de servidor, que guarda a chave do lado de lá.
 *
 * Decisão do dono do produto em 23/09/2026: **conectar é do gestor** — ou de quem tiver a
 * permissão específica, que ainda não existe e entra quando a matriz de permissões for
 * implementada. Por isso `podeConectarNumero` já aceita o segundo argumento: no dia em que a
 * permissão existir, liga-se ali e nada mais muda.
 *
 * A leitura da resposta estava DUPLICADA em `use-whatsapp-inbox.ts` e `use-admin-whatsapp.ts`,
 * palavra por palavra. Duas cópias da mesma adivinhação de formato é como uma delas envelhece
 * sozinha — juntar aqui é o que permite a função de servidor devolver a resposta crua e o
 * navegador continuar interpretando do mesmo jeito nos dois lugares.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

describe('podeConectarNumero', () => {
  it('gestor, dono da conta e admin conectam', () => {
    expect(podeConectarNumero('gestor')).toBe(true);
    expect(podeConectarNumero('empresa')).toBe(true);
    expect(podeConectarNumero('admin')).toBe(true);
  });

  it('🔴 vendedor NÃO conecta, nem o vinculado ao número', () => {
    expect(podeConectarNumero('vendedor')).toBe(false);
  });

  it('sem papel conhecido, não conecta', () => {
    expect(podeConectarNumero(null)).toBe(false);
    expect(podeConectarNumero(undefined)).toBe(false);
    expect(podeConectarNumero('estagiario')).toBe(false);
  });

  it('a permissão futura destrava sem mexer no papel', () => {
    // Quando a matriz de permissões existir, é só passar `true` aqui.
    expect(podeConectarNumero('vendedor', true)).toBe(true);
  });
});

describe('lerRespostaDeConexao', () => {
  it('acha o QR no formato que a operadora usa hoje', () => {
    const r = lerRespostaDeConexao({ instance: { qrcode: 'data:image/png;base64,AAA' } });
    expect(r.qr).toBe('data:image/png;base64,AAA');
    expect(r.jaConectado).toBe(false);
  });

  it('acha o QR nos outros três formatos que o código já tolerava', () => {
    expect(lerRespostaDeConexao({ qrcode: { base64: 'BBB' } }).qr).toBe('BBB');
    expect(lerRespostaDeConexao({ qrcode: 'CCC' }).qr).toBe('CCC');
    expect(lerRespostaDeConexao({ base64: 'DDD' }).qr).toBe('DDD');
  });

  it('🔴 QR vazio é AUSÊNCIA de QR, não um QR em branco', () => {
    // A operadora devolve qrcode: "" quando não há o que gerar (instância já conectada).
    expect(lerRespostaDeConexao({ instance: { qrcode: '' } }).qr).toBeNull();
  });

  it('reconhece "já conectado" nas cinco formas que a operadora usa', () => {
    expect(lerRespostaDeConexao({ connected: true }).jaConectado).toBe(true);
    expect(lerRespostaDeConexao({ status: { connected: true } }).jaConectado).toBe(true);
    expect(lerRespostaDeConexao({ status: { loggedIn: true } }).jaConectado).toBe(true);
    expect(lerRespostaDeConexao({ instance: { status: 'connected' } }).jaConectado).toBe(true);
    expect(lerRespostaDeConexao({ response: 'Instance already connected' }).jaConectado).toBe(true);
  });

  it('resposta vazia ou estranha não quebra e não inventa conexão', () => {
    expect(lerRespostaDeConexao(null)).toEqual({ qr: null, jaConectado: false });
    expect(lerRespostaDeConexao({})).toEqual({ qr: null, jaConectado: false });
    expect(lerRespostaDeConexao('nem é objeto')).toEqual({ qr: null, jaConectado: false });
  });
});

describe('estaConectadoNaResposta', () => {
  it('🔴 conectado exige as DUAS confirmações: ligado E autenticado', () => {
    expect(estaConectadoNaResposta({ status: { connected: true, loggedIn: true } })).toBe(true);
    // Ligado mas não autenticado não é conectado — é o estado de quem está lendo o QR.
    expect(estaConectadoNaResposta({ status: { connected: true, loggedIn: false } })).toBe(false);
  });

  it('aceita também a forma curta que a operadora devolve', () => {
    expect(estaConectadoNaResposta({ connected: true })).toBe(true);
  });

  it('resposta vazia é desconectado, nunca conectado', () => {
    expect(estaConectadoNaResposta(null)).toBe(false);
    expect(estaConectadoNaResposta({})).toBe(false);
  });
});
