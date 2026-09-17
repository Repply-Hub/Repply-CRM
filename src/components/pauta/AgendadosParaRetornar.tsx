import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { iniciais } from '@/lib/iniciais';
import { formatarMoedaBRL } from '@/lib/moeda';
import { formatarDataBR } from '@/lib/data-local';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { MOLDURA_DA_PAUTA } from '@/components/pauta/moldura-da-pauta';
import { EtiquetaDeTentativa } from '@/components/pauta/EtiquetaDeTentativa';
import { useNegociosAgendados, useDashboardAgendados, type NegocioAgendado } from '@/hooks/use-dashboard';
import { useCancelarRetorno } from '@/hooks/use-pauta';

/**
 * A FAIXA "AGENDADOS PARA RETORNAR" — o outro lado da moeda de "pedem atenção".
 *
 * Fica no fim do Radar, recolhida por padrão: fechada, mostra o resumo (do time, para quem vê a
 * pauta toda; próprio, para os demais); aberta, revela o resumo por vendedor (só gestor) e a tabela
 * dos negócios adiados por "Retomar depois", no mesmo estilo da tabela do time.
 *
 * 🔴 O CORTE POR CHAVE É DO SERVIDOR. `dashboard_agendados`/`negocios_agendados` já devolvem só os
 * próprios para quem não vê a pauta toda, e o resumo por vendedor vem vazio nesse caso — a tela só
 * reforça (CLAUDE.md §6.1). Aqui NÃO há larguras arrastáveis (é uma faixa secundária); a "cara" é a
 * mesma da tabela do time em tudo o mais.
 */

const PAGINA = 10;
const TETO_DO_SERVIDOR = 100; // o mesmo teto de `negocios_agendados` (least(p_limite,100)).

// Larguras fixas (table-layout: fixed), na linha das da tabela do time. Somam ~958px; a caixa rola
// por dentro se a tela for mais estreita. "Volta em" é uma data curta; "Ações" cabe os dois botões.
const COLS: { chave: string; largura: number }[] = [
  { chave: 'negocio', largura: 154 },
  { chave: 'fabricante', largura: 76 },
  { chave: 'etapa', largura: 76 },
  { chave: 'responsavel', largura: 132 },
  { chave: 'valor', largura: 144 },
  { chave: 'volta_em', largura: 100 },
  { chave: 'acoes', largura: 280 },
];
const LARGURA_TOTAL = COLS.reduce((s, c) => s + c.largura, 0);

interface Props {
  empresaId?: string;
  filtros: { usuarioIds?: string[]; fabricanteIds?: string[]; funilId?: string; etapas?: string[] };
  /** Tem a chave `pauta_de_todos`? Só decide o texto e se o resumo por vendedor aparece. */
  podeVerDeTodos: boolean;
  /** Abre o painel do negócio POR CIMA da tela — o mesmo que a tabela do time usa. */
  onAbrir: (pedidoId: string) => void;
}

