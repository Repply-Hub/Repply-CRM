import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

/**
 * Registra por que a empresa está cancelando, no instante em que ela cancela.
 *
 * 🔴 QUEM CHAMA ENGOLE O ERRO DE PROPÓSITO (ver `CancelarAssinaturaDialog`). Este hook não
 * tenta ser silencioso sozinho — ele lança normalmente, e a decisão de ignorar mora na tela,
 * onde está o contexto: prender alguém que quer sair porque a NOSSA telemetria falhou é
 * atrito que vira reclamação.
 */

interface Motivo {
  /** Uma das opções fixas da tela. Vazio quando a pessoa não quis escolher. */
  motivo: string;
  /** O texto livre, quando houver. */
  detalhe: string | null;
}

export function useRegistrarMotivoDeCancelamento() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ motivo, detalhe }: Motivo) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (!empresaId) throw new Error('Sem empresa vinculada.');

      const { error } = await supabase.from('assinatura_cancelamentos').insert({
        empresa_id: empresaId,
        // 🔴 `usuarios.id`, não `usuarios.user_id`. São identificadores DIFERENTES da mesma
        // pessoa, e a chave estrangeira desta tabela aponta para o primeiro (CLAUDE.md §4.5).
        // Errar aqui não dá erro visível: a gravação inteira é recusada pela chave
        // estrangeira e a tela cai numa frase genérica.
        usuario_id: profile?.id ?? null,
        motivo: motivo || null,
        detalhe,
      });

      if (error) throw error;
    },
  });
}
