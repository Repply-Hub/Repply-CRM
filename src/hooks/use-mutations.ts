import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { useRegistrarAtividade } from './use-historico-alteracoes';

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insertData: {
      empresa?: string;
      razao_social?: string;
      tipo: string;
      cnpj?: string;
      email?: string;
      telefone?: string;
      endereco?: string;
      campos_extras?: Record<string, string>;
    }) => {
      // Get current usuario_id
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { data: created, error } = await supabase.from('clientes').insert({
        ...insertData,
        data_criacao: new Date().toISOString().slice(0, 10),
        usuario_id: vid,
        criado_por_usuario_id: vid,
      }).select('id').single();
      if (error) throw error;
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useCreateContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      empresa?: string;
      cliente_id?: string;
      nome_contato?: string;
      email?: string;
      telefone?: string;
      cargo?: string;
      obra_id?: string | null;
      campos_extras?: Record<string, string>;
    }) => {
      const { data: vid, error: vidErr } = await supabase.rpc('get_my_vendedor_id');
      // Sem dono resolvido, NÃO grava: `usuario_id` nulo cria um contato órfão que a
      // regra de leitura vaza para todas as empresas (docs/divida-tecnica.md §58). Mesmo
      // padrão de `use-tarefas.ts`.
      if (vidErr || !vid) throw new Error('Usuário não encontrado. Faça login novamente.');
      // `.select().single()` para devolver o contato criado: quem cria contato de
      // dentro da obra precisa do id na hora, para já marcá-lo no vínculo.
      const { data: criado, error } = await supabase
        .from('contatos')
        .insert({
          ...data,
          data_criacao: new Date().toISOString().slice(0, 10),
          usuario_id: vid,
          criado_por_usuario_id: vid,
        })
        .select('id')
        .single();
      if (error) throw error;
      return criado;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contatos'] });
      qc.invalidateQueries({ queryKey: ['contatos_do_cliente'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      empresa?: string;
      razao_social?: string;
      tipo?: string;
      cnpj?: string;
      email?: string;
      telefone?: string;
      endereco?: string;
      nome_contato?: string;
      campos_extras?: Record<string, string>;
    }) => {
      const { error } = await supabase.from('clientes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'clientes',
          registroId: id,
          acao: 'DELETE',
          descricao: 'Excluiu um cliente',
        });
      }
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}
export function useDeleteContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contatos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      // O banco apaga o vínculo junto (cascade), mas o cache não sabe disso: sem
      // invalidar as chaves do vínculo, o contato excluído continua listado na ficha
      // da obra e o clique cai numa página de contato que não existe mais.
      ['contatos', 'contatos_do_cliente', 'obra_contatos', 'contato_obras', 'clientes'].forEach(
        (chave) => qc.invalidateQueries({ queryKey: [chave] })
      );
    },
  });
}
export function useUpdateContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      nome_contato?: string;
      email?: string;
      telefone?: string;
      cargo?: string;
      empresa?: string;
      cliente_id?: string | null;
      obra_id?: string | null;
      campos_extras?: Record<string, string>;
    }) => {
      const { error } = await supabase.from('contatos').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      // A ficha da obra mostra os contatos vinculados: sem invalidar as chaves do
      // vínculo, editar o nome ou o cargo de um contato deixava a seção da obra
      // exibindo o dado velho até recarregar a página.
      qc.invalidateQueries({ queryKey: ['contatos'] });
      qc.invalidateQueries({ queryKey: ['contatos_do_cliente'] });
      qc.invalidateQueries({ queryKey: ['obra_contatos'] });
      qc.invalidateQueries({ queryKey: ['contato_obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}
export function useCreatePedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      cliente_id: string;
      fabricante_id: string;
      obra_id?: string;
      valor_total?: number;
      observacoes?: string;
    }) => {
      const { data: vid } = await supabase.rpc('get_my_vendedor_id');
      const { error } = await supabase.from('pedidos').insert({
        ...data,
        usuario_id: vid,
        status: 'novo_lead',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedidos_por_cliente'] });
    },
  });
}

export function useCreateVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nome?: string; email: string; telefone?: string; role?: string }) => {
      const { error } = await supabase.from('usuarios').insert({
        ...data,
        role: data.role || 'vendedor',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function useCreateObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      nome_obra: string;
      cliente_id: string;
      endereco_entrega?: string;
      marcador_id?: string | null;
      spe_cnpj?: string;
      campos_extras?: Record<string, string>;
    }) => {
      // Sem `status`: o "Status Inicial" virou marcador e a coluna vai ser derrubada. Este
      // insert PRECISA parar de mandá-la ANTES do DROP, e o site novo precisa estar publicado
      // antes dele — senão existe uma janela em que o cadastro de obra dá erro em produção.
      //
      // Enquanto a coluna existir, omiti-la é seguro: ela é NOT NULL mas tem DEFAULT
      // ('em_andamento'), e o Postgres só aplica o default quando a coluna é OMITIDA do
      // insert. Mandá-la explicitamente, mesmo vazia, é o que anulava o default — foi assim
      // que obra entrava no banco com status em branco.
      // `.select().single()` para devolver a obra criada: o cadastro pode trazer
      // contatos já marcados, e o vínculo só pode ser gravado depois que a obra
      // existe e tem id. Os outros três chamadores ignoram o retorno.
      const { data: criada, error } = await supabase
        .from('obras')
        .insert(data)
        .select('id')
        .single();
      if (error) throw error;
      return criada;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useUpdateObra() {
  const qc = useQueryClient();
  return useMutation({
    // `campos_extras` entra aqui porque o create já aceitava e este não: dava para cadastrar
    // uma obra com campo personalizado preenchido e depois NÃO conseguir alterar aquele
    // valor — a edição descartava o campo em silêncio. `status` sai dos dois: quem grava a
    // etiqueta agora é `marcador_id`, e a edição nunca precisou reescrever a coluna legada.
    mutationFn: async ({ id, ...data }: {
      id: string;
      nome_obra?: string;
      cliente_id?: string;
      endereco_entrega?: string;
      marcador_id?: string | null;
      spe_cnpj?: string;
      campos_extras?: Record<string, string>;
      // Enviados como null quando o endereço muda: zerar o carimbo é o que faz o mapa
      // re-geocodificar a obra (ver useGeocodeObras). Nunca são enviados com valor.
      latitude?: null;
      longitude?: null;
      geocoded_at?: null;
    }) => {
      const { error } = await supabase.from('obras').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      // As duas chaves continuam obrigatórias: a ficha do cliente mostra as obras embutidas,
      // então invalidar só ['obras'] deixaria a tela do cliente com o dado velho.
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      // A ficha do contato mostra o NOME das obras vinculadas: renomear a obra sem
      // isto deixaria o nome velho lá até recarregar a página.
      qc.invalidateQueries({ queryKey: ['contato_obras'] });
    },
  });
}

export function useDeleteObra() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('Excluindo obra única:', id);
      const { data, error } = await supabase.from('obras').delete().eq('id', id).select();
      if (error) {
        console.error('Erro ao excluir obra única:', error);
        throw error;
      }
      console.log('Resultado exclusão única:', data);
      return data;
    },
    onSuccess: (_data, id) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'obras',
          registroId: id,
          acao: 'DELETE',
          descricao: 'Excluiu uma obra',
        });
      }
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      // O vínculo com contatos cai junto no banco (cascade); as telas que o mostram
      // precisam saber disso sem esperar recarregar.
      qc.invalidateQueries({ queryKey: ['obra_contatos'] });
      qc.invalidateQueries({ queryKey: ['contato_obras'] });
    },
  });
}

