import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Notificacao {
  id: string;
  vendedor_id: string;
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

  const query = useQuery({
    queryKey: ['notificacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notificacao[];
    },
  });

  // Realtime subscription
  useEffect(() => {
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
  }, [qc]);

  return query;
}

export function useUnreadCount() {
  const { data } = useNotificacoes();
  return (data ?? []).filter(n => !n.lida).length;
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
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notificacoes')
        .update({ lida: true })
        .eq('lida', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}
