import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

export interface ChatMessage {
  id: string;
  conteudo: string;
  vendedor_id: string;
  empresa_id: string;
  created_at: string;
  vendedor?: { id: string; nome: string; email: string };
}

async function fetchMessages(): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('*, vendedor:vendedores!chat_mensagens_vendedor_id_fkey(id, nome, email)')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data as any) ?? [];
}

export function useChatMessages() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['chat_mensagens'],
    queryFn: fetchMessages,
    refetchInterval: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel('chat_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, () => {
        qc.invalidateQueries({ queryKey: ['chat_mensagens'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useSendMessage() {
  const [sending, setSending] = useState(false);

  const send = useCallback(async (conteudo: string) => {
    setSending(true);
    try {
      // Get vendedor info (id + empresa_id)
      const { data: vendedor, error: vErr } = await supabase
        .from('vendedores')
        .select('id, empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .single();
      if (vErr || !vendedor) throw new Error('Vendedor não encontrado');

      const { error } = await supabase.from('chat_mensagens').insert({
        conteudo,
        vendedor_id: vendedor.id,
        empresa_id: vendedor.empresa_id!,
      });
      if (error) throw error;
    } finally {
      setSending(false);
    }
  }, []);

  return { send, sending };
}
