import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A aba "Empresa" — que a partir de 31/08/2026 o GESTOR também vê.
 *
 * 🔴 POR QUE ESTES TESTES NASCERAM JUNTO COM A LIBERAÇÃO. Abrir uma tela para mais gente não
 * é só mudar quem entra: é multiplicar quem esbarra nos defeitos dela. A investigação achou
 * três, e o pior é silencioso:
 *
 *   1. a gravação não conferia quantas linhas mudaram, e recusa da regra de segurança do
 *      banco NÃO devolve erro — ela devolve sucesso com zero linhas. A tela dizia
 *      "Empresa atualizada!" por cima de uma gravação que não aconteceu;
 *   2. o salvar não invalidava a chave de cache que a própria tela lê, então sair da aba e
 *      voltar mostrava o dado antigo — que se lê como "não salvou";
 *   3. o erro chegava em inglês, cru do Postgres.
 */

const useAuthFalso = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthFalso() }));

const toastSucesso = vi.fn();
const toastErro = vi.fn();
// As funções entram embrulhadas em seta de propósito: `vi.mock` é içado para o topo do
// arquivo, então referenciar `toastSucesso` direto aqui o lê antes de existir.
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSucesso(...a),
    error: (...a: unknown[]) => toastErro(...a),
  },
}));

/** O que o banco vai responder ao UPDATE. Cada teste ajusta. */
let respostaDoUpdate: { data: unknown; error: unknown } = { data: [{ id: 'e1' }], error: null };
const updateChamadoCom = vi.fn();

const EMPRESA = {
  id: 'e1',
  nome: 'MD Representações',
  nome_fantasia: 'MD',
  cnpj: '12345678000199',
  codigo_acesso: 'MD-2024',
  created_at: '2024-01-01T00:00:00Z',
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      // A leitura de MinhaEmpresaView: .select(...).eq(...).single()
      select: () => ({ eq: () => ({ single: async () => ({ data: EMPRESA, error: null }) }) }),
      // A gravação: .update(...).eq(...).select('id')
      update: (payload: unknown) => {
        updateChamadoCom(payload);
        return { eq: () => ({ select: async () => respostaDoUpdate }) };
      },
    }),
  },
}));

import { EmpresasTab } from './EmpresasTab';

function desenhar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const r = render(
    <QueryClientProvider client={client}>
      <EmpresasTab mode="empresa" />
    </QueryClientProvider>,
  );
  return { ...r, client };
}

const salvar = () => fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }));

beforeEach(() => {
  useAuthFalso.mockReturnValue({ profile: { id: 'u1', role: 'gestor', empresa_id: 'e1' } });
  respostaDoUpdate = { data: [{ id: 'e1' }], error: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EmpresasTab, visão da própria empresa', () => {
  it('mostra os dados da empresa para o gestor', async () => {
    desenhar();
    await screen.findByDisplayValue('MD Representações');
    expect(screen.getByDisplayValue('MD')).toBeTruthy();
  });

  it('🔴 o código de acesso não se edita aqui', async () => {
    desenhar();
    const campo = await screen.findByDisplayValue('MD-2024');
    expect(campo).toBeDisabled();
  });

  it('salva os três campos cadastrais, e só eles', async () => {
    desenhar();
    await screen.findByDisplayValue('MD Representações');
    salvar();

    await waitFor(() => expect(updateChamadoCom).toHaveBeenCalled());
    // 🔴 Nada de owner_id, codigo_acesso ou secao_preset_id — são as colunas que decidem
    // dono, entrada de gente nova e quais seções a empresa tem.
    expect(Object.keys(updateChamadoCom.mock.calls[0][0]).sort()).toEqual([
      'cnpj',
      'nome',
      'nome_fantasia',
    ]);
  });

  it('🔴 zero linhas alteradas NÃO é sucesso — é recusa silenciosa do banco', async () => {
    // O caso que existia de verdade: a regra de segurança recusa sem devolver erro.
    respostaDoUpdate = { data: [], error: null };

    desenhar();
    await screen.findByDisplayValue('MD Representações');
    salvar();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(toastSucesso).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/não foi salva/i);
  });

  it('🔴 e o aviso diz onde olhar, em vez de só falhar', async () => {
    respostaDoUpdate = { data: [], error: null };
    desenhar();
    await screen.findByDisplayValue('MD Representações');
    salvar();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(toastErro.mock.calls[0][0]).toMatch(/bloqueado/i);
  });

  it('🔴 recusa do banco chega em português, não no texto cru do Postgres', async () => {
    respostaDoUpdate = {
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy for table "empresas"' },
    };

    desenhar();
    await screen.findByDisplayValue('MD Representações');
    salvar();

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(toastErro.mock.calls[0][0]).not.toMatch(/row-level|policy|violates/i);
  });

  it('🔴 salvar invalida a chave que a própria tela lê', async () => {
    // Sem isto, sair da aba e voltar remonta o formulário com o dado ANTIGO do cache — e a
    // leitura de quem está do outro lado é "minha edição sumiu".
    const { client } = desenhar();
    const invalidar = vi.spyOn(client, 'invalidateQueries');

    await screen.findByDisplayValue('MD Representações');
    salvar();

    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(chaves).toContain(JSON.stringify(['minha_empresa']));
  });

  it('gestor sem empresa vinculada recebe explicação, não uma tela quebrada', () => {
    useAuthFalso.mockReturnValue({ profile: { id: 'u1', role: 'gestor', empresa_id: null } });
    desenhar();
    expect(screen.getByText(/nenhuma empresa vinculada/i)).toBeTruthy();
  });
});
