import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NovoNegocioDialogProps } from '@/components/pedidos/NovoNegocioDialog';

/**
 * Tarefa 3 do desenho "Duplicar negócio" (docs/superpowers/specs/2026-09-12-duplicar-negocio-design.md):
 * `/pedidos/novo?copiaDe=<id>` monta a cópia. O que `montarCopiaDeNegocio` faz com os dados já
 * está provado em `src/lib/copia-de-negocio.test.ts` (Tarefa 1), e o que a própria janela faz
 * com `copiaDe` está provado em `NovoNegocioDialog.copia.test.tsx` (Tarefa 2). Este arquivo prova
 * só o que é desta página: QUANDO ela monta a janela, e com QUE dado.
 *
 * O ponto frágil: `copiaDe` só alimenta `useState` inicial dentro da janela (Tarefa 2) — se a
 * janela nascer antes de alguma das QUATRO consultas que alimentam a cópia (negócio original,
 * responsáveis, campos customizados da empresa, etapas do funil) terminar, aquele pedaço da
 * cópia fica vazio PARA SEMPRE, sem nenhum erro visível. Por isso os quatro hooks de dado viram
 * dublês que este arquivo controla um a um, e `NovoNegocioDialog` vira um dublê que só registra
 * as propriedades recebidas — sem desenhar formulário nenhum.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): 'negocio-1', 'cliente-1', 'fab-1', 'user-1', 'user-2',
 * 'funil-1', "Empresa Exemplo Ltda", 180000. O repositório é público.
 */

const {
  usePedidoPorIdMock,
  useResponsaveisDoNegocioMock,
  useConfiguracoesCamposMock,
  useKanbanColunasMock,
  useAuthMock,
  useMyVendedorIdMock,
  useIsGestorMock,
  toastErrorMock,
  propsRecebidas,
  montagens,
} = vi.hoisted(() => ({
  usePedidoPorIdMock: vi.fn(),
  useResponsaveisDoNegocioMock: vi.fn(),
  useConfiguracoesCamposMock: vi.fn(),
  useKanbanColunasMock: vi.fn(),
  useAuthMock: vi.fn(),
  useMyVendedorIdMock: vi.fn(),
  useIsGestorMock: vi.fn(),
  toastErrorMock: vi.fn(),
  propsRecebidas: [] as NovoNegocioDialogProps[],
  montagens: { current: 0 },
}));

vi.mock('@/hooks/use-pedidos', () => ({ usePedidoPorId: usePedidoPorIdMock }));
vi.mock('@/hooks/use-responsaveis-do-negocio', () => ({ useResponsaveisDoNegocio: useResponsaveisDoNegocioMock }));
vi.mock('@/hooks/use-configuracoes-campos', () => ({ useConfiguracoesCampos: useConfiguracoesCamposMock }));
vi.mock('@/hooks/use-kanban-colunas', () => ({ useKanbanColunas: useKanbanColunasMock }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-novo-pedido', () => ({ useMyVendedorId: useMyVendedorIdMock, useIsGestor: useIsGestorMock }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children, headerContent }: { children: React.ReactNode; headerContent?: React.ReactNode }) => (
    <div>
      <div data-testid="header-content">{headerContent}</div>
      {children}
    </div>
  ),
}));

// O dublê só registra o que recebeu. `useEffect` de dependência vazia conta MONTAGEM de
// verdade (uma vez por instância), não toda vez que o componente pai re-renderiza — é a prova
// de que a janela nasce uma vez só, já com a cópia pronta, e não troca de instância no meio.
vi.mock('@/components/pedidos/NovoNegocioDialog', () => ({
  NovoNegocioDialog: (props: NovoNegocioDialogProps) => {
    propsRecebidas.push(props);
    useEffect(() => {
      montagens.current += 1;
    }, []);
    return <div data-testid="novo-negocio-dialog-stub" />;
  },
}));

import NovoPedido from './NovoPedido';

interface EstadoConsulta<T> {
  data: T | undefined;
  isLoading: boolean;
}

