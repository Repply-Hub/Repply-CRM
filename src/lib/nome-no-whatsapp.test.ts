import { describe, it, expect } from 'vitest';
import { nomeParaNegrito } from '../../supabase/functions/_shared/whatsapp';

/**
 * O caso que motivou: na JHS, a Silvia cadastrou o próprio nome como "Silvia "
 * (com espaço sobrando). O WhatsApp NÃO aplica negrito quando há espaço colado
 * ao asterisco, então o cliente recebia `*Silvia *` com os asteriscos crus.
 *
 * Estes testes cobrem a cópia que as edge functions carregam — o mesmo arquivo,
 * importado por caminho relativo (`_shared/whatsapp.ts` não tem `import`
 * nenhum, então o vitest o carrega direto).
 */
describe('nomeParaNegrito', () => {
  it('tira espaço sobrando das pontas', () => {
    expect(nomeParaNegrito('Silvia ')).toBe('Silvia');
    expect(nomeParaNegrito('  Silvia')).toBe('Silvia');
  });

  it('colapsa espaço repetido no meio', () => {
    expect(nomeParaNegrito('Ana  Paula')).toBe('Ana Paula');
  });

  it('tira quebra de linha e tabulação', () => {
    expect(nomeParaNegrito('Ana\nPaula')).toBe('Ana Paula');
    expect(nomeParaNegrito('Ana\tPaula')).toBe('Ana Paula');
  });

  it('neutraliza os caracteres que o WhatsApp usa como formatação', () => {
    expect(nomeParaNegrito('Ana *Paula*')).toBe('Ana Paula');
    expect(nomeParaNegrito('Ana_Paula')).toBe('AnaPaula');
    expect(nomeParaNegrito('~Ana~')).toBe('Ana');
    expect(nomeParaNegrito('Ana `Paula`')).toBe('Ana Paula');
  });

  it('devolve vazio quando não sobra nada', () => {
    expect(nomeParaNegrito('   ')).toBe('');
    expect(nomeParaNegrito('***')).toBe('');
    expect(nomeParaNegrito(null)).toBe('');
    expect(nomeParaNegrito(undefined)).toBe('');
  });

  it('preserva acento e nome composto', () => {
    expect(nomeParaNegrito('José Artur Oliveira')).toBe('José Artur Oliveira');
    expect(nomeParaNegrito('Margley Pontes')).toBe('Margley Pontes');
  });
});
