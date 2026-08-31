/**
 * Para onde o Supabase deve mandar a pessoa depois que ela clica no link do e-mail.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 A HISTÓRIA, PORQUE ELA MUDA O QUE VOCÊ FARIA AO MEXER AQUI
 * ---------------------------------------------------------------------------------
 * Em 27/08/2026 uma redefinição de senha chegou com link para `http://localhost:3000`.
 * A causa raiz NÃO estava no código: o **Site URL** da autenticação, no painel do
 * Supabase, apontava para localhost. O Supabase usa esse valor sempre que o endereço
 * pedido pelo app não está na lista de endereços autorizados.
 *
 * Medido nos registros de autenticação em 31/08/2026: 3.306 requisições, 634 endereços
 * de internet DISTINTOS, e o destino efetivo era `http://localhost:3000` em todas.
 * O servidor de desenvolvimento daqui roda na porta 8080 — então aquele valor não
 * correspondia nem à produção nem ao ambiente local. Era sobra do andaime original.
 *
 * **Se o link voltar a sair errado, confira o painel ANTES do código.** Este arquivo
 * não tem poder sobre aquilo; ele só garante que o app peça o endereço certo.
 *
 * ---------------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO CONSERTA
 * ---------------------------------------------------------------------------------
 * O app montava o link com `window.location.origin` — "onde o navegador está agora".
 * Da produção acerta. De uma prévia da Vercel manda o endereço da prévia, que não está
 * autorizado; o Supabase o descarta e cai no Site URL, em silêncio. O sintoma é
 * idêntico ao bug original, e a causa é outra — o pior tipo de armadilha.
 *
 * A regra: em máquina de desenvolvimento vale o endereço local (senão ninguém testa);
 * em qualquer outro lugar vale o canônico.
 *
 * ---------------------------------------------------------------------------------
 * AO ACRESCENTAR UM DESTINO NOVO
 * ---------------------------------------------------------------------------------
 * Todo caminho passado aqui precisa estar na lista **Redirect URLs** do painel
 * (Authentication → URL Configuration). Não basta existir como rota no React: se o
 * endereço não estiver autorizado, o Supabase o troca pelo Site URL sem avisar.
 */

/** Sem barra no fim: a montagem é `canônico + caminho`, e a barra dupla não casa com a lista. */
export const APP_CANONICO: string =
  (import.meta.env?.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://crm.repplyhub.com.br';

/**
 * As três formas de dizer "esta máquina". Comparação EXATA de hostname, nunca por
 * substring: `localhost.exemplo.com` é um domínio público como outro qualquer, e casar
 * por substring mandaria o link de redefinição para ele.
 */
const MAQUINA_LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function ehMaquinaLocal(origem: string): boolean {
  try {
    return MAQUINA_LOCAL.has(new URL(origem).hostname);
  } catch {
    // Origem que não é URL válida não é máquina de desenvolvimento — é lixo, e o
    // canônico é o destino seguro.
    return false;
  }
}

/**
 * @param origem   normalmente `window.location.origin`. Aceita vazio (contexto sem janela).
 * @param caminho  a rota de destino, começando com barra (ex.: `/redefinir-senha`).
 */
export function enderecoDeRetorno(origem: string | undefined | null, caminho: string): string {
  const base = origem && ehMaquinaLocal(origem) ? origem.replace(/\/+$/, '') : APP_CANONICO;
  return base + caminho;
}

/** Atalho para quem tem uma janela por perto — que é o caso de todas as telas. */
export function enderecoDeRetornoDaJanela(caminho: string): string {
  return enderecoDeRetorno(typeof window === 'undefined' ? '' : window.location.origin, caminho);
}
