/**
 * Para quem dá para mandar algo por WhatsApp: os contatos cadastrados MAIS as conversas já
 * abertas e atribuídas a quem está usando o sistema.
 *
 * 🔴 POR QUE AS CONVERSAS PRECISAM ENTRAR. Medido em produção em 27/08/2026:
 *
 *   conversas de WhatsApp ............................. 779
 *   delas, SEM contato do CRM vinculado ............... 779   (100%)
 *   conversas atribuídas a alguém ......................  70
 *   grupos .............................................  28
 *
 * NENHUMA das 779 conversas está ligada a um contato cadastrado. Uma lista feita só de
 * `contatos` deixa de fora exatamente as pessoas com quem a equipe está conversando agora — e o
 * vendedor teria de cadastrar o cliente só para poder mandar um arquivo para alguém que já está
 * do outro lado de uma conversa aberta.
 */

export interface ContatoCru {
  id: string;
  nome_contato: string | null;
  empresa: string | null;
  telefone: string | null;
}

export interface ConversaCrua {
  id: string;
  nome_contato: string | null;
  telefone: string;
  is_group: boolean;
}

export interface DestinoWhatsApp {
  chave: string;
  origem: 'conversa' | 'contato';
  nome: string;
  /** Empresa, ou o que ajudar a reconhecer quem é. */
  detalhe: string | null;
  /**
   * 🔴 LITERAL, do jeito que está gravado. NUNCA limpe não-dígitos daqui.
   *
   * O identificador de grupo antigo do WhatsApp tem hífen (`5511988345626-1425926780`). Um
   * `replace(/\D/g, '')` apaga o hífen e monta um destino que não existe — e a uazapi responde
   * sucesso e não entrega nada. Foi bug silencioso por meses (CLAUDE.md §7.2). Quem envia
   * repassa esta string como está; quem decide se é grupo é o servidor.
   */
  telefone: string;
  /** O contato do CRM, quando existe. Nulo para conversa sem cadastro — que hoje são todas. */
  contatoId: string | null;
  /**
   * A conversa de WhatsApp, quando o destino veio de uma.
   *
   * 🔴 É o ÚNICO jeito de abrir a conversa certa depois. A caixa de entrada seleciona a conversa
   * por `?conversaId=` (WhatsAppInbox.tsx:3876) — `?telefone=` não é lido por ninguém, e um
   * botão "ver na conversa" montado com ele abre o WhatsApp na tela padrão, sem nada
   * acontecendo, como se o clique tivesse falhado.
   */
  conversaId: string | null;
  ehGrupo: boolean;
}

/**
 * Só os dígitos, e só os do fim, para reconhecer a mesma pessoa escrita de dois jeitos.
 *
 * "(84) 99988-7766" (cadastro) e "5584999887766" (WhatsApp) são o mesmo número: um tem o código
 * do país, o outro não. Comparar os últimos 8 dígitos casa os dois sem depender de formato.
 *
 * 🔴 Isto serve SÓ para comparar. O número que vai para o envio é sempre o literal.
 */
function fimDosDigitos(telefone: string | null | undefined): string {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(-8) : digitos;
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Junta as duas fontes numa lista só, sem repetir gente.
 *
 * A ordem é a mensagem: as conversas abertas vêm primeiro, porque é com elas que a pessoa está
 * conversando agora; o cadastro é a busca fria, e vem depois.
 */
export function montarDestinos(
  contatos: ContatoCru[] | null | undefined,
  conversas: ConversaCrua[] | null | undefined,
): DestinoWhatsApp[] {
  const listaDeContatos = contatos ?? [];
  const listaDeConversas = conversas ?? [];

  // Índice do cadastro pelo fim do número, para emprestar nome e empresa às conversas.
  const cadastroPorNumero = new Map<string, ContatoCru>();
  for (const c of listaDeContatos) {
    const chave = fimDosDigitos(c.telefone);
    if (chave && !cadastroPorNumero.has(chave)) cadastroPorNumero.set(chave, c);
  }

  const destinos: DestinoWhatsApp[] = [];
  const jaUsados = new Set<string>();

  for (const conversa of listaDeConversas) {
    if (!conversa?.telefone) continue;
    const numero = fimDosDigitos(conversa.telefone);
    // Grupo nunca casa com contato do cadastro, e o `numero` dele é longo — só não pode
    // deduplicar dois grupos entre si por engano, daí a chave cair no telefone literal.
    const chaveDeDuplicata = conversa.is_group ? conversa.telefone : numero;
    if (chaveDeDuplicata && jaUsados.has(chaveDeDuplicata)) continue;
    if (chaveDeDuplicata) jaUsados.add(chaveDeDuplicata);

    const doCadastro = conversa.is_group ? undefined : cadastroPorNumero.get(numero);

    destinos.push({
      chave: `conversa:${conversa.id}`,
      origem: 'conversa',
      // O nome do cadastro ganha do nome do WhatsApp: "João R." é como a pessoa se apelidou no
      // aparelho, "João Ribeiro" é como o CRM o conhece.
      nome: doCadastro?.nome_contato || conversa.nome_contato || conversa.telefone,
      detalhe: [
        doCadastro?.empresa,
        conversa.is_group ? 'grupo' : 'conversa aberta',
      ]
        .filter(Boolean)
        .join(' · '),
      // 🔴 O telefone é o da CONVERSA, literal: é o destino que já está funcionando.
      telefone: conversa.telefone,
      contatoId: doCadastro?.id ?? null,
      conversaId: conversa.id,
      ehGrupo: !!conversa.is_group,
    });
  }

  for (const contato of listaDeContatos) {
    if (!contato?.telefone) continue;
    const numero = fimDosDigitos(contato.telefone);
    if (numero && jaUsados.has(numero)) continue;
    if (numero) jaUsados.add(numero);

    destinos.push({
      chave: `contato:${contato.id}`,
      origem: 'contato',
      nome: contato.nome_contato || contato.telefone,
      detalhe: contato.empresa,
      telefone: contato.telefone,
      contatoId: contato.id,
      // Contato do cadastro pode nem ter conversa aberta ainda — quem mandar cria a primeira.
      conversaId: null,
      ehGrupo: false,
    });
  }

  return destinos;
}

/** Busca por nome, empresa ou telefone. Aceita o número digitado só em dígitos. */
export function filtrarDestinos(destinos: DestinoWhatsApp[], busca: string): DestinoWhatsApp[] {
  const termo = semAcento((busca ?? '').trim());
  if (!termo) return destinos;

  const soDigitos = termo.replace(/\D/g, '');

  return destinos.filter((d) => {
    if (semAcento(`${d.nome} ${d.detalhe ?? ''}`).includes(termo)) return true;
    // Quem procura pelo número digita "99988", não "(84) 99988-7766".
    if (soDigitos && d.telefone.replace(/\D/g, '').includes(soDigitos)) return true;
    return false;
  });
}
