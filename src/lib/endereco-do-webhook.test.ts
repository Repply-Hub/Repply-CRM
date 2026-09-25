import { describe, it, expect } from 'vitest';
import {
  gerarSegredoDeWebhook,
  enderecoComSegredo,
  ehNossoEndereco,
  escolherWebhookParaReconfigurar,
  corpoDeReconfiguracao,
  conferirReconfiguracao,
  semSegredoNoTexto,
  enderecoDeInstanciaNova,
} from '../../supabase/functions/_shared/endereco-do-webhook';

/**
 * O QUE ESTE ARQUIVO PRENDE: que re-registrar o endereço do webhook na operadora **preserve a
 * configuração que já está lá**, e que a gente nunca grave um segredo que a operadora não
 * aceitou (item 16 da dívida técnica, Tarefa 4 do plano de blindagem).
 *
 * 🔴 POR QUE ISTO NÃO É PRECIOSISMO. O plano escrito mandava mandar um corpo fixo —
 * `{ url, enabled: true, events: ["All"] }`. Medido na operadora em 23/09/2026, pelo
 * `GET /webhook` das instâncias VIVAS, a configuração real **difere de uma para a outra**: uma
 * tem `events: []` e a outra `events: ["All"]`. As duas recebem tudo, então nenhuma está
 * errada — mas o corpo fixo teria reescrito a primeira para outra coisa, sem ninguém saber o
 * que muda.
 *
 * E o jeito de descobrir seria a caixa de WhatsApp de um cliente pagante parar — em silêncio,
 * com a instância ainda aparecendo "conectada" na tela. Já aconteceu neste sistema (`0715119`).
 *
 * Por isso a regra é: **ler o que está lá, devolver igual, mudar só o endereço.**
 *
 * 🔴 E A SEGUNDA REGRA: nunca escolher no escuro. A operadora devolve uma LISTA de endereços,
 * cada um com `id` próprio. Se vier nenhum, ou mais de um, esta camada RECUSA e explica —
 * ela não chuta qual reconfigurar.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

const BASE = 'https://exemplo-projeto.supabase.co';
const INSTANCIA = 'empresa01_abc123';
const URL_ATUAL = `${BASE}/functions/v1/whatsapp-webhook?instance=${INSTANCIA}`;

/** O formato exato que a operadora devolveu no `GET /webhook`, com valores inventados. */
function webhookDaOperadora(extra: Record<string, unknown> = {}) {
  return {
    addUrlEvents: false,
    addUrlTypesMessages: false,
    enabled: true,
    events: [] as string[],
    excludeMessages: [] as string[],
    id: 'rexemplo123456',
    url: URL_ATUAL,
    ...extra,
  };
}

describe('gerarSegredoDeWebhook', () => {
  it('devolve algo comprido e sem hífen — cabe numa URL sem escapar nada', () => {
    const s = gerarSegredoDeWebhook();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
  });

  it('🔴 dois segredos nunca são iguais — reconfigurar é também como se rotaciona', () => {
    const vistos = new Set(Array.from({ length: 50 }, () => gerarSegredoDeWebhook()));
    expect(vistos.size).toBe(50);
  });
});

describe('enderecoComSegredo', () => {
  it('acrescenta o segredo sem tocar no resto do endereço', () => {
    const novo = enderecoComSegredo(URL_ATUAL, 'segredo123');
    const u = new URL(novo);
    expect(u.searchParams.get('instance')).toBe(INSTANCIA);
    expect(u.searchParams.get('s')).toBe('segredo123');
    expect(u.pathname).toBe('/functions/v1/whatsapp-webhook');
  });

  it('🔴 TROCA o segredo antigo em vez de acrescentar um segundo — senão a rotação cria `s=a&s=b`', () => {
    const novo = enderecoComSegredo(`${URL_ATUAL}&s=antigo`, 'novo');
    expect(novo.match(/[?&]s=/g)).toHaveLength(1);
    expect(new URL(novo).searchParams.get('s')).toBe('novo');
  });

  it('preserva qualquer outro parâmetro que a operadora tenha guardado', () => {
    const novo = enderecoComSegredo(`${URL_ATUAL}&algo=preservar`, 'segredo123');
    expect(new URL(novo).searchParams.get('algo')).toBe('preservar');
  });
});

describe('ehNossoEndereco', () => {
  it('reconhece o endereço da nossa função', () => {
    expect(ehNossoEndereco(URL_ATUAL, BASE, INSTANCIA)).toBe(true);
  });

  it('🔴 recusa endereço de outro projeto — nunca escrever segredo em endereço alheio', () => {
    expect(ehNossoEndereco(
      'https://outro-projeto.supabase.co/functions/v1/whatsapp-webhook?instance=' + INSTANCIA,
      BASE, INSTANCIA,
    )).toBe(false);
  });

  it('🔴 recusa endereço de OUTRA instância — o segredo é por instância', () => {
    expect(ehNossoEndereco(
      `${BASE}/functions/v1/whatsapp-webhook?instance=outra_instancia`,
      BASE, INSTANCIA,
    )).toBe(false);
  });

  it('recusa outra função do mesmo projeto, e endereço quebrado', () => {
    expect(ehNossoEndereco(`${BASE}/functions/v1/outra-coisa?instance=${INSTANCIA}`, BASE, INSTANCIA)).toBe(false);
    expect(ehNossoEndereco('nem-e-um-endereco', BASE, INSTANCIA)).toBe(false);
  });
});

