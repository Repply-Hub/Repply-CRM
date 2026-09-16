import { describe, it, expect } from 'vitest';
import { parseEnderecos, enderecoPareceValido } from './enderecos-email';

describe('parseEnderecos', () => {
  it('um endereço só', () => {
    expect(parseEnderecos('ana@exemplo.com')).toEqual(['ana@exemplo.com']);
  });

  it('vários separados por vírgula', () => {
    expect(parseEnderecos('ana@exemplo.com,bruno@exemplo.com')).toEqual([
      'ana@exemplo.com',
      'bruno@exemplo.com',
    ]);
  });

  it('vários separados por ponto-e-vírgula', () => {
    expect(parseEnderecos('ana@exemplo.com;bruno@exemplo.com')).toEqual([
      'ana@exemplo.com',
      'bruno@exemplo.com',
    ]);
  });

  it('apara espaço sobrando ao redor de cada endereço', () => {
    expect(parseEnderecos('  ana@exemplo.com  ,  bruno@exemplo.com  ')).toEqual([
      'ana@exemplo.com',
      'bruno@exemplo.com',
    ]);
  });

  it('descarta vazio quando o separador aparece no fim', () => {
    expect(parseEnderecos('ana@exemplo.com,')).toEqual(['ana@exemplo.com']);
    expect(parseEnderecos('ana@exemplo.com;')).toEqual(['ana@exemplo.com']);
  });

  it('remove duplicado comparando o endereço sem diferenciar maiúsculas', () => {
    expect(parseEnderecos('ana@exemplo.com,Ana@Exemplo.com')).toEqual([
      'ana@exemplo.com',
    ]);
  });

  it('preserva a forma "Nome <email>" e ainda detecta duplicado por dentro dela', () => {
    expect(
      parseEnderecos('Ana Souza <ana@exemplo.com>, ANA@EXEMPLO.COM'),
    ).toEqual(['Ana Souza <ana@exemplo.com>']);
  });

  it('mistura os dois separadores na mesma string', () => {
    expect(parseEnderecos('ana@exemplo.com; bruno@exemplo.com, carla@exemplo.com')).toEqual([
      'ana@exemplo.com',
      'bruno@exemplo.com',
      'carla@exemplo.com',
    ]);
  });

  it('string vazia devolve lista vazia', () => {
    expect(parseEnderecos('')).toEqual([]);
  });

  it('string só com espaço ou separador devolve lista vazia', () => {
    expect(parseEnderecos('   ')).toEqual([]);
    expect(parseEnderecos(' , ; ,')).toEqual([]);
  });
});

describe('enderecoPareceValido', () => {
  it('aceita endereço simples', () => {
    expect(enderecoPareceValido('ana@exemplo.com')).toBe(true);
  });

  it('aceita a forma "Nome <email>"', () => {
    expect(enderecoPareceValido('Ana Souza <ana@exemplo.com>')).toBe(true);
  });

  it('recusa sem "@"', () => {
    expect(enderecoPareceValido('ana.exemplo.com')).toBe(false);
  });

  it('recusa "@" sem nada antes', () => {
    expect(enderecoPareceValido('@exemplo.com')).toBe(false);
  });

  it('recusa sem ponto depois do "@"', () => {
    expect(enderecoPareceValido('ana@exemplocom')).toBe(false);
  });

  it('recusa string vazia', () => {
    expect(enderecoPareceValido('')).toBe(false);
  });
});
