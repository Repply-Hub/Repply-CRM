import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompositorEmail, type RascunhoEmail } from "./CompositorEmail";

const valores: RascunhoEmail = { destinatario: "", assunto: "", corpo: "<p></p>", cc: "", cco: "" };

function props(extra: Record<string, unknown> = {}) {
  return {
    valores,
    onChange: vi.fn(),
    onEnviar: vi.fn(),
    onDescartar: vi.fn(),
    onFechar: vi.fn(),
    isConnected: true,
    isEnviando: false,
    anexos: [],
    onAnexar: vi.fn(),
    onRemoverAnexo: vi.fn(),
    anexando: false,
    ...extra,
  };
}

describe("CompositorEmail — moldura", () => {
  it("encaixado não é um dialog modal e tem Minimizar + Fechar", () => {
    render(<CompositorEmail variante="encaixado" titulo="Nova mensagem" {...props()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /minimizar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
    // o formulário continua ali
    expect(screen.getByLabelText("Para")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar/i })).toBeInTheDocument();
  });

  it("inline não tem Minimizar (mas tem Fechar e o formulário)", () => {
    render(<CompositorEmail variante="inline" titulo="Responder" {...props()} />);
    expect(screen.queryByRole("button", { name: /minimizar/i })).toBeNull();
    expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Para")).toBeInTheDocument();
  });

  it("minimizado esconde o formulário (só o cabeçalho)", () => {
    render(<CompositorEmail variante="encaixado" titulo="Nova mensagem" minimizado {...props()} />);
    expect(screen.getByRole("button", { name: /expandir/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Para")).toBeNull();
  });
});
