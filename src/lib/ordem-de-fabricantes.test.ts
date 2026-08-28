import { describe, it, expect } from 'vitest';
import {
  compararFabricantes,
  compararNomeDeFabricante,
  compararStatusDeFabricante,
  fabricanteEstaAtivo,
  ordenarFabricantes,
  seloDeFabricante,
  SELO_FABRICANTE_INATIVA,
} from './ordem-de-fabricantes';

const ativa = (nome: string) => ({ nome, ativo: true });
const inativa = (nome: string) => ({ nome, ativo: false });
const semStatus = (nome: string) => ({ nome });

describe('fabricanteEstaAtivo', () => {
  it('ativo = true é ativa', () => {
    expect(fabricanteEstaAtivo(ativa('Tigre'))).toBe(true);
  });

  it('ativo = false é inativa', () => {
    expect(fabricanteEstaAtivo(inativa('Deca'))).toBe(false);
  });

  it('🔴 sem a coluna `ativo`, conta como ATIVA', () => {
    // Ausência de informação não é informação. O embed de `pedidos` e as RPCs do Plano de
    // Vendas trazem fabricante sem essa coluna — se "não sei" virasse "inativa", metade das
    // marcas desceria para o fim da lista sem ninguém ter desativado nada.
    expect(fabricanteEstaAtivo(semStatus('Portobello'))).toBe(true);
    expect(fabricanteEstaAtivo({ nome: 'X', ativo: null })).toBe(true);
    expect(fabricanteEstaAtivo(undefined)).toBe(true);
    expect(fabricanteEstaAtivo(null)).toBe(true);
  });
});

describe('compararFabricantes', () => {
  it('inativa vai depois da ativa, mesmo com nome que viria antes', () => {
    expect(compararFabricantes(inativa('Amanco'), ativa('Zagonel'))).toBeGreaterThan(0);
    expect(compararFabricantes(ativa('Zagonel'), inativa('Amanco'))).toBeLessThan(0);
  });

  it('mesmo status: ordem alfabética', () => {
    expect(compararFabricantes(ativa('Amanco'), ativa('Zagonel'))).toBeLessThan(0);
    expect(compararFabricantes(inativa('Amanco'), inativa('Zagonel'))).toBeLessThan(0);
  });

  it('acento não joga a marca para o fim', () => {
    // localeCompare sem locale herda o do navegador; em inglês "Água" cairia depois de "Zagonel".
    expect(compararNomeDeFabricante({ nome: 'Água Viva' }, { nome: 'Zagonel' })).toBeLessThan(0);
  });

  it('nome vazio ou ausente não quebra a comparação', () => {
    expect(() => compararFabricantes({ nome: null, ativo: true }, ativa('Deca'))).not.toThrow();
    expect(compararFabricantes({ nome: null, ativo: true }, ativa('Deca'))).toBeLessThan(0);
  });
});

describe('compararStatusDeFabricante', () => {
  it('devolve 0 para status igual, para o próximo critério decidir', () => {
    // É o que permite ao Plano de Vendas manter a ordem arrastada à mão DEPOIS do status.
    expect(compararStatusDeFabricante(ativa('Amanco'), ativa('Zagonel'))).toBe(0);
    expect(compararStatusDeFabricante(inativa('Amanco'), inativa('Zagonel'))).toBe(0);
    expect(compararStatusDeFabricante(semStatus('Amanco'), ativa('Zagonel'))).toBe(0);
  });

  it('🔴 o status vence a ordem arrastada à mão', () => {
    // Cenário real: alguém arrastou a marca para a primeira posição e só depois deixou de
    // representá-la. Sem o status na frente, ela continuaria no topo do Plano de Vendas.
    const ordem = new Map([
      ['velha', 0],
      ['nova', 9],
    ]);
    const lista = [
      { id: 'nova', nome: 'Nova Marca', ativo: true },
      { id: 'velha', nome: 'Marca Antiga', ativo: false },
    ];
    const ordenada = [...lista].sort(
      (a, b) =>
        compararStatusDeFabricante(a, b) ||
        (ordem.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ordem.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    expect(ordenada.map((f) => f.id)).toEqual(['nova', 'velha']);
  });
});

describe('ordenarFabricantes', () => {
  it('todas as ativas antes de todas as inativas, cada bloco em ordem alfabética', () => {
    const lista = [
      inativa('Amanco'),
      ativa('Zagonel'),
      inativa('Zurique'),
      ativa('Deca'),
      semStatus('Barbosa'),
    ];
    expect(ordenarFabricantes(lista).map((f) => f.nome)).toEqual([
      'Barbosa',
      'Deca',
      'Zagonel',
      'Amanco',
      'Zurique',
    ]);
  });

  it('🔴 a marca inativa CONTINUA na lista — desce, não some', () => {
    // Existe negócio antigo apontando para ela; sumir da lista esconderia o histórico.
    const lista = [ativa('Deca'), inativa('Amanco')];
    expect(ordenarFabricantes(lista)).toHaveLength(2);
    expect(ordenarFabricantes(lista).map((f) => f.nome)).toContain('Amanco');
  });

  it('não altera o array recebido (ele vem do cache do React Query)', () => {
    const lista = [inativa('Amanco'), ativa('Deca')];
    const copia = [...lista];
    ordenarFabricantes(lista);
    expect(lista).toEqual(copia);
  });

  it('aceita lista vazia, nula ou ausente', () => {
    expect(ordenarFabricantes([])).toEqual([]);
    expect(ordenarFabricantes(null)).toEqual([]);
    expect(ordenarFabricantes(undefined)).toEqual([]);
  });
});

describe('seloDeFabricante', () => {
  it('marca ativa não recebe selo nenhum', () => {
    expect(seloDeFabricante(ativa('Deca'))).toBeUndefined();
    expect(seloDeFabricante(semStatus('Deca'))).toBeUndefined();
  });

  it('marca inativa recebe o termo escolhido pelo dono do produto', () => {
    expect(seloDeFabricante(inativa('Amanco'))).toBe('Inativa');
    expect(SELO_FABRICANTE_INATIVA).toBe('Inativa');
  });
});
