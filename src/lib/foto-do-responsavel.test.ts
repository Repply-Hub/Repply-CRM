import { describe, it, expect } from 'vitest';
import { fotoDoResponsavel } from './foto-do-responsavel';

// Dados inventados (CLAUDE.md §6.9): o repositório é público.
const VENDEDORES = [
  { nome: 'Ana Souza', avatar_url: 'http://exemplo/ana.png' },
  { nome: 'Bruno Lima', avatar_url: null },
];

describe('fotoDoResponsavel', () => {
  it('avatarUrl explícito manda, mesmo havendo um nome que casaria', () => {
    expect(fotoDoResponsavel('Ana Souza', 'http://exemplo/outra.png', VENDEDORES)).toBe('http://exemplo/outra.png');
  });

  it('avatarUrl explícito null NÃO cai na busca por nome (respeita a decisão de quem chamou)', () => {
    expect(fotoDoResponsavel('Ana Souza', null, VENDEDORES)).toBeNull();
  });

  it('sem avatarUrl, acha a foto pelo nome (sem acento na comparação de maiúsculas/minúsculas e espaços)', () => {
    expect(fotoDoResponsavel('ana souza', undefined, VENDEDORES)).toBe('http://exemplo/ana.png');
    expect(fotoDoResponsavel('  Ana Souza  ', undefined, VENDEDORES)).toBe('http://exemplo/ana.png');
  });

  it('nome que casa mas sem foto → null (cai nas iniciais)', () => {
    expect(fotoDoResponsavel('Bruno Lima', undefined, VENDEDORES)).toBeNull();
  });

  it('nome sem correspondente → null', () => {
    expect(fotoDoResponsavel('Carla Dias', undefined, VENDEDORES)).toBeNull();
  });

  it('sem nome → null', () => {
    expect(fotoDoResponsavel(null, undefined, VENDEDORES)).toBeNull();
    expect(fotoDoResponsavel(undefined, undefined, VENDEDORES)).toBeNull();
    expect(fotoDoResponsavel('', undefined, VENDEDORES)).toBeNull();
  });
});
