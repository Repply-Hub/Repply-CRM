import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { AnexoDoNegocio } from '@/hooks/use-pedido-anexos';
import { ACCEPT_DO_CAMPO } from '@/lib/anexos-do-negocio';

/**
 * O campo de anexos da tela — Tarefa 4 do desenho "Vários anexos por negócio"
 * (docs/superpowers/specs/2026-09-12-varios-anexos-por-negocio-design.md).
 *
 * COMPONENTE CONTROLADO E PURO: não fala com o banco, então o teste não precisa de
 * `QueryClientProvider` nem de rede — só simula `useArquivoPrivado`, o gancho que
 * `LinkAnexoPrivado`/`ImagemPrivada` usam por baixo para assinar o endereço no clique (a mesma
 * peça que `PainelDoNegocio.tsx` já usa para o anexo único de hoje). Com o gancho simulado, os
 * dois componentes reais caem no próprio fallback (o endereço original), sem chamada nenhuma.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): nomes de arquivo e ids fictícios, nenhum dado da MD.
 */

vi.mock('@/hooks/use-arquivo-privado', () => ({
  useArquivoPrivado: () => ({ data: undefined }),
}));

import { CampoDeAnexos } from './CampoDeAnexos';

afterEach(() => cleanup());

/** Só os campos que a tela lê — não depende de vir de verdade do gancho da Tarefa 3. */
function anexo(parcial: Pick<AnexoDoNegocio, 'id' | 'nome' | 'criadoEm'> & Partial<AnexoDoNegocio>): AnexoDoNegocio {
  return {
    url: `https://balde/empresa-1/${parcial.id}/${parcial.nome}`,
    tipo: 'application/pdf',
    tamanhoBytes: 100_000,
    ...parcial,
  };
}

