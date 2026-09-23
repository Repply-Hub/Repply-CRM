import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O gancho dos anexos de uma tarefa — o ÚNICO lugar que fala com o balde `tarefa-anexos`.
 *
 * 🔴 TRÊS COISAS AQUI SÃO FACÉIS DE ERRAR EM SILÊNCIO, e por isso têm teste:
 *
 *   1. A RECUSA DE TIPO/TAMANHO TEM QUE BARRAR ANTES DA REDE. Sem isso, um arquivo grande
 *      demais gastaria o upload inteiro (e o tempo de quem está numa obra, com internet ruim)
 *      para só então ser recusado — ou pior, subiria e ficaria órfão no balde.
 *
 *   2. O ARQUIVO PODE SUBIR E A LINHA FALHAR DEPOIS. Fingir sucesso nesse caso deixa um arquivo
 *      no balde que a tela da tarefa nunca mostra — ninguém sabe que ele existe.
 *
 *   3. A RECUSA DA REGRA DE SEGURANÇA NO `delete` NÃO DEVOLVE ERRO (CLAUDE.md §4.6). Ela
 *      devolve sucesso com zero linhas. Sem conferir a contagem, a tela diria "anexo removido"
 *      sobre uma exclusão que não aconteceu.
 */

const toastSucesso = vi.fn();
const toastErro = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSucesso(...a),
    error: (...a: unknown[]) => toastErro(...a),
  },
}));

/** O perfil de quem está logado. Cada teste ajusta antes de renderizar o gancho. */
let perfilAtual: { empresa_id: string | null; id: string } | null = {
  empresa_id: 'empresa-1',
  id: 'usuario-1',
};
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: perfilAtual }),
}));

const enviou = vi.fn();
const gravouLinha = vi.fn();
const pediuRemocao = vi.fn();

let respostaDoEnvio: { error: unknown } = { error: null };
let respostaDaLista: { data: unknown; error: unknown } = { data: [], error: null };
let respostaDoInsert: { data: unknown; error: unknown } = {
  data: {
    id: 'anexo-1',
    url: 'https://balde/empresa-1/uuid/Orcamento_Obra_Exemplo.pdf',
    nome: 'Orçamento Obra Exemplo.pdf',
    tipo: 'application/pdf',
    tamanho_bytes: 12_345,
    created_at: '2026-09-17T10:00:00.000Z',
  },
  error: null,
};
let respostaDoDelete: { error: unknown; count: number | null } = { error: null, count: 1 };
/** A resposta de `insert(...)` quando NADA o encadeia — mesmo dublê do molde (`use-pedido-anexos`),
 *  reaproveitado aqui mesmo sem um caso de teste que precise dele hoje. */
let respostaDoInsertDireto: { error: unknown } = { error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (caminho: string, arquivo: unknown) => {
          enviou(caminho, arquivo);
          return respostaDoEnvio;
        },
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://balde/${caminho}` } }),
      }),
    },
    from: () => ({
      select: () => ({ eq: async () => respostaDaLista }),
      insert: (payload: unknown) => {
        gravouLinha(payload);
        return {
          select: () => ({ single: async () => respostaDoInsert }),
          then: (resolve: (v: { data: null; error: unknown }) => void) =>
            resolve({ data: null, error: respostaDoInsertDireto.error }),
        };
      },
      delete: (opcoes?: { count?: string }) => {
        pediuRemocao(opcoes);
        return { eq: () => ({ eq: async () => respostaDoDelete }) };
      },
    }),
  },
}));

import { useAnexosDaTarefa, useAdicionarAnexoDaTarefa, useRemoverAnexoDaTarefa } from './use-tarefa-anexos';

const TAREFA = 'tarefa-1';

function envolver() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

/** Só os campos que `recusaDoAnexoDeTarefa`/o upload olham — não precisa ser um `File` de verdade. */
function arquivo(nome: string, tamanho: number, tipo: string) {
  return { name: nome, size: tamanho, type: tipo } as unknown as File;
}