function carregando<T>(): EstadoConsulta<T> {
  return { data: undefined, isLoading: true };
}

function resolvido<T>(data: T): EstadoConsulta<T> {
  return { data, isLoading: false };
}

const ORIGINAL_PADRAO = {
  id: 'negocio-1',
  status: 'negociacao',
  nome: null,
  valor_total: 180000,
  data_pedido: '2026-09-01',
  created_at: '2026-09-01T10:00:00Z',
  observacoes: null,
  cliente_id: 'cliente-1',
  fabricante_id: 'fab-1',
  usuario_id: 'user-1',
  obra_id: null,
  funil_id: 'funil-1',
  endereco_entrega: null,
  prazo_resposta: null,
  pdf_url: null,
  // 'observacoes_padrao' é campo PADRÃO (não deve ir para a cópia); 'ramo_atividade' é
  // CUSTOMIZADO da empresa (deve ir) — é a distinção que `montarCopiaDeNegocio` faz.
  campos_extras: { observacoes_padrao: 'rastro da importação, não copia', ramo_atividade: 'Varejo' },
  marcador_id: null,
  origem_lead: null,
  cliente: { id: 'cliente-1', empresa: 'Empresa Exemplo Ltda' },
  fabricante: { id: 'fab-1', nome: 'Fábrica Exemplo' },
  vendedor: { id: 'user-1', nome: 'Vendedor Um' },
  obra: null,
  marcador: null,
};

// user-1 é o vendedor principal (bate com ORIGINAL_PADRAO.usuario_id): fica de fora dos
// participantes, porque ele já é o `vendedorId` da cópia.
const RESPONSAVEIS_PADRAO = [
  { usuarioId: 'user-1', nome: 'Vendedor Um', avatarUrl: null, principal: true },
  { usuarioId: 'user-2', nome: 'Vendedor Dois', avatarUrl: null, principal: false },
];

const CAMPOS_CONFIG_PADRAO = [
  {
    id: 'cfg-1', empresa_id: 'empresa-1', entidade: 'pedidos' as const, origem: 'padrao' as const,
    campo_key: 'observacoes_padrao', label: null, tipo: 'texto', obrigatorio: false,
    obrigatorio_escopo: 'global' as const, etapasObrigatorias: [], ordem: 0, etapa: null, created_by: null,
  },
  {
    id: 'cfg-2', empresa_id: 'empresa-1', entidade: 'pedidos' as const, origem: 'customizado' as const,
    campo_key: 'ramo_atividade', label: 'Ramo de atividade', tipo: 'texto', obrigatorio: false,
    obrigatorio_escopo: 'global' as const, etapasObrigatorias: [], ordem: 1, etapa: null, created_by: 'user-1',
  },
];

// Já em ordem de `ordem` — a primeira é onde toda cópia nasce, nunca a etapa do original.
const COLUNAS_PADRAO = [
  { id: 'col-1', empresa_id: 'empresa-1', funil_id: 'funil-1', slug: 'contato_inicial', nome: 'Contato inicial', cor: 'kanban-new', ordem: 0, is_sistema: true, created_at: '', updated_at: '' },
  { id: 'col-2', empresa_id: 'empresa-1', funil_id: 'funil-1', slug: 'negociacao', nome: 'Negociação', cor: 'kanban-negotiation', ordem: 1, is_sistema: true, created_at: '', updated_at: '' },
];

