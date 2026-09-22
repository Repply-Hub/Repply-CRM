import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeitorEmail } from "./LeitorEmail";
import { type MensagemDaConversa } from "./MensagemConversa";

function msg(extra: Partial<MensagemDaConversa> = {}): MensagemDaConversa {
  return {
    id: "1",
    tipo: "received",
    remetente: "Ana Souza <ana@x.com>",
    destinatarios: [{ email: "eu@empresa.com" }],
    cc: [],
    bcc: [],
    assunto: "Assunto de teste",
    data: "2026-09-22T12:00:00Z",
    snippet: "trecho",
    gmail_message_id: "n1",
    lido: true,
    tem_anexo: false,
    html: "<p>Olá</p>",
    ...extra,
  };
}

function props(extra: Record<string, unknown> = {}) {
  return {
    mensagens: [msg()],
    idAbertoInicial: "1",
    emailDaConta: "eu@empresa.com",
    onVoltar: vi.fn(),
    onClicarEndereco: vi.fn(),
    onCarregarCorpo: vi.fn(),
    onResponder: vi.fn(),
    onEncaminhar: vi.fn(),
    onExcluir: vi.fn(),
    ...extra,
  };
}

describe("LeitorEmail — barra de ações da conversa (estilo Gmail)", () => {
  it("mostra Responder e Encaminhar no topo", () => {
    render(<LeitorEmail {...props()} />);
    expect(
      screen.getAllByRole("button", { name: /^responder$/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /encaminhar/i }).length,
    ).toBeGreaterThan(0);
  });

  it("mostra 'Responder a todos' no topo quando a mais recente tem mais de um destinatário", () => {
    render(
      <LeitorEmail
        {...props({
          onResponderATodos: vi.fn(),
          mensagens: [
            msg({ destinatarios: [{ email: "eu@empresa.com" }, { email: "outro@x.com" }] }),
          ],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /responder a todos/i })).toBeInTheDocument();
  });

  it("esconde 'Responder a todos' no topo quando a mais recente tem um destinatário só", () => {
    render(
      <LeitorEmail
        {...props({
          onResponderATodos: vi.fn(),
          mensagens: [msg({ destinatarios: [{ email: "eu@empresa.com" }] })],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /responder a todos/i })).toBeNull();
  });
});
