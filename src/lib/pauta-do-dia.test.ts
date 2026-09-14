import { describe, it, expect } from 'vitest';
import { separarAPauta } from './pauta-do-dia';

/**
 * O QUE ESTE ARQUIVO PRENDE: a conta de "3 de 7 feitos hoje" e o que a tela desenha.
 *
 * A fila (`pauta_do_dia_de`) passou a devolver DOIS tipos de negócio: `negocio_parado`, que
 * ainda espera retorno, e `negocio_feito`, que já recebeu um hoje. Desenhar os dois juntos
 * mostraria como pendente o que a pessoa acabou de resolver.
 *
 * Nomes e valores inventados (CLAUDE.md §6.9).
 */

const compromisso = { tipo: 'compromisso', titulo: 'Reunião com Ana Souza' };
const parado = { tipo: 'negocio_parado', titulo: 'Obra Exemplo' };
const feito = { tipo: 'negocio_feito', titulo: 'Obra Modelo' };

describe('separarAPauta', () => {
  it('a tela desenha compromissos e pendentes, nunca os feitos', () => {
    const { naTela } = separarAPauta([compromisso, parado, feito]);
    expect(naTela).toEqual([compromisso, parado]);
  });

  it('o denominador conta só NEGÓCIOS — compromisso não entra', () => {
    const r = separarAPauta([compromisso, parado, parado, feito]);
    expect(r.negociosDoDia).toBe(3);
    expect(r.feitos).toHaveLength(1);
  });

  it('dia zerado: nenhum pendente e pelo menos um feito', () => {
    const r = separarAPauta([feito, feito]);
    expect(r.naTela).toHaveLength(0);
    expect(r.feitos).toHaveLength(2);
    expect(r.negociosDoDia).toBe(2);
  });

  it('lista vazia não quebra e não inventa dia zerado', () => {
    const r = separarAPauta([]);
    expect(r.naTela).toHaveLength(0);
    expect(r.feitos).toHaveLength(0);
    expect(r.negociosDoDia).toBe(0);
  });

  it('tipo desconhecido vai para a tela, e não some', () => {
    const estranho = { tipo: 'tipo_que_ainda_nao_existe', titulo: 'X' };
    const { naTela, negociosDoDia } = separarAPauta([estranho]);
    expect(naTela).toEqual([estranho]);
    expect(negociosDoDia).toBe(0);
  });
});
