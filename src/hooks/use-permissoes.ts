import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Permissao {
  id: string;
  vendedor_id: string;
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
}

interface ModuloDescricao {
  key: string;
  label: string;
  descricoes: {
    ver: string;
    criar: string;
    editar: string;
    excluir: string;
  };
}

const MODULOS: ModuloDescricao[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    descricoes: {
      ver: 'Visualizar gráficos, métricas e indicadores comerciais',
      criar: 'Não aplicável ao Dashboard',
      editar: 'Não aplicável ao Dashboard',
      excluir: 'Não aplicável ao Dashboard',
    },
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    descricoes: {
      ver: 'Visualizar o Kanban com os leads e negócios',
      criar: 'Criar novos leads no pipeline',
      editar: 'Mover cards entre etapas e alterar dados',
      excluir: 'Remover leads do pipeline',
    },
  },
  {
    key: 'clientes',
    label: 'Clientes',
    descricoes: {
      ver: 'Visualizar lista de empresas e contatos',
      criar: 'Cadastrar novas empresas e contatos',
      editar: 'Alterar dados de empresas e contatos existentes',
      excluir: 'Remover empresas e contatos do sistema',
    },
  },
  {
    key: 'contatos',
    label: 'Contatos',
    descricoes: {
      ver: 'Visualizar lista de contatos',
      criar: 'Cadastrar novos contatos',
      editar: 'Alterar dados de contatos existentes',
      excluir: 'Remover contatos do sistema',
    },
  },
  {
    key: 'pedidos',
    label: 'Pedidos',
    descricoes: {
      ver: 'Visualizar lista de negócios/pedidos e detalhes',
      criar: 'Criar novos pedidos e orçamentos',
      editar: 'Alterar dados, status e itens dos pedidos',
      excluir: 'Remover pedidos do sistema',
    },
  },
  {
    key: 'obras',
    label: 'Obras',
    descricoes: {
      ver: 'Visualizar lista de obras cadastradas',
      criar: 'Cadastrar novas obras vinculadas a clientes',
      editar: 'Alterar dados e status das obras',
      excluir: 'Remover obras do sistema',
    },
  },
  {
    key: 'fabricantes',
    label: 'Fabricantes',
    descricoes: {
      ver: 'Visualizar fabricantes e tabelas de preços',
      criar: 'Cadastrar novos fabricantes',
      editar: 'Alterar dados de fabricantes e preços',
      excluir: 'Remover fabricantes do sistema',
    },
  },
  {
    key: 'portal',
    label: 'Portal',
    descricoes: {
      ver: 'Consultar licenças (IDEMA, Natal, Extremoz)',
      criar: 'Importar novas licenças via scraping',
      editar: 'Não aplicável ao Portal',
      excluir: 'Não aplicável ao Portal',
    },
  },
  {
    key: 'calendario',
    label: 'Calendário',
    descricoes: {
      ver: 'Visualizar eventos e prazos no calendário',
      criar: 'Criar novos eventos no calendário',
      editar: 'Alterar eventos existentes',
      excluir: 'Remover eventos do calendário',
    },
  },
  {
    key: 'tarefas',
    label: 'Tarefas',
    descricoes: {
      ver: 'Visualizar lista de tarefas',
      criar: 'Criar novas tarefas e atribuir responsáveis',
      editar: 'Alterar status, dados e responsáveis das tarefas',
      excluir: 'Remover tarefas do sistema',
    },
  },
  {
    key: 'chat',
    label: 'Chat',
    descricoes: {
      ver: 'Visualizar e ler mensagens do chat',
      criar: 'Enviar mensagens e criar grupos',
      editar: 'Não aplicável ao Chat',
      excluir: 'Excluir mensagens do chat',
    },
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    descricoes: {
      ver: 'Acessar página de configurações',
      criar: 'Não aplicável às Configurações',
      editar: 'Alterar configurações do sistema',
      excluir: 'Não aplicável às Configurações',
    },
  },
];

export { MODULOS };

export function usePermissoes(vendedorId?: string) {
  return useQuery({
    queryKey: ['permissoes_vendedor', vendedorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissoes_vendedor')
        .select('*')
        .eq('vendedor_id', vendedorId!);
      if (error) throw error;
      return data as Permissao[];
    },
    enabled: !!vendedorId,
  });
}

export function useUpsertPermissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      vendedor_id: string;
      modulo: string;
      pode_ver: boolean;
      pode_criar: boolean;
      pode_editar: boolean;
      pode_excluir: boolean;
    }) => {
      const { error } = await supabase
        .from('permissoes_vendedor')
        .upsert(data, { onConflict: 'vendedor_id,modulo' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['permissoes_vendedor', vars.vendedor_id] });
    },
  });
}
