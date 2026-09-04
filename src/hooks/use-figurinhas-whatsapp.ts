import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { sha256Hex } from '@/lib/figurinha';
import { useAuth } from '@/hooks/use-auth';

/**
 * Figurinhas que já SAÍRAM de um número de WhatsApp.
 *
 * A tabela `whatsapp_figurinhas` é populada pelas functions do servidor: a
 * `whatsapp-send` quando o CRM envia, e a `whatsapp-webhook` quando o WhatsApp
 * ecoa uma figurinha mandada do próprio celular. Desde 03/09/2026 a figurinha
 * RECEBIDA de cliente não entra sozinha — só pelo "Salvar figurinha" no menu da
 * mensagem, que é escolha de gente.
 *
 * Aqui o app só LÊ a grade, salva uma figurinha avulsa e marca `removida_em`.
 * Tirar da grade é de gestor (`podeGerenciarFigurinhas`), porque some para todos
 * que atendem o número.
 */

export interface FigurinhaWa {
  id: string;
  media_url: string;
  media_mime: string | null;
  ultima_vez_em: string;
}

export function useFigurinhasDoNumero(instanciaId: string | null | undefined) {
  return useQuery({
    queryKey: ['wa_figurinhas', instanciaId],
    enabled: !!instanciaId,
    // Figurinha nova aparece via realtime da mensagem; um staleTime curto evita
    // refetch a cada abertura do seletor sem deixar a grade desatualizada por muito tempo.
    staleTime: 30_000,
    queryFn: async (): Promise<FigurinhaWa[]> => {
      const { data, error } = await supabase
        .from('whatsapp_figurinhas')
        .select('id, media_url, media_mime, ultima_vez_em')
        .eq('instancia_id', instanciaId as string)
        .is('removida_em', null)
        // A grade é o que SAI do número, mais o que alguém escolheu guardar. Figurinha que
        // um cliente mandou e ninguém salvou fica na tabela (guardando o dedupe) e fora da
        // grade. `origem` sozinha não separa isso: o botão "Salvar figurinha" numa mensagem
        // recebida também grava origem = 'recebida' — quem separa é `salva_em`.
        .or('origem.eq.enviada,salva_em.not.is.null')
        .order('ultima_vez_em', { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as FigurinhaWa[];
    },
  });
}

/**
 * "Salvar figurinha" — o atendente guarda na coleção do número uma figurinha que
 * apareceu no chat (recebida de um contato ou enviada por um colega), para poder
 * reusá-la no seletor.
 *
 * A coleção já se enche sozinha pelas functions do servidor, mas este botão:
 *   · funciona para figurinha antiga, que o webhook não vai reprocessar;
 *   · traz de volta uma figurinha que tinha sido tirada da grade (removida_em → null).
 */
export function useSalvarFigurinha(instanciaId: string | null | undefined) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      /** Endereço canônico gravado na mensagem — é o que fica em whatsapp_figurinhas. */
      mediaUrl: string;
      /** Endereço já assinado/alcançável, só para baixar os bytes e gerar o hash. */
      enderecoParaHash: string;
      mediaMime: string | null;
      origem: 'recebida' | 'enviada';
    }) => {
      if (!instanciaId) throw new Error('Este número não tem instância vinculada.');
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (!empresaId) throw new Error('Sua empresa não foi identificada.');

      const resp = await fetch(params.enderecoParaHash);
      if (!resp.ok) throw new Error('Não foi possível ler a figurinha para salvar.');
      const hash = await sha256Hex(await resp.blob());

      const { error } = await supabase.from('whatsapp_figurinhas').upsert(
        {
          empresa_id: empresaId,
          instancia_id: instanciaId,
          media_url: params.mediaUrl,
          media_hash: hash,
          media_mime: params.mediaMime ?? 'image/webp',
          origem: params.origem,
          ultima_vez_em: new Date().toISOString(),
          // Salvar é ação explícita: se estava fora da grade, volta.
          removida_em: null,
          // O que faz a figurinha aparecer na grade quando ela foi RECEBIDA de um cliente.
          // As functions do servidor nunca escrevem esta coluna — é a marca de que uma
          // pessoa escolheu guardar, e é o que separa isso de "o robô guardou sozinho".
          salva_em: new Date().toISOString(),
        },
        { onConflict: 'instancia_id,media_hash' },
      );
      if (error) throw new Error(mensagemDeErro(error, 'Não foi possível salvar a figurinha'));
    },
    onSuccess: () => {
      toast.success('Figurinha salva.');
      qc.invalidateQueries({ queryKey: ['wa_figurinhas', instanciaId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar a figurinha');
    },
  });
}

export function useRemoverFigurinha(instanciaId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_figurinhas')
        .update({ removida_em: new Date().toISOString() })
        .eq('id', id);
      // Erro do Supabase não é um Error (CLAUDE.md §4.6) — mensagemDeErro lê message/details/hint.
      if (error) throw new Error(mensagemDeErro(error, 'Não foi possível remover a figurinha'));
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['wa_figurinhas', instanciaId] });
      const anterior = qc.getQueryData<FigurinhaWa[]>(['wa_figurinhas', instanciaId]);
      qc.setQueryData<FigurinhaWa[]>(['wa_figurinhas', instanciaId], (old) =>
        (old ?? []).filter((f) => f.id !== id),
      );
      return { anterior };
    },
    onError: (err: unknown, _id, ctx) => {
      if (ctx?.anterior) {
        qc.setQueryData(['wa_figurinhas', instanciaId], ctx.anterior);
      }
      toast.error(err instanceof Error ? err.message : 'Não foi possível remover a figurinha');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['wa_figurinhas', instanciaId] });
    },
  });
}
