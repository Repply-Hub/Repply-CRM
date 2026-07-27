import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MODULOS } from '@/hooks/use-permissoes';

export interface PresetModuloPermissoes {
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
  funcionalidades: Record<string, boolean>;
}

export interface PermissaoPreset {
  id: string;
  empresa_id: string;
  origem: 'padrao' | 'customizado';
  preset_key: string;
  nome: string;
  descricao: string | null;
  permissoes: Record<string, PresetModuloPermissoes>;
  created_by: string | null;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `preset_${Date.now()}`;
}

function normalizePreset(row: any): PermissaoPreset {
  return {
    ...row,
    permissoes: (typeof row.permissoes === 'object' && row.permissoes !== null ? row.permissoes : {}) as Record<string, PresetModuloPermissoes>,
  };
}

export function usePermissaoPresets(empresaId?: string | null) {
  return useQuery<PermissaoPreset[]>({
    queryKey: ['permissao_presets', empresaId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissao_presets')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('origem', { ascending: false })
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(normalizePreset);
    },
    enabled: !!empresaId,
  });
}

export function useUpdatePermissaoPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; descricao?: string | null; permissoes?: Record<string, PresetModuloPermissoes> }) => {
      const { id, ...updates } = input;
      const { error } = await supabase.from('permissao_presets').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissao_presets'] });
      toast.success('Preset atualizado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao atualizar preset'),
  });
}

export function useCreatePermissaoPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; descricao?: string; permissoes?: Record<string, PresetModuloPermissoes> }) => {
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('permissao_presets')
        .select('preset_key')
        .eq('empresa_id', usuario.empresa_id);

      const baseSlug = slugify(input.nome);
      const keys = new Set((existentes ?? []).map(e => e.preset_key));
      let presetKey = baseSlug;
      let i = 2;
      while (keys.has(presetKey)) {
        presetKey = `${baseSlug}_${i++}`;
      }

      const permissoesIniciais = input.permissoes ?? MODULOS.reduce((acc, mod) => {
        acc[mod.key] = { pode_ver: false, pode_criar: false, pode_editar: false, pode_excluir: false, funcionalidades: {} };
        return acc;
      }, {} as Record<string, PresetModuloPermissoes>);

      const { data, error } = await supabase.from('permissao_presets').insert({
        empresa_id: usuario.empresa_id,
        origem: 'customizado',
        preset_key: presetKey,
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() || null,
        permissoes: permissoesIniciais as any,
        created_by: usuario.id,
      }).select('*').single();
      if (error) throw error;
      return normalizePreset(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissao_presets'] });
      toast.success('Preset criado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar preset'),
  });
}

export function useDeletePermissaoPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('permissao_presets')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Apenas quem criou o preset pode removê-lo');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissao_presets'] });
      toast.success('Preset removido');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao remover preset'),
  });
}

export function useApplyPermissaoPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { usuarioId: string; preset: PermissaoPreset; adminId: string }) => {
      const rows = MODULOS.map(mod => {
        const p = input.preset.permissoes[mod.key];
        return {
          usuario_id: input.usuarioId,
          modulo: mod.key,
          pode_ver: p?.pode_ver ?? false,
          pode_criar: p?.pode_criar ?? false,
          pode_editar: p?.pode_editar ?? false,
          pode_excluir: p?.pode_excluir ?? false,
          funcionalidades: p?.funcionalidades ?? {},
        };
      });
      const { error } = await supabase.from('permissoes_usuario').upsert(rows as any[], { onConflict: 'usuario_id,modulo' });
      if (error) throw error;
      await supabase.from('audit_permissoes').insert({
        admin_id: input.adminId,
        usuario_id: input.usuarioId,
        acao: `Aplicou preset: ${input.preset.nome}`,
        detalhes: { preset: input.preset.preset_key } as any,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['permissoes_usuario', vars.usuarioId] });
      toast.success(`Preset "${vars.preset.nome}" aplicado!`);
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao aplicar preset'),
  });
}
