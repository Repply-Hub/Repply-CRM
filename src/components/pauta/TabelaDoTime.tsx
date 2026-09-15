import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { iniciais } from '@/lib/iniciais';
import {
  ajustarLargura,
  gravarLarguras,
  lerLarguras,
  restaurarColuna,
  somaDasLarguras,
  type ColunaAjustavel,
  type Larguras,
} from '@/lib/larguras-de-colunas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MOLDURA_DA_PAUTA } from '@/components/pauta/moldura-da-pauta';
import { EtiquetaDeTentativa } from '@/components/pauta/EtiquetaDeTentativa';
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

/**
 * AS LARGURAS-PADRÃO, EM PIXELS — pedido de 14/09/2026: por padrão, tudo cabe.
 *
 * O espaço é o da PÁGINA, não o da tela: "Hoje" tem no máximo 1.024 px (`max-w-5xl`), e tirando o
 * respiro da página (24 px de cada lado), a borda e o respiro do cartão (1 + 24 px de cada lado)
 * sobram 926 px — em notebook 1366x768 e em monitor grande, igual. As duas listas somam isso.
 *
 * MEDIDO no navegador em 14/09/2026, e não chutado (com Satoshi e com a fonte do sistema, a
 * diferença foi de 1 a 2 px):
 *   · "Abrir negócio" 111 px + 8 px de espaço + "Retomar depois" 125 px → ações com 260 px;
 *   · "R$ 9.999.999,99" 126 px → valor com 144 px. Acima de R$ 10 milhões o texto corta com "…" e
 *     o valor inteiro aparece ao passar o mouse;
 *   · "999 dias" 68 px → 84 px.
 * Cada célula tem 8 px de respiro de cada lado (`px-2`). O que sobra vai para negócio, fabricante
 * e etapa; fabricante e etapa cortam com "…" e mostram o texto inteiro ao passar o mouse.
 *
 * `chave` é o nome no guardado do navegador: mudar uma chave apaga o ajuste que as pessoas fizeram
 * naquela coluna. A coluna das ações não tem alça — a largura dela é a dos dois botões.
 */
const COLUNAS_COM_RESPONSAVEL: ColunaAjustavel[] = [
  { chave: 'negocio', padrao: 154, minima: 120 },
  { chave: 'fabricante', padrao: 76, minima: 56 },
  { chave: 'etapa', padrao: 76, minima: 56 },
  { chave: 'responsavel', padrao: 132, minima: 96 },
  { chave: 'valor', padrao: 144, minima: 110 },
  { chave: 'dias', padrao: 84, minima: 70 },
  { chave: 'acoes', padrao: 260, minima: 260 },
];

const COLUNAS_SEM_RESPONSAVEL: ColunaAjustavel[] = [
  { chave: 'negocio', padrao: 238, minima: 120 },
  { chave: 'fabricante', padrao: 100, minima: 56 },
  { chave: 'etapa', padrao: 100, minima: 56 },
  { chave: 'valor', padrao: 144, minima: 110 },
  { chave: 'dias', padrao: 84, minima: 70 },
  { chave: 'acoes', padrao: 260, minima: 260 },
];

/**
 * Uma chave por forma da tabela: as larguras de uma não servem na outra.
 *
 * Mudou um `padrao` ali em cima (`COLUNAS_COM_RESPONSAVEL` ou `COLUNAS_SEM_RESPONSAVEL`)? Suba o
 * `_v1` das duas chaves para `_v2`: quem já ajustou a coluna tem a largura ANTIGA guardada neste
 * navegador, e ela continuaria valendo por cima do padrão novo sem a troca.
 */
const CHAVE_COM_RESPONSAVEL = 'repply_hoje_larguras_tabela_do_time_com_responsavel_v1';
const CHAVE_SEM_RESPONSAVEL = 'repply_hoje_larguras_tabela_do_time_sem_responsavel_v1';

/** Quanto cada toque de seta anda, para quem ajusta pelo teclado. */
const PASSO_DO_TECLADO = 16;

/**
 * A ALÇA NA BORDA DIREITA DO TÍTULO DE UMA COLUNA. Arrastar muda a largura; dois cliques voltam ao
 * padrão; as setas ←/→ ajustam pelo teclado, para quem não usa mouse.
 *
 * Durante o arraste só a tela muda (`onMudar`); o fim do gesto grava (`onSoltar`). Gravar a cada
 * movimento do ponteiro escreveria no navegador dezenas de vezes por segundo.
 *
 * `setPointerCapture` mantém o arraste vivo quando o ponteiro sai da alça — sem ele, arrastar
 * rápido "solta" a coluna no meio do gesto.
 */
