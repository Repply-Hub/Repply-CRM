/**
 * Conectar, conferir e desconectar um número de WhatsApp.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 POR QUE ISTO EXISTE (item 74 da dívida técnica, passo 2)
 * ---------------------------------------------------------------------------------
 * As três chamadas à operadora saíam DO NAVEGADOR, com a chave (`api_key`) no cabeçalho. Era
 * por isso que a chave precisava chegar ao navegador — de 21 pessoas, medido em 23/09/2026.
 * E essa credencial vale FORA do produto: trancar o CRM não a invalida.
 *
 * Agora as três saem de uma função de servidor (`whatsapp-instancia`), que guarda a chave do
 * lado de lá. A função devolve a resposta CRUA da operadora, e a leitura dela continua aqui —
 * assim o servidor fica mínimo e a interpretação do formato não vira uma terceira cópia.
 *
 * ---------------------------------------------------------------------------------
 * QUEM PODE CONECTAR
 * ---------------------------------------------------------------------------------
 * Decisão do dono do produto em 23/09/2026: **conectar é do gestor** — ou de quem tiver a
 * permissão específica, que ainda NÃO existe e entra quando a matriz de permissões for
 * implementada (ver `_revisao-codigo-2026-09/MAPA-PERMISSOES.md`). `podeConectarNumero` já
 * aceita esse segundo argumento: no dia em que a permissão existir, liga-se ali e nada mais
 * muda.
 *
 * Quem não pode conectar e não está vinculado a número nenhum vê o aviso para procurar o
 * gestor — quem gerencia a lista de quem enxerga cada número é ele.
 *
 * 🔴 A recusa de verdade está na função de servidor. A regra aqui só evita oferecer um botão
 * que o servidor vai negar (CLAUDE.md §6.1).
 *
 * ---------------------------------------------------------------------------------
 * A LEITURA DA RESPOSTA ESTAVA DUPLICADA
 * ---------------------------------------------------------------------------------
 * `use-whatsapp-inbox.ts` e `use-admin-whatsapp.ts` tinham a MESMA adivinhação de formato,
 * palavra por palavra. Duas cópias da mesma heurística é como uma envelhece sozinha — e a
 * operadora já mudou de formato antes (daí os quatro caminhos de QR e as cinco formas de
 * "já conectado" aqui embaixo, que são histórico, não zelo).
 */

/** Os mesmos papéis de `vinculo-de-whatsapp.ts`. Hoje coincidem; podem separar-se depois. */
const PAPEIS_QUE_CONECTAM = ['admin', 'empresa', 'gestor'] as const;

/**
 * @param papel           o cargo da pessoa (`usuarios.role`).
 * @param temPermissao    reservado para a matriz de permissões, que ainda não existe. Quando
 *                        existir, passe aqui o resultado da checagem e o cargo deixa de ser o
 *                        único caminho.
 */
export function podeConectarNumero(
  papel: string | null | undefined,
  temPermissao = false,
): boolean {
  if (temPermissao) return true;
  return (PAPEIS_QUE_CONECTAM as readonly string[]).includes(papel ?? '');
}

/** O que interessa na resposta de `/instance/connect`. */
export interface RespostaDeConexao {
  /** O QR em base64, ou `null` quando não há o que ler. */
  qr: string | null;
  /** A operadora avisou que a instância já está conectada. */
  jaConectado: boolean;
}

/** A resposta da operadora não tem contrato de tipo — tudo que vem dela é `unknown`. */
function comoObjeto(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

/** O primeiro valor presente, imitando a cadeia de `??` que este código sempre teve. */
function primeiroPresente(...valores: unknown[]): unknown {
  return valores.find((v) => v !== null && v !== undefined);
}

export function lerRespostaDeConexao(data: unknown): RespostaDeConexao {
  const d = comoObjeto(data);
  const instancia = comoObjeto(d.instance);
  const estado = comoObjeto(d.status);

  const bruto = primeiroPresente(
    instancia.qrcode,
    comoObjeto(d.qrcode).base64,
    typeof d.qrcode === 'string' ? d.qrcode : undefined,
    d.base64,
  );

  // 🔴 QR vazio é AUSÊNCIA de QR. A operadora devolve `qrcode: ""` quando não há o que gerar
  // (instância já conectada), e a cadeia de `??` não trata string vazia como nulo — por isso a
  // conferência do tamanho vem DEPOIS de escolher o candidato, e não dentro da escolha.
  const qr = typeof bruto === 'string' && bruto.length > 0 ? bruto : null;

  const jaConectado: boolean =
    d.connected === true ||
    estado.connected === true ||
    estado.loggedIn === true ||
    instancia.status === 'connected' ||
    (typeof d.response === 'string' && d.response.toLowerCase().includes('already connected'));

  return { qr, jaConectado };
}

/**
 * O que interessa na resposta de `/instance/status`.
 *
 * 🔴 Conectado exige as DUAS confirmações — ligado E autenticado. Só `connected` é o estado de
 * quem está com o QR na tela: a instância subiu, mas ninguém leu o código ainda.
 */
export function estaConectadoNaResposta(data: unknown): boolean {
  const d = comoObjeto(data);
  const estado = comoObjeto(d.status);
  return (estado.connected === true && estado.loggedIn === true) || d.connected === true;
}
