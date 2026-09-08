import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chavesDeTelefone, conversaDoContato } from '@/lib/contato-da-conversa';

/**
 * A conversa de WhatsApp desta pessoa, para o link "Ver conversa no WhatsApp" da ficha do
 * contato levar direto ao lugar certo.
 *
 * 🔴 POR QUE NÃO DÁ PARA CONFIAR EM `whatsapp_conversas.contato_id`. Medido em produção em
 * 28/08/2026: das 757 conversas de pessoa, ZERO estavam ligadas a um contato do CRM — não
 * existe tela que grave esse vínculo sozinha. Ligar por `contato_id` acertaria quase nunca.
 * Por isso o casamento é pelo TELEFONE, com a mesma chave "DDD + 8 dígitos finais" que
 * `chaveDeTelefone` usa no reconhecimento do painel do lead (ver `contato-da-conversa.ts`):
 * ela ignora o nono dígito, que é o que varia entre o cadastro antigo e o número que o
 * WhatsApp reporta (CLAUDE.md §7.1).
 *
 * O recorte por empresa é do banco — a política de `whatsapp_conversas` só devolve as da
 * empresa de quem está logado.
 *
 * Devolve `null` em `conversaId` quando não há conversa para esse número: o link então abre a
 * caixa de entrada sem conversa selecionada, e a pessoa procura ou inicia por lá.
 */

export interface ConversaCrua {
  id: string;
  telefone: string | null;
  contato_id: string | null;
  /** Quando foi a última mensagem — alimenta a linha-resumo no histórico do negócio. */
  ultima_mensagem_at: string | null;
}

const TAMANHO_DA_PAGINA = 1000;

async function buscarConversasParaCasarPorTelefone(): Promise<ConversaCrua[]> {
  const todas: ConversaCrua[] = [];
  let de = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('whatsapp_conversas')
      .select('id, telefone, contato_id, ultima_mensagem_at')
      .range(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) throw error;

    const pagina = (data ?? []) as ConversaCrua[];
    todas.push(...pagina);

    if (pagina.length < TAMANHO_DA_PAGINA) break;
    de += TAMANHO_DA_PAGINA;
  }

  return todas;
}

export function useConversaDoContato(
  telefone: string | null | undefined,
  contatoId: string | null | undefined,
  habilitado: boolean,
) {
  // Sem chave de telefone válida (número curto, estrangeiro, identificador de grupo) só
  // sobra o vínculo explícito por `contato_id` — que quase nunca existe, mas custa nada
  // conferir.
  //
  // 🔴 NO PLURAL. A ficha pode guardar dois números no mesmo campo, e a versão singular
  // devolve `null` para o campo inteiro nesse caso — o portão dos 11 dígitos, que existe para
  // barrar identificador de grupo, conta os dígitos dos dois números juntos. Medido em
  // produção em 07/09/2026: 30 contatos com dois números TÊM conversa, e o botão "Ver
  // conversa" aparecia apagado para todos eles.
  const temChave = chavesDeTelefone(telefone).length > 0;

  const consulta = useQuery({
    queryKey: ['conversa-do-contato', 'todas'],
    queryFn: buscarConversasParaCasarPorTelefone,
    enabled: habilitado && (temChave || !!contatoId),
    // O telefone de uma conversa praticamente não muda; meia hora de cache evita revarrer
    // a lista a cada abertura de ficha.
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  // A regra do casamento mora em `contato-da-conversa.ts` porque ela precisa de teste próprio:
  // é ela que decide o atalho de quatro telas diferentes.
  const conversa = useMemo(
    () => conversaDoContato(consulta.data, telefone, contatoId),
    [consulta.data, telefone, contatoId],
  );

  // `conversaId` continua no retorno porque é o que os atalhos usam; `conversa` é para quem
  // precisa também da data da última mensagem (a linha-resumo no histórico do negócio).
  return { conversaId: conversa?.id ?? null, conversa, carregando: consulta.isLoading };
}

/**
 * Quantas mensagens cada conversa tem.
 *
 * 🔴 UMA CONTAGEM POR CONVERSA, e não uma varredura. `whatsapp_mensagens` tem 73.456 linhas;
 * trazer as linhas para contar no navegador seria absurdo, e o PostgREST não sabe agrupar. O
 * caminho barato é `head: true` com `count: 'exact'`: o servidor devolve só o número, sem linha
 * nenhuma, e existe índice por `conversa_id` (`idx_whatsapp_mensagens_conversa`).
 *
 * São poucas chamadas porque um negócio tem poucos contatos — a mediana é 1 conversa. Se um dia
 * um cliente tiver dezenas, o certo passa a ser uma função de banco que agrupa; até lá, isto não
 * paga complexidade que ninguém usa.
 */
export function useContagemDeMensagens(conversaIds: string[]) {
  // Ordenado para a chave de cache não mudar só porque a ordem da lista mudou.
  const chave = [...conversaIds].sort().join(',');

  return useQuery({
    queryKey: ['contagem-de-mensagens', chave],
    enabled: conversaIds.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const pares = await Promise.all(
        conversaIds.map(async (id) => {
          const { count, error } = await supabase
            .from('whatsapp_mensagens')
            .select('id', { count: 'exact', head: true })
            .eq('conversa_id', id);
          if (error) throw error;
          return [id, count ?? 0] as const;
        }),
      );
      return new Map(pares);
    },
  });
}
