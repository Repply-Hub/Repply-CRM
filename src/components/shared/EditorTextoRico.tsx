import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
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
  Type,
  RemoveFormatting,
  MoreHorizontal,
  ChevronDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

/**
 * Estende a extensão `Image` para carregar uma LARGURA em px. A `Image` de
 * fábrica só tem `src/alt/title`; sem largura, a imagem chega no tamanho
 * NATURAL na caixa de quem recebe (a assinatura da MD chegava gigante). O
 * `width` vira o atributo HTML `width` + `style` inline (o max-width protege no
 * celular). "Original" = sem `width`, volta ao natural (escolha deliberada).
 */
const ImagemComTamanho = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const bruto = element.getAttribute("width") || element.style.width;
          const n = parseInt(String(bruto ?? ""), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        // Só o atributo HTML `width` (em px) — é o que a caixa de quem recebe
        // respeita. O `max-width:100%` (segurança no celular) vai no
        // `HTMLAttributes` estático do `.configure`, não aqui.
        renderHTML: (attributes: { width?: number | null }) =>
          attributes.width ? { width: attributes.width } : {},
      },
    };
  },
});

const TAMANHOS_IMAGEM: { rotulo: string; valor: number | null }[] = [
  { rotulo: "Pequena", valor: 150 },
  { rotulo: "Média", valor: 300 },
  { rotulo: "Grande", valor: 500 },
  { rotulo: "Original", valor: null },
];

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
  { rotulo: "Médio", valor: "18px" },
  { rotulo: "Grande", valor: "24px" },
  { rotulo: "Enorme", valor: "32px" },
];

const CORES: { rotulo: string; valor: string | null }[] = [
  { rotulo: "Padrão", valor: null },
  { rotulo: "Preto", valor: "#000000" },
  { rotulo: "Cinza", valor: "#6b7280" },
  { rotulo: "Vermelho", valor: "#dc2626" },
  { rotulo: "Laranja", valor: "#ea580c" },
  { rotulo: "Amarelo", valor: "#ca8a04" },
  { rotulo: "Verde", valor: "#16a34a" },
  { rotulo: "Azul", valor: "#2563eb" },
  { rotulo: "Roxo", valor: "#7c3aed" },
  { rotulo: "Rosa", valor: "#db2777" },
];

