import { useEffect, useRef, createElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

// WhatsApp/uazapi às vezes usa o JID de celulares BR sem o 9º dígito (número antigo).
// Normaliza para o formato canônico (55 + DDD + 9 + número), igual ao whatsapp-webhook,
// para casar com conversas já existentes do mesmo contato e evitar duplicidade.
function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
}

export interface WaResponsavel {
  id: string;
  nome: string;
  avatar_url: string | null;
}

export interface WaConversa {
  id: string;
  empresa_id: string;
  telefone: string;
  nome_contato: string | null;
  cliente_id: string | null;
  contato_id: string | null;
  foto_perfil_url: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  nao_lidas: number;
  arquivada: boolean;
  is_group: boolean;
  participantes: { nome: string | null; telefone: string }[];
  created_at: string;
  updated_at: string;
  instancia_id: string | null;
  responsaveis?: WaResponsavel[];
}

function compareConversas(a: WaConversa, b: WaConversa): number {
  const ta = a.ultima_mensagem_at ?? a.created_at;
  const tb = b.ultima_mensagem_at ?? b.created_at;
  return tb.localeCompare(ta);
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
  // Preenchido só em mensagens de entrada vindas de grupo — quem enviou dentro do grupo
  // (o nome/telefone da conversa em si é o do grupo, não de um participante específico).
  remetente_nome?: string | null;
  remetente_telefone?: string | null;
  // Snapshot da mensagem citada (reply) — guardado por valor em vez de referenciar o
  // id da mensagem original, para a citação sobreviver mesmo se a original for apagada.
  quoted_wamid?: string | null;
  quoted_conteudo?: string | null;
  quoted_tipo?: string | null;
  quoted_remetente_nome?: string | null;
  usuario?: {
    id: string;
    nome: string;
    avatar_url: string | null;
    email: string | null;
    role: string | null;
    telefone: string | null;
  } | null;
}

export interface WaConfig {
  id: string;
  empresa_id: string;
  instance_url: string;
  api_key: string;
  instance_name: string;
  apelido: string | null;
  status: 'connected' | 'disconnected' | 'connecting';
  webhook_secret: string | null;
  provisionada: boolean;
}

export interface WaInstanciaOption {
  id: string;
  instance_name: string;
  apelido: string | null;
}

async function getEmpresaId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('usuarios').select('empresa_id').eq('user_id', user.id).single();
  return data?.empresa_id ?? null;
}

