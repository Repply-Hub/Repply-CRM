import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  id: string;
  conteudo: string;
  usuario_id: string;
  empresa_id: string;
  created_at: string;
  grupo_id?: string | null;
  arquivo_url?: string | null;
  arquivo_nome?: string | null;
  arquivo_tipo?: string | null;
  vendedor?: { id: string; nome: string; email: string };
}

export interface ChatGrupo {
  id: string;
  nome: string;
  descricao?: string | null;
  empresa_id: string;
  criado_por: string;
  created_at: string;
}

async function fetchMessages(grupoId: string | null): Promise<ChatMessage[]> {
  let query = supabase
    .from('chat_mensagens')
    .select('*, vendedor:vendedores!chat_mensagens_vendedor_id_fkey(id, nome, email)')
    .order('created_at', { ascending: true })
    .limit(200);

  if (grupoId) {
    query = query.eq('grupo_id', grupoId);
  } else {
    query = query.is('grupo_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as any) ?? [];
}

export function useChatMessages(grupoId: string | null = null) {
  const qc = useQueryClient();

  const query = useQuery<ChatMessage[]>({
    queryKey: ['chat_mensagens', grupoId],
    queryFn: () => fetchMessages(grupoId),
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

export function useChatGrupos() {
  const qc = useQueryClient();

  const query = useQuery<ChatGrupo[]>({
    queryKey: ['chat-grupos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_grupos')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('chat_grupos_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_grupos' }, () => {
        qc.invalidateQueries({ queryKey: ['chat-grupos'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useSendMessage() {
  const [sending, setSending] = useState(false);

  const send = useCallback(async (conteudo: string, file?: File, grupoId?: string | null) => {
    setSending(true);
    try {
      const { data: vendedor, error: vErr } = await supabase
        .from('usuarios')
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
        usuario_id: vendedor.id,
        empresa_id: vendedor.empresa_id!,
        arquivo_url,
        arquivo_nome,
        arquivo_tipo,
        grupo_id: grupoId || null,
      } as any);
      if (error) throw error;
    } finally {
      setSending(false);
    }
  }, []);

  return { send, sending };
}
