import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Catálogo global: todos os produtos, com nome do fabricante. */

/** Lista de categorias distintas existentes (para sugestão). */

/** Importação em lote para uma fabricante. */

/** Remove uma categoria: seta categoria=NULL em todos os produtos que a usam. */

/**
 * Campos que a tela de fabricante grava. `ativo` é o status "Ativa / Inativa": marca
 * inativa é aquela que a empresa não representa mais.
 *
 * 🔴 Inativa NÃO é excluída. A linha continua no banco, ligada aos negócios antigos, ao
 * faturamento histórico e aos relatórios — o que muda é a posição dela nas listas de
 * escolha (ver src/lib/ordem-de-fabricantes.ts). Quem quer remover de verdade usa
 * `useDeleteFabricante` abaixo, e aí o banco recusa se houver negócio apontando para ela.
 */
export interface DadosDeFabricante {
  nome?: string;
  cnpj?: string;
  nome_contato?: string;
  telefone?: string;
  ativo?: boolean;
}

/**
 * Cadastro de fabricante. Existe aqui, e não em `use-mutations.ts`, porque este é o
 * arquivo do domínio (§5.3 do CLAUDE.md) e porque a criação e a edição precisam aceitar
 * exatamente os mesmos campos — inclusive `ativo`.
 *
 * O banco já tem `default true` na coluna, então omitir `ativo` cadastra uma marca Ativa.
 */
export function useCreateFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: DadosDeFabricante) => {
      // 🔴 O `.select('id')` devolve a fábrica recém-criada, e isso é NECESSÁRIO: o
      // cadastro já permite acrescentar contatos, e eles só podem ser gravados depois que
      // a fábrica existe e tem identificador.
      //
      // De brinde, ele fecha uma recusa silenciosa: no PostgREST, gravação barrada por
      // regra de segurança NÃO devolve erro — atinge zero linhas e reporta sucesso. Sem a
      // conferência abaixo, a tela diria "Fabricante cadastrado!" com nada no banco.
      const { data: criado, error } = await supabase
        .from('fabricantes')
        .insert(data)
        .select('id')
        .single();
      if (error) throw error;
      if (!criado?.id) throw new Error('A regra de segurança do banco recusou o cadastro.');
      return criado.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
      qc.invalidateQueries({ queryKey: ['fabricantes_filtro'] });
    },
  });
}

export function useUpdateFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: DadosDeFabricante & { id: string }) => {
      const { error } = await supabase.from('fabricantes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
      // A consulta do Dashboard é uma SEGUNDA lista de fabricantes, com chave própria
      // (`fabricantes_filtro`) — ela alimenta o filtro do topo e o Plano de Vendas
      // inteiro. Sem invalidá-la, desativar uma marca não mexia em nenhum dos dois até
      // a página ser recarregada.
      qc.invalidateQueries({ queryKey: ['fabricantes_filtro'] });
    },
  });
}

export function useDeleteFabricante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('fabricantes')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // RLS bloqueia silenciosamente (0 linhas, sem erro) quando o usuário não tem permissão
      // de exclusão — sem essa checagem a UI reportaria sucesso com o registro intacto.
      if (!data || data.length === 0) {
        throw new Error(
          'Você não tem permissão para excluir este fabricante, ou o registro já não existe mais.',
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
      qc.invalidateQueries({ queryKey: ['fabricantes_filtro'] });
    },
  });
}
