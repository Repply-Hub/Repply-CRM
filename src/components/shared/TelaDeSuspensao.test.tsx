import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * A tela do dia 30 — e as três coisas que ela não pode errar.
 *
 * 🔴 1. ELA NÃO PODE APARECER ANTES DO DIA 30. Cobrir o app de alguém que ainda está na
 *       tolerância (onde tudo funciona) ou em somente-leitura (onde a pessoa ainda trabalha
 *       vendo os dados) seria cortar o acesso cedo demais — o oposto do que a régua desenha.
 *
 * 🔴 2. ELA TEM DE PROMETER QUE OS DADOS ESTÃO LÁ. Quem vê o sistema coberto presume que
 *       perdeu tudo, e é esse presumido que faz desistir em vez de resolver.
 *
 * 🔴 3. ELA PRECISA TER SAÍDA. A tela cobre o app inteiro; sem "Sair" vira beco sem fim para
 *       quem entrou na conta errada.
 */

const useAuthFalso = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthFalso() }));

import { TelaDeSuspensao } from './TelaDeSuspensao';

afterEach(() => {
  cleanup();
  useAuthFalso.mockReset();
});

function comDias(dias: number | null, role = 'gestor') {
  useAuthFalso.mockReturnValue({
    profile: {
      role,
      empresas: {
        // 🔴 O DONO NÃO É QUEM ESTÁ LOGADO quando o papel é de vendedor. `podeGerenciarAssinatura`
        // libera para o dono OU para gestor — a primeira versão deste teste punha o vendedor
        // como dono, e o teste "vendedor não vê o botão" falhava com razão. O fixture estava
        // errado, não o código.
        owner_id: role === 'vendedor' ? 'outra-pessoa' : 'auth-1',
        empresa_assinaturas: {
          plan_status: 'active',
          inadimplente_desde:
            dias === null ? null : new Date(Date.now() - dias * 86_400_000).toISOString(),
        },
      },
    },
    session: { user: { id: 'auth-1' } },
    signOut: vi.fn(),
  });
}

const desenhar = () =>
  render(
    <MemoryRouter>
      <TelaDeSuspensao />
    </MemoryRouter>,
  );

describe('TelaDeSuspensao', () => {
  it('empresa em dia não vê nada', () => {
    comDias(null);
    expect(desenhar().container).toBeEmptyDOMElement();
  });

  it('🔴 na TOLERÂNCIA não cobre nada — tudo ainda funciona', () => {
    comDias(10);
    expect(desenhar().container).toBeEmptyDOMElement();
  });

  it('🔴 em SOMENTE LEITURA ainda não cobre — a pessoa trabalha vendo os dados', () => {
    comDias(20);
    expect(desenhar().container).toBeEmptyDOMElement();
  });

  it('a partir do dia 30 cobre o app', () => {
    comDias(30);
    desenhar();
    expect(screen.getByText(/acesso está suspenso/i)).toBeTruthy();
  });

  it('🔴 promete, com destaque, que os dados continuam lá', () => {
    comDias(45);
    desenhar();

    expect(screen.getByText(/dados não foram apagados/i)).toBeTruthy();
    // "45 dias" aparece DUAS vezes de propósito — os decorridos e os que restam (90 − 45).
    // Buscar pelo trecho inteiro é o que distingue um do outro.
    expect(screen.getByText(/Foram 45 dias desde que o pagamento parou/i)).toBeTruthy();
    expect(screen.getByText(/45 dias para regularizar/i)).toBeTruthy();
  });

  it('no prazo final o texto muda — não promete prazo que não existe mais', () => {
    comDias(95);
    desenhar();

    expect(screen.getByText(/prazo para regularizar terminou/i)).toBeTruthy();
    expect(screen.queryByText(/dias para regularizar/i)).toBeNull();
    // Mesmo aqui, os dados continuam guardados — nada é apagado por relógio.
    expect(screen.getByText(/continua guardado/i)).toBeTruthy();
  });

  it('🔴 sempre tem saída — a tela cobre tudo', () => {
    comDias(40);
    desenhar();
    expect(screen.getByRole('button', { name: /sair/i })).toBeTruthy();
  });

  it('gestor recebe o caminho para resolver', () => {
    comDias(40);
    desenhar();
    expect(screen.getByRole('link', { name: /regularizar pagamento/i })).toBeTruthy();
  });

  it('🔴 vendedor comum não recebe botão que o recusaria depois', () => {
    comDias(40, 'vendedor');
    desenhar();

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/fale com o gestor/i)).toBeTruthy();
  });

  it('admin global nunca é suspenso', () => {
    comDias(200, 'admin');
    expect(desenhar().container).toBeEmptyDOMElement();
  });
});
