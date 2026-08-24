import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Clock, Factory, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatarMoedaBRL } from '@/lib/moeda';
import {
  useObraVendas, useObraFabricantes, useObraNegocios, NEGOCIOS_POR_PAGINA,
} from '@/hooks/use-obra-vendas';

/**
 * O que foi vendido para uma obra, dentro do painel lateral dela.
 *
 * DOIS NÚMEROS, NÃO UM (decisão do dono do produto em 24/08/2026). Um "vendido" único seria
 * ambíguo dos dois jeitos: somar tudo faz orçamento em negociação parecer venda — e o número
 * CAI no dia em que ele vira perdido —, e somar só o ganho esconde a oportunidade de pé.
 *
 * O perdido não ganha cartão: ele aparece como uma linha discreta embaixo. É informação útil
 * para quem procura, e ruído para quem só quer saber quanto entrou.
 *
 * Fica no painel lateral, e não numa tela própria, porque `/obras/:id` NÃO existe como rota:
 * os dois caminhos que abrem uma obra passam o id pelo `state` da navegação
 * (`Negocios.tsx:2095`, `ClienteDetalhe.tsx:1124`). Criar a rota sem ajustar os dois deixaria
 * duas formas de navegar convivendo.
 */
export function VendasDaObra({ obraId }: { obraId: string }) {
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);

  const { data: vendas, isLoading: carregandoVendas } = useObraVendas(obraId);
  const { data: fabricantes = [] } = useObraFabricantes(obraId);
  const { data: negocios, isFetching } = useObraNegocios(obraId, pagina);

  if (carregandoVendas) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando as vendas...
      </div>
    );
  }

  // Obra sem negócio nenhum é o caso NORMAL de uma obra recém-cadastrada, não um erro. E vai
  // ser o caso de toda obra por um tempo: nenhum dos 11.911 negócios importados tem obra
  // vinculada — a importação grava a obra como texto no endereço de entrega, nunca como
  // vínculo. Por isso a frase explica o porquê em vez de só dizer "nada aqui".
  if (!vendas || vendas.total_qtd === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Nenhum negócio ligado a esta obra</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ao criar ou editar um negócio, escolha esta obra no campo <strong>Obra</strong> para
          ele aparecer aqui. Os negócios que vieram da importação não têm obra vinculada — a
          planilha trazia a obra como texto no endereço de entrega.
        </p>
      </div>
    );
  }

  const totalPaginas = Math.max(1, Math.ceil((negocios?.total ?? 0) / NEGOCIOS_POR_PAGINA));

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------------- os dois números */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-kanban-closed" />
            Ganho
          </p>
          <p className="mt-1 font-mono text-lg font-semibold leading-tight">
            {formatarMoedaBRL(vendas.ganho_valor)}
          </p>
          <p className="text-xs text-muted-foreground">
            {vendas.ganho_qtd} negócio{vendas.ganho_qtd === 1 ? '' : 's'} fechado
            {vendas.ganho_qtd === 1 ? '' : 's'}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-kanban-negotiation" />
            Em aberto
          </p>
          <p className="mt-1 font-mono text-lg font-semibold leading-tight">
            {formatarMoedaBRL(vendas.aberto_valor)}
          </p>
          <p className="text-xs text-muted-foreground">
            {vendas.aberto_qtd} ainda em negociação
          </p>
        </div>
      </div>

      {vendas.perdido_qtd > 0 && (
        <p className="text-xs text-muted-foreground">
          E {vendas.perdido_qtd} negócio{vendas.perdido_qtd === 1 ? '' : 's'} perdido
          {vendas.perdido_qtd === 1 ? '' : 's'}, somando{' '}
          <span className="font-mono">{formatarMoedaBRL(vendas.perdido_valor)}</span>.
        </p>
      )}

      {/* ---------------------------------------------------------------- as representadas */}
      {fabricantes.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Factory className="h-3.5 w-3.5" />
            Representadas nesta obra
          </p>
          <div className="space-y-1">
            {fabricantes.map((f) => (
              <div
                key={f.fabricante_id ?? f.fabricante_nome}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate">{f.fabricante_nome}</span>
                <span className="shrink-0 font-mono text-xs">
                  {formatarMoedaBRL(f.ganho_valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- a lista */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Negócios ({negocios?.total ?? 0})
        </p>

        <div className="space-y-1">
          {(negocios?.linhas ?? []).map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(`/pedidos/${n.id}/editar`)}
              className="w-full rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex items-center justify-between gap-2">
                {/* `pedidos.nome` é nulo em praticamente toda a base — o negócio é
                    identificado pelo cliente, que é o que a pessoa reconhece. */}
                <span className="min-w-0 truncate text-sm font-medium">
                  {n.negocio_nome || n.cliente_nome || 'Negócio sem nome'}
                </span>
                <span className="shrink-0 font-mono text-sm">
                  {formatarMoedaBRL(n.valor_total)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  variant={n.status === 'fechamento' ? 'default' : 'outline'}
                  className="text-[10px]"
                >
                  {n.etapa_nome}
                </Badge>
                {n.fabricante_nome && <span className="truncate">{n.fabricante_nome}</span>}
                {n.responsavel && <span className="truncate">· {n.responsavel}</span>}
              </div>
            </button>
          ))}
        </div>

        {totalPaginas > 1 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={pagina <= 1 || isFetching}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {pagina} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={pagina >= totalPaginas || isFetching}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
