import type { PedidoWithRelations } from '@/hooks/use-pedidos';
import type { Order } from '@/types';

/** Converte um pedido (linha crua do banco) no formato leve usado pelos cards do Kanban. */
export function mapPedidoToOrder(p: PedidoWithRelations): Order {
  return {
    id: p.id,
    clientName: p.cliente?.empresa ?? 'Sem cliente',
    obra: p.obra?.nome_obra ?? '-',
    fabricante: p.fabricante?.nome ?? '-',
    valor: p.valor_total ?? 0,
    stage: p.status as Order['stage'],
    daysInStage: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000),
    alertDays: 7,
    vendedor: p.vendedor?.nome ?? '-',
    createdAt: p.data_pedido,
    campos_extras: p.campos_extras || {},
  };
}
