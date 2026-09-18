import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { EditorTextoRico } from "./EditorTextoRico";

// Reproduz a extensão de tamanho do componente para provar que ela RENDERIZA o
// font-size (o defeito relatado era da barra perder a seleção, não da extensão).
const TamanhoDaFonte = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontSize || null,
        renderHTML: (attrs: { fontSize?: string | null }) =>
          attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
      },
    };
  },
});

describe("EditorTextoRico", () => {
  it("mostra o valor inicial em HTML", () => {
    render(<EditorTextoRico value="<p>oi mundo</p>" onChange={() => {}} aria-label="Corpo" />);
    expect(screen.getByText("oi mundo")).toBeInTheDocument();
    expect(screen.getByLabelText("Corpo")).toBeInTheDocument();
  });

  it("tem os botões principais da barra", () => {
    render(<EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />);
    expect(screen.getByRole("button", { name: /negrito/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /itálico/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sublinhado/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tachado/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^link$/i })).toBeInTheDocument();
  });

  it("clicar em Negrito dispara onChange com HTML", () => {
    const onChange = vi.fn();
    render(<EditorTextoRico value="<p>x</p>" onChange={onChange} aria-label="Corpo" />);
    fireEvent.click(screen.getByRole("button", { name: /negrito/i }));
    expect(onChange).toHaveBeenCalled();
    expect(typeof onChange.mock.calls.at(-1)?.[0]).toBe("string");
  });

  it("o menu Tamanho abre e mostra as opções (menu próprio, não Radix aninhado)", () => {
    render(<EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />);
    // Fechado: a opção não está na tela.
    expect(screen.queryByText("Grande")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /tamanho/i }));
    expect(screen.getByText("Grande")).toBeInTheDocument();
    expect(screen.getByText("Pequeno")).toBeInTheDocument();
  });

  it("o menu Cor abre com as opções", () => {
    render(<EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />);
    fireEvent.click(screen.getByRole("button", { name: /cor do texto/i }));
    expect(screen.getByRole("button", { name: /vermelho/i })).toBeInTheDocument();
  });

  it("o botão Imagem só aparece quando onEnviarImagem é passado", () => {
    const { rerender } = render(<EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />);
    expect(screen.queryByRole("button", { name: /^imagem$/i })).toBeNull();
    rerender(
      <EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" onEnviarImagem={async () => "https://x/i.png"} />,
    );
    expect(screen.getByRole("button", { name: /^imagem$/i })).toBeInTheDocument();
  });
});

describe("extensão de tamanho de fonte", () => {
  it("renderiza font-size no HTML quando há seleção", () => {
    const editor = new Editor({
      extensions: [StarterKit, TamanhoDaFonte, Color],
      content: "<p>abcdef</p>",
    });
    editor.commands.selectAll();
    editor.chain().focus().setMark("textStyle", { fontSize: "24px" }).run();
    const html = editor.getHTML();
    editor.destroy();
    expect(html).toContain("font-size: 24px");
  });
});
