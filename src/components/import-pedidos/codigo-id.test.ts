import { describe, it, expect } from 'vitest';
import { FIELDS, detectImportPedidosMapping, createEmptyMapping } from './importPedidosUtils';

describe('a coluna Código/ID', () => {
  it('é a ÚLTIMA de FIELDS — a ordem daqui é a ordem das colunas da planilha', () => {
    // O desenho decidiu: no fim, depois de "Anexo". A exportação monta o cabeçalho com
    // FIELDS.map(f => f.label), então mudar a posição aqui muda a planilha.
    expect(FIELDS[FIELDS.length - 1]).toEqual({
      key: 'codigo',
      label: 'Código/ID',
      required: false,
    });
  });

  it('não é obrigatória — planilha de base nova não tem essa coluna', () => {
    const codigo = FIELDS.find(f => f.key === 'codigo');
    expect(codigo?.required).toBe(false);
  });

  it('entra no mapeamento vazio, senão o assistente nunca a oferece', () => {
    expect(createEmptyMapping()).toHaveProperty('codigo', '');
  });

  it('é reconhecida sozinha quando a planilha volta da nossa exportação', () => {
    const cabecalhos = ['Negócio', 'Cliente', 'Anexo', 'Código/ID'];
    const linhas = [{
      'Negócio': 'Obra X',
      'Cliente': 'Construtora Y',
      'Anexo': '',
      'Código/ID': '3f2a8b91-0000-4000-8000-000000000001',
    }];
    expect(detectImportPedidosMapping(cabecalhos, linhas).codigo).toBe('Código/ID');
  });

  it('reconhece as escritas que a pessoa pode digitar à mão', () => {
    for (const cabecalho of ['ID', 'Codigo', 'Código', 'Código/ID', 'id do negocio']) {
      const linhas = [{ [cabecalho]: '3f2a8b91-0000-4000-8000-000000000001' }];
      expect(detectImportPedidosMapping([cabecalho], linhas).codigo).toBe(cabecalho);
    }
  });

  it('NÃO confunde com "Marcador", que também é texto curto', () => {
    const linhas = [{ 'Marcador': 'Urgente' }];
    expect(detectImportPedidosMapping(['Marcador'], linhas).codigo).toBe('');
  });
});
