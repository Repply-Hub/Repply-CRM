import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a tela de escolher a nova senha só desenhe o formulário para
 * quem veio mesmo do link do e-mail (item 59 da dívida técnica).
 *
 * 🔴 POR QUE ELE EXISTE. O link de redefinição vale no máximo uma hora, e antivírus de e-mail
 * corporativo abre o endereço sozinho para checar segurança — queimando o link antes de a pessoa
 * clicar. Quando isso acontece o Supabase devolve a pessoa para esta tela COM o motivo escrito no
 * endereço, e a tela ignorava: desenhava o formulário, a pessoa digitava a senha duas vezes e só
 * então levava um aviso genérico, sem nenhum botão para sair.
 *
 * E o caso caro: num computador compartilhado do escritório, com um colega logado em outra aba,
 * a biblioteca do Supabase PRESERVA a sessão que já existia quando o link falha. O `updateUser`
 * então trocava a senha de quem estava logado, não a de quem clicou no link — e a tela anunciava
 * "Senha redefinida com sucesso!". Duas contas estragadas de uma vez.
 *
 * Por isso a testemunha que interessa na maioria dos casos é `atualizacoes`: o que chegou ao
 * servidor. A tela pode estar bonita e mexer na conta errada.
 *
 * Não há plano B no produto: ninguém dentro do CRM redefine a senha de outra pessoa. Se esta
 * tela falhar, a única saída é alguém abrir o painel do Supabase.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

/** O que foi pedido ao servidor. */
const atualizacoes: Array<Record<string, unknown>> = [];
let respostaDoServidor: { error: { message: string } | null } = { error: null };
let ouvinte: ((evento: string, sessao: unknown) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (evento: string, sessao: unknown) => void) => {
        ouvinte = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      updateUser: async (atributos: Record<string, unknown>) => {
        atualizacoes.push(atributos);
        return respostaDoServidor;
      },
    },
  },
}));

const avisos: Array<{ tipo: 'ok' | 'erro'; texto: string }> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (texto: string) => avisos.push({ tipo: 'ok', texto }),
    error: (texto: string) => avisos.push({ tipo: 'erro', texto }),
  },
}));

import RedefinirSenha from './RedefinirSenha';

function desenhar(endereco: string) {
  window.history.replaceState({}, '', endereco);
  return render(
    <MemoryRouter>
      <RedefinirSenha />
    </MemoryRouter>,
  );
}

/** O cliente do Supabase avisa que terminou de processar o endereço com este evento. */
async function terminarApuracao(evento: 'INITIAL_SESSION' | 'PASSWORD_RECOVERY' = 'INITIAL_SESSION') {
  ouvinte?.(evento, evento === 'PASSWORD_RECOVERY' ? { user: { id: 'auth-1' } } : null);
  await waitFor(() => expect(screen.queryByText(/Verificando o link/i)).not.toBeInTheDocument());
}

function campoDeSenha(container: HTMLElement) {
  return container.querySelector('input[name="password"]') as HTMLInputElement | null;
}

async function preencherEEnviar(container: HTMLElement, senha: string) {
  fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: senha } });
  fireEvent.change(container.querySelector('input[name="confirm_password"]')!, {
    target: { value: senha },
  });
  fireEvent.submit(container.querySelector('form')!);
}

beforeEach(() => {
  atualizacoes.length = 0;
  avisos.length = 0;
  respostaDoServidor = { error: null };
  ouvinte = null;
  sessionStorage.clear();
});
afterEach(cleanup);

const LINK_VENCIDO =
  '/redefinir-senha#error=access_denied&error_code=otp_expired' +
  '&error_description=Email+link+is+invalid+or+has+expired';

