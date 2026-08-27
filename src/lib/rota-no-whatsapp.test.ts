import { describe, it, expect } from 'vitest';
import { linkDoGoogleMaps, mensagemDaRota, type ParadaDaRota } from './rota-no-whatsapp';

/** Quinta-feira, 27/08/2026. */
const QUINTA = new Date(2026, 7, 27);

/**
 * Coordenadas separadas por um grau inteiro de propósito: assim "-30.5" só aparece na parada 7 e
 * dá para afirmar com segurança que uma parada específica NÃO entrou no link.
 */
function parada(indice: number, ajustes: Partial<ParadaDaRota> = {}): ParadaDaRota {
  return {
    nome: `Obra ${indice}`,
    horario: new Date(2026, 7, 27, 8 + indice, 0),
    lat: -23.5 - indice,
    lng: -46.6 - indice,
    ...ajustes,
  };
}

function rotaDe(quantidade: number): ParadaDaRota[] {
  return Array.from({ length: quantidade }, (_, i) => parada(i));
}

describe('linkDoGoogleMaps', () => {
  it('rota curta: primeira vira origem, última vira destino, o meio vira waypoint', () => {
    const link = linkDoGoogleMaps(rotaDe(3));
    expect(link).not.toBeNull();
    expect(link!.incluidas).toBe(3);
    expect(link!.cortadas).toBe(0);
    expect(link!.url).toContain(`origin=${encodeURIComponent('-23.5,-46.6')}`);
    expect(link!.url).toContain(`destination=${encodeURIComponent('-25.5,-48.6')}`);
    expect(link!.url).toContain(`waypoints=${encodeURIComponent('-24.5,-47.6')}`);
  });

  it('usa a URL pública do Google Maps, que não pede chave de API, e o modo carro', () => {
    // 🔴 Se este teste quebrar porque alguém trocou o host, confira se não foi para a
    // Directions API: ela tem nome parecido e é COBRADA por requisição.
    const { url } = linkDoGoogleMaps(rotaDe(3))!;
    expect(url.startsWith('https://www.google.com/maps/dir/?api=1')).toBe(true);
    expect(url).toContain('travelmode=driving');
    expect(url).not.toContain('key=');
  });

  it('arredonda a coordenada em 6 casas e não deixa zero à direita', () => {
    const link = linkDoGoogleMaps([
      parada(0, { lat: -23.5505123456, lng: -46.6333987654 }),
      parada(1, { lat: -23.5505, lng: -46.6333 }),
    ])!;
    expect(link.url).toContain(encodeURIComponent('-23.550512,-46.633399'));
    expect(link.url).toContain(encodeURIComponent('-23.5505,-46.6333'));
    expect(link.url).not.toContain('550512345');
  });

  it('codifica vírgula e barra vertical, que são separadores dentro do valor', () => {
    const { url } = linkDoGoogleMaps(rotaDe(4))!;
    expect(url).toContain('%2C');
    expect(url).toContain('%7C'); // duas paradas de meio, separadas por "|"
    expect(url).not.toContain('|');
  });

  it('11 paradas é exatamente o limite: entram todas, nada é cortado', () => {
    const link = linkDoGoogleMaps(rotaDe(11))!;
    expect(link.incluidas).toBe(11);
    expect(link.cortadas).toBe(0);
    // 9 waypoints => 8 separadores.
    expect(link.url.split('%7C')).toHaveLength(9);
  });

  it('🔴 15 paradas: corta do meio, avisa quantas, e mantém origem e destino', () => {
    const link = linkDoGoogleMaps(rotaDe(15))!;
    expect(link.incluidas).toBe(11);
    expect(link.cortadas).toBe(4);
    expect(link.url).toContain(`origin=${encodeURIComponent('-23.5,-46.6')}`);
    // A última parada é o compromisso que não pode cair.
    expect(link.url).toContain(`destination=${encodeURIComponent('-37.5,-60.6')}`);
    // O começo e o fim do dia sobrevivem; o centro é que sai.
    expect(link.url).toContain('-24.5%2C-47.6'); // parada 1
    expect(link.url).toContain('-36.5%2C-59.6'); // parada 13
    expect(link.url).not.toContain('-30.5%2C-53.6'); // parada 7, bem no centro
  });

  it('🔴 uma rota grande nunca gera link com mais pontos do que o Google aceita', () => {
    // Sem este teto o Google trunca ou recusa EM SILÊNCIO — o cliente recebe um link quebrado.
    for (const quantidade of [12, 15, 30, 100]) {
      const link = linkDoGoogleMaps(rotaDe(quantidade))!;
      expect(link.incluidas).toBe(11);
      expect(link.incluidas + link.cortadas).toBe(quantidade);
    }
  });

  it('parada sem coordenada no meio é pulada, e as outras continuam na ordem', () => {
    const paradas = [parada(0), parada(1, { lat: null, lng: null }), parada(2)];
    const link = linkDoGoogleMaps(paradas)!;
    expect(link.incluidas).toBe(2);
    expect(link.cortadas).toBe(0); // não foi o teto do Google que a tirou
    expect(link.url).toContain(`origin=${encodeURIComponent('-23.5,-46.6')}`);
    expect(link.url).toContain(`destination=${encodeURIComponent('-25.5,-48.6')}`);
    expect(link.url).not.toContain('waypoints=');
  });

  it('🔴 coordenada (0, 0) é campo vazio, não é lugar: não vira ponto do trajeto', () => {
    const paradas = [parada(0), parada(1, { lat: 0, lng: 0 }), parada(2)];
    const link = linkDoGoogleMaps(paradas)!;
    expect(link.incluidas).toBe(2);
    expect(link.url).not.toContain('waypoints=');
  });

  it('🔴 coordenada que ARREDONDA para (0, 0) também é barrada', () => {
    // Sem o teste na precisão do link, (1e-9, -2e-9) não é zero para o JavaScript, passa pelo
    // guarda e sai como `origin=0,0` — o trajeto pelo Atlântico que o guarda existe para evitar.
    const paradas = [parada(0, { lat: 1e-9, lng: -2e-9 }), parada(1), parada(2)];
    const link = linkDoGoogleMaps(paradas)!;
    expect(link.url).not.toContain('0%2C0&');
    expect(link.url).toContain(`origin=${encodeURIComponent('-24.5,-47.6')}`);
    expect(link.semCoordenada).toBe(1);
  });

  it('conta as paradas sem localização à parte das cortadas pelo teto', () => {
    const paradas = [parada(0), parada(1, { lat: null, lng: null }), parada(2, { lat: 0, lng: 0 }), parada(3)];
    const link = linkDoGoogleMaps(paradas)!;
    expect(link.semCoordenada).toBe(2);
    expect(link.cortadas).toBe(0);
    expect(link.incluidas).toBe(2);
  });

  it('🔴 duas visitas à MESMA obra não são trajeto: devolve null em vez de mapa parado', () => {
    // Visitar a mesma obra de manhã e de tarde é rotina. `origin=X&destination=X` ABRE — e é aí
    // que engana: parece que o link funcionou, e o mapa está parado em cima de um ponto só.
    const manha = parada(0, { horario: new Date(2026, 7, 27, 9, 0) });
    const tarde = parada(0, { horario: new Date(2026, 7, 27, 15, 0) });
    expect(linkDoGoogleMaps([manha, tarde])).toBeNull();
  });

  it('ida e volta à mesma obra, com parada no meio, continua sendo trajeto', () => {
    const link = linkDoGoogleMaps([parada(0), parada(1), parada(0)])!;
    expect(link.incluidas).toBe(3);
    expect(link.url).toContain(`origin=${encodeURIComponent('-23.5,-46.6')}`);
    expect(link.url).toContain(`destination=${encodeURIComponent('-23.5,-46.6')}`);
  });

  it('uma parada só não é trajeto: devolve null', () => {
    expect(linkDoGoogleMaps(rotaDe(1))).toBeNull();
    expect(linkDoGoogleMaps([parada(0), parada(1, { lat: null, lng: null })])).toBeNull();
  });

  it('zero paradas devolve null', () => {
    expect(linkDoGoogleMaps([])).toBeNull();
  });
});

