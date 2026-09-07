import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * A pauta do dia — a tela "Hoje".
 *
 * Toda a regra vive na função de banco `pauta_do_dia()`: quais negócios estão parados, o
 * teto de itens, o corte de dias, e o fato de a seção desligada devolver vazio. Aqui não se
 * decide nada, só se pede e se mostra.
 *
 * POR QUE ASSIM: a mesma função de banco alimenta o e-mail de resumo diário. Se a regra
 * fosse reimplementada aqui, a tela diria "5 orçamentos parados" e o e-mail diria 7 — e o
 * tipo de divergência que leva meses até alguém notar.
 */

export interface ItemDaPauta {
  tipo: 'compromisso' | 'negocio_parado';
  referencia_id: string;
  selo: string;
  titulo: string;
  detalhe: string;
  valor: number | null;
  quando: string | null;
  dias_parado: number | null;
  ordem: number;
  /** Nome do dono, só quando o negócio NÃO é de quem está olhando. */
  responsavel: string | null;
}

export function usePauta() {
  return useQuery({
    queryKey: ['pauta-do-dia'],
    queryFn: async (): Promise<ItemDaPauta[]> => {
      const { data, error } = await supabase.rpc('pauta_do_dia');
      if (error) throw error;
      return (data ?? []) as ItemDaPauta[];
    },
    // A pauta muda quando o negócio muda, não de minuto em minuto. Meia hora evita refazer
    // a consulta a cada troca de aba sem deixar a tela velha o dia inteiro.
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * "Retomar depois": registra POR QUE o item sai da pauta e QUANDO vale a pena voltar.
 *
 * Grava em `historico_contatos`, que já existia e estava vazia — é o campo "próximo contato
 * agendado" que saiu da tela do negócio em 08/2026 por nunca ser preenchido. Ele nunca foi
 * preenchido porque o MOMENTO de perguntar estava errado: no cadastro de um negócio novo
 * ninguém sabe quando vai voltar a falar; aqui, sabe.
 *
 * Três coisas acontecem sem código nenhum a mais:
 *   1. o painel do negócio mostra (Negocios.tsx já desenha `historico_contatos`)
 *   2. o Calendário mostra (use-eventos.ts já lê `proximo_contato_em`)
 *   3. o negócio volta para a pauta na data escolhida
 *
 * 🔴 NÃO altera o negócio. Empurrar `prazo_resposta` seria mais barato e faria a coluna
 * mudar de significado — de "data de fechamento" para "quando eu vou cobrar" — e todo
 * relatório que a lê passaria a mentir (CLAUDE.md §4.4).
 *
 * 🔴 DESDE 07/09/2026 QUEM GRAVA É O SERVIDOR, não esta tela. Quem tem a chave
 * `pauta_de_todos` vê o negócio de um colega na pauta e pode adiá-lo — e aí duas regras do
 * banco impediam o gesto de sair daqui: a de `historico_contatos` só aceitava o dono ou um
 * gestor, e a de `notificacoes` exige papel de gestor para inserir, então o aviso ao dono
 * nunca poderia partir do navegador de um vendedor. A função `registrar_retorno` confere a
 * permissão, grava o retorno e cria o aviso num gesto só.
 */
export function useRegistrarRetorno() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { pedidoId: string; motivo: string; retornoEm: string }) => {
      // O "hoje" do registro passou a ser o do calendário brasileiro decidido no servidor —
      // antes vinha do relógio deste navegador. Some assim a chance de um computador com o
      // fuso trocado gravar o dia errado (CLAUDE.md §7.12).
      const { error } = await supabase.rpc('registrar_retorno', {
        p_pedido_id: args.pedidoId,
        p_motivo: args.motivo,
        p_retorno_em: args.retornoEm,
      });
      // Sobe o erro do Supabase CRU, de propósito: `DialogoRetorno` já o traduz com
      // `mensagemDeErro`, que sabe ler `code`/`details`/`hint` — e é o `code` 42501 que
      // separa "empresa bloqueada" de "você não tem permissão neste negócio". Embrulhar em
      // `new Error(...)` aqui jogaria fora justamente esses campos (CLAUDE.md §4.6).
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pauta-do-dia'] });
      // O painel do negócio e o Calendário leem a mesma tabela — sem isto, a pessoa fecha o
      // diálogo, abre o negócio e não vê o que acabou de escrever.
      // 🔴 Com SUBLINHADO: o nome tem que bater com `['historico_contatos', pedidoId]` de
      // `use-pedidos.ts` (`useHistoricoContatos`). Com hífen não casa nada, em silêncio.
      qc.invalidateQueries({ queryKey: ['historico_contatos'] });
      qc.invalidateQueries({ queryKey: ['contatos-calendario'] });
      // O cartão "Sem Próxima Ação" do painel "No geral" (tela Hoje) agora CONTA retorno
      // marcado — não só ausência de tarefa (migration 20260905120000). Sem esta
      // invalidação, o negócio some da fila de cima e o cartão logo abaixo, na mesma tela,
      // não se mexe: ele tem 5 minutos de vida (staleTime) e não refaz sozinho ao voltar o
      // foco. Isso apagaria exatamente o retorno que "Retomar depois" promete mostrar.
      qc.invalidateQueries({ queryKey: ['dashboard_negocios_risco'] });
      // Adiar o negócio de um colega cria um aviso para o DONO — e a regra de leitura de
      // `notificacoes` deixa um gestor ver os avisos da própria equipe. Ou seja: o sininho de
      // quem acabou de adiar também muda. Sem isto, ele só mudaria quando o aviso em tempo
      // real chegasse, e não chega quando essa conexão cai.
      qc.invalidateQueries({ queryKey: ['notificacoes'] });
    },
  });
}
