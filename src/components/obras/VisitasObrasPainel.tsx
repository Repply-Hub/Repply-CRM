import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { Loader2, CheckCircle2, Circle, MapPin, Building2, HardHat, Route, Send, Trash2, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type DateRange } from '@/components/shared/DateRangePicker';
import { useAuth } from '@/hooks/use-auth';
import { useVendedores } from '@/hooks/use-clientes';
import { useTodasVisitasObras, useMarcarVisitaRealizada, type VisitaObraListagem } from '@/hooks/use-obra-visitas';
import { agruparEmRotasDoDia, type RotaDoDia } from '@/lib/rota-do-dia';
import { normalizarTexto } from '@/lib/busca-de-obras';
import { linkDoGoogleMaps, mensagemDaRota } from '@/lib/rota-no-whatsapp';
import { EnviarRotaDialog } from './EnviarRotaDialog';
import { RotaNoMapaDialog } from './RotaNoMapaDialog';
import { useExcluirRotaDeVisita } from '@/hooks/use-eventos';
import { ConfirmarExclusaoRota } from './ConfirmarExclusaoRota';

interface VisitasObrasPainelProps {
  searchTerm: string;
  onSelectObra: (obraId: string) => void;
  /** Reabrir a rota para edição. Sem isto, o botão de editar não aparece. */
  onEditarRota?: (rota: RotaDoDia) => void;
  /**
   * Recorte de período, vindo do botão "Filtros" do cabeçalho da página.
   *
   * 🔴 MORA LÁ EM CIMA, e não aqui dentro, por pedido do dono do produto em 28/08/2026. A
   * primeira versão punha uma barra própria dentro desta aba: virava um segundo lugar de
   * filtrar, ao lado do botão que já existe para isso. `null` = sem recorte.
   */
  periodo?: DateRange | null;
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
  onEditarRota,
  periodo = null,
}: VisitasObrasPainelProps) {
  const { profile } = useAuth();
  const { data: visitas, isLoading } = useTodasVisitasObras();
  const { data: usuarios = [] } = useVendedores();
  const marcarRealizada = useMarcarVisitaRealizada();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [observacaoRascunho, setObservacaoRascunho] = useState('');
  const [rotaParaEnviar, setRotaParaEnviar] = useState<RotaDoDia | null>(null);
  // 🔴 A rota abre em JANELA PRÓPRIA, não no mapa geral de obras. O mapa geral tem 74 pinos e a
  // rota do dia tem três: procurar o trajeto no meio deles é trabalho, e trocar de aba ainda
  // faria a pessoa perder o filtro e a rolagem em que ela estava aqui. Pedido do Lucas.
  const [rotaNoMapa, setRotaNoMapa] = useState<RotaDoDia | null>(null);
  const [rotaParaExcluir, setRotaParaExcluir] = useState<RotaDoDia | null>(null);
  const excluirRota = useExcluirRotaDeVisita();

  const filtradas = useMemo(() => {
    let lista = visitas ?? [];

    // 🔴 A MESMA REGRA DA ABA LISTA, e não uma cópia simplificada.
    //
    // Aqui havia um `toLowerCase().includes()` sobre dois campos. A barra de busca é a MESMA
    // das outras abas, então digitar "sao" achava a obra na aba Lista (que normaliza acento) e
    // não achava a visita da mesma obra na aba ao lado. Barra que responde de dois jeitos
    // conforme a aba é pior que barra ruim: a pessoa conclui que a visita não existe.
    //
    // Cada palavra precisa aparecer em ALGUM campo, podendo ser campos diferentes — mesmo
    // critério "E" de `busca-de-obras.ts`: quem digita mais palavras quer reduzir a lista.
    const palavras = normalizarTexto(searchTerm).split(/\s+/).filter(Boolean);
    if (palavras.length > 0) {
      lista = lista.filter((v) => {
        const campos = [normalizarTexto(v.nomeObra), normalizarTexto(v.clienteEmpresa)];
        return palavras.every((palavra) => campos.some((campo) => campo.includes(palavra)));
      });
    }

    if (periodo) {
      // 🔴 O dia inteiro entra nas duas pontas. Comparar `Date` cru deixaria de fora a visita
      // das 14h do último dia escolhido, porque o `to` que o seletor entrega é a meia-noite
      // daquele dia — e a pessoa que filtrou "até 28/08" espera ver o 28/08 completo.
      const de = new Date(periodo.from);
      de.setHours(0, 0, 0, 0);
      const ate = new Date(periodo.to);
      ate.setHours(23, 59, 59, 999);
      lista = lista.filter((v) => {
        const quando = new Date(v.inicio).getTime();
        return quando >= de.getTime() && quando <= ate.getTime();
      });
    }

    return lista;
  }, [visitas, searchTerm, periodo]);

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
        // O que identifica a parada no banco. O `id` é o de UMA cópia; excluir por ele deixaria
        // a visita de pé na agenda dos outros participantes.
        grupoId: v.grupoId,
        obraId: v.obraId,
        obraNome: v.nomeObra,
        inicio: new Date(v.inicio),
        criadoPor: v.criadoPor,
        visitaRealizada: v.visitaRealizada,
        latitude: v.latitude,
        longitude: v.longitude,
        // A identidade e o título da rota. Nulos nas paradas antigas — nesse caso o
        // agrupamento cai no par (dia, criador), como sempre foi.
        rotaId: v.rotaId,
        rotaTitulo: v.rotaTitulo,
      })),
    )) {
      // 🔴 TODA rota entra, inclusive a que não dá para desenhar.
      //
      // Até 28/08/2026 havia aqui um `if (!rota.podeDesenhar) continue`, e `podeDesenhar` é
      // `comPonto.length >= 2` (`rota-do-dia.ts:173`). O efeito colateral não era só "sem
      // traçado": a rota descartada nunca entrava neste mapa, e a linha de botões só é montada
      // quando o dia tem alguma rota nele — então **a rota inteira ficava sem Editar, sem
      // Excluir, sem Enviar e sem Ver no mapa**.
      //
      // Isso derrubava dois casos que não têm nada de excepcional:
      //   - rota de UMA parada — quem visita uma obra só no dia não conseguia mexer nela por
      //     aqui, e o único caminho restante era achá-la no Calendário;
      //   - rota de várias paradas em que só uma obra tem coordenada — hoje 8 das 82 obras da
      //     MD estão sem geocodificação, então isso acontece de verdade.
      //
      // Desenhar o trajeto e poder mexer na rota são coisas diferentes, e agora estão
      // separadas: `podeDesenhar` continua mandando no traçado, e só nele. Pedido do Lucas.
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
          {periodo
            ? 'Nenhuma visita neste período. Ajuste o período em Filtros.'
            : searchTerm
              ? 'Ajuste a busca.'
              : 'Crie uma rota de visita para começar.'}
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
        // Só há um título "do dia" quando há uma rota só. Ver o comentário no cabeçalho.
        const tituloDoDia = rotasDoDia.length === 1 ? rotasDoDia[0].titulo : null;

        return (
        <section key={chave} className="rounded-xl border border-border bg-card">
          <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
            {/* 🔴 "(título), (data)" — pedido do Lucas em 28/08/2026. O título só entra quando
                o dia tem UMA rota: com duas, cada uma tem o seu, e escolher um para o
                cabeçalho do dia diria que a outra não existe. Nesse caso o título de cada
                rota aparece na linha dela, junto do nome de quem a montou. Sem título, fica
                só a data, como sempre foi. */}
            <h3 className="min-w-0 truncate text-sm font-semibold capitalize text-card-foreground">
              {tituloDoDia && (
                <span className="normal-case">{tituloDoDia}, </span>
              )}
              {format(dia, "EEEE, d 'de' MMM", { locale: ptBR })}
            </h3>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {visitasDoDia.length} {visitasDoDia.length === 1 ? 'visita' : 'visitas'}
            </span>
          </header>

          {/* A rota do dia, com as ações. Aparece para QUALQUER rota — inclusive a de uma
              parada só e a que está sem localização. O que depende de ter 2+ pontos é o
              traçado, não o direito de editar e excluir. */}
          {rotasDoDia.length > 0 && (
            <div className="space-y-1.5 border-b border-border bg-muted/30 px-3 py-2">
              {rotasDoDia.map((rota) => {
                // Só quem montou a rota mexe nela. Não é preciosismo de tela: a regra do banco
                // deixa cada pessoa apagar apenas as SUAS linhas, então um colega clicando em
                // excluir apagaria metade da rota e deixaria o resto na agenda de todo mundo.
                const eDono = !!profile?.user_id && profile.user_id === rota.criadoPor;

                // Sem NENHUMA parada geolocalizada não há o que abrir: o mapa viria vazio e a
                // pessoa concluiria que o botão está quebrado. Com UMA já vale — o mapa mostra
                // o pino, só não tem trajeto. É a diferença entre "não dá" e "não tem linha".
                const temOndeMostrar = rota.comPonto.length > 0;

                return (
                <div key={rota.chave} className="flex flex-wrap items-center gap-1.5">
                  {/* 🔴 SÓ QUANDO HÁ MAIS DE UMA ROTA NO DIA — o título e o nome de quem
                      montou vivem aqui apenas porque, com duas rotas, o cabeçalho do dia não
                      pode carregar os dois.

                      Com uma rota só, o cabeçalho já mostra "Título, sexta-feira 28 de ago"
                      (linha 233), e repetir aqui dava o mesmo texto duas vezes na mesma
                      caixa, a poucos pixels de distância. Foi o que o Lucas viu em
                      28/08/2026. */}
                  {precisaNomear && (
                    <span className="mr-auto min-w-0 truncate text-xs text-muted-foreground">
                      {rota.titulo && (
                        <span className="font-medium text-foreground">{rota.titulo}</span>
                      )}
                      {rota.titulo && ' · '}
                      {nomePor(rota.criadoPor ?? '')}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    disabled={!temOndeMostrar}
                    title={
                      temOndeMostrar
                        ? undefined
                        : 'Nenhuma obra desta rota tem localização — não há o que mostrar no mapa'
                    }
                    onClick={() => setRotaNoMapa(rota)}
                  >
                    <Route className="h-3.5 w-3.5" />
                    Ver no mapa
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setRotaParaEnviar(rota)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar
                  </Button>
                  {eDono && onEditarRota && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={() => onEditarRota(rota)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
                  {eDono && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRotaParaExcluir(rota)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  )}
                  {/* Dizer o que ficou de fora é o que impede a pessoa de achar que a rota tem
                      menos paradas do que ela cadastrou — ou que o mapa está com defeito. São
                      dois avisos diferentes e podem valer ao mesmo tempo. */}
                  {rota.semPonto.length > 0 && (
                    <span className="w-full text-[11px] text-muted-foreground">
                      {rota.semPonto.length}{' '}
                      {rota.semPonto.length === 1
                        ? 'obra sem localização fica fora do mapa'
                        : 'obras sem localização ficam fora do mapa'}
                    </span>
                  )}
                  {temOndeMostrar && !rota.podeDesenhar && (
                    // Uma parada geolocalizada só: o mapa abre e mostra o pino, mas não existe
                    // trajeto entre uma parada e nenhuma. Sem esta frase o usuário abriria o
                    // mapa esperando a linha e acharia que ela falhou.
                    <span className="w-full text-[11px] text-muted-foreground">
                      Só uma parada tem localização — o mapa mostra o ponto, sem trajeto
                    </span>
                  )}
                </div>
                );
              })}
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
                /**
                 * 🔴 OS DOIS SENTIDOS DO SELO NÃO SÃO SIMÉTRICOS, e é de propósito.
                 *
                 * Clicar em **Planejada** (marcar como realizada) abre o campo "O que você viu
                 * na obra?", exatamente como o botão de baixo — pedido do Lucas em 28/08/2026.
                 * A razão é que esse é o momento em que a informação existe: a pessoa acabou de
                 * sair da obra. Gravar "realizada" e seguir em frente perde o registro, e ela
                 * não volta depois para escrever.
                 *
                 * Clicar em **Realizada** (desmarcar) continua gravando na hora, sem abrir
                 * nada. Pedir "o que você viu" para DESFAZER não faz sentido nenhum, e este é o
                 * único caminho que existe na tela para corrigir um clique errado — pôr um
                 * formulário no meio dele traria de volta o beco sem saída que o selo alternável
                 * veio resolver.
                 */
                onAlternarStatus={() => {
                  if (visita.visitaRealizada) {
                    marcarRealizada.mutate({
                      grupoId: visita.grupoId,
                      obraId: visita.obraId,
                      realizada: false,
                      observacao: visita.visitaObservacao ?? '',
                    });
                    return;
                  }
                  setObservacaoRascunho(visita.visitaObservacao || '');
                  setEditandoId(visita.id);
                }}
                salvando={marcarRealizada.isPending}
              />
            ))}
          </div>
        </section>
        );
      })}

      <RotaNoMapaDialog
        rota={rotaNoMapa}
        onFechar={() => setRotaNoMapa(null)}
        onEnviar={(rota) => {
          setRotaNoMapa(null);
          setRotaParaEnviar(rota);
        }}
      />

      <ConfirmarExclusaoRota
        rota={rotaParaExcluir}
        excluindo={excluirRota.isPending}
        onCancelar={() => setRotaParaExcluir(null)}
        onConfirmar={() => {
          const alvo = rotaParaExcluir;
          if (!alvo) return;
          excluirRota.mutate(
            { grupoIds: alvo.paradas.map((p) => p.grupoId).filter(Boolean) as string[] },
            {
              onSuccess: () => {
                toast.success('Rota excluída. As visitas saíram do calendário também.');
                setRotaParaExcluir(null);
              },
              onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível excluir a rota.')),
            },
          );
        }}
      />

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
  /**
   * O que o selo faz ao ser clicado. **Planejada** abre o campo de observação (o pai decide);
   * **Realizada** desmarca na hora. Ver o comentário longo em quem passa esta propriedade.
   */
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
        {/* 🔴 O SELO ALTERNA NOS DOIS SENTIDOS, com pesos diferentes.
            Antes ele era só enfeite: dava para marcar como realizada pelo botão de baixo, e
            NÃO havia caminho nenhum na tela para desmarcar — quem clicasse por engano ficava
            com a visita realizada para sempre. A gravação já aceitava `realizada: false`;
            faltava a porta.

            Desde 28/08/2026 o sentido "Planejada -> Realizada" abre o campo de observação em
            vez de gravar direto: é o pedido do Lucas, e o motivo está em quem passa
            `onAlternarStatus`. O sentido inverso continua gravando na hora.

            Só quem registrou a visita alterna (`podeAlternar`); para os outros continua
            sendo um selo de leitura, com o mesmo desenho. */}
        {podeAlternar ? (
          <button
            type="button"
            disabled={salvando}
            onClick={onAlternarStatus}
            title={
              visita.visitaRealizada
                ? 'Marcar como planejada'
                : 'Marcar como realizada e escrever o que você viu'
            }
            aria-label={
              visita.visitaRealizada
                ? 'Marcar como planejada'
                : 'Marcar como realizada e escrever o que você viu'
            }
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
