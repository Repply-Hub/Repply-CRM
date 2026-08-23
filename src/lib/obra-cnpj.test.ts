import { describe, it, expect } from 'vitest';
import { validarCnpjDaObra } from './obra-cnpj';
import { formatCnpj } from '@/utils/cnpj';

// Um CNPJ que passa no cálculo dos dígitos verificadores. Guardado nos dois formatos porque
// a diferença entre eles é exatamente o que quebrava a tela: o banco guarda 14 dígitos e a
// validação cobra os 18 caracteres do formato.
const CNPJ_CRU = '11222333000181';
const CNPJ_COM_MASCARA = '11.222.333/0001-81';

describe('validarCnpjDaObra', () => {
  it('formata o CNPJ cru do banco no valor de 18 caracteres que a validação espera', () => {
    expect(formatCnpj(CNPJ_CRU)).toBe(CNPJ_COM_MASCARA);
    expect(CNPJ_COM_MASCARA).toHaveLength(18);
  });

  // 🔴 Os dois casos abaixo são o bug de 23/08/2026: o formulário de editar obra não salvava
  // NUNCA. Validava sempre, e o esquema exigia 18 caracteres — então campo vazio reprovava
  // com "CNPJ obrigatório", e campo carregado cru do banco (14) reprovava por ser menor.
  it('aceita obra SEM CNPJ quando o campo é opcional', () => {
    expect(validarCnpjDaObra('', false)).toBeNull();
    expect(validarCnpjDaObra('   ', false)).toBeNull();
  });

  it('aceita obra COM CNPJ que veio do banco, depois de formatado', () => {
    expect(validarCnpjDaObra(formatCnpj(CNPJ_CRU), false)).toBeNull();
    expect(validarCnpjDaObra(formatCnpj(CNPJ_CRU), true)).toBeNull();
  });

  it('cobra o campo quando a empresa o marcou como obrigatório', () => {
    expect(validarCnpjDaObra('', true)).toBe('CNPJ obrigatório');
  });

  it('reclama de CNPJ pela metade, sem confundir com campo vazio', () => {
    // A mensagem é diferente de propósito: "obrigatório" num campo que a pessoa preencheu
    // pela metade não diz o que fazer.
    expect(validarCnpjDaObra('11.222.333/000', false)).toBe('CNPJ incompleto');
  });

  it('recusa CNPJ com dígito verificador errado, mesmo no tamanho certo', () => {
    const invalido = '11.222.333/0001-82';
    expect(invalido).toHaveLength(18);
    expect(validarCnpjDaObra(invalido, false)).toBe('CNPJ inválido');
  });

  it('recusa a sequência de dígitos repetidos, que passa na conta mas não existe', () => {
    expect(validarCnpjDaObra('11.111.111/1111-11', false)).toBe('CNPJ inválido');
  });
});
