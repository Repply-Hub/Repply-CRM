import { normalizeWhatsappPhone, varianteDoNumero } from './use-whatsapp-inbox';

/**
 * A regra do 9º dígito, contra a tabela de casos reais de produção.
 *
 * O caso que motivou tudo: "CST Construção, (84) 2030-0387" — fixo com
 * WhatsApp. A normalização antiga enfiava o 9 em qualquer número de 10 dígitos
 * e transformava o JID real `558420300387` no inexistente `5584920300387`;
 * 100% das falhas de envio vivas eram isso.
 *
 * Estes testes fixam o contrato para a cópia do frontend; as edge functions
 * carregam o mesmo corpo em `supabase/functions/_shared/whatsapp.ts` — se um
 * dia divergirem, a mesma pessoa vira duas conversas.
 */
describe('normalizeWhatsappPhone', () => {
  it('celular completo (13 dígitos com DDI) passa intacto', () => {
    expect(normalizeWhatsappPhone('5584987654321')).toBe('5584987654321');
  });

  it('celular sem DDI ganha o 55', () => {
    expect(normalizeWhatsappPhone('84987654321')).toBe('5584987654321');
  });

  it('celular antigo sem o 9º dígito ganha o 9 (faixa [6-9])', () => {
    // O motivo de a regra existir: JIDs pré-2012 vêm sem o 9.
    expect(normalizeWhatsappPhone('558487654321')).toBe('5584987654321');
    expect(normalizeWhatsappPhone('8487654321')).toBe('5584987654321');
    // limites da faixa
    expect(normalizeWhatsappPhone('8465554321')).toBe('5584965554321');
    expect(normalizeWhatsappPhone('8499998888')).toBe('5584999998888');
  });

  it('FIXO não ganha 9 — o caso CST Construção', () => {
    expect(normalizeWhatsappPhone('558420300387')).toBe('558420300387');
    expect(normalizeWhatsappPhone('8420300387')).toBe('558420300387');
    expect(normalizeWhatsappPhone('(84) 2030-0387')).toBe('558420300387');
    // faixa toda de fixo (2-5)
    expect(normalizeWhatsappPhone('4834477777')).toBe('554834477777');
    expect(normalizeWhatsappPhone('8121014007')).toBe('558121014007');
    expect(normalizeWhatsappPhone('1155551234')).toBe('551155551234');
  });

  it('número que USA o 9 na faixa ambígua passa intacto — grupo B de produção', () => {
    // Estes existem de verdade no WhatsApp (conversas com dezenas de lidas).
    // Remover o 9 deles seria o erro simétrico ao que quebrou os fixos.
    expect(normalizeWhatsappPhone('5584921557900')).toBe('5584921557900');
    expect(normalizeWhatsappPhone('5511959510362')).toBe('5511959510362');
    expect(normalizeWhatsappPhone('5584936180039')).toBe('5584936180039');
  });

  it('DDD 55 (RS) não é confundido com o DDI', () => {
    // fixo de Santa Maria-RS sem DDI: nada de 9
    expect(normalizeWhatsappPhone('5532221234')).toBe('555532221234');
    // celular do RS com DDI: intacto
    expect(normalizeWhatsappPhone('5555987654321')).toBe('5555987654321');
    // celular do RS sem o 9, com DDI: ganha o 9
    expect(normalizeWhatsappPhone('555587654321')).toBe('5555987654321');
  });

  it('formatação (máscara, espaços, +) é ignorada', () => {
    expect(normalizeWhatsappPhone('+55 (84) 9 8765-4321')).toBe('5584987654321');
  });
});

describe('varianteDoNumero', () => {
  it('9+[2-5]: a variante é sem o 9 (pode ser fixo com 9 espúrio)', () => {
    expect(varianteDoNumero('5584920300387')).toBe('558420300387');
    expect(varianteDoNumero('5548934477777')).toBe('554834477777');
  });

  it('[2-5] sem 9: a variante é com o 9 (pode ser conta que usa o 9)', () => {
    expect(varianteDoNumero('558421557900')).toBe('5584921557900');
  });

  it('celular inequívoco (9+[6-9]) não tem variante', () => {
    expect(varianteDoNumero('5584987654321')).toBeNull();
  });

  it('grupo e formatos não-BR não têm variante', () => {
    expect(varianteDoNumero('120363356920210019')).toBeNull();
    expect(varianteDoNumero('5511988345626-1425926780')).toBeNull();
  });

  it('ida e volta: a variante da variante é o número original', () => {
    const original = '5584920300387';
    const alt = varianteDoNumero(original)!;
    expect(varianteDoNumero(alt)).toBe(original);
  });
});
