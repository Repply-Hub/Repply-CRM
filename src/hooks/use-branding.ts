import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

export function useBranding() {
  const { user } = useAuth();

  const { data: usuario } = useQuery({
    queryKey: ['usuario-empresa', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: branding } = useQuery({
    queryKey: ['branding', usuario?.empresa_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('nome, nome_fantasia, logo_url, cor_primaria, subtitulo_header')
        .eq('id', usuario!.empresa_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!usuario?.empresa_id,
  });

  return {
    nome: branding?.nome_fantasia || branding?.nome || 'MD Representações',
    logo: branding?.logo_url,
    cor: branding?.cor_primaria || '#0f172a',
    subtitulo: branding?.subtitulo_header || 'Gestão Comercial',
  };
}
