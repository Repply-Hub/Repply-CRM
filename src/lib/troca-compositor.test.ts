import { describe, it, expect } from "vitest";
import { ehTrocaDeModoNaMesmaMensagem } from "./troca-compositor";

describe("ehTrocaDeModoNaMesmaMensagem", () => {
  it("é troca direta quando já há uma resposta inline PARA a mesma mensagem aberta", () => {
    // Ex.: respondendo o e-mail "abc" e clicando em "Responder a todos" dele.
    expect(ehTrocaDeModoNaMesmaMensagem("inline", "abc", "abc")).toBe(true);
  });

  it("NÃO é troca direta quando a resposta inline é de OUTRA mensagem", () => {
    // Ex.: rascunho de resposta ao e-mail "abc" aberto, mas olhando o "xyz".
    expect(ehTrocaDeModoNaMesmaMensagem("inline", "abc", "xyz")).toBe(false);
  });

  it("NÃO é troca direta quando o compositor é o encaixado (e-mail novo)", () => {
    expect(ehTrocaDeModoNaMesmaMensagem("encaixado", "abc", "abc")).toBe(false);
  });

  it("NÃO é troca direta quando não há compositor aberto", () => {
    expect(ehTrocaDeModoNaMesmaMensagem("fechado", null, "abc")).toBe(false);
  });

  it("NÃO é troca direta sem uma mensagem-alvo registrada", () => {
    expect(ehTrocaDeModoNaMesmaMensagem("inline", null, "abc")).toBe(false);
  });

  it("NÃO é troca direta sem e-mail aberto", () => {
    expect(ehTrocaDeModoNaMesmaMensagem("inline", "abc", null)).toBe(false);
    expect(ehTrocaDeModoNaMesmaMensagem("inline", "abc", undefined)).toBe(false);
  });
});
