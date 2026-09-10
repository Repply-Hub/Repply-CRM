import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoedaBRL } from '@/lib/moeda';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useNegociosEmRisco, type NegocioEmRisco } from '@/hooks/use-dashboard';

/**
 * A TABELA DO TIME — os negócios que pedem atenção, um por linha, com ação em cada uma.
 *
 * 🔴 O QUE ELA SUBSTITUI, e por quê. Até 09/09/2026 este lugar mostrava "Os 10 maiores em risco":
 * dez linhas fixas, sem ação nenhuma, tiradas de dentro do painel de números
 * (`dashboard_negocios_risco.top_parados`). Num recorte de 159 negócios, quem enxerga a equipe
 * via dez e não tinha como chegar aos outros 149 — e para agir sobre qualquer um deles precisava
 * sair da tela. Agora a lista tem função própria e paginada (`negocios_em_risco`), cresce de 10 em
 * 10, e cada linha abre o negócio por cima da tela ou marca o retorno sem sair do lugar.
 *
 * 🔴 QUEM VÊ O QUÊ É DECIDIDO NO SERVIDOR. A função pergunta `eu_vejo_pauta_de_todos()`: com a
 * chave `pauta_de_todos`, a empresa inteira; sem ela, só os próprios negócios. A coluna
 * "Responsável" some quando a pessoa não tem a chave, mas isso é COSMÉTICO (CLAUDE.md §6.1) —
 * sem a chave ela repetiria o mesmo nome em todas as linhas, porque só vêm os negócios dela.
 *
 * Sem filtro de período, igual ao resto do painel "No geral": negócio aberto parado há meses
 * continua sendo risco hoje.
 */

/** Quantas linhas por vez — a primeira carga e cada "Ver mais". */
const PAGINA = 10;

/**
 * 🔴 O TETO DA FUNÇÃO DE BANCO, REPETIDO AQUI DE PROPÓSITO.
 *
 * `negocios_em_risco` corta o limite em 100 (`least(p_limite, 100)`, migration 20260909130000), e
 * o corte existe para a consulta não varrer a base inteira debaixo da regra de segurança e
 * estourar o tempo limite de 8 segundos do banco — a tela giraria para sempre em vez de dar erro
 * (CLAUDE.md §7.15).
 *
 * Sem esta constante aqui, o "Ver mais" continuaria oferecido depois das 100 linhas: cada clique
 * pediria mais, o servidor devolveria as mesmas 100, e a tabela não se mexeria. Botão que não faz
 * nada é pior que botão ausente. Passando de 100, a tabela diz onde parou e o que fazer.
 */
const TETO_DO_SERVIDOR = 100;

interface Props {
  empresaId?: string;
  /** O recorte, já traduzido para os nomes da consulta — ver `recorteParaOServidor`. */
  filtros: {
    usuarioIds?: string[];
    fabricanteIds?: string[];
    funilId?: string;
    diasParado?: number;
    etapas?: string[];
  };
  /** Tem a chave `pauta_de_todos`? Decide só se a coluna "Responsável" é desenhada. */
  podeVerDeTodos: boolean;
  /** Abre o painel do negócio POR CIMA da tela — quem o monta é a página "Hoje", uma vez só. */
  onAbrir: (pedidoId: string) => void;
  /** Abre o MESMO diálogo de "Retomar depois" que a fila de cima usa. */
  onRetomar: (linha: NegocioEmRisco) => void;
}

