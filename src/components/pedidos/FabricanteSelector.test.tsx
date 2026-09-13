import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CnpjData, ResultadoDaConsulta } from '@/lib/cnpj';

/**
 * Achado crítico da revisão de 11/09/2026: fechar o modal de "Cadastrar Novo Fabricante"
 * ENQUANTO a conferência de CNPJ ainda está rodando (até 10 s contra a Receita) não cancela o
 * cadastro. Nem o "X" nem o "Cancelar" desmontam este componente — o `<Dialog>` só esconde —,
 * então a função de salvar em andamento segue até o fim quando a Receita finalmente responde:
 * grava a fábrica que a pessoa desistiu de cadastrar e troca, em silêncio, o fabricante
 * selecionado no negócio que ela está montando (`onValueChange`).
 *
 * A guarda é uma sessão (`sessaoRef` em FabricanteSelector.tsx): incrementa quando o modal
 * fecha, e o `handleCreate` aborta se a sessão mudou entre o início e o fim da conferência.
 */

const { consultarCnpjFalsa } = vi.hoisted(() => ({
  consultarCnpjFalsa: vi.fn<(cnpj: string) => Promise<ResultadoDaConsulta>>(),
}));

// Só a consulta à Receita é falsa: máscara, dígito verificador e o resto de src/lib/cnpj.ts
// continuam de verdade, igual a src/components/shared/CampoCnpj.test.tsx.
vi.mock('@/lib/cnpj', async (original) => ({
  ...(await original<typeof import('@/lib/cnpj')>()),
  consultarCnpj: (cnpj: string) => consultarCnpjFalsa(cnpj),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// Sem fabricante nenhum cadastrado, o combobox oferece "Cadastrar" assim que abre — não precisa
// digitar nada na busca para chegar ao modal.
vi.mock('@/hooks/use-clientes', () => ({
  useFabricantes: () => ({ data: [], isLoading: false }),
}));

const criarFabricanteFalso = vi.fn();
vi.mock('@/hooks/use-novo-pedido', () => ({
  useCreateFabricanteCompleto: () => ({
    mutateAsync: (...args: unknown[]) => criarFabricanteFalso(...args),
    isPending: false,
  }),
}));

import { FabricanteSelector } from './FabricanteSelector';

function desenhar() {
  const onValueChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FabricanteSelector value="" onValueChange={onValueChange} placeholder="Selecionar fabricante..." />
    </QueryClientProvider>,
  );
  return { onValueChange };
}

// Sintético — mesmo número já usado em CampoCnpj.test.tsx (dígito verificador válido, empresa
// nenhuma de verdade). Nenhum dado de cliente entra aqui (CLAUDE.md §6.9).
const CNPJ_DE_TESTE = '11.222.333/0001-81';

/** Abre o combobox e clica no botão "Cadastrar" da lista vazia, chegando ao modal de cadastro. */
async function abrirModalDeCadastro() {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('button', { name: /^cadastrar "/i }));
  fireEvent.change(screen.getByLabelText(/nome do fabricante/i), {
    target: { value: 'Fábrica Exemplo' },
  });
  // Só um CNPJ com 14 dígitos válidos faz o campo chamar a consulta (a conferência de um campo
  // vazio resolve na hora, sem rede — não serviria para provar a corrida).
  fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: CNPJ_DE_TESTE } });
}

describe('FabricanteSelector — fechar o modal durante a conferência de CNPJ', () => {
  beforeEach(() => {
    consultarCnpjFalsa.mockReset();
    criarFabricanteFalso.mockReset();
  });

  afterEach(() => cleanup());

  it('🔴 fechar pelo "Cancelar" enquanto a Receita ainda responde não grava a fábrica nem troca a selecionada', async () => {
    let responder!: (r: ResultadoDaConsulta) => void;
    consultarCnpjFalsa.mockReturnValue(new Promise((ok) => { responder = ok; }));

    const { onValueChange } = desenhar();
    await abrirModalDeCadastro();

    fireEvent.click(screen.getByRole('button', { name: /cadastrar e selecionar/i }));
    // A consulta ficou pendurada: nem gravou, nem voltou ainda.
    expect(consultarCnpjFalsa).toHaveBeenCalledTimes(1);
    expect(criarFabricanteFalso).not.toHaveBeenCalled();

    // A pessoa desiste e fecha pelo "Cancelar" — continua clicável durante a espera.
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    // Só agora a Receita responde, depois que o modal já fechou.
    responder({ caso: 'encontrado', dados: { razao_social: 'Fábrica Exemplo Ltda' } as CnpjData });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(criarFabricanteFalso).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('🔴 fechar com a conferência pendurada e reabrir não deixa o botão preso em "Conferindo o CNPJ..."', async () => {
    // Nunca resolve nesta prova: o ponto do teste é o estado do botão ANTES de qualquer
    // resposta chegar, então a promessa fica pendurada de propósito.
    consultarCnpjFalsa.mockReturnValue(new Promise(() => {}));

    desenhar();
    await abrirModalDeCadastro();

    fireEvent.click(screen.getByRole('button', { name: /cadastrar e selecionar/i }));
    // A conferência da primeira sessão disparou e travou o botão.
    expect(await screen.findByRole('button', { name: /conferindo o cnpj/i })).toBeDisabled();

    // A pessoa desiste e fecha pelo "Cancelar" — a conferência antiga fica pendurada, sem
    // nunca responder (é a mesma promessa que nunca resolve).
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    // Reabre o mesmo modal — sessão nova, sem clicar em "Cadastrar e Selecionar" de novo.
    await abrirModalDeCadastro();

    // A sessão nova não disparou conferência nenhuma: o botão tem de nascer destravado, com o
    // texto normal — não preso em "Conferindo o CNPJ..." da sessão anterior, abandonada.
    const botao = screen.getByRole('button', { name: /cadastrar e selecionar/i });
    expect(botao).toBeEnabled();
  });
});
