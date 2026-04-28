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
  recipient_id?: string | null;
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

async function fetchMessages(grupoId: string | null, recipientId: string | null = null): Promise<ChatMessage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: me } = await supabase.from('usuarios').select('id').eq('user_id', user.id).single();
  if (!me) return [];

  let query = supabase
    .from('chat_mensagens')
    .select('*, vendedor:usuarios!chat_mensagens_vendedor_id_fkey(id, nome, email, avatar_url)')
    .order('created_at', { ascending: true })
    .limit(200);

  if (grupoId) {
    query = query.eq('grupo_id', grupoId);
  } else if (recipientId) {
    // DM privada entre os dois usuários
    query = query.or(`and(usuario_id.eq.${me.id},recipient_id.eq.${recipientId}),and(usuario_id.eq.${recipientId},recipient_id.eq.${me.id})`);
  } else {
    // Chat Geral
    query = query.is('grupo_id', null).is('recipient_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as any) ?? [];
}

export function useChatMessages(grupoId: string | null = null, recipientId: string | null = null) {
  const qc = useQueryClient();

  const query = useQuery<ChatMessage[]>({
    queryKey: ['chat_mensagens', grupoId, recipientId],
    queryFn: () => fetchMessages(grupoId, recipientId),
    refetchInterval: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat_realtime_${grupoId || 'public'}_${recipientId || 'all'}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_mensagens'
      }, (payload) => {
        const newMsg = payload.new as any;
        
        // Verifica se a nova mensagem pertence ao canal atual
        const isCurrentGeral = !grupoId && !recipientId && !newMsg.grupo_id && !newMsg.recipient_id;
        const isCurrentGrupo = grupoId && newMsg.grupo_id === grupoId;
        const isCurrentDM = recipientId && (newMsg.recipient_id === recipientId || newMsg.usuario_id === recipientId);

        if (isCurrentGeral || isCurrentGrupo || isCurrentDM) {
          qc.invalidateQueries({ queryKey: ['chat_mensagens', grupoId, recipientId] });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc, grupoId, recipientId]);

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
    mutationFn: async ({ conteudo, files, grupoId, recipientId }: { conteudo: string, files?: File[], grupoId?: string | null, recipientId?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: vendedor, error: vErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id, nome, avatar_url')
        .eq('user_id', userData.user.id)
        .single();
      
      if (vErr || !vendedor) throw new Error('Vendedor não encontrado');

      // Se não houver arquivos, envia apenas a mensagem de texto
      if (!files || files.length === 0) {
        const newMsg = {
          conteudo: conteudo || '',
          usuario_id: vendedor.id,
          empresa_id: vendedor.empresa_id!,
          grupo_id: grupoId || null,
          recipient_id: recipientId || null,
        };

        const { data: savedMsg, error } = await supabase
          .from('chat_mensagens')
          .insert(newMsg)
          .select('*, vendedor:usuarios!chat_mensagens_vendedor_id_fkey(id, nome, email, avatar_url)')
          .single();

        if (error) throw error;
        return [savedMsg];
      }

      // Se houver arquivos, envia cada um como uma mensagem separada
      // A primeira mensagem também leva o conteúdo de texto se houver
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = sanitizeFileName(file.name);
        const path = `${userData.user.id}/${Date.now()}-${i}-${safeName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' });
        
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(path);

        const newMsg = {
          conteudo: i === 0 && conteudo ? conteudo : file.name,
          usuario_id: vendedor.id,
          empresa_id: vendedor.empresa_id!,
          arquivo_url: urlData.publicUrl,
          arquivo_nome: file.name,
          arquivo_tipo: file.type,
          grupo_id: grupoId || null,
          recipient_id: recipientId || null,
        };

        const { data: savedMsg, error } = await supabase
          .from('chat_mensagens')
          .insert(newMsg)
          .select('*, vendedor:usuarios!chat_mensagens_vendedor_id_fkey(id, nome, email, avatar_url)')
          .single();

        if (error) throw error;
        results.push(savedMsg);
      }
      return results;
    },
    onMutate: async ({ conteudo, files, grupoId, recipientId }) => {
      await qc.cancelQueries({ queryKey: ['chat_mensagens', grupoId, recipientId] });
      const previousMessages = qc.getQueryData<ChatMessage[]>(['chat_mensagens', grupoId, recipientId]);

      const { data: userData } = await supabase.auth.getUser();
      if (previousMessages && userData.user) {
        const myVendedor = qc.getQueryData<any>(['meu_perfil', userData.user.id]);
        
        const optimisticMsgs: ChatMessage[] = [];
        if (!files || files.length === 0) {
          optimisticMsgs.push({
            id: `temp-${Date.now()}`,
            conteudo: conteudo || '',
            usuario_id: myVendedor?.id || 'me',
            empresa_id: '',
            created_at: new Date().toISOString(),
            grupo_id: grupoId || null,
            recipient_id: recipientId || null,
            vendedor: myVendedor ? {
              id: myVendedor.id,
              nome: myVendedor.nome,
              email: myVendedor.email,
              avatar_url: myVendedor.avatar_url
            } : undefined
          });
        } else {
          files.forEach((file, i) => {
            optimisticMsgs.push({
              id: `temp-${Date.now()}-${i}`,
              conteudo: i === 0 && conteudo ? conteudo : file.name,
              usuario_id: myVendedor?.id || 'me',
              empresa_id: '',
              created_at: new Date().toISOString(),
              grupo_id: grupoId || null,
              recipient_id: recipientId || null,
              arquivo_url: URL.createObjectURL(file),
              arquivo_nome: file.name,
              arquivo_tipo: file.type,
              vendedor: myVendedor ? {
                id: myVendedor.id,
                nome: myVendedor.nome,
                email: myVendedor.email,
                avatar_url: myVendedor.avatar_url
              } : undefined
            });
          });
        }

        qc.setQueryData<ChatMessage[]>(['chat_mensagens', grupoId, recipientId], (old) => [...(old || []), ...optimisticMsgs]);
      }

      return { previousMessages, grupoId, recipientId };
    },
    onError: (err: any, variables, context) => {
      qc.setQueryData(['chat_mensagens', variables.grupoId, variables.recipientId], context?.previousMessages);
      console.error('Erro ao enviar mensagem:', err);
      toast.error(`Erro ao enviar mensagem: ${err.message || 'Erro desconhecido'}`);
    },
    onSuccess: (data, variables) => {
      qc.setQueryData<ChatMessage[]>(['chat_mensagens', variables.grupoId, variables.recipientId], (old) => {
        const filtered = (old || []).filter(m => !m.id.toString().startsWith('temp-'));
        return [...filtered, ...(data as any as ChatMessage[])];
      });
    }
  });

  const send = useCallback(async (conteudo: string, files?: File[], grupoId?: string | null, recipientId?: string | null) => {
    setSending(true);
    try {
      await mutation.mutateAsync({ conteudo, files, grupoId, recipientId });
    } finally {
      setSending(false);
    }
  }, [mutation]);

  return { send, sending };
}

export function useClearChat() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ grupoId, recipientId }: { grupoId?: string | null, recipientId?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: me } = await supabase.from('usuarios').select('id').eq('user_id', userData.user.id).single();
      if (!me) throw new Error('Vendedor não encontrado');

      let query = supabase.from('chat_mensagens').delete();

      if (grupoId) {
        query = query.eq('grupo_id', grupoId);
      } else if (recipientId) {
        query = query.or(`and(usuario_id.eq.${me.id},recipient_id.eq.${recipientId}),and(usuario_id.eq.${recipientId},recipient_id.eq.${me.id})`);
      } else {
        query = query.is('grupo_id', null).is('recipient_id', null);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['chat_mensagens', variables.grupoId, variables.recipientId] });
      toast.success('Chat limpo com sucesso!');
    },
    onError: (err: any) => {
      console.error('Erro ao limpar chat:', err);
      toast.error(`Erro ao limpar chat: ${err.message}`);
    }
  });
}
