import { useState, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, Clock, Sun } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoedaBRL } from '@/lib/moeda';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { usePossoVerPautaDeTodos } from '@/hooks/use-minha-permissao';
import { usePauta, type ItemDaPauta } from '@/hooks/use-pauta';
import { DialogoRetorno } from '@/components/pauta/DialogoRetorno';
import { RadarDeRisco } from '@/components/pauta/RadarDeRisco';
import { PainelDoNegocio } from '@/components/pedidos/PainelDoNegocio';
import { useNegocioNoEndereco } from '@/hooks/use-negocio-no-endereco';
import { useNegociosEmRisco, type NegocioEmRisco } from '@/hooks/use-dashboard';
import {
  lerFiltrosDoEndereco,
  escreverFiltrosNoEndereco,
  recorteParaOServidor,
  type FiltrosDoPainel,
} from '@/lib/filtros-do-painel';

/**
 * A tela "Hoje" — a pauta do dia.
 *
 * É uma FILA DE TRABALHO, não um mural de avisos. A diferença decide se ela sobrevive:
 * notificação conta o que aconteceu; pauta diz o que fazer agora, em ordem, com o valor em
 * jogo do lado e um verbo no botão.
 *
 * O contraexemplo está no próprio sistema: das 36 notificações criadas desde 05/08/2026,
 * 33 nunca foram clicadas. Mural que não se resolve vira paisagem.
 *
 * Nenhuma regra mora aqui. Quantos itens, quais negócios, o corte de dias parados e o fato
 * de a seção desligada devolver vazio — tudo isso é a função `pauta_do_dia()` no banco, que
 * é a MESMA que alimenta o e-mail de resumo. Ver docs/operacao/plano-pauta-do-dia.md.
 */

