import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ColunaCustomizada {
  id: string;
  empresa_id: string;
  tabela: string;
  nome: string;
  slug: string;
  tipo: string;
  ordem: number;
  created_at: string;
  updated_at: string;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `col_${Date.now()}`;
}

export function useColunasCustomizadas(tabela: string) {
  return useQuery<ColunaCustomizada[]>({
    queryKey: ['colunas_customizadas', tabela],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('colunas_customizadas')
        .select('*')
        .eq('tabela', tabela)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ColunaCustomizada[];
    },
  });
}

export function useCreateColunaCustomizada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tabela: string; nome: string; tipo?: string }) => {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('colunas_customizadas')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id)
        .eq('tabela', input.tabela);

      let baseSlug = slugify(input.nome);
      const slugs = new Set((existentes ?? []).map(e => e.slug));
      let slug = baseSlug;
      let i = 2;
      while (slugs.has(slug)) {
        slug = `${baseSlug}_${i++}`;
      }
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { error } = await supabase.from('colunas_customizadas').insert({
        empresa_id: usuario.empresa_id,
        tabela: input.tabela,
        slug,
        nome: input.nome.trim(),
        tipo: input.tipo || 'text',
        ordem: maxOrdem + 1,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['colunas_customizadas', variables.tabela] });
      toast.success('Coluna criada');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar coluna'),
  });
}

export function useDeleteColunaCustomizada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; tabela: string }) => {
      const { error } = await supabase.from('colunas_customizadas').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['colunas_customizadas', variables.tabela] });
      toast.success('Coluna excluída');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao excluir coluna'),
  });
}
