import { describe, expect, it } from 'vitest';
import { normalizarLinksExternos, SidebarItem } from './use-sidebar-preferences';

function item(overrides: Partial<SidebarItem>): SidebarItem {
  return { id: 'x', path: '/x', label: 'X', icon: 'Link', visible: true, ...overrides };
}

describe('normalizarLinksExternos', () => {
  it('corrige atalho antigo salvo como rota interna quebrada (bug de detecção sem protocolo)', () => {
    const [corrigido] = normalizarLinksExternos([
      item({ id: 'consultar-cnpj', path: '/consultarcnpj.com.br', isExternal: false }),
    ]);
    expect(corrigido.isExternal).toBe(true);
    expect(corrigido.path).toBe('https://consultarcnpj.com.br');
  });

  it('corrige item cujo path já é URL completa mas isExternal ficou false/ausente', () => {
    const [corrigido] = normalizarLinksExternos([
      item({ id: 'sintegra', path: 'https://uvt.sefaz.rn.gov.br/#/services/consultaContribuinte', isExternal: false }),
    ]);
    expect(corrigido.isExternal).toBe(true);
    expect(corrigido.path).toBe('https://uvt.sefaz.rn.gov.br/#/services/consultaContribuinte');
  });

  it('não mexe em item já corretamente externo', () => {
    const [inalterado] = normalizarLinksExternos([
      item({ path: 'https://google.com', isExternal: true }),
    ]);
    expect(inalterado.path).toBe('https://google.com');
    expect(inalterado.isExternal).toBe(true);
  });

  it('não mexe em rota interna de verdade', () => {
    const [inalterado] = normalizarLinksExternos([
      item({ id: 'clientes', path: '/clientes', isExternal: false }),
    ]);
    expect(inalterado.path).toBe('/clientes');
    expect(inalterado.isExternal).toBe(false);
  });
});
