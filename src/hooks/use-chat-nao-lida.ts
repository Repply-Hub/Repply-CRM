import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const CHAVE = ['chat_marcados_nao_lidos'];

/** As conversas que EU marquei como não lidas (chaves de chaveDoAlvo). */
export function useChatMarcadosNaoLidos() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const meuId = profile?.id;

  const query = useQuery({
    queryKey: [...CHAVE, meuId],
    queryFn: async (): Promise<Set<string>> => {
      // Filtra pela própria pessoa mesmo tendo a RLS: a política de SELECT libera is_admin(),
      // então um super-admin veria as marcas de todo mundo (bolinhas fantasmas) sem este .eq.
      const { data, error } = await supabase
        .from('chat_conversa_nao_lida')
        .select('alvo')
        .eq('usuario_id', meuId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.alvo as string));
    },
    enabled: !!meuId,
  });

  // Marcar/limpar num aparelho reflete no outro (a tabela está no supabase_realtime).
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat-marca-rt-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversa_nao_lida' }, () => {
        qc.invalidateQueries({ queryKey: CHAVE });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, user?.id]);

  return query;
}

async function meuUsuario() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: me } = await supabase.from('usuarios').select('id, empresa_id').eq('user_id', userData.user.id).single();
  return me ?? null;
}

export function useMarcarConversaNaoLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alvo: string) => {
      const me = await meuUsuario();
      if (!me) return;
      const { error } = await supabase
        .from('chat_conversa_nao_lida')
        .upsert({ usuario_id: me.id, empresa_id: me.empresa_id, alvo }, { onConflict: 'usuario_id,alvo', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useDesmarcarConversaNaoLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alvo: string) => {
      const me = await meuUsuario();
      if (!me) return;
      // count===0 aqui NÃO é recusa: abrir uma conversa que não estava marcada limpa "nada",
      // e isso é o normal. A regra de §4.6 vale para exclusão pedida pela pessoa, não para
      // esta limpeza automática. Por isso não lançamos erro em count 0.
      const { error } = await supabase
        .from('chat_conversa_nao_lida')
        .delete()
        .eq('usuario_id', me.id)
        .eq('alvo', alvo);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
