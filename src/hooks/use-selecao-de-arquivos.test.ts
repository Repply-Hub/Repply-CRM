import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelecaoDeArquivos } from './use-selecao-de-arquivos';

/**
 * Cobre a peça pura do hook (`processar`, exercitada pelos handlers) que passa a ficar
 * compartilhada entre o campo de anexo do negócio e o da tarefa: vários arquivos de uma vez,
 * pelo input (`multiple`) ou pelo arrastar-e-soltar, com uma única mensagem combinando as
 * recusas.
 */

function arquivo(nome: string) {
  return new File(['conteudo'], nome, { type: 'text/plain' });
}

function comFileList(arquivos: File[]): FileList {
  return {
    length: arquivos.length,
    item: (i: number) => arquivos[i] ?? null,
    [Symbol.iterator]: function* () {
      for (const a of arquivos) yield a;
    },
    ...arquivos,
  } as unknown as FileList;
}

function recusaSeExe(f: File): string | null {
  return f.name.endsWith('.exe') ? 'não aceito' : null;
}

describe('useSelecaoDeArquivos', () => {
  it('vários arquivos aceitos: onArquivos recebe todos numa lista só, onRecusa(null)', () => {
    const onArquivos = vi.fn();
    const onRecusa = vi.fn();
    const { result } = renderHook(() =>
      useSelecaoDeArquivos({ recusar: recusaSeExe, onArquivos, onRecusa }),
    );

    const a1 = arquivo('a.pdf');
    const a2 = arquivo('b.png');
    result.current.aoEscolherNoInput({
      target: { files: comFileList([a1, a2]), value: 'C:\\fakepath\\a.pdf' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);

    expect(onArquivos).toHaveBeenCalledTimes(1);
    expect(onArquivos).toHaveBeenCalledWith([a1, a2]);
    expect(onRecusa).toHaveBeenCalledWith(null);
  });

  it('mistura (1 aceito, 1 recusado): onArquivos só com o aceito, onRecusa com a frase do recusado', () => {
    const onArquivos = vi.fn();
    const onRecusa = vi.fn();
    const { result } = renderHook(() =>
      useSelecaoDeArquivos({ recusar: recusaSeExe, onArquivos, onRecusa }),
    );

    const bom = arquivo('bom.pdf');
    const ruim = arquivo('ruim.exe');
    result.current.aoEscolherNoInput({
      target: { files: comFileList([bom, ruim]), value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);

    expect(onArquivos).toHaveBeenCalledTimes(1);
    expect(onArquivos).toHaveBeenCalledWith([bom]);
    expect(onRecusa).toHaveBeenCalledWith('ruim.exe: não aceito');
  });

  it('lista vazia: nada é chamado', () => {
    const onArquivos = vi.fn();
    const onRecusa = vi.fn();
    const { result } = renderHook(() =>
      useSelecaoDeArquivos({ recusar: recusaSeExe, onArquivos, onRecusa }),
    );

    result.current.aoEscolherNoInput({
      target: { files: comFileList([]), value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);

    expect(onArquivos).not.toHaveBeenCalled();
    expect(onRecusa).not.toHaveBeenCalled();
  });

  it('desabilitado: true faz processar não chamar nada', () => {
    const onArquivos = vi.fn();
    const onRecusa = vi.fn();
    const { result } = renderHook(() =>
      useSelecaoDeArquivos({ recusar: recusaSeExe, onArquivos, onRecusa, desabilitado: true }),
    );

    result.current.aoEscolherNoInput({
      target: { files: comFileList([arquivo('a.pdf')]), value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);

    expect(onArquivos).not.toHaveBeenCalled();
    expect(onRecusa).not.toHaveBeenCalled();
  });

  it('aoSoltar com dataTransfer.files processa igual ao input', () => {
    const onArquivos = vi.fn();
    const onRecusa = vi.fn();
    const { result } = renderHook(() =>
      useSelecaoDeArquivos({ recusar: recusaSeExe, onArquivos, onRecusa }),
    );

    const a1 = arquivo('solto.pdf');
    const evento = {
      preventDefault: vi.fn(),
      dataTransfer: { files: comFileList([a1]) },
    } as unknown as React.DragEvent;

    result.current.aoSoltar(evento);

    expect(onArquivos).toHaveBeenCalledWith([a1]);
    expect(onRecusa).toHaveBeenCalledWith(null);
  });

  it('aoArrastarSobre liga arrastando; aoSoltar e aoSairDoArrasto desligam', () => {
    const onArquivos = vi.fn();
    const onRecusa = vi.fn();
    const { result } = renderHook(() =>
      useSelecaoDeArquivos({ recusar: recusaSeExe, onArquivos, onRecusa }),
    );

    expect(result.current.arrastando).toBe(false);

    act(() => {
      result.current.aoArrastarSobre({ preventDefault: vi.fn() } as unknown as React.DragEvent);
    });
    expect(result.current.arrastando).toBe(true);

    act(() => {
      result.current.aoSairDoArrasto({ preventDefault: vi.fn() } as unknown as React.DragEvent);
    });
    expect(result.current.arrastando).toBe(false);

    act(() => {
      result.current.aoArrastarSobre({ preventDefault: vi.fn() } as unknown as React.DragEvent);
    });
    expect(result.current.arrastando).toBe(true);

    act(() => {
      result.current.aoSoltar({
        preventDefault: vi.fn(),
        dataTransfer: { files: comFileList([]) },
      } as unknown as React.DragEvent);
    });
    expect(result.current.arrastando).toBe(false);
  });
});
