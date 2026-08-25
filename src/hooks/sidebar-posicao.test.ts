import { describe, it, expect } from 'vitest';
import {
  inserirNaPosicaoDoPadrao,
  DEFAULT_SIDEBAR_ITEMS,
  type SidebarItem,
} from './use-sidebar-preferences';

/**
 * Onde um item NOVO do menu pousa para quem já tem menu salvo.
 *
 * Antes de 25/08/2026 a resposta era sempre "no fim", porque a mesclagem fazia
 * `[...saved, ...novos]`. O dono do produto pediu que "Hoje" ficasse entre Negócios e
 * Clientes — e "entre" não acontece quando o item cai no fim da lista.
 */

const item = (id: string): SidebarItem =>
  DEFAULT_SIDEBAR_ITEMS.find((d) => d.id === id) ?? {
    id,
    path: `/${id}`,
    label: id,
    icon: 'Link',
    visible: true,
  };

const ids = (lista: SidebarItem[]) => lista.map((i) => i.id);

describe('inserirNaPosicaoDoPadrao', () => {
  it('põe "hoje" entre Negócios e Clientes, e não no fim', () => {
    const salvo = [item('dashboard'), item('pipeline'), item('clientes'), item('obras')];
    const r = inserirNaPosicaoDoPadrao(salvo, [item('hoje')]);
    expect(ids(r)).toEqual(['dashboard', 'pipeline', 'hoje', 'clientes', 'obras']);
  });

  it('respeita a ordem que a pessoa escolheu, mexendo só no item novo', () => {
    // Menu embaralhado de propósito: quem arrumou o menu não pode ver ele se reorganizar.
    const salvo = [item('whatsapp'), item('clientes'), item('pipeline'), item('dashboard')];
    const r = inserirNaPosicaoDoPadrao(salvo, [item('hoje')]);
    // Entra depois de 'pipeline', que é o vizinho anterior mais próximo que ela tem.
    expect(ids(r)).toEqual(['whatsapp', 'clientes', 'pipeline', 'hoje', 'dashboard']);
  });

  it('sem nenhum vizinho anterior, entra no começo', () => {
    const salvo = [item('clientes'), item('obras')];
    const r = inserirNaPosicaoDoPadrao(salvo, [item('hoje')]);
    expect(ids(r)).toEqual(['hoje', 'clientes', 'obras']);
  });

  it('dois itens novos entram na ordem certa ENTRE SI', () => {
    const salvo = [item('dashboard'), item('clientes')];
    // 'pipeline' vem antes de 'hoje' no padrão; passados fora de ordem de propósito.
    const r = inserirNaPosicaoDoPadrao(salvo, [item('hoje'), item('pipeline')]);
    expect(ids(r)).toEqual(['dashboard', 'pipeline', 'hoje', 'clientes']);
  });

  it('item que não existe no padrão (atalho da empresa) vai para o fim', () => {
    const salvo = [item('dashboard'), item('pipeline')];
    const r = inserirNaPosicaoDoPadrao(salvo, [item('atalho_receita_rn')]);
    expect(ids(r)).toEqual(['dashboard', 'pipeline', 'atalho_receita_rn']);
  });

  it('nada novo, nada muda — nem a ordem, nem a identidade da lista', () => {
    const salvo = [item('dashboard'), item('pipeline')];
    expect(inserirNaPosicaoDoPadrao(salvo, [])).toBe(salvo);
  });

  it('não duplica nem perde item', () => {
    const salvo = DEFAULT_SIDEBAR_ITEMS.filter((d) => d.id !== 'hoje');
    const r = inserirNaPosicaoDoPadrao(salvo, [item('hoje')]);
    expect(r).toHaveLength(salvo.length + 1);
    expect(new Set(ids(r)).size).toBe(r.length);
  });
});