function ItemPauta({
  item,
  larguraInteira,
  aoAgir,
  aoAdiar,
}: {
  item: ItemDaPauta;
  larguraInteira: boolean;
  aoAgir: () => void;
  aoAdiar: () => void;
}) {
  const ehCompromisso = item.tipo === 'compromisso';

  return (
    <li
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border bg-card p-5',
        // O item que sobrou (número ímpar) ocupa a linha toda e volta ao arranjo original:
        // conteúdo à esquerda, botões à direita. Em meia largura isso apertaria o texto.
        larguraInteira && 'sm:col-span-2 sm:flex-row sm:items-start sm:gap-6',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
              ehCompromisso
                ? 'bg-muted text-muted-foreground'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {item.selo}
          </span>
          {item.valor !== null && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatarMoedaBRL(item.valor)}
            </span>
          )}
          {item.quando && (
            <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
              <Clock className="h-3 w-3" />
              {format(new Date(item.quando), 'HH:mm')}
            </span>
          )}
          {/* A fila é sempre pessoal desde 09/09/2026, então `item.responsavel` vem sempre nulo e
              a etiqueta de dono saiu daqui. O campo fica no banco: é o que a tabela do time e o
              e-mail leem. */}
        </div>

        <h3 className="mb-1 text-base font-semibold leading-snug text-card-foreground sm:text-[17px]">
          {item.titulo}
        </h3>
        <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          {item.detalhe}
        </p>
      </div>

      <div
        className={cn(
          'flex shrink-0 flex-row gap-2',
          larguraInteira && 'sm:w-[168px] sm:flex-col',
        )}
      >
        <Button size="sm" className="flex-1 sm:flex-none" onClick={aoAgir}>
          {ehCompromisso ? 'Ver na agenda' : 'Abrir negócio'}
        </Button>
        {/* Compromisso não se adia por aqui: quem remarca reunião remarca na agenda, e um
            "retomar depois" aqui criaria duas verdades sobre a mesma hora do dia. */}
        {!ehCompromisso && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 sm:flex-none"
            onClick={aoAdiar}
          >
            <Check className="h-3.5 w-3.5" />
            Retomar depois
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * O que o diálogo "Retomar depois" precisa saber — e nada além disso.
 *
 * Existe porque agora DUAS listas abrem o mesmo diálogo, e elas têm formas diferentes: a fila
 * entrega um `ItemDaPauta` e a tabela do time entrega um `NegocioEmRisco`. Guardar no estado o
 * mínimo comum é o que permite montar UM diálogo só para a tela inteira — dois diálogos seriam
 * dois formulários e duas verdades sobre o mesmo gesto.
 */
type AlvoDoRetorno = {
  pedidoId: string;
  titulo: string;
  /** Nome do dono SÓ quando o negócio não é de quem está olhando. Nulo significa "é meu". */
  responsavel: string | null;
};

const Hoje = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: pauta, isLoading } = usePauta();
  const [alvo, setAlvo] = useState<AlvoDoRetorno | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  // Só para `trocarFiltros` repassar o `state` da entrada do histórico — ver o comentário lá.
  const location = useLocation();
  const filtros = useMemo(() => lerFiltrosDoEndereco(searchParams), [searchParams]);
  // 🔴 O negócio aberto vive no ENDEREÇO (`?negocio=<id>`), do mesmo jeito que na tela de
  // Negócios — é o MESMO hook e o MESMO parâmetro. Isso é o que faz recarregar a página manter o
  // painel aberto e o botão voltar do navegador fechá-lo.
  //
  // Convive com os filtros do painel de baixo sem briga: `escreverFiltrosNoEndereco` copia o que
  // recebeu e só mexe nas três chaves dele, então mexer num filtro com o painel aberto preserva
  // `negocio=` — e `comNegocio` faz o simétrico, preservando os filtros ao abrir e ao fechar.
  const { negocioAberto, abrirNegocio, fecharNegocio } = useNegocioNoEndereco();
  // 🔴 A CHAVE, NÃO O PAPEL, e desde 09/09/2026 ela NÃO governa mais a fila. A fila é sempre
  // pessoal, para todo mundo (migration 20260909120000): a chave passou a liberar a TABELA DO
  // TIME, o gráfico por vendedor e o filtro de responsável, todos no painel "No geral" de baixo.
  // Continua sendo a chave e não o papel: um gestor com o interruptor `pauta_de_todos` desligado
  // à mão vê a tabela só com os próprios negócios, porque é assim que o servidor responde
  // (ver `usePossoVerPautaDeTodos` e `eu_vejo_pauta_de_todos()`).
  const podeVerDeTodos = usePossoVerPautaDeTodos();

  // O MESMO recorte que o painel de baixo manda ao servidor — uma tradução só, para os números
  // desta tela e os da tabela não discordarem (ver `recorteParaOServidor`).
  const recorte = useMemo(
    () => recorteParaOServidor(filtros, podeVerDeTodos),
    [filtros, podeVerDeTodos],
  );

  // 🔴 A MESMA PRIMEIRA PÁGINA QUE A TABELA DO TIME PEDE — mesmos filtros, mesmas 10 linhas,
  // MESMA CHAVE DE CACHE. Não é uma consulta a mais: as duas leituras compartilham a resposta que
  // o TanStack Query guarda, e foi conferido no navegador (a primeira carga sai com UMA chamada, e
  // mexer num filtro também).
  //
  // O que a tela ganha em troca são as duas coisas que a mensagem de fila vazia precisa saber: se
  // a tabela abaixo tem algo (senão a tela comemora em cima de uma lista de 159 negócios) e SE ELA
  // JÁ CARREGOU (senão a comemoração pisca por um instante antes de a tabela aparecer, todo santo
  // dia, para quem só supervisiona).
  //
  // ⚠️ Depois de um "Ver mais" as duas chaves se separam (a tabela vai para 20, esta fica em 10) e
  // aí sim há duas entradas no cache — as duas se recarregam juntas quando algo invalida
  // `negocios_em_risco`. É a página de 10, a mais barata das duas; e o `quantos` mora na tabela de
  // propósito, para o "Ver mais" não virar estado desta página inteira.
  const {
    data: primeiraPaginaDoTime,
    isLoading: carregandoOTime,
    status: estadoDoTime,
  } = useNegociosEmRisco(empresaId, recorte, 10);
  const totalDoTime = primeiraPaginaDoTime?.total ?? 0;
  // 🔴 "RESPONDEU" É O QUE VALE, e não "não deu erro". São três os jeitos de não haver resposta —
  // ainda carregando, erro, e a consulta PAUSADA porque o navegador está sem rede — e nos três a
  // tela não sabe o que há na tabela de baixo. Perguntar por `status === 'success'` cobre os três
  // de uma vez; perguntar "tem erro?" deixaria a pausa de fora, e sem rede a tela comemoraria.
  const timeRespondeu = estadoDoTime === 'success';

  function trocarFiltros(novos: FiltrosDoPainel) {
    setSearchParams((prev) => escreverFiltrosNoEndereco(new URLSearchParams(prev), novos), {
      replace: true,
      // 🔴 Repassa o `state` da entrada em vez de deixá-lo cair. `replace` sem `state` nas opções
      // não preserva nada: grava `undefined`. Mexer num filtro com o painel do negócio ABERTO
      // apagaria a marca que `useNegocioNoEndereco` deixou ao abrir, e o "Fechar" seguinte
      // deixaria entrada morta no histórico em vez de desfazer a que ele empurrou.
      state: location.state,
    });
  }

  /**
   * "Retomar depois" a partir de uma linha da TABELA DO TIME — o mesmo diálogo da fila.
   *
   * 🔴 A TABELA MANDA O NOME DO DONO EM TODA LINHA, INCLUSIVE NAS SUAS. A fila não fazia isso: lá
   * `responsavel` só vem preenchido quando o negócio é de outra pessoa, e o diálogo usa esse
   * campo para trocar de texto ("este negócio é de Fulano, e Fulano recebe um aviso com o motivo"
   * contra "o negócio volta para a sua pauta"). Repassar o nome cru faria o diálogo avisar a
   * pessoa sobre ela mesma toda vez que ela adiasse um negócio seu.
   *
   * Por isso a comparação com o próprio nome. O que a tabela devolve é `usuarios.nome`, a MESMA
   * coluna de onde sai `profile.nome` — não é um apelido nem um e-mail. Dois colegas homônimos na
   * mesma empresa fariam esta linha errar para o lado brando (o diálogo trataria o negócio do
   * colega como se fosse seu); é texto, não permissão — quem decide se o gesto pode acontecer é
   * `registrar_retorno` no servidor, e o aviso ao dono sai de lá do mesmo jeito.
   */
  function aoRetomarDaTabela(linha: NegocioEmRisco) {
    const dono = (linha.responsavel ?? '').trim();
    const euMesmo = dono.toLowerCase() === (profile?.nome ?? '').trim().toLowerCase();
    setAlvo({
      pedidoId: linha.id,
      titulo: linha.nome,
      responsavel: !dono || euMesmo ? null : dono,
    });
  }

  const { total, valorEmJogo } = useMemo(() => {
    const itens = pauta ?? [];
    return {
      total: itens.length,
      valorEmJogo: itens.reduce((soma, i) => soma + (i.valor ?? 0), 0),
    };
  }, [pauta]);

  const hoje = new Date();

  // 🔴 A FILA VAZIA ESPERA A TABELA RESPONDER; A FILA CHEIA NÃO ESPERA NADA.
  //
  // O esqueleto cobria só `usePauta`, e a sequência de toda visita era: esqueleto → "Pauta
  // zerada" sozinha → a tabela do time aparecendo embaixo com 159 negócios. Quem só supervisiona
  // via a comemoração piscar todo santo dia. Enquanto a tabela não responde, ninguém sabe se a
  // fila vazia é o fim do dia ou só o começo da tela — e o esqueleto é a única coisa honesta a
  // mostrar nesse instante.
  //
  // Mas isso vale SÓ quando a fila está vazia. Segurar a fila cheia até a tabela responder seria
  // trocar um defeito por outro maior: a consulta da tabela tenta de novo sozinha quando falha, e
  // com a soma das esperas a tela ficaria em esqueleto por segundos com os itens já em mãos.
  const esperandoOTime = total === 0 && carregandoOTime;

  // A fila vazia só COMEMORA quando a tabela de baixo RESPONDEU e veio vazia. Para as três
  // gestoras da MD que não têm negócio próprio, a fila fica em zero todo dia — comemorar ali
  // seria dizer "acabou" logo acima de uma tabela com a carteira da equipe inteira. E ausência de
  // resposta não é resposta: sem saber o que há embaixo, a tela usa a frase sóbria, que não
  // promete nada.
  const filaVaziaEComemora = total === 0 && timeRespondeu && totalDoTime === 0;

  return (
    <AppLayout title="Hoje" subtitle={format(hoje, "EEEE, d 'de' MMMM", { locale: ptBR })}>
      <div className="mx-auto w-full max-w-5xl p-3 sm:p-4 md:p-6">
        {isLoading || esperandoOTime ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-2/3" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          </div>
        ) : filaVaziaEComemora ? (
          // O vazio COMEMORA. É o dia em que a pessoa terminou — e é exatamente o momento
          // que faz ela abrir a tela amanhã.
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sun className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-card-foreground">Pauta zerada</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Nada em aberto para hoje. Nenhum orçamento parado além do prazo e nenhum
              compromisso na agenda.
            </p>
          </div>
        ) : total === 0 ? (
          // A fila está vazia, mas HÁ o que fazer logo abaixo. Sem comemoração e sem sol: para
          // quem supervisiona, a fila própria vazia é o normal do dia, não uma conquista — e uma
          // frase de "acabou" logo acima de uma tabela cheia é simplesmente falsa.
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <h2 className="text-xl font-semibold text-card-foreground">Sua fila está vazia</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Nada seu passou do prazo e não há compromisso na agenda de hoje.{' '}
              {totalDoTime > 0
                ? `O que pede atenção está na tabela logo abaixo — ${totalDoTime} ${totalDoTime === 1 ? 'negócio' : 'negócios'}.`
                : 'O que pede atenção está na tabela logo abaixo.'}
            </p>
          </div>
        ) : (
          <>
            <header className="mb-6">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-card-foreground sm:text-[34px]">
                {total === 1 ? '1 coisa espera você' : `${total} coisas esperam você`}
                <span className="text-primary">.</span>
              </h2>
              {valorEmJogo > 0 && (
                <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
                  {formatarMoedaBRL(valorEmJogo)} em jogo
                </p>
              )}
            </header>

            {/* Duas colunas, em duplas. Com número ímpar, o ÚLTIMO ocupa a linha toda —
                senão sobra um buraco do lado dele e a tela fica torta. */}
            <ol className="grid list-none gap-4 p-0 sm:grid-cols-2">
              {pauta!.map((item, i) => (
                <ItemPauta
                  key={`${item.tipo}-${item.referencia_id}`}
                  item={item}
                  larguraInteira={total % 2 === 1 && i === total - 1}
                  aoAgir={() =>
                    // 🔴 O negócio abre AQUI, por cima da pauta — não leva mais para a tela de
                    // Negócios. Quem clica em "Abrir negócio" está no meio de uma fila de
                    // trabalho: trocar de tela custava o lugar na fila, o filtro escolhido e a
                    // rolagem, e voltar significava recomeçar. O painel é o mesmo componente que
                    // a tela de Negócios monta (`PainelDoNegocio`), montado no fim desta página.
                    //
                    // Compromisso continua NAVEGANDO: a agenda é outra tela de verdade, com o
                    // dia inteiro em volta, e não cabe num painel lateral.
                    item.tipo === 'compromisso'
                      ? navigate('/calendario')
                      // Painel de visualização, não o formulário de edição: quem clica
                      // aqui quer ENTENDER o negócio antes de decidir o que fazer.
                      : abrirNegocio(item.referencia_id)
                  }
                  aoAdiar={() =>
                    setAlvo({
                      pedidoId: item.referencia_id,
                      titulo: item.titulo,
                      // Da fila vem SEMPRE nulo desde 09/09/2026 (a fila é pessoal, então o
                      // negócio é sempre de quem está olhando). O campo continua sendo lido
                      // porque a coluna existe e é o que o e-mail leria se um dia voltasse a
                      // haver item de outra pessoa aqui.
                      responsavel: item.responsavel,
                    })
                  }
                />
              ))}
            </ol>
          </>
        )}

        {/* Depois da pauta, de propósito: primeiro o que dá para resolver hoje, depois o
            tamanho do problema. Veio do Dashboard em 25/08/2026, inteiro e sem alteração
            de fórmula — lá ele não existe mais. */}
        <RadarDeRisco
          empresaId={empresaId}
          filtros={filtros}
          onChangeFiltros={trocarFiltros}
          podeFiltrarPorResponsavel={podeVerDeTodos}
          // A tabela do time abre o MESMO painel que a pauta de cima, pela `abrirNegocio` desta
          // página — ver `onAbrirNegocio` em RadarDeRisco.tsx para por que a tabela recebe isso
          // por propriedade em vez de conhecer o endereço sozinha.
          onAbrirNegocio={abrirNegocio}
          // E o MESMO diálogo de "Retomar depois" da fila, pelo mesmo motivo: um só por tela.
          onRetomarNegocio={aoRetomarDaTabela}
        />
      </div>

      <DialogoRetorno
        aberto={alvo !== null}
        aoFechar={() => setAlvo(null)}
        pedidoId={alvo?.pedidoId ?? null}
        tituloDoNegocio={alvo?.titulo ?? ''}
        // Vem preenchido só quando o negócio é de outra pessoa — é o que faz o diálogo parar
        // de dizer "SUA pauta" para quem está adiando o negócio de um colega.
        responsavel={alvo?.responsavel ?? null}
      />

      {/* UM painel para a tela inteira — a pauta de cima e a tabela do time de baixo abrem os
          dois o MESMO, pela mesma `abrirNegocio` daqui. Montar um segundo painel dentro do
          `RadarDeRisco` abriria duas cópias sobrepostas do mesmo negócio.

          Três propriedades opcionais NÃO são passadas, de propósito:

          • `onExcluir` — sem ela o botão Excluir nem é desenhado. Excluir negócio pela pauta não
            foi pedido, e a exclusão da tela de Negócios depende da máquina de seleção em massa
            de lá, que não existe aqui.
          • `negocioJaCarregado` — a pauta não tem as linhas dos negócios em mãos (`pauta_do_dia`
            devolve título, valor e id, não o negócio inteiro com as relações). Sem ela o painel
            busca por id sozinho, que é exatamente o caso para o qual `usePedidoPorId` existe.
          • `camposExtras` — o bloco de campos extras não aparece na pauta. Decisão registrada em
            `docs/superpowers/specs/2026-09-09-hoje-tabela-do-time-e-voz-design.md`: a lista sai de
            `useTableSettings({ key: 'pedidos' })`, que é a preferência de COLUNAS DA TABELA de
            Negócios; montar esse hook aqui traria uma leitura de `configuracoes_tabelas` a cada
            visita e uma REGRAVAÇÃO da mesma linha logo depois (o efeito de salvar dispara quando
            a carga do servidor troca `columns`) — a corrida que a propriedade existe para evitar.
            E a pauta é uma fila de ação: campo extra vazio ocupa espaço sem informar. */}
      <PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />
    </AppLayout>
  );
};

export default Hoje;
