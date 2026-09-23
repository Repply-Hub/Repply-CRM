import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * O QUE ESTE ARQUIVO PRENDE: que "Remover usuário" TIRE O ACESSO, e não só carimbe uma data
 * (item 38 da dívida técnica, parte 2).
 *
 * 🔴 POR QUE. Até 23/09/2026 o botão só gravava `deleted_at` na linha de `usuarios`. O login em
 * `auth.users` continuava vivo, e **não havia nenhuma chamada de revogação em todo o
 * repositório**. Medido naquele dia: uma pessoa removida em 11/09 ainda tinha login ativo,
 * sessão aberta e token de renovação válido.
 *
 * As migrations de 23/09 fecharam o BANCO. Mas **16 funções de servidor consultam `usuarios`
 * com chave de serviço e ignoram toda regra do banco** — enquanto o login viver, quem saiu
 * ainda manda WhatsApp em nome da empresa por esse caminho. Só a revogação fecha isso.
 *
 * 🔴 É UMA OPERAÇÃO SÓ, NO SERVIDOR — a lição do item 39. Carimbar a data aqui e revogar lá
 * seriam dois gestos: entre eles há sempre uma janela, e um que falhe deixa a pessoa "removida
 * na tela e com acesso" ou "sem acesso e ativa na tela". A função faz os dois ou nenhum.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

const chamadas: Array<{ nome: string; body: unknown }> = [];
let respostaDaFuncao: { data: unknown; error: unknown } = { data: { ok: true }, error: null };
const gravacoesDiretas: string[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: async (nome: string, opcoes: { body: unknown }) => {
        chamadas.push({ nome, body: opcoes?.body });
        return respostaDaFuncao;
      },
    },
    // 🔴 Se algum dia alguém "simplificar" e voltar a gravar direto na tabela, esta testemunha
    // acusa: a tela não pode mais tocar em `usuarios.deleted_at` por conta própria.
    from: (tabela: string) => {
      gravacoesDiretas.push(tabela);
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  },
}));

const avisos: Array<{ tipo: string; texto: string }> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (texto: string) => avisos.push({ tipo: 'ok', texto }),
    error: (texto: string) => avisos.push({ tipo: 'erro', texto }),
  },
}));

import { useRevogarAcesso, useDevolverAcesso } from './use-acesso-de-usuario';

function envolver() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  chamadas.length = 0;
  gravacoesDiretas.length = 0;
  avisos.length = 0;
  respostaDaFuncao = { data: { ok: true }, error: null };
});
afterEach(cleanup);

describe('useRevogarAcesso', () => {
  it('🔴 chama a função de servidor, e NÃO grava direto na tabela', async () => {
    const { result } = renderHook(() => useRevogarAcesso(), { wrapper: envolver() });

    await result.current.mutateAsync('usuario-1');

    expect(chamadas).toEqual([
      { nome: 'usuario-acesso', body: { acao: 'revogar', usuario_id: 'usuario-1' } },
    ]);
    expect(gravacoesDiretas).toEqual([]);
  });

  it('🔴 erro do servidor NÃO vira sucesso na tela', async () => {
    respostaDaFuncao = { data: null, error: { message: 'Forbidden' } };
    const { result } = renderHook(() => useRevogarAcesso(), { wrapper: envolver() });

    await expect(result.current.mutateAsync('usuario-1')).rejects.toBeTruthy();
    await waitFor(() => expect(avisos.some(a => a.tipo === 'erro')).toBe(true));
    expect(avisos.some(a => a.tipo === 'ok')).toBe(false);
  });
});

describe('useDevolverAcesso', () => {
  it('devolver o acesso é a mesma função, com a outra ação — nunca um caminho paralelo', async () => {
    const { result } = renderHook(() => useDevolverAcesso(), { wrapper: envolver() });

    await result.current.mutateAsync('usuario-1');

    expect(chamadas).toEqual([
      { nome: 'usuario-acesso', body: { acao: 'devolver', usuario_id: 'usuario-1' } },
    ]);
    expect(gravacoesDiretas).toEqual([]);
  });
});
