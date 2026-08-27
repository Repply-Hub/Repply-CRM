import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * A rota de visitas do dia, virada em TEXTO para mandar no WhatsApp: a lista das paradas mais
 * um link que abre o trajeto pronto no Google Maps do celular de quem recebe.
 *
 * POR QUE TEXTO, E NÃO ARQUIVO OU IMAGEM. O link do Google Maps abre o app de navegação com o
 * trajeto montado; uma imagem de mapa é só uma figura, e quem está dirigindo teria de redigitar
 * os endereços.
 *
 * POR QUE ESTA URL, E NÃO A DIRECTIONS API. `https://www.google.com/maps/dir/?api=1&...` é a URL
 * pública do Google Maps: gratuita e sem chave de API. A Directions API, que tem nome parecido,
 * é cobrada por requisição. Não troque uma pela outra.
 *
 * 🔴 ESTE ARQUIVO NÃO LIDA COM TELEFONE, e não limpa caractere não numérico de coisa nenhuma.
 * No Repply CRM o identificador de grupo do WhatsApp tem hífen (`553199...-1622...`); quem
 * "normaliza" apagando o que não é dígito monta um destino que não existe — e o servidor aceita
 * esse destino, responde sucesso e a mensagem simplesmente nunca chega. Quem escolhe o destino
 * é a camada de envio, não este cálculo.
 *
 * Função PURA: só date-fns. Sem supabase, sem React, sem fetch.
 */

export interface ParadaDaRota {
  nome: string | null;      // nome da obra
  horario: Date | null;
  lat?: number | null;
  lng?: number | null;
}

export interface LinkDeRota {
  url: string;
  /** Quantas paradas de fato couberam no link. */
  incluidas: number;
  /** Quantas ficaram de fora por causa do teto do Google. */
  cortadas: number;
  /**
   * 🔴 Quantas ficaram de fora por não terem coordenada utilizável no cadastro. Some com
   * `cortadas` para dar o total que o mapa não mostra. Sem este número, a tela e a mensagem só
   * enxergam o teto do Google e ficam caladas no caso MAIS comum: obra que a geocodificação
   * ainda não resolveu (`use-geocode-obras.ts` marca `geocoded_at` mesmo quando não achou).
   */
  semCoordenada: number;
}

/**
 * 🔴 O TETO MEDIDO DO GOOGLE: ~9 pontos intermediários nesta URL. Uma rota de 12 paradas gera um
 * link que o Google recusa em silêncio ou trunca — o vendedor manda para o cliente um trajeto
 * que abre errado, ou não abre, e ninguém fica sabendo até a visita perdida. Por isso a função
 * corta ela mesma e DEVOLVE quantas cortou: a tela precisa poder avisar a pessoa antes do envio.
 */
const MAX_WAYPOINTS = 9;

/** Origem + destino + os intermediários: o total de paradas que cabe num link. */
const MAX_PARADAS_NO_LINK = MAX_WAYPOINTS + 2;

/**
 * 🔴 Seis casas decimais são ~11 cm no chão. Mais que isso é ruído do banco (o PostGIS devolve
 * 15 casas) e só engorda um link que já é longo — e link longo é o que o WhatsApp quebra em
 * duas linhas, matando a previsão do trajeto.
 */
const CASAS_DECIMAIS = 6;

interface ParadaComCoordenada extends ParadaDaRota {
  lat: number;
  lng: number;
}

function temCoordenada(parada: ParadaDaRota): parada is ParadaComCoordenada {
  const lat = parada?.lat;
  const lng = parada?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // 🔴 (0, 0) fica no meio do Atlântico, na costa da África. Nenhuma obra da MD está lá: esse
  // par é campo vazio que o formulário salvou como zero. Mandar isso ao Google não dá erro —
  // dá um trajeto atravessando o oceano, que é pior do que parada nenhuma.
  //
  // 🔴 A comparação é feita na PRECISÃO QUE VAI PARA O LINK, não com `=== 0`. Um par como
  // (1e-9, -2e-9) não é zero para o JavaScript, passa pelo teste ingênuo e mesmo assim vira
  // `origin=0,0` depois do arredondamento — o guarda deixaria passar exatamente o trajeto que
  // existe para barrar. Longitude perto de zero não acontece no Brasil (aqui vai de -34 a -74),
  // então esta faixa não descarta obra nenhuma de verdade.
  const QUASE_ZERO = 0.5 / 10 ** CASAS_DECIMAIS;
  if (Math.abs(lat) < QUASE_ZERO && Math.abs(lng) < QUASE_ZERO) return false;
  return true;
}

