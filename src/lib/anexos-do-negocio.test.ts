import { describe, it, expect } from 'vitest';
import {
  recusaDoAnexo, ehImagem, nomeDoAnexo, tamanhoLegivel, ordenarAnexos, resumoDaColunaDeAnexos,
} from './anexos-do-negocio';

const pdf = { name: 'orcamento.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' };

describe('recusaDoAnexo', () => {
  it('aceita PDF e imagem dentro do tamanho', () => {
    expect(recusaDoAnexo(pdf)).toBeNull();
    expect(recusaDoAnexo({ name: 'foto-obra.jpg', size: 500_000, type: 'image/jpeg' })).toBeNull();
    expect(recusaDoAnexo({ name: 'print.png', size: 500_000, type: 'image/png' })).toBeNull();
  });

  it('🔴 recusa arquivo acima de 15 MB, dizendo o limite', () => {
    const recusa = recusaDoAnexo({ ...pdf, size: 20 * 1024 * 1024 });
    expect(recusa).toContain('15 MB');
  });

  it('recusa tipo que não é PDF nem imagem, dizendo o que vale', () => {
    const recusa = recusaDoAnexo({ name: 'proposta.docx', size: 10_000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(recusa).toContain('PDF');
    expect(recusa).toContain('imagem');
  });

  it('confere também a extensão — arquivo sem tipo informado pelo navegador não escapa', () => {
    expect(recusaDoAnexo({ name: 'planilha.xlsx', size: 10_000, type: '' })).not.toBeNull();
    expect(recusaDoAnexo({ name: 'orcamento.pdf', size: 10_000, type: '' })).toBeNull();
  });
});

describe('ehImagem', () => {
  it('separa imagem de PDF — é o que decide miniatura ou ícone', () => {
    expect(ehImagem('image/png')).toBe(true);
    expect(ehImagem('application/pdf')).toBe(false);
    expect(ehImagem(null)).toBe(false);
  });
});

describe('nomeDoAnexo', () => {
  it('tira o nome do fim do endereço, com os espaços de volta', () => {
    expect(nomeDoAnexo('https://exemplo.co/storage/v1/object/public/pedido-anexos/empresa-1/abc/Or%C3%A7amento%20final.pdf'))
      .toBe('Orçamento final.pdf');
  });
  it('endereço sem nome utilizável vira rótulo honesto', () => {
    expect(nomeDoAnexo('https://exemplo.co/storage/v1/object/public/pedido-anexos/')).toBe('anexo.pdf');
  });
});

describe('tamanhoLegivel', () => {
  it('escreve em MB e KB, no padrão brasileiro', () => {
    expect(tamanhoLegivel(2_516_582)).toBe('2,4 MB');
    expect(tamanhoLegivel(102_400)).toBe('100 KB');
  });
  it('sem tamanho, não inventa número', () => {
    expect(tamanhoLegivel(null)).toBe('');
    expect(tamanhoLegivel(0)).toBe('');
  });
});

describe('ordenarAnexos', () => {
  it('🔴 o mais novo em cima — é o desenho que o Lucas pediu', () => {
    const anexos = [
      { id: 'a', created_at: '2026-09-10T10:00:00Z' },
      { id: 'b', created_at: '2026-09-12T10:00:00Z' },
      { id: 'c', created_at: '2026-09-11T10:00:00Z' },
    ];
    expect(ordenarAnexos(anexos).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('resumoDaColunaDeAnexos', () => {
  it('um anexo: só ele, sem "+"', () => {
    expect(resumoDaColunaDeAnexos([{ nome: 'orcamento.pdf' }])).toEqual({ primeiro: { nome: 'orcamento.pdf' }, extras: 0 });
  });
  it('três anexos: o primeiro e mais dois', () => {
    const r = resumoDaColunaDeAnexos([{ nome: 'a.pdf' }, { nome: 'b.pdf' }, { nome: 'c.jpg' }]);
    expect(r.primeiro).toEqual({ nome: 'a.pdf' });
    expect(r.extras).toBe(2);
  });
  it('nenhum anexo: nada a mostrar', () => {
    expect(resumoDaColunaDeAnexos([])).toEqual({ primeiro: null, extras: 0 });
  });
});
