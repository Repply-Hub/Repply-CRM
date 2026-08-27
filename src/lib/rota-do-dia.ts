import { format, startOfDay } from 'date-fns';

/**
 * Remonta as "rotas de visita" a partir das visitas soltas da agenda.
 *
 * 🔴 POR QUE ISTO EXISTE. NÃO existe tabela de rota no banco. Quando a pessoa monta uma rota
 * com quatro paradas, o que fica gravado são QUATRO linhas em `eventos`, cada uma com o seu
 * PRÓPRIO `grupo_id` — e isso é proposital, não descuido: `grupo_id` quer dizer "mesmo evento,
 * vários participantes". Se as paradas dividissem um grupo, mudar o horário de uma parada
 * arrastaria data e horário de TODAS as outras junto.
 *
 * A consequência é que, depois de salva, nenhuma coluna diz que a parada A e a parada B
 * pertenceram à mesma rota. Este arquivo é a reconstrução: o DIA é a rota.
 *
 * Medido na base em 27/08/2026:
 *
 *   visitas cadastradas ......................... 7
 *   dias com 2+ paradas ......................... 1
 *   dias em que DUAS pessoas marcaram visita .... 0
 *
 * Agrupar só por data daria hoje o mesmo resultado que agrupar por (data, criador) — os zero
 * dias compartilhados provam isso. Agrupar também por criador é o que segura a resposta certa
 * quando os 13 da equipe começarem a usar: sem isso, o dia em que dois vendedores saem a campo
 * viraria uma rota só, com paradas em cidades diferentes intercaladas por horário.
 *
 * Função pura de propósito: é o único jeito de fixar em teste a virada de dia e a ordem das
 * paradas, que é onde o erro se esconde.
 */

