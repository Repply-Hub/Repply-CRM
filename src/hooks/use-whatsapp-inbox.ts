import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

export interface WaConversa {
  id: string;
  empresa_id: string;
  telefone: string;
  nome_contato: string | null;
  cliente_id: string | null;
  contato_id: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  nao_lidas: number;
  arquivada: boolean;
  created_at: string;
  updated_at: string;
}

export interface WaMensagem {
  id: string;
  conversa_id: string;
  empresa_id: string;
  direcao: 'entrada' | 'saida';
  conteudo: string;
  tipo: string;
  media_url: string | null;
  media_mime: string | null;
  wamid: string | null;
  status: string;
  usuario_id: string | null;
  lida: boolean;
  created_at: string;
  usuario?: { id: string; nome: string; avatar_url: string | null } | null;
}

export interface WaConfig {
  id: string;
  empresa_id: string;
  instance_url: string;
  api_key: string;
  instance_name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  webhook_secret: string | null;
}

async function getEmpresaId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('usuarios').select('empresa_id').eq('user_id', user.id).single();
  return data?.empresa_id ?? null;
}

// --- Conversas ---

export function useWaConversas() {
  const qc = useQueryClient();

  const query = useQuery<WaConversa[]>({
    queryKey: ['wa_conversas'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('arquivada', false)
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as WaConversa[]) ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('wa_conversas_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) => {
          const prev = old ?? [];
          const exists = prev.some((c) => c.id === (payload.new as WaConversa).id);
          return exists ? prev : [payload.new as WaConversa, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
          (old ?? [])
            .map((c) => c.id === (payload.new as WaConversa).id ? payload.new as WaConversa : c)
            .sort((a, b) => {
              const ta = a.ultima_mensagem_at ?? a.created_at;
              const tb = b.ultima_mensagem_at ?? b.created_at;
              return tb.localeCompare(ta);
            })
        );
        qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

// --- Mensagens de uma conversa ---

export function useWaMensagens(conversaId: string | null) {
  const qc = useQueryClient();

  const query = useQuery<WaMensagem[]>({
    queryKey: ['wa_mensagens', conversaId],
    queryFn: async () => {
      if (!conversaId) return [];
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .select('*, usuario:usuarios(id, nome, avatar_url)')
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as any) ?? [];
    },
    enabled: !!conversaId,
  });

  useEffect(() => {
    if (!conversaId) return;
    const channel = supabase
      .channel(`wa_mensagens_realtime_${conversaId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_mensagens',
        filter: `conversa_id=eq.${conversaId}`,
      }, (payload) => {
        qc.setQueryData<WaMensagem[]>(['wa_mensagens', conversaId], (old) => {
          const prev = old ?? [];
          const newMsg = payload.new as WaMensagem;

          // Já existe pelo id real do banco
          if (prev.some((m) => m.id === newMsg.id)) return prev;

          // Mensagem de saída: substitui o otimista com mesmo conteúdo (se ainda existir)
          if (newMsg.direcao === 'saida') {
            const idx = prev.findIndex(
              (m) => m.id.startsWith('otimista-') && m.conteudo === newMsg.conteudo
            );
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = newMsg;
              return updated;
            }
            // Otimista já foi removido pelo onSuccess — a mensagem real está como wamid ou não existe ainda
            // Verifica pelo wamid para evitar duplicata
            if (newMsg.wamid && prev.some((m) => m.wamid === newMsg.wamid)) return prev;
          }

          return [...prev, newMsg];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversaId, qc]);

  return query;
}

// --- Upload de mídia para Storage ---

export async function uploadWaMedia(file: File, conversaId: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${conversaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(data.path);
  return publicUrl;
}

export type WaMidiaTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';

// --- Enviar mensagem (com update otimista) ---

export function useWaSendMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      telefone: string;
      mensagem: string;
      conversa_id?: string;
      tipo?: WaMidiaTipo;
      media_url?: string | null;
      media_mime?: string | null;
      nome_arquivo?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-send', {
        body: {
          telefone: params.telefone,
          mensagem: params.mensagem,
          conversa_id: params.conversa_id,
          tipo: params.tipo ?? 'texto',
          media_url: params.media_url ?? null,
          media_mime: params.media_mime ?? null,
          nome_arquivo: params.nome_arquivo ?? null,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },

    onMutate: async (vars) => {
      if (!vars.conversa_id) return;

      // Cancela refetch pendente para não sobrescrever o otimista
      await qc.cancelQueries({ queryKey: ['wa_mensagens', vars.conversa_id] });

      const msgOtimista: WaMensagem = {
        id: `otimista-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conversa_id: vars.conversa_id,
        empresa_id: '',
        direcao: 'saida',
        conteudo: vars.mensagem,
        tipo: vars.tipo ?? 'texto',
        media_url: vars.media_url ?? null,
        media_mime: vars.media_mime ?? null,
        wamid: null,
        status: 'enviando',
        usuario_id: null,
        lida: true,
        created_at: new Date().toISOString(),
      };

      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) => [
        ...(old ?? []),
        msgOtimista,
      ]);

      // Atualiza preview da conversa imediatamente
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) =>
          c.id === vars.conversa_id
            ? { ...c, ultima_mensagem: vars.mensagem, ultima_mensagem_at: new Date().toISOString() }
            : c
        )
      );

      return { msgOtimista };
    },

    onSuccess: (data, vars, context) => {
      if (!vars.conversa_id || !context?.msgOtimista) return;
      // Atualiza só o status — não muda o id, para o Realtime conseguir substituir o otimista
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) => {
        const stillOptimistic = (old ?? []).some(m => m.id === context.msgOtimista.id);
        if (!stillOptimistic) return old ?? []; // Realtime já substituiu, não faz nada
        return (old ?? []).map((m) =>
          m.id === context.msgOtimista.id ? { ...m, status: 'enviado' } : m
        );
      });
    },

    onError: (err: any, vars, context) => {
      // Remove mensagem otimista em caso de erro
      if (vars.conversa_id && context?.msgOtimista) {
        qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) =>
          (old ?? []).filter((m) => m.id !== context.msgOtimista.id)
        );
      }
      toast.error(err?.message ?? 'Erro ao enviar mensagem');
    },
  });
}

