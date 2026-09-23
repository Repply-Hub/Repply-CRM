import { useCallback, useState } from 'react';

/**
 * Processa arquivos escolhidos pelo input (com `multiple`) OU soltos por arrastar-e-soltar:
 * valida cada um, entrega os ACEITOS de uma vez e uma mensagem única com os RECUSADOS. Compartilhado
 * entre o campo de anexo do negócio e o da tarefa — a lógica de "vários de uma vez" mora num lugar só.
 */
export interface HandlersDeSelecao {
  arrastando: boolean;
  aoEscolherNoInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  aoArrastarSobre: (e: React.DragEvent) => void;
  aoSairDoArrasto: (e: React.DragEvent) => void;
  aoSoltar: (e: React.DragEvent) => void;
}

export function useSelecaoDeArquivos(opts: {
  recusar: (arquivo: File) => string | null; // valida um arquivo: frase de recusa ou null
  onArquivos: (aceitos: File[]) => void;       // todos os aceitos de uma vez
  onRecusa: (mensagem: string | null) => void; // frase combinada dos recusados, ou null p/ limpar
  desabilitado?: boolean;                       // somenteLeitura: ignora tudo
}): HandlersDeSelecao {
  const { recusar, onArquivos, onRecusa, desabilitado } = opts;
  const [arrastando, setArrastando] = useState(false);

  const processar = useCallback(
    (lista: FileList | null) => {
      if (desabilitado) return;
      const arquivos = Array.from(lista ?? []);
      if (arquivos.length === 0) return;
      const aceitos: File[] = [];
      const recusados: string[] = [];
      for (const a of arquivos) {
        const r = recusar(a);
        if (r) recusados.push(arquivos.length > 1 ? `${a.name}: ${r}` : r);
        else aceitos.push(a);
      }
      onRecusa(recusados.length ? recusados.join(' · ') : null);
      if (aceitos.length) onArquivos(aceitos);
    },
    [recusar, onArquivos, onRecusa, desabilitado],
  );

  return {
    arrastando,
    aoEscolherNoInput: (e) => {
      processar(e.target.files);
      e.target.value = ''; // permite reescolher o mesmo arquivo depois
    },
    aoArrastarSobre: (e) => {
      if (desabilitado) return;
      e.preventDefault();
      setArrastando(true);
    },
    aoSairDoArrasto: (e) => {
      e.preventDefault();
      setArrastando(false);
    },
    aoSoltar: (e) => {
      e.preventDefault();
      setArrastando(false);
      processar(e.dataTransfer?.files ?? null);
    },
  };
}