async function getUsuarioId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
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
        .select('*, responsaveis:whatsapp_conversa_responsaveis(usuario:usuarios(id, nome, avatar_url))')
        .eq('empresa_id', empresaId);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map(c => ({
          ...c,
          responsaveis: (c.responsaveis ?? []).map((r: any) => r.usuario).filter(Boolean),
        }) as WaConversa)
        .sort(compareConversas);
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`wa-conversas-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) => {
          const prev = old ?? [];
          const exists = prev.some((c) => c.id === (payload.new as WaConversa).id);
          return exists ? prev : [...prev, payload.new as WaConversa].sort(compareConversas);
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        const updated = payload.new as WaConversa;

        qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
          (old ?? [])
            // O payload do realtime só traz as colunas da própria tabela — sem o
            // join de responsaveis — então preserva o que já estava no cache para
            // não sumir com a conversa dos filtros "Meu"/"Geral".
            .map((c) => c.id === updated.id ? { ...updated, responsaveis: c.responsaveis } : c)
            .sort(compareConversas)
        );
        qc.invalidateQueries({ queryKey: ['unread_wa_count'] });
      })
      .subscribe((status, err) => {
        if (err) console.error('[wa_conversas] falha na subscription realtime:', status, err);
      });
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

// --- Instâncias WhatsApp da empresa (para o filtro "Instância" na caixa de entrada) ---

export function useWaInstancias() {
  return useQuery<WaInstanciaOption[]>({
    queryKey: ['wa_instancias'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from('configuracoes_wapi')
        .select('id, instance_name, apelido')
        .eq('empresa_id', empresaId)
        .eq('provisionada', true)
        .order('instance_name');
      if (error) throw error;
      return data ?? [];
    },
  });
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
        .select('*, usuario:usuarios(id, nome, avatar_url, email, role, telefone)')
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
      .channel(`wa-msgs-rt-${conversaId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      telefone: string;
      mensagem: string;
      conversa_id?: string;
      tipo?: WaMidiaTipo;
      media_url?: string | null;
      media_mime?: string | null;
      nome_arquivo?: string;
      ptt?: boolean;
      quoted_wamid?: string | null;
      quoted_conteudo?: string | null;
      quoted_tipo?: string | null;
      quoted_remetente_nome?: string | null;
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
          ptt: params.ptt ?? false,
          quoted_wamid: params.quoted_wamid ?? null,
          quoted_conteudo: params.quoted_conteudo ?? null,
          quoted_tipo: params.quoted_tipo ?? null,
          quoted_remetente_nome: params.quoted_remetente_nome ?? null,
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
        quoted_wamid: vars.quoted_wamid ?? null,
        quoted_conteudo: vars.quoted_conteudo ?? null,
        quoted_tipo: vars.quoted_tipo ?? null,
        quoted_remetente_nome: vars.quoted_remetente_nome ?? null,
      };

      qc.setQueryData<WaMensagem[]>(['wa_mensagens', vars.conversa_id], (old) => [
        ...(old ?? []),
        msgOtimista,
      ]);

      // Atualiza preview da conversa imediatamente — e garante que quem enviou a
      // mensagem apareça em "Meus chats" sem esperar o refetch (o servidor também
      // grava isso em whatsapp_conversa_responsaveis, isso aqui é só otimista).
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => {
          if (c.id !== vars.conversa_id) return c;
          const jaResponsavel = profile?.id && c.responsaveis?.some((r) => r.id === profile.id);
          const responsaveis = profile?.id && !jaResponsavel
            ? [...(c.responsaveis ?? []), { id: profile.id, nome: profile.nome, avatar_url: profile.avatar_url ?? null }]
            : c.responsaveis;
          return { ...c, ultima_mensagem: vars.mensagem, ultima_mensagem_at: new Date().toISOString(), responsaveis };
        })
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
      const usuarioId = await getUsuarioId();
      if (!usuarioId) return null;
      const { data } = await supabase
        .from('wapi_instancia_usuarios')
        .select('instancia:configuracoes_wapi(*)')
        .eq('usuario_auth_id', usuarioId)
        .limit(1)
        .maybeSingle();
      return (data?.instancia as WaConfig | null) ?? null;
    },
  });
}

// --- Provisionar instância (cria instância uazapi para o usuário atual) ---

export function useWaProvision() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-provision', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data as { success: boolean; instanceName: string; alreadyProvisioned?: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao ativar WhatsApp');
    },
  });

  return { provision: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error };
}

// --- Contagem não lidas (para badge no sidebar) ---

