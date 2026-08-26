import { describe, it, expect } from 'vitest';
import { mensagemDeErro } from './mensagem-de-erro';

describe('mensagemDeErro', () => {
  it('lê o objeto simples do Supabase, que NÃO é um Error', () => {
    // A forma exata do que o PostgREST devolveu no bug de 25/08/2026.
    const erro = {
      code: '23503',
      message: 'insert or update on table "configuracoes_automacao" violates foreign key constraint',
      details: 'Key (updated_by) is not present in table "users".',
      hint: null,
    };
    expect(erro instanceof Error).toBe(false); // é isto que quebrava o tratamento antigo
    expect(mensagemDeErro(erro)).toContain('violates foreign key');
    expect(mensagemDeErro(erro)).toContain('Key (updated_by)');
  });

  it('junta message, details e hint quando os três vêm', () => {
    expect(mensagemDeErro({ message: 'um', details: 'dois', hint: 'três' })).toBe(
      'um — dois — três',
    );
  });

  it('continua lendo um Error de verdade', () => {
    expect(mensagemDeErro(new Error('Sem empresa definida'))).toBe('Sem empresa definida');
  });

  it('ignora campo vazio, nulo e de outro tipo', () => {
    expect(mensagemDeErro({ message: 'só esta', details: '   ', hint: null })).toBe('só esta');
    expect(mensagemDeErro({ message: 42, details: 'a de baixo vale' })).toBe('a de baixo vale');
  });

  it('cai no padrão quando não há nada legível', () => {
    expect(mensagemDeErro(null)).toBe('erro desconhecido');
    expect(mensagemDeErro({})).toBe('erro desconhecido');
    expect(mensagemDeErro({ message: '' }, 'tente de novo')).toBe('tente de novo');
  });

  it('aceita erro que chegou como texto solto', () => {
    expect(mensagemDeErro('deu ruim')).toBe('deu ruim');
    expect(mensagemDeErro('   ')).toBe('erro desconhecido');
  });
});
