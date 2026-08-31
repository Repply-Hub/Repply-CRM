import { describe, it, expect } from 'vitest';
import { marcaDaEmpresa } from './marca-da-empresa';

/**
 * A identidade que vai no topo dos PDFs exportados.
 *
 * 🔴 O QUE ESTE ARQUIVO PROTEGE. Até 31/08/2026 os três geradores de PDF estampavam a logo e o
 * nome da MD Representações — para as dez empresas assinantes. O documento exportado é o que
 * mais sai do sistema: vai por e-mail ao cliente do representante. Sair com a marca de outra
 * representação é o pior erro que um sistema multi-empresa pode cometer.
 */
describe('marcaDaEmpresa', () => {
  const empresa = (over: Record<string, unknown> = {}) => ({
    empresas: { nome: 'PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA', nome_fantasia: 'Cocentino', logo_url: 'https://x/logo.png', ...over },
  });

  it('🔴 prefere o nome fantasia à razão social', () => {
    // O PDF vai para o cliente do representante: ali vale o nome pelo qual a empresa é
    // conhecida, não o da junta comercial.
    expect(marcaDaEmpresa(empresa()).nome).toBe('Cocentino');
  });

  it('sem nome fantasia, cai na razão social', () => {
    expect(marcaDaEmpresa(empresa({ nome_fantasia: null })).nome).toBe(
      'PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA',
    );
  });

  it('nome fantasia em branco não conta como nome', () => {
    expect(marcaDaEmpresa(empresa({ nome_fantasia: '   ' })).nome).toBe(
      'PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA',
    );
  });

  it('🔴 sem nome nenhum devolve vazio — nunca um nome inventado', () => {
    // O cabeçalho simplesmente não escreve nada. "Minha empresa" num documento que vai para
    // fora seria pior que espaço em branco.
    expect(marcaDaEmpresa(empresa({ nome: null, nome_fantasia: null })).nome).toBe('');
  });

  it('a logo vem limpa, e vazio vira nulo', () => {
    expect(marcaDaEmpresa(empresa()).logoUrl).toBe('https://x/logo.png');
    expect(marcaDaEmpresa(empresa({ logo_url: '' })).logoUrl).toBeNull();
    expect(marcaDaEmpresa(empresa({ logo_url: '  ' })).logoUrl).toBeNull();
  });

  it('🔴 perfil sem empresa não quebra a exportação', () => {
    for (const p of [null, undefined, {}, { empresas: null }]) {
      const m = marcaDaEmpresa(p as never);
      expect(m.nome).toBe('');
      expect(m.logoUrl).toBeNull();
    }
  });

  it('valor que não é texto é ignorado, não estampado', () => {
    const m = marcaDaEmpresa({ empresas: { nome: 123, nome_fantasia: {}, logo_url: [] } } as never);
    expect(m.nome).toBe('');
    expect(m.logoUrl).toBeNull();
  });
});
