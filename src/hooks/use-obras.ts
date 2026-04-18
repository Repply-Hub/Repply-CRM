import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useObras() {
  return useQuery({
    queryKey: ['obras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obras')
        .select('*, latitude, longitude, geocoded_at, clientes(empresa, tipo)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
