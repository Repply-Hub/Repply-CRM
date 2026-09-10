import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { recusaSemErro } from '@/lib/recusa-do-banco';

// 🔴 ZERO LINHAS NÃO É SUCESSO — e é por isso que as três gravações abaixo pedem `count`.
//
// A política `tarefas_delete` só deixa apagar quem é gestor ou tem a funcionalidade
// `tarefas.excluir`; a `tarefas_update` só deixa alterar tarefa própria (ou qualquer uma, se
// gestor). Quem não passa nessas cláusulas NÃO recebe erro: o `USING` da regra simplesmente não
// encontra a linha, o comando mexe em zero registros e a resposta volta com `error: null`.
//
// Medido em 09/09/2026 na empresa de demonstração, com um `vendedor` sem `tarefas.excluir`:
// clicar em Excluir mostrava "Tarefa excluída" e a tarefa continuava lá depois de recarregar;
// trocar a etapa de uma tarefa de outra pessoa mostrava "Etapa atualizada." e o `updated_at` no
// banco nem se mexia. Ver `CLAUDE.md` §4.6.
//
// `count: 'exact'` é a forma documentada do cliente instalado (@supabase/supabase-js 2.98) de
// pedir as linhas afetadas, e já era usada na exclusão em massa de negócios (`use-pedidos.ts`).
// A comparação é com `0` CRAVADO, nunca com falsidade: `count` vem `null` quando a resposta não
// traz o cabeçalho de contagem, e tratar `null` como recusa inventaria um erro em cima de uma
// gravação que funcionou — a mentira ao contrário.
const RECUSA_AO_EXCLUIR = 'Excluir tarefa é uma permissão à parte, e o seu usuário não tem.';
const RECUSA_AO_ALTERAR = 'Só o responsável pela tarefa ou um gestor da empresa pode alterá-la.';

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
//     ação", do "Valor em risco" e do resumo por fabricante; concluí-la ou excluí-la o traz de
//     volta.
//
//   · `negocios_em_risco` — a TABELA DO TIME, logo abaixo desses cartões. Desde 09/09/2026 ela
//     tem função de banco própria (migration 20260909130000) e, portanto, chave de cache
//     própria: era uma coluna de dentro de `dashboard_negocios_risco` e vinha de carona na linha
//     de cima. Sem esta linha, criar uma tarefa some com o negócio dos cartões e o DEIXA na
//     tabela — a mesma tela dizendo as duas coisas ao mesmo tempo.
//
// 🔴 A lista para aqui de propósito. A tela "Hoje" é pesada, e cada chave a mais é requisição
// paga em toda tarefa salva. `tarefas` e `tarefas_por_pedido` continuam do lado de fora porque
// são das telas de tarefa, não da "Hoje"; `tarefas_por_conversa` fica só na criação, que é o
// único lugar onde a conversa é conhecida (a caixa de entrada do WhatsApp não edita nem exclui).
function invalidarPaineisQueContamTarefa(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['pauta-do-dia'] });
  qc.invalidateQueries({ queryKey: ['dashboard_negocios_risco'] });
  qc.invalidateQueries({ queryKey: ['negocios_em_risco'] });
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
      const { error, count } = await supabase
        .from('tarefas' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any, { count: 'exact' })
        .eq('id', id);
      if (error) throw error;
      if (count === 0) {
        throw new Error(
          recusaSemErro('A tarefa NÃO foi alterada: ela continua como estava.', RECUSA_AO_ALTERAR),
        );
      }
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
      const { error, count } = await supabase
        .from('tarefas' as any)
        .delete({ count: 'exact' })
        .eq('id', id);
      if (error) throw error;
      if (count === 0) {
        throw new Error(
          recusaSemErro('A tarefa NÃO foi excluída: ela continua na lista.', RECUSA_AO_EXCLUIR),
        );
      }
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

/** Quantas tarefas a exclusão em massa pediu, e quantas o banco realmente apagou. */
export interface ResultadoDaExclusaoEmMassa {
  pedidas: number;
  removidas: number;
}

