import { describe, it, expect } from 'vitest';
import { SUPORTE_EMAIL, SUPORTE_WHATSAPP, linkSuporteEmail, linkSuporteWhatsApp } from './suporte';

describe('linkSuporteEmail', () => {
  it('o e-mail de suporte é a caixa que recebe de verdade', () => {
    expect(SUPORTE_EMAIL).toBe('repplyhub@gmail.com');
  });

  it('monta o link mailto com o e-mail de suporte', () => {
    expect(linkSuporteEmail()).toBe('mailto:repplyhub@gmail.com');
  });
});

describe('linkSuporteWhatsApp', () => {
  it('o número do suporte é só dígitos (o que o wa.me aceita)', () => {
    expect(SUPORTE_WHATSAPP).toMatch(/^\d+$/);
  });

  it('monta o link wa.me com o número e o texto', () => {
    expect(linkSuporteWhatsApp('oi')).toBe(`https://wa.me/${SUPORTE_WHATSAPP}?text=oi`);
  });

  it('percent-encoda a mensagem — espaço e acento não quebram o link', () => {
    const url = linkSuporteWhatsApp('Olá, criei minha conta');
    expect(url).toContain('text=Ol%C3%A1%2C%20criei%20minha%20conta');
    expect(url).not.toContain(' ');
  });
});
