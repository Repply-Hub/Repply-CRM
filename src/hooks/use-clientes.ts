import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*, obras(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useFabricantes() {
  return useQuery({
    queryKey: ['fabricantes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabricantes')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useVendedores() {
  return useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}
