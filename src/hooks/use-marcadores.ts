import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Marcador {
  id: string;
  empresa_id: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || `marcador ${Date.now()}`;
}

export function useMarcadores(empresaId?: string | null) {
  return useQuery<Marcador[]>({
    queryKey: ['marcadores', empresaId ?? null],
    queryFn: async () => {
      let query = supabase.from('marcadores').select('*').order('ordem', { ascending: true });
      if (empresaId) query = query.eq('empresa_id', empresaId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Marcador[];
    },
    enabled: !!empresaId,
  });
}

export function useCreateMarcador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor: string }) => {
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('marcadores')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id);

      let baseSlug = slugify(input.nome);
      const slugs = new Set((existentes ?? []).map(e => e.slug));
      let slug = baseSlug;
      let i = 2;
      while (slugs.has(slug)) {
        slug = `${baseSlug} ${i++}`;
      }
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { data, error } = await supabase.from('marcadores').insert({
        empresa_id: usuario.empresa_id,
        slug,
        nome: input.nome.trim(),
        cor: input.cor,
        ordem: maxOrdem + 1,
        is_sistema: false,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores'] });
      toast.success('Marcador criado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar marcador'),
  });
}

export function useUpdateMarcador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; cor?: string }) => {
      const patch: Record<string, unknown> = {};
      if (input.nome !== undefined) patch.nome = input.nome.trim();
      if (input.cor !== undefined) patch.cor = input.cor;
      const { error } = await supabase.from('marcadores').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores'] });
      toast.success('Marcador atualizado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao atualizar marcador'),
  });
}

export function useDeleteMarcador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; targetId?: string | null }) => {
      // Marcador é opcional em pedidos — negócios com este marcador ficam sem marcador
      // (ou são realocados para targetId, se informado), diferente do status do Kanban
      // que exige realocação obrigatória.
      const { error: pErr } = await supabase
        .from('pedidos')
        .update({ marcador_id: input.targetId ?? null })
        .eq('marcador_id', input.id);
      if (pErr) throw pErr;
      const { error } = await supabase.from('marcadores').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcadores'] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success('Marcador excluído');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao excluir marcador'),
  });
}

export function useReorderMarcadores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('marcadores').update({ ordem: idx }).eq('id', id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marcadores'] }),
    onError: (err: any) => toast.error(err?.message || 'Erro ao reordenar'),
  });
}
