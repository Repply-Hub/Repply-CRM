import { Fragment } from 'react';
import { linkifyText } from '@/lib/linkify';
import { partesComMencao } from '@/lib/mencao';

interface Props {
  texto: string;
  /** Nomes das pessoas que a mensagem de fato mencionou (vindos de `mencionados`). */
  nomes: string[];
  /** A mensagem marcou @todos/@all. */
  todos: boolean;
  /** Nome de quem está lendo — a menção a ele ganha mais destaque. */
  meuNome?: string | null;
}

/** O texto da mensagem com os "@Nome" destacados, e os links continuando links. */
export function TextoComMencoes({ texto, nomes, todos, meuNome }: Props) {
  const partes = partesComMencao(texto, nomes, todos);
  return (
    <>
      {partes.map((p, i) => {
        if (!p.mencao) return <Fragment key={i}>{linkifyText(p.texto)}</Fragment>;
        const minha = p.mencao === 'todos' || (!!meuNome && p.mencao === meuNome);
        return (
          <span
            key={i}
            data-mencao={minha ? 'minha' : 'outra'}
            className={minha ? 'rounded bg-primary/15 px-0.5 font-semibold text-foreground' : 'font-semibold'}
          >
            {p.texto}
          </span>
        );
      })}
    </>
  );
}
