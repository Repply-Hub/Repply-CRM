/**
 * A regra que autoriza — ou não — passar a RECUSAR quem chama o webhook do WhatsApp sem
 * apresentar a senha. Item 16 da dívida técnica, etapa 3d de
 * `docs/operacao/plano-blindagem-whatsapp.md`.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 POR QUE ISTO É CÓDIGO, E NÃO CRITÉRIO NA CABEÇA DE ALGUÉM
 * ---------------------------------------------------------------------------------
 * Ligar a recusa cedo demais faz 100% das mensagens pararem de chegar **em silêncio**, com a
 * instância ainda aparecendo "conectada" na tela. Já aconteceu neste sistema (`0715119`) e
 * ninguém percebeu por dias.
 *
 * Três armadilhas moram aqui, e as três já enganaram alguém:
 *
 * 1. **Instância protegida e PARADA.** Sem nenhum evento nas últimas 24h, qualquer conta de
 *    porcentagem dá 100% — zero de zero é vacuamente perfeito. Ausência de informação não é
 *    informação.
 * 2. **`veio_com_segredo` versus `confere`.** O primeiro mede PRESENÇA, o segundo mede se
 *    BATE. Depois de uma troca, a operadora pode continuar mandando a senha velha — presente e
 *    errada. A conta que vale é sempre a de `confere`.
 * 3. **Arredondar para cima.** Com 5 mil eventos por dia, um único que não confere ainda dá
 *    "100%" ao arredondar — e 100% é exatamente a frase que autoriza virar a chave. Aqui o
 *    100% só aparece quando é 100% de verdade, e a tela mostra **quantos** ficaram de fora,
 *    não só a porcentagem: um punhado de eventos sem senha no meio de milhares pode ser
 *    justamente o intruso que este conserto existe para barrar.
 */

export interface LinhaDeConferencia {
  instancia_id: string;
  instance_name: string;
  empresa: string | null;
  status: string | null;
  /** Se existe senha gravada. O VALOR nunca chega até aqui. */
  tem_segredo: boolean;
  /**
   * Quantos eventos das últimas 24h DAVA para conferir — ou seja, chegaram quando já havia
   * senha configurada. Eventos anteriores à proteção ficam fora: contá-los mostraria o
   * acerto como fracasso nas primeiras horas depois de proteger uma instância.
   */
  eventos_24h: number;
  com_segredo_24h: number;
  conferem_24h: number;
  ultimo_evento_em: string | null;
}

export type EstadoDaInstancia =
  /** Nenhuma senha configurada: o endereço aceita qualquer um. É o estado do item 16. */
  | 'sem-segredo'
  /** Tem senha, mas nenhum evento nas últimas 24h — não há o que confirmar. */
  | 'sem-movimento'
  /** Tem senha e chegam eventos, mas nenhum com a senha certa ainda. */
  | 'esperando'
  /** Parte dos eventos confere, parte não. */
  | 'parcial'
  /** Todos os eventos das últimas 24h conferem, e houve movimento. */
  | 'pronta';

export interface Prontidao {
  estado: EstadoDaInstancia;
  /** Quantos por cento dos eventos das últimas 24h conferem. `null` sem movimento. */
  porcentagem: number | null;
  /** Quantos eventos NÃO conferiram. É o número que separa "quase pronto" de "tem intruso". */
  foraDaConta: number;
  /** Esta instância, sozinha, autoriza ligar a recusa? */
  autorizaRecusa: boolean;
  /** Frase para a tela, já pronta. */
  texto: string;
}

