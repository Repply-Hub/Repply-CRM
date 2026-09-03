import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { invalidarPaineisDeNegocios } from '@/hooks/use-pedidos';

/**
 * Os responsáveis de um negócio — todos no mesmo campo, com um marcado como principal.
 *
 * 🔴 O PRINCIPAL É QUEM LEVA O VALOR. Decisão do dono do produto, reconfirmada em 31/08/2026:
 * o dinheiro do negócio conta para UMA pessoa; os demais participam sem somar valor. É essa
 * decisão que deixa as oito consultas de dinheiro do sistema — Faturamento Total, Rendimento
 * por Responsável, Plano de Vendas e as outras — funcionando sem mudar uma linha.
 *
 * 🔴 NUNCA SOME `valor_total` JUNTANDO ESTA TABELA. Um negócio de R$ 100 mil com três
 * responsáveis vira R$ 300 mil num JOIN um-para-muitos, e o número fica plausível: ninguém
 * percebe olhando a tela. Esta tabela responde "QUEM participou", nunca "QUANTO".
 */

export interface ResponsavelDoNegocio {
  usuarioId: string;
  nome: string;
  avatarUrl: string | null;
  principal: boolean;
}

/** Quem responde por um negócio. O principal vem sempre primeiro. */
export function useResponsaveisDoNegocio(pedidoId: string | null | undefined) {
  return useQuery({
    queryKey: ['pedido_responsaveis', pedidoId],
    queryFn: async (): Promise<ResponsavelDoNegocio[]> => {
      const { data, error } = await supabase
        .from('pedido_responsaveis')
        .select('usuario_id, principal, usuarios:usuario_id(id, nome, avatar_url)')
        .eq('pedido_id', pedidoId!);
      if (error) throw error;

      type Linha = {
        usuario_id: string;
        principal: boolean;
        usuarios: { nome: string | null; avatar_url: string | null } | null;
      };

      return ((data ?? []) as unknown as Linha[])
        .map((l) => ({
          usuarioId: l.usuario_id,
          nome: l.usuarios?.nome ?? 'Sem nome',
          avatarUrl: l.usuarios?.avatar_url ?? null,
          principal: !!l.principal,
        }))
        // O principal primeiro, e o resto em ordem alfabética: a ordem de chegada não
        // significa nada para quem lê, e uma lista que muda de ordem sozinha confunde.
        .sort((a, b) =>
          a.principal === b.principal
            ? a.nome.localeCompare(b.nome, 'pt-BR')
            : Number(b.principal) - Number(a.principal),
        );
    },
    enabled: !!pedidoId,
    staleTime: 30_000,
  });
}

/**
 * 🔴 DUAS FAMÍLIAS DE INVALIDAÇÃO, e a diferença é dinheiro.
 *
 * Entrar e sair de participante não move valor nenhum: basta atualizar a lista e o "+N" da
 * tela de negócios. Trocar o PRINCIPAL move `pedidos.usuario_id` (pelo espelho do banco), e
 * com ele o Rendimento por Responsável, o Plano de Vendas e o Faturamento Mensal — aí é a
 * lista inteira de painéis.
 *
 * Invalidar tudo sempre seria mais simples e recarregaria oito painéis pesados a cada
 * participante acrescentado.
 */
function invalidarLista(qc: QueryClient) {
  // O PREFIXO, não a chave exata: além da lista deste negócio, existe o mapa de participantes
  // de todos os negócios (`use-participantes-dos-negocios.ts`), que alimenta o "+N" da lista,
  // o cartão do Kanban e a exportação. Invalidar só a chave exata deixaria o "+N" mostrando
  // número velho até a página ser recarregada.
  qc.invalidateQueries({ queryKey: ['pedido_responsaveis'] });
  qc.invalidateQueries({ queryKey: ['pedidos'] });
}

export function useAdicionarResponsavel(pedidoId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (usuarioId: string) => {
      // Entra sempre como participante. Virar principal é outro gesto, com outra regra —
      // ver `useDefinirPrincipal`.
      const { data, error } = await supabase
        .from('pedido_responsaveis')
        .insert({ pedido_id: pedidoId, usuario_id: usuarioId, principal: false })
        .select('usuario_id');
      if (error) throw error;

      // 🔴 A RECUSA DA REGRA DE SEGURANÇA NÃO DEVOLVE ERRO no INSERT filtrado: devolve
      // sucesso com zero linhas. Sem esta conferência a tela diria "responsável adicionado"
      // sobre uma gravação que não aconteceu.
      if (!data?.length) {
        throw new Error('Não foi possível adicionar: o banco não autorizou esta alteração.');
      }
    },
    onSuccess: () => {
      invalidarLista(qc);
      toast.success('Responsável adicionado.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível adicionar o responsável.')),
  });
}

export function useRemoverResponsavel(pedidoId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const { error } = await supabase
        .from('pedido_responsaveis')
        .delete()
        .eq('pedido_id', pedidoId)
        .eq('usuario_id', usuarioId);
      // O banco recusa remover o principal com uma frase pronta em português — ela chega
      // aqui e vai direto para a tela, sem tradução.
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarLista(qc);
      toast.success('Responsável removido.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível remover o responsável.')),
  });
}

/**
 * Passa a estrela — e com ela o valor do negócio.
 *
 * 🔴 PASSA PELA FUNÇÃO DE BANCO, e não por dois updates da tela. O banco proíbe dois
 * principais no mesmo negócio, então promover o novo ANTES de rebaixar o antigo é recusado.
 * A função faz a ordem certa numa chamada só; deixar isso na tela seria confiar que nenhuma
 * tela futura inverta os dois comandos.
 */
export function useDefinirPrincipal(pedidoId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const { error } = await supabase.rpc('definir_responsavel_principal', {
        p_pedido_id: pedidoId,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarLista(qc);
      // Aqui o dinheiro mudou de dono: todos os painéis que contam por responsável ficaram
      // velhos no mesmo instante.
      invalidarPaineisDeNegocios(qc);
      toast.success('Pronto — o valor deste negócio passa a contar para essa pessoa.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível trocar o responsável principal.')),
  });
}
