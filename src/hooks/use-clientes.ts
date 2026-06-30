import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

async function fetchAllClientes() {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const query = supabase
      .from('clientes')
      .select('*, obras(*)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;
    allData = allData.concat(data ?? []);
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

export function useClientes() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return useQuery({
    queryKey: ['clientes', profile?.id, profile?.role],
    queryFn: async () => {
      if (isAdmin) return [];
      return fetchAllClientes();
    },
  });
}

async function fetchAllContatos() {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const query = supabase
      .from('contatos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;
    allData = allData.concat(data ?? []);
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

export function useContatos() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return useQuery({
    queryKey: ['contatos', profile?.id, profile?.role],
    queryFn: async () => {
      if (isAdmin) return [];
      return fetchAllContatos();
    },
  });
}

export function useFabricantes() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return useQuery({
    queryKey: ['fabricantes', profile?.id, profile?.role],
    queryFn: async () => {
      if (isAdmin) return [];
      
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
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*, avatar_url')
        .is('deleted_at', null)
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useVendedoresRemovidos() {
  return useQuery({
    queryKey: ['usuarios_removidos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*, avatar_url')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
