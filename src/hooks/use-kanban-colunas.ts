import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invalidarPaineisDeNegocios } from './use-pedidos';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { recusaSemErro } from '@/lib/recusa-do-banco';

export interface KanbanColuna {
  id: string;
  empresa_id: string;
  funil_id: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

export const KANBAN_COR_OPCOES = [
  { value: 'kanban-new', label: 'Laranja', class: 'bg-kanban-new' },
  { value: 'kanban-budget', label: 'Amarelo', class: 'bg-kanban-budget' },
  { value: 'kanban-sent', label: 'Roxo', class: 'bg-kanban-sent' },
  { value: 'kanban-negotiation', label: 'Azul', class: 'bg-kanban-negotiation' },
  { value: 'kanban-closed', label: 'Verde', class: 'bg-kanban-closed' },
  { value: 'destructive', label: 'Vermelho', class: 'bg-destructive' },
  { value: 'muted-foreground', label: 'Cinza', class: 'bg-muted-foreground' },
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || `coluna ${Date.now()}`;
}

export function useKanbanColunas(empresaId?: string | null, funilId?: string | null) {
  return useQuery<KanbanColuna[]>({
    queryKey: ['kanban_colunas', empresaId ?? null, funilId ?? null],
    queryFn: async () => {
      let query = supabase.from('kanban_colunas').select('*').order('ordem', { ascending: true });
      if (empresaId) query = query.eq('empresa_id', empresaId);
      if (funilId) query = query.eq('funil_id', funilId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as KanbanColuna[];
    },
    enabled: !!funilId,
  });
}

export interface KanbanColunaComFunil extends KanbanColuna {
  funil: { nome: string } | null;
}

// Todas as colunas de TODOS os funis da empresa, com o nome do funil junto — usado só
// pelo seletor de "obrigatório em quais etapas" na tela de configuração de campos, que
// (diferente do Kanban) não está preso a um único funil por vez.
export function useKanbanColunasEmpresa(empresaId?: string | null) {
  return useQuery<KanbanColunaComFunil[]>({
    queryKey: ['kanban_colunas_empresa', empresaId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kanban_colunas')
        .select('*, funil:funis(nome)')
        .eq('empresa_id', empresaId!)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as KanbanColunaComFunil[];
    },
    enabled: !!empresaId,
  });
}

export function useCreateKanbanColuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor: string; funilId: string }) => {
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Empresa não encontrada');

      const { data: existentes } = await supabase
        .from('kanban_colunas')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id)
        .eq('funil_id', input.funilId);

      let baseSlug = slugify(input.nome);
      const slugs = new Set((existentes ?? []).map(e => e.slug));
      let slug = baseSlug;
      let i = 2;
      while (slugs.has(slug)) {
        slug = `${baseSlug} ${i++}`;
      }
      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { data, error } = await supabase.from('kanban_colunas').insert({
        empresa_id: usuario.empresa_id,
        funil_id: input.funilId,
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
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.success('Coluna criada');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao criar coluna'),
  });
}

export function useUpdateKanbanColuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; cor?: string }) => {
      const patch: Record<string, unknown> = {};
      if (input.nome !== undefined) patch.nome = input.nome.trim();
      if (input.cor !== undefined) patch.cor = input.cor;
      const { error } = await supabase.from('kanban_colunas').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.success('Coluna atualizada');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao atualizar coluna'),
  });
}

export function useDeleteKanbanColuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; slug: string; targetSlug: string; funilId: string }) => {
      // UMA operação, no banco: `excluir_etapa_do_funil` apaga a coluna e remaneja os negócios
      // na mesma transação (migration 20260922150000). Até 22/09/2026 eram duas gravações daqui,
      // nesta ordem: mover os negócios e depois apagar a coluna. Só a segunda é protegida
      // (`kanban_colunas_delete` exige gestor) e apagar zero linhas não devolve erro, então um
      // vendedor comum movia os próprios negócios, a coluna ficava de pé e a tela dizia que
      // tinha dado certo (item 39 da dívida). Inverter a ordem aqui não resolveria: entre as
      // duas gravações sempre haveria uma janela — apagar a coluna e falhar ao mover deixaria
      // os negócios numa etapa que não existe mais.
      //
      // DATA DE FECHAMENTO: quando o destino é Fechamento ou Perdido, o gatilho
      // `fn_set_pedido_fechado_em` (migration 20260821120100) carimba a data em cada negócio
      // movido, dentro da mesma transação. A regra da data continua morando só lá — duas donas
      // para a mesma regra foi exatamente como o problema começou.
      const { data, error } = await supabase.rpc('excluir_etapa_do_funil', {
        p_coluna_id: input.id,
        p_destino: input.targetSlug,
      });
      if (error) throw new Error(mensagemDeErro(error, 'Não foi possível excluir a etapa.'));
      return (data ?? 0) as number;
    },
    onSuccess: (movidos: number) => {
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      // Remanejar negócios em massa pode passar dezenas deles para Fechamento ou Perdido —
      // ou tirá-los de lá —, então mexe no faturamento e nas metas, não só no quadro.
      invalidarPaineisDeNegocios(qc);
      toast.success(
        movidos > 0
          ? `Etapa excluída e ${movidos.toLocaleString('pt-BR')} negócio(s) remanejado(s)`
          : 'Etapa excluída',
      );
    },
    // A tranquilidade que faltava, e que vale para QUALQUER falha agora que tudo é uma
    // transação só: se a etapa não saiu, nenhum negócio mudou de lugar. Era exatamente o que a
    // pessoa não sabia quando a tela anunciava sucesso sobre uma exclusão que não aconteceu.
    onError: (err: unknown) =>
      toast.error(`${mensagemDeErro(err, 'Não foi possível excluir a etapa.')} Nenhum negócio foi movido.`),
  });
}

export function useReorderKanbanColunas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // 🔴 ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6). Antes, o resultado destas gravações era
      // descartado: nem o erro era conferido. Quem não é gestor arrastava as etapas, via
      // "Alterações salvas", e a ordem voltava ao recarregar sem nada explicar (item 47).
      // A causa mais provável nem é permissão: com a empresa bloqueada por cobrança, a política
      // restritiva do plano zera as linhas de toda escrita do sistema, em silêncio.
      const resultados = await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('kanban_colunas').update({ ordem: idx }, { count: 'exact' }).eq('id', id)
        )
      );

      const comErro = resultados.find(r => r.error);
      if (comErro?.error) throw comErro.error;

      // `count === 0`, nunca `!count`: o servidor pode não mandar o número, e tratar isso como
      // recusa gritaria "não salvou" em cima de uma gravação que funcionou.
      if (resultados.some(r => r.count === 0)) {
        throw new Error(
          recusaSemErro(
            'A ordem das etapas NÃO foi salva: ela volta como estava ao recarregar.',
            'Reordenar etapas do funil é coisa de gestor.',
          ),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban_colunas'] }),
    onError: (err: unknown) => {
      // Devolve a tela ao estado real: sem isto, a ordem recusada continua desenhada até a
      // pessoa recarregar, contradizendo o aviso que ela acabou de ler.
      qc.invalidateQueries({ queryKey: ['kanban_colunas'] });
      toast.error(mensagemDeErro(err, 'Não foi possível salvar a ordem das etapas.'));
    },
  });
}
