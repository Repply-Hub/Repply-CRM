import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { enderecoDoObjeto } from '@/lib/arquivo-privado';
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';
import { normalizeWhatsappPhone } from '@/hooks/use-whatsapp-inbox';
import { BALDE, type ArquivoDaFabrica } from '@/hooks/use-fabricante-arquivos';
import type { MotivoDeRecusa } from '@/lib/recusa-de-envio';

/**
 * Mandar um catálogo pelo WhatsApp, respeitando as travas contra banimento.
 *
 * 🔴 ESTE ARQUIVO NÃO DECIDE NADA SOBRE LIMITE. Quem confere e recusa é a função de banco
 * `reservar_envio_de_catalogo`, e é lá que a conta precisa morar: desabilitar botão resolve o
 * clique duplo do usuário honesto e não resolve nada para quem abre o console do navegador.
 * Regra nº 1 do CLAUDE.md — esconder botão não protege.
 *
 * A função de banco também resolve DE QUAL NÚMERO o envio sai, a partir de quem está logado.
 * Se esse dado viesse daqui, bastaria mentir o campo para zerar a contagem do número — que é
 * justamente a trava que protege o ativo da empresa.
 *
 * Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md §7 e §8.
 */

export interface ResultadoDoEnvio {
  enviado: boolean;
  /** Preenchido quando `enviado` é falso: o que a tela mostra vem de `mensagemDeRecusa`. */
  motivo?: MotivoDeRecusa;
  liberaEm?: string | null;
}

export interface PedidoDeEnvio {
  arquivo: ArquivoDaFabrica;
  contatoId: string;
  telefone: string;
  nomeDoContato: string;
}

export function useEnviarCatalogo() {
  const qc = useQueryClient();

  return useMutation<ResultadoDoEnvio, Error, PedidoDeEnvio>({
    mutationFn: async ({ arquivo, contatoId, telefone }) => {
      // 🔴 O nono dígito NÃO é forçado. Enfiá-lo em qualquer número de 10 dígitos quebra os
      // telefones FIXOS que têm WhatsApp — e isso já respondeu por 100% das falhas de envio
      // deste sistema, com um cliente real de fixo (84) 2030-0387. CLAUDE.md §7.1.
      const numero = normalizeWhatsappPhone(telefone);
      if (!numero) throw new Error('Contato sem telefone válido.');

      // ── 1. Reservar a vaga ────────────────────────────────────────────────
      //
      // ANTES de assinar o arquivo, de propósito: assinar primeiro gastaria uma assinatura à
      // toa em toda recusa e — pior — deixaria um link válido por uma hora circulando para um
      // envio que não aconteceu.
      const { data, error } = await supabase.rpc('reservar_envio_de_catalogo' as never, {
        p_arquivo_id: arquivo.id,
        p_contato_id: contatoId,
        p_telefone: numero,
      } as never);
      if (error) throw error;

      // A função devolve UMA linha, mas o PostgREST entrega `returns table` como lista.
      // O `unknown` no meio é o que evita depender do tipo gerado, que ainda não conhece
      // esta função (types.ts é mantido à mão neste projeto — CLAUDE.md §6.8).
      type LinhaDaReserva = {
        ok: boolean;
        motivo: MotivoDeRecusa | null;
        libera_em: string | null;
        envio_id: string | null;
      };
      const linhas = (data ?? []) as unknown as LinhaDaReserva[];
      const reserva: LinhaDaReserva | undefined = Array.isArray(linhas)
        ? linhas[0]
        : (linhas as LinhaDaReserva);

      if (!reserva?.ok) {
        // Recusa NÃO é exceção: é um resultado previsto, e a tela precisa do motivo e do
        // horário para montar a mensagem certa. Lançar erro aqui perderia os dois.
        return {
          enviado: false,
          motivo: reserva?.motivo ?? ('sem_instancia' as MotivoDeRecusa),
          liberaEm: reserva?.libera_em ?? null,
        };
      }

      const envioId = reserva.envio_id!;

      try {
        // ── 2. Assinar o arquivo ────────────────────────────────────────────
        // O balde é privado; o servidor da uazapi baixa pela URL, em segundos, muito antes de
        // a assinatura de uma hora vencer.
        const url = await enderecoDoObjeto(BALDE, arquivo.caminho);
        if (!url) throw new Error('Não foi possível preparar o arquivo para envio.');

        // ── 3. Enviar ───────────────────────────────────────────────────────
        const { data: sessao } = await supabase.auth.getSession();
        const token = sessao?.session?.access_token;

        const resp = await supabase.functions.invoke('whatsapp-send', {
          body: {
            telefone: numero,
            tipo: 'documento',
            media_url: url,
            media_mime: arquivo.mime ?? 'application/pdf',
            nome_arquivo: arquivo.nome,
            mensagem: null,
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (resp.error) throw await erroLegivelDaFunction(resp.error);

        return { enviado: true };
      } catch (e) {
        // ── 4. Devolver a vaga ──────────────────────────────────────────────
        //
        // Sem isto, uma queda de rede consumiria uma vaga sem nenhuma mensagem ter saído — e a
        // pessoa bateria no teto sem ter mandado nada. É assim que uma trava de segurança vira
        // reclamação, e depois vira pedido para desligá-la.
        await supabase.rpc('liberar_envio_de_catalogo' as never, { p_envio_id: envioId } as never);
        throw e;
      }
    },
    onSuccess: (r, { arquivo }) => {
      if (r.enviado) {
        qc.invalidateQueries({ queryKey: ['fabricante-arquivos'] });
        // A conversa daquele contato ganhou uma mensagem: sem isto, quem abrir o WhatsApp em
        // seguida veria a lista velha.
        qc.invalidateQueries({ queryKey: ['wa-conversas'] });
      }
      void arquivo;
    },
  });
}
