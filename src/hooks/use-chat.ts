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
  lida: boolean;
  lida_em?: string | null;
  quoted_mensagem_id?: string | null;
  quoted_conteudo?: string | null;
  quoted_arquivo_nome?: string | null;
  quoted_arquivo_tipo?: string | null;
  quoted_remetente_nome?: string | null;
  vendedor?: { id: string; nome: string; email: string; avatar_url?: string | null };
}

export interface QuotedMessage {
  id: string;
  conteudo: string | null;
  arquivo_nome?: string | null;
  arquivo_tipo?: string | null;
  remetente_nome: string | null;
}

export interface ChatGrupo {
  id: string;
  nome: string;
  descricao?: string | null;
  foto_url?: string | null;
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
      .channel(`chat-rt-${grupoId || 'pub'}-${recipientId || 'all'}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_mensagens'
      }, async (payload) => {
        const newMsg = payload.new as any;
        
        // Verifica se a nova mensagem pertence ao canal atual
        const isCurrentGeral = !grupoId && !recipientId && !newMsg.grupo_id && !newMsg.recipient_id;
        const isCurrentGrupo = grupoId && newMsg.grupo_id === grupoId;
        const isCurrentDM = recipientId && (newMsg.recipient_id === recipientId || newMsg.usuario_id === recipientId);

        if (isCurrentGeral || isCurrentGrupo || isCurrentDM) {
          // Tenta buscar as informações do vendedor no cache antes de fazer uma nova query
          const members = qc.getQueryData<any[]>(['chat-members']) || [];
          let vendedor = members.find(m => m.id === newMsg.usuario_id);

          if (!vendedor) {
            // Se não estiver no cache, busca no banco
            const { data } = await supabase
              .from('usuarios')
              .select('id, nome, email, avatar_url')
              .eq('id', newMsg.usuario_id)
              .single();
            vendedor = data;
          }

          const completeMsg = {
            ...newMsg,
            vendedor: vendedor || undefined
          };

          qc.setQueryData<ChatMessage[]>(['chat_mensagens', grupoId, recipientId], (old) => {
            const exists = (old || []).some(m => m.id === completeMsg.id);
            if (exists) return old;
            return [...(old || []), completeMsg];
          });

          // Invalidamos para garantir sincronia, mas a UI já foi atualizada
          qc.invalidateQueries({ queryKey: ['chat_mensagens', grupoId, recipientId] });
          qc.invalidateQueries({ queryKey: ['unread_chat_count'] });
          qc.invalidateQueries({ queryKey: ['unread_chat_by_target'] });
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_mensagens'
      }, (payload) => {
        const oldMsg = payload.old as any;
        qc.setQueryData<ChatMessage[]>(['chat_mensagens', grupoId, recipientId], (old) =>
          (old || []).filter(m => m.id !== oldMsg.id)
        );
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_mensagens'
      }, (payload) => {
        // Reflete em tempo real quando o destinatário marca a conversa como lida,
        // pra quem enviou ver o "visualizado" sem precisar reabrir a tela.
        const updated = payload.new as any;
        qc.setQueryData<ChatMessage[]>(['chat_mensagens', grupoId, recipientId], (old) =>
          (old || []).map(m => (m.id === updated.id ? { ...m, lida: updated.lida, lida_em: updated.lida_em } : m))
        );
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
      .channel(`chat-grupos-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_grupos' }, () => {
        qc.invalidateQueries({ queryKey: ['chat-grupos'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useUpdateChatGrupo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ grupoId, nome, foto }: { grupoId: string, nome?: string, foto?: File | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const updates: { nome?: string; foto_url?: string } = {};
      if (nome !== undefined) updates.nome = nome;

      if (foto) {
        const safeName = sanitizeFileName(foto.name);
        const path = `${userData.user.id}/group-photos/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(path, foto, { contentType: foto.type || 'application/octet-stream' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(path);

        updates.foto_url = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('chat_grupos')
        .update(updates as any)
        .eq('id', grupoId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-grupos'] });
      toast.success('Grupo atualizado com sucesso!');
    },
    onError: (err: any) => {
      console.error('Erro ao atualizar grupo:', err);
      toast.error(`Erro ao atualizar grupo: ${err.message || 'Você não tem permissão para editar este grupo'}`);
    }
  });
}

export function useAddChatGrupoMembros() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ grupoId, usuarioIds }: { grupoId: string; usuarioIds: string[] }) => {
      const { error } = await supabase
        .from('chat_grupo_membros')
        .insert(usuarioIds.map(usuario_id => ({ grupo_id: grupoId, usuario_id })) as any);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['chat-grupo-membros', variables.grupoId] });
      toast.success('Participante adicionado com sucesso!');
    },
    onError: (err: any) => {
      console.error('Erro ao adicionar participante:', err);
      toast.error(`Erro ao adicionar participante: ${err.message || 'Você não tem permissão para isso'}`);
    }
  });
}

export function useDeleteChatGrupo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (grupoId: string) => {
      const { error } = await supabase
        .from('chat_grupos')
        .delete()
        .eq('id', grupoId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-grupos'] });
      toast.success('Grupo excluído com sucesso!');
    },
    onError: (err: any) => {
      console.error('Erro ao excluir grupo:', err);
      toast.error(`Erro ao excluir grupo: ${err.message || 'Você não tem permissão para excluir este grupo'}`);
    }
  });
}

export interface ChatGeralConfig {
  id: string;
  empresa_id: string;
  nome: string;
  foto_url?: string | null;
}

export function useChatGeralConfig() {
  const qc = useQueryClient();

  const query = useQuery<ChatGeralConfig | null>({
    queryKey: ['chat-geral-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_geral_config')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat-geral-config-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_geral_config' }, () => {
        qc.invalidateQueries({ queryKey: ['chat-geral-config'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useUpdateChatGeralConfig() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ nome, foto }: { nome?: string, foto?: File | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: me } = await supabase.from('usuarios').select('empresa_id').eq('user_id', userData.user.id).single();
      if (!me?.empresa_id) throw new Error('Empresa não encontrada');

      const updates: { nome?: string; foto_url?: string } = {};
      if (nome !== undefined) updates.nome = nome;

      if (foto) {
        const safeName = sanitizeFileName(foto.name);
        const path = `${userData.user.id}/group-photos/geral-${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(path, foto, { contentType: foto.type || 'application/octet-stream' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(path);

        updates.foto_url = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('chat_geral_config')
        .upsert({ empresa_id: me.empresa_id, ...updates } as any, { onConflict: 'empresa_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-geral-config'] });
      toast.success('Chat Geral atualizado com sucesso!');
    },
    onError: (err: any) => {
      console.error('Erro ao atualizar Chat Geral:', err);
      toast.error(`Erro ao atualizar Chat Geral: ${err.message || 'Você não tem permissão para editar'}`);
    }
  });
}

// Chave por alvo: 'geral', `grupo_${id}` ou `dm_${outroUsuarioId}` -> timestamp da última mensagem.
// Usada para ordenar a barra lateral (Grupos/Membros) por atividade recente, como no WhatsApp Inbox.
function activityKeyFor(me: string, msg: { usuario_id: string; recipient_id?: string | null; grupo_id?: string | null }): string | null {
  if (msg.grupo_id) return `grupo_${msg.grupo_id}`;
  if (msg.recipient_id === me) return `dm_${msg.usuario_id}`;
  if (msg.usuario_id === me && msg.recipient_id) return `dm_${msg.recipient_id}`;
  if (!msg.recipient_id && !msg.grupo_id) return 'geral';
  return null;
}

export interface ChatLastActivity {
  created_at: string;
  conteudo: string | null;
  arquivo_nome: string | null;
  usuario_id: string;
}

export function useChatLastActivity() {
  const qc = useQueryClient();
  // chat_mensagens.usuario_id/recipient_id referenciam usuarios.id, não o id legado
  // de vendedores (get_my_vendedor_id/['my-vendedor']) — guarda o id certo aqui pra
  // o handler de realtime comparar contra a mesma coisa que activityKeyFor espera.
  const meIdRef = useRef<string | null>(null);

  const query = useQuery<Record<string, ChatLastActivity>>({
    queryKey: ['chat-last-activity'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return {};

      const { data: me } = await supabase.from('usuarios').select('id, empresa_id').eq('user_id', userData.user.id).single();
      if (!me) return {};
      meIdRef.current = me.id;

      const { data, error } = await supabase
        .from('chat_mensagens')
        .select('usuario_id, recipient_id, grupo_id, conteudo, arquivo_nome, created_at')
        .eq('empresa_id', me.empresa_id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const map: Record<string, ChatLastActivity> = {};
      (data ?? []).forEach((msg) => {
        const key = activityKeyFor(me.id, msg);
        // Ordem descendente: a primeira ocorrência de cada chave já é a mais recente.
        if (key && !map[key]) {
          map[key] = {
            created_at: msg.created_at,
            conteudo: msg.conteudo,
            arquivo_nome: msg.arquivo_nome,
            usuario_id: msg.usuario_id,
          };
        }
      });
      return map;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat-last-activity-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens' }, (payload) => {
        const newMsg = payload.new as any;
        const meId = meIdRef.current;
        if (!meId) {
          // Ainda não temos o id do usuário em cache (corrida de montagem) — refetch em vez de ignorar.
          qc.invalidateQueries({ queryKey: ['chat-last-activity'] });
          return;
        }
        const key = activityKeyFor(meId, newMsg);
        if (!key) return;
        qc.setQueryData<Record<string, ChatLastActivity>>(['chat-last-activity'], (old) => ({
          ...(old ?? {}),
          [key]: {
            created_at: newMsg.created_at,
            conteudo: newMsg.conteudo,
            arquivo_nome: newMsg.arquivo_nome,
            usuario_id: newMsg.usuario_id,
          },
        }));
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
    mutationFn: async ({ conteudo, files, grupoId, recipientId, quoted }: { conteudo: string, files?: File[], grupoId?: string | null, recipientId?: string | null, quoted?: QuotedMessage | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const { data: vendedor, error: vErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id, nome, avatar_url')
        .eq('user_id', userData.user.id)
        .single();

      if (vErr || !vendedor) throw new Error('Vendedor não encontrado');

      const quotedFields = quoted ? {
        quoted_mensagem_id: quoted.id,
        quoted_conteudo: quoted.conteudo,
        quoted_arquivo_nome: quoted.arquivo_nome ?? null,
        quoted_arquivo_tipo: quoted.arquivo_tipo ?? null,
        quoted_remetente_nome: quoted.remetente_nome,
      } : {};

      // Se não houver arquivos, envia apenas a mensagem de texto
      if (!files || files.length === 0) {
        const newMsg = {
          conteudo: conteudo || '',
          usuario_id: vendedor.id,
          empresa_id: vendedor.empresa_id!,
          grupo_id: grupoId || null,
          recipient_id: recipientId || null,
          ...quotedFields,
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
      // A primeira mensagem também leva o conteúdo de texto e a citação, se houver
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
          ...(i === 0 ? quotedFields : {}),
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
    onMutate: async ({ conteudo, files, grupoId, recipientId, quoted }) => {
      await qc.cancelQueries({ queryKey: ['chat_mensagens', grupoId, recipientId] });
      const previousMessages = qc.getQueryData<ChatMessage[]>(['chat_mensagens', grupoId, recipientId]);

      // Sobe a conversa/grupo para o topo da barra lateral imediatamente, sem esperar o
      // round-trip do Realtime (mesmo padrão usado no WhatsApp Inbox).
      const activityKey = grupoId ? `grupo_${grupoId}` : recipientId ? `dm_${recipientId}` : 'geral';
      qc.setQueryData<Record<string, string>>(['chat-last-activity'], (old) => ({
        ...(old ?? {}),
        [activityKey]: new Date().toISOString(),
      }));

      const { data: userData } = await supabase.auth.getUser();
      if (previousMessages && userData.user) {
        const myVendedor = qc.getQueryData<any>(['meu_perfil', userData.user.id]);
        
        const quotedFields = quoted ? {
          quoted_mensagem_id: quoted.id,
          quoted_conteudo: quoted.conteudo,
          quoted_arquivo_nome: quoted.arquivo_nome ?? null,
          quoted_arquivo_tipo: quoted.arquivo_tipo ?? null,
          quoted_remetente_nome: quoted.remetente_nome,
        } : {};

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
            lida: false,
            ...quotedFields,
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
              lida: false,
              ...(i === 0 ? quotedFields : {}),
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

        return { previousMessages, grupoId, recipientId, optimisticIds: optimisticMsgs.map(m => m.id) };
      }

      return { previousMessages, grupoId, recipientId, optimisticIds: [] as string[] };
    },
    onError: (err: any, variables, context) => {
      // Remove só as mensagens otimistas desta chamada, não todo o cache — com
      // vários envios em paralelo, outra chamada pode ter mensagens otimistas
      // próprias ainda em voo.
      qc.setQueryData<ChatMessage[]>(['chat_mensagens', variables.grupoId, variables.recipientId], (old) =>
        (old || []).filter(m => !context?.optimisticIds?.includes(m.id))
      );
      console.error('Erro ao enviar mensagem:', err);
      toast.error(`Erro ao enviar mensagem: ${err.message || 'Erro desconhecido'}`);
    },
    onSuccess: (data, variables, context) => {
      // Substitui apenas as mensagens otimistas desta chamada pelas reais —
      // não mexe nas mensagens otimistas de outras chamadas ainda pendentes.
      qc.setQueryData<ChatMessage[]>(['chat_mensagens', variables.grupoId, variables.recipientId], (old) => {
        const filtered = (old || []).filter(m => !context?.optimisticIds?.includes(m.id));
        return [...filtered, ...(data as any as ChatMessage[])];
      });
    }
  });

  const send = useCallback(async (conteudo: string, files?: File[], grupoId?: string | null, recipientId?: string | null, quoted?: QuotedMessage | null) => {
    setSending(true);
    try {
      await mutation.mutateAsync({ conteudo, files, grupoId, recipientId, quoted });
    } finally {
      setSending(false);
    }
  }, [mutation]);

  return { send, sending };
}

export function useMarkChatAsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ grupoId, recipientId }: { grupoId?: string | null, recipientId?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: me } = await supabase.from('usuarios').select('id, empresa_id').eq('user_id', userData.user.id).single();
      if (!me) return;

      let query = supabase
        .from('chat_mensagens')
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq('lida', false)
        .neq('usuario_id', me.id);

      if (grupoId) {
        query = query.eq('grupo_id', grupoId);
      } else if (recipientId) {
        query = query.eq('usuario_id', recipientId).eq('recipient_id', me.id);
      } else {
        query = query.is('grupo_id', null).is('recipient_id', null).eq('empresa_id', me.empresa_id);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['chat_mensagens', variables.grupoId, variables.recipientId] });
      qc.invalidateQueries({ queryKey: ['unread_chat_count'] });
    }
  });
}

// Confirmação de leitura por usuário (grupo/geral): chat_mensagens.lida é um único
// booleano por mensagem, então em conversas com mais de 2 participantes ele vira
// true assim que QUALQUER UM lê. Pra saber quando TODOS os participantes leram,
// cada leitor registra sua própria linha em chat_mensagens_leituras.
export function useMarkGroupMessagesRead() {
  return useMutation({
    mutationFn: async ({ messageIds }: { messageIds: string[] }) => {
      if (messageIds.length === 0) return;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: me } = await supabase.from('usuarios').select('id').eq('user_id', userData.user.id).single();
      if (!me) return;

      const rows = messageIds.map((mensagem_id) => ({ mensagem_id, usuario_id: me.id }));
      const { error } = await supabase
        .from('chat_mensagens_leituras')
        .upsert(rows, { onConflict: 'mensagem_id,usuario_id', ignoreDuplicates: true });
      if (error) throw error;
    },
  });
}

// Mapa mensagem_id -> lista de usuario_id que já a leram, para as mensagens
// informadas (tipicamente as que EU enviei numa conversa em grupo/geral).
export function useMessageReadReceipts(messageIds: string[]) {
  const qc = useQueryClient();
  const idsKey = [...messageIds].sort().join(',');

  const query = useQuery<Record<string, string[]>>({
    queryKey: ['chat-read-receipts', idsKey],
    queryFn: async () => {
      if (messageIds.length === 0) return {};
      const { data, error } = await supabase
        .from('chat_mensagens_leituras')
        .select('mensagem_id, usuario_id')
        .in('mensagem_id', messageIds);
      if (error) throw error;

      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r) => {
        (map[r.mensagem_id] ??= []).push(r.usuario_id);
      });
      return map;
    },
    enabled: messageIds.length > 0,
  });

  useEffect(() => {
    if (messageIds.length === 0) return;
    const idsSet = new Set(messageIds);
    const channel = supabase
      .channel(`chat-read-receipts-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens_leituras' }, (payload) => {
        const row = payload.new as { mensagem_id: string; usuario_id: string };
        if (!idsSet.has(row.mensagem_id)) return;
        qc.setQueryData<Record<string, string[]>>(['chat-read-receipts', idsKey], (old) => {
          const next = { ...(old ?? {}) };
          const list = next[row.mensagem_id] ?? [];
          if (!list.includes(row.usuario_id)) next[row.mensagem_id] = [...list, row.usuario_id];
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, idsKey]);

  return query;
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

export function useDeleteChatMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; grupoId?: string | null; recipientId?: string | null }) => {
      const { data, error } = await supabase.from('chat_mensagens').delete().eq('id', id).select('id');
      if (error) throw error;
      // RLS bloqueia silenciosamente (error null, 0 linhas) em vez de lançar erro de permissão.
      if (!data || data.length === 0) {
        throw new Error('Você não tem permissão para excluir esta mensagem');
      }
    },
    onSuccess: (_, variables) => {
      qc.setQueryData<ChatMessage[]>(['chat_mensagens', variables.grupoId ?? null, variables.recipientId ?? null], (old) =>
        (old || []).filter(m => m.id !== variables.id)
      );
      toast.success('Mensagem excluída.');
    },
    onError: (err: any) => {
      console.error('Erro ao excluir mensagem:', err);
      toast.error(`Erro ao excluir mensagem: ${err.message || 'Você não tem permissão para excluir esta mensagem'}`);
    }
  });
}
