import { describe, it, expect } from 'vitest';
import { opcoesDeObra, avisoDaListaDeObras } from './opcoes-de-obra';

const obra = (id: string, nome: string, clienteId: string, cliente?: string) => ({
  id,
  nome_obra: nome,
  cliente_id: clienteId,
  clientes: cliente ? { empresa: cliente } : null,
});

const DO_CLIENTE = [obra('a', 'Residencial Marês', 'c1'), obra('b', 'Vila do Alto', 'c1')];
const TODAS = [
  ...DO_CLIENTE,
  obra('x', 'Condomínio Renova', 'c2', 'Construpav'),
  obra('y', 'Doca Logística', 'c3', 'S Williams'),
];

describe('opcoesDeObra', () => {
  it('as obras do cliente escolhido vêm primeiro, sem selo', () => {
    const r = opcoesDeObra(DO_CLIENTE, TODAS, 'c1');
    expect(r.slice(0, 2).map((o) => o.value)).toEqual(['a', 'b']);
    expect(r[0].badge).toBeUndefined();
  });

  it('🔴 as de outro cliente aparecem, mas MARCADAS com o nome dele', () => {
    // Sem o selo, alguém vincula um negócio à obra de outra construtora sem perceber.
    // É o que torna aceitável mostrar todas: a lista alcança, e ao mesmo tempo avisa.
    const r = opcoesDeObra(DO_CLIENTE, TODAS, 'c1');
    const renova = r.find((o) => o.value === 'x');
    expect(renova?.badge).toBe('Construpav');
  });

  it('nenhuma obra aparece duas vezes', () => {
    const r = opcoesDeObra(DO_CLIENTE, TODAS, 'c1');
    expect(new Set(r.map((o) => o.value)).size).toBe(r.length);
  });

  it('sem cliente escolhido, lista todas — todas marcadas', () => {
    const r = opcoesDeObra([], TODAS, null);
    expect(r).toHaveLength(4);
    expect(r.every((o) => !!o.badge || o.badge === undefined)).toBe(true);
  });

  it('cliente sem obra própria ainda alcança as outras', () => {
    // É o caso de 96,6% dos clientes: sem isto, a lista vinha vazia e não havia o que fazer.
    const r = opcoesDeObra([], TODAS, 'c9');
    expect(r.length).toBe(4);
  });

  it('obra sem nome de cliente não quebra o selo', () => {
    const r = opcoesDeObra([], [obra('z', 'Sem Dono', 'c8')], 'c1');
    expect(r[0].label).toBe('Sem Dono');
    expect(r[0].badge).toBeUndefined();
  });

  it('listas vazias devolvem lista vazia', () => {
    expect(opcoesDeObra([], [], 'c1')).toEqual([]);
    expect(opcoesDeObra(undefined, undefined, null)).toEqual([]);
  });
});

describe('avisoDaListaDeObras', () => {
  it('🔴 distingue "escolha o cliente" de "cliente sem obra"', () => {
    // Hoje as duas situações mostram a MESMA frase genérica, e quem vê não sabe o que fazer.
    const semCliente = avisoDaListaDeObras({ temCliente: false, temAlguma: false });
    const comCliente = avisoDaListaDeObras({ temCliente: true, temAlguma: false });
    expect(semCliente).not.toBe(comCliente);
    expect(semCliente.toLowerCase()).toContain('cliente');
  });

  it('quando há obra para mostrar, não há aviso', () => {
    expect(avisoDaListaDeObras({ temCliente: true, temAlguma: true })).toBe('');
  });

  it('erro de consulta NÃO se disfarça de lista vazia', () => {
    // O código descartava o estado de erro, então falha de rede aparecia igual a "sem obra".
    const m = avisoDaListaDeObras({ temCliente: true, temAlguma: false, erro: true });
    expect(m.toLowerCase()).toContain('não foi possível');
  });

  it('carregando também tem frase própria', () => {
    const m = avisoDaListaDeObras({ temCliente: true, temAlguma: false, carregando: true });
    expect(m.toLowerCase()).toContain('carregando');
  });

  it('nenhuma frase volta vazia quando deveria explicar algo', () => {
    for (const caso of [
      { temCliente: false, temAlguma: false },
      { temCliente: true, temAlguma: false },
      { temCliente: true, temAlguma: false, erro: true },
      { temCliente: true, temAlguma: false, carregando: true },
    ]) {
      expect(avisoDaListaDeObras(caso).length).toBeGreaterThan(10);
    }
  });
});
