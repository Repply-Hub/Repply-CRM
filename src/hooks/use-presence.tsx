import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const OnlineUsersContext = createContext<Set<string>>(new Set());

/**
 * Rastreia quais usuarios.id estão realmente conectados via Supabase Realtime
 * Presence. Fica montado no nível persistente do app (App.tsx, fora das
 * <Routes>), não dentro da tela de Chat — porque o rastreio só existe
 * enquanto o componente estiver montado, e a maior parte do tempo logado é
 * gasta em outras telas (Negócios, Clientes, Obras...). Antes, com o
 * rastreio dentro do Chat, quem estava em qualquer outra tela não contava
 * como online — por isso o marcador ficava instável e "esquecia" gente.
 *
 * O canal é isolado por empresa (`empresa_id`) para não misturar a presença
 * de empresas diferentes no mesmo canal Realtime — cada uma é um inquilino
 * isolado do SaaS.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const myId: string | null = profile?.id ?? null;
  const empresaId: string | null = profile?.empresa_id ?? null;
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!myId || !empresaId) {
      setOnlineIds(new Set());
      return;
    }

    const channel = supabase.channel(`chat-presence:${empresaId}`, {
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
  }, [myId, empresaId]);

  return (
    <OnlineUsersContext.Provider value={onlineIds}>
      {children}
    </OnlineUsersContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook fica junto do provider, mesmo padrão de use-theme.tsx
export function useOnlineUsers(): Set<string> {
  return useContext(OnlineUsersContext);
}
