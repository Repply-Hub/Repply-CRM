/**
 * Trajeto de carro entre as obras de uma rota de visita, via OSRM público
 * (router.project-osrm.org — aberto, sem chave, com `Access-Control-Allow-Origin: *`,
 * então o navegador chama direto).
 *
 * 🔴 A RAZÃO DESTE ARQUIVO EXISTIR: o OSRM fala em LONGITUDE,LATITUDE — na URL que a gente
 * monta e na geometria que ele devolve. O Leaflet, que desenha o mapa, fala em
 * LATITUDE,LONGITUDE. Trocar os dois não gera erro nenhum: o traço simplesmente aparece do
 * outro lado do planeta. E em Natal/RN (lat -5.8, lng -35.2) os dois números são negativos e
 * parecidos o bastante para o erro passar batido numa conferência rápida — o vendedor abriria
 * a rota, veria uma linha, e só perceberia depois que ela liga pontos que não são as obras
 * dele. A inversão mora só aqui dentro, nas duas direções, e está presa por teste.
 *
 * Tudo neste arquivo é PURO: ninguém aqui faz fetch. Quem busca é o hook.
 */

const BASE_OSRM = 'https://router.project-osrm.org/route/v1/driving';

export interface PontoNoMapa {
  lat: number;
  lng: number;
}

export interface PernaDaRota {
  distanciaM: number;
  duracaoS: number;
  /**
   * O traçado SÓ deste trecho, em [lat, lng].
   *
   * É o que permite acender uma perna quando o mouse passa por cima dela, em vez de acender a
   * rota inteira. Vem dos `steps` do OSRM, concatenados.
   *
   * 🔴 Pode vir VAZIO, e isso não é falha: quando os passos não vêm (servidor sobrecarregado
   * responde sem eles), o trajeto inteiro continua desenhando pelo `tracado` da rota — só o
   * destaque por trecho é que fica de fora. Perder o realce é um arranhão; perder a rota
   * inteira por causa dele seria um estrago.
   */
  tracado: Array<[number, number]>;
}

export interface RotaCalculada {
  distanciaM: number;
  duracaoS: number;
  pernas: PernaDaRota[];
  /** Em [lat, lng], pronto para o Leaflet. */
  tracado: Array<[number, number]>;
}

function ehNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Lê uma lista `[[lng, lat], ...]` do GeoJSON e devolve `[[lat, lng], ...]` para o Leaflet.
 *
 * Devolve `null` no primeiro par estranho. Um só lugar faz a inversão, e é este — foi de
 * propósito: espalhar a troca por dois laços é como ela volta a acontecer só num deles.
 */
function lerCoordenadas(bruto: unknown): Array<[number, number]> | null {
  if (!Array.isArray(bruto)) return null;

  const pontos: Array<[number, number]> = [];
  for (const par of bruto) {
    if (!Array.isArray(par) || par.length < 2) return null;
    // 🔴 O OSRM entrega [lng, lat]; o Leaflet quer [lat, lng].
    const lng = par[0];
    const lat = par[1];
    if (!ehNumeroFinito(lat) || !ehNumeroFinito(lng)) return null;
    // Faixa válida do globo. Não pega inversão em Natal (lat -5.8 e lng -35.2 são os dois
    // "latitudes possíveis"), mas pega lixo grosso e ponto invertido em longitude alta.
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    pontos.push([lat, lng]);
  }
  return pontos;
}

/**
 * Junta a geometria dos passos de uma perna num traçado só.
 *
 * Tolerante de propósito: passo torto é PULADO, não derruba a perna, e perna sem passo nenhum
 * devolve lista vazia. Ver o comentário de `PernaDaRota.tracado` para o porquê.
 */
function tracadoDaPerna(dados: Record<string, unknown>): Array<[number, number]> {
  const passos = dados.steps;
  if (!Array.isArray(passos)) return [];

  const tracado: Array<[number, number]> = [];
  for (const passo of passos) {
    if (!passo || typeof passo !== 'object') continue;
    const geometria = (passo as Record<string, unknown>).geometry as Record<string, unknown> | null;
    if (!geometria || typeof geometria !== 'object' || geometria.type !== 'LineString') continue;
    const pontos = lerCoordenadas(geometria.coordinates);
    if (!pontos) continue;
    // O último ponto de um passo é o primeiro do seguinte. Sem esta linha o traçado ganharia
    // um ponto repetido a cada manobra — invisível na tela, mas engorda o desenho à toa.
    const inicio = tracado.length > 0 && pontos.length > 0 ? 1 : 0;
    for (let i = inicio; i < pontos.length; i++) tracado.push(pontos[i]);
  }
  return tracado;
}

/**
 * Monta a URL do OSRM. Recebe em lat/lng e inverte para lng/lat na saída.
 *
 * Menos de 2 pontos é erro de uso — uma rota de uma parada só não é rota. Devolve string
 * vazia em vez de montar uma URL inválida, e quem chama decide o que fazer (esconder o
 * traçado, não disparar a busca). Coordenada que não é número finito cai no mesmo caso:
 * `undefined` numa obra sem geolocalização viraria o texto "undefined" dentro da URL, e o
 * servidor devolveria erro de parsing que não diz nada a quem está olhando a tela.
 */
