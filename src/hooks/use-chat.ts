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
  arquivo_url?: string | null;
  arquivo_nome?: string | null;
  arquivo_tipo?: string | null;
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

  const send = useCallback(async (conteudo: string, file?: File) => {
    setSending(true);
    try {
      const { data: vendedor, error: vErr } = await supabase
        .from('vendedores')
        .select('id, empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .single();
      if (vErr || !vendedor) throw new Error('Vendedor não encontrado');

      let arquivo_url: string | null = null;
      let arquivo_nome: string | null = null;
      let arquivo_tipo: string | null = null;

      if (file) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const ext = file.name.split('.').pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(path);
        arquivo_url = urlData.publicUrl;
        arquivo_nome = file.name;
        arquivo_tipo = file.type;
      }

      const { error } = await supabase.from('chat_mensagens').insert({
        conteudo: conteudo || (file ? file.name : ''),
        vendedor_id: vendedor.id,
        empresa_id: vendedor.empresa_id!,
        arquivo_url,
        arquivo_nome,
        arquivo_tipo,
      } as any);
      if (error) throw error;
    } finally {
      setSending(false);
    }
  }, []);

  return { send, sending };
}
