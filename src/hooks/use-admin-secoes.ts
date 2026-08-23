import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LinhaSecaoEmpresa {
  empresa_id: string;
  empresa_nome: string | null;
  usuarios: number;
  preset_id: string | null;
  preset_nome: string | null;
  secao: string;
  /** Já resolvida: exceção → preset → padrão. */
  habilitada: boolean;
  /** De onde veio a resposta acima. Sem isto ninguém entende empresas divergindo. */
  origem: 'excecao' | 'preset' | 'padrao';
}

/**
 * Controle de seções por empresa, para o administrador global.
 *
 * Tudo por RPC `SECURITY DEFINER`, como o resto do painel de admin (use-admin-cs.ts): a
 * autorização real mora no corpo das funções — `is_admin()` com `RAISE` —, e a tela só
 * decide se aparece. Conferido: chamar `admin_secoes_por_empresa` sem sessão de admin
 * devolve "Apenas o administrador global pode ver o controle de seções".
 *
 * EIXO: isto é POR EMPRESA (o que existe). Não confundir com `use-permissoes.ts`, que é
 * POR USUÁRIO (quem vê, dentro do que existe).
 */
export function useAdminSecoes() {
  return useQuery({
    queryKey: ['admin_secoes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_secoes_por_empresa');
      if (error) throw error;
      return (data ?? []) as LinhaSecaoEmpresa[];
    },
  });
}

/**
 * Cria, altera ou remove a exceção de uma empresa.
 *
 * `habilitada: null` REMOVE a exceção explicitamente — é o que o botão "Voltar a seguir o
 * preset" usa.
 *
 * E, desde 21/08/2026, **pedir um valor IGUAL ao do preset também remove**: a regra vive
 * dentro de `admin_definir_excecao_secao`, no banco. Exceção passou a significar sempre
 * DIVERGÊNCIA. Antes disso, desligar e religar uma seção deixava para trás uma exceção
 * inofensiva no valor mas mentirosa no selo — e que faria a empresa ficar parada no dia em
 * que o preset mudasse.
 */
export function useDefinirExcecao() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      empresaId: string;
      secao: string;
      habilitada: boolean | null;
    }) => {
      const { error } = await supabase.rpc('admin_definir_excecao_secao', {
        p_empresa_id: p.empresaId,
        p_secao: p.secao,
        p_habilitada: p.habilitada,
      });
      if (error) throw error;
    },
    onSuccess: (_dados, p) => {
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      // A empresa afetada precisa reler o próprio mapa de seções — é a chave que o
      // useSecoesDaEmpresa usa. Sem esta invalidação, quem estiver logado lá continua
      // vendo o estado antigo por até 5 minutos (o staleTime daquele hook).
      qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });

      toast.success(
        p.habilitada === null
          ? 'Exceção removida — a empresa volta a seguir o preset'
          : p.habilitada
            ? 'Seção liberada para esta empresa'
            : 'Seção bloqueada para esta empresa',
      );
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o acesso');
    },
  });
}

export function useDefinirPresetDaEmpresa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: { empresaId: string; presetId: string }) => {
      const { error } = await supabase.rpc('admin_definir_preset_da_empresa', {
        p_empresa_id: p.empresaId,
        p_preset_id: p.presetId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });
      toast.success('Preset da empresa alterado');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o preset');
    },
  });
}

// ---------------------------------------------------------------- presets

export interface PresetResumo {
  id: string;
  nome: string;
  descricao: string | null;
  is_padrao: boolean;
  /** Quantas empresas mudam de comportamento se este preset mudar. */
  empresas_seguindo: number;
  /**
   * Quantas seguem este preset por OMISSÃO — sem apontar preset nenhum.
   *
   * Só é diferente de zero no preset padrão, e é o número que importa ao TROCAR o padrão:
   * `empresas_seguindo` responde "quem segue este preset", este responde "quem muda se eu
   * trocar qual é o padrão". Medido em 23/08/2026: 0, porque as 8 empresas apontam
   * explicitamente. Trocar o padrão hoje decide só o que o PRÓXIMO assinante recebe.
   */
  empresas_por_omissao: number;
  secoes_ligadas: number;
}

/**
 * Os presets, com quantas empresas seguem cada um.
 *
 * O número não é enfeite: é o que a tela mostra ANTES de confirmar uma alteração. Mexer num
 * preset muda todas as empresas que o seguem de uma vez — a única tela do sistema onde um
 * clique atinge mais de um assinante.
 */
export function usePresets() {
  return useQuery({
    queryKey: ['admin_presets'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_listar_presets');
      if (error) throw error;
      return (data ?? []) as PresetResumo[];
    },
  });
}