function configurarHooks(overrides: {
  original?: EstadoConsulta<typeof ORIGINAL_PADRAO | null>;
  responsaveis?: EstadoConsulta<typeof RESPONSAVEIS_PADRAO>;
  campos?: EstadoConsulta<typeof CAMPOS_CONFIG_PADRAO>;
  colunas?: EstadoConsulta<typeof COLUNAS_PADRAO>;
  // Padrão: gestor. Com `quemDuplica.ehGestor` valendo `true`, a regra D1 não entra em jogo e
  // o comportamento fica igual ao de antes desta correção — o que os testes já existentes
  // (escritos antes de D1) continuam esperando.
  isGestor?: EstadoConsulta<boolean>;
  myVendedorId?: EstadoConsulta<string>;
} = {}) {
  useAuthMock.mockReturnValue({ profile: { id: 'user-1', empresa_id: 'empresa-1', role: 'vendedor' } });
  usePedidoPorIdMock.mockReturnValue(overrides.original ?? resolvido(ORIGINAL_PADRAO));
  useResponsaveisDoNegocioMock.mockReturnValue(overrides.responsaveis ?? resolvido(RESPONSAVEIS_PADRAO));
  useConfiguracoesCamposMock.mockReturnValue(overrides.campos ?? resolvido(CAMPOS_CONFIG_PADRAO));
  useKanbanColunasMock.mockReturnValue(overrides.colunas ?? resolvido(COLUNAS_PADRAO));
  useIsGestorMock.mockReturnValue(overrides.isGestor ?? resolvido(true));
  useMyVendedorIdMock.mockReturnValue(overrides.myVendedorId ?? resolvido('user-1'));
}

function montar(path = '/pedidos/novo?copiaDe=negocio-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NovoPedido />
    </MemoryRouter>,
  );
}

