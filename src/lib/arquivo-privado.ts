import { supabase } from '@/integrations/supabase/client';

/**
 * A trilha do link temporário — Passo 1 do plano dos baldes privados
 * (`docs/operacao/plano-baldes-privados.md`).
 *
 * 🔴 ESTE ARQUIVO NÃO FECHA NADA E NÃO MUDA NENHUMA TELA. Ele só constrói a ferramenta.
 * Enquanto os baldes seguirem públicos, quem chamar daqui recebe o endereço ORIGINAL de volta
 * quando a assinatura falha — então nada quebra por ter passado a usar isto.
 *
 * POR QUE LINK TEMPORÁRIO E NÃO UM PORTEIRO NO SERVIDOR: uma tag `<img src="...">` do
 * navegador não manda cabeçalho de autorização. Para um porteiro saber quem pede, o crachá
 * teria que ir na própria URL — que é exatamente um link assinado, só que feito à mão, sem
 * CDN, com os 7,4 GB passando por dentro de uma função e sem suporte a busca em áudio e vídeo.
 *
 * POR QUE NADA É GRAVADO NO BANCO: o endereço já guardado carrega, dentro dele, o balde e o
 * caminho. Dá para extrair na hora de mostrar. Medido em 25/08/2026: os 11.917 endereços do
 * nosso Storage seguem todos o mesmo formato, e os caminhos extraídos batem 1-para-1 com
 * objetos que existem. Reverter este passo é apagar o arquivo — não há escrita para desfazer.
 */

/** Quanto tempo o link temporário vale. Uma hora cobre ler um PDF longo sem re-assinar. */
export const VALIDADE_PADRAO_SEGUNDOS = 60 * 60;

export interface ArquivoNoStorage {
  balde: string;
  caminho: string;
}

/**
 * Extrai balde e caminho de um endereço gravado. Devolve `null` para o que não é nosso.
 *
 * Os 76 endereços externos medidos no banco (CDN do Bitrix, foto de perfil do próprio
 * WhatsApp) precisam sair por aqui intactos: tentar assinar um endereço de outro domínio
 * daria erro e, pior, poderia esconder a imagem que hoje aparece.
 */
export function caminhoDoArquivo(url: string | null | undefined): ArquivoNoStorage | null {
  if (!url || typeof url !== 'string') return null;

  // Os três formatos que o Supabase usa. `sign` entra na conta porque um endereço já assinado
  // pode ter sido gravado por engano em algum momento — dele também dá para extrair o caminho.
  const marcas = ['/storage/v1/object/public/', '/storage/v1/object/sign/', '/storage/v1/object/'];

  for (const marca of marcas) {
    const corte = url.indexOf(marca);
    if (corte === -1) continue;

    // Tira a querystring: endereço assinado traz `?token=...` no fim.
    const resto = url.slice(corte + marca.length).split('?')[0];
    const barra = resto.indexOf('/');
    if (barra <= 0) return null;

    const balde = resto.slice(0, barra);
    const caminho = resto.slice(barra + 1);
    if (!balde || !caminho) return null;

    // O endereço vem com os caracteres especiais escapados (espaço vira %20). A API do
    // Storage espera o caminho CRU — sem decodificar, arquivo com espaço ou acento no nome
    // simplesmente não é encontrado, e o erro é um 404 mudo.
    try {
      return { balde, caminho: decodeURIComponent(caminho) };
    } catch {
      return { balde, caminho };
    }
  }

  return null;
}

/**
 * Quantas vezes o app precisou cair de volta no endereço público.
 *
 * NÃO é enfeite de depuração: o plano exige que este número chegue a ZERO antes do passo que
 * fecha os baldes. Enquanto eles estiverem abertos, uma falha de assinatura é INVISÍVEL — a
 * tela mostra o arquivo do mesmo jeito, pelo endereço antigo. Sem este contador, só se
 * descobriria no dia do fechamento, com o anexo sumindo da tela do cliente.
 */
const quedasParaOPublico = new Map<string, number>();

function registraQueda(balde: string, motivo: string) {
  const chave = `${balde}: ${motivo}`;
  quedasParaOPublico.set(chave, (quedasParaOPublico.get(chave) ?? 0) + 1);
  console.warn(`[arquivo-privado] caiu no endereço público — ${chave}`);
}

/** O placar das quedas, para conferir antes de fechar os baldes. */
export function quedasRegistradas(): Record<string, number> {
  return Object.fromEntries(quedasParaOPublico);
}

/** Zera o placar. Usado nos testes e ao começar uma medição nova. */
export function zerarQuedas() {
  quedasParaOPublico.clear();
}

/**
 * O endereço a usar para UM arquivo: assinado quando dá, o original quando não dá.
 *
 * Devolver o original em vez de `null` é o que faz este passo não quebrar nada. Quando os
 * baldes fecharem, o original deixa de funcionar — e é por isso que o contador acima precisa
 * estar zerado antes disso.
 */
