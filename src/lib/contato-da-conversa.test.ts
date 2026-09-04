import { describe, it, expect } from 'vitest';
import {
  sugestaoDeContato,
  telefoneParaCadastro,
  nomeParaCadastro,
  chaveDeTelefone,
  chavesDeTelefone,
  contatosComMesmoTelefone,
} from './contato-da-conversa';

describe('telefoneParaCadastro', () => {
  it('celular com código do país vira o formato que a gente escreve', () => {
    expect(telefoneParaCadastro('5584999887766')).toBe('(84) 99988-7766');
  });

  it('celular sem código do país também', () => {
    expect(telefoneParaCadastro('84999887766')).toBe('(84) 99988-7766');
  });

  it('🔴 FIXO continua fixo — o nono dígito NÃO é forçado', () => {
    // Enfiar o 9 em qualquer número de 10 dígitos quebra os telefones fixos que têm WhatsApp.
    // Um cliente real, de fixo (84) 2030-0387, respondia por 100% das falhas de envio deste
    // sistema por causa disso (CLAUDE.md §7.1).
    expect(telefoneParaCadastro('558420300387')).toBe('(84) 2030-0387');
    expect(telefoneParaCadastro('8420300387')).toBe('(84) 2030-0387');
  });

  it('🔴 DDD 55 não perde os dois primeiros dígitos', () => {
    // O Rio Grande do Sul usa DDD 55, que é igual ao código do Brasil. Cortar sempre os dois
    // primeiros transformaria um número gaúcho válido em outro que não existe.
    expect(telefoneParaCadastro('55999887766')).toBe('(55) 99988-7766');
  });

  it('🔴 número ESTRANGEIRO não vira telefone brasileiro falso', () => {
    // `+1 415 555 0123` tem onze dígitos, o mesmo tanto de um celular daqui — a máscara o
    // transformava em `(14) 15555-0123`, um número plausível que não existe. Ninguém
    // desconfiaria olhando a ficha; o erro só apareceria quando alguém ligasse.
    expect(telefoneParaCadastro('+1 415 555 0123')).toBe('+1 415 555 0123');
    expect(telefoneParaCadastro('+351 912 345 678')).toBe('+351 912 345 678');
  });

  it('mas o brasileiro com + continua sendo formatado', () => {
    expect(telefoneParaCadastro('+55 84 99988-7766')).toBe('(84) 99988-7766');
  });

  it('número truncado volta como veio, sem pontuação inventada', () => {
    expect(telefoneParaCadastro('123')).toBe('123');
  });

  it('vazio e nulo não quebram', () => {
    expect(telefoneParaCadastro('')).toBe('');
    expect(telefoneParaCadastro(null)).toBe('');
    expect(telefoneParaCadastro(undefined)).toBe('');
  });
});

describe('nomeParaCadastro', () => {
  it('tira emoji e deixa o nome', () => {
    expect(nomeParaCadastro('🏗️ João Ribeiro')).toBe('João Ribeiro');
  });

  it('mantém acento, hífen e apóstrofo', () => {
    expect(nomeParaCadastro("José D'Ávila-Neto")).toBe("José D'Ávila-Neto");
  });

  it('junta os espaços que sobraram', () => {
    expect(nomeParaCadastro('  Ana   Maria  ')).toBe('Ana Maria');
  });

  it('nome que virou só pontuação não é nome', () => {
    expect(nomeParaCadastro('👍👍')).toBe('');
    expect(nomeParaCadastro('...')).toBe('');
  });

  it('vazio e nulo devolvem vazio', () => {
    expect(nomeParaCadastro(null)).toBe('');
    expect(nomeParaCadastro('')).toBe('');
  });
});

