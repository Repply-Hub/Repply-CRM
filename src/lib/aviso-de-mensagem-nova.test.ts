import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

const toastMock = vi.fn();
vi.mock('sonner', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const tocarNotificacaoMock = vi.fn();
vi.mock('@/lib/som', () => ({
  tocarNotificacao: (...args: unknown[]) => tocarNotificacaoMock(...args),
}));

import { avisarMensagemNova } from './aviso-de-mensagem-nova';

/** Renderiza o que o título do toast produz, para conferir texto e selo. */
function renderizarTitulo() {
  const [tituloFn] = toastMock.mock.calls[0];
  render(tituloFn() as ReactElement);
}

describe('avisarMensagemNova', () => {
  beforeEach(() => {
    toastMock.mockClear();
    tocarNotificacaoMock.mockClear();
  });

  it('origem whatsapp: mantém o laranja de sempre e mostra o selo "WhatsApp" no título', () => {
    avisarMensagemNova({
      origem: 'whatsapp',
      de: 'Ana Souza',
      previa: 'Oi, tudo bem?',
      conversaId: 'conv-1',
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [, opcoes] = toastMock.mock.calls[0];
    expect(opcoes.style).toEqual({ background: '#f97316', color: '#fff', border: 'none' });
    expect(opcoes.action).toBeUndefined();

    renderizarTitulo();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
  });

  it('origem chat: usa a cor escura combinada com o dono do produto e mostra "Chat interno" no título', () => {
    avisarMensagemNova({
      origem: 'chat',
      de: 'Bruno Lima',
      previa: 'Oi, você viu o pedido?',
      aoAbrir: () => {},
    });

    const [, opcoes] = toastMock.mock.calls[0];
    expect(opcoes.style).toEqual({
      background: '#1c1c1c',
      color: '#fff',
      border: '1px solid rgba(249,115,22,0.55)',
    });
    expect(opcoes.action.label).toBe('Abrir conversa');
    expect(opcoes.actionButtonStyle).toEqual({ background: 'rgba(255,255,255,0.12)', color: '#fff' });

    renderizarTitulo();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    expect(screen.getByText('Chat interno')).toBeInTheDocument();
  });

  it('só ganha o botão "Abrir conversa" quando aoAbrir é passado', () => {
    avisarMensagemNova({ origem: 'whatsapp', de: 'Ana Souza', previa: 'x' });
    expect(toastMock.mock.calls[0][1].action).toBeUndefined();

    toastMock.mockClear();
    const aoAbrir = vi.fn();
    avisarMensagemNova({ origem: 'whatsapp', de: 'Ana Souza', previa: 'x', aoAbrir });
    expect(toastMock.mock.calls[0][1].action.label).toBe('Abrir conversa');
    expect(toastMock.mock.calls[0][1].action.onClick).toBe(aoAbrir);
  });

  it('chama tocarNotificacao com os mesmos argumentos de antes (ligado, conversaId, somId)', () => {
    avisarMensagemNova({ origem: 'chat', de: 'Bruno Lima', previa: 'x', conversaId: 'conv-9' });

    expect(tocarNotificacaoMock).toHaveBeenCalledTimes(1);
    const arg = tocarNotificacaoMock.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(['conversaId', 'ligado', 'somId']);
    expect(arg.conversaId).toBe('conv-9');
    expect(typeof arg.ligado).toBe('boolean');
    expect(typeof arg.somId).toBe('string');
  });
});
