import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CheckCircle2, Circle, MapPin, Building2, HardHat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useTodasVisitasObras, useMarcarVisitaRealizada, type VisitaObraListagem } from '@/hooks/use-obra-visitas';

interface VisitasObrasPainelProps {
  searchTerm: string;
  onSelectObra: (obraId: string) => void;
}

/**
 * Aba "Visitas": toda visita (planejada ou já realizada) de qualquer obra da
 * empresa, numa lista só, mais recente primeiro. É a mesma base de dados de
 * `HistoricoVisitasObra` (eventos com `obra_id`), sem o filtro por uma obra —
 * aqui é para quem quer ver a agenda de visitas inteira, não uma obra de
 * cada vez.
 */
export function VisitasObrasPainel({ searchTerm, onSelectObra }: VisitasObrasPainelProps) {
  const { profile } = useAuth();
  const { data: visitas, isLoading } = useTodasVisitasObras();
  const { data: usuarios = [] } = useVendedores();
  const marcarRealizada = useMarcarVisitaRealizada();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [observacaoRascunho, setObservacaoRascunho] = useState('');

  const filtradas = useMemo(() => {
    const lista = visitas ?? [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (v) => v.nomeObra.toLowerCase().includes(q) || (v.clienteEmpresa ?? '').toLowerCase().includes(q),
    );
  }, [visitas, searchTerm]);

  const nomePor = (userId: string) => usuarios.find((u) => u.user_id === userId)?.nome || 'Alguém da equipe';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filtradas.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <HardHat className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhuma visita encontrada</p>
        <p className="text-sm mt-1">
          {searchTerm ? 'Ajuste a busca.' : 'Crie uma rota de visita para começar.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {filtradas.map((visita, index) => {
        const anterior = filtradas[index - 1];
        const novoDia = !anterior || !isSameDay(new Date(anterior.inicio), new Date(visita.inicio));
        return (
          <div key={visita.id}>
            {novoDia && (
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {format(new Date(visita.inicio), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
            )}
            <VisitaCard
              visita={visita}
              podeMarcar={profile?.user_id === visita.criadoPor}
              editando={editandoId === visita.id}
              observacaoRascunho={observacaoRascunho}
              onObservacaoChange={setObservacaoRascunho}
              nomeCriador={nomePor(visita.criadoPor)}
              onSelectObra={onSelectObra}
              onIniciarEdicao={() => {
                setObservacaoRascunho(visita.visitaObservacao || '');
                setEditandoId(visita.id);
              }}
              onCancelarEdicao={() => setEditandoId(null)}
              onSalvar={() =>
                marcarRealizada.mutate(
                  { grupoId: visita.grupoId, obraId: visita.obraId, realizada: true, observacao: observacaoRascunho },
                  { onSuccess: () => setEditandoId(null) },
                )
              }
              salvando={marcarRealizada.isPending}
            />
          </div>
        );
      })}
    </div>
  );
}

function VisitaCard({
  visita,
  podeMarcar,
  editando,
  observacaoRascunho,
  onObservacaoChange,
  nomeCriador,
  onSelectObra,
  onIniciarEdicao,
  onCancelarEdicao,
  onSalvar,
  salvando,
}: {
  visita: VisitaObraListagem;
  podeMarcar: boolean;
  editando: boolean;
  observacaoRascunho: string;
  onObservacaoChange: (v: string) => void;
  nomeCriador: string;
  onSelectObra: (obraId: string) => void;
  onIniciarEdicao: () => void;
  onCancelarEdicao: () => void;
  onSalvar: () => void;
  salvando: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onSelectObra(visita.obraId)}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-primary hover:underline"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{visita.nomeObra}</span>
          </button>
          {visita.clienteEmpresa && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{visita.clienteEmpresa}</span>
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {!visita.diaInteiro && (
              <span className="font-mono">{format(new Date(visita.inicio), 'HH:mm')} · </span>
            )}
            Registrado por {nomeCriador}
          </p>
        </div>
        <Badge variant={visita.visitaRealizada ? 'default' : 'outline'} className="shrink-0 gap-1 text-[10px]">
          {visita.visitaRealizada ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
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
            onChange={(e) => onObservacaoChange(e.target.value)}
            placeholder="O que você viu na obra?"
            className="min-h-20 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancelarEdicao}>
              Cancelar
            </Button>
            <Button size="sm" disabled={salvando} onClick={onSalvar}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {podeMarcar && !editando && !visita.visitaRealizada && (
        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={onIniciarEdicao}>
          Marcar como realizada
        </Button>
      )}
    </div>
  );
}
