/**
 * De onde a pessoa veio ao cair na tela de escolher a nova senha.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 POR QUE ISTO EXISTE (item 59 da dívida técnica)
 * ---------------------------------------------------------------------------------
 * O link de redefinição vale no máximo uma hora, e antivírus de e-mail corporativo abre o
 * endereço sozinho para checar segurança — queimando o link antes de a pessoa clicar. Quando o
 * link falha, o Supabase devolve a pessoa para a NOSSA tela com o motivo escrito no endereço.
 *
 * A tela ignorava isso e desenhava o formulário como se estivesse tudo bem. Dois estragos:
 * a pessoa digitava a senha duas vezes para só então levar um aviso genérico sem saída; e, num
 * computador compartilhado, a troca DAVA CERTO na conta de quem estava logado — porque a
 * biblioteca do Supabase preserva a sessão que já existia quando o link falha ("Don't remove
 * existing session on URL login failure", em GoTrueClient).
 *
 * ---------------------------------------------------------------------------------
 * O DETALHE DA BIBLIOTECA QUE FAZ ISSO FUNCIONAR
 * ---------------------------------------------------------------------------------
 * No caminho do ERRO ela lança a exceção ANTES de limpar o endereço — o motivo continua lá para
 * lermos, mesmo depois de a tela montar. No caminho do SUCESSO ela limpa (`window.location.hash
 * = ''`), então o sinal de "veio do link" não está no endereço: quem avisa é o evento
 * `PASSWORD_RECOVERY`.
 *
 * Por isso os dois sinais são lidos de lugares diferentes, e por isso `veioDoLink` é um
 * argumento em vez de ser deduzido aqui: esta camada fica pura e testável sem navegador.
 */

export interface ErroDoLink {
  /** `error_code` do Supabase; cai em `error` e depois em `desconhecido`. */
  codigo: string;
  descricao: string;
}

/** O que a tela deve desenhar. */
export type EstadoDaRedefinicao = 'apurando' | 'pronto' | 'link-invalido' | 'sem-link';

/**
 * O motivo da falha que o Supabase deixou no endereço, se houver.
 *
 * Procura no fim do endereço (o `#`, que é onde o fluxo em uso escreve) e, se não achar, na
 * parte de busca — o Supabase já usou os dois lugares conforme o fluxo, e ler os dois custa
 * uma linha.
 */
export function erroDoEndereco(href: string): ErroDoLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Endereço que não é endereço não derruba a tela: sem motivo legível, seguimos sem erro.
    return null;
  }

  for (const campos of [new URLSearchParams(url.hash.replace(/^#/, '')), url.searchParams]) {
    const erro = campos.get('error');
    const codigo = campos.get('error_code');
    const descricao = campos.get('error_description');
    if (erro || codigo || descricao) {
      return { codigo: codigo || erro || 'desconhecido', descricao: descricao || '' };
    }
  }
  return null;
}

/**
 * 🔴 O erro decide primeiro, e decide sozinho. Ter sessão aberta no navegador NÃO autoriza o
 * formulário quando o link falhou — é exatamente aí que a senha do colega era trocada.
 *
 * E enquanto não se sabe, a resposta é `apurando`: chutar "sem link" antes de o cliente do
 * Supabase terminar de processar o endereço mandaria embora quem veio do link de verdade.
 */
export function estadoDaRedefinicao(entrada: {
  erro: ErroDoLink | null;
  veioDoLink: boolean;
  apuracaoTerminou: boolean;
}): EstadoDaRedefinicao {
  if (entrada.erro) return 'link-invalido';
  if (entrada.veioDoLink) return 'pronto';
  if (!entrada.apuracaoTerminou) return 'apurando';
  return 'sem-link';
}

/** Os dois códigos que o Supabase manda quando o link venceu ou já foi usado. */
const LINK_GASTO = new Set(['otp_expired', 'access_denied']);

/**
 * A frase que a pessoa lê. Diz o que aconteceu E quanto o link dura — sem isso, quem pede outro
 * link e demora de novo cai no mesmo lugar sem entender.
 */
export function explicacaoDoErroDoLink(erro: ErroDoLink): string {
  if (LINK_GASTO.has(erro.codigo)) {
    return 'Este link já foi usado ou passou do prazo — ele vale por 1 hora. Peça um novo para escolher sua senha.';
  }
  // Sem inventar motivo: a descrição do Supabase vem em inglês e não ajuda quem lê.
  return 'Não foi possível abrir este link. Peça um novo para escolher sua senha.';
}
