import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import type { ContatoDaFabrica, FuncaoDaFabrica } from '@/lib/contatos-da-fabrica';

/**
 * Contatos e funções da fábrica.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 DUAS COISAS QUE TODA GRAVAÇÃO DAQUI FAZ, E QUE NÃO SÃO DECORAÇÃO
 * ---------------------------------------------------------------------------------
 *
 * 1. `.select('id')` no fim de todo INSERT/UPDATE/DELETE, com conferência do retorno.
 *
 *    No PostgREST, gravação recusada por regra de segurança **não devolve erro**: ela
 *    atinge zero linhas e reporta sucesso. Sem essa conferência, a tela diz "Contato
 *    removido" e o contato continua lá — é o item 47 da dívida técnica, o mesmo defeito
 *    que existe hoje em quatro telas do sistema.
 *
 * 2. `mensagemDeErro` no lugar de `e instanceof Error ? e.message : ...`.
 *
 *    Erro do Supabase NÃO é um `Error` — é objeto simples `{message, details, hint,
 *    code}`. Então `instanceof` dá FALSO justamente para os erros que interessam, e a
 *    tela cai numa frase genérica escondendo a explicação que o banco mandou junto
 *    (CLAUDE.md §4.6).
 */

export function useFabricanteContatos(fabricanteId: string | undefined) {
  return useQuery({
    queryKey: ['fabricante_contatos', fabricanteId],
    enabled: !!fabricanteId,
    queryFn: async (): Promise<ContatoDaFabrica[]> => {
      const { data, error } = await supabase
        .from('fabricante_contatos')
        .select('id, nome, telefone, email, observacao, principal, funcao_id')
        .eq('fabricante_id', fabricanteId!);
      if (error) throw error;
      return (data ?? []) as ContatoDaFabrica[];
    },
  });
}

/**
 * Os contatos de TODAS as fábricas, numa consulta só.
 *
 * Existe para o cartão da lista: uma consulta por cartão faria N consultas na abertura da
 * tela, e a MD tem 28 fábricas. A regra da casa é somar e buscar no banco, não no
 * navegador (CLAUDE.md §6.4).
 */
export function useContatosDeTodasAsFabricas() {
  return useQuery({
    queryKey: ['fabricante_contatos', 'todos'],
    queryFn: async (): Promise<(ContatoDaFabrica & { fabricante_id: string })[]> => {
      const { data, error } = await supabase
        .from('fabricante_contatos')
        .select('id, nome, telefone, email, observacao, principal, funcao_id, fabricante_id');
      if (error) throw error;
      return (data ?? []) as (ContatoDaFabrica & { fabricante_id: string })[];
    },
  });
}

export function useFabricanteFuncoes() {
  return useQuery({
    queryKey: ['fabricante_funcoes'],
    queryFn: async (): Promise<FuncaoDaFabrica[]> => {
      const { data, error } = await supabase
        .from('fabricante_funcoes')
        .select('id, nome, ordem')
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as FuncaoDaFabrica[];
    },
  });
}

export interface DadosDeContato {
  id?: string;
  fabricante_id: string;
  nome: string;
  funcao_id: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  principal?: boolean;
}

/** Invalida as duas leituras de contato: a da ficha e a da lista de cartões. */
function invalidarContatos(qc: ReturnType<typeof useQueryClient>, fabricanteId: string) {
  qc.invalidateQueries({ queryKey: ['fabricante_contatos', fabricanteId] });
  qc.invalidateQueries({ queryKey: ['fabricante_contatos', 'todos'] });
}

export function useSalvarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: DadosDeContato) => {
      const { id, ...campos } = dados;
      const q = id
        ? supabase.from('fabricante_contatos').update(campos).eq('id', id)
        : supabase.from('fabricante_contatos').insert(campos);
      const { data, error } = await q.select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa gravação.');
      }
      return data[0];
    },
    onSuccess: (_d, v) => invalidarContatos(qc, v.fabricante_id),
  });
}

export function useRemoverContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; fabricanteId: string }) => {
      const { data, error } = await supabase
        .from('fabricante_contatos')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa exclusão.');
      }
    },
    onSuccess: (_d, v) => invalidarContatos(qc, v.fabricanteId),
  });
}

/**
 * Grava a troca de principal.
 *
 * Recebe a lista pronta de `aoMarcarPrincipal`, que já inclui o DESMARQUE do anterior — o
 * banco recusa dois principais na mesma fábrica (índice único parcial).
 *
 * 🔴 As gravações vão EM SEQUÊNCIA e com o desmarque primeiro. Em paralelo, ou marcando
 * antes de desmarcar, a segunda bate no índice único no meio do caminho — mesmo que o
 * resultado final fosse válido.
 */
export function useMarcarPrincipal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mudancas,
    }: {
      mudancas: { id: string; principal: boolean }[];
      fabricanteId: string;
    }) => {
      const emOrdem = [...mudancas].sort(
        (a, b) => Number(a.principal) - Number(b.principal),
      );
      for (const m of emOrdem) {
        const { data, error } = await supabase
          .from('fabricante_contatos')
          .update({ principal: m.principal })
          .eq('id', m.id)
          .select('id');
        if (error) throw new Error(mensagemDeErro(error));
        if (!data || data.length === 0) {
          throw new Error('A regra de segurança do banco recusou essa gravação.');
        }
      }
    },
    onSuccess: (_d, v) => invalidarContatos(qc, v.fabricanteId),
  });
}

export function useSalvarFuncao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: {
      id?: string;
      nome: string;
      ordem: number;
      empresa_id: string;
    }) => {
      const { id, ...campos } = dados;
      const q = id
        ? supabase.from('fabricante_funcoes').update(campos).eq('id', id)
        : supabase.from('fabricante_funcoes').insert(campos);
      const { data, error } = await q.select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa gravação.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabricante_funcoes'] }),
  });
}

/**
 * Apagar a função NÃO apaga contato: a chave estrangeira é `ON DELETE SET NULL`, então os
 * contatos que a usavam ficam sem função. É recuperável em dois cliques; apagar o telefone
 * do pessoal da logística não seria.
 *
 * Por isso invalida também a leitura de contatos: o `funcao_id` deles acabou de virar nulo
 * no banco, e a tela precisa saber.
 */
export function useRemoverFuncao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('fabricante_funcoes')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa exclusão.');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricante_funcoes'] });
      qc.invalidateQueries({ queryKey: ['fabricante_contatos'] });
    },
  });
}
