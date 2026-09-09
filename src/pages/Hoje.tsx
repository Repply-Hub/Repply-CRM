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
import {
  lerFiltrosDoEndereco,
  escreverFiltrosNoEndereco,
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

const Hoje = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: pauta, isLoading } = usePauta();
  const [alvo, setAlvo] = useState<ItemDaPauta | null>(null);

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
  // 🔴 A CHAVE, NÃO O PAPEL. Era `profile.role in (admin, gestor, empresa)`, e isso passou a
  // discordar do servidor: desde a Tarefa 4 a pauta lê a chave `pauta_de_todos` e ela MANDA
  // sobre o papel — um gestor com o interruptor desligado à mão volta a ver só os próprios.
  // O painel de baixo agora usa a mesma leitura (ver `usePossoVerPautaDeTodos`).
  const podeVerDeTodos = usePossoVerPautaDeTodos();

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

  const { total, valorEmJogo } = useMemo(() => {
    const itens = pauta ?? [];
    return {
      total: itens.length,
      valorEmJogo: itens.reduce((soma, i) => soma + (i.valor ?? 0), 0),
    };
  }, [pauta]);

  const hoje = new Date();

  return (
    <AppLayout title="Hoje" subtitle={format(hoje, "EEEE, d 'de' MMMM", { locale: ptBR })}>
      <div className="mx-auto w-full max-w-5xl p-3 sm:p-4 md:p-6">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-2/3" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          </div>
        ) : total === 0 ? (
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
                  aoAdiar={() => setAlvo(item)}
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
          // A tabela "Os 10 maiores em risco" abre o MESMO painel que a pauta de cima, pela
          // `abrirNegocio` desta página — ver `onAbrirNegocio` em RadarDeRisco.tsx para por que a
          // tabela recebe isso por propriedade em vez de conhecer o endereço sozinha.
          onAbrirNegocio={abrirNegocio}
        />
      </div>

      <DialogoRetorno
        aberto={alvo !== null}
        aoFechar={() => setAlvo(null)}
        pedidoId={alvo?.referencia_id ?? null}
        tituloDoNegocio={alvo?.titulo ?? ''}
        // Vem preenchido só quando o negócio é de outra pessoa — é o que faz o diálogo parar
        // de dizer "SUA pauta" para quem está adiando o negócio de um colega.
        responsavel={alvo?.responsavel ?? null}
      />

      {/* UM painel para a tela inteira — a pauta de cima e a tabela "Os 10 maiores em risco" de
          baixo abrem os dois o MESMO, pela mesma `abrirNegocio` daqui. Montar um segundo painel
          dentro do `RadarDeRisco` abriria duas cópias sobrepostas do mesmo negócio.

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
