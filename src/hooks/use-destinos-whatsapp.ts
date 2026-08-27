import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  montarDestinos,
  type ContatoCru,
  type ConversaCrua,
  type DestinoWhatsApp,
} from '@/lib/destinos-whatsapp';

/**
 * Para quem dá para mandar algo por WhatsApp: os contatos cadastrados MAIS as conversas abertas
 * atribuídas a quem está usando o sistema.
 *
 * A junção e a remoção de repetidos são puras e moram em `src/lib/destinos-whatsapp.ts` — aqui
 * só acontece a ida ao banco.
 *
 * 🔴 AS CONVERSAS SÃO FILTRADAS NO BANCO, não no navegador. O caminho óbvio seria reusar
 * `useWaConversas()` e peneirar com `responsaveis.some(r => r.id === profile.id)`, que é o que a
 * caixa de entrada faz — mas ali a lista inteira é a tela. Aqui é só uma janela de escolher
 * destinatário, e arrastar as 779 conversas da empresa para peneirar 70 contraria o CLAUDE.md
 * §6.4 ("some no banco, não no navegador").
 *
 * 🔴 `whatsapp_conversa_responsaveis.usuario_id` aponta para `usuarios(id)`, então o filtro usa
 * `profile.id` — NÃO `profile.user_id`, que é o login. São identificadores diferentes da mesma
 * pessoa, e trocar um pelo outro não dá erro: a consulta simplesmente volta vazia, e a lista
 * pareceria "você não tem conversa atribuída" (CLAUDE.md §4.5).
 */

const TETO_DE_CONTATOS = 500;

export function useDestinosWhatsApp(habilitado: boolean) {
  const { profile } = useAuth();
  const usuarioId = profile?.id ?? null;

  const contatos = useQuery({
    queryKey: ['destinos-whatsapp', 'contatos'],
    enabled: habilitado,
    queryFn: async (): Promise<ContatoCru[]> => {
      const { data, error } = await supabase
        .from('contatos')
        .select('id, nome_contato, empresa, telefone')
        .not('telefone', 'is', null)
        .neq('telefone', '')
        .order('nome_contato')
        .limit(TETO_DE_CONTATOS);
      if (error) throw error;
      return (data ?? []) as ContatoCru[];
    },
  });

  const conversas = useQuery({
    queryKey: ['destinos-whatsapp', 'conversas', usuarioId],
    enabled: habilitado && !!usuarioId,
    queryFn: async (): Promise<ConversaCrua[]> => {
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        // `!inner` é o que transforma o vínculo em FILTRO: sem ele, a consulta traria todas as
        // conversas e só anexaria os responsáveis de cada uma.
        .select('id, nome_contato, telefone, is_group, whatsapp_conversa_responsaveis!inner(usuario_id)')
        .eq('whatsapp_conversa_responsaveis.usuario_id', usuarioId!)
        .eq('arquivada', false)
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ConversaCrua[];
    },
  });

  const destinos: DestinoWhatsApp[] = montarDestinos(contatos.data, conversas.data);

  return {
    destinos,
    carregando: contatos.isLoading || conversas.isLoading,
    // Falha de UM lado não pode esconder o outro: se as conversas falharem, os contatos ainda
    // servem para mandar, e vice-versa. Quem desenha avisa o que faltou.
    falhouContatos: contatos.isError,
    falhouConversas: conversas.isError,
  };
}
