import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
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
    if (!user) return;
    const channel = supabase
      .channel('notificacoes-realtime')
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
  }, [qc, user]);

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

export function useUnreadCount() {
  const { data: notificacoes } = useNotificacoes();
  const { data: unreadEmails = 0 } = useUnreadEmails();
  
  const unreadNotifs = (notificacoes ?? []).filter(n => !n.lida).length;
  return unreadNotifs + unreadEmails;
}

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
