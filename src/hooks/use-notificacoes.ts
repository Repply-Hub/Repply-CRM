import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, createElement } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

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
      return data as Notificacao[];
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

  const query = useQuery({
    queryKey: ['unread_chat_count', user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { data: me } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .eq('user_id', user.id)
        .single();

      if (!me) return 0;

      const { count, error } = await supabase
        .from('chat_mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('lida', false)
        .neq('usuario_id', me.id)
        .or(`recipient_id.eq.${me.id},and(recipient_id.is.null,grupo_id.is.null,empresa_id.eq.${me.empresa_id}),and(grupo_id.not.is.null,empresa_id.eq.${me.empresa_id})`);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  // Assinatura global (sempre montada via AppSidebar) para garantir que o toast
  // dispare mesmo se o usuário não estiver com a tela de chat aberta no momento.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat-unread-rt-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['unread_chat_count'] });

        if (payload.eventType === 'INSERT' && meId && payload.new.usuario_id !== meId) {
          const members = qc.getQueryData<any[]>(['chat-members']) || [];
          const sender = members.find((m) => m.id === payload.new.usuario_id);
          const nomeConversa = sender?.nome || 'Alguém';
          toast(createElement('span', null, createElement('b', null, nomeConversa), ' enviou uma mensagem'), {
            description: payload.new.conteudo?.slice(0, 120) || 'Enviou um arquivo',
            style: { background: '#f97316', color: '#fff', border: 'none' },
            descriptionClassName: '!text-white/90',
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, user?.id, meId]);

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
  const { data: unreadChat = 0 } = useUnreadChatMessages();

  const unreadNotifs = (notificacoes ?? []).filter(n => !n.lida).length;
  return unreadNotifs + unreadEmails + unreadChat;
}

export { useUnreadWaMessages } from '@/hooks/use-whatsapp-inbox';

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notificacoes')
        .update({ lida: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      
      // Mark notifications as read
      await supabase
        .from('notificacoes')
        .update({ lida: true })
        .eq('usuario_id', user.id)
        .eq('lida', false);
        
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