export function prontidaoDaInstancia(linha: LinhaDeConferencia): Prontidao {
  const eventos = linha.eventos_24h ?? 0;
  const conferem = linha.conferem_24h ?? 0;
  const foraDaConta = Math.max(0, eventos - conferem);

  // 🔴 A falta de proteção vem ANTES da falta de medição. Uma instância sem senha e parada é,
  // acima de tudo, uma instância sem senha — dizer "sem movimento" esconderia o buraco atrás
  // de um estado que soa neutro. Três das instâncias reais estão exatamente nessa forma.
  if (!linha.tem_segredo) {
    return {
      estado: 'sem-segredo',
      porcentagem: null,
      foraDaConta,
      autorizaRecusa: false,
      texto: 'Sem senha: o endereço aceita qualquer um que saiba o nome da instância.',
    };
  }

  // Sem movimento não existe medição, e 0 de 0 pareceria 100% em toda conta que viesse depois.
  if (eventos === 0) {
    return {
      estado: 'sem-movimento',
      porcentagem: null,
      foraDaConta: 0,
      autorizaRecusa: false,
      texto: 'Protegida. Ainda não chegou nenhum evento depois da proteção, então não há o que confirmar.',
    };
  }

  if (conferem === 0) {
    return {
      estado: 'esperando',
      porcentagem: 0,
      foraDaConta,
      autorizaRecusa: false,
      texto: `Protegida, mas nenhum dos ${eventos} eventos das últimas 24h veio com a senha certa.`,
    };
  }

  if (conferem < eventos) {
    // Teto em 99: com milhares de eventos, um único fora da conta arredondaria para 100% — e é
    // esse 100% que autoriza virar a chave.
    const porcentagem = Math.min(99, Math.max(1, Math.floor((conferem / eventos) * 100)));
    return {
      estado: 'parcial',
      porcentagem,
      foraDaConta,
      autorizaRecusa: false,
      texto: `${foraDaConta} de ${eventos} eventos chegaram sem a senha certa (${porcentagem}% conferem). ` +
        'Pode ser configuração pela metade — ou alguém de fora mandando evento.',
    };
  }

  return {
    estado: 'pronta',
    porcentagem: 100,
    foraDaConta: 0,
    autorizaRecusa: true,
    texto: `Todos os ${eventos} eventos das últimas 24h conferem.`,
  };
}

export interface VereditoDoConjunto {
  /** Dá para ligar a recusa? */
  pode: boolean;
  /** Instâncias que IMPEDEM: sem senha, ou com evento que não confere. */
  pendentes: string[];
  /** Protegidas, mas sem movimento para confirmar. Não impedem — e não somem do relatório. */
  naoMedidas: string[];
}

/**
 * O conjunto autoriza ligar a recusa?
 *
 * 🔴 A recusa é do SISTEMA, não de uma instância: o código do webhook é um só. Por isso basta
 * uma instância pendente para o conjunto não autorizar — e lista vazia não autoriza, porque
 * "nenhuma instância medida" é falta de medição, não ausência de pendência.
 *
 * 🔴 MAS INSTÂNCIA PARADA NÃO PODE TRAVAR PARA SEMPRE. Há instâncias desconectadas que não
 * recebem um evento há semanas; se elas contassem como pendência, o veredito nunca ficaria
 * verde e a etapa final do plano viraria inalcançável — a trava deixaria de proteger e passaria
 * a só emperrar. Elas têm senha configurada (a reconfiguração confere o endereço na operadora
 * ANTES de gravar, que é evidência mais forte que tráfego), então saem da conta — mas são
 * nomeadas, para ninguém confundir "não impede" com "foi confirmada".
 */
export function podeLigarARecusa(linhas: LinhaDeConferencia[]): VereditoDoConjunto {
  const lista = linhas ?? [];
  const pendentes: string[] = [];
  const naoMedidas: string[] = [];

  for (const l of lista) {
    const p = prontidaoDaInstancia(l);
    if (p.autorizaRecusa) continue;
    if (p.estado === 'sem-movimento') naoMedidas.push(l.instance_name);
    else pendentes.push(l.instance_name);
  }

  // Pelo menos uma instância precisa ter sido confirmada de verdade. Um conjunto inteiro de
  // instâncias paradas é falta de medição, e não autoriza nada.
  const algumaConfirmada = lista.some((l) => prontidaoDaInstancia(l).autorizaRecusa);

  return { pode: algumaConfirmada && pendentes.length === 0, pendentes, naoMedidas };
}
