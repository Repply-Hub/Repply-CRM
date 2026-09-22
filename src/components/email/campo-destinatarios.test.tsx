import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Isola do banco: o autocompletar (RPC) não é exercitado neste teste.
vi.mock("@/hooks/use-buscar-destinatarios", () => ({
  useBuscarDestinatarios: () => ({ sugestoes: [], carregando: false }),
}));

import { CampoDestinatarios } from "./CampoDestinatarios";

function props(extra: Record<string, unknown> = {}) {
  return {
    id: "to",
    ariaLabel: "Para",
    valor: "",
    onChange: vi.fn(),
    ...extra,
  };
}

describe("CampoDestinatarios", () => {
  it("mostra as fichinhas do valor", () => {
    render(<CampoDestinatarios {...props({ valor: "Ana Souza <ana@x.com>, bia@x.com" })} />);
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("bia@x.com")).toBeInTheDocument();
  });

  it("Enter adiciona uma ficha e serializa", () => {
    const onChange = vi.fn();
    render(<CampoDestinatarios {...props({ valor: "Ana Souza <ana@x.com>", onChange })} />);
    const input = screen.getByLabelText("Para");
    fireEvent.change(input, { target: { value: "bia@x.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Ana Souza <ana@x.com>, bia@x.com");
  });

  it("vírgula também adiciona", () => {
    const onChange = vi.fn();
    render(<CampoDestinatarios {...props({ valor: "", onChange })} />);
    const input = screen.getByLabelText("Para");
    fireEvent.change(input, { target: { value: "ana@x.com" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledWith("ana@x.com");
  });

  it("clicar no x remove a ficha", () => {
    const onChange = vi.fn();
    render(<CampoDestinatarios {...props({ valor: "Ana Souza <ana@x.com>, bia@x.com", onChange })} />);
    fireEvent.click(screen.getByRole("button", { name: /remover ana@x.com/i }));
    expect(onChange).toHaveBeenCalledWith("bia@x.com");
  });

  it("Backspace no vazio remove a última ficha", () => {
    const onChange = vi.fn();
    render(<CampoDestinatarios {...props({ valor: "Ana Souza <ana@x.com>, bia@x.com", onChange })} />);
    const input = screen.getByLabelText("Para");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith("Ana Souza <ana@x.com>");
  });
});
