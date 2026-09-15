import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CopiaDeNegocio } from '@/lib/copia-de-negocio';

/**
 * Tarefa 2 do desenho "Duplicar negócio" (docs/superpowers/specs/2026-09-12-duplicar-negocio-design.md
 * §6): a janela de Novo Negócio, ao receber `copiaDe`, nasce PREENCHIDA e não grava nada sozinha.
 *
 * Este arquivo prova só o que pertence a esta janela — não ao gatilho que monta a cópia
 * (`src/lib/copia-de-negocio.ts`, Tarefa 1) nem à página que a chama com `copiaDe` + `status` +
 * `funilId` (`NovoPedido.tsx`, Tarefa 3).
 *
 * A janela importa muitos hooks de domínio; todos são substituídos por versões mínimas, no
 * mesmo molde de `FabricanteSelector.test.tsx`. `@/integrations/supabase/client` também vira um
 * dublê: além de nenhum destes testes poder disparar rede de verdade, ele serve para provar que
 * abrir com uma cópia NUNCA insere, atualiza, apaga ou envia arquivo — só o clique em "Criar
 * Negócio" pode.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): 'cliente-1', 'fab-1', 'user-1', "Empresa Exemplo Ltda",
 * 180000. O repositório é público.
 */

const {
  createPedidoMock,
  createFabricanteMock,
  createObraMock,
  createClienteMock,
  supabaseInsertSpy,
  supabaseUpdateSpy,
  supabaseDeleteSpy,
  storageUploadSpy,
  storageGetPublicUrlSpy,
} = vi.hoisted(() => ({
  createPedidoMock: vi.fn(),
  createFabricanteMock: vi.fn(),
  createObraMock: vi.fn(),
  createClienteMock: vi.fn(),
  supabaseInsertSpy: vi.fn(),
  supabaseUpdateSpy: vi.fn(),
  supabaseDeleteSpy: vi.fn(),
  storageUploadSpy: vi.fn(async () => ({ data: { path: 'anexo.pdf' }, error: null })),
  storageGetPublicUrlSpy: vi.fn(() => ({ data: { publicUrl: 'https://exemplo.test/anexo.pdf' } })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/use-clientes', () => ({
  useClientes: () => ({ data: [{ id: 'cliente-1', empresa: 'Empresa Exemplo Ltda', tipo: 'construtora' }] }),
  useFabricantes: () => ({ data: [{ id: 'fab-1', nome: 'Fábrica Exemplo', ativo: true }] }),
  useVendedores: () => ({ data: [{ id: 'user-1', nome: 'Vendedor Exemplo', avatar_url: null }] }),
}));

vi.mock('@/hooks/use-kanban-colunas', () => ({
  useKanbanColunas: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-marcadores', () => ({
  useMarcadores: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-funis', () => ({
  useFunis: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-novo-pedido', () => ({
  useObrasByCliente: () => ({ data: [], isLoading: false, isError: false }),
  useMyVendedorId: () => ({ data: 'user-1' }),
  useIsGestor: () => ({ data: true }),
  useCreatePedidoCompleto: () => ({ mutateAsync: createPedidoMock, isPending: false }),
  useCreateFabricanteCompleto: () => ({ mutateAsync: createFabricanteMock, isPending: false }),
}));

vi.mock('@/hooks/use-obras', () => ({
  useObras: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-mutations', () => ({
  useCreateObra: () => ({ mutateAsync: createObraMock, isPending: false }),
  useCreateCliente: () => ({ mutateAsync: createClienteMock, isPending: false }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', empresa_id: 'empresa-1', role: 'vendedor' } }),
}));

// Mantém `resolveFieldLabel` e `isCampoObrigatorioNaEtapa` de verdade — só o hook de dados troca.
vi.mock('@/hooks/use-configuracoes-campos', async (original) => ({
  ...(await original<typeof import('@/hooks/use-configuracoes-campos')>()),
  // Config vazia é a fresta real documentada em src/test/passos-do-novo-negocio.test.ts: sem
  // configuração nenhuma, nenhum campo é obrigatório — é o que deixa este teste andar de passo 1
  // a passo 2 sem precisar simular o preenchimento de cada campo do formulário.
  useConfiguracoesCampos: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-secoes', () => ({
  useSecaoLigada: () => ({ ligada: false, carregando: false }),
}));

// Não estão na lista de hooks da própria janela — pertencem a EmpresaSelector e
// OrigemLeadSelect, que ela desenha sempre no passo 1. Sem isto eles disparariam consulta de
// verdade (mesmo com o cliente supabase abaixo sendo um dublê, é ruído evitável).
vi.mock('@/hooks/use-clientes-tipos', () => ({
  useClientesTipos: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-origens-pedido', () => ({
  useOrigensPedido: () => ({ data: [] }),
}));

vi.mock('@/integrations/supabase/client', () => {
  type Encadeavel = (...args: unknown[]) => ConstrutorDeConsulta;

  interface ConstrutorDeConsulta {
    select: Encadeavel;
    eq: Encadeavel;
    neq: Encadeavel;
    order: Encadeavel;
    range: Encadeavel;
    is: Encadeavel;
    not: Encadeavel;
    limit: Encadeavel;
    ilike: Encadeavel;
    in: Encadeavel;
    insert: Encadeavel;
    update: Encadeavel;
    delete: Encadeavel;
    single: () => Promise<{ data: null; error: null }>;
    maybeSingle: () => Promise<{ data: null; error: null }>;
    then: (resolve: (valor: { data: unknown[]; error: null }) => void) => void;
  }

  // Construtor de consulta genérico: qualquer encadeamento (`.select().eq().order()...`)
  // devolve a si mesmo, e `await` nele resolve como uma busca vazia — suficiente para os hooks
  // que ainda batem no cliente de verdade (nenhum, neste arquivo, fora dos dois acima). Só
  // insert/update/delete ficam sob espião, para provar que a janela não grava nada sozinha.
  function criarConstrutorDeConsulta(): ConstrutorDeConsulta {
    // `encadeia` fecha sobre `builder` por referência — só é lido quando alguém chama o método
    // encadeado, bem depois deste `const` terminar de inicializar. Não é o mesmo `builder` sendo
    // lido durante a própria montagem.
    const encadeia = (espiao?: (...args: unknown[]) => void): Encadeavel => (...args) => {
      espiao?.(...args);
      return builder;
    };
    const builder: ConstrutorDeConsulta = {
      select: encadeia(),
      eq: encadeia(),
      neq: encadeia(),
      order: encadeia(),
      range: encadeia(),
      is: encadeia(),
      not: encadeia(),
      limit: encadeia(),
      ilike: encadeia(),
      in: encadeia(),
      insert: encadeia(supabaseInsertSpy),
      update: encadeia(supabaseUpdateSpy),
      delete: encadeia(supabaseDeleteSpy),
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }

  return {
    supabase: {
      from: vi.fn(() => criarConstrutorDeConsulta()),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      storage: {
        from: vi.fn(() => ({ upload: storageUploadSpy, getPublicUrl: storageGetPublicUrlSpy })),
      },
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
      },
    },
  };
});

import { NovoNegocioDialog } from './NovoNegocioDialog';

// Aponta para o MESMO arquivo do negócio original, pelo link — é o contrato de
// `CopiaDeNegocio.pdfUrl` (src/lib/copia-de-negocio.ts): a cópia nunca duplica arquivo.
const COPIA_DE_EXEMPLO: CopiaDeNegocio = {
  rotuloDoOriginal: 'Empresa Exemplo Ltda | Fábrica Exemplo',
  clienteId: 'cliente-1',
  obraId: '',
  fabricanteId: 'fab-1',
  vendedorId: 'user-1',
  participantes: [],
  funilId: 'funil-1',
  status: 'novo_lead',
  marcadorId: '',
  origemLead: '',
  enderecoEntrega: '',
  valor: 180000,
  pdfUrl: 'https://exemplo.test/storage/v1/object/public/pedido-anexos/empresa-1/aaa/orcamento-exemplo.pdf',
  nome: '',
  nomeAutomatico: true,
  camposExtras: {},
};

function desenhar() {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <NovoNegocioDialog
          open
          onOpenChange={onOpenChange}
          copiaDe={COPIA_DE_EXEMPLO}
          status="novo_lead"
          funilId="funil-1"
          onCreated={onCreated}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange, onCreated };
}

describe('NovoNegocioDialog — nasce preenchido por uma cópia', () => {
  afterEach(() => cleanup());

  it('mostra o aviso "Cópia de <original>" assim que abre', () => {
    // O `<Dialog>` do Radix desenha o conteúdo num Portal, direto em `document.body` — fora do
    // `container` que `render()` devolve. É por isso que a checagem lê o body inteiro.
    desenhar();
    expect(document.body.textContent).toContain('Cópia de');
    expect(screen.getByText(COPIA_DE_EXEMPLO.rotuloDoOriginal)).toBeInTheDocument();
  });

  it('abrir com uma cópia não grava nada: nem o negócio, nem insert/upload no banco', () => {
    desenhar();
    expect(createPedidoMock).not.toHaveBeenCalled();
    expect(storageUploadSpy).not.toHaveBeenCalled();
    expect(supabaseInsertSpy).not.toHaveBeenCalled();
  });

  it('fechar pelo "X" sem confirmar não cria o negócio', () => {
    const { onOpenChange } = desenhar();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createPedidoMock).not.toHaveBeenCalled();
  });

  it('o anexo herdado aparece no passo 2, com o nome tirado da URL e o aviso de onde veio', () => {
    desenhar();

    // Config de campos vazia (mock acima) deixa "Próximo" sempre habilitado — não há campo
    // obrigatório nenhum para preencher antes de avançar.
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));

    expect(screen.getByText('orcamento-exemplo.pdf')).toBeInTheDocument();
    expect(screen.getByText('Anexo do negócio copiado')).toBeInTheDocument();
  });

  it('a lixeira do anexo herdado só tira da tela — não apaga nada no banco nem no armazenamento', () => {
    desenhar();
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));

    const linhaDeOrigem = screen.getByText('Anexo do negócio copiado');
    const botaoRemover = linhaDeOrigem.closest('div')?.nextElementSibling as HTMLElement | null;
    expect(botaoRemover).toBeTruthy();

    fireEvent.click(botaoRemover!);

    expect(screen.queryByText('orcamento-exemplo.pdf')).toBeNull();
    expect(screen.queryByText('Anexo do negócio copiado')).toBeNull();
    // Some o anexo herdado, e o campo volta ao convite normal de anexar um PDF.
    expect(screen.getByText('Clique ou arraste o PDF aqui')).toBeInTheDocument();

    // O original não pode ser afetado: nenhuma chamada de banco ou de armazenamento.
    expect(storageUploadSpy).not.toHaveBeenCalled();
    expect(supabaseDeleteSpy).not.toHaveBeenCalled();
    expect(supabaseUpdateSpy).not.toHaveBeenCalled();
    expect(createPedidoMock).not.toHaveBeenCalled();
  });
});
