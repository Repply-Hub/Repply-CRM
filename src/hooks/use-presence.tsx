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

    // Aba em segundo plano sofre throttling do navegador no timer de heartbeat do
    // Realtime (25s), o socket cai sem disparar nenhum evento visível e o presence
    // trava marcando o usuário como offline até alguém reabrir a tela. Ao voltar o
    // foco, se o canal não estiver mais "joined" força um novo track() em vez de
    // esperar a reconexão espontânea da lib, que pode demorar vários ciclos de backoff.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (channel.state === 'joined') return;
      channel.track({ usuario_id: myId, online_at: new Date().toISOString() });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
