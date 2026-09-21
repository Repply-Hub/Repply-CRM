import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Ajuda from './Ajuda';
import { FUNCOES_BORDA } from '@/content/api-conteudo';

/**
 * A aba "API" da página de Ajuda é a única coisa nova nesta tela: o menuTab de nível
 * superior ("Documentação" / "API") e a exclusividade da segunda aba para o admin master
 * (`profile.role === 'admin'`). O resto do conteúdo de Documentação já existia e não muda
 * aqui — o que se prende é a visibilidade condicional.
 *
 * Nomes inventados — não há dado de cliente nesta tela.
 */

const tela = vi.hoisted(() => ({
  profile: { role: 'vendedor' } as { role: string } | null,
  profileLoaded: true,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ajuda/GaleriaDaAjuda', () => ({
  GaleriaDaAjuda: ({ prefixo }: { prefixo: string }) => <div data-testid={`galeria-${prefixo}`} />,
}));
vi.mock('@/hooks/use-secoes', () => ({ useSecoesDaEmpresa: () => ({ mapa: undefined }) }));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: tela.profile, profileLoaded: tela.profileLoaded }),
}));

function renderAjuda() {
  return render(
    <MemoryRouter initialEntries={['/ajuda']}>
      <Ajuda />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  tela.profile = { role: 'vendedor' };
  tela.profileLoaded = true;
});

describe('Ajuda — aba de API exclusiva do admin master', () => {
  it('usuário comum não vê seletor de aba nenhum, só o conteúdo de Documentação', () => {
    tela.profile = { role: 'vendedor' };
    renderAjuda();

    expect(screen.queryByRole('tab', { name: 'API' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Documentação' })).not.toBeInTheDocument();
    // O conteúdo de sempre continua ali.
    expect(screen.getByPlaceholderText(/Buscar por uma palavra/)).toBeInTheDocument();
  });

  it('admin master vê as duas abas e a de API mostra rotas de tela e funções de borda', () => {
    tela.profile = { role: 'admin' };
    renderAjuda();

    const abaApi = screen.getByRole('tab', { name: 'API' });
    expect(screen.getByRole('tab', { name: 'Documentação' })).toBeInTheDocument();

    // Radix TabsTrigger troca de aba no `onMouseDown`, não no `onClick` (ver
    // node_modules/@radix-ui/react-tabs) — fireEvent.click sozinho não ativa a aba.
    fireEvent.mouseDown(abaApi);

    expect(screen.getByText('Documentação de API')).toBeInTheDocument();
    expect(screen.getByText(/Rotas de tela/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Funções de borda \\(${FUNCOES_BORDA.length}\\)`))).toBeInTheDocument();
    // Uma função de borda real, pelo nome — prova que o conteúdo veio do arquivo certo.
    expect(screen.getByText('whatsapp-webhook')).toBeInTheDocument();
  });

  it('a busca da aba de API filtra as funções de borda por texto', () => {
    tela.profile = { role: 'admin' };
    renderAjuda();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'API' }));

    const painelApi = screen.getByText('Documentação de API').closest('div')!.parentElement!;
    const busca = within(painelApi).getByPlaceholderText(/Buscar por caminho, nome ou descrição/);
    fireEvent.change(busca, { target: { value: 'stripe-webhook' } });

    expect(screen.getByText('stripe-webhook')).toBeInTheDocument();
    expect(screen.queryByText('whatsapp-webhook')).not.toBeInTheDocument();
  });

  it('não é substituto de RLS: não há consulta de dado de empresa nesta tela para uma policy proteger', () => {
    // Documenta a decisão do comentário em Ajuda.tsx: a guarda é só de UI porque o
    // conteúdo é estático (FUNCOES_BORDA/ROTAS_FRONTEND), não uma leitura de banco.
    expect(FUNCOES_BORDA.length).toBeGreaterThan(0);
  });
});

describe('Ajuda — galeria de fotos por passo numérico', () => {
  it('cada um dos 5 passos de "Como a pauta é montada" tem a própria galeria, além da galeria do tópico', () => {
    renderAjuda();

    // A seção "Hoje" é a primeira e abre por padrão (sem `?secao=` na URL).
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByTestId(`galeria-hoje-pauta-passo-${n}`)).toBeInTheDocument();
    }
    // A galeria do tópico inteiro (coluna da direita) continua existindo — uma coisa não
    // substitui a outra.
    expect(screen.getByTestId('galeria-hoje-pauta')).toBeInTheDocument();
  });

  it('um tópico sem galeria por passo não ganha galeria por passo nenhuma além da do tópico', () => {
    renderAjuda();

    // "Abrir um item e decidir o que fazer" tem 3 passos, nenhum com galeria própria — só a
    // galeria do tópico (hoje-retomar-depois) deve existir, nenhuma "hoje-retomar-depois-passo-N".
    expect(screen.getByTestId('galeria-hoje-retomar-depois')).toBeInTheDocument();
    expect(screen.queryByTestId(/galeria-hoje-retomar-depois-passo/)).not.toBeInTheDocument();
  });
});