/**
 * Link temporário para um objeto de balde PRIVADO, a partir do balde e do caminho.
 *
 * Diferente de `enderecoDoArquivo`, logo abaixo, que parte de uma URL já gravada no banco:
 * aqui não existe URL de origem, porque o balde nasceu privado e nunca teve endereço público
 * para converter. Quem guarda só o caminho — como `fabricante_arquivos` — entra por aqui.
 *
 * 🔴 DEVOLVE `null` QUANDO FALHA, e a diferença é de propósito. O `enderecoDoArquivo` devolve
 * a URL original como rede de proteção, o que faz sentido enquanto o balde ainda está aberto.
 * Num balde privado essa rede não existe: endereço não assinado simplesmente não abre. Quem
 * chama precisa tratar o `null` e mostrar o ícone do formato, em vez de uma imagem quebrada.
 */
export async function enderecoDoObjeto(
  balde: string,
  caminho: string,
  validadeSegundos = VALIDADE_PADRAO_SEGUNDOS,
): Promise<string | null> {
  if (!balde || !caminho) return null;

  try {
    const { data, error } = await supabase.storage
      .from(balde)
      .createSignedUrl(caminho, validadeSegundos);

    if (error || !data?.signedUrl) {
      registraQueda(balde, error?.message ?? 'sem endereço na resposta');
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    registraQueda(balde, e instanceof Error ? e.message : 'falha inesperada');
    return null;
  }
}

export async function enderecoDoArquivo(
  url: string | null | undefined,
  validadeSegundos = VALIDADE_PADRAO_SEGUNDOS,
): Promise<string | null> {
  if (!url) return null;

  const alvo = caminhoDoArquivo(url);
  if (!alvo) return url; // endereço externo: não é nosso, devolve como está

  try {
    const { data, error } = await supabase.storage
      .from(alvo.balde)
      .createSignedUrl(alvo.caminho, validadeSegundos);

    if (error || !data?.signedUrl) {
      registraQueda(alvo.balde, error?.message ?? 'sem endereço na resposta');
      return url;
    }
    return data.signedUrl;
  } catch (e) {
    registraQueda(alvo.balde, e instanceof Error ? e.message : 'falha inesperada');
    return url;
  }
}

/**
 * O mesmo, para uma LISTA — e é por isso que esta função existe.
 *
 * A caixa do WhatsApp desenha 50 mídias de uma vez. Cinquenta chamadas separadas somariam
 * meio segundo de espera antes de a primeira imagem aparecer. A API do Storage assina em
 * lote, mas só dentro de um balde por vez — daí o agrupamento.
 *
 * Devolve um mapa do endereço ORIGINAL para o endereço a usar, para quem chama não precisar
 * casar posição de array com posição de resultado.
 */
export async function enderecosDosArquivos(
  urls: (string | null | undefined)[],
  validadeSegundos = VALIDADE_PADRAO_SEGUNDOS,
): Promise<Map<string, string>> {
  const saida = new Map<string, string>();

  // Agrupa por balde, guardando de qual endereço original cada caminho veio.
  const porBalde = new Map<string, Map<string, string>>();

  for (const url of urls) {
    if (!url) continue;
    const alvo = caminhoDoArquivo(url);
    if (!alvo) {
      saida.set(url, url); // externo: passa direto
      continue;
    }
    const doBalde = porBalde.get(alvo.balde) ?? new Map<string, string>();
    doBalde.set(alvo.caminho, url);
    porBalde.set(alvo.balde, doBalde);
  }

  await Promise.all(
    [...porBalde.entries()].map(async ([balde, caminhos]) => {
      const lista = [...caminhos.keys()];
      try {
        const { data, error } = await supabase.storage
          .from(balde)
          .createSignedUrls(lista, validadeSegundos);

        if (error || !data) {
          registraQueda(balde, error?.message ?? 'lote sem resposta');
          for (const original of caminhos.values()) saida.set(original, original);
          return;
        }

        for (const item of data) {
          // `item.path` volta como foi pedido; é a chave para achar o endereço original.
          const original = item.path ? caminhos.get(item.path) : undefined;
          if (!original) continue;

          if (item.error || !item.signedUrl) {
            registraQueda(balde, item.error ?? 'item sem endereço');
            saida.set(original, original);
          } else {
            saida.set(original, item.signedUrl);
          }
        }

        // Item que a resposta não trouxe de volta também precisa de endereço.
        for (const original of caminhos.values()) {
          if (!saida.has(original)) {
            registraQueda(balde, 'item ausente na resposta do lote');
            saida.set(original, original);
          }
        }
      } catch (e) {
        registraQueda(balde, e instanceof Error ? e.message : 'falha inesperada no lote');
        for (const original of caminhos.values()) saida.set(original, original);
      }
    }),
  );

  return saida;
}

/**
 * O placar exposto no console do navegador, de propósito também em produção.
 *
 * 🔴 SEM ISTO O PLANO NÃO FECHA. O passo que fecha os baldes só pode acontecer depois de o
 * contador acima ficar em zero DURANTE USO REAL — e uso real acontece na produção, na tela
 * dos vendedores, não aqui na máquina de desenvolvimento. Enquanto os baldes seguem abertos,
 * uma falha de assinatura não aparece na tela: o arquivo abre do mesmo jeito, pelo endereço
 * antigo. Este é o único lugar onde ela fica visível.
 *
 * Não expõe dado nenhum: são contagens e mensagens de erro do próprio Storage. Para ler,
 * abra o console do navegador (F12) e digite `quedasDeArquivo.ver()`.
 */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).quedasDeArquivo = {
    ver: quedasRegistradas,
    zerar: zerarQuedas,
  };
}