beforeEach(() => {
  perfilAtual = { empresa_id: 'empresa-1', id: 'usuario-1' };
  respostaDoEnvio = { error: null };
  respostaDaLista = { data: [], error: null };
  respostaDoInsert = {
    data: {
      id: 'anexo-1',
      url: 'https://balde/empresa-1/uuid/Orcamento_Obra_Exemplo.pdf',
      nome: 'Orçamento Obra Exemplo.pdf',
      tipo: 'application/pdf',
      tamanho_bytes: 12_345,
      created_at: '2026-09-17T10:00:00.000Z',
    },
    error: null,
  };
  respostaDoDelete = { error: null, count: 1 };
  respostaDoInsertDireto = { error: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useAnexosDaTarefa', () => {
  it('lista os anexos, mais novo em cima', async () => {
    respostaDaLista = {
      data: [
        { id: 'a', url: 'https://balde/a.pdf', nome: 'a.pdf', tipo: 'application/pdf', tamanho_bytes: 100, created_at: '2026-09-10T10:00:00Z' },
        { id: 'b', url: 'https://balde/b.pdf', nome: 'b.pdf', tipo: 'application/pdf', tamanho_bytes: 200, created_at: '2026-09-12T10:00:00Z' },
      ],
      error: null,
    };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAnexosDaTarefa(TAREFA), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data!.map((a) => a.id)).toEqual(['b', 'a']);
    expect(result.current.data![0]).toEqual({
      id: 'b', url: 'https://balde/b.pdf', nome: 'b.pdf', tipo: 'application/pdf', tamanhoBytes: 200, criadoEm: '2026-09-12T10:00:00Z',
    });
  });

  it('sem tarefa não consulta nada', () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAnexosDaTarefa(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAdicionarAnexoDaTarefa', () => {
  it('o arquivo sobe para a pasta da empresa e a linha guarda nome, tipo e tamanho', async () => {
    const { wrapper, client } = envolver();
    const invalidou = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAdicionarAnexoDaTarefa(TAREFA), { wrapper });

    const arquivoEnviado = arquivo('Orçamento Obra Exemplo.pdf', 2 * 1024 * 1024, 'application/pdf');
    let anexo: unknown;
    await act(async () => { anexo = await result.current.mutateAsync(arquivoEnviado); });

    // A pasta é a da empresa de quem envia — nunca outro caminho.
    const caminhoEnviado = enviou.mock.calls[0][0] as string;
    expect(caminhoEnviado).toMatch(/^empresa-1\/[0-9a-f-]{36}\/Orcamento_Obra_Exemplo\.pdf$/);

    // A linha guarda o nome que a PESSOA reconhece — não o sanitizado que virou chave no balde.
    expect(gravouLinha).toHaveBeenCalledWith(
      expect.objectContaining({
        tarefa_id: TAREFA,
        nome: 'Orçamento Obra Exemplo.pdf',
        tipo: 'application/pdf',
        tamanho_bytes: 2 * 1024 * 1024,
        criado_por: 'usuario-1',
      }),
    );

    expect(anexo).toEqual({
      id: 'anexo-1',
      url: 'https://balde/empresa-1/uuid/Orcamento_Obra_Exemplo.pdf',
      nome: 'Orçamento Obra Exemplo.pdf',
      tipo: 'application/pdf',
      tamanhoBytes: 12_345,
      criadoEm: '2026-09-17T10:00:00.000Z',
    });
    expect(toastSucesso).toHaveBeenCalled();
    // A lista da tela precisa se atualizar — sem esta invalidação, o anexo novo não aparece até
    // recarregar. Sem este assert, apagar a invalidação passaria despercebido.
    expect(invalidou).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['tarefa_anexos', TAREFA] }));
    // O clipe de contagem no card do Kanban lê da lista de tarefas (`['tarefas']`), não da lista
    // de anexos — sem esta invalidação ele fica parado até o próximo refetch.
    expect(invalidou).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['tarefas'] }));
  });

  it('🔴 arquivo recusado não sobe nem grava linha', async () => {
    // A recusa é a mesma de `recusaDoAnexoDeTarefa`: tipo fora da lista aceita. Ela tem que
    // barrar ANTES de qualquer rede — nem upload, nem gravação. `.exe` (e não `.docx`, como no
    // molde de negócio) porque a lista de tarefa é mais larga e aceita Word/Excel/PowerPoint.
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarAnexoDaTarefa(TAREFA), { wrapper });

    const arquivoRecusado = arquivo('instalador.exe', 10_000, 'application/x-msdownload');
    await act(async () => {
      await result.current.mutateAsync(arquivoRecusado).catch(() => {});
    });

    expect(enviou).not.toHaveBeenCalled();
    expect(gravouLinha).not.toHaveBeenCalled();
    expect(toastErro).toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/pdf|imagem/i);
  });

  it('🔴 arquivo grande demais não sobe nem grava linha', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarAnexoDaTarefa(TAREFA), { wrapper });

    const arquivoGrande = arquivo('orcamento.pdf', 20 * 1024 * 1024, 'application/pdf');
    await act(async () => {
      await result.current.mutateAsync(arquivoGrande).catch(() => {});
    });

    expect(enviou).not.toHaveBeenCalled();
    expect(gravouLinha).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/15 MB/);
  });

  it('sem empresa identificada, recusa antes de subir', async () => {
    perfilAtual = { empresa_id: null, id: 'usuario-1' };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarAnexoDaTarefa(TAREFA), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(arquivo('orcamento.pdf', 10_000, 'application/pdf')).catch(() => {});
    });

    expect(enviou).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/empresa não foi identificada/i);
  });

  it('🔴 linha falhou depois do envio: avisa que subiu mas não ficou preso à tarefa', async () => {
    // O arquivo JÁ ESTÁ no balde quando isto acontece. Fingir sucesso deixaria um arquivo
    // órfão, sem ninguém sabendo que ele existe.
    respostaDoInsert = { data: null, error: { message: 'linha recusada' } };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarAnexoDaTarefa(TAREFA), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(arquivo('orcamento.pdf', 10_000, 'application/pdf')).catch(() => {});
    });

    expect(enviou).toHaveBeenCalled();
    expect(toastSucesso).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/foi enviado/i);
    expect(toastErro.mock.calls[0][0]).toMatch(/não ficou/i);
  });

  it('🔴 upload falhou: não grava linha nenhuma (não deixa tarefa apontando para arquivo que não subiu)', async () => {
    respostaDoEnvio = { error: { message: 'balde fora do ar' } };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarAnexoDaTarefa(TAREFA), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(arquivo('orcamento.pdf', 10_000, 'application/pdf')).catch(() => {});
    });

    expect(enviou).toHaveBeenCalled();
    expect(gravouLinha).not.toHaveBeenCalled();
    expect(toastSucesso).not.toHaveBeenCalled();
  });
});

