import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

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
 */
export function useRegistrarRetorno() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (args: { pedidoId: string; motivo: string; retornoEm: string }) => {
      const { error } = await supabase.from('historico_contatos').insert({
        pedido_id: args.pedidoId,
        usuario_id: profile?.id,
        tipo: 'retorno',
        descricao: args.motivo,
        // Data de HOJE em texto, montada sem `new Date().toISOString()`: aquele caminho lê
        // UTC e, das 21h em diante no Brasil, gravaria amanhã (CLAUDE.md §7.12).
        data_contato: hojeEmTexto(),
        proximo_contato_em: args.retornoEm,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pauta-do-dia'] });
      // O painel do negócio e o Calendário leem a mesma tabela — sem isto, a pessoa fecha o
      // diálogo, abre o negócio e não vê o que acabou de escrever.
      qc.invalidateQueries({ queryKey: ['historico-contatos'] });
      qc.invalidateQueries({ queryKey: ['contatos-calendario'] });
    },
  });
}

/** `AAAA-MM-DD` do dia de hoje no fuso de quem está usando, sem passar por UTC. */
export function hojeEmTexto(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
