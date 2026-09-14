import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { devoTocarNotificacao, ouvirAmostra, tocarNotificacao } from './som';

describe('devoTocarNotificacao', () => {
  const base = {
    ligado: true,
    abaVisivel: false,
    conversaEmFoco: null as string | null,
    conversaDaMensagem: null as string | null,
    ultimoToqueEm: 0,
    agora: 100_000,
  };

  it('toca quando a aba está em segundo plano', () => {
    expect(devoTocarNotificacao(base)).toBe(true);
  });

  it('não toca quando a pessoa desligou o som', () => {
    expect(devoTocarNotificacao({ ...base, ligado: false })).toBe(false);
  });

  it('não toca na conversa que já está aberta na frente da pessoa', () => {
    expect(devoTocarNotificacao({
      ...base, abaVisivel: true, conversaEmFoco: 'c1', conversaDaMensagem: 'c1',
    })).toBe(false);
  });

  it('toca quando a aba está visível mas a mensagem é de outra conversa', () => {
    expect(devoTocarNotificacao({
      ...base, abaVisivel: true, conversaEmFoco: 'c1', conversaDaMensagem: 'c2',
    })).toBe(true);
  });

  it('toca com a aba visível quando a notificação não é de conversa nenhuma', () => {
    expect(devoTocarNotificacao({
      ...base, abaVisivel: true, conversaEmFoco: 'c1', conversaDaMensagem: null,
    })).toBe(true);
  });

  it('segura o segundo toque dentro de dois segundos', () => {
    expect(devoTocarNotificacao({ ...base, ultimoToqueEm: 99_000 })).toBe(false);
  });

  it('libera o toque depois de dois segundos', () => {
    expect(devoTocarNotificacao({ ...base, ultimoToqueEm: 97_500 })).toBe(true);
  });
});

describe('qual arquivo toca', () => {
  const criados: string[] = [];
  beforeEach(() => {
    criados.length = 0;
    vi.stubGlobal(
      'Audio',
      class {
        preload = '';
        currentTime = 0;
        constructor(src: string) { criados.push(src); }
        play() { return Promise.resolve(); }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a amostra toca o som pedido', () => {
    ouvirAmostra('marimba');
    expect(criados).toContain('/sons/opcoes/marimba.mp3');
  });

  it('a amostra de um id desconhecido toca o padrão', () => {
    ouvirAmostra('nao-existe');
    expect(criados).toContain('/sons/notificacao.mp3');
  });

  it('a notificação toca o som escolhido', () => {
    tocarNotificacao({ ligado: true, somId: 'gota' });
    expect(criados).toContain('/sons/opcoes/gota.mp3');
  });
});
