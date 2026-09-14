import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Identifica a conversa atual. `Chat.tsx` reaproveita uma instância só do componente ao
   * trocar de conversa — sem isto, um "@" deixado pela metade no grupo A reabre a lista (ou
   * o nome escolhido nele) ao entrar no grupo B. Opcional: quem ainda não tem várias
   * conversas (o campo do WhatsApp, por ora) pode omitir.
   */
  conversaChave?: string;
}

/** Verdadeiro enquanto o teclado está no meio de compor um caractere (acento, IME de
 * chinês/japonês/coreano etc.) — nesse instante Enter/Tab/setas pertencem à composição, não
 * à lista de menção. `keyCode === 229` é o sinal que navegadores antigos mandam quando
 * `isComposing` não existe. */
const emComposicao = (e: React.KeyboardEvent<HTMLTextAreaElement>) =>
  e.nativeEvent.isComposing || e.keyCode === 229;

/** O @ num campo de texto: abre a lista, navega pelo teclado, insere o nome e apura no envio. */
export function useCampoComMencao({
  texto,
  setTexto,
  pessoas,
  ativo,
  totalDaConversa,
  ref,
  conversaChave,
}: Opcoes) {
  const [emCurso, setEmCurso] = useState<MencaoEmCurso | null>(null);
  const [ativa, setAtiva] = useState(0);
  // Inicializador preguiçoso: só cria o Map na primeira renderização, não em toda.
  const escolhidosRef = useRef<Map<string, string>>();
  if (!escolhidosRef.current) escolhidosRef.current = new Map();
  const escolhidos = escolhidosRef.current;

  // Troca de conversa (mesma instância do componente, conversa diferente) ou desligar o @
  // (virou campo de conversa direta) apagam o "@" em curso e quem já tinha sido escolhido —
  // senão a próxima apuração no envio carrega gente de outra conversa.
  //
  // `useLayoutEffect`, não `useEffect`: ele corre depois do render mas ANTES do navegador
  // pintar a tela. Com `useEffect` (que corre depois da pintura), por um quadro a lista da
  // conversa antiga aparece na tela nova, antes de fechar sozinha — some rápido demais pra
  // reparar, mas é a lista errada por um instante.
  const conversaAnterior = useRef(conversaChave);
  const ativoAnterior = useRef(ativo);
  useLayoutEffect(() => {
    const trocouDeConversa = conversaChave !== conversaAnterior.current;
    const foiDesligado = ativoAnterior.current && !ativo;
    if (trocouDeConversa || foiDesligado) {
      setEmCurso(null);
      setAtiva(0);
      escolhidos.clear();
    }
    conversaAnterior.current = conversaChave;
    ativoAnterior.current = ativo;
  }, [conversaChave, ativo, escolhidos]);

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
      if (s.id !== TODOS) escolhidos.set(s.id, s.rotulo);
      setTexto(r.texto);
      setEmCurso(null);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(r.cursor, r.cursor);
      });
    },
    [emCurso, escolhidos, ref, setTexto, texto],
  );

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      // Lista fechada: a tecla não é nossa. Em especial o Esc — sem este corte, ele também
      // sairia consumindo o Esc de quem chama (ex.: o atalho "Esc → Geral" do chat).
      if (!ativo || !emCurso) return false;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Sintético: para no próprio React, antes de chegar no `window`. O chat escuta Esc
        // por um listener nativo em `window` (fora do React) — sem isto, fechar a lista
        // também dispararia o atalho dele.
        e.stopPropagation();
        setEmCurso(null);
        return true;
      }
      // No meio de compor um caractere (acento, IME), Enter/Tab/setas pertencem à
      // composição — deixa o navegador cuidar disso, a lista continua aberta.
      if (emComposicao(e)) return false;
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
      if (e.key === 'Enter' && e.shiftKey) {
        // Shift+Enter é "quebra linha", não "escolher" — fecha a lista e deixa quem chamou
        // tratar a tecla do jeito normal dele.
        setEmCurso(null);
        return false;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        escolher(sugestoes[Math.min(ativa, sugestoes.length - 1)]);
        return true;
      }
      return false;
    },
    [ativa, ativo, emCurso, escolher, sugestoes],
  );

  const paraEnviar = useCallback(
    (textoFinal: string) =>
      ativo ? mencionadosNoTexto(textoFinal, escolhidos) : { ids: [], todos: false },
    [ativo, escolhidos],
  );

  const limpar = useCallback(() => {
    escolhidos.clear();
    setEmCurso(null);
  }, [escolhidos]);

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
