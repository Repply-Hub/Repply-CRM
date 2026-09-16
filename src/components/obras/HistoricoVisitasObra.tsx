import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CheckCircle2, Circle, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useObraVisitas, useMarcarVisitaRealizada } from '@/hooks/use-obra-visitas';
import {
  rotuloDaFase,
  respostasDaVisita,
  type RespostasDaVisita,
} from '@/lib/analise-da-visita';
import { PerguntasDaVisita } from './PerguntasDaVisita';
import { ResumoDaVisita } from './ResumoDaVisita';

/**
 * Histórico de visitas da obra: toda vez que uma "rota de visita" inclui esta
 * obra, uma linha aparece aqui — venha de uma visita já registrada como
 * realizada (relato retroativo) ou de uma visita ainda planejada.
 *
 * "Realizada"/"Planejada" é uma marcação manual (`visita_realizada`), não
 * deduzida pela data: uma visita agendada pode não acontecer, e uma visita
 * pode ser registrada bem depois de ter ocorrido. Decisão do dono do produto
 * em 25/08/2026.
 *
 * 🔴 AS PERGUNTAS DA VISITA APARECEM AQUI TAMBÉM (Tarefa 8, pedido do Lucas: "nos três
 * lugares"). É o MESMO componente `PerguntasDaVisita` da aba Visitas e da janela da rota — marcar
 * a visita como feita por aqui grava as cinco respostas e, com próximo passo + data e a caixinha
 * marcada, cria a tarefa de acompanhamento, igual aos outros dois lugares. `nomeObra`/`clienteId`
 * vêm da obra que está aberta na tela (a mesma para todas as visitas desta lista).
 */
export function HistoricoVisitasObra({
  obraId,
  nomeObra,
  clienteId,
  clienteEmpresa,
}: {
  obraId: string;
  nomeObra?: string | null;
  clienteId?: string | null;
  clienteEmpresa?: string | null;
}) {
  const { profile } = useAuth();
  const { data: visitas, isLoading } = useObraVisitas(obraId);
  const { data: usuarios = [] } = useVendedores();
  const marcarRealizada = useMarcarVisitaRealizada();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<RespostasDaVisita>(respostasDaVisita());

  // A fase mais recente que ALGUÉM respondeu — não a da última visita, porque a última pode ter
  // sido registrada sem responder nada. As visitas já chegam da mais nova para a mais antiga
  // (`useObraVisitas` ordena por `inicio`), então o primeiro com fase é o mais recente. Sem
  // nenhuma resposta, `ultimaFase` fica indefinido e nada aparece: ausência de informação não
  // vira informação.
  const ultimaFase = useMemo(
    () => (visitas ?? []).find((v) => rotuloDaFase(v.visitaFase) !== ''),
    [visitas],
  );

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
      {ultimaFase && (
        <p className="text-xs text-muted-foreground">
          Fase:{' '}
          <span className="font-medium text-foreground">{rotuloDaFase(ultimaFase.visitaFase)}</span>
          {' · visto em '}
          {format(new Date(ultimaFase.inicio), 'dd/MM')}
        </p>
      )}

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

            {/* 🔴 A ANÁLISE É DE QUEM VÊ O CARTÃO, não só de quem registrou — mesma decisão da
                revisão do Task 6a na aba Visitas. `ResumoDaVisita` já inclui a linha "Obs.: …",
                por isso a observação não tem mais um parágrafo à parte (apareceria duas vezes).
                Numa visita sem nenhuma resposta o resumo é vazio e não desenha nada. */}
            {!editando && (
              <ResumoDaVisita
                analise={{
                  fase: visita.visitaFase,
                  concorrentes: visita.visitaConcorrentes,
                  contatoNome: visita.contatoNome,
                  proximoPasso: visita.visitaProximoPasso,
                  proximoPassoEm: visita.visitaProximoPassoEm,
                  observacao: visita.visitaObservacao,
                }}
              />
            )}

            {podeMarcar && editando && (
              <div className="mt-2 space-y-3">
                <PerguntasDaVisita
                  valor={rascunho}
                  onChange={setRascunho}
                  clienteId={clienteId}
                  clienteEmpresa={clienteEmpresa}
                  disabled={marcarRealizada.isPending}
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
                        {
                          grupoId: visita.grupoId,
                          obraId,
                          realizada: true,
                          observacao: rascunho.observacao,
                          respostas: rascunho,
                          nomeObra,
                          clienteId,
                        },
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
                  setRascunho(respostasDaVisita(visita));
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
