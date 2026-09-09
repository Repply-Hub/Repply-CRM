import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Clock, Factory, ChevronLeft, ChevronRight } from 'lucide-react';
import { PainelDoNegocio } from '@/components/pedidos/PainelDoNegocio';
import { useNegocioNoEndereco } from '@/hooks/use-negocio-no-endereco';
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
 *
 * 🔴 CLICAR NUM NEGÓCIO ABRE `PainelDoNegocio`, O MESMO DE TODAS AS TELAS — desde 09/09/2026
 * (achado 🟡 A3 da revisão do Plano A). Até aqui o clique fazia
 * `navigate('/pedidos/<id>/editar')`: fechava o painel da obra e jogava a pessoa no FORMULÁRIO
 * DE EDIÇÃO — o gesto que o Plano A tirou das outras três listas de negócios do sistema. Esta
 * era a quarta, e ficou de fora porque cada tarefa do plano mandava tocar um arquivo só.
 *
 * O cartão nunca prometeu "editar": ele mostra nome, valor, etapa, fabricante e responsável, sem
 * texto, `title` ou `aria-label` que fale em edição (conferido na tela em 09/09/2026). Quem
 * clica está lendo o histórico da obra — cair no formulário custa o painel aberto, a página da
 * lista e a rolagem, e voltar significa recomeçar. Editar continua a um clique: é o botão do
 * rodapé do próprio painel do negócio.
 *
 * O painel do negócio abre SOBRE o painel da obra — duas sobreposições empilhadas, o único lugar
 * do sistema onde isso acontece. Foi visto na tela antes de decidir: o de cima recebe o foco, o
 * de baixo continua montado por trás, e fechar o de cima devolve a obra exatamente como estava.
 */
export function VendasDaObra({ obraId }: { obraId: string }) {
  // O negócio aberto vive no ENDEREÇO (`?negocio=<id>`), igual às outras três telas. Aqui isso
  // tem um limite conhecido e aceito: a OBRA selecionada mora em estado de `Obras.tsx`, não no
  // endereço, então recarregar a página com `?negocio=` reabre o negócio sem o painel da obra
  // por trás. Não é regressão (antes recarregar caía no formulário de edição), e o conserto de
  // verdade seria pôr a obra no endereço também — outra tarefa, com as duas telas que hoje
  // mandam o id pelo `state` da navegação.
  const { negocioAberto, abrirNegocio, fecharNegocio } = useNegocioNoEndereco();
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
    <>
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
              // `n.id &&` pelo mesmo motivo da lista das fichas: `abrirNegocio` só sabe abrir um
              // id de verdade, e escrever `?negocio=` vazio deixaria o painel preso no estado
              // "este negócio não está mais disponível".
              onClick={() => n.id && abrirNegocio(n.id)}
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

    {/* O MESMO painel que a tela de Negócios, a pauta "Hoje" e as fichas de empresa e de contato
        abrem. Quem manda o id é o clique no cartão, via `?negocio=` no endereço.

        Nenhuma das três propriedades opcionais é passada, e por motivos que valem aqui:

        • `onExcluir` — excluir negócio pela ficha da obra não existe hoje e não foi pedido.
        • `negocioJaCarregado` — esta lista NÃO tem o negócio completo em mãos. Ela vem da RPC
          `obra_negocios`, que devolve um resumo (`ObraNegocio`: nome, cliente, fabricante e
          responsável já achatados em texto) e não um `PedidoWithRelations`. Sem a propriedade o
          painel busca por id sozinho — exatamente o caso para o qual `usePedidoPorId` existe.
        • `camposExtras` — a lista sai de `useTableSettings({ key: 'pedidos' })`, a preferência de
          colunas da TELA de Negócios; ver `camposExtras` em PainelDoNegocioProps. */}
    <PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />
    </>
  );
}