describe('sugestaoDeContato', () => {
  const conversa = {
    id: 'w1',
    nome_contato: '🏗️ João - Construpav',
    telefone: '5584999887766',
    is_group: false,
  };

  it('sugere nome limpo e telefone formatado', () => {
    const s = sugestaoDeContato(conversa);
    expect(s.impedimento).toBeNull();
    expect(s.nome).toBe('João - Construpav');
    expect(s.telefone).toBe('(84) 99988-7766');
  });

  it('🔴 GRUPO não vira contato', () => {
    // Grupo é um lugar com várias pessoas dentro. Cadastrá-lo criaria uma ficha com um
    // identificador de grupo no campo de telefone, e quem ligasse para esse "telefone"
    // descobriria que ele não existe.
    const s = sugestaoDeContato({ ...conversa, is_group: true });
    expect(s.impedimento).toContain('grupo');
  });

  it('🔴 identificador de grupo ANTIGO também é barrado, mesmo sem a marca', () => {
    // O formato legado tem hífen (`5511988345626-1425926780`) e nem sempre traz `is_group`.
    const s = sugestaoDeContato({
      id: 'w2',
      nome_contato: 'Obra Vila do Alto',
      telefone: '5511988345626-1425926780',
    });
    expect(s.impedimento).toContain('grupo');
  });

  it('o formato moderno de grupo (@g.us) também', () => {
    const s = sugestaoDeContato({ id: 'w3', nome_contato: 'Equipe', telefone: '1203630@g.us' });
    expect(s.impedimento).toContain('grupo');
  });

  it('conversa que já tem contato não oferece criar de novo', () => {
    const s = sugestaoDeContato({ ...conversa, contato_id: 'c1' });
    expect(s.impedimento).toContain('já está ligada');
  });

  it('conversa sem número não dá para cadastrar', () => {
    const s = sugestaoDeContato({ id: 'w4', nome_contato: 'Alguém', telefone: '' });
    expect(s.impedimento).toContain('sem número');
  });

  it('conversa sem nome sugere telefone e deixa o nome em branco', () => {
    // Em branco é honesto: quem cadastra escreve o nome. Inventar "Contato 84999..." criaria
    // uma ficha com nome de máquina que ninguém corrige depois.
    const s = sugestaoDeContato({ ...conversa, nome_contato: null });
    expect(s.impedimento).toBeNull();
    expect(s.nome).toBe('');
    expect(s.telefone).toBe('(84) 99988-7766');
  });

  it('conversa nula não quebra', () => {
    expect(sugestaoDeContato(null).impedimento).toBeTruthy();
    expect(sugestaoDeContato(undefined).impedimento).toBeTruthy();
  });
});


describe('chaveDeTelefone', () => {
  it('o mesmo número em três formatos dá a MESMA chave — é o ponto do arquivo', () => {
    const doWhatsApp = chaveDeTelefone('5584999887766');
    expect(chaveDeTelefone('(84) 99988-7766')).toBe(doWhatsApp);
    expect(chaveDeTelefone('84 99988-7766')).toBe(doWhatsApp);
    expect(chaveDeTelefone('+55 84 99988-7766')).toBe(doWhatsApp);
  });

  it('🔴 o nono dígito não separa a mesma pessoa: cadastro antigo casa com o número novo', () => {
    // A ficha foi criada antes do nono dígito; o WhatsApp reporta com ele.
    expect(chaveDeTelefone('84 9988-7766')).toBe(chaveDeTelefone('5584999887766'));
  });

  it('🔴 DDD diferente com o mesmo final NÃO casa — foi por isso que o DDD entrou na chave', () => {
    expect(chaveDeTelefone('5584999887766')).not.toBe(chaveDeTelefone('5511999887766'));
  });

  it('🔴 fixo com WhatsApp continua funcionando, e não ganha nono dígito', () => {
    expect(chaveDeTelefone('8420300387')).toBe('8420300387');
    expect(chaveDeTelefone('(84) 2030-0387')).toBe('8420300387');
  });

  it('🔴 DDD 55 (Rio Grande do Sul) não perde os dois primeiros dígitos', () => {
    // 5599887766 tem 10 dígitos: é DDD 55 + número, não código de país.
    expect(chaveDeTelefone('5599887766')).toBe('5599887766');
  });

  it('estrangeiro não entra na comparação', () => {
    expect(chaveDeTelefone('+1 415 555 0123')).toBeNull();
    expect(chaveDeTelefone('+351 912 345 678')).toBeNull();
  });

  it('🔴 identificador de grupo nunca vira chave', () => {
    expect(chaveDeTelefone('120363123456789@g.us')).toBeNull();
    expect(chaveDeTelefone('5584999887766-1614508733')).toBeNull();
  });

  it('vazio, curto ou sem dígito devolve nulo', () => {
    expect(chaveDeTelefone('')).toBeNull();
    expect(chaveDeTelefone(null)).toBeNull();
    expect(chaveDeTelefone(undefined)).toBeNull();
    expect(chaveDeTelefone('99887766')).toBeNull();
    expect(chaveDeTelefone('sem número')).toBeNull();
  });
});

