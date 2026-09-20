import { describe, it, expect } from 'vitest';
import {
  lerFiltrosDoEndereco,
  escreverFiltrosNoEndereco,
  recorteParaOServidor,
  type FiltrosDoPainel,
} from './filtros-do-painel';

const vazio: FiltrosDoPainel = { etapas: [], fabricantes: [], responsaveis: [] };

describe('filtros do painel — período por data de criação', () => {
  it('lê data_de e data_ate do endereço', () => {
    const f = lerFiltrosDoEndereco(new URLSearchParams('data_de=2026-01-01&data_ate=2026-03-31'));
    expect(f.dataDe).toBe('2026-01-01');
    expect(f.dataAte).toBe('2026-03-31');
  });

  it('sem período no endereço, os campos vêm indefinidos', () => {
    const f = lerFiltrosDoEndereco(new URLSearchParams('etapas=proposta'));
    expect(f.dataDe).toBeUndefined();
    expect(f.dataAte).toBeUndefined();
  });

  it('grava o período no endereço, e vazio some da URL', () => {
    const comPeriodo = escreverFiltrosNoEndereco(new URLSearchParams(), {
      ...vazio,
      dataDe: '2026-01-01',
      dataAte: '2026-03-31',
    });
    expect(comPeriodo.get('data_de')).toBe('2026-01-01');
    expect(comPeriodo.get('data_ate')).toBe('2026-03-31');

    // Escrever de novo sem período apaga as chaves que estavam lá.
    const semPeriodo = escreverFiltrosNoEndereco(comPeriodo, vazio);
    expect(semPeriodo.has('data_de')).toBe(false);
    expect(semPeriodo.has('data_ate')).toBe(false);
  });

  it('preserva parâmetro de terceiros (ex.: negocio) ao mexer no período', () => {
    const p = escreverFiltrosNoEndereco(new URLSearchParams('negocio=abc'), {
      ...vazio,
      dataDe: '2026-01-01',
    });
    expect(p.get('negocio')).toBe('abc');
    expect(p.get('data_de')).toBe('2026-01-01');
  });

  it('o período vai ao servidor mesmo SEM a chave de ver a equipe', () => {
    const f: FiltrosDoPainel = { ...vazio, dataDe: '2026-01-01', dataAte: '2026-03-31' };
    const semChave = recorteParaOServidor(f, false);
    expect(semChave.dataDe).toBe('2026-01-01');
    expect(semChave.dataAte).toBe('2026-03-31');
    // ...e o responsável continua sendo cortado para quem não tem a chave.
    expect(semChave.usuarioIds).toBeUndefined();
  });
});