export function useDeleteObrasBulk() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const registrarAtividade = useRegistrarAtividade();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      console.log('Iniciando exclusão em massa via RPC para IDs:', ids);
      if (!ids || ids.length === 0) {
        console.warn('Nenhum ID fornecido para exclusão');
        return;
      }

      // Usamos a função RPC para contornar problemas de performance/RLS em grandes volumes
      const { data, error } = await supabase.rpc('delete_obras_bulk', {
        obra_ids: ids
      });

      if (error) {
        console.error('Erro ao excluir obras em massa (RPC):', error);
        throw error;
      }
      return data;
    },
    onSuccess: (_data, ids) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (empresaId && profile?.id) {
        registrarAtividade.mutate({
          empresaId,
          usuarioId: profile.id,
          tabela: 'obras',
          acao: 'DELETE',
          descricao: `Excluiu ${ids.length} obra(s) em massa`,
        });
      }
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['obra_contatos'] });
      qc.invalidateQueries({ queryKey: ['contato_obras'] });
    },
  });
}

// 🔴 `useCreateFabricante` SAIU DAQUI em 28/08/2026 — está em `src/hooks/use-fabricantes.ts`.
//
// O que existia aqui aceitava só `{ nome, cnpj, nome_contato, telefone }` e invalidava apenas
// a chave `['fabricantes']`. Quando o fabricante ganhou `ativo`, esta versão passou a ser uma
// armadilha em duas frentes: descartaria o status EM SILÊNCIO (o objeto extra simplesmente não
// entra no insert) e não mexeria no filtro do Dashboard nem no Plano de Vendas, que leem pela
// chave `['fabricantes_filtro']`.
//
// Ficar aqui sem chamador nenhum era pior que não existir: o próximo autocompletar ofereceria
// as duas, e a diferença entre elas não aparece na assinatura.
