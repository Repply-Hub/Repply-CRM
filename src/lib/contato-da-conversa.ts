/**
 * O que dá para aproveitar de uma conversa de WhatsApp para abrir um contato no CRM.
 *
 * 🔴 POR QUE ISTO EXISTE. Medido em produção em 27/08/2026:
 *
 *   conversas de WhatsApp ............................. 779
 *   delas, ligadas a um contato do CRM .................   0
 *   delas, ligadas a um cliente do CRM .................   0
 *
 * NENHUMA das 779 está ligada ao cadastro, e não é por descuido: **não existe tela que grave
 * esse vínculo**. As colunas `contato_id` e `cliente_id` da conversa são lidas em três lugares
 * do painel do lead e nunca escritas em lugar nenhum. O resultado é que a equipe conversa com
 * 779 pessoas que o CRM não conhece, e o painel "Dados do lead" nunca aparece — ele só é
 * desenhado quando há cliente ou contato.
 *
 * Este arquivo é só o cálculo: o que sugerir de nome, que telefone gravar e quando NÃO dá para
 * criar contato nenhum.
 */

export interface ConversaParaContato {
  id: string;
  nome_contato?: string | null;
  telefone: string;
  is_group?: boolean | null;
  contato_id?: string | null;
}

export interface SugestaoDeContato {
  /** O que preencher no campo Nome. Pode vir vazio — a conversa nem sempre tem nome. */
  nome: string;
  /** O telefone já em formato de gente, para o cadastro. */
  telefone: string;
  /** Quando preenchido, NÃO dá para criar contato — e este texto explica por quê. */
  impedimento: string | null;
}

/**
 * Formata o número do jeito que uma pessoa escreve, a partir do que o WhatsApp guardou.
 *
 * O WhatsApp guarda `5584999887766`; a ficha do CRM é preenchida por gente e fica
 * `(84) 99988-7766`. Gravar o número cru deixaria o cadastro com um formato que ninguém digita,
 * e a busca por telefone (que compara dígitos) continua funcionando dos dois jeitos.
 *
 * 🔴 NÃO force o nono dígito. Enfiá-lo em qualquer número de 10 dígitos quebra os telefones
 * FIXOS que têm WhatsApp — já respondeu por 100% das falhas de envio deste sistema, com um
 * cliente real de fixo (84) 2030-0387 (CLAUDE.md §7.1). Aqui só formatamos o que veio.
 */
export function telefoneParaCadastro(bruto: string | null | undefined): string {
  const original = (bruto ?? '').trim();

  // 🔴 NÚMERO ESTRANGEIRO SAI INTEIRO, sem passar pela máscara brasileira.
  //
  // Um teste pegou isto antes de virar cadastro errado: `+1 415 555 0123` tem onze dígitos, o
  // mesmo tanto de um celular daqui, e a máscara o transformava em `(14) 15555-0123` — um
  // telefone brasileiro plausível, que não existe. Ninguém desconfiaria olhando a ficha; o erro
  // só apareceria quando alguém ligasse e caísse num estranho.
  //
  // O `+` é o sinal que sobrevive: quem tem `+` e não é `+55` não é daqui.
  if (original.startsWith('+') && !original.replace(/\D/g, '').startsWith('55')) return original;

  let digitos = original.replace(/\D/g, '');

  // Tira o código do país só quando ele É código de país. O DDD 55 (Rio Grande do Sul) também
  // começa com 55, e cortá-lo transformaria um número gaúcho válido em outro inexistente.
  if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  // Formato que não reconheço volta como veio, pelo mesmo motivo.
  return original;
}

/**
 * Limpa o nome que veio do aparelho.
 *
 * O WhatsApp devolve o apelido que a própria pessoa escolheu, e ele costuma trazer emoji,
 * empresa e cargo grudados ("🏗️ João - Construpav"). Serve como sugestão, não como verdade —
 * quem cadastra corrige.
 */