// --- Marcar conversa como lida ---

export function useWaMarcarLida() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      await supabase
        .from('whatsapp_mensagens')
        .update({ lida: true })
        .eq('conversa_id', conversaId)
        .eq('direcao', 'entrada');

      await supabase
        .from('whatsapp_conversas')
        .update({ nao_lidas: 0 })
        .eq('id', conversaId);
    },
    onSuccess: (_, conversaId) => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['wa_mensagens', conversaId] });
      qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
    },
  });
}

// --- Configuração uazapi ---

export function useWaConfig() {
  return useQuery<WaConfig | null>({
    queryKey: ['wa_config'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return null;
      const { data } = await supabase
        .from('configuracoes_wapi')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();
      return (data as WaConfig | null) ?? null;
    },
  });
}

export function useWaSaveConfig() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (config: Omit<WaConfig, 'id' | 'empresa_id' | 'status'>) => {
      const empresaId = await getEmpresaId();
      if (!empresaId) throw new Error('Empresa não encontrada');

      const { data: existing } = await supabase
        .from('configuracoes_wapi')
        .select('id')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('configuracoes_wapi')
          .update({ ...config, updated_at: new Date().toISOString() })
          .eq('empresa_id', empresaId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('configuracoes_wapi')
          .insert({ ...config, empresa_id: empresaId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
      toast.success('Configuração salva');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao salvar configuração');
    },
  });
}

// --- Contagem não lidas (para badge no sidebar) ---

export function useUnreadWaMessages() {
  const qc = useQueryClient();

  const query = useQuery<number>({
    queryKey: ['unread_wa_count'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return 0;
      const { data } = await supabase
        .from('whatsapp_conversas')
        .select('nao_lidas')
        .eq('empresa_id', empresaId)
        .eq('arquivada', false)
        .gt('nao_lidas', 0);
      return (data ?? []).reduce((sum, r) => sum + (r.nao_lidas ?? 0), 0);
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('wa_unread_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas' }, () => {
        qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

// --- Limpar conversa (apaga todas as mensagens) ---

export function useWaLimparConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { error } = await supabase
        .from('whatsapp_mensagens')
        .delete()
        .eq('conversa_id', conversaId);
      if (error) throw error;

      await supabase
        .from('whatsapp_conversas')
        .update({ ultima_mensagem: null, ultima_mensagem_at: null, nao_lidas: 0 })
        .eq('id', conversaId);
    },
    onSuccess: (_, conversaId) => {
      qc.setQueryData<WaMensagem[]>(['wa_mensagens', conversaId], []);
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao limpar conversa');
    },
  });
}

// --- Nova conversa (iniciar chat) ---

export function useWaNovaConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { telefone: string; nome_contato?: string; cliente_id?: string }) => {
      const empresaId = await getEmpresaId();
      if (!empresaId) throw new Error('Empresa não encontrada');

      const digits = params.telefone.replace(/\D/g, '');
      const telefone = digits.startsWith('55') ? digits : `55${digits}`;

      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .upsert(
          { empresa_id: empresaId, telefone, nome_contato: params.nome_contato ?? null, cliente_id: params.cliente_id ?? null },
          { onConflict: 'empresa_id,telefone' }
        )
        .select('*')
        .single();

      if (error) throw error;
      return data as WaConversa;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao iniciar conversa');
    },
  });
}
