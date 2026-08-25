import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ObraContato {
  id: string;
  nomeContato: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
}

interface ContatoRow {
  id: string;
  nome_contato: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
}

/**
 * Contatos vinculados especificamente a esta obra (não a empresa toda) —
 * lista simples filtrada por `obra_id`, sem agregação, então não precisa de
 * RPC (CLAUDE.md §6.4 é sobre soma/contagem, não sobre listar).
 */
export function useContatosDaObra(obraId?: string | null) {
  return useQuery({
    queryKey: ['obra_contatos', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contatos')
        .select('id, nome_contato, cargo, email, telefone')
        .eq('obra_id', obraId!)
        .order('nome_contato');
      if (error) throw error;
      return (data as ContatoRow[]).map((c) => ({
        id: c.id,
        nomeContato: c.nome_contato,
        cargo: c.cargo,
        email: c.email,
        telefone: c.telefone,
      })) as ObraContato[];
    },
    enabled: !!obraId,
  });
}