function AlcaDeLargura({
  rotulo,
  largura,
  minima,
  onMudar,
  onSoltar,
  onRestaurar,
}: {
  rotulo: string;
  largura: number;
  /** Menor largura aceita desta coluna — o piso do `aria-valuemin` da alça. */
  minima: number;
  onMudar: (novaLargura: number) => void;
  onSoltar: (novaLargura: number) => void;
  onRestaurar: () => void;
}) {
  const arraste = useRef<{ x: number; largura: number; ultima: number } | null>(null);

  const terminar = () => {
    if (!arraste.current) return;
    const final = arraste.current.ultima;
    arraste.current = null;
    onSoltar(final);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ajustar a largura da coluna ${rotulo}`}
      aria-valuenow={largura}
      aria-valuemin={minima}
      // 926 = o espaço da tabela na página (mesma medida das larguras-padrão, acima). Sem um
      // teto de verdade um role="separator" assume a faixa padrão 0–100, e a MAIOR
      // largura-padrão da tabela (154, de "Negócio") já ficaria fora dela; o `Math.max` cobre
      // também quem arrastou a coluna além dos 926.
      aria-valuemax={Math.max(largura, 926)}
      aria-valuetext={`${largura} pixels`}
      tabIndex={0}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none border-r-2 border-border hover:border-primary focus-visible:border-primary focus-visible:outline-none"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        arraste.current = { x: e.clientX, largura, ultima: largura };
      }}
      onPointerMove={(e) => {
        if (!arraste.current) return;
        arraste.current.ultima = arraste.current.largura + e.clientX - arraste.current.x;
        onMudar(arraste.current.ultima);
      }}
      onPointerUp={terminar}
      onPointerCancel={terminar}
      onDoubleClick={onRestaurar}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onSoltar(largura + (e.key === 'ArrowRight' ? PASSO_DO_TECLADO : -PASSO_DO_TECLADO));
      }}
    />
  );
}

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

  // As larguras das colunas: uma lista para cada forma da tabela, e o ajuste guardado neste
  // navegador. Ver `COLUNAS_COM_RESPONSAVEL` e `src/lib/larguras-de-colunas.ts`.
  const colunas = podeVerDeTodos ? COLUNAS_COM_RESPONSAVEL : COLUNAS_SEM_RESPONSAVEL;
  const chaveGuardada = podeVerDeTodos ? CHAVE_COM_RESPONSAVEL : CHAVE_SEM_RESPONSAVEL;
  const [larguras, setLarguras] = useState(() => lerLarguras(chaveGuardada, colunas));

  // A forma da tabela muda quando a chave `pauta_de_todos` chega depois da primeira pintura ou
  // muda com a tela aberta: as larguras são relidas do guardado da outra forma. Ajuste DURANTE a
  // renderização, pelo mesmo motivo do `recorteMostrado` logo abaixo — um efeito pintaria uma vez
  // a tabela nova com as larguras da forma antiga.
  const [chaveMostrada, setChaveMostrada] = useState(chaveGuardada);
  if (chaveMostrada !== chaveGuardada) {
    setChaveMostrada(chaveGuardada);
    setLarguras(lerLarguras(chaveGuardada, colunas));
  }

  const mudarLargura = (coluna: ColunaAjustavel, nova: number) =>
    setLarguras((atual) => ajustarLargura(atual, coluna, nova));

  // Sem mudança de verdade — um clique na alça sem chegar a arrastar, por exemplo — não grava.
  // Gravar mesmo sem mudança congelaria a largura-padrão de hoje no navegador de quem só tocou a
  // alça, como se a pessoa tivesse escolhido um ajuste que nunca fez.
  const aplicarSeMudou = (chave: string, final: Larguras) => {
    if (final[chave] === larguras[chave]) return;
    setLarguras(final);
    gravarLarguras(chaveGuardada, final);
  };

  // O fim do gesto muda e grava. A conta parte das larguras DESTA renderização, e isso é seguro:
  // durante um arraste só a coluna arrastada muda, e o valor final dela vem do ponteiro, não do
  // estado.
  const soltarLargura = (coluna: ColunaAjustavel, nova: number) =>
    aplicarSeMudou(coluna.chave, ajustarLargura(larguras, coluna, nova));

  const restaurarLargura = (coluna: ColunaAjustavel) =>
    aplicarSeMudou(coluna.chave, restaurarColuna(larguras, coluna));

  const coluna = (chave: string) => colunas.find((c) => c.chave === chave) as ColunaAjustavel;

  /**
   * Um título de coluna com a alça na borda direita.
   *
   * 🔴 `aria-label` NO `<th>`: sem ele, o nome acessível do título viraria "Responsável Ajustar a
   * largura da coluna Responsável" — o leitor de tela repetiria a frase da alça a cada célula, e o
   * teste que procura a coluna pelo nome deixaria de achá-la.
   */
  const titulo = (c: ColunaAjustavel, rotulo: string, alinhamento: 'left' | 'right') => (
    <th
      aria-label={rotulo}
      className={`relative px-2 py-2 font-semibold ${alinhamento === 'right' ? 'text-right' : 'text-left'}`}
    >
      {rotulo}
      <AlcaDeLargura
        rotulo={rotulo}
        largura={larguras[c.chave]}
        minima={c.minima}
        onMudar={(nova) => mudarLargura(c, nova)}
        onSoltar={(nova) => soltarLargura(c, nova)}
        onRestaurar={() => restaurarLargura(c)}
      />
    </th>
  );

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

  const { data, isPending, isPaused, isFetching, error, failureReason } = useNegociosEmRisco(
    empresaId,
    filtros,
    quantos,
  );

  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;

  // Chegou ao teto do servidor: pedir mais devolveria as mesmas linhas. Ver `TETO_DO_SERVIDOR`.
  const noTeto = linhas.length >= TETO_DO_SERVIDOR;
  const temMais = linhas.length < total;

  return (
    // 🔴 `id="tabela-do-time"` é a âncora do botão "Ver a tabela" do aviso da pauta vazia
    // (`AvisoDaTabela`, em `src/pages/Hoje.tsx`). `scroll-mt-4` deixa um respiro acima do cartão.
    <Card id="tabela-do-time" className={`${MOLDURA_DA_PAUTA} mt-5 scroll-mt-4`}>
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
        {error ? (
          /* Erro do Supabase NÃO é um `Error` (CLAUDE.md §4.6): `mensagemDeErro` lê
             `message`/`details`/`hint`, que é onde o banco escreve o que de fato aconteceu.
             Mostrar a frase do banco em vez de "algo deu errado" é o que separa um chamado de
             cinco minutos de uma investigação. */
          <p className="py-4 text-sm text-destructive">
            Não foi possível carregar a lista: {mensagemDeErro(error, 'tente recarregar a página')}
          </p>
        ) : isPending && isPaused ? (
          /* 🔴 SEM RESPOSTA NÃO É "NÃO HÁ NADA". Quando o navegador perde a rede, o TanStack Query
             PAUSA a consulta em vez de deixá-la falhar: ela fica sem dados e sem erro, e é um
             estado que dura enquanto a conexão não voltar. Se isso caísse no ramo de lista vazia
             abaixo, a tabela diria "nenhum negócio pedindo atenção" — a mesma tela mentindo por
             falta de resposta, que é justamente o que este trabalho veio consertar.
             Medido no navegador em 10/09/2026: consulta `pending` com `fetchStatus: paused`
             deixa `isLoading` FALSO, então o esqueleto sozinho também não cobria este caso.

             `isPending &&` porque isto vale só quando NÃO HÁ o que mostrar. Perder a rede durante
             uma recarga de uma lista que já está na tela não é motivo para apagá-la: as linhas
             continuam sendo a melhor informação disponível, e o que envelhece é a idade delas.

             🔴 A FRASE NÃO DIZ "SEM CONEXÃO", e isso é de propósito. `isPaused` tem DUAS portas,
             não uma: `canContinue()` do Query exige rede E foco da aba, então trocar de aba no
             meio de uma tentativa também pausa. Medido em 10/09/2026 no `localhost`: pausada com
             `navigator.onLine` verdadeiro e o `fetch` respondendo 200. Culpar a internet ali é
             mandar a pessoa conferir o wi-fi por causa de um erro do servidor — e ainda joga
             fora a explicação que o banco mandou, que fica guardada em `failureReason`. */
          <p className="py-4 text-sm text-muted-foreground">
            {failureReason
              ? `Ainda não consegui carregar a lista: ${mensagemDeErro(failureReason, 'vou tentar de novo em instantes')}`
              : 'Ainda não consegui carregar a lista. Vou tentar de novo em instantes.'}
          </p>
        ) : isPending ? (
          <div className="space-y-2 py-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nenhum negócio pedindo atenção agora.</p>
        ) : (
          <>
            {/* 🔴 A ROLAGEM HORIZONTAL É DESTA CAIXA, NUNCA DA PÁGINA. Desde 14/09/2026 cada coluna
                tem largura própria (`table-layout: fixed`, larguras em `COLUNAS_COM_RESPONSAVEL` e
                `COLUNAS_SEM_RESPONSAVEL`), escolhidas para a soma caber no espaço da tabela na
                página. A caixa só rola quando a pessoa alarga colunas além desse espaço — e rola por
                dentro, com o resto da tela parado (parente do CLAUDE.md §7.11: transbordo é o que
                prende o usuário). Antes, com a largura automática, o navegador repartia o espaço
                pelo tamanho do texto, e um nome de negócio comprido espremia as outras colunas. */}
            <div className="overflow-x-auto">
              <table
                className="min-w-full text-sm"
                // A soma das larguras, e não `w-full`: é o que faz alargar uma coluna alargar a
                // tabela (e a caixa rolar) em vez de espremer as vizinhas. `min-w-full` estica as
                // colunas na proporção quando sobra espaço.
                style={{ tableLayout: 'fixed', width: somaDasLarguras(larguras, colunas) }}
              >
                <colgroup>
                  {colunas.map((c) => (
                    <col key={c.chave} style={{ width: `${larguras[c.chave]}px` }} />
                  ))}
                </colgroup>
                <thead>
                  {/* A faixa do título das colunas, com o contraste do dashboard de referência
                      (pedido de 14/09/2026): mais escura que o fundo, texto forte e sem caixa-alta.
                      `foreground` com transparência escurece no tema claro e clareia no escuro, sem
                      regra por tema. */}
                  <tr className="bg-foreground/[0.06] text-xs text-card-foreground">
                    {titulo(coluna('negocio'), 'Negócio', 'left')}
                    {titulo(coluna('fabricante'), 'Fabricante', 'left')}
                    {titulo(coluna('etapa'), 'Etapa', 'left')}
                    {podeVerDeTodos && titulo(coluna('responsavel'), 'Responsável', 'left')}
                    {titulo(coluna('valor'), 'Valor', 'right')}
                    {titulo(coluna('dias'), 'Sem mexer há', 'right')}
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
                        {/* Até duas linhas: o nome é o que se lê primeiro, e cortar na primeira
                            esconderia a fabricante nos nomes montados como "Cliente | Fabricante". */}
                        <span className="line-clamp-2 break-words" title={n.nome}>
                          {n.nome}
                        </span>
                        {/* A etiqueta de negócio perseguido, abaixo do nome (pedido de 15/09/2026).
                            Aqui ela ACOMPANHA a coluna "Sem mexer há" em vez de substituir um selo —
                            a tabela não tem o selo "Orçamento parado" da pauta, e sim uma coluna de
                            dias. Só aparece a partir da 1ª retomada. */}
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
                      {podeVerDeTodos && (
                        <td className="px-2 py-2 text-card-foreground">
                          {/* O rosto do dono; sem foto, as iniciais — o mesmo círculo do campo de
                              responsáveis do negócio (`CampoDeResponsaveis`). `AvatarFallback`
                              também cobre a foto que demora ou falha ao carregar. */}
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
                      )}
                      <td
                        className="truncate px-2 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground"
                        title={n.valor === null ? undefined : formatarMoedaBRL(n.valor)}
                      >
                        {n.valor === null ? '—' : formatarMoedaBRL(n.valor)}
                      </td>
                      <td className="truncate px-2 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground">
                        {n.dias_parado === null
                          ? '—'
                          : `${n.dias_parado} ${n.dias_parado === 1 ? 'dia' : 'dias'}`}
                      </td>
                      {/* 🔴 O clique dos botões PARA AQUI. A linha inteira também abre o negócio
                          — é o gesto que esta tabela já tinha antes das ações existirem, e tirá-lo
                          seria regressão silenciosa para quem se acostumou. Sem o
                          `stopPropagation`, "Retomar depois" abriria o painel do negócio ao mesmo
                          tempo em que abre o diálogo. */}
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {/* O botão principal, laranja como o da pauta logo acima (pedido de
                              14/09/2026): abrir o negócio é a ação desta tabela. */}
                          <Button size="sm" onClick={() => onAbrir(n.id)}>
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