export function AgendadosParaRetornar({ empresaId, filtros, podeVerDeTodos, onAbrir }: Props) {
  const [aberta, setAberta] = useState(false);
  const [quantos, setQuantos] = useState(PAGINA);
  const [ordem, setOrdem] = useState<{ coluna: string; ascendente: boolean }>({
    coluna: 'data_retorno',
    ascendente: true,
  });
  const [aConfirmar, setAConfirmar] = useState<NegocioAgendado | null>(null);

  const resumo = useDashboardAgendados(empresaId, filtros);
  const qtdTotal = resumo.data?.qtd_total ?? 0;
  const valorTotal = resumo.data?.valor_total ?? 0;
  const porVendedor = resumo.data?.agendados_por_vendedor ?? [];

  // Só busca a lista quando a faixa está aberta — fechada, o resumo basta.
  const listaHabilitada = aberta && !!empresaId;
  const { data, isPending, isFetching, error } = useNegociosAgendados(
    listaHabilitada ? empresaId : undefined,
    { ...filtros, ordenarPor: ordem.coluna, ascendente: ordem.ascendente },
    quantos,
  );
  const linhas = data?.linhas ?? [];
  const total = data?.total ?? qtdTotal;
  const noTeto = linhas.length >= TETO_DO_SERVIDOR;
  const temMais = linhas.length < total;

  const cancelar = useCancelarRetorno();

  const confirmarTrazerDeVolta = () => {
    if (!aConfirmar) return;
    const alvo = aConfirmar;
    setAConfirmar(null);
    cancelar.mutate(
      { pedidoId: alvo.id },
      {
        onSuccess: () => toast.success(`"${alvo.nome}" voltou para a pauta.`),
        onError: (e) =>
          toast.error(mensagemDeErro(e, 'não foi possível trazer o negócio de volta')),
      },
    );
  };

  const ordenarPor = (coluna: string, ascendente: boolean) => {
    setOrdem({ coluna, ascendente });
    setQuantos(PAGINA); // ordem nova recomeça na primeira página.
  };

  const titulo = (
    chave: string,
    rotulo: string,
    alinhamento: 'left' | 'right',
    rotuloAsc: string,
    rotuloDesc: string,
  ) => {
    const ativa = ordem.coluna === chave;
    return (
      <th className={`px-2 py-2 font-semibold ${alinhamento === 'right' ? 'text-right' : 'text-left'}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded hover:text-foreground',
                alinhamento === 'right' && 'flex-row-reverse',
              )}
            >
              <span className="truncate">{rotulo}</span>
              <ChevronDown className={cn('h-3 w-3 shrink-0', ativa && 'text-primary')} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={alinhamento === 'right' ? 'end' : 'start'} className="w-56">
            <DropdownMenuItem className="gap-2" onClick={() => ordenarPor(chave, true)}>
              <Check className={cn('h-3.5 w-3.5 shrink-0', !(ativa && ordem.ascendente) && 'opacity-0')} />
              {rotuloAsc}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => ordenarPor(chave, false)}>
              <Check className={cn('h-3.5 w-3.5 shrink-0', !(ativa && !ordem.ascendente) && 'opacity-0')} />
              {rotuloDesc}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </th>
    );
  };

  if (!empresaId) return null;

  // Nada agendado: uma linha discreta, sem sanfona (não há o que abrir).
  if (!resumo.isPending && qtdTotal === 0) {
    return (
      <Card className={`${MOLDURA_DA_PAUTA} mt-5`}>
        <CardContent className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4 shrink-0" />
          Nenhum negócio agendado para retornar.
        </CardContent>
      </Card>
    );
  }

  const resumoTexto =
    qtdTotal === 1
      ? '1 negócio'
      : `${qtdTotal} negócios`;

  return (
    <Card className={`${MOLDURA_DA_PAUTA} mt-5`}>
      <Collapsible open={aberta} onOpenChange={setAberta}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/40"
          >
            <CalendarClock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-bold text-card-foreground">Agendados para retornar</span>
              <span className="text-xs text-muted-foreground">
                {podeVerDeTodos ? 'da equipe' : 'seus'} ·{' '}
                <span className="font-semibold text-card-foreground">{resumoTexto}</span> ·{' '}
                <span className="font-mono font-semibold tabular-nums">{formatarMoedaBRL(valorTotal)}</span>{' '}
                guardados
              </span>
            </span>
            {aberta ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Resumo por vendedor — só para quem vê a pauta toda (o servidor manda [] para os
                demais; aqui a condição extra evita até desenhar o bloco). */}
            {podeVerDeTodos && porVendedor.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {porVendedor.map((v) => (
                  <span
                    key={v.vendedor}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    <span className="font-medium text-card-foreground">{v.vendedor}</span>
                    <span className="text-muted-foreground">
                      {v.qtd} · <span className="font-mono tabular-nums">{formatarMoedaBRL(v.valor)}</span>
                    </span>
                  </span>
                ))}
              </div>
            )}

            {error ? (
              <p className="py-4 text-sm text-destructive">
                Não foi possível carregar a lista: {mensagemDeErro(error, 'tente recarregar a página')}
              </p>
            ) : isPending ? (
              <div className="space-y-2 py-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : linhas.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nenhum negócio agendado para retornar.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm" style={{ tableLayout: 'fixed', width: LARGURA_TOTAL }}>
                    <colgroup>
                      {COLS.map((c) => (
                        <col key={c.chave} style={{ width: `${c.largura}px` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-foreground/[0.06] text-xs text-card-foreground">
                        {titulo('negocio', 'Negócio', 'left', 'A → Z', 'Z → A')}
                        {titulo('fabricante', 'Fabricante', 'left', 'A → Z', 'Z → A')}
                        {titulo('etapa', 'Etapa', 'left', 'A → Z', 'Z → A')}
                        {titulo('responsavel', 'Responsável', 'left', 'A → Z', 'Z → A')}
                        {titulo('valor', 'Valor', 'right', 'Menor valor primeiro', 'Maior valor primeiro')}
                        {titulo('data_retorno', 'Volta em', 'left', 'Mais próximo primeiro', 'Mais distante primeiro')}
                        <th className="px-2 py-2 text-right font-semibold">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((n) => (
                        <tr
                          key={n.id}
                          className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                          onClick={() => onAbrir(n.id)}
                        >
                          <td className="px-2 py-2 font-medium text-card-foreground">
                            <span className="line-clamp-2 break-words" title={n.nome}>
                              {n.nome}
                            </span>
                            {(n.tentativas ?? 0) > 0 && (
                              <EtiquetaDeTentativa tentativas={n.tentativas as number} className="mt-1" />
                            )}
                          </td>
                          <td className="truncate px-2 py-2 text-muted-foreground" title={n.fabrica ?? undefined}>
                            {n.fabrica ?? '—'}
                          </td>
                          <td className="truncate px-2 py-2 text-muted-foreground" title={n.etapa ?? undefined}>
                            {n.etapa ?? '—'}
                          </td>
                          <td className="px-2 py-2 text-card-foreground">
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar className="h-7 w-7 shrink-0">
                                {n.responsavel_avatar && (
                                  <AvatarImage src={n.responsavel_avatar} alt="" className="h-full w-full object-cover" />
                                )}
                                <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                                  {iniciais(n.responsavel ?? '')}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate" title={n.responsavel ?? undefined}>
                                {n.responsavel ?? '—'}
                              </span>
                            </span>
                          </td>
                          <td
                            className="truncate px-2 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground"
                            title={n.valor === null ? undefined : formatarMoedaBRL(n.valor)}
                          >
                            {n.valor === null ? '—' : formatarMoedaBRL(n.valor)}
                          </td>
                          <td className="truncate px-2 py-2 text-card-foreground">
                            {formatarDataBR(n.data_retorno)}
                          </td>
                          {/* O clique dos botões PARA AQUI: a linha inteira abre o negócio. */}
                          <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" onClick={() => onAbrir(n.id)}>
                                Abrir negócio
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setAConfirmar(n)}>
                                Trazer de volta
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {temMais && !noTeto && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isFetching}
                      onClick={() => setQuantos((q) => Math.min(q + PAGINA, TETO_DO_SERVIDOR))}
                    >
                      {isFetching ? 'Carregando…' : `Ver mais (mostrando ${linhas.length} de ${total})`}
                    </Button>
                  )}
                  {temMais && noTeto && (
                    <p className="text-xs text-muted-foreground">
                      Mostrando os {linhas.length} maiores de {total}. Estreite por etapa, fabricante ou
                      responsável para chegar aos outros.
                    </p>
                  )}
                  {!temMais && (
                    <p className="text-xs text-muted-foreground">
                      {total === 1 ? '1 negócio' : `${total} negócios`} — a lista inteira.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trazer o negócio de volta?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso cancela o agendamento de retorno{aConfirmar ? ` de "${aConfirmar.nome}"` : ''} e apaga a
              tarefa que ele criou. O negócio volta agora para a pauta e para "pedem atenção". Não dá para
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarTrazerDeVolta}>Sim, trazer de volta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
