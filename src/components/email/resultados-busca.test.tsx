import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultadosBusca, type ResultadoBusca } from "./ResultadosBusca";
import { quemDoResultado } from "./email-enderecos";

describe("quemDoResultado", () => {
  it("recebido: mostra o nome do remetente", () => {
    expect(
      quemDoResultado({
        tipo: "received",
        remetente: "Ana Souza <ana@x.com>",
        destinatarios: [],
      }),
    ).toBe("Ana Souza");
  });

  it("enviado: mostra 'Para: <destinatários>'", () => {
    expect(
      quemDoResultado({
        tipo: "sent",
        remetente: "Empresa <caixa@x.com>",
        destinatarios: [{ name: "Bia", email: "bia@x.com" }, { email: "caio@x.com" }],
      }),
    ).toBe("Para: Bia, caio@x.com");
  });

  it("enviado sem destinatário", () => {
    expect(quemDoResultado({ tipo: "sent", remetente: "x", destinatarios: [] })).toBe(
      "Para: (sem destinatário)",
    );
  });
});

function resultado(extra: Partial<ResultadoBusca> = {}): ResultadoBusca {
  return {
    id: "1",
    tipo: "received",
    remetente: "Ana Souza <ana@x.com>",
    destinatarios: [{ email: "eu@empresa.com" }],
    cc: [],
    bcc: [],
    assunto: "Orçamento",
    snippet: "trecho da mensagem",
    data: "2026-09-22T12:00:00Z",
    lido: true,
    gmail_message_id: "n1",
    threadId: "t1",
    caixaOrigem: null,
    ...extra,
  };
}

describe("ResultadosBusca", () => {
  const base = {
    total: 1,
    carregando: false,
    termo: "orça",
    pagina: 0,
    tamanhoPagina: 50,
    onPagina: vi.fn(),
    onAbrir: vi.fn(),
  };

  it("lista o resultado e abre ao clicar", () => {
    const onAbrir = vi.fn();
    render(<ResultadosBusca {...base} onAbrir={onAbrir} resultados={[resultado()]} />);
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Orçamento")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Orçamento"));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it("vazio: avisa que nada foi encontrado", () => {
    render(<ResultadosBusca {...base} total={0} resultados={[]} />);
    expect(screen.getByText(/nenhum e-mail encontrado/i)).toBeInTheDocument();
  });
});
