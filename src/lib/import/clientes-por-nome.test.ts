import { describe, it, expect } from 'vitest';
import { clientesPorNomeCitado, type ClienteCitado } from './clientes-por-nome';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a importação de contatos pare de criar construtora duplicada
 * (item 52 da dívida técnica).
 *
 * 🔴 POR QUE. Para não duplicar, a importação precisa saber quais construtoras já existem. Ela
 * pedia a lista INTEIRA de clientes — e o servidor corta em 1.000 linhas, sem avisar e sem
 * ordenação. A base da MD já passa de 2.100: se a construtora estivesse entre as que não vieram,
 * o código concluía "não existe" e criava ficha nova. Quais 1.000 chegam muda a cada importação,
 * então o estrago é diferente toda vez — e cada importação suja mais a base, com a mesma
 * construtora em duas fichas e o histórico, os negócios e os contatos divididos entre elas.
 *
 * O conserto é perguntar só pelos nomes que a planilha cita, em blocos — que é o padrão que o
 * próprio arquivo já usava 110 linhas abaixo. Assim o teto de 1.000 deixa de existir: o que
 * limita passa a ser o tamanho do bloco, não o tamanho da base.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

function consultaFalsa(base: ClienteCitado[], registro: string[][] = []) {
  return async (nomes: string[]) => {
    registro.push(nomes);
    const pedidos = new Set(nomes.map(n => n.trim().toLowerCase()));
    return base.filter(c => c.empresa && pedidos.has(c.empresa.trim().toLowerCase()));
  };
}

describe('clientesPorNomeCitado', () => {
  it('🔴 acha a construtora mesmo com a base maior que o teto de 1.000 do servidor', async () => {
    // 2.172 clientes cadastrados; o que interessa é o último, muito além do milésimo.
    const base: ClienteCitado[] = Array.from({ length: 2172 }, (_, i) => ({
      id: `c${i}`,
      empresa: `Construtora Exemplo ${i}`,
    }));
    const registro: string[][] = [];

    const achados = await clientesPorNomeCitado(
      ['Construtora Exemplo 2171'],
      consultaFalsa(base, registro),
    );

    expect(achados.porNome.get('construtora exemplo 2171')).toBe('c2171');
    // A prova de que não pediu a lista inteira: perguntou por UM nome.
    expect(registro).toEqual([['Construtora Exemplo 2171']]);
  });

  it('pergunta em blocos, e nenhum bloco passa do tamanho combinado', async () => {
    const nomes = Array.from({ length: 120 }, (_, i) => `Obra ${i}`);
    const registro: string[][] = [];

    await clientesPorNomeCitado(nomes, consultaFalsa([], registro), 50);

    expect(registro).toHaveLength(3);
    expect(registro.map(b => b.length)).toEqual([50, 50, 20]);
  });

  it('nome repetido na planilha vira uma pergunta só', async () => {
    const registro: string[][] = [];

    await clientesPorNomeCitado(
      ['Construtora Alfa', 'construtora alfa ', 'CONSTRUTORA ALFA'],
      consultaFalsa([], registro),
    );

    expect(registro).toEqual([['Construtora Alfa']]);
  });

  it('casa sem diferenciar maiúsculas nem espaços sobrando', async () => {
    const base = [{ id: 'c1', empresa: '  Construtora Alfa  ' }];

    const achados = await clientesPorNomeCitado(['construtora alfa'], consultaFalsa(base));

    expect(achados.porNome.get('construtora alfa')).toBe('c1');
  });

  it('🔴 nome com duas fichas fica de fora: ambíguo não vira vínculo adivinhado', async () => {
    const base = [
      { id: 'c1', empresa: 'Construtora Alfa' },
      { id: 'c2', empresa: 'CONSTRUTORA ALFA' },
    ];

    const achados = await clientesPorNomeCitado(['Construtora Alfa'], consultaFalsa(base));

    expect(achados.porNome.has('construtora alfa')).toBe(false);
  });

  it('🔴 o nome ambíguo continua contando como já cadastrado: a importação não cria a terceira cópia', async () => {
    const base = [
      { id: 'c1', empresa: 'Construtora Alfa' },
      { id: 'c2', empresa: 'CONSTRUTORA ALFA' },
    ];

    const achados = await clientesPorNomeCitado(['Construtora Alfa'], consultaFalsa(base));

    expect(achados.porNome.has('construtora alfa')).toBe(false);
    expect(achados.jaCadastrados.has('construtora alfa')).toBe(true);
  });

  it('planilha sem nome de empresa não consulta o banco', async () => {
    const registro: string[][] = [];

    const achados = await clientesPorNomeCitado([], consultaFalsa([], registro));

    expect(registro).toHaveLength(0);
    expect(achados.porNome.size).toBe(0);
  });

  it('ignora vazio e espaço em branco vindos da planilha', async () => {
    const registro: string[][] = [];

    await clientesPorNomeCitado(['', '   ', 'Construtora Alfa'], consultaFalsa([], registro));

    expect(registro).toEqual([['Construtora Alfa']]);
  });
});
