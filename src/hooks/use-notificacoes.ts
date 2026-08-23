import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, createElement } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { useSecaoLigada } from '@/hooks/use-secoes';

const MENSAGEM_TOAST_MAX_CHARS = 100;

export interface Notificacao {
  id: string;
  usuario_id: string;
  pedido_id: string | null;
  cliente_id: string | null;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  lida: boolean;
  created_at: string;
}

export function useNotificacoes() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['notificacoes', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // `notificacoes.lida` é compartilhado entre o dono e qualquer gestor da
      // mesma empresa (a RLS libera SELECT/UPDATE pra ambos na mesma linha), então
      // não dá pra usar como "lida para mim". A leitura real de cada usuário vem de
      // notificacoes_leituras, que só expõe (via RLS) as próprias marcações.
      const { data: leituras, error: leiturasError } = await supabase
        .from('notificacoes_leituras')
        .select('notificacao_id')
        .in('notificacao_id', data.map((n) => n.id));
      if (leiturasError) throw leiturasError;

      const lidasParaMim = new Set((leituras ?? []).map((l) => l.notificacao_id));
      return data.map((n) => ({ ...n, lida: lidasParaMim.has(n.id) })) as Notificacao[];
    },
    enabled: !!user,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notificacoes-rt-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes' },
        () => {
          qc.invalidateQueries({ queryKey: ['notificacoes'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes_leituras' },
        () => {
          qc.invalidateQueries({ queryKey: ['notificacoes'] });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[notificacoes] falha na subscription realtime:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user?.id]);

  return query;
}

export function useUnreadEmails() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['unread_emails_count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('emails_recebidos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('lido', false);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 60000, // Check every minute
  });
}

export function useUnreadChatMessages() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const meId = profile?.id;
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id;

  // A trava da seção mora AQUI DENTRO, e não no ponto de chamada (AppSidebar), por dois
  // motivos. Primeiro, hook do React não pode ser chamado dentro de `if`. Segundo, e mais
  // importante: travar lá zeraria o contador mas NÃO calaria o aviso em tempo real abaixo,
  // que é o que de fato aparece para quem não deveria — ele salta por cima de qualquer
  // tela, sem passar pelo menu nem pela rota.
  const { ligada: temChat } = useSecaoLigada('chat');

  const query = useQuery({
    queryKey: ['unread_chat_count', user?.id, meId],
    queryFn: async () => {
      if (!user || !meId) return 0;

      const { count, error } = await supabase
        .from('chat_mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('lida', false)
        .neq('usuario_id', meId)
        .or(`recipient_id.eq.${meId},and(recipient_id.is.null,grupo_id.is.null,empresa_id.eq.${empresaId}),and(grupo_id.not.is.null,empresa_id.eq.${empresaId})`);

      if (error) throw error;
      return count || 0;
    },
    // `temChat === true` e não `!== false`: com a resposta ainda não conhecida a consulta
    // não dispara. É a regra da cascata — melhor demorar a aparecer do que aparecer e sumir.
    enabled: !!user && !!meId && temChat === true,
  });

  // Assinatura global (sempre montada via AppSidebar) para garantir que o toast
  // dispare mesmo se o usuário não estiver com a tela de chat aberta no momento.
  useEffect(() => {
    if (!user?.id || temChat !== true) return;
    const channel = supabase
      .channel(`chat-unread-rt-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, async (payload) => {
        qc.invalidateQueries({ queryKey: ['unread_chat_count'] });

        if (payload.eventType === 'INSERT' && meId && payload.new.usuario_id !== meId) {
          const members = qc.getQueryData<any[]>(['chat-members']) || [];
          let sender = members.find((m) => m.id === payload.new.usuario_id);

          if (!sender) {
            const { data } = await supabase
              .from('usuarios')
              .select('id, nome')
              .eq('id', payload.new.usuario_id)
              .single();
            sender = data;
          }

          const nomeConversa = sender?.nome || 'Alguém';
          const conteudo = payload.new.conteudo?.trim();
          const descricao = conteudo
            ? conteudo.length > MENSAGEM_TOAST_MAX_CHARS
              ? `${conteudo.slice(0, MENSAGEM_TOAST_MAX_CHARS)}...`
              : conteudo
            : 'Enviou um arquivo';
          toast(() => createElement('span', null, createElement('b', null, nomeConversa), ' enviou uma mensagem'), {
            description: descricao,
            style: { background: '#f97316', color: '#fff', border: 'none' },
            descriptionClassName: '!text-white/90',
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // `temChat` na lista não é detalhe: sem ele, quem estivesse com o app aberto na hora em
    // que o admin desligasse o Chat continuaria recebendo aviso até recarregar a página.
    // Com ele, o mapa de seções recarrega ao voltar para a aba (30s + refetchOnWindowFocus),
    // este efeito roda de novo e o canal é fechado.
  }, [qc, user?.id, meId, temChat]);

  return query;
}

export function useUnreadChatByTarget() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['unread_chat_by_target', user?.id],
    queryFn: async () => {
      if (!user) return {};
      
      const { data: me } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .eq('user_id', user.id)
        .single();
        
      if (!me) return {};

      const { data, error } = await supabase
        .from('chat_mensagens')
        .select('usuario_id, grupo_id, recipient_id')
        .eq('lida', false)
        .neq('usuario_id', me.id)
        .or(`recipient_id.eq.${me.id},and(recipient_id.is.null,grupo_id.is.null,empresa_id.eq.${me.empresa_id}),and(grupo_id.not.is.null,empresa_id.eq.${me.empresa_id})`);
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      
      data?.forEach(msg => {
        let key = 'geral';
        if (msg.grupo_id) {
          key = `grupo_${msg.grupo_id}`;
        } else if (msg.recipient_id === me.id) {
          key = `dm_${msg.usuario_id}`;
        }
        
        counts[key] = (counts[key] || 0) + 1;
      });
      
      return counts;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat-targets-rt-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, () => {
        qc.invalidateQueries({ queryKey: ['unread_chat_by_target'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, user?.id]);

  return query;
}

export function useUnreadCount() {
  const { data: notificacoes } = useNotificacoes();
  const { data: unreadEmails = 0 } = useUnreadEmails();

  const unreadNotifs = (notificacoes ?? []).filter(n => !n.lida).length;
  return unreadNotifs + unreadEmails;
}

export { useUnreadWaMessages } from '@/hooks/use-whatsapp-inbox';

export function useMarkAsRead() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.id) return;
      const { error } = await supabase
        .from('notificacoes_leituras')
        .upsert(
          { notificacao_id: id, usuario_id: profile.id },
          { onConflict: 'notificacao_id,usuario_id', ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;

      // Marca como lida (pra mim) cada notificação que eu enxergo hoje — inclusive
      // as de outros usuários que gestores veem por estarem na mesma empresa.
      // notificacoes.usuario_id referencia usuarios.id, não o uid do auth.
      if (profile?.id) {
        const { data: visiveis } = await supabase.from('notificacoes').select('id');
        if (visiveis && visiveis.length > 0) {
          await supabase.from('notificacoes_leituras').upsert(
            visiveis.map((n) => ({ notificacao_id: n.id, usuario_id: profile.id })),
            { onConflict: 'notificacao_id,usuario_id', ignoreDuplicates: true }
          );
        }
      }

      // Mark emails as read
      await supabase
        .from('emails_recebidos')
        .update({ lido: true })
        .eq('user_id', user.id)
        .eq('lido', false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificacoes'] });
      qc.invalidateQueries({ queryKey: ['unread_emails_count'] });
      qc.invalidateQueries({ queryKey: ['received_emails'] });
    },
  });
}
