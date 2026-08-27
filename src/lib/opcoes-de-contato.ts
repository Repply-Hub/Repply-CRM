/**
 * A lista de contatos que o seletor da obra mostra.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 27/08/2026 o seletor oferecia SÓ os contatos do cliente daquela
 * obra. A regra parece certa e o resultado é um campo que não serve. Medido em produção:
 *
 *   obras cujo cliente tem algum contato para escolher ...... 50 de 82
 *   obras em que a lista abre VAZIA .......................... 32   (39%)
 *   contatos cadastrados .................................... 1.092
 *   deles, SEM cliente vinculado ............................. 428   (39%)
 *
 * Em quatro de cada dez obras a lista abre vazia, e 428 contatos não podem ser oferecidos a
 * obra nenhuma — não porque não sirvam, mas porque não têm cliente amarrado. Quem abre o campo,
 * vê vazio e conclui que a funcionalidade está quebrada. Foi exatamente o relato do Lucas.
 *
 * É o MESMO defeito que o seletor de obra do negócio tinha, e a saída é a mesma
 * (ver `src/lib/opcoes-de-obra.ts`): os do cliente vêm primeiro, sem selo; os demais ficam
 * alcançáveis logo abaixo, MARCADOS com a empresa deles.
 *
 * 🔴 O SELO É O QUE TORNA ACEITÁVEL MOSTRAR TODOS. Sem ele alguém vincula ao canteiro o
 * comprador de outra construtora sem perceber, e o erro só aparece quando essa pessoa recebe
 * uma ligação sobre uma obra que não é dela.
 */

interface ContatoCru {
  id: string;
  nome_contato?: string | null;
  cargo?: string | null;
  email?: string | null;
  telefone?: string | null;
  empresa?: string | null;
  cliente_id?: string | null;
}

export interface OpcaoDeContato {
  id: string;
  nome: string;
  /** Cargo, e-mail ou telefone — o que houver, para diferenciar dois homônimos. */
  detalhe: string | null;
  /** A empresa dele, quando o contato NÃO é do cliente da obra. */
  selo?: string;
}

function identificacao(c: ContatoCru): string | null {
  return [c.cargo, c.email, c.telefone].filter(Boolean).join(' · ') || null;
}

/**
 * Junta os contatos do cliente da obra com os demais da empresa, sem repetir.
 *
 * A ordem é a mensagem: primeiro os prováveis, depois os possíveis.
 */
export function opcoesDeContato(
  doCliente: ContatoCru[] | null | undefined,
  todos: ContatoCru[] | null | undefined,
): OpcaoDeContato[] {
  const proprios = doCliente ?? [];
  const universo = todos ?? [];

  const jaListados = new Set(proprios.map((c) => c.id));

  const primeiro: OpcaoDeContato[] = proprios.map((c) => ({
    id: c.id,
    nome: c.nome_contato || 'Contato sem nome',
    detalhe: identificacao(c),
  }));

  const depois: OpcaoDeContato[] = universo
    .filter((c) => !jaListados.has(c.id))
    .map((c) => ({
      id: c.id,
      nome: c.nome_contato || 'Contato sem nome',
      detalhe: identificacao(c),
      // Sem empresa no cadastro o selo fica de fora — inventar "outro cliente" seria pior que
      // não dizer nada, porque a pessoa acreditaria numa informação que o CRM não tem.
      selo: c.empresa || undefined,
    }));

  return [...primeiro, ...depois];
}

export interface EstadoDaListaDeContatos {
  temCliente: boolean;
  temAlgum: boolean;
  carregando?: boolean;
  erro?: boolean;
}

/**
 * A frase que aparece quando a lista está vazia.
 *
 * 🔴 QUATRO SITUAÇÕES mostravam a MESMA frase, e nenhuma dizia o que fazer — o mesmo problema
 * que a lista de obras tinha. Pior: erro de rede aparecia idêntico a "não há contato", então
 * uma falha do banco se disfarçava de cadastro vazio.
 */
export function avisoDaListaDeContatos({
  temCliente,
  temAlgum,
  carregando,
  erro,
}: EstadoDaListaDeContatos): string {
  if (temAlgum) return '';
  if (erro) return 'Não foi possível carregar os contatos. Tente de novo em instantes.';
  if (carregando) return 'Carregando os contatos…';
  if (!temCliente) return 'Escolha o cliente da obra primeiro — os contatos dele aparecem aqui.';
  return 'Nenhum contato cadastrado ainda. Use "Novo contato" para criar o primeiro.';
}

/** Busca por nome, cargo, e-mail, telefone ou empresa. Sem acento e sem caixa. */
export function filtrarOpcoesDeContato(
  opcoes: OpcaoDeContato[],
  busca: string,
): OpcaoDeContato[] {
  const termo = (busca ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!termo) return opcoes;

  return opcoes.filter((o) =>
    `${o.nome} ${o.detalhe ?? ''} ${o.selo ?? ''}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .includes(termo),
  );
}
