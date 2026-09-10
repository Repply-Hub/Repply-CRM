import { describe, it, expect } from 'vitest';
import { calcularAlteracoes, textoDoResumoDeAlteracoes, type NegocioAtual } from './alteracoes-por-codigo';

const ID = '3f2a8b91-0000-4000-8000-00000000000a';

function negocio(over: Partial<NegocioAtual> = {}): NegocioAtual {
  return {
    id: ID,
    nome: null,
    observacoes: null,
    marcador_id: null,
    marcadorNome: null,
    nomeAutomatico: 'Construtora Alfa | Portobello',
    rotulo: 'Construtora Alfa | Portobello',
    ...over,
  };
}

const atuais = (n: NegocioAtual) => new Map([[n.id, n]]);
const semMarcadores = new Map<string, string>();

describe('calcularAlteracoes — a regra do VAZIO', () => {
  it('célula vazia nunca apaga o que está no CRM', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: '', negocio: '   ', marcador: '' }],
      atuais(negocio({ observacoes: 'combinado por telefone', nome: 'Obra do Porto' })),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('campo ausente também não mexe', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID }],
      atuais(negocio({ observacoes: 'algo' })),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });
});

describe('calcularAlteracoes — a regra do NOME', () => {
  it('🔴 texto igual ao rótulo automático NÃO grava — é o que a exportação escreveu', () => {
    // Sem esta regra, reimportar uma exportação intocada congelaria "Cliente | Fabricante"
    // como nome próprio em 12.324 negócios (medido em 09/09/2026). Invisível na tela, e o
    // rótulo pararia de acompanhar uma renomeação de cliente.
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Construtora Alfa | Portobello' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('a comparação com o automático ignora espaço sobrando', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: '  Construtora Alfa | Portobello  ' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('nome vindo da planilha em caixa diferente do rótulo automático não vira alteração', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'CONSTRUTORA ALFA | PORTOBELLO' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('nome de verdade é gravado', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Obra do Porto — fachada' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios[0].alteracoes).toEqual([
      { campo: 'nome', de: 'Construtora Alfa | Portobello', para: 'Obra do Porto — fachada' },
    ]);
    expect(r.negocios[0].patch).toEqual({ nome: 'Obra do Porto — fachada' });
  });

  it('nome igual ao que já está gravado não vira alteração', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Obra do Porto' }],
      atuais(negocio({ nome: 'Obra do Porto' })),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });
});

describe('calcularAlteracoes — a regra do MARCADOR', () => {
  it('nome conhecido vira o identificador do marcador', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Urgente' }],
      atuais(negocio()),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios[0].patch).toEqual({ marcador_id: 'mk-1' });
    expect(r.porCampo.marcador_id).toBe(1);
  });

  it('🔴 nome desconhecido NÃO cria marcador — deixa como está e avisa', () => {
    // `resolveMarcadorId` cria quando não acha, e é assim que a linha NOVA funciona. No
    // caminho de atualização isso seria criar cadastro em silêncio (decisão 9 do desenho).
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Inventado' }],
      atuais(negocio()),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(0);
    expect(r.marcadoresDesconhecidos).toEqual(['Inventado']);
  });

  it('o mesmo marcador desconhecido aparece uma vez só na lista', () => {
    const outro = '3f2a8b91-0000-4000-8000-00000000000b';
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Inventado' }, { codigo: outro, marcador: 'inventado' }],
      new Map([[ID, negocio()], [outro, negocio({ id: outro })]]),
      semMarcadores,
    );
    expect(r.marcadoresDesconhecidos).toEqual(['Inventado']);
  });

  it('marcador que já é o do negócio não vira alteração', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Urgente' }],
      atuais(negocio({ marcador_id: 'mk-1' })),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('🔴 o de-para mostra o NOME do marcador de hoje, não o identificador interno', () => {
    // Sem este teste, `de` volta a receber `marcador_id` (algo como "mk-1") e a tela mostra
    // "mk-1 → Urgente" — que não diz nada a quem lê o aviso.
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Urgente' }],
      atuais(negocio({ marcador_id: 'mk-0', marcadorNome: 'Antigo' })),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios[0].alteracoes).toEqual([
      { campo: 'marcador_id', de: 'Antigo', para: 'Urgente' },
    ]);
  });
});

