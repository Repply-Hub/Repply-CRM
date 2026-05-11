import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useObras() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return useQuery({
    queryKey: ['obras', profile?.id, profile?.role],
    queryFn: async () => {
      // Se for admin, não deve ver os dados das obras
      if (isAdmin) {
        return [];
      }

      const { data, error } = await supabase
        .from('obras')
        .select('*, latitude, longitude, geocoded_at, clientes(empresa, tipo)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
