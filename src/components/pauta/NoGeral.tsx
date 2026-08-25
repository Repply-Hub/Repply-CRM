import { AlertTriangle, CalendarX, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoedaBRL } from '@/lib/moeda';
import { useDashboardNegociosRisco } from '@/hooks/use-dashboard';

/**
 * "No geral" — o panorama da empresa, embaixo da pauta pessoal.
 *
 * A pauta acima responde "o que EU faço agora". Este bloco responde "como está a carteira",
 * e vem depois de propósito: primeiro o que dá para resolver hoje, depois o tamanho do
 * problema.
 *
 * 🔴 USA O MESMO CORTE DE DIAS QUE A PAUTA, e isso é o ponto.
 *
 * O Dashboard mostra o mesmo radar com corte fixo de 7 dias. Se este bloco também usasse 7
 * enquanto a pauta usa o que o gestor configurou, a MESMA TELA mostraria dois números para
 * "negócios parados" — e ninguém confiaria em nenhum dos dois. Recebendo `diasParado` de
 * quem chama, o número daqui é o mesmo que produziu a lista de cima.
 *
 * Versão compacta de propósito: os gráficos do Dashboard vivem dentro de um componente de
 * 500+ linhas e trazem Recharts inteiro. Aqui a informação é contexto, não o assunto — barra
 * simples entrega o mesmo recado sem pesar a tela que a pessoa abre todo dia.
 */

interface Props {
  empresaId?: string;
  /** O mesmo valor que a pauta usou. Sem isso os números da tela divergem entre si. */
  diasParado: number;
}

function Barras({
  titulo,
  descricao,
  dados,
}: {
  titulo: string;
  descricao: string;
  dados: { rotulo: string; valor: number }[];
}) {
  if (dados.length === 0) return null;
  // Escala relativa ao maior: barra cheia significa "o pior deste recorte", não um teto
  // absoluto que não existe.
  const maior = Math.max(...dados.map((d) => d.valor)) || 1;

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-card-foreground">{titulo}</p>
        <p className="mb-4 text-xs text-muted-foreground">{descricao}</p>
        <ul className="space-y-2.5">
          {dados.slice(0, 6).map((d) => (
            <li key={d.rotulo}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-card-foreground">{d.rotulo}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatarMoedaBRL(d.valor)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[hsl(var(--warning))]"
                  style={{ width: `${Math.max((d.valor / maior) * 100, 2)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {dados.length > 6 && (
          <p className="mt-3 text-xs text-muted-foreground">
            e outros {dados.length - 6} — o quadro completo está no Dashboard.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function NoGeral({ empresaId, diasParado }: Props) {
  const { data: risco, isLoading } = useDashboardNegociosRisco(empresaId, { diasParado });

  if (isLoading) {
    return (
      <div className="mt-10 space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!risco) return null;

  const porVendedor = (risco.risco_por_vendedor ?? []).map((r) => ({
    rotulo: r.vendedor,
    valor: Number(r.valor) || 0,
  }));
  const porFabricante = (risco.risco_por_fabricante ?? []).map((r) => ({
    rotulo: r.fabrica,
    valor: Number(r.valor) || 0,
  }));

  const nada =
    Number(risco.qtd_parados) === 0 &&
    Number(risco.qtd_sem_proxima_acao) === 0 &&
    porVendedor.length === 0 &&
    porFabricante.length === 0;

  if (nada) return null;

  const cartoes = [
    {
      rotulo: 'Negócios parados',
      valor: String(risco.qtd_parados),
      apoio: formatarMoedaBRL(Number(risco.valor_parados) || 0),
      icone: AlertTriangle,
    },
    {
      rotulo: 'Sem próxima ação',
      valor: String(risco.qtd_sem_proxima_acao),
      apoio: formatarMoedaBRL(Number(risco.valor_sem_proxima_acao) || 0),
      icone: CalendarX,
    },
    {
      rotulo: 'Valor em risco',
      valor: formatarMoedaBRL(Number(risco.valor_risco_total) || 0),
      apoio: 'Parado ou sem próxima ação',
      icone: ShieldAlert,
    },
  ];

  return (
    <section className="mt-10 border-t border-border pt-8">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-card-foreground">No geral</h2>
        <p className="text-sm text-muted-foreground">
          A carteira da empresa inteira, com o mesmo corte de {diasParado}{' '}
          {diasParado === 1 ? 'dia' : 'dias'} que montou a sua pauta. Não depende do período —
          é a foto de agora.
        </p>
      </header>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {cartoes.map((c) => (
          <Card key={c.rotulo}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.rotulo}
                </p>
                <p className="truncate text-2xl font-bold tracking-tight text-card-foreground">
                  {c.valor}
                </p>
                <p className="truncate text-xs text-muted-foreground">{c.apoio}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--warning)/0.1)]">
                <c.icone className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* "Por responsável" só chega para gestor: a função de banco devolve lista vazia
            para os outros, e `Barras` não desenha nada com lista vazia. */}
        <Barras
          titulo="Risco por responsável"
          descricao="Valor em risco entre os negócios de cada pessoa"
          dados={porVendedor}
        />
        <Barras
          titulo="Risco por fabricante"
          descricao="Valor em risco entre os negócios de cada representada"
          dados={porFabricante}
        />
      </div>
    </section>
  );
}