describe('CampoDeAnexos', () => {
  it('o anexo mais novo aparece em cima e o botão de adicionar fica embaixo', () => {
    const anexos = [
      anexo({ id: 'antigo', nome: 'orcamento-v1.pdf', criadoEm: '2026-09-10T10:00:00Z' }),
      anexo({ id: 'novo', nome: 'orcamento-v2.pdf', criadoEm: '2026-09-15T10:00:00Z' }),
    ];
    const { container } = render(
      <CampoDeAnexos anexos={anexos} onAdicionar={vi.fn()} onRemover={vi.fn()} />,
    );

    const linhas = screen.getAllByTestId('anexo-linha');
    expect(linhas).toHaveLength(2);
    // O mais novo (criado em 15/09) vem primeiro na lista, não na ordem em que foi passado.
    expect(linhas[0]).toHaveTextContent('orcamento-v2.pdf');
    expect(linhas[1]).toHaveTextContent('orcamento-v1.pdf');

    // 🔴 O botão vem DEPOIS da lista na marcação — pedido do Lucas: o que entra sobe, o botão
    // desce. Comparar posição no HTML renderizado prova a ordem visual, não só a presença.
    const html = container.innerHTML;
    const posicaoUltimaLinha = html.indexOf('orcamento-v1.pdf');
    const posicaoBotao = html.indexOf('Adicionar anexo');
    expect(posicaoUltimaLinha).toBeGreaterThan(-1);
    expect(posicaoBotao).toBeGreaterThan(posicaoUltimaLinha);
  });

  it('imagem mostra miniatura; PDF mostra ícone', () => {
    const anexos = [
      anexo({ id: 'foto', nome: 'foto-obra.jpg', tipo: 'image/jpeg', criadoEm: '2026-09-15T10:00:00Z' }),
      anexo({ id: 'doc', nome: 'orcamento.pdf', tipo: 'application/pdf', criadoEm: '2026-09-14T10:00:00Z' }),
    ];
    render(<CampoDeAnexos anexos={anexos} onAdicionar={vi.fn()} onRemover={vi.fn()} />);

    const linhas = screen.getAllByTestId('anexo-linha');
    // Linha 0 é a foto (mais nova): miniatura, sem ícone de arquivo genérico.
    expect(linhas[0].querySelector('[data-testid="miniatura-anexo"]')).not.toBeNull();
    expect(linhas[0].querySelector('[data-testid="icone-arquivo"]')).toBeNull();
    // Linha 1 é o PDF: ícone, sem miniatura.
    expect(linhas[1].querySelector('[data-testid="icone-arquivo"]')).not.toBeNull();
    expect(linhas[1].querySelector('[data-testid="miniatura-anexo"]')).toBeNull();
  });

  it('o × chama onRemover com o anexo daquela linha', () => {
    const onRemover = vi.fn();
    const anexos = [
      anexo({ id: 'a1', nome: 'orcamento.pdf', criadoEm: '2026-09-10T10:00:00Z' }),
      anexo({ id: 'a2', nome: 'foto-obra.jpg', tipo: 'image/jpeg', criadoEm: '2026-09-12T10:00:00Z' }),
    ];
    render(<CampoDeAnexos anexos={anexos} onAdicionar={vi.fn()} onRemover={onRemover} />);

    // Duas linhas, dois ×. Clicar no da linha de baixo (o PDF mais antigo) prova que o gesto
    // carrega o id CERTO, não sempre o primeiro da lista.
    fireEvent.click(screen.getByRole('button', { name: /remover orcamento\.pdf/i }));

    expect(onRemover).toHaveBeenCalledTimes(1);
    expect(onRemover).toHaveBeenCalledWith('a1');
  });

  it('sem permissão de editar, não há × nem botão de adicionar', () => {
    const anexos = [anexo({ id: 'a1', nome: 'orcamento.pdf', criadoEm: '2026-09-10T10:00:00Z' })];

    const { rerender } = render(
      <CampoDeAnexos anexos={anexos} onAdicionar={vi.fn()} onRemover={vi.fn()} somenteLeitura />,
    );
    expect(screen.queryByRole('button', { name: /remover/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /adicionar anexo/i })).toBeNull();
    // A linha continua visível — só perde os gestos de edição, não a informação.
    expect(screen.getByTestId('anexo-linha')).toHaveTextContent('orcamento.pdf');

    // Mesmo efeito sem `onRemover`, mesmo com `somenteLeitura` ausente: sem para onde mandar a
    // remoção, oferecer só "adicionar" sem "tirar" seria pior que não oferecer nenhum dos dois.
    rerender(<CampoDeAnexos anexos={anexos} onAdicionar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /remover/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /adicionar anexo/i })).toBeNull();
  });

  it('arquivo recusado não chama onAdicionar, e a frase aparece na tela', () => {
    const onAdicionar = vi.fn();
    render(<CampoDeAnexos anexos={[]} onAdicionar={onAdicionar} onRemover={vi.fn()} />);

    const input = screen.getByTestId('input-anexo') as HTMLInputElement;
    const docx = new File(['conteudo'], 'proposta.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(input, { target: { files: [docx] } });

    expect(onAdicionar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/pdf|imagem/i);
  });

  it('enquanto envia, o botão fica desabilitado e a linha nova mostra indicação de envio', () => {
    const onAdicionar = vi.fn();
    render(<CampoDeAnexos anexos={[]} onAdicionar={onAdicionar} onRemover={vi.fn()} enviando />);

    expect(screen.getByRole('button', { name: /adicionar anexo/i })).toBeDisabled();

    // Escolher um arquivo válido enquanto `enviando` já está true (o pai desabilitou o botão,
    // mas o campo escondido pode disparar via teclado/automação) ainda assim mostra a linha
    // provisória com o nome do arquivo escolhido.
    const input = screen.getByTestId('input-anexo') as HTMLInputElement;
    const pdf = new File(['conteudo'], 'orcamento.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });

    expect(onAdicionar).toHaveBeenCalledWith(pdf);
    expect(screen.getByText('orcamento.pdf')).toBeInTheDocument();
    expect(screen.getByText(/enviando/i)).toBeInTheDocument();
  });

  it('o campo de arquivo sugere só os tipos aceitos (accept)', () => {
    // `accept` é só sugestão do navegador (a recusa de verdade é `recusaDoAnexo`), mas é o único
    // requisito literal do campo; sem este teste, remover o atributo passaria despercebido.
    render(<CampoDeAnexos anexos={[]} onAdicionar={vi.fn()} onRemover={vi.fn()} />);
    const input = screen.getByTestId('input-anexo') as HTMLInputElement;
    expect(input.accept).toBe(ACCEPT_DO_CAMPO);
  });
});
