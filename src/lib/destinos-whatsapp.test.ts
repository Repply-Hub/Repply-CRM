import { describe, it, expect } from 'vitest';
import { montarDestinos, filtrarDestinos, type ContatoCru, type ConversaCrua } from './destinos-whatsapp';

const CONTATOS: ContatoCru[] = [
  { id: 'c1', nome_contato: 'João Ribeiro', empresa: 'Construpav', telefone: '(84) 99988-7766' },
  { id: 'c2', nome_contato: 'Maria Alves', empresa: 'Ecomax', telefone: '84 3232-1010' },
];

const CONVERSAS: ConversaCrua[] = [
  { id: 'w1', nome_contato: 'João R.', telefone: '5584999887766', is_group: false },
  { id: 'w2', nome_contato: 'Obra Vila do Alto', telefone: '5511988345626-1425926780', is_group: true },
  { id: 'w3', nome_contato: null, telefone: '5584991112233', is_group: false },
];

describe('montarDestinos', () => {
  it('junta contatos e conversas numa lista só', () => {
    const r = montarDestinos(CONTATOS, CONVERSAS);
    expect(r.length).toBeGreaterThanOrEqual(4);
  });

  it('🔴 o telefone da CONVERSA vai LITERAL, com hífen e tudo', () => {
    // O identificador de grupo antigo tem hífen (`5511988345626-1425926780`). Qualquer limpeza
    // de não-dígitos monta um destino inexistente que o servidor aceita e não entrega — foi bug
    // silencioso por meses no Repply CRM.
    const r = montarDestinos([], CONVERSAS);
    const grupo = r.find((d) => d.ehGrupo);
    expect(grupo!.telefone).toBe('5511988345626-1425926780');
  });

  it('as conversas atribuídas vêm PRIMEIRO', () => {
    // É com elas que a pessoa está conversando agora; o catálogo de contatos é a busca fria.
    const r = montarDestinos(CONTATOS, CONVERSAS);
    expect(r[0].origem).toBe('conversa');
  });

  it('🔴 a mesma pessoa nos dois lugares aparece UMA vez só', () => {
    // João está como contato (84) 99988-7766 e como conversa 5584999887766. É a mesma pessoa:
    // mostrar duas linhas faria a pessoa mandar duas vezes achando que são clientes diferentes.
    const r = montarDestinos(CONTATOS, CONVERSAS);
    const joões = r.filter((d) => d.nome.toLowerCase().includes('joão'));
    expect(joões).toHaveLength(1);
  });

  it('ao juntar os dois, fica o que a CONVERSA sabe mandar e o que o CONTATO sabe nomear', () => {
    // O telefone tem que ser o da conversa (é o que já está aberto e funcionando), mas a empresa
    // só o cadastro tem — e é ela que diz de quem se trata.
    const r = montarDestinos(CONTATOS, CONVERSAS);
    const joao = r.find((d) => d.nome.toLowerCase().includes('joão'))!;
    expect(joao.telefone).toBe('5584999887766');
    expect(joao.detalhe).toContain('Construpav');
    expect(joao.contatoId).toBe('c1');
  });

  it('grupo é marcado como grupo', () => {
    const r = montarDestinos([], CONVERSAS);
    expect(r.find((d) => d.telefone.includes('-'))!.ehGrupo).toBe(true);
  });

  it('conversa sem nome ganha o telefone como nome, nunca fica em branco', () => {
    const r = montarDestinos([], [CONVERSAS[2]]);
    expect(r[0].nome.length).toBeGreaterThan(0);
  });

  it('contato sem telefone não entra — não há para onde mandar', () => {
    const r = montarDestinos([{ id: 'x', nome_contato: 'Sem Zap', empresa: null, telefone: null }], []);
    expect(r).toEqual([]);
  });

  it('🔴 a conversa carrega o ID DELA, senão não dá para abri-la depois', () => {
    // A caixa de entrada seleciona a conversa por `?conversaId=` (WhatsAppInbox.tsx:3876).
    // Um botão "ver na conversa" sem este id abre o WhatsApp na tela padrão, sem nada
    // acontecendo — como se o clique tivesse falhado.
    const r = montarDestinos(CONTATOS, CONVERSAS);
    const daConversa = r.find((d) => d.origem === 'conversa')!;
    expect(daConversa.conversaId).toBeTruthy();
  });

  it('contato do cadastro não inventa conversa que não existe', () => {
    // Ele pode nunca ter recebido mensagem: quem mandar é que cria a primeira conversa.
    const r = montarDestinos(CONTATOS, []);
    expect(r.every((d) => d.conversaId === null)).toBe(true);
  });

  it('cada linha tem chave própria, para a tela não embaralhar', () => {
    const r = montarDestinos(CONTATOS, CONVERSAS);
    expect(new Set(r.map((d) => d.chave)).size).toBe(r.length);
  });

  it('listas vazias devolvem lista vazia', () => {
    expect(montarDestinos([], [])).toEqual([]);
    expect(montarDestinos(undefined, undefined)).toEqual([]);
  });

  it('🔴 conversa e contato com telefones em FORMATOS diferentes ainda são a mesma pessoa', () => {
    // "(84) 99988-7766" e "5584999887766" só se reconhecem comparando os dígitos do fim.
    const r = montarDestinos(
      [{ id: 'z', nome_contato: 'Zé', empresa: 'ACME', telefone: '84 99988-7766' }],
      [{ id: 'w', nome_contato: 'Zé', telefone: '5584999887766', is_group: false }],
    );
    expect(r).toHaveLength(1);
  });
});

describe('filtrarDestinos', () => {
  const TODOS = montarDestinos(CONTATOS, CONVERSAS);

  it('busca vazia devolve tudo', () => {
    expect(filtrarDestinos(TODOS, '')).toHaveLength(TODOS.length);
  });

  it('acha pelo nome', () => {
    expect(filtrarDestinos(TODOS, 'maria')).toHaveLength(1);
  });

  it('acha pela empresa', () => {
    expect(filtrarDestinos(TODOS, 'ecomax')[0].nome).toContain('Maria');
  });

  it('acha pelo telefone, mesmo digitando só os dígitos', () => {
    // Quem busca digita "99988", não "(84) 99988-7766".
    expect(filtrarDestinos(TODOS, '99988').length).toBeGreaterThan(0);
  });

  it('não diferencia maiúscula de minúscula nem acento', () => {
    expect(filtrarDestinos(TODOS, 'JOAO').length).toBeGreaterThan(0);
  });

  it('busca sem resultado devolve vazio, não a lista toda', () => {
    expect(filtrarDestinos(TODOS, 'zzzznadaaqui')).toEqual([]);
  });
});