describe('useRemoverAnexoDaTarefa', () => {
  it('remove a linha e invalida a lista', async () => {
    const { wrapper, client } = envolver();
    const invalidou = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRemoverAnexoDaTarefa(TAREFA), { wrapper });

    await act(async () => { await result.current.mutateAsync('anexo-1'); });

    expect(pediuRemocao).toHaveBeenCalledWith({ count: 'exact' });
    expect(toastSucesso).toHaveBeenCalled();
    // A lista se atualiza depois de tirar — o teste prova a invalidação, não só o nome dele.
    expect(invalidou).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['tarefa_anexos', TAREFA] }));
    // O clipe de contagem no card do Kanban lê da lista de tarefas (`['tarefas']`), não da lista
    // de anexos — sem esta invalidação ele fica parado até o próximo refetch.
    expect(invalidou).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['tarefas'] }));
  });

  it('🔴 tirar anexo que a regra do banco recusa NÃO diz que removeu', async () => {
    // `delete` com count 0 e `error: null` é recusa silenciosa (CLAUDE.md §4.6): a regra de
    // segurança não achou a linha, o banco apagou zero registros e não devolveu erro nenhum.
    respostaDoDelete = { error: null, count: 0 };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoverAnexoDaTarefa(TAREFA), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('anexo-1').catch(() => {});
    });

    expect(toastErro).toHaveBeenCalled();
    expect(toastSucesso).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/não foi removido/i);
  });
});