/**
 * A exclusão em massa da tela de Tarefas.
 *
 * Ela morava dentro de `src/pages/Tarefas.tsx`, falando com o banco por conta própria — e era o
 * caminho que mais mentia: somava `ids.length` e anunciava "N tarefa(s) removida(s)!" sem nunca
 * perguntar quantas saíram. Trazê-la para cá conserta duas coisas de uma vez, porque a versão da
 * tela também **não invalidava os painéis da tela "Hoje"**: apagar tarefa em massa deixava a fila
 * e os cartões de risco mostrando compromissos que já não existiam, por até meia hora.
 *
 * O retorno é o par (pedidas, removidas) em vez de um `boolean`, porque a recusa costuma ser
 * PARCIAL: numa seleção com tarefas de vários donos, um vendedor apaga as suas e o banco recusa
 * as dos colegas em silêncio. Dizer só "deu certo" ou só "deu errado" seria falso nos dois casos.
 */
export function useBulkDeleteTarefas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<ResultadoDaExclusaoEmMassa> => {
      if (ids.length === 0) return { pedidas: 0, removidas: 0 };

      const TAMANHO_DO_LOTE = 500;
      let removidas = 0;
      for (let i = 0; i < ids.length; i += TAMANHO_DO_LOTE) {
        const lote = ids.slice(i, i + TAMANHO_DO_LOTE);
        // Sem `as any` aqui: `tarefas` está nos tipos gerados, e era assim que a tela fazia.
        // As outras chamadas deste arquivo carregam o `as any` por herança, não por precisão.
        const { error, count } = await supabase
          .from('tarefas')
          .delete({ count: 'exact' })
          .in('id', lote);
        if (error) throw error;
        // Sem cabeçalho de contagem não dá para saber quantas saíram; contar o lote inteiro é a
        // suposição otimista, e é a mesma que `use-pedidos.ts` faz. A recusa muda só o número
        // exibido, nunca o que foi de fato apagado.
        removidas += count ?? lote.length;
      }
      return { pedidas: ids.length, removidas };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarefas'] });
      qc.invalidateQueries({ queryKey: ['tarefas_por_pedido'] });
      invalidarPaineisQueContamTarefa(qc);
    },
  });
}

/**
 * A frase que a tela mostra depois de uma exclusão em massa, e de que tipo ela é.
 *
 * Está separada da tela de propósito: é a regra que decide quando "removidas" vira comemoração,
 * ressalva ou recusa, e é o que o teste prende. Espelha o que `src/pages/Clientes.tsx` já fazia
 * na exclusão em massa de clientes desde antes — aqui só ganhou nome e teste.
 */
export function frasesDaExclusaoEmMassa({ pedidas, removidas }: ResultadoDaExclusaoEmMassa): {
  tipo: 'sucesso' | 'parcial' | 'recusa';
  frase: string;
} {
  if (removidas === 0) {
    return {
      tipo: 'recusa',
      frase: recusaSemErro(
        pedidas === 1
          ? 'A tarefa NÃO foi excluída: ela continua na lista.'
          : `Nenhuma das ${pedidas} tarefas foi excluída: elas continuam na lista.`,
        RECUSA_AO_EXCLUIR,
      ),
    };
  }

  if (removidas < pedidas) {
    // Concordância no singular quando sobra UMA: "As outras 1 continuam na lista" é a frase
    // que a pessoa lê na tela, e ler errado corrói a confiança no aviso inteiro — ainda mais
    // num aviso cuja função é dizer que o sistema NÃO fez o que parecia ter feito.
    const sobraram = pedidas - removidas;
    return {
      tipo: 'parcial',
      frase:
        `${removidas} de ${pedidas} tarefas excluídas. ` +
        (sobraram === 1
          ? 'A outra continua na lista: '
          : `As outras ${sobraram} continuam na lista: `) +
        `${RECUSA_AO_EXCLUIR} Peça a um gestor da sua empresa.`,
    };
  }

  return {
    tipo: 'sucesso',
    frase: removidas === 1 ? 'Tarefa excluída.' : `${removidas} tarefas excluídas.`,
  };
}