describe('calcularAlteracoes — o resumo', () => {
  it('conta por campo e junta as alterações do mesmo negócio num patch só', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova nota', marcador: 'Urgente' }],
      atuais(negocio({ observacoes: 'nota velha' })),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(1);
    expect(r.negocios[0].patch).toEqual({ observacoes: 'nova nota', marcador_id: 'mk-1' });
    expect(r.porCampo).toEqual({ nome: 0, observacoes: 1, marcador_id: 1 });
  });

  it('os três campos mudando juntos entram no mesmo patch e contam 1 cada um em porCampo', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Obra do Porto — fachada', observacoes: 'nova nota', marcador: 'Urgente' }],
      atuais(negocio({ observacoes: 'nota velha', marcador_id: 'mk-0', marcadorNome: 'Antigo' })),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(1);
    expect(r.negocios[0].patch).toEqual({
      nome: 'Obra do Porto — fachada',
      observacoes: 'nova nota',
      marcador_id: 'mk-1',
    });
    expect(r.porCampo).toEqual({ nome: 1, observacoes: 1, marcador_id: 1 });
  });

  it('linha cujo código não está no mapa é ignorada em silêncio', () => {
    // Não é erro: a Tarefa 2 já separou essas linhas em outro balde antes de chegar aqui.
    const r = calcularAlteracoes([{ codigo: 'sumiu', observacoes: 'x' }], new Map(), semMarcadores);
    expect(r.negocios).toHaveLength(0);
  });

  it('o rótulo do negócio acompanha, para a tela dizer de quem é a mudança', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova' }],
      atuais(negocio({ rotulo: 'Obra do Porto' })),
      semMarcadores,
    );
    expect(r.negocios[0].rotulo).toBe('Obra do Porto');
  });
});

describe('textoDoResumoDeAlteracoes — o aviso para a tela', () => {
  it('resumo vazio devolve lista vazia', () => {
    const r = calcularAlteracoes([], new Map(), semMarcadores);
    const frases = textoDoResumoDeAlteracoes(r);
    expect(frases).toHaveLength(0);
  });

  it('1 negócio no singular', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova nota' }],
      atuais(negocio()),
      semMarcadores,
    );
    const frases = textoDoResumoDeAlteracoes(r);
    expect(frases[0]).toContain('1 negócio será atualizado');
  });

  it('múltiplos negócios no plural', () => {
    const outro = '3f2a8b91-0000-4000-8000-00000000000b';
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nota 1' }, { codigo: outro, observacoes: 'nota 2' }],
      new Map([[ID, negocio()], [outro, negocio({ id: outro })]]),
      semMarcadores,
    );
    const frases = textoDoResumoDeAlteracoes(r);
    expect(frases[0]).toContain('2 negócios serão atualizados');
  });

  it('só os campos com contagem > 0 aparecem na frase', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova nota' }],
      atuais(negocio()),
      semMarcadores,
    );
    const frases = textoDoResumoDeAlteracoes(r);
    expect(frases[0]).toContain('1 em Observações');
    expect(frases[0]).not.toContain('no Marcador');
    expect(frases[0]).not.toContain('no nome');
  });

  it('frase dos marcadores desconhecidos aparece quando há algum', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Inventado' }],
      atuais(negocio()),
      semMarcadores,
    );
    const frases = textoDoResumoDeAlteracoes(r);
    expect(frases.length).toBe(1);
    expect(frases[0]).toContain('Marcador que não existe aqui');
    expect(frases[0]).toContain('"Inventado"');
  });

  it('frase dos marcadores desconhecidos não aparece quando não há nenhum', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova nota' }],
      atuais(negocio()),
      semMarcadores,
    );
    const frases = textoDoResumoDeAlteracoes(r);
    expect(frases.length).toBe(1);
    expect(frases[0]).not.toContain('Marcador que não existe');
  });
});