export interface VisitaParaRota {
  id: string;
  /**
   * O `grupo_id` da parada — o que identifica ESTA parada no banco.
   *
   * 🔴 NÃO é o `id`. Uma parada com participantes é uma LINHA POR PESSOA, todas com o mesmo
   * `grupo_id`; o `id` é o de uma cópia só. Excluir ou editar pelo `id` mexe na agenda de uma
   * pessoa e deixa as outras intactas — medido em 27/08/2026: 17 compromissos têm mais de uma
   * cópia, e o maior tem 11. Quem organiza cancela, some da agenda dele, e os outros 10 vão à
   * visita cancelada.
   */
  grupoId?: string | null;
  obraId: string;
  obraNome: string | null;
  inicio: Date;
  /**
   * 🔴 Mande SEMPRE a mesma família de identificador aqui. Neste banco a mesma pessoa tem
   * dois: `usuarios.id` (a linha da nossa tabela) e `usuarios.user_id` (o login em
   * `auth.users`), e as colunas de "quem fez" se dividem entre os dois sem que o nome diga
   * qual é qual. Se a consulta que alimenta esta função misturar as duas, o dia de UM
   * vendedor vira DUAS rotas na tela, cada uma com metade das paradas — e não há erro
   * nenhum para investigar, os números só não fecham.
   */
  criadoPor: string | null;
  /**
   * Se a visita já aconteceu. Não entra em nenhum cálculo de rota — está aqui porque a
   * confirmação de exclusão precisa avisar que visita realizada leva junto a observação escrita
   * no campo, que é a única parte da exclusão que apaga TRABALHO e não só agendamento.
   */
  visitaRealizada?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface RotaDoDia {
  /** Identificador estável: data + criador. Serve de `key` de lista e de âncora de URL. */
  chave: string;
  /** Meia-noite do dia, no fuso LOCAL. */
  data: Date;
  criadoPor: string | null;
  /**
   * Todas as paradas do dia, em ordem cronológica. Nenhuma some por falta de coordenada: a
   * obra sem lat/lng fica aqui E em `semPonto`.
   *
   * 🔴 Só existe UMA coisa que não chega a lista nenhuma — a visita com `inicio` inválido.
   * Sem data ela não pertence a dia nenhum, é descartada na entrada, e ninguém na tela fica
   * sabendo que ela existia. É uma exceção deliberada à regra "parada não some" que vale
   * para todo o resto deste arquivo; se um dia essas linhas precisarem aparecer para o
   * vendedor, é aqui que a lista delas tem de entrar.
   */
  paradas: VisitaParaRota[];
  /** As que têm latitude E longitude — as únicas que dá para desenhar no mapa. */
  comPonto: VisitaParaRota[];
  /** As que ficaram sem coordenada. Aparecem em lista, não no traçado. */
  semPonto: VisitaParaRota[];
  /** Só faz sentido traçar caminho com dois pontos ou mais. */
  podeDesenhar: boolean;
}

/** Rótulo do criador dentro da chave, quando a visita veio sem autor (importação antiga). */
const SEM_AUTOR = 'sem-autor';

/**
 * 🔴 `latitude: 0` é coordenada VÁLIDA — a linha do equador corta o Amapá e o Amazonas.
 * Um teste de veracidade (`if (v.latitude && v.longitude)`) jogaria uma obra de Macapá para
 * `semPonto` e ela sumiria do mapa sem ninguém entender por quê. Por isso o teste é de TIPO,
 * não de verdade. `Number.isFinite` barra `undefined` e texto que não vira número — os dois
 * dão `NaN` (`Number(undefined)`, `Number('sem endereço')`).
 *
 * 🔴 O QUE ELE NÃO BARRA, e é o contrário do que parece: `Number(null)` devolve **0**, não
 * `NaN`. Se alguém converter a coluna com `Number()` antes de chegar aqui, a obra SEM
 * coordenada entra como o ponto (0, 0) — Golfo da Guiné — e passa por válida, justamente
 * porque 0 é o valor que esta função foi feita para aceitar. E o estrago não é um pino
 * perdido no meio do Atlântico: `urlDaRota` (`src/lib/osrm.ts`) mandaria Natal → (0,0) ao
 * OSRM, que responde `NoRoute`, e aí o traçado do dia INTEIRO some da tela — as outras
 * paradas, todas boas, deixam de ter linha. Por isso a coordenada tem de chegar aqui crua,
 * `number | null`, do jeito que o banco entrega. Não converta antes.
 */
function temPonto(visita: VisitaParaRota): boolean {
  return (
    typeof visita.latitude === 'number' &&
    Number.isFinite(visita.latitude) &&
    typeof visita.longitude === 'number' &&
    Number.isFinite(visita.longitude)
  );
}

function dataUtilizavel(inicio: unknown): inicio is Date {
  return inicio instanceof Date && !Number.isNaN(inicio.getTime());
}

export function agruparEmRotasDoDia(visitas: VisitaParaRota[]): RotaDoDia[] {
  if (!visitas || visitas.length === 0) return [];

  const porChave = new Map<string, RotaDoDia>();

  for (const visita of visitas) {
    // 🔴 Uma linha com data quebrada (evento sem `data_inicio`, que a importação do Bitrix
    // ainda produz) faria o `format` do date-fns lançar RangeError. Como isto roda no meio da
    // montagem da tela, UMA linha ruim apagaria a lista INTEIRA de rotas do vendedor. Pula.
    if (!dataUtilizavel(visita?.inicio)) continue;

    // 🔴 `format` lê o fuso LOCAL; `toISOString` leria UTC e, depois das 21h no Brasil, jogaria
    // a visita para o dia SEGUINTE — a parada das 22h sairia da rota que a pessoa dirigiu.
    const dia = format(visita.inicio, 'yyyy-MM-dd');
    const autor = visita.criadoPor ?? SEM_AUTOR;
    const chave = `${dia}__${autor}`;

    let rota = porChave.get(chave);
    if (!rota) {
      rota = {
        chave,
        data: startOfDay(visita.inicio),
        criadoPor: visita.criadoPor ?? null,
        paradas: [],
        comPonto: [],
        semPonto: [],
        podeDesenhar: false,
      };
      porChave.set(chave, rota);
    }

    rota.paradas.push(visita);
  }

  const rotas = Array.from(porChave.values());

  for (const rota of rotas) {
    // 🔴 A ORDEM É CRONOLÓGICA, e isso é DECISÃO, não acaso. A tela de criar rota deixa
    // arrastar as paradas para reordenar, mas essa ordem não é gravada em coluna nenhuma —
    // ela sobrevive apenas no horário sugerido a cada parada (09:00, 10:00, 11:00...).
    // Ordenar pelo horário é o único critério que reproduz o caminho que a pessoa de fato
    // dirigiu. Ordenar por `id` ou pela ordem que o banco devolveu daria uma sequência
    // plausível e ERRADA, e o mapa mostraria um zigue-zague que ninguém percorreu.
    // Empate de horário cai no `id` só para a saída não variar entre duas execuções.
    rota.paradas.sort(
      (a, b) => a.inicio.getTime() - b.inicio.getTime() || a.id.localeCompare(b.id),
    );

    rota.comPonto = rota.paradas.filter(temPonto);
    // Obra sem coordenada não pode sumir: 8 das 82 obras da MD estão assim porque a
    // geocodificação não achou o endereço. Elas continuam em `paradas` e em `semPonto`.
    rota.semPonto = rota.paradas.filter((visita) => !temPonto(visita));
    rota.podeDesenhar = rota.comPonto.length >= 2;
  }

  // Da mais recente para a mais antiga. O desempate pela chave existe para o dia em que dois
  // vendedores saem a campo: sem ele, a ordem das duas rotas dependeria de quem apareceu antes
  // na consulta, e a lista dançaria a cada recarga.
  rotas.sort((a, b) => b.data.getTime() - a.data.getTime() || a.chave.localeCompare(b.chave));

  return rotas;
}

export function rotaDaChave(rotas: RotaDoDia[], chave: string): RotaDoDia | undefined {
  if (!rotas || !chave) return undefined;
  return rotas.find((rota) => rota.chave === chave);
}