export function useUnreadWaMessages() {
  const qc = useQueryClient();
  // Guarda o último nao_lidas conhecido por conversa para detectar incrementos
  // (chegada de mensagem nova) mesmo com a tela de WhatsApp fechada.
  const prevNaoLidasRef = useRef<Record<string, number>>({});

  const query = useQuery<number>({
    queryKey: ['unread_wa_count'],
    queryFn: async () => {
      const empresaId = await getEmpresaId();
      if (!empresaId) return 0;
      const { data } = await supabase
        .from('whatsapp_conversas')
        .select('id, nao_lidas')
        .eq('empresa_id', empresaId)
        .eq('arquivada', false)
        .gt('nao_lidas', 0);
      (data ?? []).forEach((r) => {
        prevNaoLidasRef.current[r.id] = r.nao_lidas ?? 0;
      });
      return (data ?? []).reduce((sum, r) => sum + (r.nao_lidas ?? 0), 0);
    },
  });

  // Assinatura global (sempre montada via AppSidebar) para garantir que o toast
  // dispare mesmo se o usuário não estiver com a tela de WhatsApp aberta no momento.
  useEffect(() => {
    const channel = supabase
      .channel(`wa-unread-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['unread_wa_count'] });

        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const row = payload.new as WaConversa;
          const prevCount = prevNaoLidasRef.current[row.id] ?? 0;
          const currentCount = row.nao_lidas ?? 0;

          if (currentCount > prevCount) {
            const nomeConversa = row.nome_contato || row.telefone;
            toast(createElement('span', null, createElement('b', null, nomeConversa), ' enviou uma mensagem'), {
              description: row.ultima_mensagem?.slice(0, 120) || 'Nova mensagem',
              style: { background: '#f97316', color: '#fff', border: 'none' },
              descriptionClassName: '!text-white/90',
            });
          }

          prevNaoLidasRef.current[row.id] = currentCount;
        }
      })
      .subscribe((status, err) => {
        if (err) console.error('[unread_wa_count] falha na subscription realtime:', status, err);
      });
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

// --- Deletar conversa (apaga mensagens + registro da conversa) ---

export function useWaDeletarConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { error: errMsgs } = await supabase
        .from('whatsapp_mensagens')
        .delete()
        .eq('conversa_id', conversaId);
      if (errMsgs) throw errMsgs;

      const { error } = await supabase
        .from('whatsapp_conversas')
        .delete()
        .eq('id', conversaId);
      if (error) throw error;
    },
    onSuccess: (_, conversaId) => {
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).filter((c) => c.id !== conversaId)
      );
      qc.removeQueries({ queryKey: ['wa_mensagens', conversaId] });
      toast.success('Conversa deletada');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao deletar conversa');
    },
  });
}

// --- Deletar múltiplas conversas em massa ---

export function useWaDeletarConversasEmMassa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error: errMsgs } = await supabase
        .from('whatsapp_mensagens')
        .delete()
        .in('conversa_id', ids);
      if (errMsgs) throw errMsgs;

      const { error } = await supabase
        .from('whatsapp_conversas')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => {
      if (!ids) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).filter((c) => !ids.includes(c.id))
      );
      ids.forEach((id) => qc.removeQueries({ queryKey: ['wa_mensagens', id] }));
      toast.success(`${ids.length} conversa${ids.length > 1 ? 's' : ''} deletada${ids.length > 1 ? 's' : ''}`);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao deletar conversas');
    },
  });
}

// --- Definir responsáveis de uma conversa ---

export function useWaSetResponsaveis() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversaId, usuarioIds }: { conversaId: string; usuarioIds: string[] }) => {
      // Faz diff em vez de apagar tudo e reinserir: um usuário não-admin só continua
      // com permissão para editar essa conversa (RLS) enquanto ele mesmo seguir como
      // responsável, então remover-e-recriar em massa derrubaria a própria permissão
      // no meio da operação sempre que ele não estivesse se auto-removendo.
      const { data: existentes, error: fetchErr } = await supabase
        .from('whatsapp_conversa_responsaveis')
        .select('usuario_id')
        .eq('conversa_id', conversaId);
      if (fetchErr) throw fetchErr;

      const existentesIds = new Set((existentes ?? []).map(r => r.usuario_id));
      const novosIds = new Set(usuarioIds);
      const paraRemover = [...existentesIds].filter(id => !novosIds.has(id));
      const paraAdicionar = [...novosIds].filter(id => !existentesIds.has(id));

      if (paraRemover.length > 0) {
        const { error: delErr } = await supabase
          .from('whatsapp_conversa_responsaveis')
          .delete()
          .eq('conversa_id', conversaId)
          .in('usuario_id', paraRemover);
        if (delErr) throw delErr;
      }

      if (paraAdicionar.length > 0) {
        const { error: insErr } = await supabase
          .from('whatsapp_conversa_responsaveis')
          .insert(paraAdicionar.map(uid => ({ conversa_id: conversaId, usuario_id: uid })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar responsáveis');
    },
  });
}

// --- Arquivar / reabrir conversa ---

export function useWaArquivarConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { conversaId: string; arquivada: boolean }) => {
      const { error } = await supabase
        .from('whatsapp_conversas')
        .update({ arquivada: params.arquivada })
        .eq('id', params.conversaId);
      if (error) throw error;
      return params;
    },
    onSuccess: ({ conversaId, arquivada }) => {
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId ? { ...c, arquivada } : c)
      );
      toast.success(arquivada ? 'Conversa marcada como fechada' : 'Conversa reaberta');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar conversa');
    },
  });
}

// --- Foto de perfil do contato ---

export function useWaFetchContactPhoto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-contact-photo', {
        body: { conversa_id: conversaId },
      });
      if (error) throw error;
      return { conversaId, fotoPerfilUrl: data?.foto_perfil_url as string | null };
    },
    onSuccess: ({ conversaId, fotoPerfilUrl }) => {
      if (!fotoPerfilUrl) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId ? { ...c, foto_perfil_url: fotoPerfilUrl } : c)
      );
    },
  });
}

// --- Participantes de grupo (backfill para grupos criados antes do rastreio, ou
// fora do CRM, cuja uazapi só devolve a lista completa via /group/list) ---

export function useWaFetchGroupParticipantes() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversaId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-group-participants', {
        body: { conversa_id: conversaId },
      });
      if (error) throw error;
      return { conversaId, participantes: (data?.participantes ?? []) as { nome: string | null; telefone: string }[] };
    },
    onSuccess: ({ conversaId, participantes }) => {
      if (participantes.length === 0) return;
      qc.setQueryData<WaConversa[]>(['wa_conversas'], (old) =>
        (old ?? []).map((c) => c.id === conversaId ? { ...c, participantes } : c)
      );
    },
  });
}

// --- Foto de perfil por número (participantes de grupo, cacheada no back-end por
// telefone em vez de por conversa) ---

export function useWaParticipantePhoto(telefone: string | null | undefined) {
  return useQuery({
    queryKey: ['wa_participante_foto', telefone],
    enabled: !!telefone,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('whatsapp-participant-photo', {
        body: { telefone },
      });
      if (error) throw error;
      return (data?.foto_perfil_url ?? null) as string | null;
    },
  });
}

// --- Conectar instância via QR code ---

export function useWaConnect() {
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      // Body is empty — instance is identified by the `token` header alone
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: config.api_key },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Erro ${res.status}: ${text}`);
      let data: Record<string, any> = {};
      try { data = JSON.parse(text); } catch { /* ok */ }

      // uazapi returns QR in data.instance.qrcode (base64 PNG). Normaliza string
      // vazia ("") para null — a uazapi retorna qrcode: "" quando não há QR a
      // gerar (ex.: instância já conectada), e "??" não trata "" como nulo.
      const rawQr: string | null =
        data?.instance?.qrcode ??
        data?.qrcode?.base64 ??
        (typeof data?.qrcode === 'string' ? data.qrcode : null) ??
        data?.base64 ??
        null;
      const qr = rawQr && rawQr.length > 0 ? rawQr : null;

      // Detecta "já conectado" para diferenciar de uma falha real ao gerar QR
      const alreadyConnected: boolean =
        data?.connected === true ||
        data?.status?.connected === true ||
        data?.status?.loggedIn === true ||
        data?.instance?.status === 'connected' ||
        (typeof data?.response === 'string' && data.response.toLowerCase().includes('already connected'));

      if (!qr) {
        // Loga a resposta completa da uazapi sempre que não há QR, para
        // diagnosticar formatos de payload não previstos no parsing acima.
        console.log('[useWaConnect] sem QR na resposta da uazapi', {
          instanceName: config.instance_name, alreadyConnected, response: data,
        });
      }

      return { qr, alreadyConnected, data };
    },
  });
}

