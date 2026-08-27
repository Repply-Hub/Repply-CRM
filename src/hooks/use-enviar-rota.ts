import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';
import type { DestinoWhatsApp } from '@/lib/destinos-whatsapp';

/**
 * Manda a rota de visitas do dia por WhatsApp, como texto com um link do Google Maps.
 *
 * 🔴 O TELEFONE VAI LITERAL, sem passar por `normalizeWhatsappPhone`.
 *
 * É a diferença que separa este envio do de catálogo, e ela é deliberada. O envio de catálogo
 * normaliza porque só fala com contato do cadastro, onde o número foi digitado por gente e vem
 * em formatos variados. Aqui o destino pode ser uma CONVERSA já aberta — inclusive um grupo, e
 * o identificador de grupo antigo tem hífen (`5511988345626-1425926780`). Normalizar apagaria o
 * hífen e montaria um destino inexistente: a uazapi responde sucesso e não entrega nada, então
 * a tela diria "enviado" e o cliente nunca receberia. Foi bug silencioso por meses no projeto
 * (CLAUDE.md §7.2).
 *
 * Quem decide se o destino é grupo é o servidor, em `whatsapp-send`, que já trata as três
 * formas (sufixo `@g.us`, hífen do formato antigo, e mais de 14 dígitos).
 *
 * SEM TRAVA DE REPETIÇÃO, e isto também é decisão. A trava do catálogo existe porque disparar
 * o mesmo PDF para muita gente em sequência é o padrão que faz o WhatsApp derrubar o número.
 * Uma rota é uma mensagem de texto, mandada para uma pessoa por vez — mesmo risco de qualquer
 * mensagem que a equipe já manda pela caixa de entrada o dia inteiro.
 */

export interface EnvioDeRota {
  destino: DestinoWhatsApp;
  mensagem: string;
}

export function useEnviarRota() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ destino, mensagem }: EnvioDeRota) => {
      if (!destino?.telefone) throw new Error('Este destino está sem número de WhatsApp.');
      if (!mensagem?.trim()) throw new Error('A rota está vazia — não há o que mandar.');

      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao?.session?.access_token;

      const resposta = await supabase.functions.invoke('whatsapp-send', {
        body: {
          telefone: destino.telefone,
          tipo: 'texto',
          mensagem,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (resposta.error) throw await erroLegivelDaFunction(resposta.error);

      return { enviado: true as const };
    },
    onSuccess: () => {
      // A conversa ganhou uma mensagem. Sem isto, quem abrir o WhatsApp em seguida veria a
      // lista velha. `wa_conversas` com SUBLINHADO — é a chave da caixa de entrada.
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
  });
}
