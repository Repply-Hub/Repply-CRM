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
 * Atributos que o Nylas usa para marcar pasta de sistema, em qualquer provedor.
 */
const ATRIBUTOS_DE_SISTEMA = [
  '\\inbox', '\\sent', '\\drafts', '\\trash', '\\spam', '\\junk',
  '\\archive', '\\all', '\\important', '\\starred', '\\flagged',
];

/**
 * Rótulos que o próprio Gmail cria e que chegam SEM atributo nenhum.
 *
 * Sem esta lista, `CATEGORY_PERSONAL` e `UNREAD` passariam por marcador feito
 * pela pessoa e virariam item na barra lateral — a caixa real desta empresa tem
 * 35 mensagens em CATEGORY_PERSONAL. Espelha `ehPastaDeSistema` das edge
 * functions; as duas pontas precisam concordar sobre o que é marcador, senão a
 * tela oferece compartilhar uma pasta que o backend considera de sistema.
 */
const IDS_DE_SISTEMA_DO_GOOGLE = new RegExp(
  '^(' +
    'INBOX|SENT|DRAFT|DRAFTS|SPAM|TRASH|STARRED|UNREAD|IMPORTANT|CHAT' +
    // Abas da caixa de entrada: CATEGORY_PERSONAL, CATEGORY_PROMOTIONS…
    '|CATEGORY_[A-Z]+' +
    // As "superestrelas" do Gmail — marcação visual, não pasta da pessoa.
    '|(YELLOW|RED|ORANGE|GREEN|BLUE|PURPLE)_(STAR|BANG)' +
    '|ORANGE_GUILLEMET|GREEN_CHECK|BLUE_INFO|PURPLE_QUESTION' +
  ')$',
);

/**
 * Pastas e marcadores da caixa conectada.
 *
 * A lista é espelhada do provedor pelo email-sync a cada varredura, então
 * marcador criado hoje no Gmail aparece aqui na próxima sincronização — e
 * marcador excluído lá some daqui, para ninguém clicar num filtro morto.
 *
 * O que volta já vem filtrado pela RLS: quem foi liberado só num marcador
 * enxerga só aquele. A barra lateral não precisa (nem deve) refiltrar.
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
          ehSistema:
            attrs.some((a) => ATRIBUTOS_DE_SISTEMA.includes(a)) ||
            IDS_DE_SISTEMA_DO_GOOGLE.test((p.pasta_id ?? '').trim()),
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
  /** Liberada a caixa toda (linha com `pasta_id` nulo). */
  caixaInteira: boolean;
  /** `pasta_id`s liberados individualmente. */
  marcadores: string[];
  /** Gestor/dono enxerga pelo cargo; a liberação explícita não se aplica. */
  porPapel: boolean;
}

/** Papéis que enxergam a caixa sem precisar de liberação. */
const PAPEIS_QUE_ADMINISTRAM = ['gestor', 'empresa', 'admin'];

/**
 * Quem enxerga a caixa da empresa — o "compartilhar caixa" do Bitrix.
 *
 * A unidade de compartilhamento é (pessoa, marcador), não (pessoa). Numa caixa
 * de atendimento isso é o que importa: quem cuida da ELIZABETH não precisa ler
 * o que é da DECA. `pasta_id` nulo continua significando a caixa inteira.
 *
 * Gestores e o dono aparecem sempre como liberados porque a regra do banco
 * (`tenho_acesso_a_mensagem`) os inclui por serem quem administra a conexão —
 * mostrar a caixinha desmarcada para eles seria mentira.
 */
export function useCompartilhamentoCaixa(contaId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['email_caixa_acesso', contaId],
    queryFn: async (): Promise<UsuarioDaCaixa[]> => {
      const [{ data: pessoas }, { data: liberacoes }] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id, nome, email, role')
          .is('deleted_at', null)
          .order('nome'),
        supabase
          .from('email_conta_usuarios')
          .select('usuario_id, pasta_id')
          .eq('conta_id', contaId!),
      ]);

      const porUsuario = new Map<string, { inteira: boolean; marcadores: string[] }>();
      for (const l of liberacoes ?? []) {
        const atual = porUsuario.get(l.usuario_id) ?? { inteira: false, marcadores: [] };
        if (l.pasta_id === null) atual.inteira = true;
        else atual.marcadores.push(l.pasta_id);
        porUsuario.set(l.usuario_id, atual);
      }

      return (pessoas ?? []).map((u) => {
        const acesso = porUsuario.get(u.id);
        return {
          usuarioId: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          caixaInteira: acesso?.inteira ?? false,
          marcadores: acesso?.marcadores ?? [],
          porPapel: PAPEIS_QUE_ADMINISTRAM.includes(u.role ?? ''),
        };
      });
    },
    enabled: !!contaId,
  });

  const alternar = useMutation({
    mutationFn: async ({
      usuarioId,
      pastaId,
      liberar,
    }: {
      usuarioId: string;
      /** `null` = a caixa inteira. */
      pastaId: string | null;
      liberar: boolean;
    }) => {
      if (liberar) {
        const { error } = await supabase
          .from('email_conta_usuarios')
          .insert({ conta_id: contaId!, usuario_id: usuarioId, pasta_id: pastaId });
        // 23505 = já estava liberado. Corrida entre dois gestores na mesma tela
        // não é erro: o resultado desejado já é o que está no banco.
        if (error && error.code !== '23505') throw error;
        return;
      }

      let consulta = supabase
        .from('email_conta_usuarios')
        .delete()
        .eq('conta_id', contaId!)
        .eq('usuario_id', usuarioId);

      // `.eq(coluna, null)` vira `coluna=eq.null` no PostgREST e NUNCA casa —
      // em SQL, `NULL = NULL` é nulo, não verdadeiro. Tirar o acesso à caixa
      // inteira exige `is`, senão o clique não faz nada e a caixinha volta
      // sozinha ao recarregar.
      consulta = pastaId === null
        ? consulta.is('pasta_id', null)
        : consulta.eq('pasta_id', pastaId);

      const { error } = await consulta;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_caixa_acesso', contaId] });
      // O que a pessoa liberada enxerga muda na hora: as pastas e as mensagens
      // dela passam pela mesma regra.
      queryClient.invalidateQueries({ queryKey: ['email_pastas'] });
    },
    onError: (e: Error) => {
      toast.error('Não foi possível alterar o acesso: ' + e.message);
    },
  });

  return {
    pessoas: query.data ?? [],
    isLoading: query.isLoading,
    alternar: (usuarioId: string, pastaId: string | null, liberar: boolean) =>
      alternar.mutate({ usuarioId, pastaId, liberar }),
    isSalvando: alternar.isPending,
  };
}
