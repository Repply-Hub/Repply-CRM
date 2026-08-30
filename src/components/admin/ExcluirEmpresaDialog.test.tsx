import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ExcluirEmpresaDialog } from './ExcluirEmpresaDialog';

/**
 * A confirmação de excluir empresa — e as quatro coisas que ela não pode errar.
 *
 * 🔴 1. O BOTÃO NÃO PODE LIBERAR SEM O NOME. É a única fricção que separa este gesto do de
 *       dar cortesia, que fica a dois botões de distância na mesma tela.
 * 🔴 2. OS NÚMEROS TÊM DE APARECER. "Excluir empresa" é abstrato; "1.305 clientes e 11.910
 *       negócios" é o que faz alguém reconsiderar a empresa errada.
 * 🔴 3. A PROMESSA DE QUE NADA É APAGADO precisa estar na tela, porque é verdade e porque é
 *       o que permite clicar sem medo quando a decisão está certa.
 * 🔴 4. O AVISO DO STRIPE só aparece para quem tem assinatura — é a única parte irreversível
 *       de hoje, e dizê-la para uma cortesia seria inventar uma consequência que não existe.
 */

const NUMEROS = { usuarios: 13, clientes: 1305, negocios: 11910, obras: 82, mensagens: 56873 };

function desenhar(over: Partial<React.ComponentProps<typeof ExcluirEmpresaDialog>> = {}) {
  const aoConfirmar = vi.fn().mockResolvedValue(undefined);
  render(
    <ExcluirEmpresaDialog
      aberto
      onOpenChange={() => {}}
      nomeDaEmpresa="MD Representações"
      numeros={NUMEROS}
      temAssinaturaAtiva={false}
      aoConfirmar={aoConfirmar}
      {...over}
    />,
  );
  return { aoConfirmar };
}

const botaoExcluir = () => screen.getByRole('button', { name: /excluir empresa/i });
const campoNome = () => screen.getByLabelText(/digite/i);

afterEach(cleanup);

describe('ExcluirEmpresaDialog', () => {
  it('🔴 o botão começa travado', () => {
    desenhar();
    expect(botaoExcluir()).toBeDisabled();
  });

  it('🔴 nome errado não libera', () => {
    desenhar();
    fireEvent.change(campoNome(), { target: { value: 'MD' } });
    expect(botaoExcluir()).toBeDisabled();
  });

  it('o nome certo libera', () => {
    desenhar();
    fireEvent.change(campoNome(), { target: { value: 'MD Representações' } });
    expect(botaoExcluir()).not.toBeDisabled();
  });

  it('caixa e espaço nas pontas não atrapalham — o objetivo é LER, não datilografar', () => {
    desenhar();
    fireEvent.change(campoNome(), { target: { value: '  md representações  ' } });
    expect(botaoExcluir()).not.toBeDisabled();
  });

  it('🔴 mostra os números do que deixa de ser acessível', () => {
    desenhar();
    expect(screen.getByText(/1\.305 clientes/)).toBeTruthy();
    expect(screen.getByText(/11\.910 negócios/)).toBeTruthy();
    expect(screen.getByText(/13 usuários/)).toBeTruthy();
  });

  it('singular não vira "1 clientes"', () => {
    desenhar({ numeros: { usuarios: 1, clientes: 1, negocios: 0, obras: 0, mensagens: 0 } });
    expect(screen.getByText(/^1 usuário$/)).toBeTruthy();
    expect(screen.getByText(/^1 cliente$/)).toBeTruthy();
  });

  it('não lista o que está zerado', () => {
    desenhar({ numeros: { usuarios: 2, clientes: 0, negocios: 0, obras: 0, mensagens: 0 } });
    expect(screen.queryByText(/clientes/)).toBeNull();
    expect(screen.queryByText(/negócios/)).toBeNull();
  });

  it('🔴 promete que nada é apagado agora, e cita os 60 dias', () => {
    desenhar();
    expect(screen.getByText(/nada é apagado agora/i)).toBeTruthy();
    expect(screen.getByText(/60 dias/)).toBeTruthy();
  });

  it('🔴 cortesia NÃO vê o aviso de cancelamento de assinatura', () => {
    desenhar({ temAssinaturaAtiva: false });
    expect(screen.queryByText(/assinatura será cancelada/i)).toBeNull();
  });

  it('🔴 quem tem assinatura VÊ que ela não volta com o restaurar', () => {
    desenhar({ temAssinaturaAtiva: true });
    expect(screen.getByText(/assinatura será cancelada agora/i)).toBeTruthy();
    expect(screen.getByText(/precisa ser refeita/i)).toBeTruthy();
  });

  it('confirma levando o motivo digitado', async () => {
    const { aoConfirmar } = desenhar();
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'empresa de teste' } });
    fireEvent.change(campoNome(), { target: { value: 'MD Representações' } });
    fireEvent.click(botaoExcluir());

    await vi.waitFor(() => expect(aoConfirmar).toHaveBeenCalledWith('empresa de teste'));
  });

  it('aguenta números ainda carregando, sem quebrar', () => {
    desenhar({ numeros: null });
    expect(screen.getByText(/nada é apagado agora/i)).toBeTruthy();
    expect(botaoExcluir()).toBeDisabled();
  });
});
