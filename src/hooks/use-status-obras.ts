import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StatusObra {
  id: string;
  empresa_id: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  is_sistema: boolean;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `status_${Date.now()}`;
}

export function useStatusObras() {
  return useQuery<StatusObra[]>({
    queryKey: ['status_obras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('status_obras')
        .select('*')
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatusObra[];
    },
  });
}

export function useCreateStatusObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor: string }) => {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('status_obras')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id);

      let baseSlug = slugify(input.nome);
      const slugs = new Set((existentes ?? []).map(e => e.slug));
      let slug = baseSlug;
      let i = 2;
      while (slugs.has(slug)) {
        slug = `${baseSlug}_${i++}`;
      }
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { error } = await supabase.from('status_obras').insert({
        empresa_id: usuario.empresa_id,
        slug,
        nome: input.nome.trim(),
        cor: input.cor,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status_obras'] });
      toast.success('Status criado');
    },
  });
}

export function useUpdateStatusObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; cor?: string }) => {
      const patch: Record<string, unknown> = {};
      if (input.nome !== undefined) patch.nome = input.nome.trim();
      if (input.cor !== undefined) patch.cor = input.cor;
      const { error } = await supabase.from('status_obras').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status_obras'] });
      toast.success('Status atualizado');
    },
  });
}

export function useDeleteStatusObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; slug: string; targetSlug: string }) => {
      const { error: pErr } = await supabase
        .from('obras')
        .update({ status: input.targetSlug })
        .eq('status', input.slug);
      if (pErr) throw pErr;
      const { error } = await supabase.from('status_obras').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status_obras'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
      toast.success('Status excluído');
    },
  });
}
