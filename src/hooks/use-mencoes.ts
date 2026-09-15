import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { avisarMensagemNova, previaDaMensagem } from '@/lib/aviso-de-mensagem-nova';
import { contarPorChave, type MencaoNaoLida } from '@/lib/mencoes-por-conversa';
import { filtroDeLinkDaConversa } from '@/lib/link-da-mencao';

/** Menções ainda não vistas, por conversa. A RLS só devolve as da própria pessoa. */
export function useMencoesNaoLidas() {
  const { profile } = useAuth();
  const meId: string | undefined = profile?.id;
  return useQuery({
    queryKey: ['mencoes_nao_lidas', meId],
    enabled: !!meId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mencoes')
        .select('id, origem, conversa_chave')
        .eq('mencionado_id', meId!)
        .is('lida_em', null);
      if (error) throw error;
      return contarPorChave((data ?? []) as MencaoNaoLida[]);
    },
  });
}

/**
 * O aviso na tela quando alguém me menciona. 🔴 MONTAR UMA VEZ SÓ (AppSidebar): cada
 * montagem abre um canal, e dois canais dariam dois avisos.
 */
export function useAvisoDeMencao() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const meId: string | undefined = profile?.id;

  useEffect(() => {
    if (!meId) return;
    const canal = supabase
      .channel(`mencoes-rt-${meId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mencoes', filter: `mencionado_id=eq.${meId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['mencoes_nao_lidas'] });
          if (payload.eventType !== 'INSERT') return;
          const m = payload.new as {
            autor_nome: string | null; lugar: string; previa: string | null; link: string;
            origem: string; conversa_chave: string;
          };
          avisarMensagemNova({
            origem: m.origem === 'whatsapp_nota' ? 'whatsapp' : 'chat',
            de: m.autor_nome ?? 'Alguém',
            acao: `te mencionou ${m.lugar}`,
            previa: previaDaMensagem(m.previa, 'Menção'),
            aoAbrir: () => navigate(m.link),
            // Nota do WhatsApp: se a pessoa já está naquela conversa, o som cala sozinho.
            conversaId: m.origem === 'whatsapp_nota' ? m.conversa_chave : null,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [meId, navigate, qc]);
}

/**
 * Abrir a conversa marca como vistas as menções dela — some o @ — E também lê, no sininho,
 * o aviso "Fulano te mencionou" dessas mesmas menções (decisão do dono do produto,
 * 15/09/2026): antes disso, o @ sumia da conversa e o sininho continuava contando a mesma
 * menção como pendente.
 */
export function useMarcarMencoesLidas() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ origem, chave }: { origem: 'chat' | 'whatsapp_nota'; chave: string }) => {
      // Sem perfil carregado ainda, não há id para filtrar — não grava nada em vez de
      // arriscar `profile!.id` vazio (guarda pedida na revisão da Task 5).
      const meId = profile?.id;
      if (!meId) return;

      // 1) O @ dentro da própria conversa.
      const { error, count } = await supabase
        .from('mencoes')
        .update({ lida_em: new Date().toISOString() }, { count: 'exact' })
        .eq('mencionado_id', meId)
        .eq('origem', origem)
        .eq('conversa_chave', chave)
        .is('lida_em', null);
      if (error) throw error;
      // count === 0 aqui não é recusa (CLAUDE.md §4.6): é "nada a marcar" — a pessoa abriu a
      // conversa sem ter sido mencionada nela, ou já tinha visto antes. Nada a fazer.
      void count;

      // 2) O aviso da MESMA menção no sininho (`notificacoes.tipo = 'mencao'`). Achado pelo
      // `link` que os gatilhos da migration gravaram — o mesmo link que o clique no aviso
      // usa para abrir esta conversa. Um select comum acha só os da própria pessoa: a
      // política restritiva `notificacoes_mencao_so_do_dono_select` já limita
      // `tipo = 'mencao'` a `usuario_id = eu`; o `.eq('usuario_id', meId)` abaixo é defesa a
      // mais, não a única trava.
      //
      // O INSERT em `notificacoes_leituras` segue o MESMO caminho que `useMarkAsRead`
      // (`src/hooks/use-notificacoes.ts`) já usa para marcar qualquer aviso como lido: um
      // upsert com `ignoreDuplicates`, amarrado por política a `usuario_id = eu`. Por isso
      // fica num `try/catch` PRÓPRIO — se a regra de acesso um dia recusar, ou a consulta
      // falhar, o @ já sumiu da conversa (passo 1) e abrir a conversa não quebra a tela.
      try {
        const filtro = filtroDeLinkDaConversa(origem, chave);
        let consulta = supabase
          .from('notificacoes')
          .select('id')
          .eq('tipo', 'mencao')
          .eq('usuario_id', meId);
        consulta =
          filtro.tipo === 'igual'
            ? consulta.eq('link', filtro.valor)
            : consulta.like('link', filtro.valor);
        const { data: avisos, error: avisosError } = await consulta;
        if (avisosError) throw avisosError;

        if (avisos && avisos.length > 0) {
          const { error: leituraError } = await supabase.from('notificacoes_leituras').upsert(
            avisos.map((a) => ({ notificacao_id: a.id, usuario_id: meId })),
            { onConflict: 'notificacao_id,usuario_id', ignoreDuplicates: true },
          );
          if (leituraError) throw leituraError;
        }
      } catch (e) {
        console.error('[mencoes] não foi possível marcar o aviso do sininho como lido:', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mencoes_nao_lidas'] });
      // Mesma chave que `useNotificacoes`/`useUnreadCount` usam (`src/hooks/use-notificacoes.ts`)
      // — é o que atualiza o contador do sino.
      qc.invalidateQueries({ queryKey: ['notificacoes'] });
    },
  });
}
