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
        .select('*, cliente:clientes(id, empresa, tipo), fabricante:fabricantes(id, nome), vendedor:usuarios(id, nome), obra:obras(id, nome_obra, endereco_entrega, spe_cnpj)')
        .eq('id', pedidoId!)
        .single();
      if (pErr) throw pErr;

      const { data: itens, error: iErr } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', pedidoId!)
        .order('descricao_material');
      if (iErr) throw iErr;

      return { pedido, itens };
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
  /** Valor de negociação digitado à mão. Ausente = deixa o valor por conta do gatilho
   * do banco (soma dos itens). Ver o passo 4 da mutação: precisa ser gravado DEPOIS
   * dos itens, senão `trg_recalcular_valor_total` sobrescreve. */
  valor_total?: number;
  itens: {
    id?: string;
    descricao_material: string;
    referencia_fabricante?: string;
    quantidade: number;
    unidade?: string;
    preco_unitario: number;
  }[];
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
        })
        .eq('id', payload.pedido_id);
      if (pedidoErr) throw pedidoErr;

      // 2. Upsert items: update existing (with id) and insert new ones (without id)
      const itensExistentes = payload.itens.filter(i => i.id);
      const itensNovos = payload.itens.filter(i => !i.id);

      if (itensExistentes.length > 0) {
        const { error: upsertErr } = await supabase.from('itens_pedido').upsert(
          itensExistentes.map(item => ({
            id: item.id!,
            pedido_id: payload.pedido_id,
            descricao_material: item.descricao_material,
            referencia_fabricante: item.referencia_fabricante || null,
            quantidade: item.quantidade,
            unidade: item.unidade || null,
            preco_unitario: item.preco_unitario,
          }))
        );
        if (upsertErr) throw upsertErr;
      }

      if (itensNovos.length > 0) {
        const { error: insertErr } = await supabase.from('itens_pedido').insert(
          itensNovos.map(item => ({
            pedido_id: payload.pedido_id,
            descricao_material: item.descricao_material,
            referencia_fabricante: item.referencia_fabricante || null,
            quantidade: item.quantidade,
            unidade: item.unidade || null,
            preco_unitario: item.preco_unitario,
          }))
        );
        if (insertErr) throw insertErr;
      }

      // 3. Delete only items that were removed (not present in payload)
      // Inserts/upserts above must succeed first — only then we remove old items
      const idsManutidos = payload.itens.filter(i => i.id).map(i => i.id!);
      const deleteQuery = supabase
        .from('itens_pedido')
        .delete()
        .eq('pedido_id', payload.pedido_id);

      const { error: delErr } = idsManutidos.length > 0
        ? await deleteQuery.not('id', 'in', `(${idsManutidos.join(',')})`)
        : await deleteQuery;
      if (delErr) throw delErr;

      // 4. Valor de negociação — gravado por último DE PROPÓSITO.
      // O gatilho `trg_recalcular_valor_total` (AFTER INSERT/UPDATE/DELETE em
      // itens_pedido) reescreve pedidos.valor_total com a soma dos itens. Se este
      // update fosse junto com o passo 1, os passos 2 e 3 o apagariam.
      //
      // LIMITE CONHECIDO: isso preserva o valor digitado em toda alteração feita por
      // esta tela e pelo cadastro novo — os únicos caminhos que hoje mexem em
      // itens_pedido. Se um dia surgir outro caminho que altere itens sem regravar o
      // valor, o gatilho volta a mandar. A alternativa seria uma coluna marcando
      // "valor digitado à mão" e um gatilho que a respeitasse; foi descartada por
      // exigir cirurgia num gatilho de que importação, kanban e painéis dependem.
      //
      // Sem `valor_total` no payload, nada é gravado aqui e o gatilho segue mandando.
      if (payload.valor_total !== undefined) {
        const { error: valorErr } = await supabase
          .from('pedidos')
          .update({ valor_total: payload.valor_total })
          .eq('id', payload.pedido_id);
        if (valorErr) throw valorErr;
      }

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