describe('contatosComMesmoTelefone', () => {
  const contatos = [
    { id: 'a', nome_contato: 'Lucas Dutra - Macam Empreendimentos', telefone: '(84) 99988-7766' },
    { id: 'b', nome_contato: 'Outra pessoa', telefone: '(11) 99988-7766' },
    { id: 'c', nome_contato: 'Sem telefone', telefone: null },
  ];

  it('acha quem já está cadastrado, mesmo com o número em outro formato', () => {
    const achados = contatosComMesmoTelefone('5584999887766', contatos);
    expect(achados.map((c) => c.id)).toEqual(['a']);
  });

  it('🔴 devolve TODOS os casamentos: 44 telefones desta base estão repetidos entre contatos', () => {
    const repetidos = [
      { id: 'a', nome_contato: 'João da obra', telefone: '(84) 99988-7766' },
      { id: 'b', nome_contato: 'Recepção da construtora', telefone: '84999887766' },
    ];
    expect(contatosComMesmoTelefone('5584999887766', repetidos)).toHaveLength(2);
  });

  it('🔴 não casa por engano quando só o final bate', () => {
    expect(contatosComMesmoTelefone('5511999887766', contatos).map((c) => c.id)).toEqual(['b']);
  });

  it('grupo não casa com ninguém', () => {
    expect(contatosComMesmoTelefone('120363123456789@g.us', contatos)).toEqual([]);
  });

  it('lista vazia, nula ou telefone ausente não quebram', () => {
    expect(contatosComMesmoTelefone('5584999887766', [])).toEqual([]);
    expect(contatosComMesmoTelefone('5584999887766', null)).toEqual([]);
    expect(contatosComMesmoTelefone(null, contatos)).toEqual([]);
  });
});

describe('chavesDeTelefone — o campo com mais de um número', () => {
  it('🔴 quebra o campo com dois números; antes ele devolvia NADA', () => {
    // Caso real da base: 79 contatos guardam mais de um número no mesmo campo. Como
    // `chaveDeTelefone` junta todos os dígitos, isso virava 25 dígitos e caía no portão dos
    // 11 — o mesmo portão que barra identificador de grupo. Resultado: contato invisível.
    const campo = '5511996763986, 551196763986';
    expect(chaveDeTelefone(campo)).toBeNull();
    expect(chavesDeTelefone(campo)).toEqual(['1196763986']);
  });

  it('devolve as duas chaves quando os números são de verdade diferentes', () => {
    expect(chavesDeTelefone('(84) 99988-7766 / (84) 3220-0008')).toEqual([
      '8499887766',
      '8432200008',
    ]);
  });

  it('aceita ponto-e-vírgula e barra como separador', () => {
    expect(chavesDeTelefone('84999887766; 8432200008')).toHaveLength(2);
    expect(chavesDeTelefone('84999887766 / 8432200008')).toHaveLength(2);
  });

  it('🔴 NÃO quebra em hífen — o identificador antigo de grupo tem hífen', () => {
    // Quebrar aqui inventaria números que não existem (CLAUDE.md §7.2).
    expect(chavesDeTelefone('120363123456789-1616161616')).toEqual([]);
  });

  it('não repete a mesma chave quando o campo traz o número duas vezes', () => {
    // É o formato mais comum dos 79: o mesmo número com e sem o nono dígito.
    expect(chavesDeTelefone('5584999887766, 558499887766')).toEqual(['8499887766']);
  });

  it('campo vazio, nulo ou só lixo devolve lista vazia', () => {
    expect(chavesDeTelefone('')).toEqual([]);
    expect(chavesDeTelefone(null)).toEqual([]);
    expect(chavesDeTelefone('abc, def')).toEqual([]);
  });
});

describe('contatosComMesmoTelefone — com o campo de vários números', () => {
  it('🔴 acha o contato pelo SEGUNDO número do campo dele', () => {
    const contatos = [
      { id: 'c1', nome_contato: 'Fixo e celular', telefone: '(84) 3220-0008, (84) 99988-7766' },
    ];
    // A conversa chega pelo celular; o cadastro tem o fixo primeiro.
    expect(contatosComMesmoTelefone('5584999887766', contatos).map((c) => c.id)).toEqual(['c1']);
    // E também pelo fixo.
    expect(contatosComMesmoTelefone('558432200008', contatos).map((c) => c.id)).toEqual(['c1']);
  });

  it('não casa com número que não está no campo', () => {
    const contatos = [
      { id: 'c1', nome_contato: 'Fixo e celular', telefone: '(84) 3220-0008, (84) 99988-7766' },
    ];
    expect(contatosComMesmoTelefone('5584911112222', contatos)).toEqual([]);
  });
});
