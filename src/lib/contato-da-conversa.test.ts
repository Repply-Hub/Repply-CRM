import { describe, it, expect } from 'vitest';
import { sugestaoDeContato, telefoneParaCadastro, nomeParaCadastro } from './contato-da-conversa';

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
