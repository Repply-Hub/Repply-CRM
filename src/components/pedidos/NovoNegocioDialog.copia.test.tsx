import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
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

// Aponta para os MESMOS arquivos do negócio original, pelo link — é o contrato de
// `CopiaDeNegocio.anexos` (src/lib/copia-de-negocio.ts): a cópia nunca duplica arquivo. Dois
// itens, de propósito: prova que a lista INTEIRA viaja, não só o primeiro.
const ANEXOS_DA_COPIA = [
  {
    url: 'https://exemplo.test/storage/v1/object/public/pedido-anexos/empresa-1/aaa/orcamento-exemplo.pdf',
    nome: 'orcamento-exemplo.pdf',
    tipo: 'application/pdf',
  },
  {
    url: 'https://exemplo.test/storage/v1/object/public/pedido-anexos/empresa-1/bbb/planta-exemplo.png',
    nome: 'planta-exemplo.png',
    tipo: 'image/png',
  },
];

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
  anexos: ANEXOS_DA_COPIA,
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

  it('os DOIS anexos herdados aparecem no passo 2, com o nome que veio do negócio original', () => {
    desenhar();

    // Config de campos vazia (mock acima) deixa "Próximo" sempre habilitado — não há campo
    // obrigatório nenhum para preencher antes de avançar.
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));

    expect(screen.getByText(ANEXOS_DA_COPIA[0].nome)).toBeInTheDocument();
    expect(screen.getByText(ANEXOS_DA_COPIA[1].nome)).toBeInTheDocument();
    expect(screen.getAllByTestId('anexo-linha')).toHaveLength(2);
  });

  it('a lixeira de um anexo herdado só tira ELE da tela — o outro fica, e nada muda no banco', () => {
    desenhar();
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`remover ${ANEXOS_DA_COPIA[0].nome}`, 'i') }));

    expect(screen.queryByText(ANEXOS_DA_COPIA[0].nome)).toBeNull();
    // O outro anexo herdado continua na lista — tirar um não mexe nos demais.
    expect(screen.getByText(ANEXOS_DA_COPIA[1].nome)).toBeInTheDocument();
    expect(screen.getAllByTestId('anexo-linha')).toHaveLength(1);

    // O original não pode ser afetado: nenhuma chamada de banco ou de armazenamento.
    expect(storageUploadSpy).not.toHaveBeenCalled();
    expect(supabaseDeleteSpy).not.toHaveBeenCalled();
    expect(supabaseUpdateSpy).not.toHaveBeenCalled();
    expect(supabaseInsertSpy).not.toHaveBeenCalled();
    expect(createPedidoMock).not.toHaveBeenCalled();
  });

  // Pacote 5 (17/09/2026): a cópia leva a LISTA de anexos, não mais um único `pdf_url`. Criar a
  // partir dela herda os dois — uma linha em `pedido_anexos` por item, apontando para o MESMO
  // arquivo — sem subir nada. Sucede o antigo teste "M1-T2" da revisão de 15/09/2026.
  it('"Criar Negócio" herda os DOIS anexos da cópia, sem subir arquivo nenhum', async () => {
    createPedidoMock.mockResolvedValue({ id: 'negocio-2' });
    const { onCreated } = desenhar();

    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));
    fireEvent.click(screen.getByRole('button', { name: /criar negócio/i }));

    await waitFor(() => expect(createPedidoMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('negocio-2'));

    // Sem `pdf_url`: os anexos têm tabela própria agora, gravada DEPOIS que o negócio existe.
    const payloadEnviado = createPedidoMock.mock.calls[0][0];
    expect(payloadEnviado.pdf_url).toBeUndefined();
    expect(storageUploadSpy).not.toHaveBeenCalled();
    expect(supabaseInsertSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        pedido_id: 'negocio-2',
        url: ANEXOS_DA_COPIA[0].url,
        nome: ANEXOS_DA_COPIA[0].nome,
        tipo: ANEXOS_DA_COPIA[0].tipo,
        criado_por: 'user-1',
      }),
      expect.objectContaining({
        pedido_id: 'negocio-2',
        url: ANEXOS_DA_COPIA[1].url,
        nome: ANEXOS_DA_COPIA[1].nome,
        tipo: ANEXOS_DA_COPIA[1].tipo,
        criado_por: 'user-1',
      }),
    ]);
  });

  // CLAUDE.md §4.6: erro do Supabase NÃO é um `Error` — é `{ message, details, hint, code }` —,
  // e `e.message` cru pulava a parte útil (`details`/`hint`) que o banco manda junto.
  it('gravação recusada mostra a frase de mensagemDeErro, não a mensagem crua do banco', async () => {
    const erroDoBanco = {
      message: 'duplicate key value violates unique constraint',
      code: '23505',
      details: 'Key (id)=(negocio-2) already exists.',
      hint: null,
    };
    createPedidoMock.mockRejectedValue(erroDoBanco);
    desenhar();

    fireEvent.click(screen.getByRole('button', { name: /próximo/i }));
    fireEvent.click(screen.getByRole('button', { name: /criar negócio/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // A frase que `mensagemDeErro` monta junta `message` e `details` — é ela, e não
    // `erroDoBanco.message` sozinho, que precisa chegar à tela.
    expect(toast.error).toHaveBeenCalledWith(mensagemDeErro(erroDoBanco));
    expect(toast.error).not.toHaveBeenCalledWith(erroDoBanco.message);
  });
});