function coordenadaEmTexto(parada: ParadaComCoordenada): string {
  return `${arredondar(parada.lat)},${arredondar(parada.lng)}`;
}

function arredondar(numero: number): string {
  // `Number(...)` depois do `toFixed` derruba zero à direita: -23.5505 não vira "-23.550500".
  return String(Number(numero.toFixed(CASAS_DECIMAIS)));
}

/** Monta o link do Google Maps. Devolve null quando não há 2 pontos com coordenada. */
export function linkDoGoogleMaps(paradas: ParadaDaRota[]): LinkDeRota | null {
  if (!Array.isArray(paradas)) return null;

  const comCoordenada = paradas.filter(temCoordenada);
  // Trajeto precisa de um de-onde e um para-onde. Com um ponto só não há rota, e um link com
  // origem igual ao destino abre um mapa parado — pior que não mandar link nenhum.
  if (comCoordenada.length < 2) return null;

  // 🔴 Duas paradas NO MESMO PONTO não são trajeto, e isso não é hipótese: visitar a mesma obra
  // de manhã e de tarde é rotina de campo, e as duas visitas carregam a coordenada da mesma
  // obra. Sem esta conta o link sai `origin=X&destination=X`, que o Google abre como um mapa
  // parado em cima de um ponto — e ninguém desconfia, porque o link ABRIU. A comparação usa a
  // coordenada já arredondada, que é o que de fato chega ao Google.
  // Ida e volta ao mesmo lugar com parada no meio continua valendo: ali há dois pontos distintos.
  const pontosDistintos = new Set(comCoordenada.map(coordenadaEmTexto));
  if (pontosDistintos.size < 2) return null;

  const semCoordenada = paradas.length - comCoordenada.length;
  const origem = comCoordenada[0];
  const destino = comCoordenada[comCoordenada.length - 1];
  const meio = comCoordenada.slice(1, -1);

  let waypoints = meio;
  let cortadas = 0;

  if (meio.length > MAX_WAYPOINTS) {
    // 🔴 Corta do MEIO, nunca das pontas: a origem é onde a pessoa está e o destino é o
    // compromisso que ela não pode perder. Sobra do começo do dia e do fim do dia, que é o que
    // dá para reconhecer no mapa.
    const doComeco = Math.ceil(MAX_WAYPOINTS / 2);
    const doFim = MAX_WAYPOINTS - doComeco;
    waypoints = [...meio.slice(0, doComeco), ...meio.slice(meio.length - doFim)];
    cortadas = meio.length - MAX_WAYPOINTS;
  }

  // 🔴 Cada pedaço passa por `encodeURIComponent`. A vírgula e o "|" são separadores dentro do
  // valor do parâmetro; sem codificar, um proxy ou um cliente de e-mail reescreve a URL e o
  // Google lê os waypoints errados.
  const partes = [
    'api=1',
    `origin=${encodeURIComponent(coordenadaEmTexto(origem))}`,
    `destination=${encodeURIComponent(coordenadaEmTexto(destino))}`,
  ];

  if (waypoints.length > 0) {
    const valor = waypoints.map(coordenadaEmTexto).join('|');
    partes.push(`waypoints=${encodeURIComponent(valor)}`);
  }

  partes.push('travelmode=driving');

  return {
    url: `https://www.google.com/maps/dir/?${partes.join('&')}`,
    incluidas: waypoints.length + 2,
    cortadas,
    semCoordenada,
  };
}

export interface DadosDaMensagem {
  data: Date;
  paradas: ParadaDaRota[];
  /** Já formatados, ex.: "19,7 km" e "22 min". Opcionais. */
  distancia?: string | null;
  duracao?: string | null;
  link?: LinkDeRota | null;
}

const SEM_NOME = 'Obra sem nome';

function ehDataValida(data: Date): boolean {
  return data instanceof Date && !Number.isNaN(data.getTime());
}

function tituloComData(data: Date): string {
  if (!ehDataValida(data)) return 'Rota de visitas';
  // 🔴 `format` do date-fns lê o fuso LOCAL. `toISOString` recuaria um dia depois das 21h no
  // Brasil — a rota de quinta chegaria ao cliente anunciada como quarta.
  const porExtenso = format(data, "EEEE, d 'de' MMMM", { locale: ptBR });
  // O ptBR escreve "quinta-feira"; no cabeçalho a forma curta lê melhor. Sábado e domingo não
  // têm o sufixo, então a troca não os toca.
  return `Rota de visitas — ${porExtenso.replace('-feira', '')}`;
}

