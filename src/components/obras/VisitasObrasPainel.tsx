import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CheckCircle2, Circle, MapPin, Building2, HardHat, Route, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useTodasVisitasObras, useMarcarVisitaRealizada, type VisitaObraListagem } from '@/hooks/use-obra-visitas';
import { agruparEmRotasDoDia, type RotaDoDia } from '@/lib/rota-do-dia';
import { linkDoGoogleMaps, mensagemDaRota } from '@/lib/rota-no-whatsapp';
import { EnviarRotaDialog } from './EnviarRotaDialog';

interface VisitasObrasPainelProps {
  searchTerm: string;
  onSelectObra: (obraId: string) => void;
  /** Mostrar o trajeto daquele dia no mapa. Sem isto, os botões de rota não aparecem. */
  onVerRotaNoMapa?: (rota: RotaDoDia) => void;
}

/**
 * Aba "Visitas": toda visita (planejada ou já realizada) de qualquer obra da
 * empresa, numa lista só, mais recente primeiro. É a mesma base de dados de
 * `HistoricoVisitasObra` (eventos com `obra_id`), sem o filtro por uma obra —
 * aqui é para quem quer ver a agenda de visitas inteira, não uma obra de
 * cada vez.
 */
export function VisitasObrasPainel({
  searchTerm,
  onSelectObra,
  onVerRotaNoMapa,
}: VisitasObrasPainelProps) {
  const { profile } = useAuth();
  const { data: visitas, isLoading } = useTodasVisitasObras();
  const { data: usuarios = [] } = useVendedores();
  const marcarRealizada = useMarcarVisitaRealizada();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [observacaoRascunho, setObservacaoRascunho] = useState('');
  const [rotaParaEnviar, setRotaParaEnviar] = useState<RotaDoDia | null>(null);

  const filtradas = useMemo(() => {
    const lista = visitas ?? [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (v) => v.nomeObra.toLowerCase().includes(q) || (v.clienteEmpresa ?? '').toLowerCase().includes(q),
    );
  }, [visitas, searchTerm]);

  // Agrupa por DIA preservando a ordem que veio do banco (mais recente primeiro). A chave é
  // `yyyy-MM-dd` e não o objeto Date: duas datas do mesmo dia são objetos diferentes, e
  // agrupar por objeto criaria um bloco por visita.
  const porDia = useMemo(() => {
    const mapa = new Map<string, { chave: string; dia: Date; visitasDoDia: typeof filtradas }>();
    for (const v of filtradas) {
      const dia = new Date(v.inicio);
      const chave = format(dia, 'yyyy-MM-dd');
      const grupo = mapa.get(chave);
      if (grupo) grupo.visitasDoDia.push(v);
      else mapa.set(chave, { chave, dia, visitasDoDia: [v] });
    }
    return [...mapa.values()];
  }, [filtradas]);

  /**
   * As rotas que dá para desenhar, indexadas pelo dia.
   *
   * 🔴 SEPARADAS POR PESSOA, e não só por dia. Duas pessoas visitando obras no mesmo dia são
   * DOIS carros — juntá-las num traçado só desenharia um caminho que ninguém vai fazer, e o
   * tempo total seria a soma de dois trajetos diferentes. Medido em 27/08/2026: nenhum dia da
   * base tem visita de duas pessoas, mas a equipe tem 13 pessoas e isso não vai continuar assim.
   */
  const rotasPorDia = useMemo(() => {
    const mapa = new Map<string, RotaDoDia[]>();
    for (const rota of agruparEmRotasDoDia(
      filtradas.map((v) => ({
        id: v.id,
        obraId: v.obraId,
        obraNome: v.nomeObra,
        inicio: new Date(v.inicio),
        criadoPor: v.criadoPor,
        latitude: v.latitude,
        longitude: v.longitude,
      })),
    )) {
      if (!rota.podeDesenhar) continue;
      const chave = format(rota.data, 'yyyy-MM-dd');
      const lista = mapa.get(chave);
      if (lista) lista.push(rota);
      else mapa.set(chave, [rota]);
    }
    return mapa;
  }, [filtradas]);

  const textoDaRota = (rota: RotaDoDia) => {
    const paradas = rota.paradas.map((p) => ({
      nome: p.obraNome,
      horario: p.inicio,
      lat: p.latitude,
      lng: p.longitude,
    }));
    return mensagemDaRota({ data: rota.data, paradas, link: linkDoGoogleMaps(paradas) });
  };

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
    // 🔴 BLOCOS DE DIA LADO A LADO, e não uma lista corrida.
    //
    // Antes era um `space-y-5` com um cabeçalho de dia inserido no meio quando a data mudava:
    // o dia não era um container, era um rótulo solto. Numa tela larga isso dava uma coluna
    // estreita de cartões e metade da largura em branco, e quem queria comparar "o que tem na
    // quinta" com "o que tem na sexta" precisava rolar de um até o outro.
    //
    // Cada dia virou um cartão próprio, e os cartões se arrumam em grade — mesma ideia do
    // drive de catálogos das fábricas. Pedido do Lucas em 27/08/2026.
    <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {porDia.map(({ chave, dia, visitasDoDia }) => {
        const rotasDoDia = rotasPorDia.get(chave) ?? [];
        // Só nomeia a pessoa quando há mais de uma rota no dia: com uma só, dizer de quem é
        // seria ruído — é de quem está olhando, quase sempre.
        const precisaNomear = rotasDoDia.length > 1;

        return (
        <section key={chave} className="rounded-xl border border-border bg-card">
          <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold capitalize text-card-foreground">
              {format(dia, "EEEE, d 'de' MMM", { locale: ptBR })}
            </h3>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {visitasDoDia.length} {visitasDoDia.length === 1 ? 'visita' : 'visitas'}
            </span>
          </header>

          {/* Rota do dia. Só aparece quando há 2+ paradas COM localização: com uma parada só
              não há trajeto, e sem localização não há o que desenhar. */}
          {rotasDoDia.length > 0 && (
            <div className="space-y-1.5 border-b border-border bg-muted/30 px-3 py-2">
              {rotasDoDia.map((rota) => (
                <div key={rota.chave} className="flex flex-wrap items-center gap-1.5">
                  {precisaNomear && (
                    <span className="mr-auto truncate text-xs text-muted-foreground">
                      {nomePor(rota.criadoPor ?? '')}
                    </span>
                  )}
                  {onVerRotaNoMapa && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={() => onVerRotaNoMapa(rota)}
                    >
                      <Route className="h-3.5 w-3.5" />
                      Ver no mapa
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setRotaParaEnviar(rota)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar
                  </Button>
                  {rota.semPonto.length > 0 && (
                    // Dizer o que ficou de fora é o que impede a pessoa de achar que a rota tem
                    // menos paradas do que ela cadastrou.
                    <span className="w-full text-[11px] text-muted-foreground">
                      {rota.semPonto.length}{' '}
                      {rota.semPonto.length === 1
                        ? 'obra sem localização fica fora do mapa'
                        : 'obras sem localização ficam fora do mapa'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 p-3">
            {visitasDoDia.map((visita) => (
              <VisitaCard
                key={visita.id}
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
                podeAlternar={profile?.user_id === visita.criadoPor}
                onAlternarStatus={() =>
                  marcarRealizada.mutate({
                    grupoId: visita.grupoId,
                    obraId: visita.obraId,
                    realizada: !visita.visitaRealizada,
                    observacao: visita.visitaObservacao ?? '',
                  })
                }
                salvando={marcarRealizada.isPending}
              />
            ))}
          </div>
        </section>
        );
      })}

      <EnviarRotaDialog
        open={!!rotaParaEnviar}
        onOpenChange={(aberto) => !aberto && setRotaParaEnviar(null)}
        mensagem={rotaParaEnviar ? textoDaRota(rotaParaEnviar) : ''}
        totalDeParadas={rotaParaEnviar?.paradas.length ?? 0}
      />
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
  onAlternarStatus,
  podeAlternar,
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
  /** Alterna Planejada <-> Realizada direto pelo selo, sem passar pela observação. */
  onAlternarStatus: () => void;
  /** Só quem registrou a visita alterna. Para os outros o selo é leitura. */
  podeAlternar: boolean;
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
        {/* 🔴 O SELO ALTERNA NOS DOIS SENTIDOS. Antes ele era só enfeite: dava para marcar
            como realizada pelo botão de baixo, e NÃO havia caminho nenhum na tela para
            desmarcar — quem clicasse por engano ficava com a visita realizada para sempre.
            A gravação já aceitava `realizada: false`; faltava a porta.

            Só quem registrou a visita alterna (`podeAlternar`); para os outros continua
            sendo um selo de leitura, com o mesmo desenho. */}
        {podeAlternar ? (
          <button
            type="button"
            disabled={salvando}
            onClick={onAlternarStatus}
            title={visita.visitaRealizada ? 'Marcar como planejada' : 'Marcar como realizada'}
            aria-label={visita.visitaRealizada ? 'Marcar como planejada' : 'Marcar como realizada'}
            className="shrink-0 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <Badge variant={visita.visitaRealizada ? 'default' : 'outline'} className="cursor-pointer gap-1 text-[10px]">
              {visita.visitaRealizada ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {visita.visitaRealizada ? 'Realizada' : 'Planejada'}
            </Badge>
          </button>
        ) : (
          <Badge variant={visita.visitaRealizada ? 'default' : 'outline'} className="shrink-0 gap-1 text-[10px]">
            {visita.visitaRealizada ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {visita.visitaRealizada ? 'Realizada' : 'Planejada'}
          </Badge>
        )}
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