export function TabelaDoTime({ empresaId, filtros, podeVerDeTodos, onAbrir, onRetomar }: Props) {
  const [quantos, setQuantos] = useState(PAGINA);

  /**
   * 🔴 MEXER EM QUALQUER FILTRO VOLTA PARA 10.
   *
   * Sem isto, quem abriu 60 linhas e depois estreita o filtro pede 60 linhas de um recorte que
   * acabou de encolher — paga-se o recorte grande para mostrar o pequeno. E, do lado de quem
   * olha, a tabela reaparece no meio de uma lista que agora é outra.
   *
   * A comparação é com o TEXTO do recorte, não com o objeto: `filtros` é remontado a cada render
   * (vem de `recorteParaOServidor`), então comparar o objeto reiniciaria a contagem em todo
   * render e o "Ver mais" nunca sairia de 10.
   *
   * 🔴 POR QUE NÃO É UM `useEffect`, que seria o reflexo. Efeito roda DEPOIS da renderização e
   * DEPOIS dos efeitos internos do TanStack Query: a renderização com o filtro novo e `quantos`
   * ainda em 60 já cria a consulta de 60 linhas, ela SAI para o servidor, e só então o efeito
   * volta o número para 10 e dispara a segunda. Ou seja, o efeito não evita a consulta cara —
   * ele a torna inútil. Ajustar o estado DURANTE a renderização é o padrão que a documentação do
   * React chama de "ajustar estado quando uma propriedade muda": o React descarta esta
   * renderização e refaz na hora com 10, antes de rodar efeito nenhum, então a consulta de 60
   * nunca chega a existir.
   *
   * MEDIDO, não deduzido: o teste `tabela-do-time.test.tsx` conta as chamadas de verdade. Com o
   * `useEffect` no lugar disto, o recorte novo recebe `[20, 10]` — a consulta grande sai e é
   * jogada fora. Como está aqui, recebe `[10]`.
   */
  const chaveDoRecorte = JSON.stringify([
    filtros.usuarioIds ?? null,
    filtros.fabricanteIds ?? null,
    filtros.funilId ?? null,
    filtros.diasParado ?? null,
    filtros.etapas ?? null,
  ]);
  const [recorteMostrado, setRecorteMostrado] = useState(chaveDoRecorte);
  if (recorteMostrado !== chaveDoRecorte) {
    setRecorteMostrado(chaveDoRecorte);
    setQuantos(PAGINA);
  }

  const { data, isLoading, isFetching, error } = useNegociosEmRisco(empresaId, filtros, quantos);

  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;

  // Chegou ao teto do servidor: pedir mais devolveria as mesmas linhas. Ver `TETO_DO_SERVIDOR`.
  const noTeto = linhas.length >= TETO_DO_SERVIDOR;
  const temMais = linhas.length < total;

  return (
    <Card className="shadow-card border-border/60 mt-5">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-bold">
          {podeVerDeTodos ? 'Negócios da equipe que pedem atenção' : 'Seus negócios que pedem atenção'}
        </CardTitle>
        <CardDescription className="text-xs">
          {/* "Pedem atenção", e não "parados": o SQL seleciona `WHERE parado OR sem_proxima_acao`
              (migration 20260909130000). Na MD, hoje, a maioria da lista é "sem próxima ação" — o
              corte de parado é de 7 dias. Um título que só dissesse "parados" mentiria sobre o
              que a tabela lista. */}
          Parados além do prazo ou sem próxima ação marcada. Do maior valor para o menor.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-2">
        {isLoading ? (
          <div className="space-y-2 py-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : error ? (
          /* Erro do Supabase NÃO é um `Error` (CLAUDE.md §4.6): `mensagemDeErro` lê
             `message`/`details`/`hint`, que é onde o banco escreve o que de fato aconteceu.
             Mostrar a frase do banco em vez de "algo deu errado" é o que separa um chamado de
             cinco minutos de uma investigação. */
          <p className="py-4 text-sm text-destructive">
            Não foi possível carregar a lista: {mensagemDeErro(error, 'tente recarregar a página')}
          </p>
        ) : linhas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nenhum negócio pedindo atenção agora.</p>
        ) : (
          <>
            {/* 🔴 A ROLAGEM HORIZONTAL É DESTA CAIXA, NUNCA DA PÁGINA. São sete colunas e duas
                ações; em notebook 1366x768 elas não cabem. Sem o `min-w`, o navegador espreme as
                colunas até o texto virar uma letra por linha; com ele, a caixa rola por dentro e
                o resto da tela fica onde está (parente do CLAUDE.md §7.11 — transbordo é o que
                prende o usuário). */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Negócio</th>
                    <th className="py-2 text-left font-semibold">Fabricante</th>
                    <th className="py-2 text-left font-semibold">Etapa</th>
                    {podeVerDeTodos && (
                      <th className="py-2 text-left font-semibold">Responsável</th>
                    )}
                    <th className="py-2 text-right font-semibold">Valor</th>
                    <th className="py-2 text-right font-semibold">Sem mexer há</th>
                    <th className="py-2 text-right font-semibold">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((n) => (
                    <tr
                      key={n.id}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/50"
                      onClick={() => onAbrir(n.id)}
                    >
                      <td className="py-2 pr-3">{n.nome}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{n.fabrica ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{n.etapa ?? '—'}</td>
                      {podeVerDeTodos && (
                        <td className="py-2 pr-3 text-muted-foreground">{n.responsavel ?? '—'}</td>
                      )}
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {n.valor === null ? '—' : formatarMoedaBRL(n.valor)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {n.dias_parado === null
                          ? '—'
                          : `${n.dias_parado} ${n.dias_parado === 1 ? 'dia' : 'dias'}`}
                      </td>
                      {/* 🔴 O clique dos botões PARA AQUI. A linha inteira também abre o negócio
                          — é o gesto que esta tabela já tinha antes das ações existirem, e tirá-lo
                          seria regressão silenciosa para quem se acostumou. Sem o
                          `stopPropagation`, "Retomar depois" abriria o painel do negócio ao mesmo
                          tempo em que abre o diálogo. */}
                      <td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => onAbrir(n.id)}>
                            Abrir negócio
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onRetomar(n)}>
                            Retomar depois
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* O rodapé diz SEMPRE onde a pessoa está na lista, tenha ou não mais para abrir —
                "mostrando 10 de 145" é a informação que faltava na tabela antiga, que mostrava dez
                linhas sem dizer que havia 145. */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {temMais && !noTeto && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => setQuantos((q) => Math.min(q + PAGINA, TETO_DO_SERVIDOR))}
                >
                  {isFetching
                    ? 'Carregando…'
                    : `Ver mais (mostrando ${linhas.length} de ${total})`}
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
    </Card>
  );
}
