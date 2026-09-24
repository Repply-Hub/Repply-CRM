import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type Ficha,
  ehEmailValido,
  parseFichas,
  serializarFichas,
} from '@/lib/destinatarios-chips';
import { useBuscarDestinatarios } from '@/hooks/use-buscar-destinatarios';

const ROTULO_ORIGEM: Record<string, string> = {
  equipe: 'Equipe',
  cliente: 'Cliente',
  recente: 'Recente',
};

interface Props {
  /** Id do input (o `<label htmlFor>` do compositor aponta para ele). */
  id: string;
  /** Nome acessível do input (para leitor de tela e testes). */
  ariaLabel: string;
  /** A string "Nome <email>, …" (a mesma de `formData.destinatario/cc/cco`). */
  valor: string;
  onChange: (valor: string) => void;
  /** Endereço da própria caixa — não é sugerido. */
  emailDaConta?: string | null;
  placeholder?: string;
}

/**
 * Campo de destinatários com FICHINHAS (chips) + autocompletar. Guarda a lista
 * como fichas por dentro, mas serializa para a MESMA string "Nome <email>, …"
 * que o envio (`parseEnderecos`) e o autosave já leem — por isso é um drop-in do
 * `<Input>` anterior, sem mudar o contrato.
 */
export function CampoDestinatarios({
  id,
  ariaLabel,
  valor,
  onChange,
  emailDaConta,
  placeholder,
}: Props) {
  const fichas = useMemo(() => parseFichas(valor), [valor]);
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { sugestoes } = useBuscarDestinatarios(texto);

  const jaTem = useMemo(
    () => new Set(fichas.map((f) => f.email.toLowerCase())),
    [fichas],
  );
  const eu = (emailDaConta ?? '').toLowerCase();

  // Não sugere a própria caixa nem quem já é ficha.
  const filtradas = useMemo(
    () =>
      sugestoes.filter(
        (s) => s.email.toLowerCase() !== eu && !jaTem.has(s.email.toLowerCase()),
      ),
    [sugestoes, eu, jaTem],
  );

  useEffect(() => {
    setAberto(texto.trim().length >= 2 && filtradas.length > 0);
    setAtivo(0);
  }, [texto, filtradas.length]);

  // Fecha ao clicar fora.
  useEffect(() => {
    const aoClicarFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const adicionar = (f: Ficha) => {
    const email = f.email.trim();
    if (!email) return;
    if (!jaTem.has(email.toLowerCase())) {
      onChange(serializarFichas([...fichas, { ...f, email }]));
    }
    setTexto('');
    setAberto(false);
    setAtivo(0);
  };

  const remover = (email: string) => {
    onChange(serializarFichas(fichas.filter((f) => f.email !== email)));
  };

  /** Transforma o texto digitado (avulso) numa ficha. */
  const confirmarTexto = () => {
    const t = texto.trim().replace(/[,;]+$/, '').trim();
    if (!t) return;
    const f = parseFichas(t)[0];
    if (f?.email) adicionar(f);
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (aberto && filtradas[ativo]) {
        const s = filtradas[ativo];
        adicionar({ nome: s.nome ?? undefined, email: s.email });
      } else {
        confirmarTexto();
      }
    } else if (e.key === ' ') {
      // Barra de espaço fecha a fichinha, como Enter e vírgula — MAS só quando o
      // que já está digitado é um e-mail válido. Sem isso, um nome com espaço
      // ("Ana Souza <ana@x.com>", digitado à mão) seria partido no primeiro
      // espaço. Enquanto não for e-mail válido, o espaço é digitado normalmente.
      // Diferente do Enter, o espaço NÃO escolhe a sugestão em destaque: ele
      // confirma o texto avulso, que é o que a pessoa acabou de escrever.
      if (ehEmailValido(texto.trim())) {
        e.preventDefault();
        confirmarTexto();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtradas.length) {
        setAberto(true);
        setAtivo((a) => Math.min(a + 1, filtradas.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Escape') {
      setAberto(false);
    } else if (e.key === 'Backspace' && texto === '' && fichas.length) {
      e.preventDefault();
      remover(fichas[fichas.length - 1].email);
    }
  };

  return (
    <div ref={containerRef} className="relative flex flex-1 flex-wrap items-center gap-1">
      {fichas.map((f) => {
        const invalida = !ehEmailValido(f.email);
        return (
          <span
            key={f.email}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
              invalida ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground',
            )}
            title={f.nome ? `${f.nome} <${f.email}>` : f.email}
          >
            <span className="max-w-[180px] truncate">{f.nome || f.email}</span>
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 hover:bg-background/60"
              onClick={() => remover(f.email)}
              aria-label={`Remover ${f.email}`}
              title={`Remover ${f.email}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      <input
        id={id}
        aria-label={ariaLabel}
        className="h-8 min-w-[8rem] flex-1 border-none bg-transparent px-0 text-sm shadow-none outline-none placeholder:text-muted-foreground"
        placeholder={fichas.length === 0 ? (placeholder ?? 'email@exemplo.com') : ''}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={aoTeclar}
        onFocus={() => texto.trim().length >= 2 && filtradas.length > 0 && setAberto(true)}
        autoComplete="off"
      />

      {aberto && (
        <ul
          className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-md border bg-popover py-1 shadow-md"
          role="listbox"
        >
          {filtradas.map((s, i) => (
            <li key={`${s.email}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === ativo}
                // onMouseDown (não onClick): o blur do input dispararia antes do
                // clique e fecharia a lista, cancelando a seleção.
                onMouseDown={(e) => {
                  e.preventDefault();
                  adicionar({ nome: s.nome ?? undefined, email: s.email });
                }}
                onMouseEnter={() => setAtivo(i)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
                  i === ativo ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <span className="min-w-0">
                  {s.nome && <span className="font-medium text-foreground">{s.nome}</span>}
                  <span className={cn('truncate', s.nome ? 'ml-1 text-muted-foreground' : 'text-foreground')}>
                    {s.nome ? `<${s.email}>` : s.email}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {ROTULO_ORIGEM[s.origem] ?? s.origem}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
