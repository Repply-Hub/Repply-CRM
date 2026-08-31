import { describe, it, expect } from 'vitest';
import { SECOES, SECOES_DESLIGAVEIS, secaoDaRota, type SecaoId } from './secoes';

/**
 * POR QUE ESTE ARQUIVO EXISTE: o projeto tinha DUAS listas de módulos que não batiam —
 * DEFAULT_SIDEBAR_ITEMS (15 ids, com os 3 de admin) e MODULOS (13 chaves, com `contatos`
 * e `pedidos` que o menu não tem). O controle de acesso por empresa precisava de uma
 * lista; criar a terceira criaria a terceira verdade.
 *
 * Estes testes fixam que a lista nova É a verdade e que ela conversa com as duas antigas.
 */
describe('SECOES', () => {
  it('não tem id repetido', () => {
    const ids = SECOES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tem exatamente 9 seções desligáveis', () => {
    // 'hoje' (a pauta do dia) entrou em 24/08/2026. Este teste é o que obriga quem
    // acrescenta seção a passar por aqui — foi ele que pegou a adição.
    expect(SECOES_DESLIGAVEIS.map((s) => s.id).sort()).toEqual(
      ['calendario', 'chat', 'dashboard', 'emails', 'hoje', 'obras', 'portal', 'tarefas', 'whatsapp'],
    );
  });

  it('marca como NÃO desligável o núcleo que o banco exige', () => {
    // pedidos.cliente_id e pedidos.fabricante_id são NOT NULL (11.909 de 11.909
    // preenchidos), e /app é a home autenticada. Desligar qualquer uma quebra o produto.
    for (const id of ['clientes', 'pipeline', 'fabricantes', 'configuracoes'] as SecaoId[]) {
      expect(SECOES.find((s) => s.id === id)?.desligavel).toBe(false);
    }
  });

  it('toda seção tem rota começando com barra', () => {
    for (const s of SECOES) expect(s.rota.startsWith('/')).toBe(true);
  });

  it('acha a seção pela rota exata', () => {
    expect(secaoDaRota('/portal')?.id).toBe('portal');
    expect(secaoDaRota('/obras')?.id).toBe('obras');
  });

  it('acha a seção por rota filha — detalhe de cliente conta como clientes', () => {
    expect(secaoDaRota('/clientes/acme-123')?.id).toBe('clientes');
  });

  it('devolve null para rota que não pertence a seção nenhuma', () => {
    expect(secaoDaRota('/login')).toBeNull();
    expect(secaoDaRota('/assinar')).toBeNull();
  });

  it('não confunde prefixo parecido', () => {
    // '/portalzinho' não é '/portal'. Sem esta regra, uma rota futura com nome parecido
    // herdaria a trava da seção errada.
    expect(secaoDaRota('/portalzinho')).toBeNull();
  });

  it('não bloqueia as telas de admin', () => {
    // A tela de admin de seções não pode se auto-bloquear.
    expect(secaoDaRota('/admin/empresas')).toBeNull();
    expect(secaoDaRota('/admin/secoes')).toBeNull();
  });

  it('cobre as rotas SEM item de menu, que uma guarda por menu deixaria passar', () => {
    expect(secaoDaRota('/pedidos/novo')?.id).toBe('pipeline');
    expect(secaoDaRota('/pedidos/abc/editar')?.id).toBe('pipeline');
    expect(secaoDaRota('/contatos/joao-1')?.id).toBe('clientes');
  });

  it('toda seção aponta para pelo menos um módulo da matriz de permissões', () => {
    // Se uma seção for desligada, a linha dela precisa sumir da matriz por usuário.
    for (const s of SECOES) expect(s.modulosPermissao.length).toBeGreaterThan(0);
  });
});
