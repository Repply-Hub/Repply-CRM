import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Image as ImageIcon,
  Palette,
  Type,
  RemoveFormatting,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { sanitizarHtmlEmail } from "@/lib/sanitizar-html-email";

export interface EditorTextoRicoProps {
  /** HTML controlado. */
  value: string;
  /** Recebe o HTML já sanitizado (conjunto Essencial). */
  onChange: (html: string) => void;
  /** Habilita o botão Imagem; recebe o arquivo e devolve a URL pública. */
  onEnviarImagem?: (file: File) => Promise<string>;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * Extende o mark `textStyle` para carregar tamanho de fonte inline. O TipTap v2
 * não traz uma extensão oficial de tamanho; Color e FontFamily já operam sobre
 * o MESMO mark `textStyle`, então os três (cor, fonte, tamanho) convivem.
 */
const TamanhoDaFonte = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
        renderHTML: (attributes: { fontSize?: string | null }) =>
          attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
    };
  },
});

const FONTES: { rotulo: string; valor: string | null }[] = [
  { rotulo: "Padrão", valor: null },
  { rotulo: "Arial", valor: "Arial, Helvetica, sans-serif" },
  { rotulo: "Georgia", valor: "Georgia, serif" },
  { rotulo: "Times New Roman", valor: "'Times New Roman', Times, serif" },
  { rotulo: "Courier New", valor: "'Courier New', Courier, monospace" },
  { rotulo: "Verdana", valor: "Verdana, Geneva, sans-serif" },
  { rotulo: "Tahoma", valor: "Tahoma, Geneva, sans-serif" },
];

const TAMANHOS: { rotulo: string; valor: string | null }[] = [
  { rotulo: "Pequeno", valor: "12px" },
  { rotulo: "Normal", valor: null },
  { rotulo: "Grande", valor: "20px" },
  { rotulo: "Enorme", valor: "28px" },
];

/** Fica compacto (barra colapsa no ⋯) quando a largura fica abaixo do limite. */
function useCompacto(ref: React.RefObject<HTMLElement>, limite = 640): boolean {
  const [compacto, setCompacto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width ?? 0;
      setCompacto(w > 0 && w < limite);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, limite]);
  return compacto;
}

function BotaoBarra({
  ativo,
  onClick,
  titulo,
  children,
}: {
  ativo?: boolean;
  onClick: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 shrink-0", ativo && "bg-muted text-foreground")}
      aria-pressed={ativo}
      aria-label={titulo}
      title={titulo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function EditorTextoRico({
  value,
  onChange,
  onEnviarImagem,
  placeholder,
  minHeight = 200,
  disabled,
  ...props
}: EditorTextoRicoProps) {
  const rotulo = props["aria-label"] ?? "Editor";
  const barraRef = useRef<HTMLDivElement>(null);
  const inputImagemRef = useRef<HTMLInputElement>(null);
  const compacto = useCompacto(barraRef);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TamanhoDaFonte,
      Color,
      FontFamily,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "<p></p>",
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": rotulo,
        class: "editor-texto-rico-conteudo focus:outline-none",
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => onChange(sanitizarHtmlEmail(editor.getHTML())),
  });

  // Sincroniza valor externo → editor, sem sobrescrever enquanto a pessoa digita.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const atual = editor.getHTML();
    if ((value || "") !== atual) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const definirLink = () => {
    const anterior = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Endereço do link (deixe vazio para remover):", anterior ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const escolherImagem = () => inputImagemRef.current?.click();

  const aoEscolherImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onEnviarImagem) return;
    try {
      const url = await onEnviarImagem(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
    }
  };

  const definirCor = (cor: string) => editor.chain().focus().setColor(cor).run();
  const definirFonte = (valor: string | null) =>
    valor
      ? editor.chain().focus().setFontFamily(valor).run()
      : editor.chain().focus().unsetFontFamily().run();
  const definirTamanho = (valor: string | null) =>
    editor.chain().focus().setMark("textStyle", { fontSize: valor }).run();
  const limparFormatacao = () =>
    editor.chain().focus().unsetAllMarks().clearNodes().run();

  // Ferramentas secundárias, renderizadas inline (largo) ou dentro do ⋯ (compacto).
  const secundarias = (emMenu: boolean) => {
    const corInput = (
      <label
        className={cn(
          "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
          emMenu ? "w-full cursor-pointer hover:bg-muted" : "cursor-pointer hover:bg-muted",
        )}
        title="Cor do texto"
      >
        <Palette className="h-4 w-4" />
        {emMenu && <span>Cor do texto</span>}
        <input
          type="color"
          aria-label="Cor do texto"
          className={cn("h-5 w-5 cursor-pointer border-0 bg-transparent p-0", !emMenu && "sr-only")}
          onChange={(e) => definirCor(e.target.value)}
        />
      </label>
    );

    return (
      <>
        <BotaoBarra
          titulo="Tachado"
          ativo={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Lista numerada"
          ativo={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Alinhar à esquerda"
          ativo={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Centralizar"
          ativo={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Alinhar à direita"
          ativo={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </BotaoBarra>
        {corInput}
        {/* Fonte */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" title="Fonte">
              <Type className="h-4 w-4" />
              {emMenu && <span>Fonte</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FONTES.map((f) => (
              <DropdownMenuItem key={f.rotulo} onClick={() => definirFonte(f.valor)}>
                <span style={{ fontFamily: f.valor ?? undefined }}>{f.rotulo}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Tamanho */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" title="Tamanho">
              <span className="text-xs font-semibold">A±</span>
              {emMenu && <span>Tamanho</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {TAMANHOS.map((t) => (
              <DropdownMenuItem key={t.rotulo} onClick={() => definirTamanho(t.valor)}>
                {t.rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onEnviarImagem && (
          <BotaoBarra titulo="Imagem" onClick={escolherImagem}>
            <ImageIcon className="h-4 w-4" />
          </BotaoBarra>
        )}
        <BotaoBarra titulo="Limpar formatação" onClick={limparFormatacao}>
          <RemoveFormatting className="h-4 w-4" />
        </BotaoBarra>
      </>
    );
  };

  return (
    <div className="flex flex-col rounded-md border">
      <div
        ref={barraRef}
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1"
      >
        {/* Principais — sempre visíveis */}
        <BotaoBarra
          titulo="Negrito"
          ativo={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Itálico"
          ativo={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Sublinhado"
          ativo={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Lista com marcador"
          ativo={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          titulo="Link"
          ativo={editor.isActive("link")}
          onClick={definirLink}
        >
          <Link2 className="h-4 w-4" />
        </BotaoBarra>

        {!compacto && secundarias(false)}

        {compacto && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Mais ferramentas"
                title="Mais ferramentas"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="flex flex-col gap-0.5 p-1">
              {secundarias(true)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>

      <input
        ref={inputImagemRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={aoEscolherImagem}
      />

      <style>{`
        .editor-texto-rico-conteudo ul { list-style: disc; padding-left: 1.5rem; }
        .editor-texto-rico-conteudo ol { list-style: decimal; padding-left: 1.5rem; }
        .editor-texto-rico-conteudo a { color: #2563eb; text-decoration: underline; }
        .editor-texto-rico-conteudo img { max-width: 100%; height: auto; }
        .editor-texto-rico-conteudo p.is-editor-empty:first-child::before {
          content: attr(data-placeholder); color: hsl(var(--muted-foreground));
          float: left; height: 0; pointer-events: none;
        }
      `}</style>
    </div>
  );
}