export function nomeParaCadastro(bruto: string | null | undefined): string {
  const limpo = (bruto ?? '')
    // Emoji e símbolos soltos. Mantém letras acentuadas, números e a pontuação comum de nome.
    .replace(/[^\p{L}\p{N}\s.'&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Nome que virou só pontuação depois da limpeza não é nome.
  return /\p{L}/u.test(limpo) ? limpo : '';
}

export function sugestaoDeContato(
  conversa: ConversaParaContato | null | undefined,
): SugestaoDeContato {
  if (!conversa) {
    return { nome: '', telefone: '', impedimento: 'Nenhuma conversa aberta.' };
  }

  // 🔴 GRUPO NÃO VIRA CONTATO. Um grupo é um lugar com várias pessoas dentro; cadastrá-lo como
  // contato criaria uma ficha com um identificador de grupo no campo de telefone — e quem
  // depois ligasse para esse "telefone" descobriria que ele não existe.
  if (conversa.is_group || conversa.telefone?.includes('-') || conversa.telefone?.includes('@g.us')) {
    return {
      nome: '',
      telefone: '',
      impedimento: 'Esta conversa é um grupo, e grupo não vira contato — cadastre a pessoa.',
    };
  }

  if (conversa.contato_id) {
    return {
      nome: '',
      telefone: '',
      impedimento: 'Esta conversa já está ligada a um contato do CRM.',
    };
  }

  const telefone = telefoneParaCadastro(conversa.telefone);
  if (!telefone) {
    return { nome: '', telefone: '', impedimento: 'Esta conversa está sem número.' };
  }

  return {
    nome: nomeParaCadastro(conversa.nome_contato),
    telefone,
    impedimento: null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * RECONHECER QUEM JÁ ESTÁ CADASTRADO
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A chave que permite dizer "este número do WhatsApp é aquela pessoa do CRM".
 *
 * 🔴 POR QUE PRECISA EXISTIR. Medido em produção em 28/08/2026:
 *
 *   conversas de pessoa (sem grupo) ..................... 757
 *   delas, ligadas a um contato do CRM ..................   0
 *   delas cujo telefone JÁ ESTÁ em `contatos` ...........  54
 *
 * Ou seja: 54 pessoas estão cadastradas e o painel do WhatsApp diz "Esta pessoa não está no
 * CRM" para todas. O sistema nunca comparou o número da conversa com o telefone do contato —
 * o vínculo só existia se alguém o criasse à mão. Caso real relatado pelo dono do produto:
 * "Lucas Dutra - Macam Empreendimentos" está em Contatos e a conversa dele aparece como não
 * cadastrada.
 *
 * O FORMATO É A DIFICULDADE. O WhatsApp guarda `5584999887766`; a ficha guarda
 * `(84) 99988-7766`, e às vezes `84 9988-7766` (sem o nono dígito). Comparar texto não casa
 * nenhum dos três.
 *
 * A chave é **DDD + os 8 dígitos finais**:
 *
 *   - os 8 finais NÃO mudam com o nono dígito, que é justamente o que varia entre um cadastro
 *     antigo e o número que o WhatsApp reporta (CLAUDE.md §7.1 — e continua PROIBIDO forçar
 *     esse dígito; aqui só o ignoramos na comparação);
 *   - o DDD entra porque só os 8 finais colidem: medido nesta base, comparar só por eles
 *     produzia 1 casamento a mais que o correto — pessoas diferentes, em DDDs diferentes, com
 *     o mesmo final.
 *
 * Devolve `null` quando não dá para comparar com honestidade — e `null` NUNCA casa com nada:
 *
 *   - número estrangeiro (`+` que não é `+55`): a conta de DDD não vale lá fora;
 *   - identificador de grupo: tem dígitos demais e não é telefone de ninguém;
 *   - número curto demais para ter DDD + 8.
 */
export function chaveDeTelefone(bruto: string | null | undefined): string | null {
  const original = (bruto ?? '').trim();
  if (!original) return null;

  // Estrangeiro não entra na comparação — mesma razão de `telefoneParaCadastro` não o mascarar.
  if (original.startsWith('+') && !original.replace(/\D/g, '').startsWith('55')) return null;

  let digitos = original.replace(/\D/g, '');

  // Só tira o `55` quando ele É código de país: o DDD 55 (Rio Grande do Sul) também começa
  // com 55, e cortá-lo casaria um gaúcho com quem ele não é.
  if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);

  // Acima de 11 já não é telefone brasileiro — é identificador de grupo ou lixo. Sem esta
  // guarda, um `120363...@g.us` viraria uma chave plausível e casaria com alguém.
  if (digitos.length > 11) return null;
  if (digitos.length < 10) return null;

  return digitos.slice(0, 2) + digitos.slice(-8);
}

export interface ContatoCadastrado {
  id: string;
  nome_contato: string | null;
  telefone: string | null;
  cliente_id?: string | null;
  empresa?: string | null;
}

/**
 * Quais contatos do CRM têm o mesmo telefone desta conversa.
 *
 * 🔴 DEVOLVE UMA LISTA, e não "o contato". Medido em 28/08/2026: **44 telefones aparecem em
 * mais de um contato** desta base (a mesma pessoa cadastrada duas vezes, ou o telefone da
 * construtora repetido em vários funcionários). Escolher um sozinho gravaria o vínculo errado
 * em silêncio — e o vínculo errado é pior que vínculo nenhum, porque some da vista.
 *
 * 🔴 O RECORTE POR EMPRESA NÃO É FEITO AQUI, é a regra de segurança do banco que faz. A lista
 * de contatos que chega nesta função já vem filtrada pela política de `contatos`, que só
 * devolve os da empresa de quem está logado. Medido: sem esse recorte, 2 conversas casariam
 * com contato de OUTRA empresa assinante.
 */
export function contatosComMesmoTelefone<T extends ContatoCadastrado>(
  telefoneDaConversa: string | null | undefined,
  contatos: readonly T[] | null | undefined,
): T[] {
  const chave = chaveDeTelefone(telefoneDaConversa);
  if (!chave || !contatos?.length) return [];
  return contatos.filter((c) => chaveDeTelefone(c.telefone) === chave);
}
