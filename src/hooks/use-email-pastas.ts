import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Uma pasta/marcador da caixa, como o provedor a entrega. */
export interface PastaEmail {
  id: string;
  pastaId: string;
  nome: string;
  atributos: string[];
  naoLidas: number | null;
  /** Pasta do provedor (Entrada, Enviados, Lixeira) e não marcador do usuário. */
  ehSistema: boolean;
}

/**
 * Atributos que o Nylas usa para marcar pasta de sistema. O que NÃO tem nenhum
 * deles é marcador criado por quem usa a caixa — no Gmail, os "001 - ELIZABETH",
 * "004 - DECA" que a pessoa organizou.
 */
const ATRIBUTOS_DE_SISTEMA = [
  '\\inbox', '\\sent', '\\drafts', '\\trash', '\\spam', '\\archive',
  '\\all', '\\important', '\\starred',
];

/**
 * Pastas e marcadores da caixa conectada.
 *
 * A lista é espelhada do provedor pelo email-sync a cada varredura, então
 * marcador criado hoje no Gmail aparece aqui na próxima sincronização — e
 * marcador excluído lá some daqui, para ninguém clicar num filtro morto.
 *
 * Nada aqui interpreta o NOME da pasta. A organização é de quem tem a caixa;
 * tentar casar com o cadastro do CRM funcionaria numa empresa e quebraria na
 * seguinte, que usa outro critério.
 */
export function useEmailPastas(contaId?: string | null) {
  return useQuery({
    queryKey: ['email_pastas', contaId],
    queryFn: async (): Promise<PastaEmail[]> => {
      const { data, error } = await supabase
        .from('email_pastas')
        .select('id, pasta_id, nome, atributos, nao_lidas')
        .eq('conta_id', contaId!)
        .order('nome');

      if (error) {
        console.warn('[email] não consegui ler as pastas:', error.message);
        return [];
      }

      return (data ?? []).map((p) => {
        const attrs = (p.atributos ?? []).map((a: string) => a.toLowerCase());
        return {
          id: p.id,
          pastaId: p.pasta_id,
          nome: p.nome,
          atributos: attrs,
          naoLidas: p.nao_lidas,
          ehSistema: attrs.some((a) => ATRIBUTOS_DE_SISTEMA.includes(a)),
        };
      });
    },
    enabled: !!contaId,
    staleTime: 60_000,
  });
}

export interface UsuarioDaCaixa {
  usuarioId: string;
  nome: string | null;
  email: string | null;
  role: string | null;
  /** Gestores enxergam sem estar na lista; a linha existe só para os demais. */
  liberadoExplicitamente: boolean;
}

/**
 * Quem enxerga a caixa da empresa — o "compartilhar caixa".
 *
 * Duas listas em uma: todo mundo da empresa, marcando quem já tem acesso.
 * Gestores e o dono aparecem sempre como liberados porque a regra do banco
 * (`tenho_acesso_a_caixa`) os inclui por serem quem administra a conexão —
 * mostrar a caixinha desmarcada para eles seria mentira.
 */
export function useCompartilhamentoCaixa(contaId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['email_caixa_acesso', contaId],
    queryFn: async (): Promise<UsuarioDaCaixa[]> => {
      const [{ data: pessoas }, { data: liberados }] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id, nome, email, role')
          .is('deleted_at', null)
          .order('nome'),
        supabase
          .from('email_conta_usuarios')
          .select('usuario_id')
          .eq('conta_id', contaId!),
      ]);

      const idsLiberados = new Set((liberados ?? []).map((l) => l.usuario_id));

      return (pessoas ?? []).map((u) => ({
        usuarioId: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        liberadoExplicitamente: idsLiberados.has(u.id),
      }));
    },
    enabled: !!contaId,
  });

  const alternar = useMutation({
    mutationFn: async ({ usuarioId, liberar }: { usuarioId: string; liberar: boolean }) => {
      if (liberar) {
        const { error } = await supabase
          .from('email_conta_usuarios')
          .insert({ conta_id: contaId!, usuario_id: usuarioId });
        // 23505 = já estava liberado. Corrida entre dois gestores na mesma tela
        // não é erro: o resultado desejado já é o que está no banco.
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from('email_conta_usuarios')
          .delete()
          .eq('conta_id', contaId!)
          .eq('usuario_id', usuarioId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_caixa_acesso', contaId] });
    },
    onError: (e: Error) => {
      toast.error('Não foi possível alterar o acesso: ' + e.message);
    },
  });

  return {
    pessoas: query.data ?? [],
    isLoading: query.isLoading,
    alternar: (usuarioId: string, liberar: boolean) => alternar.mutate({ usuarioId, liberar }),
    isSalvando: alternar.isPending,
  };
}