/**
 * As seções de cada preset, todas de uma vez.
 *
 * Leitura direta da tabela, sem RPC: a política já libera SELECT para qualquer autenticado
 * (estas linhas dizem quais TELAS existem, não conteúdo de ninguém), e são poucas dezenas
 * de linhas no total. Uma consulta só evita uma por preset aberto.
 */
export function useItensDosPresets() {
  return useQuery({
    queryKey: ['admin_preset_itens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('secao_preset_itens')
        .select('preset_id, secao, habilitada');
      if (error) throw error;

      const mapa = new Map<string, Map<string, boolean>>();
      for (const linha of data ?? []) {
        const doPreset = mapa.get(linha.preset_id) ?? new Map<string, boolean>();
        doPreset.set(linha.secao, linha.habilitada);
        mapa.set(linha.preset_id, doPreset);
      }
      return mapa;
    },
  });
}

/**
 * Invalidação compartilhada pelas quatro mutações de preset.
 *
 * `secoes_da_empresa` entra em todas porque é a chave que o app inteiro usa para saber o que
 * mostrar. Sem ela, o admin altera o preset e continua vendo o sistema antigo até o cache
 * vencer — foi exatamente o sintoma que o Lucas relatou em 22/08/2026 com o Portal.
 */
function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin_presets'] });
  qc.invalidateQueries({ queryKey: ['admin_preset_itens'] });
  qc.invalidateQueries({ queryKey: ['admin_secoes'] });
  qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });
}

/**
 * Cria um preset COPIANDO o padrão.
 *
 * A cópia é feita no banco, não aqui, e não é conveniência: `empresa_tem_secao` trata
 * "não achei regra" como LIGADA, então preset sem linhas liberaria tudo — o oposto do que
 * se espera ao criar um preset para restringir.
 */
export function useCriarPreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: { nome: string; descricao?: string }) => {
      const { data, error } = await supabase.rpc('admin_criar_preset', {
        p_nome: p.nome,
        p_descricao: p.descricao ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidarTudo(qc);
      toast.success('Preset criado com uma cópia do padrão — ajuste as seções abaixo');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar o preset');
    },
  });
}

export function useRenomearPreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: { presetId: string; nome: string; descricao?: string }) => {
      const { error } = await supabase.rpc('admin_renomear_preset', {
        p_preset_id: p.presetId,
        p_nome: p.nome,
        p_descricao: p.descricao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_presets'] });
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      toast.success('Preset renomeado');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível renomear o preset');
    },
  });
}

/**
 * Liga ou desliga uma seção DENTRO do preset — atinge todas as empresas que o seguem.
 *
 * A empresa que tiver exceção para essa seção não muda: exceção ganha do preset. Por isso a
 * mensagem fala em "empresas que seguem", e não em "todas".
 */
export function useDefinirItemPreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: { presetId: string; secao: string; habilitada: boolean }) => {
      const { error } = await supabase.rpc('admin_definir_item_preset', {
        p_preset_id: p.presetId,
        p_secao: p.secao,
        p_habilitada: p.habilitada,
      });
      if (error) throw error;
    },
    onSuccess: (_dados, p) => {
      invalidarTudo(qc);
      toast.success(p.habilitada ? 'Seção liberada no preset' : 'Seção bloqueada no preset');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o preset');
    },
  });
}

/**
 * Exclui um preset.
 *
 * O banco recusa em dois casos — o padrão, e preset em uso — com mensagem que diz o que
 * fazer. A tela repassa a mensagem em vez de inventar a sua: quem sabe se está em uso é o
 * banco, e no instante da tentativa.
 */
export function useExcluirPreset() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (presetId: string) => {
      const { error } = await supabase.rpc('admin_excluir_preset', { p_preset_id: presetId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarTudo(qc);
      toast.success('Preset excluído');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir o preset');
    },
  });
}

/**
 * Escolhe QUAL preset é o padrão.
 *
 * Padrão aqui significa uma coisa só, e é bom não confundir: é o preset que vale para
 * empresa que não aponta nenhum. Como `empresas.secao_preset_id` nasce nulo e não há gatilho
 * que o preencha, na prática o padrão é **o que um assinante novo recebe no primeiro dia**.
 *
 * Não confundir com o preset de PERMISSÕES (`permissao_presets`), que é o outro eixo: aquele
 * diz o que cada cargo VÊ dentro do que existe; este diz o que EXISTE para o assinante.
 */
export function useDefinirPresetPadrao() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (presetId: string) => {
      const { error } = await supabase.rpc('admin_definir_preset_padrao', {
        p_preset_id: presetId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarTudo(qc);
      toast.success('Preset padrão alterado — é o que empresa nova passa a receber');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o preset padrão');
    },
  });
}