/** Fica compacto (só o excedente vai para o ⋯) abaixo desta largura. */
function useCompacto(ref: React.RefObject<HTMLElement>, limite = 560): boolean {
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

/**
 * Botão de barra. 🔴 `onMouseDown preventDefault` é o que faz a formatação
 * funcionar: sem ele, clicar no botão TIRA a seleção do editor antes do clique
 * agir, e negrito/cor/tamanho não teriam mais sobre qual texto aplicar.
 */
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

/**
 * Menu flutuante próprio (não usa o DropdownMenu do Radix, que ao ser aninhado
 * bugava e tirava a seleção do editor). TUDO aqui — o gatilho e cada item —
 * usa `onMouseDown preventDefault`, então o editor nunca perde a seleção
 * enquanto a pessoa escolhe fonte/tamanho/cor.
 */
function MenuBarra({
  titulo,
  gatilho,
  largura = "w-44",
  children,
}: {
  titulo: string;
  gatilho: React.ReactNode;
  largura?: string;
  children: (fechar: () => void) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={titulo}
        title={titulo}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAberto((a) => !a)}
      >
        {gatilho}
      </Button>
      {aberto && (
        <div
          role="menu"
          className={cn(
            "absolute left-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md",
            largura,
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}

function ItemMenu({
  onClick,
  ativo,
  children,
}: {
  onClick: () => void;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
      {ativo && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
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
  // Guarda o último HTML que ESTE editor emitiu, para o eco do próprio
  // `onChange` não disparar um `setContent` que ressemearia o conteúdo (era o
  // que impedia apagar a assinatura já semeada no corpo).
  const ultimoEmitido = useRef(value);
  const compacto = useCompacto(barraRef);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      ImagemComTamanho.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { style: "max-width:100%;height:auto" },
      }),
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
    onUpdate: ({ editor }) => {
      const html = sanitizarHtmlEmail(editor.getHTML());
      ultimoEmitido.current = html;
      onChange(html);
    },
  });

  // Sincroniza valor externo → editor. Só reescreve quando a mudança veio de
  // FORA (não é o eco do nosso próprio onChange) e o editor não está em foco —
  // senão o cursor pularia e a assinatura semeada voltaria ao ser apagada.
  useEffect(() => {
    if (!editor) return;
    if (value === ultimoEmitido.current) return;
    if (editor.isFocused) return;
    const atual = editor.getHTML();
    if ((value || "") !== atual) {
      editor.commands.setContent(value || "", false);
      ultimoEmitido.current = value;
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
      // Teto ao inserir: mede o tamanho natural e limita a 500px, para a imagem
      // nunca chegar gigante na caixa de quem recebe. `window.Image` é o do
      // navegador (não confundir com a extensão `Image` do TipTap).
      const medir = new window.Image();
      const inserir = (largura: number) =>
        editor.chain().focus().setImage({ src: url, width: largura } as { src: string; width: number }).run();
      medir.onload = () => inserir(Math.min(medir.naturalWidth || 500, 500));
      medir.onerror = () => inserir(500);
      medir.src = url;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
    }
  };

  const definirCor = (cor: string | null) =>
    cor
      ? editor.chain().focus().setColor(cor).run()
      : editor.chain().focus().unsetColor().run();
  const definirFonte = (valor: string | null) =>
    valor
      ? editor.chain().focus().setFontFamily(valor).run()
      : editor.chain().focus().unsetFontFamily().run();
  const definirTamanho = (valor: string | null) =>
    editor.chain().focus().setMark("textStyle", { fontSize: valor }).run();

  const alinhamentos = (
    <>
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
    </>
  );
  const botaoImagem = onEnviarImagem ? (
    <BotaoBarra titulo="Imagem" onClick={escolherImagem}>
      <ImageIcon className="h-4 w-4" />
    </BotaoBarra>
  ) : null;
  const botaoLimpar = (
    <BotaoBarra titulo="Limpar formatação" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
      <RemoveFormatting className="h-4 w-4" />
    </BotaoBarra>
  );
  // Só aparece quando uma imagem está selecionada. Fica INLINE (não dentro do
  // ⋯) para não aninhar popover em popover.
  const menuTamanhoImagem = editor.isActive("image") ? (
    <MenuBarra
      titulo="Tamanho da imagem"
      largura="w-40"
      gatilho={<><ImageIcon className="h-4 w-4" /><ChevronDown className="h-3 w-3" /></>}
    >
      {(fechar) =>
        TAMANHOS_IMAGEM.map((t) => (
          <ItemMenu
            key={t.rotulo}
            onClick={() => {
              editor.chain().focus().updateAttributes("image", { width: t.valor }).run();
              fechar();
            }}
          >
            {t.rotulo}
          </ItemMenu>
        ))
      }
    </MenuBarra>
  ) : null;

  const Sep = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

  return (
    <div className="flex flex-col rounded-md border">
      <div
        ref={barraRef}
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1"
      >
        <BotaoBarra titulo="Negrito" ativo={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra titulo="Itálico" ativo={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra titulo="Sublinhado" ativo={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra titulo="Tachado" ativo={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </BotaoBarra>

        <Sep />

        {/* Cor */}
        <MenuBarra titulo="Cor do texto" largura="w-40" gatilho={<><span className="text-base leading-none font-semibold">A</span><ChevronDown className="h-3 w-3" /></>}>
          {(fechar) => (
            <div className="grid grid-cols-5 gap-1 p-1">
              {CORES.map((c) => (
                <button
                  key={c.rotulo}
                  type="button"
                  title={c.rotulo}
                  aria-label={c.rotulo}
                  className={cn(
                    "h-6 w-6 rounded-full border",
                    !c.valor && "flex items-center justify-center text-[9px] text-muted-foreground",
                  )}
                  style={c.valor ? { backgroundColor: c.valor } : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    definirCor(c.valor);
                    fechar();
                  }}
                >
                  {!c.valor && "A"}
                </button>
              ))}
            </div>
          )}
        </MenuBarra>

        {/* Fonte */}
        <MenuBarra titulo="Fonte" largura="w-48" gatilho={<><Type className="h-4 w-4" /><ChevronDown className="h-3 w-3" /></>}>
          {(fechar) =>
            FONTES.map((f) => (
              <ItemMenu
                key={f.rotulo}
                ativo={f.valor ? editor.isActive("textStyle", { fontFamily: f.valor }) : false}
                onClick={() => {
                  definirFonte(f.valor);
                  fechar();
                }}
              >
                <span style={{ fontFamily: f.valor ?? undefined }}>{f.rotulo}</span>
              </ItemMenu>
            ))
          }
        </MenuBarra>

        {/* Tamanho */}
        <MenuBarra titulo="Tamanho" largura="w-40" gatilho={<><span className="text-xs font-semibold">Tamanho</span><ChevronDown className="h-3 w-3" /></>}>
          {(fechar) =>
            TAMANHOS.map((t) => (
              <ItemMenu
                key={t.rotulo}
                ativo={t.valor ? editor.isActive("textStyle", { fontSize: t.valor }) : false}
                onClick={() => {
                  definirTamanho(t.valor);
                  fechar();
                }}
              >
                <span style={{ fontSize: t.valor ?? undefined }}>{t.rotulo}</span>
              </ItemMenu>
            ))
          }
        </MenuBarra>

        <Sep />

        <BotaoBarra titulo="Lista com marcador" ativo={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra titulo="Lista numerada" ativo={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra titulo="Link" ativo={editor.isActive("link")} onClick={definirLink}>
          <Link2 className="h-4 w-4" />
        </BotaoBarra>

        <Sep />

        {/* Tamanho da imagem: inline e só quando há imagem selecionada. */}
        {menuTamanhoImagem}

        {/* Alinhamento + imagem + limpar: inline quando cabe, no ⋯ quando estreito. */}
        {!compacto ? (
          <>
            {alinhamentos}
            {botaoImagem}
            {botaoLimpar}
          </>
        ) : (
          <MenuBarra titulo="Mais ferramentas" largura="w-auto" gatilho={<MoreHorizontal className="h-4 w-4" />}>
            {() => (
              <div className="flex items-center gap-0.5 p-0.5">
                {alinhamentos}
                {botaoImagem}
                {botaoLimpar}
              </div>
            )}
          </MenuBarra>
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
        .editor-texto-rico-conteudo img { max-width: 100%; height: auto; cursor: pointer; border-radius: 2px; }
        .editor-texto-rico-conteudo img.ProseMirror-selectednode { outline: 2px solid hsl(var(--primary)); outline-offset: 1px; }
        .editor-texto-rico-conteudo .ProseMirror-gapcursor:after { border-top-color: hsl(var(--foreground)); }
        .editor-texto-rico-conteudo p.is-editor-empty:first-child::before {
          content: attr(data-placeholder); color: hsl(var(--muted-foreground));
          float: left; height: 0; pointer-events: none;
        }
      `}</style>
    </div>
  );
}