describe('NovoPedido — o endereço ?copiaDe= monta a cópia', () => {
  beforeEach(() => {
    propsRecebidas.length = 0;
    montagens.current = 0;
    vi.clearAllMocks();
    configurarHooks();
  });

  afterEach(() => cleanup());

  describe('enquanto alguma das quatro consultas está carregando, a janela não nasce', () => {
    it('negócio original ainda carregando', () => {
      configurarHooks({ original: carregando() });
      montar();
      expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();
      expect(montagens.current).toBe(0);
    });

    // A fresta que o rascunho original (esperandoACopia sem os quatro isLoading) deixava:
    // responsáveis chegando depois do negócio e das etapas.
    it('responsáveis ainda carregando', () => {
      configurarHooks({ responsaveis: carregando() });
      montar();
      expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();
      expect(montagens.current).toBe(0);
    });

    // A outra fresta: campos customizados da empresa chegando por último.
    it('campos customizados da empresa ainda carregando', () => {
      configurarHooks({ campos: carregando() });
      montar();
      expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();
      expect(montagens.current).toBe(0);
    });

    it('etapas do funil ainda carregando', () => {
      configurarHooks({ colunas: carregando() });
      montar();
      expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();
      expect(montagens.current).toBe(0);
    });

    // 🔴 A fresta que a Correção da revisão final (15/09/2026) fecha: sem esperar estas duas,
    // a cópia podia nascer tratando a pessoa como gestor (ou com um `usuarioId` vazio) e travar
    // assim para sempre — `copiaDe` só alimenta `useState` inicial dentro da janela.
    it('useIsGestor ainda carregando', () => {
      configurarHooks({ isGestor: carregando() });
      montar();
      expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();
      expect(montagens.current).toBe(0);
    });

    it('useMyVendedorId ainda carregando', () => {
      configurarHooks({ myVendedorId: carregando() });
      montar();
      expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();
      expect(montagens.current).toBe(0);
    });
  });

  it('quando responsáveis chegam depois do resto, a janela só nasce depois — nunca vazia', () => {
    configurarHooks({ responsaveis: carregando() });
    const { rerender } = montar();
    expect(screen.queryByTestId('novo-negocio-dialog-stub')).not.toBeInTheDocument();

    // A consulta de responsáveis termina agora, como aconteceria de verdade quando o React
    // Query atualiza o resultado e re-renderiza a página.
    useResponsaveisDoNegocioMock.mockReturnValue(resolvido(RESPONSAVEIS_PADRAO));
    rerender(
      <MemoryRouter initialEntries={['/pedidos/novo?copiaDe=negocio-1']}>
        <NovoPedido />
      </MemoryRouter>,
    );

    expect(montagens.current).toBe(1);
    const props = propsRecebidas[propsRecebidas.length - 1];
    expect(props.copiaDe?.participantes).toEqual(['user-2']);
  });

  it('com as quatro consultas prontas, monta a janela UMA vez com a cópia completa', () => {
    montar();

    expect(montagens.current).toBe(1);
    expect(propsRecebidas).toHaveLength(1);

    const props = propsRecebidas[0];
    expect(props.copiaDe).toBeDefined();
    // O principal (user-1, dono de valor) fica fora: só quem participa sem ser o dono.
    expect(props.copiaDe?.participantes).toEqual(['user-2']);
    // Só o campo customizado ('ramo_atividade') viaja — o padrão ('observacoes_padrao') não.
    expect(props.copiaDe?.camposExtras).toEqual({ ramo_atividade: 'Varejo' });
    // A primeira etapa do funil, nunca a etapa em que o original estava ('negociacao').
    expect(props.copiaDe?.status).toBe('contato_inicial');
    expect(props.status).toBe('contato_inicial');
    expect(props.funilId).toBe('funil-1');
    expect(props.clienteId).toBe('cliente-1');
  });

  it('negócio original numa etapa de fechamento: a cópia nasce na primeira etapa mesmo assim', () => {
    configurarHooks({ original: resolvido({ ...ORIGINAL_PADRAO, status: 'fechamento' }) });
    montar();

    const props = propsRecebidas[propsRecebidas.length - 1];
    expect(props.copiaDe?.status).toBe('contato_inicial');
    expect(props.status).toBe('contato_inicial');
  });

  it('sem ?copiaDe, a janela nasce direto — sem cópia, com os parâmetros da URL de sempre', () => {
    montar('/pedidos/novo?clienteId=cliente-1&status=negociacao&funilId=funil-1');

    expect(montagens.current).toBe(1);
    const props = propsRecebidas[propsRecebidas.length - 1];
    expect(props.copiaDe).toBeUndefined();
    expect(props.clienteId).toBe('cliente-1');
    expect(props.status).toBe('negociacao');
    expect(props.funilId).toBe('funil-1');
  });

  // Decisão D1 do dono do produto (15/09/2026, ver docs/superpowers/specs/2026-09-12-duplicar-
  // negocio-design.md §3): quem duplica NÃO é gestor e não é o principal do original vira o
  // ÚNICO responsável da cópia — nem o principal do original, nem os outros responsáveis dele.
  it('D1: vendedor comum duplicando o negócio de outra pessoa vira o único responsável', () => {
    configurarHooks({
      isGestor: resolvido(false),
      myVendedorId: resolvido('user-9'),
    });
    montar();

    expect(montagens.current).toBe(1);
    const props = propsRecebidas[0];
    expect(props.copiaDe?.vendedorId).toBe('user-9');
    expect(props.copiaDe?.participantes).toEqual([]);
  });

  // Decisão D2 do dono do produto (15/09/2026): negócio que sumiu ou que a pessoa não pode ver
  // abre a janela de Novo Negócio em branco, com um aviso — não trava a tela.
  describe('D2: negócio original não encontrado', () => {
    it('mostra o aviso UMA vez e monta a janela em branco (copiaDe undefined)', () => {
      configurarHooks({ original: resolvido(null) });
      montar();

      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Não foi possível abrir o negócio para duplicar — ele pode ter sido excluído.',
      );
      expect(montagens.current).toBe(1);
      const props = propsRecebidas[propsRecebidas.length - 1];
      expect(props.copiaDe).toBeUndefined();
    });

    it('não repete o aviso quando a página re-renderiza depois de mostrado', () => {
      configurarHooks({ original: resolvido(null) });
      const { rerender } = montar();
      expect(toastErrorMock).toHaveBeenCalledTimes(1);

      rerender(
        <MemoryRouter initialEntries={['/pedidos/novo?copiaDe=negocio-1']}>
          <NovoPedido />
        </MemoryRouter>,
      );

      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });
  });
});
