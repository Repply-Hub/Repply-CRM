import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EntidadeCampos = 'pedidos' | 'clientes' | 'contatos' | 'obras';

export interface ConfiguracaoCampo {
  id: string;
  empresa_id: string;
  entidade: EntidadeCampos;
  origem: 'padrao' | 'customizado';
  campo_key: string;
  label: string | null;
  tipo: string;
  obrigatorio: boolean;
  ordem: number;
  etapa: string | null;
  created_by: string | null;
}

// Fallback de rótulo só para as linhas padrão "originais" (label NULL no banco).
// Linhas padrão adicionadas depois já trazem o label preenchido diretamente na
// migration, para evitar colisão de campo_key entre entidades (ex.: "status"
// significa coisas diferentes em pedidos e em obras).
export const FIELD_LABELS: Record<string, string> = {
  obra_id: 'Obra vinculada',
  origem_lead: 'Origem do lead',
  endereco_entrega: 'Endereço de entrega',
  prazo_resposta: 'Prazo de resposta',
  observacoes: 'Observações',
  razao_social: 'Razão social',
  email: 'E-mail',
  telefone: 'Telefone',
  endereco: 'Endereço',
  cargo: 'Cargo',
};

export function resolveFieldLabel(campo: Pick<ConfiguracaoCampo, 'campo_key' | 'label'>): string {
  return campo.label ?? FIELD_LABELS[campo.campo_key] ?? campo.campo_key;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `campo_${Date.now()}`;
}

export function useConfiguracoesCampos(entidade: EntidadeCampos, empresaId?: string | null) {
  return useQuery<ConfiguracaoCampo[]>({
    queryKey: ['configuracoes_campos', empresaId ?? null, entidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes_campos')
        .select('*')
        .eq('empresa_id', empresaId!)
        .eq('entidade', entidade)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConfiguracaoCampo[];
    },
    enabled: !!empresaId,
  });
}

export function useToggleObrigatorioCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; obrigatorio: boolean }) => {
      const { error } = await supabase
        .from('configuracoes_campos')
        .update({ obrigatorio: input.obrigatorio })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes_campos'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao atualizar campo'),
  });
}

export function useCreateCampoCustomizado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entidade: EntidadeCampos; label: string; obrigatorio: boolean }) => {
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('id, empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('configuracoes_campos')
        .select('campo_key, ordem')
        .eq('empresa_id', usuario.empresa_id)
        .eq('entidade', input.entidade);

      const baseSlug = slugify(input.label);
      const keys = new Set((existentes ?? []).map(e => e.campo_key));
      let campoKey = baseSlug;
      let i = 2;
      while (keys.has(campoKey)) {
        campoKey = `${baseSlug}_${i++}`;
      }
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { error } = await supabase.from('configuracoes_campos').insert({
        empresa_id: usuario.empresa_id,
        entidade: input.entidade,
        origem: 'customizado',
        campo_key: campoKey,
        label: input.label.trim(),
        tipo: 'texto',
        obrigatorio: input.obrigatorio,
        ordem: maxOrdem + 1,
        created_by: usuario.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes_campos'] });
      toast.success('Campo criado');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar campo'),
  });
}

export function useDeleteCampoCustomizado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('configuracoes_campos')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Apenas quem criou o campo pode removê-lo');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes_campos'] });
      toast.success('Campo removido');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao remover campo'),
  });
}
