import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';

/**
 * Tirar e devolver o acesso de alguém da equipe.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 POR QUE ISTO EXISTE (item 38 da dívida técnica, parte 2)
 * ---------------------------------------------------------------------------------
 * Até 23/09/2026 o botão "Remover" só gravava `deleted_at` na linha de `usuarios`. O login em
 * `auth.users` continuava vivo, e não havia NENHUMA chamada de revogação em todo o repositório.
 * Medido naquele dia: uma pessoa removida em 11/09 ainda tinha login ativo, sessão aberta e
 * token de renovação válido.
 *
 * As migrations do mesmo dia fecharam o banco. Mas **16 funções de servidor consultam
 * `usuarios` com chave de serviço e ignoram toda regra do banco** — enquanto o login viver,
 * quem saiu ainda manda WhatsApp em nome da empresa por esse caminho.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 UMA OPERAÇÃO SÓ, NO SERVIDOR — a lição do item 39
 * ---------------------------------------------------------------------------------
 * Carimbar a data aqui e revogar o login lá seriam DOIS gestos, e entre dois gestos há sempre
 * uma janela: um que falhe deixa a pessoa "removida na tela e com acesso" ou "sem acesso e
 * ativa na tela". A função `usuario-acesso` faz os dois ou nenhum.
 *
 * Por isso estes hooks NÃO tocam em `usuarios` — há teste que falha se alguém voltar a gravar
 * direto (`use-acesso-de-usuario.test.tsx`).
 *
 * **É reversível**, de propósito: o banimento tem prazo e é desfeito por "Restaurar". Nunca
 * apagar a conta de `auth.users` — isso levaria junto o rastro de quem fez o quê no histórico.
 */

/** Tudo o que muda depois de tirar ou devolver acesso a alguém. */
function recarregarListas(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['usuarios'] });
  qc.invalidateQueries({ queryKey: ['usuarios_removidos'] });
}

export function useRevogarAcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const res = await supabase.functions.invoke('usuario-acesso', {
        body: { acao: 'revogar', usuario_id: usuarioId },
      });
      if (res.error) throw await erroLegivelDaFunction(res.error, 'Não foi possível remover o acesso.');
      return res.data;
    },
    onSuccess: () => {
      recarregarListas(qc);
      toast.success('Usuário removido e acesso revogado.');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover o acesso.');
    },
  });
}

export function useDevolverAcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const res = await supabase.functions.invoke('usuario-acesso', {
        body: { acao: 'devolver', usuario_id: usuarioId },
      });
      if (res.error) throw await erroLegivelDaFunction(res.error, 'Não foi possível restaurar o acesso.');
      return res.data;
    },
    onSuccess: () => {
      recarregarListas(qc);
      toast.success('Usuário restaurado e acesso devolvido.');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível restaurar o acesso.');
    },
  });
}