export function useWaSyncStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      // GET /instance/status — instance identified by token header
      const res = await fetch(`${baseUrl}/instance/status`, {
        method: 'GET',
        headers: { token: config.api_key },
      });
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
      const data = await res.json();
      // Response: { status: { connected: bool, loggedIn: bool } }
      const isConnected: boolean =
        (data?.status?.connected === true && data?.status?.loggedIn === true) ||
        data?.connected === true;
      const dbStatus: WaConfig['status'] = isConnected ? 'connected' : 'disconnected';
      await supabase
        .from('configuracoes_wapi')
        .update({ status: dbStatus })
        .eq('id', config.id);
      return { isConnected, dbStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
    },
  });
}

// --- Desconectar instância ---

export function useWaDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/instance/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: config.api_key },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Erro ${res.status}: ${text}`);
      await supabase
        .from('configuracoes_wapi')
        .update({ status: 'disconnected' })
        .eq('id', config.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
      toast.success('WhatsApp desconectado');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao desconectar');
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

      const telefone = normalizeWhatsappPhone(params.telefone);

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

// --- Criar grupo ---

export function useWaCriarGrupo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { nome: string; participantes: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-group-create', {
        body: { nome: params.nome, participantes: params.participantes },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data.conversa as WaConversa;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao criar grupo');
    },
  });
}
