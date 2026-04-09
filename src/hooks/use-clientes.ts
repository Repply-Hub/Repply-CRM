import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function fetchAllClientes() {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*, obras(*)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allData = allData.concat(data ?? []);
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

export function useClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: fetchAllClientes,
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
