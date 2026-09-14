import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  consultaCasaComTodos,
  detectarMencao,
  filtrarPessoas,
  inserirMencao,
  mencionadosNoTexto,
  type MencaoEmCurso,
  type PessoaMencionavel,
} from '@/lib/mencao';
import { TODOS, type SugestaoDeMencao } from '@/components/mencao/ListaDeMencao';

interface Opcoes {
  texto: string;
  setTexto: (t: string) => void;
  pessoas: PessoaMencionavel[];
  ativo: boolean;
  totalDaConversa: number;
  ref: React.RefObject<HTMLTextAreaElement>;
}

/** O @ num campo de texto: abre a lista, navega pelo teclado, insere o nome e apura no envio. */
export function useCampoComMencao({ texto, setTexto, pessoas, ativo, totalDaConversa, ref }: Opcoes) {
  const [emCurso, setEmCurso] = useState<MencaoEmCurso | null>(null);
  const [ativa, setAtiva] = useState(0);
  const escolhidos = useRef(new Map<string, string>());

  const sugestoes = useMemo<SugestaoDeMencao[]>(() => {
    if (!emCurso) return [];
    const lista: SugestaoDeMencao[] = [];
    if (pessoas.length > 0 && consultaCasaComTodos(emCurso.consulta)) {
      lista.push({
        id: TODOS,
        rotulo: '@todos',
        detalhe: `avisa as ${totalDaConversa} ${totalDaConversa === 1 ? 'pessoa' : 'pessoas'} desta conversa`,
      });
    }
    for (const p of filtrarPessoas(pessoas, emCurso.consulta)) {
      lista.push({ id: p.id, rotulo: p.nome, avatar_url: p.avatar_url });
    }
    return lista;
  }, [emCurso, pessoas, totalDaConversa]);

  const aoMudar = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const valor = e.target.value;
      setTexto(valor);
      if (!ativo) return;
      setEmCurso(detectarMencao(valor, e.target.selectionStart ?? valor.length));
      setAtiva(0);
    },
    [ativo, setTexto],
  );

  const escolher = useCallback(
    (s: SugestaoDeMencao) => {
      if (!emCurso) return;
      const rotulo = s.id === TODOS ? 'todos' : s.rotulo;
      const r = inserirMencao(texto, emCurso, rotulo);
      if (s.id !== TODOS) escolhidos.current.set(s.id, s.rotulo);
      setTexto(r.texto);
      setEmCurso(null);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(r.cursor, r.cursor);
      });
    },
    [emCurso, ref, setTexto, texto],
  );

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!emCurso) return false;
      if (e.key === 'Escape') {
        e.preventDefault();
        setEmCurso(null);
        return true;
      }
      if (sugestoes.length === 0) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtiva((i) => (i + 1) % sugestoes.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtiva((i) => (i - 1 + sugestoes.length) % sugestoes.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        escolher(sugestoes[Math.min(ativa, sugestoes.length - 1)]);
        return true;
      }
      return false;
    },
    [ativa, emCurso, escolher, sugestoes],
  );

  const paraEnviar = useCallback(
    (textoFinal: string) =>
      ativo ? mencionadosNoTexto(textoFinal, escolhidos.current) : { ids: [], todos: false },
    [ativo],
  );

  const limpar = useCallback(() => {
    escolhidos.current.clear();
    setEmCurso(null);
  }, []);

  return {
    aberta: ativo && emCurso !== null,
    consulta: emCurso?.consulta ?? '',
    sugestoes,
    ativa,
    aoMudar,
    aoTeclar,
    escolher,
    paraEnviar,
    limpar,
  };
}
