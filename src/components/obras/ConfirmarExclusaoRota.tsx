import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import type { RotaDoDia } from '@/lib/rota-do-dia';

/**
 * Confirmação antes de apagar uma rota de visita.
 *
 * 🔴 A JANELA LISTA AS PARADAS, uma a uma, em vez de perguntar "tem certeza?".
 *
 * Excluir uma rota apaga VÁRIOS compromissos de uma vez, e "rota de quinta" não diz quais. Quem
 * tem duas rotas parecidas na semana não tem como saber se está apagando a certa até já ter
 * apagado — e não há como desfazer. Ver o que vai sumir é o que transforma a confirmação em
 * decisão, em vez de um clique reflexo.
 *
 * E avisa quando há visita JÁ REALIZADA no meio: essas carregam observação de campo, escrita
 * depois da visita, que some junto. É a única parte da exclusão que apaga trabalho e não só
 * agendamento.
 */

interface ConfirmarExclusaoRotaProps {
  /** `null` mantém a janela fechada. */
  rota: RotaDoDia | null;
  excluindo: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function ConfirmarExclusaoRota({
  rota,
  excluindo,
  onCancelar,
  onConfirmar,
}: ConfirmarExclusaoRotaProps) {
  const realizadas = (rota?.paradas ?? []).filter((p) => p.visitaRealizada);

  return (
    <AlertDialog open={!!rota} onOpenChange={(aberto) => !aberto && !excluindo && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Excluir a rota{' '}
            <span className="capitalize">
              {rota ? `de ${format(rota.data, "EEEE, d 'de' MMMM", { locale: ptBR })}` : ''}
            </span>
            ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {rota?.paradas.length === 1
                  ? 'Esta visita sai também do calendário da empresa — é o mesmo agendamento, não uma cópia.'
                  : `Estas ${rota?.paradas.length ?? 0} visitas saem também do calendário da empresa — são os mesmos agendamentos, não cópias.`}{' '}
                Não dá para desfazer.
              </p>

              <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-2.5">
                {(rota?.paradas ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {format(p.inicio, 'HH:mm')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.obraNome ?? 'Obra sem nome'}</span>
                    {p.visitaRealizada && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </li>
                ))}
              </ul>

              {realizadas.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span>
                    {realizadas.length === 1
                      ? '1 destas visitas já foi realizada.'
                      : `${realizadas.length} destas visitas já foram realizadas.`}{' '}
                    O que foi anotado no campo depois da visita some junto.
                  </span>
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={excluindo}
            onClick={(e) => {
              // 🔴 O Radix fecha a janela no clique da ação, por padrão. Sem isto ela sumiria
              // antes da resposta do banco, e uma falha de exclusão viraria um aviso solto sobre
              // uma tela que já mudou — a pessoa acharia que deu certo.
              e.preventDefault();
              onConfirmar();
            }}
            className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
            {excluindo ? 'Excluindo…' : 'Excluir rota'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
