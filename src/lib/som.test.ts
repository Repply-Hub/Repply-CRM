import { describe, it, expect } from 'vitest';
import { devoTocarNotificacao } from './som';

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
