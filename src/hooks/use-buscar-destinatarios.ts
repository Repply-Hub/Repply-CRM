import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SugestaoDestinatario {
  nome: string | null;
  email: string;
  /** 'equipe' | 'cliente' | 'recente'. */
  origem: string;
}

/**
 * Sugestões de destinatário para o autocompletar do compositor: equipe →
 * clientes → recentes, escopadas por empresa, via a RPC
 * `email_buscar_destinatarios` (SECURITY DEFINER). Debounce ~200ms e só busca a
 * partir de 2 caracteres — para não bater no banco a cada tecla nem sugerir com
 * um termo curto demais.
 */
export function useBuscarDestinatarios(termo: string) {
  const [termoDeb, setTermoDeb] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTermoDeb(termo.trim()), 200);
    return () => clearTimeout(t);
  }, [termo]);

  const habilitado = termoDeb.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ['buscar_destinatarios', termoDeb],
    queryFn: async (): Promise<SugestaoDestinatario[]> => {
      const { data, error } = await supabase.rpc('email_buscar_destinatarios', {
        p_termo: termoDeb,
        p_limite: 8,
      });
      if (error) throw error;
      return (data ?? []) as SugestaoDestinatario[];
    },
    enabled: habilitado,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    sugestoes: habilitado ? (data ?? []) : [],
    carregando: habilitado && isFetching,
  };
}
