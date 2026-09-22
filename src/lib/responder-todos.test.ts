import { describe, it, expect } from "vitest";
import { montarCcResponderATodos } from "./responder-todos";

describe("montarCcResponderATodos", () => {
  it("junta destinatários e Cc, tira o remetente e a própria caixa, preserva 'Nome <email>'", () => {
    expect(
      montarCcResponderATodos(
        "ana@x.com",
        [
          { name: "Ana", email: "ana@x.com" },
          { name: "Bia", email: "bia@x.com" },
        ],
        [{ email: "caio@x.com" }],
        "eu@x.com",
      ),
    ).toBe("Bia <bia@x.com>, caio@x.com");
  });

  it("devolve vazio quando só sobra o próprio remetente", () => {
    expect(
      montarCcResponderATodos("ana@x.com", [{ email: "ana@x.com" }], [], "eu@x.com"),
    ).toBe("");
  });

  it("tira a própria caixa da cópia (não me copio ao responder a todos)", () => {
    expect(
      montarCcResponderATodos(
        "ana@x.com",
        [
          { email: "eu@x.com" },
          { email: "bia@x.com" },
        ],
        [],
        "eu@x.com",
      ),
    ).toBe("bia@x.com");
  });

  it("elimina duplicados por e-mail, ignorando maiúsculas/minúsculas", () => {
    expect(
      montarCcResponderATodos(
        "ana@x.com",
        [
          { name: "Bia", email: "bia@x.com" },
          { name: "Bia de novo", email: "BIA@x.com" },
        ],
        [{ email: "bia@X.COM" }],
        "eu@x.com",
      ),
    ).toBe("Bia <bia@x.com>");
  });

  it("ignora itens sem e-mail e espaços em volta", () => {
    expect(
      montarCcResponderATodos(
        "ana@x.com",
        [{ email: " bia@x.com " }, { name: "Sem endereço" }, { email: "" }],
        [],
        "eu@x.com",
      ),
    ).toBe("bia@x.com");
  });

  it("aguenta listas nulas/ausentes sem quebrar", () => {
    expect(montarCcResponderATodos("ana@x.com", undefined, undefined, "eu@x.com")).toBe("");
  });
});
