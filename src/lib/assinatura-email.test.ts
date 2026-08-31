import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) } },
}));

import { montarRodapeEmailHtml } from './assinatura-email';

/**
 * O rodapé que vai em todo e-mail enviado pelo sistema.
 *
 * 🔴 ATÉ 31/08/2026 ELE ESCREVIA "MD Representações" — para as dez empresas assinantes. Todo
 * e-mail que a JHS mandava ao cliente dela saía assinado com o nome de outra representação.
 * Havia três marcas cravadas no mesmo arquivo: o rodapé, o nome de reserva ("Equipe MD") e o
 * texto alternativo da logo — que é justamente o que o cliente LÊ quando o programa de e-mail
 * bloqueia imagens, que é o padrão de muitos deles.
 */

const base = {
  nome: 'Érika Marques',
  assinaturaHtml: 'Consultora comercial',
  nomeDaEmpresa: 'JHS Representações',
  logoUrl: 'https://balde/branding/abc/logo.png?v=1',
};

describe('montarRodapeEmailHtml', () => {
  it('🔴 escreve a empresa de quem envia, em nenhum lugar a MD', () => {
    const html = montarRodapeEmailHtml(base);
    expect(html).toContain('JHS Representações');
    expect(html).not.toMatch(/MD Representa|Equipe MD/);
  });

  it('🔴 o texto alternativo da logo é a empresa — é o que se lê com imagem bloqueada', () => {
    const html = montarRodapeEmailHtml(base);
    expect(html).toMatch(/alt="JHS Representações"/);
  });

  it('sem nome de pessoa, cai no nome da empresa', () => {
    const html = montarRodapeEmailHtml({ ...base, nome: '' });
    expect(html).toContain('JHS Representações');
    expect(html).not.toMatch(/Equipe/);
  });

  it('🔴 sem logo, não desenha imagem quebrada', () => {
    const html = montarRodapeEmailHtml({ ...base, logoUrl: null as never });
    expect(html).not.toContain('<img');
    // E o nome da empresa continua lá: é a identificação que sobra.
    expect(html).toContain('JHS Representações');
  });

  it('sem nome de empresa, o rodapé não inventa um', () => {
    const html = montarRodapeEmailHtml({ ...base, nomeDaEmpresa: '', logoUrl: null as never });
    expect(html).not.toMatch(/MD|Equipe|Minha empresa/);
  });

  it('🔴 o NOME da empresa é escapado — ele é digitado pelo cliente', () => {
    const html = montarRodapeEmailHtml({
      ...base,
      nomeDaEmpresa: 'Aço & Cia "Norte" <b>',
      logoUrl: null as never,
    });
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('🔴 o ENDEREÇO da logo também é escapado — é coluna de texto que o gestor grava', () => {
    // `empresas.logo_url` é `text`, e o gestor pode gravá-la direto pela API. Sem escapar, uma
    // aspa no meio do valor fecha o atributo `src="..."` e o resto vira HTML dentro de um
    // e-mail que sai da caixa da empresa.
    const html = montarRodapeEmailHtml({
      ...base,
      logoUrl: 'https://x/l.png" onerror="alert(1)',
    });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('a assinatura escrita pela pessoa continua sendo higienizada', () => {
    const html = montarRodapeEmailHtml({
      ...base,
      assinaturaHtml: '<img src=x onerror="alert(1)"><b>ok</b>',
    });
    expect(html).not.toContain('onerror');
    expect(html).toContain('<b>ok</b>');
  });
});
