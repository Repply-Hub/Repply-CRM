import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { avisarMensagemNova, previaDaMensagem } from '@/lib/aviso-de-mensagem-nova';
import { contarPorChave, type MencaoNaoLida } from '@/lib/mencoes-por-conversa';

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

/** Abrir a conversa marca as menções dela como vistas — some o @. */
export function useMarcarMencoesLidas() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ origem, chave }: { origem: 'chat' | 'whatsapp_nota'; chave: string }) => {
      // Sem perfil carregado ainda, não há id para filtrar — não grava nada em vez de
      // arriscar `profile!.id` vazio (guarda pedida na revisão da Task 5).
      const meId = profile?.id;
      if (!meId) return;
      const { error } = await supabase
        .from('mencoes')
        .update({ lida_em: new Date().toISOString() })
        .eq('mencionado_id', meId)
        .eq('origem', origem)
        .eq('conversa_chave', chave)
        .is('lida_em', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mencoes_nao_lidas'] }),
  });
}
