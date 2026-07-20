import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const PRESENCE_CHANNEL = 'chat-presence';

/**
 * Rastreia quais usuarios.id estão realmente conectados ao chat via
 * Supabase Realtime Presence. Cada aba/cliente faz `track()` no canal
 * enquanto estiver montado; ao desmontar/fechar a aba o Realtime remove
 * a presença automaticamente (untrack/timeout), então o Set reflete
 * conexões ativas, não uma flag estática no banco.
 */
export function useOnlineUsers(): Set<string> {
  const { profile } = useAuth();
  const myId: string | null = profile?.id ?? null;
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!myId) return;

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: myId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ usuario_id: myId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId]);

  return onlineIds;
}
