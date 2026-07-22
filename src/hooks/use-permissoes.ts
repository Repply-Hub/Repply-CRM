import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Permissao {
  id: string;
  usuario_id: string;
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
  funcionalidades: Record<string, boolean>;
}

export interface Funcionalidade {
  key: string;
  label: string;
  descricao: string;
  icon: 'import' | 'export' | 'filter' | 'move' | 'whatsapp' | 'pdf' | 'status' | 'assign' | 'group' | 'file' | 'users' | 'shield' | 'key' | 'ics' | 'scraping' | 'prices';
}

export interface ModuloDescricao {
  key: string;
  label: string;
  descricoes: {
    ver: string;
    criar: string;
    editar: string;
    excluir: string;
  };
  funcionalidades: Funcionalidade[];
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
    funcionalidades: [
      { key: 'filtrar_vendedor', label: 'Filtrar por Vendedor', descricao: 'Filtrar dados do dashboard por vendedor específico', icon: 'filter' },
      { key: 'exportar_relatorio', label: 'Exportar Relatório', descricao: 'Exportar dados e gráficos do dashboard', icon: 'export' },
    ],
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    descricoes: {
      ver: 'Visualizar o Kanban com os leads e negócios',
      criar: 'Criar novos leads no pipeline',
      editar: 'Alterar dados dos cards do pipeline',
      excluir: 'Remover leads do pipeline',
    },
    funcionalidades: [
      { key: 'mover_cards', label: 'Mover Cards', descricao: 'Arrastar cards entre as etapas do pipeline', icon: 'move' },
      { key: 'exportar_pdf', label: 'Exportar PDF', descricao: 'Gerar relatório em PDF do pipeline', icon: 'pdf' },
      { key: 'filtrar_avancado', label: 'Filtro Avançado', descricao: 'Usar filtros por vendedor, fabricante e período', icon: 'filter' },
    ],
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
    funcionalidades: [
      { key: 'importar', label: 'Importar Clientes', descricao: 'Importar clientes via planilha (CSV/Excel)', icon: 'import' },
      { key: 'exportar', label: 'Exportar Clientes', descricao: 'Exportar lista de clientes para planilha', icon: 'export' },
      { key: 'whatsapp', label: 'WhatsApp', descricao: 'Enviar mensagens via WhatsApp para clientes', icon: 'whatsapp' },
    ],
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
    funcionalidades: [
      { key: 'whatsapp', label: 'WhatsApp', descricao: 'Enviar mensagens via WhatsApp para contatos', icon: 'whatsapp' },
    ],
  },
  {
    key: 'pedidos',
    label: 'Pedidos',
    descricoes: {
      ver: 'Visualizar lista de negócios/pedidos e detalhes',
      criar: 'Criar novos pedidos e orçamentos',
      editar: 'Alterar dados e itens dos pedidos',
      excluir: 'Remover pedidos do sistema',
    },
    funcionalidades: [
      { key: 'importar', label: 'Importar Pedidos', descricao: 'Importar pedidos via planilha', icon: 'import' },
      { key: 'exportar_pdf', label: 'Exportar PDF', descricao: 'Gerar PDF dos pedidos', icon: 'pdf' },
      { key: 'alterar_status', label: 'Alterar Status', descricao: 'Mudar status do pedido (ex: Novo → Enviado)', icon: 'status' },
      { key: 'whatsapp', label: 'WhatsApp', descricao: 'Enviar cobrança ou acompanhamento via WhatsApp', icon: 'whatsapp' },
    ],
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
    funcionalidades: [
      { key: 'alterar_status', label: 'Alterar Status', descricao: 'Mudar status da obra (em andamento, concluída, parada)', icon: 'status' },
    ],
  },
  {
    key: 'fabricantes',
    label: 'Fabricantes',
    descricoes: {
      ver: 'Visualizar fabricantes e tabelas de preços',
      criar: 'Cadastrar novos fabricantes',
      editar: 'Alterar dados de fabricantes',
      excluir: 'Remover fabricantes do sistema',
    },
    funcionalidades: [
      { key: 'importar_precos', label: 'Importar Preços', descricao: 'Importar tabela de preços via planilha', icon: 'prices' },
      { key: 'gerenciar_precos', label: 'Gerenciar Preços', descricao: 'Editar e remover itens da tabela de preços', icon: 'prices' },
    ],
  },
  {
    key: 'portal',
    label: 'Portal',
    descricoes: {
      ver: 'Consultar licenças (IDEMA, Natal, Extremoz)',
      criar: 'Não aplicável ao Portal',
      editar: 'Não aplicável ao Portal',
      excluir: 'Não aplicável ao Portal',
    },
    funcionalidades: [
      { key: 'importar_licencas', label: 'Importar Licenças', descricao: 'Executar scraping para importar novas licenças', icon: 'scraping' },
    ],
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
    funcionalidades: [],
  },
  {
    key: 'tarefas',
    label: 'Tarefas',
    descricoes: {
      ver: 'Visualizar lista de tarefas',
      criar: 'Criar novas tarefas',
      editar: 'Alterar dados das tarefas',
      excluir: 'Remover tarefas do sistema',
    },
    funcionalidades: [
      { key: 'atribuir_responsavel', label: 'Atribuir Responsável', descricao: 'Definir ou alterar o responsável por uma tarefa', icon: 'assign' },
      { key: 'alterar_status', label: 'Alterar Status', descricao: 'Mudar status da tarefa (pendente, em andamento, concluída)', icon: 'status' },
    ],
  },
  {
    key: 'chat',
    label: 'Chat',
    descricoes: {
      ver: 'Visualizar e ler mensagens do chat',
      criar: 'Enviar novas mensagens',
      editar: 'Não aplicável ao Chat',
      excluir: 'Excluir mensagens do chat',
    },
    funcionalidades: [
      { key: 'criar_grupo', label: 'Criar Grupo', descricao: 'Criar grupos de conversa no chat', icon: 'group' },
      { key: 'enviar_arquivo', label: 'Enviar Arquivo', descricao: 'Enviar arquivos e documentos no chat', icon: 'file' },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    descricoes: {
      ver: 'Visualizar conversas de WhatsApp com clientes',
      criar: 'Iniciar novas conversas e enviar mensagens',
      editar: 'Arquivar conversas e gerenciar responsáveis',
      excluir: 'Não aplicável ao WhatsApp',
    },
    funcionalidades: [],
  },
  {
    key: 'emails',
    label: 'E-mails',
    descricoes: {
      ver: 'Visualizar caixa de e-mails recebidos e enviados',
      criar: 'Compor e enviar novos e-mails',
      editar: 'Não aplicável a E-mails',
      excluir: 'Excluir e-mails',
    },
    funcionalidades: [],
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
    funcionalidades: [
      { key: 'gerenciar_usuarios', label: 'Gerenciar Usuários', descricao: 'Cadastrar, editar e remover funcionários', icon: 'users' },
      { key: 'gerenciar_permissoes', label: 'Gerenciar Permissões', descricao: 'Configurar permissões de acesso dos funcionários', icon: 'shield' },
      { key: 'ver_codigo_acesso', label: 'Ver Código de Acesso', descricao: 'Visualizar e copiar o código de acesso da empresa', icon: 'key' },
    ],
  },
];

export { MODULOS };

export function usePermissoes(vendedorId?: string) {
  return useQuery({
    queryKey: ['permissoes_usuario', vendedorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissoes_usuario')
        .select('*')
        .eq('usuario_id', vendedorId!);
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...row,
        funcionalidades: (typeof row.funcionalidades === 'object' && row.funcionalidades !== null
          ? row.funcionalidades
          : {}) as Record<string, boolean>,
      })) as Permissao[];
    },
    enabled: !!vendedorId,
  });
}

export function useUpsertPermissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      usuario_id: string;
      modulo: string;
      pode_ver: boolean;
      pode_criar: boolean;
      pode_editar: boolean;
      pode_excluir: boolean;
      funcionalidades?: Record<string, boolean>;
    }) => {
      const { error } = await supabase
        .from('permissoes_usuario')
        .upsert({
          ...data,
          funcionalidades: data.funcionalidades ?? {},
        } as any, { onConflict: 'usuario_id,modulo' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['permissoes_usuario', vars.usuario_id] });
    },
  });
}
