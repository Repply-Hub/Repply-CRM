import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invalidarPaineisDeNegocios } from './use-pedidos';

export function useObrasByCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['obras', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .eq('cliente_id', clienteId!)
        .order('nome_obra');
      if (error) throw error;
      return data;
    },
  });
}

export function useMyVendedorId() {
  return useQuery({
    queryKey: ['my_vendedor_id'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_vendedor_id');
      if (error) throw error;
      return data as string;
    },
  });
}

export function useIsGestor() {
  return useQuery({
    queryKey: ['is_gestor'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_gestor');
      if (error) throw error;
      return data as boolean;
    },
  });
}

export interface NovoPedidoPayload {
  cliente_id: string;
  fabricante_id: string;
  usuario_id: string;
  funil_id: string;
  obra_id?: string;
  status?: string;
  /** Nome customizado do negócio. Ausente/null = usar nome automático ("empresa | fabricante"). */
  nome?: string | null;
  marcador_id?: string | null;
  data_pedido: string;
  prazo_resposta?: string;
  origem_lead?: string;
  endereco_entrega?: string;
  observacoes?: string;
  pdf_url?: string;
  valor_total?: number;
  proximo_contato?: string;
  campos_extras?: Record<string, string>;
  /**
   * Os responsáveis ALÉM do principal. O principal é o `usuario_id` acima — ele não entra
   * aqui, porque o gatilho do banco já cria a linha dele sozinho.
   */
  participantes?: string[];
}

export function useCreatePedidoCompleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: NovoPedidoPayload) => {
      // 1. Create pedido
      const { data: pedido, error: pedidoErr } = await supabase
        .from('pedidos')
        .insert({
          cliente_id: payload.cliente_id,
          fabricante_id: payload.fabricante_id,
          usuario_id: payload.usuario_id,
          funil_id: payload.funil_id,
          obra_id: payload.obra_id || null,
          nome: payload.nome || null,
          data_pedido: payload.data_pedido,
          status: payload.status || 'novo_lead',
          marcador_id: payload.marcador_id || null,
          observacoes: payload.observacoes || null,
          pdf_url: payload.pdf_url || null,
          // Aqui o `null` é seguro (diferente do formulário de edição): o campo "Data de
          // Fechamento" é opcional e o negócio pode nascer já em Fechamento/Perdido. Se
          // vier vazio nessa situação, o gatilho `fn_set_pedido_fechado_em` (migration
          // 20260821120100) carimba a data de hoje no INSERT — sem isso o negócio nasceria
          // ganho e sem data, invisível em qualquer relatório por fechamento.
          prazo_resposta: payload.prazo_resposta || null,
          origem_lead: payload.origem_lead || null,
          endereco_entrega: payload.endereco_entrega || null,
          valor_total: payload.valor_total || 0,
          campos_extras: payload.campos_extras || {},
        })
        .select('id')
        .single();
      if (pedidoErr) throw pedidoErr;

      // 2. 🔴 NÃO grava mais em `itens_pedido`.
      //
      // O módulo de catálogo de produtos saiu em 26/08/2026: nunca teve dado real (1 item em
      // 11.910 negócios, nenhum criado dentro do CRM), e o que a representação precisa é o PDF
      // do orçamento com o valor, não a lista de produtos.
      //
      // A TABELA CONTINUA EXISTINDO, de propósito: ela guarda aquela 1 linha de um negócio
      // real, e apagá-la destruiria o único registro que alguém um dia pode perguntar por quê.
      // Ela só deixou de receber linha nova. Ver docs/operacao/catalogo-de-produtos-removido.md.

      // 2b. Os responsáveis além do principal.
      //
      // 🔴 O PRINCIPAL NÃO ENTRA AQUI. O gatilho `trg_semeia_responsavel` já criou a linha
      // dele no INSERT acima. Mandá-lo de novo violaria a chave primária e derrubaria a
      // criação inteira — e "consertar" isso com `upsert` seria pior: o caminho de UPDATE
      // rebaixaria o principal, e o negócio ficaria sem quem leva o valor, em silêncio.
      const extras = (payload.participantes ?? []).filter((id) => id && id !== payload.usuario_id);
      let avisoDeParticipantes: string | null = null;

      if (extras.length > 0) {
        const { error: errParticipantes } = await supabase.from('pedido_responsaveis').insert(
          extras.map((usuarioId) => ({
            pedido_id: pedido.id,
            usuario_id: usuarioId,
            principal: false,
          })),
        );

        // 🔴 FALHA AQUI NÃO DERRUBA A CRIAÇÃO, e isso é deliberado. O negócio JÁ EXISTE neste
        // ponto; lançar o erro deixaria o formulário aberto e preenchido, e o próximo clique
        // criaria um negócio DUPLICADO. Além disso, gravar responsável exige a permissão de
        // EDITAR negócios — régua mais dura que a de criar —, então um vendedor comum pode
        // ser recusado justamente aqui, depois de o negócio já ter nascido.
        //
        // O negócio fica com o principal certo (o gatilho garantiu) e quem faltou pode ser
        // acrescentado na edição. O aviso diz isso em vez de sumir com a informação.
        if (errParticipantes) {
          avisoDeParticipantes =
            'O negócio foi criado, mas não foi possível gravar os outros responsáveis. Acrescente-os pela edição do negócio.';
        }
      }

      // 3. Insert historico_contatos if proximo_contato set
      if (payload.proximo_contato) {
        await supabase.from('historico_contatos').insert({
          pedido_id: pedido.id,
          usuario_id: payload.usuario_id,
          tipo: 'automatico',
          descricao: 'Contato agendado na criação do negócio',
          proximo_contato_em: payload.proximo_contato,
        });
      }

      return { ...pedido, avisoDeParticipantes };
    },
    onSuccess: (resultado) => {
      // O negócio nasceu; o aviso só conta o que ficou faltando dentro dele.
      if (resultado?.avisoDeParticipantes) toast.warning(resultado.avisoDeParticipantes, { duration: 8000 });
      // Um negócio novo pode nascer já em Fechamento (venda registrada depois do fato), então
      // mexe em tudo — inclusive nos painéis que esta lista não invalidava (o total do
      // cabeçalho de Negócios, os cartões do Dashboard e o Plano de Vendas). A lista mora em
      // use-pedidos.ts para não existirem duas versões dela.
      invalidarPaineisDeNegocios(qc);
    },
  });
}

export function useCreateFabricanteCompleto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nome: string; cnpj?: string; nome_contato?: string; telefone?: string }) => {
      const { data: created, error } = await supabase
        .from('fabricantes')
        .insert(data)
        .select('id')
        .single();
      if (error) throw error;
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fabricantes'] });
    },
  });
}
