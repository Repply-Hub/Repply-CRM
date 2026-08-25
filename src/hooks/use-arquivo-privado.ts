import { useQuery } from '@tanstack/react-query';
import {
  enderecoDoArquivo, enderecosDosArquivos, caminhoDoArquivo, VALIDADE_PADRAO_SEGUNDOS,
} from '@/lib/arquivo-privado';

/**
 * O endereço de um arquivo, para a tela usar — Passo 1 do plano dos baldes privados.
 *
 * 🔴 NENHUMA TELA CHAMA ISTO AINDA. Este passo só constrói a ferramenta; trocar as telas é o
 * Passo 2, um módulo por vez. Ver `docs/operacao/plano-baldes-privados.md`.
 *
 * Enquanto os baldes seguirem públicos, isto devolve o endereço original quando a assinatura
 * falha — então a tela que passar a usar não corre risco de ficar sem imagem.
 */

/**
 * O link vale uma hora; a resposta é considerada fresca por 45 minutos.
 *
 * A folga de 15 minutos não é chute: sem ela, alguém que abrisse um PDF no minuto 59 receberia
 * um endereço que morre enquanto o navegador ainda está baixando. Renovar antes de vencer é
 * mais barato que tratar um download interrompido no meio.
 */
const FRESCOR_MS = 45 * 60 * 1000;

export function useArquivoPrivado(url: string | null | undefined) {
  return useQuery({
    queryKey: ['arquivo_privado', url ?? null],
    queryFn: () => enderecoDoArquivo(url, VALIDADE_PADRAO_SEGUNDOS),
    enabled: !!url,
    staleTime: FRESCOR_MS,
    gcTime: FRESCOR_MS,
    // Assinar de novo a cada foco de janela seria uma chamada por alt-tab, sem ganho: o
    // endereço ainda vale. O `staleTime` já cuida de renovar quando precisa.
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/**
 * O mesmo para uma lista — uma chamada em lote por balde, não uma por arquivo.
 *
 * A caixa do WhatsApp desenha 50 mídias de uma vez; 50 chamadas separadas somariam meio
 * segundo antes de a primeira imagem aparecer.
 *
 * A chave do cache é a lista ORDENADA de endereços: sem ordenar, a mesma tela reembaralhada
 * viraria uma chave diferente e re-assinaria tudo à toa.
 */
export function useArquivosPrivados(urls: (string | null | undefined)[]) {
  const doNossoStorage = urls.filter((u): u is string => !!u && !!caminhoDoArquivo(u));
  const chave = [...doNossoStorage].sort();

  const query = useQuery({
    queryKey: ['arquivos_privados', chave],
    queryFn: () => enderecosDosArquivos(chave, VALIDADE_PADRAO_SEGUNDOS),
    enabled: chave.length > 0,
    staleTime: FRESCOR_MS,
    gcTime: FRESCOR_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  /**
   * Traduz um endereço original para o endereço a usar.
   *
   * Devolve o ORIGINAL enquanto a assinatura não chegou, em vez de `null`: a tela desenha a
   * imagem na hora, pelo caminho de hoje, e troca sozinha quando o link temporário chega.
   * Devolver nulo faria a mídia piscar em branco a cada abertura da caixa.
   */
  function enderecoDe(url: string | null | undefined): string | null {
    if (!url) return null;
    return query.data?.get(url) ?? url;
  }

  return { ...query, enderecoDe };
}