export function urlDaRota(pontos: PontoNoMapa[]): string {
  if (!Array.isArray(pontos) || pontos.length < 2) return '';

  const coordenadas: string[] = [];
  for (const ponto of pontos) {
    if (!ponto || !ehNumeroFinito(ponto.lat) || !ehNumeroFinito(ponto.lng)) return '';
    // 🔴 lng ANTES de lat. É a ordem do OSRM, o contrário da do Leaflet.
    coordenadas.push(`${ponto.lng},${ponto.lat}`);
  }

  // `steps=true` é o que traz a geometria de CADA perna separada. Sem ele o OSRM manda um
  // traço só, do começo ao fim, e não haveria como acender um trecho sozinho. Custa umas 300
  // coordenadas a mais numa rota de três paradas — irrelevante para uma rota de um dia.
  return `${BASE_OSRM}/${coordenadas.join(';')}?overview=full&geometries=geojson&steps=true`;
}

/**
 * Lê a resposta do OSRM. Devolve `null` quando a resposta não serve.
 *
 * 🔴 O servidor é público e de demonstração: ele pode responder `{code:"NoRoute"}` (obras em
 * ilhas separadas por água), `{code:"TooBig"}` (rota longa demais para a instância de
 * demonstração), uma página HTML de erro quando está sobrecarregado, ou simplesmente cair.
 * Nada disso pode explodir a tela do vendedor no meio da visita — daí a leitura conferir cada
 * campo antes de usar, e devolver `null` em vez de deixar um `undefined.length` estourar.
 */
export function lerRespostaDaRota(json: unknown): RotaCalculada | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;

  const resposta = json as Record<string, unknown>;
  // "Ok" é o único código que traz rota. NoRoute, TooBig, InvalidValue e companhia vêm com o
  // campo `routes` ausente ou vazio, mas conferir o código primeiro deixa o motivo explícito.
  if (resposta.code !== 'Ok') return null;

  const rotas = resposta.routes;
  if (!Array.isArray(rotas) || rotas.length === 0) return null;

  const rota = rotas[0] as Record<string, unknown> | null;
  if (!rota || typeof rota !== 'object') return null;

  const distanciaM = rota.distance;
  const duracaoS = rota.duration;
  if (!ehNumeroFinito(distanciaM) || !ehNumeroFinito(duracaoS)) return null;

  // N paradas dão N-1 pernas. As pernas são o que a tela usa para mostrar "6,3 km até a
  // próxima obra" entre um cartão e outro da rota.
  const trechos = rota.legs;
  if (!Array.isArray(trechos)) return null;

  const pernas: PernaDaRota[] = [];
  for (const trecho of trechos) {
    if (!trecho || typeof trecho !== 'object') return null;
    const dados = trecho as Record<string, unknown>;
    const distanciaDaPerna = dados.distance;
    const duracaoDaPerna = dados.duration;
    if (!ehNumeroFinito(distanciaDaPerna) || !ehNumeroFinito(duracaoDaPerna)) return null;
    pernas.push({
      distanciaM: distanciaDaPerna,
      duracaoS: duracaoDaPerna,
      tracado: tracadoDaPerna(dados),
    });
  }

  const geometria = rota.geometry as Record<string, unknown> | null;
  // 🔴 A polyline codificada é barrada AQUI, não na conferência de `type` logo abaixo: quando
  // `geometries=geojson` se perde da URL, o OSRM volta ao padrão dele e manda `geometry` como
  // STRING ("ktp}Aj{|nPmA?"). Percorrer essa string entregaria um caractere de cada vez no
  // lugar de pares de coordenada.
  if (!geometria || typeof geometria !== 'object') return null;
  // Passando daqui a geometria já é objeto, e o que esta linha recusa é OUTRO tipo de GeoJSON.
  // MultiPoint é o que engana: traz coordenadas na mesma forma da LineString
  // ([[lng, lat], ...]), então sem esta linha ele seria desenhado como se fosse o caminho do
  // carro, quando é só um punhado de pontos soltos.
  if (geometria.type !== 'LineString') return null;

  // `Array.isArray` dentro de `lerCoordenadas` não é preciosismo: `coordinates` vindo como
  // número faria um `for...of` estourar "is not iterable" — a função promete null, e explodiria.
  const tracado = lerCoordenadas(geometria.coordinates);
  if (!tracado || tracado.length === 0) return null;

  return { distanciaM, duracaoS, pernas, tracado };
}

/** "22 min", "1h05", "menos de 1 min" */
export function duracaoLegivel(segundos: number): string {
  if (!ehNumeroFinito(segundos) || segundos < 60) return 'menos de 1 min';

  const totalDeMinutos = Math.round(segundos / 60);
  // 🔴 O arredondamento é feito ANTES de decidir entre minutos e horas. Se fosse depois,
  // 3599s (59min59) viraria "60 min" — uma unidade que ninguém escreve.
  if (totalDeMinutos < 60) return `${totalDeMinutos} min`;

  const horas = Math.floor(totalDeMinutos / 60);
  const minutos = totalDeMinutos % 60;
  // Dois dígitos sempre: "1h5" se lê como uma hora e cinco... ou como uma hora e cinquenta.
  return `${horas}h${String(minutos).padStart(2, '0')}`;
}

/** "19,7 km", "800 m" — vírgula decimal, que é o que o brasileiro lê */
export function distanciaLegivel(metros: number): string {
  if (!ehNumeroFinito(metros) || metros < 0) return '0 m';

  // Abaixo de 1 km ninguém quer precisão de metro: "847 m" não ajuda mais que "850 m".
  const arredondadoEmMetros = Math.round(metros / 10) * 10;
  // 995 m arredonda para 1000 — que ninguém escreve em metros. Vira "1,0 km".
  if (arredondadoEmMetros < 1000) return `${arredondadoEmMetros} m`;

  // toFixed devolve ponto decimal; a troca por vírgula é obrigatória antes de virar tela.
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}
