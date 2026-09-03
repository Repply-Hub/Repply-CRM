import { describe, it, expect } from 'vitest';
import {
  extensaoBloqueada,
  validarSelecaoDeAnexos,
  mensagemDeRejeicao,
  TETO_TOTAL_ANEXOS_BYTES,
  MAX_ANEXOS,
} from './email-anexos';

/** File falso — só `name` e `size` importam para estas regras. */
function arquivo(name: string, size: number): File {
  return { name, size } as File;
}

describe('extensaoBloqueada', () => {
  it('barra executável e script', () => {
    expect(extensaoBloqueada('instalador.exe')).toBe(true);
    expect(extensaoBloqueada('macro.VBS')).toBe(true);
    expect(extensaoBloqueada('run.ps1')).toBe(true);
  });

  it('deixa passar documento, imagem e compactado', () => {
    expect(extensaoBloqueada('tabela-de-precos.pdf')).toBe(false);
    expect(extensaoBloqueada('foto obra.JPG')).toBe(false);
    expect(extensaoBloqueada('catalogo.zip')).toBe(false);
    expect(extensaoBloqueada('proposta.docx')).toBe(false);
  });

  it('pega extensão dupla disfarçada', () => {
    expect(extensaoBloqueada('orcamento.pdf.exe')).toBe(true);
  });
});

describe('validarSelecaoDeAnexos', () => {
  it('aceita arquivos comuns dentro do limite', () => {
    const r = validarSelecaoDeAnexos(
      [],
      [arquivo('a.pdf', 1_000_000), arquivo('b.png', 2_000_000)],
    );
    expect(r.aceitos.map((a) => a.name)).toEqual(['a.pdf', 'b.png']);
    expect(r.rejeitados).toEqual([]);
  });

  it('recusa executável com motivo', () => {
    const r = validarSelecaoDeAnexos([], [arquivo('virus.exe', 10)]);
    expect(r.aceitos).toEqual([]);
    expect(r.rejeitados[0]).toMatchObject({ nome: 'virus.exe', motivo: 'tipo de arquivo não permitido' });
  });

  it('recusa arquivo vazio', () => {
    const r = validarSelecaoDeAnexos([], [arquivo('vazio.pdf', 0)]);
    expect(r.aceitos).toEqual([]);
    expect(r.rejeitados[0].motivo).toBe('arquivo vazio');
  });

  it('para no teto de 20 MB contando o que já está anexado', () => {
    const jaAnexados = [{ nome_arquivo: 'grande.pdf', tamanho: TETO_TOTAL_ANEXOS_BYTES - 1_000_000 }];
    const r = validarSelecaoDeAnexos(jaAnexados, [
      arquivo('cabe.pdf', 500_000),
      arquivo('nao-cabe.pdf', 2_000_000),
    ]);
    expect(r.aceitos.map((a) => a.name)).toEqual(['cabe.pdf']);
    expect(r.rejeitados[0]).toMatchObject({ nome: 'nao-cabe.pdf' });
    expect(r.rejeitados[0].motivo).toContain('20 MB');
  });

  it('para na contagem máxima de anexos', () => {
    const jaAnexados = Array.from({ length: MAX_ANEXOS }, (_, i) => ({
      nome_arquivo: `f${i}.pdf`,
      tamanho: 10,
    }));
    const r = validarSelecaoDeAnexos(jaAnexados, [arquivo('mais-um.pdf', 10)]);
    expect(r.aceitos).toEqual([]);
    expect(r.rejeitados[0].motivo).toContain(String(MAX_ANEXOS));
  });
});

describe('mensagemDeRejeicao', () => {
  it('vazio quando nada foi recusado', () => {
    expect(mensagemDeRejeicao([])).toBe('');
  });

  it('frase única no singular', () => {
    expect(mensagemDeRejeicao([{ nome: 'x.exe', motivo: 'tipo de arquivo não permitido' }])).toBe(
      '"x.exe" não foi anexado: tipo de arquivo não permitido.',
    );
  });

  it('junta vários', () => {
    const msg = mensagemDeRejeicao([
      { nome: 'a.exe', motivo: 'tipo de arquivo não permitido' },
      { nome: 'b.pdf', motivo: 'arquivo vazio' },
    ]);
    expect(msg).toContain('2 arquivos');
    expect(msg).toContain('"a.exe"');
    expect(msg).toContain('"b.pdf"');
  });
});
