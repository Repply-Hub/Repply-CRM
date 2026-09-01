import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidarPaineisDeNegocios } from './use-pedidos';

// Etapas em que o negócio já está encerrado (ganho ou perdido) e `prazo_resposta` deixa de
// ser "prazo" para virar a DATA DE FECHAMENTO — o dado que sustenta o Faturamento, o Plano
// de Vendas e as roscas do Dashboard.
const ETAPAS_FINAIS = ['fechamento', 'perdido'];

export function usePedidoCompleto(pedidoId: string | null) {
  return useQuery({
    queryKey: ['pedido_completo', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data: pedido, error: pErr } = await supabase
        .from('pedidos')
        // vendedor:usuarios!pedidos_vendedor_id_fkey — desambigua o embed depois que
        // pedido_responsaveis criou um 2º caminho pedidos↔usuarios (ver use-pedidos.ts).
        .select('*, cliente:clientes(id, empresa, tipo), fabricante:fabricantes(id, nome), vendedor:usuarios!pedidos_vendedor_id_fkey(id, nome), obra:obras(id, nome_obra, endereco_entrega, spe_cnpj)')
        .eq('id', pedidoId!)
        .single();
      if (pErr) throw pErr;

      // Sem buscar `itens_pedido`: o módulo de catálogo de produtos saiu em 26/08/2026 e a
      // tela de edição não mostra mais item nenhum. O valor do negócio vive em
      // `pedidos.valor_total` e vem no `select` acima.
      return { pedido };
    },
  });
}

export interface UpdatePedidoPayload {
  pedido_id: string;
  cliente_id: string;
  fabricante_id: string;
  usuario_id: string;
  obra_id?: string;
  status?: string;
  /** Nome customizado do negócio. Ausente/null = usar nome automático ("empresa | fabricante"). */
  nome?: string | null;
  marcador_id?: string | null;
  data_pedido: string;
  prazo_resposta?: string;
  origem_lead?: string;
  endereco_entrega?: string;
  observacoes?: string;
  pdf_url?: string;
  campos_extras?: Record<string, string>;
  /** Valor de negociação. Ausente = não mexe no que está gravado. */
  valor_total?: number;
}

export function useUpdatePedidoCompleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdatePedidoPayload) => {
      // A data de fechamento em branco NÃO vira `null` quando o negócio está numa etapa
      // final. Escrever `null` ali apagava a data de uma venda já registrada — e, depois da
      // migration 20260821120000, negócio ganho sem data some do Faturamento Total, do
      // Plano de Vendas e do Faturamento Mensal em silêncio. A rede de segurança do gatilho
      // (migration 20260821120100) impede o buraco, mas repõe a data de HOJE: uma venda de
      // junho trocaria de mês só por alguém ter salvado a ficha. Omitir o campo mantém o que
      // já está gravado, que é a única resposta certa.
      // Etapa aberta continua podendo limpar o campo — lá ele é prazo, não fechamento.
      // Sem `status` no payload não dá para saber em que etapa o negócio está; nesse caso o
      // campo também é omitido, porque apagar dado por engano não tem volta e deixar de
      // apagar tem.
      const emEtapaFinal = payload.status ? ETAPAS_FINAIS.includes(payload.status) : true;
      const prazoRespostaPatch = payload.prazo_resposta
        ? { prazo_resposta: payload.prazo_resposta }
        : (emEtapaFinal ? {} : { prazo_resposta: null });

      // 1. Update pedido metadata
      const { error: pedidoErr } = await supabase
        .from('pedidos')
        .update({
          cliente_id: payload.cliente_id,
          fabricante_id: payload.fabricante_id,
          usuario_id: payload.usuario_id,
          obra_id: payload.obra_id || null,
          nome: payload.nome || null,
          ...(payload.status ? { status: payload.status } : {}),
          marcador_id: payload.marcador_id || null,
          data_pedido: payload.data_pedido,
          ...prazoRespostaPatch,
          origem_lead: payload.origem_lead || null,
          endereco_entrega: payload.endereco_entrega || null,
          observacoes: payload.observacoes || null,
          ...(payload.pdf_url !== undefined ? { pdf_url: payload.pdf_url || null } : {}),
          ...(payload.campos_extras ? { campos_extras: payload.campos_extras } : {}),
          ...(payload.valor_total !== undefined ? { valor_total: payload.valor_total } : {}),
        })
        .eq('id', payload.pedido_id);
      if (pedidoErr) throw pedidoErr;

      // 🔴 NÃO existe mais passo de itens, e isso APAGOU UMA ARMADILHA.
      //
      // Até 26/08/2026 esta mutação tinha três passos a mais: gravar os itens, apagar os que
      // sumiram, e só ENTÃO gravar o valor. A ordem era obrigatória por causa do gatilho
      // `trg_recalcular_valor_total` (AFTER INSERT/UPDATE/DELETE em `itens_pedido`), que
      // reescreve `pedidos.valor_total` com a soma dos itens — gravar o valor antes fazia os
      // passos seguintes o apagarem.
      //
      // O catálogo de produtos saiu e esta tela não mexe mais em `itens_pedido`. Como o
      // gatilho só dispara por escrita naquela tabela, ele nunca mais roda por aqui, e o valor
      // pôde voltar para o passo 1, junto com o resto.
      //
      // ⚠️ O GATILHO CONTINUA EXISTINDO no banco, junto com a tabela e a 1 linha real que ela
      // guarda. Quem um dia voltar a escrever em `itens_pedido` reata a corrida — e vai
      // encontrar, ao apagar item, o valor do negócio virando a soma dos itens restantes.
      // Ver docs/operacao/catalogo-de-produtos-removido.md.

      return { id: payload.pedido_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedido_completo'] });
      // O valor e a etapa entram nos totais do funil e em todos os painéis; sem isso, o
      // número novo só aparecia lá depois de recarregar a página. A lista mora em
      // use-pedidos.ts para não existirem duas versões dela.
      invalidarPaineisDeNegocios(qc);
    },
  });
}
