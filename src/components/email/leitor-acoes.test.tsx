import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeitorEmail, type EmailAberto } from "./LeitorEmail";

function emailBase(extra: Partial<EmailAberto> = {}): EmailAberto {
  return {
    id: "1",
    assunto: "Assunto de teste",
    remetente: "Ana Souza <ana@exemplo.com>",
    destinatario: "eu@empresa.com",
    html: "<p>Olá</p>",
    snippet: "Olá",
    type: "received",
    ...extra,
  };
}

function props(extra: Record<string, unknown> = {}) {
  return {
    email: emailBase(),
    emailDaConta: "eu@empresa.com",
    onVoltar: vi.fn(),
    onExcluir: vi.fn(),
    onResponder: vi.fn(),
    ...extra,
  };
}

describe("LeitorEmail — barra de ações (estilo Gmail)", () => {
  it("mostra Responder, Encaminhar e o menu de mais ações", () => {
    render(<LeitorEmail {...props({ onEncaminhar: vi.fn() })} />);
    // "Responder" aparece na barra e no rodapé — basta existir ao menos um.
    expect(screen.getAllByRole("button", { name: /^responder$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /encaminhar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mais ações/i })).toBeInTheDocument();
  });

  it("mostra 'Responder a todos' quando há mais de um destinatário", () => {
    render(
      <LeitorEmail
        {...props({
          onResponderATodos: vi.fn(),
          email: emailBase({
            destinatarios: [{ email: "eu@empresa.com" }, { email: "outro@x.com" }],
          }),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /responder a todos/i })).toBeInTheDocument();
  });

  it("esconde 'Responder a todos' quando só há um destinatário", () => {
    render(
      <LeitorEmail
        {...props({
          onResponderATodos: vi.fn(),
          email: emailBase({ destinatarios: [{ email: "eu@empresa.com" }] }),
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /responder a todos/i })).toBeNull();
  });
});
