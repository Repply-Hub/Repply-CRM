import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, Clock, Sun } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoedaBRL } from '@/lib/moeda';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { usePauta, type ItemDaPauta } from '@/hooks/use-pauta';
import { DialogoRetorno } from '@/components/pauta/DialogoRetorno';
import { RadarDeRisco } from '@/components/pauta/RadarDeRisco';

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
                    navigate(
                      item.tipo === 'compromisso'
                        ? '/calendario'
                        // Painel de visualização, não o formulário de edição: quem clica
                        // aqui quer ENTENDER o negócio antes de decidir o que fazer.
                        : `/app?negocio=${item.referencia_id}`,
                    )
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
        <RadarDeRisco empresaId={empresaId} />
      </div>

      <DialogoRetorno
        aberto={alvo !== null}
        aoFechar={() => setAlvo(null)}
        pedidoId={alvo?.referencia_id ?? null}
        tituloDoNegocio={alvo?.titulo ?? ''}
      />
    </AppLayout>
  );
};

export default Hoje;