describe('mensagemDaRota', () => {
  it('abre com a data por extenso em português', () => {
    const texto = mensagemDaRota({ data: QUINTA, paradas: rotaDe(2) });
    expect(texto.split('\n')[0]).toBe('Rota de visitas — quinta, 27 de agosto');
  });

  it('numera as paradas com o horário na frente', () => {
    const texto = mensagemDaRota({
      data: QUINTA,
      paradas: [
        { nome: 'Residencial Mares', horario: new Date(2026, 7, 27, 9, 0) },
        { nome: 'Edifício Aurora', horario: new Date(2026, 7, 27, 11, 30) },
      ],
    });
    expect(texto).toContain('1. 09:00 — Residencial Mares');
    expect(texto).toContain('2. 11:30 — Edifício Aurora');
  });

  it('parada sem nome vira "Obra sem nome"', () => {
    const texto = mensagemDaRota({
      data: QUINTA,
      paradas: [
        { nome: null, horario: new Date(2026, 7, 27, 9, 0) },
        { nome: '   ', horario: new Date(2026, 7, 27, 10, 0) },
      ],
    });
    expect(texto).toContain('1. 09:00 — Obra sem nome');
    expect(texto).toContain('2. 10:00 — Obra sem nome');
  });

  it('parada sem horário não mostra horário nenhum, e a numeração continua', () => {
    const texto = mensagemDaRota({
      data: QUINTA,
      paradas: [
        { nome: 'Obra A', horario: new Date(2026, 7, 27, 9, 0) },
        { nome: 'Obra B', horario: null },
        { nome: 'Obra C', horario: new Date(2026, 7, 27, 15, 0) },
      ],
    });
    expect(texto).toContain('2. Obra B');
    expect(texto).not.toContain('2. Invalid');
    expect(texto).toContain('3. 15:00 — Obra C');
  });

  it('🔴 o tempo é estimativa: a linha do total sempre diz "cerca de"', () => {
    const texto = mensagemDaRota({
      data: QUINTA,
      paradas: rotaDe(2),
      distancia: '19,7 km',
      duracao: '22 min',
    });
    expect(texto).toContain('Total: 19,7 km, cerca de 22 min');
  });

  it('sem distância e sem duração, não inventa linha de total', () => {
    const texto = mensagemDaRota({ data: QUINTA, paradas: rotaDe(2) });
    expect(texto).not.toContain('Total:');
  });

  it('🔴 o link fica sozinho na última linha, para o WhatsApp gerar a previsão', () => {
    const link = linkDoGoogleMaps(rotaDe(3))!;
    const linhas = mensagemDaRota({
      data: QUINTA,
      paradas: rotaDe(3),
      distancia: '19,7 km',
      duracao: '22 min',
      link,
    }).split('\n');
    expect(linhas[linhas.length - 1]).toBe(link.url);
    expect(linhas[linhas.length - 2]).toBe(''); // nada grudado nele
  });

  it('quando o link cortou paradas, avisa quantas ANTES do link', () => {
    const paradas = rotaDe(15);
    const link = linkDoGoogleMaps(paradas)!;
    const texto = mensagemDaRota({ data: QUINTA, paradas, link });
    const linhas = texto.split('\n');
    const posicaoDoAviso = linhas.findIndex((l) => l.startsWith('Atenção:'));
    expect(posicaoDoAviso).toBeGreaterThan(-1);
    expect(linhas[posicaoDoAviso]).toContain('4 paradas');
    expect(posicaoDoAviso).toBeLessThan(linhas.length - 1);
    // A lista de texto continua completa: 15 paradas, mesmo com 11 no mapa.
    expect(texto).toContain('15. ');
  });

  it('🔴 obra sem localização some do mapa e a mensagem AVISA, mesmo sem corte do Google', () => {
    // Este era o buraco: `cortadas` é 0, então a mensagem saía muda. O motorista abria um mapa
    // com 2 pontos, a lista dizia 5, e nada no texto explicava a diferença.
    const paradas = [
      parada(0),
      parada(1, { lat: null, lng: null }),
      parada(2, { lat: null, lng: null }),
      parada(3, { lat: null, lng: null }),
      parada(4),
    ];
    const link = linkDoGoogleMaps(paradas)!;
    expect(link.cortadas).toBe(0);
    const texto = mensagemDaRota({ data: QUINTA, paradas, link });
    expect(texto).toContain('não inclui 3 paradas');
    expect(texto).toContain('há obra sem localização no cadastro');
    // O motivo errado mandaria a pessoa desistir: isto aqui não é limite do Google.
    expect(texto).not.toContain('no máximo 11 pontos');
    // E a lista de texto continua com as cinco.
    expect(texto).toContain('5. ');
  });

  it('🔴 corte E falta de localização juntos: o número bate com a lista e diz os dois motivos', () => {
    const paradas = rotaDe(15);
    paradas[3] = parada(3, { lat: null, lng: null });
    paradas[4] = parada(4, { lat: null, lng: null });
    const link = linkDoGoogleMaps(paradas)!;
    expect(link.cortadas).toBe(2);
    expect(link.semCoordenada).toBe(2);
    const texto = mensagemDaRota({ data: QUINTA, paradas, link });
    // 15 na lista, 11 no mapa: quem contar tem de achar 4, não 2.
    expect(texto).toContain('não inclui 4 paradas');
    expect(texto).toContain('há obra sem localização no cadastro');
    expect(texto).toContain('no máximo 11 pontos');
  });

  it('uma parada faltando fala no singular', () => {
    const paradas = [parada(0), parada(1, { lat: null, lng: null }), parada(2)];
    const texto = mensagemDaRota({ data: QUINTA, paradas, link: linkDoGoogleMaps(paradas) });
    expect(texto).toContain('não inclui 1 parada —');
  });

  it('só distância, ou só duração, ainda geram a linha de total', () => {
    const soKm = mensagemDaRota({ data: QUINTA, paradas: rotaDe(2), distancia: '19,7 km' });
    expect(soKm).toContain('Total: 19,7 km');
    const soTempo = mensagemDaRota({ data: QUINTA, paradas: rotaDe(2), duracao: '22 min' });
    expect(soTempo).toContain('Total: cerca de 22 min');
  });

  it('🔴 nome que não é texto não derruba a mensagem inteira', () => {
    // `strictNullChecks` está desligado neste projeto: o compilador não garante que `nome` seja
    // string. Um número vindo do banco fazia `nome.trim is not a function` e o vendedor perdia a
    // rota toda por causa do rótulo de uma parada.
    const paradas = [{ nome: 123 as unknown as string, horario: null }, parada(1)];
    const texto = mensagemDaRota({ data: QUINTA, paradas });
    expect(texto).toContain('1. Obra sem nome');
    expect(texto).toContain('2. ');
  });

  it('data quebrada não vira "Invalid Date" no cabeçalho', () => {
    const texto = mensagemDaRota({ data: new Date('não é data'), paradas: rotaDe(2) });
    expect(texto.split('\n')[0]).toBe('Rota de visitas');
    expect(texto).not.toContain('Invalid');
  });

  it('link sem corte não gera aviso', () => {
    const paradas = rotaDe(4);
    const texto = mensagemDaRota({ data: QUINTA, paradas, link: linkDoGoogleMaps(paradas) });
    expect(texto).not.toContain('Atenção:');
  });

  it('sem link, a mensagem não termina em URL solta', () => {
    const texto = mensagemDaRota({ data: QUINTA, paradas: rotaDe(2), link: null });
    expect(texto).not.toContain('http');
  });

  it('zero paradas: diz que não há parada, em vez de mostrar lista vazia', () => {
    const texto = mensagemDaRota({ data: QUINTA, paradas: [] });
    expect(texto).toContain('Nenhuma parada nesta rota.');
    expect(texto).not.toContain('1. ');
  });

  it('não usa emoji em lugar nenhum', () => {
    const paradas = rotaDe(15);
    const texto = mensagemDaRota({
      data: QUINTA,
      paradas,
      distancia: '19,7 km',
      duracao: '22 min',
      link: linkDoGoogleMaps(paradas),
    });
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('🔴 não mexe em pontuação de texto: hífen e parêntese do nome chegam inteiros', () => {
    // Espelha a regra do envio: no Repply CRM, apagar hífen de identificador monta um destino
    // inexistente que o servidor aceita e não entrega. Aqui nada é "normalizado".
    const nome = 'Vila São João - Bloco 2 (fase 1)';
    const texto = mensagemDaRota({ data: QUINTA, paradas: [{ nome, horario: null }] });
    expect(texto).toContain(`1. ${nome}`);
  });
});