describe('escolherWebhookParaReconfigurar', () => {
  it('um só endereço cadastrado: é esse', () => {
    const r = escolherWebhookParaReconfigurar([webhookDaOperadora()]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.webhook.id).toBe('rexemplo123456');
  });

  it('🔴 nenhum cadastrado: RECUSA — não há o que preservar, e criar do zero é outra decisão', () => {
    const r = escolherWebhookParaReconfigurar([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('nenhum endereço');
  });

  it('🔴 mais de um: RECUSA e não chuta qual — dois endereços significam evento chegando em dobro', () => {
    const r = escolherWebhookParaReconfigurar([webhookDaOperadora(), webhookDaOperadora({ id: 'routro' })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('2');
  });

  it('resposta que não é lista: recusa em vez de quebrar', () => {
    expect(escolherWebhookParaReconfigurar(null).ok).toBe(false);
    expect(escolherWebhookParaReconfigurar({ erro: 'sei la' }).ok).toBe(false);
  });

  it('🔴 item que não é objeto RECUSA aqui — senão estoura lá na frente ao ler `.url`', () => {
    // Um 500 genérico no lugar de uma frase que explica é a diferença entre a pessoa saber o
    // que fazer e ficar no escuro.
    expect(escolherWebhookParaReconfigurar([null]).ok).toBe(false);
    expect(escolherWebhookParaReconfigurar(['so-um-texto']).ok).toBe(false);
  });
});

describe('corpoDeReconfiguracao', () => {
  /**
   * 🔴 O CONSERTO DO "Invalid action", medido no primeiro uso real em 24/09/2026.
   *
   * A operadora recusou o envio com `{"error":"Invalid action"}`. A documentação dela explica:
   * o endpoint tem dois modos, e o que os separa é a presença de `id`/`action`.
   *
   *   · MODO SIMPLES   — sem `action` e sem `id`: ela gerencia o único webhook da instância,
   *                      criando ou atualizando sozinha. É como o cadastro de instância nova
   *                      sempre funcionou aqui.
   *   · MODO AVANÇADO  — `action: "add" | "update" | "delete"`. Atualizar EXIGE o `id`.
   *
   * Devolver a configuração inteira (para não perder campo) trazia o `id` junto, o que joga o
   * pedido no modo avançado — mas sem dizer o que fazer. Daí a recusa.
   *
   * A saída não é largar o `id`: é dizer a ação. Apontar explicitamente para o endereço que a
   * gente ACABOU de ler é mais fiel que deixar a operadora escolher qual — e fecha a dúvida que
   * estava aberta sobre o envio criar um segundo endereço em vez de trocar o existente.
   */

  it('🔴 devolve TUDO o que veio, mudando só o endereço, e DIZ que é atualização', () => {
    const veio = webhookDaOperadora();
    const corpo = corpoDeReconfiguracao(veio, 'https://novo.exemplo/endereco');

    expect(corpo.url).toBe('https://novo.exemplo/endereco');
    expect(corpo.events).toEqual([]);
    expect(corpo.enabled).toBe(true);
    expect(corpo.excludeMessages).toEqual([]);
    expect(corpo.addUrlEvents).toBe(false);
    expect(corpo.addUrlTypesMessages).toBe(false);
    expect(corpo.id).toBe('rexemplo123456');
    expect(corpo.action).toBe('update');
  });

  it('🔴 sem `id` cai no modo simples: nem `action` nem `id` vão no corpo', () => {
    // Mandar `action:"update"` sem `id` seria a mesma recusa, do outro lado.
    const { id: _ignorado, ...semId } = webhookDaOperadora();
    const corpo = corpoDeReconfiguracao(semId, 'https://novo.exemplo/endereco') as Record<string, unknown>;

    expect(corpo.action).toBeUndefined();
    expect(corpo.id).toBeUndefined();
    expect(corpo.url).toBe('https://novo.exemplo/endereco');
    expect(corpo.events).toEqual([]);
  });

  it('🔴 `events` vazio continua vazio — é a configuração real da instância de maior volume', () => {
    const corpo = corpoDeReconfiguracao(webhookDaOperadora({ events: [] }), 'https://x/y');
    expect(corpo.events).toEqual([]);
  });

  it('`events` preenchido continua igual — a outra instância viva usa ["All"]', () => {
    const corpo = corpoDeReconfiguracao(webhookDaOperadora({ events: ['All'] }), 'https://x/y');
    expect(corpo.events).toEqual(['All']);
  });

  it('🔴 campo que a operadora inventar amanhã viaja junto — preservar é a regra, não a lista', () => {
    const corpo = corpoDeReconfiguracao(
      webhookDaOperadora({ campoQueAindaNaoExiste: 'valor', outro: 42 }),
      'https://x/y',
    ) as Record<string, unknown>;
    expect(corpo.campoQueAindaNaoExiste).toBe('valor');
    expect(corpo.outro).toBe(42);
  });
});

describe('semSegredoNoTexto', () => {
  const SEGREDO = 'abc123def456abc123def456abc12345';

  it('🔴 o segredo não vaza pela mensagem de erro da operadora', () => {
    // Quando a operadora recusa, ela devolve o que recebeu — e o que recebeu tem o segredo.
    const recusa = `{"error":"invalid url","received":"${URL_ATUAL}&s=${SEGREDO}"}`;
    const limpo = semSegredoNoTexto(recusa, SEGREDO);
    expect(limpo).not.toContain(SEGREDO);
    expect(limpo).toContain('<oculto>');
    expect(limpo).toContain('invalid url');
  });

  it('🔴 e não vaza quando o `&` vem ESCAPADO — mascarar por padrão de texto não bastava', () => {
    // Servidor em Go escreve a forma escapada de seis caracteres no lugar do `&` ao serializar
    // JSON. A máscara que só procurava `&s=` passava reto, com o segredo inteiro atrás. Passar
    // o VALOR resolve sem depender de adivinhar o formato de ninguém.
    const recusa = '{"received":"https://x/y?instance=z' + String.raw`\u0026` + 's=' + SEGREDO + '"}';
    expect(semSegredoNoTexto(recusa, SEGREDO)).not.toContain(SEGREDO);
  });

  it('🔴 sem receber o valor, ainda tenta pelo padrão — é a segunda linha de defesa', () => {
    const limpo = semSegredoNoTexto(`{"received":"${URL_ATUAL}&s=${SEGREDO}"}`);
    expect(limpo).not.toContain(SEGREDO);
  });

  it('🔴 credencial da operadora também sai do texto', () => {
    const limpo = semSegredoNoTexto('{"token":"chave-da-instancia","status":400}');
    expect(limpo).not.toContain('chave-da-instancia');
    expect(limpo).toContain('400');
  });

  it('o que não é segredo continua legível — a frase precisa explicar o erro', () => {
    expect(semSegredoNoTexto('instance not connected')).toBe('instance not connected');
  });

  it('valor curto demais não vira máscara — apagaria pedaços do texto à toa', () => {
    expect(semSegredoNoTexto('erro no id ab', 'ab')).toBe('erro no id ab');
  });

  it('vazio e nulo não quebram', () => {
    expect(semSegredoNoTexto('')).toBe('');
    expect(semSegredoNoTexto(null)).toBe('');
    expect(semSegredoNoTexto(undefined)).toBe('');
  });
});

describe('enderecoDeInstanciaNova', () => {
  it('monta o endereço da instância que está nascendo, já com a senha', () => {
    const u = new URL(enderecoDeInstanciaNova(BASE, INSTANCIA, 'segredo123'));
    expect(u.pathname).toBe('/functions/v1/whatsapp-webhook');
    expect(u.searchParams.get('instance')).toBe(INSTANCIA);
    expect(u.searchParams.get('s')).toBe('segredo123');
  });

  it('🔴 o que ele monta é reconhecido como nosso — os dois lados falam a mesma língua', () => {
    // Se o montador e o conferidor divergirem, a reconfiguração de uma instância recém-criada
    // recusaria o próprio endereço que ela acabou de cadastrar.
    const url = enderecoDeInstanciaNova(BASE, INSTANCIA, 'segredo123');
    expect(ehNossoEndereco(url, BASE, INSTANCIA)).toBe(true);
  });

  it('base com barra no fim não produz caminho dobrado', () => {
    const u = new URL(enderecoDeInstanciaNova(BASE + '/', INSTANCIA, 'seg'));
    expect(u.pathname).toBe('/functions/v1/whatsapp-webhook');
  });
});

describe('conferirReconfiguracao', () => {
  const alvo = `${URL_ATUAL}&s=segredo123`;

  it('um endereço, com o segredo: passou', () => {
    expect(conferirReconfiguracao([webhookDaOperadora({ url: alvo })], alvo).ok).toBe(true);
  });

  it('🔴 o endereço ficou o antigo: NÃO passou — a operadora aceitou e não aplicou', () => {
    const r = conferirReconfiguracao([webhookDaOperadora()], alvo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('endereço');
  });

  it('🔴 virou DOIS endereços: não passou — evento chegaria em dobro', () => {
    const r = conferirReconfiguracao(
      [webhookDaOperadora(), webhookDaOperadora({ id: 'routro', url: alvo })],
      alvo,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('2');
  });

  it('🔴 o endereço sumiu: não passou', () => {
    expect(conferirReconfiguracao([], alvo).ok).toBe(false);
  });
});
