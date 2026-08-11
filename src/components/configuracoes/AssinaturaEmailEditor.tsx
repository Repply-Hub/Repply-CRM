import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  name: string;
  value: string;
  onChange: (html: string) => void;
}

/**
 * Editor mínimo para assinatura de e-mail: negrito, itálico, sublinhado e
 * link, via `contentEditable` + `execCommand`. Não puxa uma lib de rich-text
 * inteira (tiptap/quill) para um campo deste tamanho — `execCommand` é
 * depreciado mas nenhum navegador o removeu, e o escopo aqui é bem menor que
 * o de um editor de documento.
 *
 * `contentEditable` não participa de `FormData` nativo, então mantém um
 * `<input type="hidden">` em sincronia: o resto do formulário em `ProfileTab`
 * é não controlado (lê tudo via `FormData` no submit) — isto deixa este campo
 * ser a única exceção controlada sem mudar o resto do form.
 */
export function AssinaturaEmailEditor({ name, value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const ultimoValorEmitidoRef = useRef(value);

  // Só escreve no DOM quando o valor mudou por FORA (troca de usuário,
  // carregamento inicial) e o editor não está em foco — nunca a cada
  // re-render por causa do próprio `onChange`, senão o cursor pularia pro
  // início do texto a cada tecla digitada.
  useEffect(() => {
    if (
      editorRef.current &&
      value !== ultimoValorEmitidoRef.current &&
      document.activeElement !== editorRef.current
    ) {
      editorRef.current.innerHTML = value;
      ultimoValorEmitidoRef.current = value;
    }
  }, [value]);

  const emitir = () => {
    if (!editorRef.current) return;
    ultimoValorEmitidoRef.current = editorRef.current.innerHTML;
    onChange(editorRef.current.innerHTML);
  };

  const executar = (comando: string, argumento?: string) => {
    editorRef.current?.focus();
    document.execCommand(comando, false, argumento);
    emitir();
  };

  const inserirLink = () => {
    const url = window.prompt('Endereço do link (https://...)');
    if (!url) return;
    executar('createLink', url);
  };

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
        {/* `onMouseDown` com `preventDefault`: sem isto, o clique no botão tira o
            foco/seleção do editor ANTES do `onClick` rodar, e o "negrito" não
            teria mais em cima de qual texto aplicar. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executar('bold')}
          title="Negrito"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executar('italic')}
          title="Itálico"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executar('underline')}
          title="Sublinhado"
        >
          <Underline className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={inserirLink}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Assinatura de e-mail"
        data-placeholder="Ex: Atenciosamente, Fulano — Cargo"
        className="min-h-[100px] px-3 py-2 text-sm outline-none [&_a]:text-primary [&_a]:underline empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        onInput={emitir}
      />
      {/* `readOnly` porque quem escreve aqui é o `useEffect`/`onInput` acima, não
          digitação direta — React reclamaria de um controlado sem `onChange`
          próprio. */}
      <input type="hidden" name={name} value={value} readOnly />
    </div>
  );
}