describe('RedefinirSenha', () => {
  it('🔴 link vencido: explica o que houve e NÃO desenha o formulário', async () => {
    const { container } = desenhar(LINK_VENCIDO);
    await terminarApuracao();

    expect(screen.getByText(/vale por 1 hora/i)).toBeInTheDocument();
    expect(campoDeSenha(container)).toBeNull();
  });

  it('🔴 link vencido com alguém logado no navegador: nada é enviado ao servidor', async () => {
    // O computador compartilhado. A sessão do colega sobrevive ao link quebrado — e é ela que o
    // `updateUser` usaria.
    const { container } = desenhar(LINK_VENCIDO);
    await terminarApuracao('PASSWORD_RECOVERY');

    expect(campoDeSenha(container)).toBeNull();
    expect(atualizacoes).toEqual([]);
  });

  it('link vencido oferece pedir outro, em vez de deixar a pessoa sem saída', async () => {
    desenhar(LINK_VENCIDO);
    await terminarApuracao();

    const botao = screen.getByRole('link', { name: /pedir um link novo/i });
    expect(botao).toHaveAttribute('href', '/esqueci-senha');
  });

  it('quem veio pelo link vê o formulário e consegue trocar a senha', async () => {
    const { container } = desenhar('/redefinir-senha');
    await terminarApuracao('PASSWORD_RECOVERY');

    expect(campoDeSenha(container)).not.toBeNull();
    await preencherEEnviar(container, 'senha-nova-123');

    await waitFor(() => expect(atualizacoes).toEqual([{ password: 'senha-nova-123' }]));
  });

  it('🔴 sem link nenhum: não desenha o formulário e nada chega ao servidor', async () => {
    const { container } = desenhar('/redefinir-senha');
    await terminarApuracao();

    expect(campoDeSenha(container)).toBeNull();
    expect(screen.getByText(/abra o link/i)).toBeInTheDocument();
    expect(atualizacoes).toEqual([]);
  });

  it('🔴 recarregar a aba depois de abrir o link não tira a pessoa do caminho', async () => {
    // O endereço é limpo pela biblioteca assim que o link dá certo, então numa recarga não sobra
    // sinal nenhum — só a marca que guardamos nesta aba.
    desenhar('/redefinir-senha');
    await terminarApuracao('PASSWORD_RECOVERY');
    cleanup();

    const { container } = desenhar('/redefinir-senha');
    await terminarApuracao();

    expect(campoDeSenha(container)).not.toBeNull();
  });

  it('🔴 senha recusada pelo servidor culpa a SENHA, não o link', async () => {
    respostaDoServidor = {
      error: { message: 'Password is known to be weak and easy to guess, please choose a different one.' },
    };
    const { container } = desenhar('/redefinir-senha');
    await terminarApuracao('PASSWORD_RECOVERY');

    await preencherEEnviar(container, 'senha-que-vazou');

    await waitFor(() => expect(avisos).toHaveLength(1));
    expect(avisos[0].texto).toMatch(/vazamento/i);
    expect(avisos[0].texto).not.toMatch(/link/i);
  });

  it('🔴 servidor recusou: a pessoa continua com saída, sem precisar digitar o endereço na mão', async () => {
    respostaDoServidor = { error: { message: 'Auth session missing!' } };
    const { container } = desenhar('/redefinir-senha');
    await terminarApuracao('PASSWORD_RECOVERY');

    await preencherEEnviar(container, 'senha-nova-123');

    await waitFor(() => expect(avisos).toHaveLength(1));
    expect(screen.getByRole('link', { name: /pedir um link novo/i })).toHaveAttribute(
      'href',
      '/esqueci-senha',
    );
  });

  it('enquanto o cliente do Supabase não termina, a tela espera em vez de chutar', () => {
    const { container } = desenhar('/redefinir-senha');

    expect(screen.getByText(/Verificando o link/i)).toBeInTheDocument();
    expect(campoDeSenha(container)).toBeNull();
  });

  it('todo beco sem saída tem volta para o login', async () => {
    desenhar('/redefinir-senha');
    await terminarApuracao();

    expect(screen.getByRole('link', { name: /voltar ao login/i })).toHaveAttribute('href', '/login');
  });
});
