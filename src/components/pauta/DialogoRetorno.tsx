import { useState, useEffect } from 'react';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { avisoDaTarefaDoRetorno } from '@/lib/aviso-da-tarefa-do-retorno';
import { useRegistrarRetorno } from '@/hooks/use-pauta';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  pedidoId: string | null;
  tituloDoNegocio: string;
  /**
   * Nome do dono, **só quando o negócio não é de quem está olhando** — é o `responsavel` que
   * `pauta_do_dia_de` devolve. Nulo significa "é meu", não "não sei de quem é".
   */
  responsavel?: string | null;
}

/** Sugestão inicial: daqui a uma semana. É o intervalo mais comum de "me retorna depois". */
function sugestaoDeRetorno(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

/**
 * A data mais cedo que se pode escolher: AMANHÃ, nunca hoje.
 *
 * 🔴 HOJE NÃO É UMA ESCOLHA VÁLIDA, e o motivo é que a tela mentiria. A pauta pergunta
 * `r.ate <= v_hoje` (migration `20260907150000`): retorno marcado para hoje já venceu no
 * mesmo instante em que foi gravado, o negócio CONTINUA na pauta — enquanto o dono recebe o
 * aviso dizendo que ele "saiu da pauta até <a data de hoje>". Quem adiou vê o item reaparecer
 * e conclui que o botão não funcionou.
 *
 * `addDays` do date-fns lê o fuso LOCAL, igual ao calendário e ao `format` da gravação — a
 * mesma família, sem conversão no meio (CLAUDE.md §7.12). O `before` do react-day-picker
 * compara por DIA de calendário, então a hora aqui não influencia.
 */
function primeiroDiaPermitido(): Date {
  return addDays(new Date(), 1);
}

/**
 * "Retomar depois" — o que substituiu o simples adiar.
 *
 * Pede duas coisas, e as duas são o ponto: o MOTIVO (que vira registro visível para a
 * equipe no histórico do negócio) e a DATA DE RETORNO (quando vale a pena procurar de
 * novo). Tem cotação de hoje para compra do mês que vem; tem cliente que pediu uma semana
 * para olhar. Sem a data, "adiar" seria uma soneca cega.
 *
 * 🔴 O ATRITO É PROPOSITAL. Ao adiar, outro item entra no lugar — a pauta não encolhe. Com
 * 193 negócios candidatos, adiar de graça viraria esteira infinita e a tela morreria como
 * morreram as notificações. Ter de escrever uma frase e escolher uma data é o que separa
 * "decidi adiar isto" de "tirei da frente sem pensar".
 *
 * 🔴 O TEXTO MUDA QUANDO O NEGÓCIO É DE UM COLEGA. Até 07/09/2026 ele dizia sempre "a SUA
 * pauta" e "o SEU calendário". Desde a Tarefa 4 quem tem a chave `pauta_de_todos` vê e adia o
 * negócio dos colegas — e aí as duas frases ficam erradas ao mesmo tempo:
 *
 *   · a pauta que muda é a do DONO (e a de quem adiou junto: sai das duas, é "uma verdade só");
 *   · o dono RECEBE UM AVISO com o motivo escrito aqui, o que a pessoa precisa saber ANTES de
 *     apertar o botão, não depois;
 *   · e o calendário nunca foi "seu": `use-eventos.ts` mostra os contatos da empresa inteira,
 *     então a data aparece para todo mundo. Isso já era verdade antes desta etapa.
 */
export function DialogoRetorno({
  aberto,
  aoFechar,
  pedidoId,
  tituloDoNegocio,
  responsavel,
}: Props) {
  const [motivo, setMotivo] = useState('');
  const [retorno, setRetorno] = useState<Date>(sugestaoDeRetorno);
  // Marcada por padrão: adiar sem deixar nada marcado na agenda é como o negócio some da
  // vista e ninguém volta a ele. Quem não quer a tarefa desmarca — é um clique, e a escolha
  // fica visível antes de apertar o botão, não escondida numa configuração.
  const [criarTarefa, setCriarTarefa] = useState(true);
  const registrar = useRegistrarRetorno();

  // Reabrir o diálogo para outro negócio tem de começar limpo: sem isto, o motivo do
  // anterior aparece escrito no próximo, e alguém salva sem reparar. 🔴 A caixinha entra na
  // mesma limpeza, e pelo mesmo motivo: desmarcada uma vez, ela ficaria desmarcada para
  // todos os negócios seguintes da sessão — e o padrão do produto é criar a tarefa.
  useEffect(() => {
    if (aberto) {
      setMotivo('');
      setRetorno(sugestaoDeRetorno());
      setCriarTarefa(true);
    }
  }, [aberto, pedidoId]);

  const motivoValido = motivo.trim().length >= 3;

  /**
   * 🔴 A MESMA STRING QUE VAI AO BANCO alimenta a frase de ajuda. Se cada uma formatasse a
   * data do seu jeito, a tela poderia prometer um dia e a gravação usar outro — e ninguém
   * repararia, porque as duas pareceriam certas isoladamente.
   *
   * `format` lê o fuso LOCAL, e o calendário entrega meia-noite local: os dois falam a mesma
   * língua e não há nada a converter. Passar por `toISOString()` aqui recuaria um dia a
   * partir das 21h (CLAUDE.md §7.12).
   */
  const retornoEmTexto = format(retorno, 'yyyy-MM-dd');

  /**
   * Nulo significa "o negócio é meu" — ver a propriedade `responsavel` lá em cima. Normalizado
   * num lugar só para a frase de ajuda e o aviso de sucesso não discordarem sobre quem recebe.
   */
  const donoDaTarefa = responsavel?.trim() || null;

  const salvar = async () => {
    if (!pedidoId || !motivoValido) return;
    try {
      await registrar.mutateAsync({
        pedidoId,
        motivo: motivo.trim(),
        retornoEm: retornoEmTexto,
        criarTarefa,
      });
      // O aviso de sucesso conta a SEGUNDA coisa que aconteceu. Sem isto, a pessoa acabou de
      // mandar trabalho para a agenda de um colega e a tela só fala do retorno — e o colega
      // descobre pela tarefa aparecendo na fila dele, sem que ninguém tenha avisado quem
      // criou. Desmarcada a caixinha, não há segunda linha porque não há segunda coisa.
      toast.success(
        `Retorno marcado para ${format(retorno, "dd 'de' MMMM", { locale: ptBR })}`,
        criarTarefa
          ? {
              description: donoDaTarefa
                ? `Uma tarefa foi criada para ${donoDaTarefa}.`
                : 'Uma tarefa foi criada no seu nome.',
            }
          : undefined,
      );
      aoFechar();
    } catch (e) {
      // Mesma armadilha da aba de Automação: o erro do banco não é um `Error`, e o
      // `instanceof` mandava todo mundo para a frase genérica. Ver `@/lib/mensagem-de-erro`.
      toast.error(
        `Não foi possível registrar: ${mensagemDeErro(e, 'tente de novo em instantes')}`,
      );
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle>Retomar depois</DialogTitle>
          <DialogDescription className="line-clamp-2">{tituloDoNegocio}</DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="motivo-retorno">Por que sai da pauta hoje? *</Label>
            <Textarea
              id="motivo-retorno"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: o cliente vai decidir depois que a obra começar"
              rows={3}
              autoFocus
              // Teto de tamanho: o motivo vira o texto do aviso que cai no sininho do dono, e o
              // sininho baixa até 50 avisos inteiros de uma vez. Sem teto, um motivo enorme
              // (medido: 1 MB concatena sem erro no banco) entope o sininho de outra pessoa.
              // 🔴 Isto fecha só o lado do NAVEGADOR — a função `registrar_retorno` continua
              // aceitando qualquer tamanho por chamada direta à API. Ver o relatório da Tarefa 6.
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">
              Isso fica registrado no histórico do negócio, visível para a equipe.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Quando vale a pena procurar de novo? *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(retorno, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={retorno}
                  // `selected` NÃO decide o mês de abertura no react-day-picker v8 — só
                  // `month ?? defaultMonth ?? hoje` (CLAUDE.md §7.13).
                  defaultMonth={retorno}
                  onSelect={(d) => d && setRetorno(d)}
                  locale={ptBR}
                  // Piso em AMANHÃ, não em hoje: ver `primeiroDiaPermitido`.
                  disabled={{ before: primeiroDiaPermitido() }}
                  initialFocus
                  // Sem `captionLayout` a primitiva do projeto esconde o rótulo do mês e
                  // anula as setas: o calendário fica preso no mês atual, sem saída.
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear()}
                  toYear={new Date().getFullYear() + 3}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              {responsavel
                ? `Este negócio é de ${responsavel}. Ao marcar o retorno, ele sai da pauta de vocês dois até essa data, e ${responsavel} recebe um aviso com o motivo que você escreveu.`
                : 'O negócio volta para a sua pauta nesse dia.'}{' '}
              A data também aparece no calendário da equipe.
            </p>
          </div>

          {/*
            A caixinha vem DEPOIS da data de propósito: ela promete um prazo, e o prazo é a
            data escolhida logo acima. Invertida a ordem, a frase de ajuda falaria de um dia
            que a pessoa ainda não escolheu.
          */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="criar-tarefa-retorno"
                checked={criarTarefa}
                // `onCheckedChange` do Radix devolve também `'indeterminate'`, que nunca
                // acontece aqui — `=== true` é o que garante um booleano de verdade indo
                // para o banco, e não a string.
                onCheckedChange={(marcado) => setCriarTarefa(marcado === true)}
              />
              <Label htmlFor="criar-tarefa-retorno" className="cursor-pointer font-normal">
                Criar tarefa para o responsável
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {criarTarefa
                ? avisoDaTarefaDoRetorno(donoDaTarefa, retornoEmTexto)
                : 'Sem tarefa na agenda: só o retorno fica registrado.'}
            </p>
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" onClick={aoFechar} disabled={registrar.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!motivoValido || registrar.isPending}>
            {registrar.isPending ? 'Registrando…' : 'Marcar retorno'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