function linhaDaParada(parada: ParadaDaRota, numero: number): string {
  // 🔴 O teste é de TIPO, não `?.trim()` direto. Neste projeto `strictNullChecks` está desligado
  // e o compilador não garante que `nome` seja string; um número vindo do banco faria
  // `nome.trim is not a function` e derrubaria a MENSAGEM INTEIRA — o vendedor perderia a rota
  // toda por causa do rótulo de uma parada.
  const escrito = typeof parada?.nome === 'string' ? parada.nome.trim() : '';
  const nome = escrito || SEM_NOME;
  const horario = parada?.horario;
  // Parada sem horário é visita de encaixe, que existe de verdade na agenda. Ela continua na
  // lista e continua numerada — sumir com ela faria a numeração do texto não bater com a do mapa.
  if (!ehDataValida(horario)) return `${numero}. ${nome}`;
  return `${numero}. ${format(horario, 'HH:mm')} — ${nome}`;
}

function linhaDeTotal(distancia?: string | null, duracao?: string | null): string | null {
  const km = distancia?.trim();
  const tempo = duracao?.trim();
  // 🔴 "cerca de" não é enfeite. O tempo vem de um serviço de trânsito público e é ESTIMATIVA:
  // prometer "22 min" cravado para quem está dirigindo é o tipo de promessa que a ferramenta
  // quebra na primeira obra e depois ninguém mais confia no resto do número.
  if (km && tempo) return `Total: ${km}, cerca de ${tempo}`;
  if (km) return `Total: ${km}`;
  if (tempo) return `Total: cerca de ${tempo}`;
  return null;
}

function avisoDeCorte(faltando: number, cortadas: number, semCoordenada: number): string {
  const quantas = faltando === 1 ? '1 parada' : `${faltando} paradas`;
  // 🔴 O motivo é dito porque a AÇÃO de quem lê muda: teto do Google é limite da ferramenta e não
  // tem conserto; parada sem localização é cadastro faltando, que alguém resolve preenchendo o
  // endereço da obra. Anunciar "limite do Google" para uma obra sem endereço manda a pessoa
  // desistir de um problema que ela resolveria em um minuto.
  const motivos: string[] = [];
  if (semCoordenada > 0) motivos.push('há obra sem localização no cadastro');
  if (cortadas > 0) motivos.push(`o link do Google Maps aceita no máximo ${MAX_PARADAS_NO_LINK} pontos`);
  const porque = motivos.length > 0 ? ` — ${motivos.join(' e ')}` : '';
  return `Atenção: o mapa abaixo não inclui ${quantas}${porque}. A lista acima está completa.`;
}

/** O texto que vai para o WhatsApp. */
export function mensagemDaRota(dados: DadosDaMensagem): string {
  const paradas = Array.isArray(dados?.paradas) ? dados.paradas : [];
  const link = dados?.link;
  const linhas: string[] = [tituloComData(dados?.data)];

  if (paradas.length === 0) {
    linhas.push('', 'Nenhuma parada nesta rota.');
  } else {
    linhas.push('');
    paradas.forEach((parada, indice) => linhas.push(linhaDaParada(parada, indice + 1)));
  }

  const total = linhaDeTotal(dados?.distancia, dados?.duracao);
  if (total) linhas.push('', total);

  // O aviso vem ANTES do link: quem recebe precisa saber que o mapa mostra menos do que a lista
  // antes de abrir o mapa e concluir que a lista estava errada.
  //
  // 🔴 O NÚMERO sai da diferença entre a lista impressa e o que coube no mapa — não de
  // `cortadas` sozinho. `cortadas` conta só o que o teto do Google tirou; parada sem localização
  // some do mapa do mesmo jeito e não entra nessa conta. Contando só o teto, uma rota de 5
  // paradas com 3 obras sem endereço saía com mapa de 2 pontos e NENHUM aviso, e uma de 15 com 2
  // sem endereço anunciava "2 paradas" faltando quando faltavam 4. Quem confere uma vez e vê que
  // não bate não confia no aviso nunca mais.
  const faltandoNoMapa = link ? Math.max(paradas.length - link.incluidas, 0) : 0;
  if (link && faltandoNoMapa > 0) {
    linhas.push('', avisoDeCorte(faltandoNoMapa, link.cortadas ?? 0, link.semCoordenada ?? 0));
  }

  // 🔴 O link fica sozinho na ÚLTIMA linha. Grudado em outro texto, o WhatsApp não gera a
  // previsão do trajeto — vira uma tira de URL crua que ninguém clica.
  if (link?.url) linhas.push('', link.url);

  return linhas.join('\n');
}
