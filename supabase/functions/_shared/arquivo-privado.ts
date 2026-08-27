import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Link temporário para um arquivo do nosso armazenamento, do lado do servidor.
 *
 * Passo 3 do plano dos baldes privados (`docs/operacao/plano-baldes-privados.md`).
 *
 * ⚠️ **É o gêmeo de `src/lib/arquivo-privado.ts`, e os dois precisam concordar.** Não dá para
 * importar aquele aqui: isto roda em Deno, fora do projeto do navegador. É a mesma situação
 * de `normalizeWhatsappPhone`, duplicado entre `src/` e `_shared/whatsapp.ts` — e o
 * `CLAUDE.md` §7.1 registra o que acontece quando as duas cópias divergem.
 *
 * Se mexer na extração de caminho aqui, mexa lá também.
 */

/** Extrai balde e caminho de um endereço gravado. `null` quando não é nosso. */
export function caminhoDoArquivo(
  url: string | null | undefined,
): { balde: string; caminho: string } | null {
  if (!url || typeof url !== "string") return null;

  const marcas = [
    "/storage/v1/object/public/",
    "/storage/v1/object/sign/",
    "/storage/v1/object/",
  ];

  for (const marca of marcas) {
    const corte = url.indexOf(marca);
    if (corte === -1) continue;

    const resto = url.slice(corte + marca.length).split("?")[0];
    const barra = resto.indexOf("/");
    if (barra <= 0) return null;

    const balde = resto.slice(0, barra);
    const caminho = resto.slice(barra + 1);
    if (!balde || !caminho) return null;

    // O endereço vem escapado (espaço vira %20); a API do Storage espera o caminho CRU.
    try {
      return { balde, caminho: decodeURIComponent(caminho) };
    } catch {
      return { balde, caminho };
    }
  }

  return null;
}

/**
 * Meia hora, e a escolha é deliberada.
 *
 * A operadora baixa o arquivo em segundos, então 10 minutos bastariam quase sempre. O "quase"
 * é o problema: se a fila dela atrasar, um link vencido faz a mensagem **não chegar em
 * silêncio** — ela responde 200 do mesmo jeito (é o mesmo modo de falha que o Passo 3 do plano
 * manda testar à mão). Vinte minutos a mais de validade num endereço que ninguém tem é um
 * preço baixo perto de um envio perdido sem aviso.
 */
export const VALIDADE_PARA_OPERADORA_SEGUNDOS = 30 * 60;

/**
 * O endereço a entregar para quem vai BAIXAR o arquivo de fora (hoje, a operadora de
 * WhatsApp). Assinado quando é nosso; intacto quando não é.
 *
 * 🔴 Cai no endereço original se a assinatura falhar. Hoje isso salva o envio, porque o balde
 * ainda é público. **Depois do Passo 7 essa queda deixa de salvar** — vira um envio que falha
 * calado. Por isso o erro é registrado com destaque: é o aviso de que algo precisa ser olhado
 * ANTES de fechar o balde, não depois.
 */
export async function enderecoParaQuemBaixaDeFora(
  supabase: SupabaseClient,
  url: string | null | undefined,
  validadeSegundos = VALIDADE_PARA_OPERADORA_SEGUNDOS,
): Promise<string | null | undefined> {
  const alvo = caminhoDoArquivo(url);
  if (!alvo) return url; // externo ou vazio: não é nosso, vai como está

  try {
    const { data, error } = await supabase.storage
      .from(alvo.balde)
      .createSignedUrl(alvo.caminho, validadeSegundos);

    if (error || !data?.signedUrl) {
      console.error(
        `[arquivo-privado] NÃO consegui assinar ${alvo.balde}/${alvo.caminho} — ` +
          `entregando o endereço público. Isto para de funcionar quando o balde fechar. ` +
          `Motivo: ${error?.message ?? "sem endereço na resposta"}`,
      );
      return url;
    }
    return data.signedUrl;
  } catch (e) {
    console.error(
      `[arquivo-privado] falha inesperada ao assinar ${alvo.balde}/${alvo.caminho}: ${e}`,
    );
    return url;
  }
}
