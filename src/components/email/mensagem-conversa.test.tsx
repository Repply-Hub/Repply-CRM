import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MensagemConversa, type MensagemDaConversa } from "./MensagemConversa";

function mensagem(extra: Partial<MensagemDaConversa> = {}): MensagemDaConversa {
  return {
    id: "1",
    tipo: "received",
    remetente: "Ana Souza <ana@x.com>",
    destinatarios: [{ email: "eu@empresa.com" }],
    cc: [],
    bcc: [],
    assunto: "Assunto",
    data: "2026-09-22T12:00:00Z",
    snippet: "trecho da previa",
    gmail_message_id: "nyl_1",
    lido: true,
    tem_anexo: false,
    html: "<p>CORPO_COMPLETO_UNICO</p>",
    anexos: [],
    ...extra,
  };
}

function props(extra: Record<string, unknown> = {}) {
  return {
    mensagem: mensagem(),
    emailDaConta: "eu@empresa.com",
    aberta: false,
    onAlternar: vi.fn(),
    onResponder: vi.fn(),
    onEncaminhar: vi.fn(),
    onExcluir: vi.fn(),
    ...extra,
  };
}

describe("MensagemConversa", () => {
  it("recolhida: mostra remetente e trecho, NÃO mostra o corpo nem o menu ⋮", () => {
    render(<MensagemConversa {...props({ aberta: false })} />);
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText(/trecho da previa/i)).toBeInTheDocument();
    expect(screen.queryByText(/CORPO_COMPLETO_UNICO/)).toBeNull();
    expect(screen.queryByRole("button", { name: /mais ações/i })).toBeNull();
  });

  it("aberta: mostra o corpo e o menu ⋮", () => {
    render(<MensagemConversa {...props({ aberta: true })} />);
    expect(screen.getByText(/CORPO_COMPLETO_UNICO/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mais ações/i })).toBeInTheDocument();
  });

  it("recolhida enviada aparece como 'Você'", () => {
    render(
      <MensagemConversa
        {...props({ aberta: false, mensagem: mensagem({ tipo: "sent", remetente: "eu@empresa.com <eu@empresa.com>" }) })}
      />,
    );
    expect(screen.getByText("Você")).toBeInTheDocument();
  });
});
