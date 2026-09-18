import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorTextoRico } from "./EditorTextoRico";

describe("EditorTextoRico", () => {
  it("mostra o valor inicial em HTML", () => {
    render(
      <EditorTextoRico value="<p>oi mundo</p>" onChange={() => {}} aria-label="Corpo" />,
    );
    expect(screen.getByText("oi mundo")).toBeInTheDocument();
    expect(screen.getByLabelText("Corpo")).toBeInTheDocument();
  });

  it("tem os botões principais da barra", () => {
    render(<EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />);
    expect(screen.getByRole("button", { name: /negrito/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /itálico/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sublinhado/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /link/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /lista com marcador/i }),
    ).toBeInTheDocument();
  });

  it("clicar em Negrito dispara onChange com HTML", () => {
    const onChange = vi.fn();
    render(<EditorTextoRico value="<p>x</p>" onChange={onChange} aria-label="Corpo" />);
    fireEvent.click(screen.getByRole("button", { name: /negrito/i }));
    expect(onChange).toHaveBeenCalled();
    expect(typeof onChange.mock.calls.at(-1)?.[0]).toBe("string");
  });

  it("o botão Imagem só aparece quando onEnviarImagem é passado", () => {
    const { rerender } = render(
      <EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />,
    );
    expect(screen.queryByRole("button", { name: /imagem/i })).toBeNull();
    rerender(
      <EditorTextoRico
        value="<p>x</p>"
        onChange={() => {}}
        aria-label="Corpo"
        onEnviarImagem={async () => "https://x/i.png"}
      />,
    );
    expect(screen.getByRole("button", { name: /imagem/i })).toBeInTheDocument();
  });
});
