import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CheckCircle2, Circle, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useObraVisitas, useMarcarVisitaRealizada } from '@/hooks/use-obra-visitas';

/**
 * Histórico de visitas da obra: toda vez que uma "rota de visita" inclui esta
 * obra, uma linha aparece aqui — venha de uma visita já registrada como
 * realizada (relato retroativo) ou de uma visita ainda planejada.
 *
 * "Realizada"/"Planejada" é uma marcação manual (`visita_realizada`), não
 * deduzida pela data: uma visita agendada pode não acontecer, e uma visita
 * pode ser registrada bem depois de ter ocorrido. Decisão do dono do produto
 * em 25/08/2026.
 */
export function HistoricoVisitasObra({ obraId }: { obraId: string }) {
  const { profile } = useAuth();
  const { data: visitas, isLoading } = useObraVisitas(obraId);
  const { data: usuarios = [] } = useVendedores();
  const marcarRealizada = useMarcarVisitaRealizada();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [observacaoRascunho, setObservacaoRascunho] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando o histórico de visitas...
      </div>
    );
  }

  if (!visitas || visitas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Nenhuma visita registrada ainda</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Crie uma rota de visita na tela de Obras ou no Calendário e marque esta obra como
          parada para ela aparecer aqui.
        </p>
      </div>
    );
  }

  const nomePor = (userId: string) =>
    usuarios.find((u) => u.user_id === userId)?.nome || 'Alguém da equipe';

  return (
    <div className="space-y-2">
      {visitas.map((visita) => {
        const podeMarcar = profile?.user_id === visita.criadoPor;
        const editando = editandoId === visita.id;

        return (
          <div key={visita.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {format(new Date(visita.inicio), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  {!visita.diaInteiro && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {format(new Date(visita.inicio), 'HH:mm')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Registrado por {nomePor(visita.criadoPor)}
                </p>
              </div>
              <Badge
                variant={visita.visitaRealizada ? 'default' : 'outline'}
                className="shrink-0 gap-1 text-[10px]"
              >
                {visita.visitaRealizada ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {visita.visitaRealizada ? 'Realizada' : 'Planejada'}
              </Badge>
            </div>

            {visita.visitaObservacao && !editando && (
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-foreground">
                {visita.visitaObservacao}
              </p>
            )}

            {podeMarcar && editando && (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={observacaoRascunho}
                  onChange={(e) => setObservacaoRascunho(e.target.value)}
                  placeholder="O que você viu na obra?"
                  className="min-h-20 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditandoId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={marcarRealizada.isPending}
                    onClick={() => {
                      marcarRealizada.mutate(
                        { grupoId: visita.grupoId, obraId, realizada: true, observacao: observacaoRascunho },
                        { onSuccess: () => setEditandoId(null) },
                      );
                    }}
                  >
                    {marcarRealizada.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            )}

            {podeMarcar && !editando && !visita.visitaRealizada && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => {
                  setObservacaoRascunho(visita.visitaObservacao || '');
                  setEditandoId(visita.id);
                }}
              >
                Marcar como realizada
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
