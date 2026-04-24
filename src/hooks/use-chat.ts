import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/file-validation';
import { toast } from 'sonner';

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
  vendedor?: { id: string; nome: string; email: string; avatar_url?: string | null };
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
    .select('*, vendedor:usuarios!chat_mensagens_usuario_id_fkey(id, nome, email, avatar_url)')
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
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_mensagens',
        filter: grupoId ? `grupo_id=eq.${grupoId}` : 'grupo_id=is.null'
      }, (payload) => {
        // Optimistic check: if message is already in list (via mutation), don't force invalidate
        qc.invalidateQueries({ queryKey: ['chat_mensagens', grupoId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc, grupoId]);

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
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ conteudo, file, grupoId }: { conteudo: string, file?: File, grupoId?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: vendedor, error: vErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id, nome, avatar_url')
        .eq('user_id', userData.user.id)
        .single();
      
      if (vErr || !vendedor) throw new Error('Vendedor não encontrado');

      let arquivo_url: string | null = null;
      let arquivo_nome: string | null = null;
      let arquivo_tipo: string | null = null;

      if (file) {
        const safeName = sanitizeFileName(file.name);
        const path = `${userData.user.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(path);
        arquivo_url = urlData.publicUrl;
        arquivo_nome = file.name;
        arquivo_tipo = file.type;
      }

      const newMsg = {
        conteudo: conteudo || (file ? file.name : ''),
        usuario_id: vendedor.id,
        empresa_id: vendedor.empresa_id!,
        arquivo_url,
        arquivo_nome,
        arquivo_tipo,
        grupo_id: grupoId || null,
      };

      const { data: savedMsg, error } = await supabase
        .from('chat_mensagens')
        .insert(newMsg)
        .select('*, vendedor:usuarios(id, nome, email, avatar_url)')
        .single();

      if (error) throw error;
      return savedMsg;
    },
    onMutate: async ({ conteudo, file, grupoId }) => {
      await qc.cancelQueries({ queryKey: ['chat_mensagens', grupoId] });
      const previousMessages = qc.getQueryData<ChatMessage[]>(['chat_mensagens', grupoId]);

      // Mock optimistic message
      const { data: userData } = await supabase.auth.getUser();
      const optimisticId = `temp-${Date.now()}`;
      
      if (previousMessages && userData.user) {
        // Tentativa de pegar info do cache para o optimistic
        const myVendedor = qc.getQueryData<any>(['meu_perfil', userData.user.id]);
        
        const optimisticMsg: ChatMessage = {
          id: optimisticId,
          conteudo: conteudo || (file ? file.name : ''),
          usuario_id: myVendedor?.id || 'me',
          empresa_id: '',
          created_at: new Date().toISOString(),
          grupo_id: grupoId || null,
          arquivo_url: file ? URL.createObjectURL(file) : null,
          arquivo_nome: file?.name || null,
          arquivo_tipo: file?.type || null,
          vendedor: myVendedor ? {
            id: myVendedor.id,
            nome: myVendedor.nome,
            email: myVendedor.email,
            avatar_url: myVendedor.avatar_url
          } : undefined
        };

        qc.setQueryData<ChatMessage[]>(['chat_mensagens', grupoId], (old) => [...(old || []), optimisticMsg]);
      }

      return { previousMessages, optimisticId };
    },
    onError: (err, variables, context) => {
      qc.setQueryData(['chat_mensagens', variables.grupoId], context?.previousMessages);
      toast.error('Erro ao enviar mensagem');
    },
    onSuccess: (data, variables) => {
      qc.setQueryData<ChatMessage[]>(['chat_mensagens', variables.grupoId], (old) => {
        const filtered = (old || []).filter(m => !m.id.startsWith('temp-'));
        return [...filtered, data];
      });
    }
  });

  const send = useCallback(async (conteudo: string, file?: File, grupoId?: string | null) => {
    setSending(true);
    try {
      await mutation.mutateAsync({ conteudo, file, grupoId });
    } finally {
      setSending(false);
    }
  }, [mutation]);

  return { send, sending };
}
