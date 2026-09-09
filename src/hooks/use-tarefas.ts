import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Os dois painéis da tela "Hoje" que mudam de conteúdo quando uma TAREFA muda. Ficam numa
// função só porque as três mutações de tarefa precisam dos mesmos dois, e uma lista repetida
// três vezes é uma lista que envelhece em duas.
//
// Por que cada um está aqui — nenhum dos dois é tela de tarefa, e é por isso que ninguém se
// lembrava deles:
//
//   · `pauta-do-dia` (`pauta_do_dia_de`, `use-pauta.ts`) — tarefa com prazo HOJE e status
//     diferente de "concluida" entra na fila como compromisso E consome uma vaga
//     (`v_vagas = v_max - v_compromissos`), então um negócio parado SAI da lista no mesmo gesto.
//     Medido na tela em 09/09/2026, na empresa de demonstração: criar uma tarefa com prazo hoje
//     empurrou para fora um negócio de R$ 340.300,00 e o "em jogo" caiu de R$ 2.523.100,00 para
//     R$ 2.182.800,00 — mas só depois de recarregar a página, que é o defeito que isto fecha.
//
//   · `dashboard_negocios_risco` — `sem_proxima_acao` é `NOT EXISTS (tarefas do negócio com
//     status <> 'concluida')`, então uma tarefa aberta tira o negócio do cartão "Sem próxima
//     ação", do "Valor em risco", do resumo por fabricante e da tabela "Os 10 maiores em risco";
//     concluí-la ou excluí-la o traz de volta.
//
// 🔴 A lista para aqui de propósito. A tela "Hoje" é pesada, e cada chave a mais é requisição
// paga em toda tarefa salva. `tarefas` e `tarefas_por_pedido` continuam do lado de fora porque
// são das telas de tarefa, não da "Hoje"; `tarefas_por_conversa` fica só na criação, que é o
// único lugar onde a conversa é conhecida (a caixa de entrada do WhatsApp não edita nem exclui).
function invalidarPaineisQueContamTarefa(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['pauta-do-dia'] });
  qc.invalidateQueries({ queryKey: ['dashboard_negocios_risco'] });
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prazo_final: string | null;
  responsavel: string | null;
  criado_por: string | null;
  participantes: string | null;
  observadores: string | null;
  projeto: string | null;
  marcadores: string | null;
  usuario_id: string | null;
  conversa_id: string | null;
  cliente_id: string | null;
  pedido_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useTarefas() {
  return useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Tarefa[]) ?? [];
    },
  });
}

// Histórico de tarefas criadas a partir de uma conversa do WhatsApp Inbox
// (ver botão "Nova tarefa" em src/pages/WhatsAppInbox.tsx).
export function useTarefasPorConversa(conversaId: string | null) {
  return useQuery({
    queryKey: ['tarefas_por_conversa', conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas' as any)
        .select('*')
        .eq('conversa_id', conversaId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Tarefa[]) ?? [];
    },
  });
}

// Histórico de tarefas vinculadas a um negócio (pedido), exibido no painel
// de detalhes do negócio em src/pages/Negocios.tsx.
export function useTarefasPorPedido(pedidoId: string | null) {
  return useQuery({
    queryKey: ['tarefas_por_pedido', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas' as any)
        .select('*')
        .eq('pedido_id', pedidoId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Tarefa[]) ?? [];
    },
  });
}

export function useCreateTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tarefa: Partial<Tarefa>) => {
      // Garante que o usuario_id seja o do usuário logado (exigido pela RLS)
      const { data: usuarioRow, error: usuarioErr } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (usuarioErr) throw usuarioErr;
      if (!usuarioRow?.id) throw new Error('Usuário não encontrado. Faça login novamente.');

      const payload = {
        ...tarefa,
        usuario_id: usuarioRow.id,
        criado_por: tarefa.criado_por ?? usuarioRow.nome ?? null,
      };
      const { error } = await supabase.from('tarefas' as any).insert(payload as any);
      if (error) throw error;
    },
    onSuccess: (_data, tarefa) => {
      qc.invalidateQueries({ queryKey: ['tarefas'] });
      if (tarefa.conversa_id) {
        qc.invalidateQueries({ queryKey: ['tarefas_por_conversa', tarefa.conversa_id] });
      }
      if (tarefa.pedido_id) {
        qc.invalidateQueries({ queryKey: ['tarefas_por_pedido', tarefa.pedido_id] });
      }
      invalidarPaineisQueContamTarefa(qc);
    },
  });
}

export function useUpdateTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tarefa> & { id: string }) => {
      const { error } = await supabase
        .from('tarefas' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarefas'] });
      // Sem o identificador do negócio, de propósito: esta mutação recebe SÓ o que mudou — a
      // tela de Tarefas manda `{ id, status }` ao arrastar o card —, então o negócio nem sempre
      // chega aqui; e quando chega pode ser o NOVO, deixando velha a tabela do negócio de onde a
      // tarefa saiu. `['tarefas_por_pedido']` casa todas as buscas por negócio de uma vez
      // (`invalidateQueries` compara elemento a elemento e a chave mais curta casa as maiores).
      // O custo é o que se imagina e não mais: só a busca do painel ABERTO está montada e refaz
      // a consulta; as outras ficam apenas marcadas como velhas, sem requisição nenhuma.
      // Sem isto, editar uma tarefa pelo painel deixava a própria tabela de tarefas do painel
      // mostrando o valor antigo.
      qc.invalidateQueries({ queryKey: ['tarefas_por_pedido'] });
      invalidarPaineisQueContamTarefa(qc);
    },
  });
}

export function useDeleteTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tarefas' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarefas'] });
      // Só o `id` da tarefa chega aqui — o negócio dela já não existe para consultar. Mesmo
      // motivo do `useUpdateTarefa` acima para casar todas as buscas por negócio de uma vez.
      qc.invalidateQueries({ queryKey: ['tarefas_por_pedido'] });
      invalidarPaineisQueContamTarefa(qc);
    },
  });
}
