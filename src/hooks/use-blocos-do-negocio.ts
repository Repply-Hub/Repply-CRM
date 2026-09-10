import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useContatosDoCliente } from '@/hooks/use-obra-contatos';
import { useSecaoLigada } from '@/hooks/use-secoes';
import {
  blocosDeAtendimento,
  blocosNaJanela,
  janelaDoNegocio,
  type MensagemParaBloco,
} from '@/lib/blocos-de-atendimento';

/**
 * O histórico de um negócio: cada atendimento de WhatsApp e cada assunto de
 * e-mail que COMEÇOU dentro da janela do negócio.
 *
 * A janela vai da criação até o fechamento; negócio em aberto vai até agora.
 * O critério é o INÍCIO do bloco — um atendimento que começou antes de o
 * negócio existir não é dele, mesmo que tenha se arrastado para dentro.
 *
 * 🔴 Quem vê e-mail aqui é decidido pela RLS da caixa, não por este código: a
 * função `email_do_negocio` é SECURITY INVOKER, então vendedor sem acesso
 * recebe zero linhas — nem a existência da troca. Foi a decisão do dono do
 * produto em 09/09/2026.
 */

export interface LinhaDoHistorico {
  chave: string;
  canal: 'whatsapp' | 'email';
  titulo: string;
  inicioEm: string;
  fimEm: string;
  mensagens: number;
  detalhe: string;
  destino:
    | { tipo: 'whatsapp'; conversaId: string; mensagemId: string }
    | { tipo: 'email'; mensagemId: string };
}

/** Uma linha do que `email_do_negocio` devolve, sem depender dos tipos gerados. */
interface LinhaDeEmail {
  thread_id: string;
  assunto: string | null;
  primeira_em: string;
  ultima_em: string;
  mensagens: number;
  primeira_mensagem_id: string;
  com_quem: string | null;
}

function frase(quantas: number, quem: string[]): string {
  const msgs = quantas === 1 ? '1 mensagem' : `${quantas} mensagens`;
  return quem.length ? `${msgs} · ${quem.join(', ')}` : msgs;
}

export function useBlocosDoNegocio({
  clienteId,
  empresaNome,
  dataPedido,
  prazoResposta,
  status,
}: {
  clienteId?: string | null;
  empresaNome?: string | null;
  /** 🔴 `data_pedido`, nunca `created_at` — ver janelaDoNegocio. */
  dataPedido?: string | null;
  /** A data de FECHAMENTO. O nome da coluna mente (CLAUDE.md §4.4). */
  prazoResposta?: string | null;
  /** Slug da etapa; decide se a data de fechamento vale. */
  status?: string | null;
}) {
  const { ligada: temWhatsapp } = useSecaoLigada('whatsapp');
  const { ligada: temEmail } = useSecaoLigada('emails');
  const { data: contatos = [] } = useContatosDoCliente(clienteId, empresaNome);

  // A janela é calculada uma vez: `janelaDoNegocio` cai no relógio quando o
  // negócio está aberto, e um valor novo a cada render refaria a consulta sem
  // parar.
  const janela = useMemo(
    () =>
      dataPedido
        ? janelaDoNegocio({ dataPedido, prazoResposta, status })
        : null,
    [dataPedido, prazoResposta, status],
  );
  const de = janela?.de ?? null;
  const ate = janela?.ate ?? '';

  const telefones = useMemo(
    () => contatos.map((c) => c.telefone).filter(Boolean) as string[],
    [contatos],
  );

  // --- WhatsApp -----------------------------------------------------------
  const wa = useQuery({
    queryKey: ['blocos_wa_do_negocio', clienteId, de, ate, telefones],
    queryFn: async (): Promise<LinhaDoHistorico[]> => {
      const { data: conversas } = await supabase
        .from('whatsapp_conversas')
        .select('id, nome_contato, telefone')
        .in('telefone', telefones);

      const ids = (conversas ?? []).map((c) => c.id);
      if (ids.length === 0) return [];

      // A nota interna VEM JUNTO de propósito: é ela que marca o corte.
      const { data: mensagens } = await supabase
        .from('whatsapp_mensagens')
        .select('id, conversa_id, created_at, conteudo, is_nota_interna')
        .in('conversa_id', ids)
        .order('created_at', { ascending: true });

      const porConversa = new Map<string, MensagemParaBloco[]>();
      for (const m of mensagens ?? []) {
        const lista = porConversa.get(m.conversa_id) ?? [];
        lista.push(m as MensagemParaBloco);
        porConversa.set(m.conversa_id, lista);
      }

      const linhas: LinhaDoHistorico[] = [];
      for (const conv of conversas ?? []) {
        const blocos = blocosNaJanela(
          blocosDeAtendimento(porConversa.get(conv.id) ?? []),
          de!,
          ate,
        );
        for (const b of blocos) {
          linhas.push({
            chave: `wa-${conv.id}-${b.primeiraMensagemId}`,
            canal: 'whatsapp',
            titulo: conv.nome_contato ?? conv.telefone,
            inicioEm: b.inicioEm,
            fimEm: b.fimEm,
            mensagens: b.mensagens,
            detalhe: frase(b.mensagens, b.atendentes),
            destino: {
              tipo: 'whatsapp',
              conversaId: conv.id,
              mensagemId: b.primeiraMensagemId,
            },
          });
        }
      }
      return linhas;
    },
    enabled: !!clienteId && !!de && temWhatsapp !== false && telefones.length > 0,
    staleTime: 60_000,
  });

  // --- E-mail -------------------------------------------------------------
  const email = useQuery({
    queryKey: ['blocos_email_do_negocio', clienteId, de, ate],
    queryFn: async (): Promise<LinhaDoHistorico[]> => {
      const { data, error } = await supabase.rpc('email_do_negocio', {
        p_cliente_id: clienteId!,
        p_de: de!,
        p_ate: ate,
      });

      if (error) {
        // Sem acesso à caixa a RLS simplesmente não devolve linha; um erro aqui
        // é outra coisa, e não pode derrubar o resto do histórico.
        console.warn('[negocio] não consegui ler os e-mails:', error.message);
        return [];
      }

      return ((data ?? []) as LinhaDeEmail[]).map((r) => ({
        chave: `email-${r.thread_id}`,
        canal: 'email' as const,
        titulo: r.assunto?.trim() || '(sem assunto)',
        inicioEm: r.primeira_em,
        fimEm: r.ultima_em,
        mensagens: Number(r.mensagens),
        detalhe: frase(Number(r.mensagens), r.com_quem ? [r.com_quem] : []),
        destino: { tipo: 'email' as const, mensagemId: r.primeira_mensagem_id },
      }));
    },
    enabled: !!clienteId && !!de && temEmail !== false,
    staleTime: 60_000,
  });

  const linhas = useMemo(
    () =>
      [...(wa.data ?? []), ...(email.data ?? [])].sort((a, b) =>
        b.inicioEm.localeCompare(a.inicioEm),
      ),
    [wa.data, email.data],
  );

  return { linhas, carregando: wa.isLoading || email.isLoading };
}
