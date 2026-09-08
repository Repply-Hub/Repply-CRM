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
  return contatos.filter((c) => chavesDeTelefone(c.telefone).includes(chave));
}

/**
 * TODAS as chaves de um campo de telefone — porque um contato pode guardar mais de um número
 * no mesmo campo.
 *
 * 🔴 O QUE ISTO DESTRAVA. `chaveDeTelefone` junta todos os dígitos do texto numa string só, e
 * o portão dos 11 dígitos (que existe para barrar identificador de grupo) mata qualquer campo
 * com dois números: `"5511996763986, 551196763986"` vira 25 dígitos e devolve `null`. Medido em
 * produção: **79 contatos guardam mais de um número**, em 170 pedaços, e todos eles eram
 * invisíveis para o reconhecimento. Passar a quebrar antes leva o casamento de 42 para 73
 * conversas.
 *
 * Quebra em vírgula, ponto-e-vírgula e barra. **Hífen NÃO entra na lista**, de propósito: o
 * identificador antigo de grupo do WhatsApp tem hífen (`120363...-123456`), e quebrá-lo
 * inventaria números que não existem — a armadilha do §7.2 do CLAUDE.md.
 *
 * Medido antes de escolher a régua: dos 170 pedaços, **170 têm DDD**. Nenhum vem só com o
 * número solto, então não há por que herdar o DDD do pedaço anterior — adivinhação que casaria
 * gente de estado diferente.
 */
export function chavesDeTelefone(bruto: string | null | undefined): string[] {
  const partes = (bruto ?? '').split(/[,;/]/);
  const chaves = new Set<string>();
  for (const parte of partes) {
    const chave = chaveDeTelefone(parte);
    if (chave) chaves.add(chave);
  }
  return [...chaves];
}

/**
 * Palavras que não distinguem ninguém, e por isso não contam no casamento por nome.
 *
 * Quase todas são sufixo de razão social ou rótulo de função: se "construções" contasse, metade
 * das construtoras casaria com a outra metade. "Junior", "neto" e "filho" entram pelo mesmo
 * motivo — são o segundo termo de milhares de nomes e criariam par onde só há homonímia.
 */
const PALAVRAS_QUE_NAO_DISTINGUEM = new Set([
  'ltda', 'eireli', 'spe', 'construcoes', 'construcao', 'engenharia', 'empreendimentos',
  'incorporacoes', 'incorp', 'constr', 'com', 'das', 'dos', 'pessoa', 'fisica', 'compras',
  'obra', 'vendas', 'financeiro', 'contas', 'receber', 'empresa', 'servicos', 'sem', 'nome',
  'junior', 'neto', 'filho', 'sra', 'atualizado', 'imobiliarios', 'participacoes', 'industria',
  'comercio', 'distribuidora', 'adm', 'escritorio', 'condominio', 'residencial',
]);

/** As palavras de um nome que valem para comparação: sem acento, minúsculas, 3+ letras. */
export function palavrasDoNome(nome: string | null | undefined): string[] {
  const semAcento = (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const palavras = semAcento.split(/[^a-z0-9]+/).filter(Boolean);
  return [...new Set(palavras.filter((p) => p.length >= 3 && !PALAVRAS_QUE_NAO_DISTINGUEM.has(p)))];
}

/**
 * Quem, no CRM, tem NOME PARECIDO com o da conversa — para o caso do telefone que não bate.
 *
 * 🔴 ISTO É PALPITE, E O PALPITE ERRA. Aferido à mão numa amostra de 14 casos reais: acerta
 * cerca de **2 em cada 3**. O terço que erra tem uma cara perigosa — "Alexsandro - Mirantes ML2"
 * casa com "Gilkleber - Mirantes ML2": **mesma construtora, pessoa errada**, que é o engano mais
 * fácil de aceitar sem perceber. Por isso quem chama NUNCA pode amarrar sozinho: só sugerir, com
 * aviso, e deixar a pessoa decidir.
 *
 * 🔴 DUAS PALAVRAS EM COMUM, NÃO UMA. Medido sobre as 871 conversas cujo telefone não casa com
 * ninguém:
 *
 *   1 palavra em comum ... 593 casam, mas 403 delas apontam MAIS DE TRÊS pessoas (pior caso: 75)
 *   2 palavras em comum ... 169 casam, e 118 apontam UMA só (pior caso: 7)
 *
 * Com uma palavra é ruído: "Lucas" casa com todo Lucas, e uma lista de 75 nomes não é sugestão,
 * é loteria. O que fornece a segunda palavra de graça é a disciplina da agenda da MD, que salva
 * como "Nome - Empresa" — 445 das 968 conversas soltas têm esse formato.
 *
 * O `limite` existe porque lista longa é onde se clica no errado.
 */
export function contatosComNomeParecido<T extends ContatoCadastrado>(
  nomeDaConversa: string | null | undefined,
  contatos: readonly T[] | null | undefined,
  limite = 3,
): T[] {
  const daConversa = palavrasDoNome(nomeDaConversa);
  if (daConversa.length < 2 || !contatos?.length) return [];

  const emComum = (nome: string | null | undefined) =>
    palavrasDoNome(nome).filter((p) => daConversa.includes(p)).length;

  return contatos
    .map((c) => ({ c, quantas: emComum(c.nome_contato) }))
    .filter((x) => x.quantas >= 2)
    // Mais palavras em comum primeiro: o casamento mais forte fica no topo.
    .sort((a, b) => b.quantas - a.quantas)
    .slice(0, limite)
    .map((x) => x.c);
}

/* ────────────────────────────────────────────────────────────────────────────
 * PROCURAR UM CONTATO À MÃO
 * ──────────────────────────────────────────────────────────────────────────── */

/** Sem acento e em minúsculas — para "Djair" achar "djair" e "Construções" achar "construcoes". */
function semAcento(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Procurar um contato pelo que a pessoa digita — a saída para quando NEM o telefone NEM o nome
 * reconheceram ninguém.
 *
 * 🔴 O CASO QUE OBRIGOU ISTO A EXISTIR, relatado pelo dono do produto em 06/09/2026. O Djair da
 * Licenge tem três fichas no CRM e o chat dele oferecia só "Cadastrar como contato" — criar a
 * quarta. As duas camadas automáticas falharam por motivos diferentes, e nenhuma delas é
 * conserto de régua:
 *
 *   - por TELEFONE: a ficha guarda `6143498404030`, um dos 383 números corrompidos na
 *     importação de 24/07. É o celular dele embaralhado (a fórmula devolve `5584999202015`,
 *     exatamente o número de onde ele fala) — mas, do jeito que está gravado, nenhuma
 *     comparação honesta o encontra;
 *   - por NOME: a ficha que casaria ("Djair - Licenge") **está sem telefone**, e a consulta de
 *     reconhecimento pedia `telefone não vazio`. Medido: **196 contatos** ficavam de fora por
 *     isso, 104 deles com empresa vinculada. Esse filtro caiu junto com esta função.
 *
 * Mesmo com os dois consertos, sobra o caso em que o cadastro simplesmente não se parece com o
 * que o WhatsApp mostra. Aí só a pessoa sabe — e ela precisa de um jeito de dizer.
 *
 * A BUSCA OLHA NOME, EMPRESA E TELEFONE. A empresa entra porque é ela que salva quem não tem
 * telefone no cadastro: digitar "licenge" acha o Djair que nenhuma régua automática acharia.
 *
 * TODAS as palavras precisam bater, em qualquer ordem e em qualquer um dos três campos. Com
 * 2.013 contatos, exigir só uma devolveria uma lista onde se clica no errado — a mesma razão
 * pela qual `contatosComNomeParecido` pede duas palavras.
 */
export function contatosQueCasamComTexto<T extends ContatoCadastrado>(
  termo: string | null | undefined,
  contatos: readonly T[] | null | undefined,
): T[] {
  const lista = contatos ?? [];
  if (!lista.length) return [];

  const porNome = [...lista].sort((a, b) =>
    semAcento(a.nome_contato).localeCompare(semAcento(b.nome_contato), 'pt-BR'),
  );

  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return porNome;

  return porNome.filter((c) => {
    // O telefone entra duas vezes: como está escrito e só com os dígitos, para "84999202015"
    // achar quem está gravado como "(84) 99920-2015".
    const alvo = [
      semAcento(c.nome_contato),
      semAcento(c.empresa),
      semAcento(c.telefone),
      (c.telefone ?? '').replace(/\D/g, ''),
    ].join(' ');
    return palavras.every((p) => alvo.includes(p));
  });
}

/**
 * O campo de telefone da ficha depois de trazer o número de quem está falando no chat.
 *
 * 🔴 GUARDA OS DOIS, não substitui. Decisão do dono do produto em 07/09/2026, para o caso que
 * ele descreveu: o cadastro tem o fixo da construtora e a pessoa fala do celular pessoal. O fixo
 * continua valendo — é por ele que se fala com a empresa quando aquela pessoa sai — e o celular
 * passa a ser reconhecido pelo WhatsApp. O campo já aceita dois números separados por vírgula:
 * 79 contatos desta base são assim.
 *
 * 🔴 NÃO REPETE O QUE JÁ ESTÁ LÁ, e a comparação é pela CHAVE (DDD + 8 finais), não pelo texto.
 * Sem isso, uma ficha com `(84) 9920-2015` (cadastro antigo, sem o nono dígito) ganharia
 * `(84) 99920-2015` do lado e ficaria com o mesmo telefone escrito duas vezes — parecendo dois
 * contatos possíveis onde só existe um.
 *
 * Número de chat que não dá para comparar (estrangeiro, curto) não é grudado numa ficha que já
 * tem telefone: ali o certo é a pessoa digitar, não a máquina adivinhar. Ficha VAZIA recebe
 * assim mesmo — melhor ter o número estranho do que não ter nenhum.
 */
export function telefoneComONumeroDoChat(
  atual: string | null | undefined,
  doChat: string | null | undefined,
): string {
  const jaTem = (atual ?? '').trim();
  const novo = telefoneParaCadastro(doChat);
  if (!novo) return jaTem;
  if (!jaTem) return novo;

  const chaveNova = chaveDeTelefone(doChat);
  if (!chaveNova) return jaTem;
  if (chavesDeTelefone(jaTem).includes(chaveNova)) return jaTem;

  return `${jaTem}, ${novo}`;
}

export interface ConversaParaCasar {
  id: string;
  telefone: string | null;
  contato_id: string | null;
}

/**
 * A conversa de WhatsApp desta pessoa: primeiro pelo vínculo explícito, depois pelo telefone.
 *
 * 🔴 O CONTATO PODE TER MAIS DE UM NÚMERO, e é por isso que esta função existe separada do
 * gancho. A busca usava `chaveDeTelefone` no singular, que devolve `null` para qualquer campo
 * com dois números (o portão dos 11 dígitos, que existe para barrar identificador de grupo).
 * Resultado medido em produção em 07/09/2026: **30 contatos** têm dois números E conversa de
 * WhatsApp, e para todos eles o botão "Ver conversa" aparecia apagado — na ficha da pessoa, na
 * lista da empresa, nos contatos do negócio e no histórico.
 *
 * A conversa continua sendo lida no singular: o telefone que o WhatsApp reporta é sempre um
 * número só, e `chavesDeTelefone` só quebraria em vírgula, ponto-e-vírgula e barra — nunca em
 * hífen, que é o que separa o identificador antigo de grupo (CLAUDE.md §7.2).
 */
export function conversaDoContato<T extends ConversaParaCasar>(
  conversas: readonly T[] | null | undefined,
  telefone: string | null | undefined,
  contatoId: string | null | undefined,
): T | null {
  if (!conversas?.length) return null;

  if (contatoId) {
    const ligada = conversas.find((c) => c.contato_id === contatoId);
    if (ligada) return ligada;
  }

  const chaves = chavesDeTelefone(telefone);
  if (!chaves.length) return null;

  return conversas.find((c) => {
    const chave = chaveDeTelefone(c.telefone);
    return chave !== null && chaves.includes(chave);
  }) ?? null;
}
