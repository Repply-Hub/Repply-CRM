import { describe, it, expect } from "vitest";
import { parseFichas, serializarFichas, ehEmailValido } from "./destinatarios-chips";

describe("parseFichas", () => {
  it("separa 'Nome <email>' e 'email' em fichas", () => {
    expect(parseFichas("Ana Souza <ana@x.com>, bia@x.com")).toEqual([
      { nome: "Ana Souza", email: "ana@x.com" },
      { email: "bia@x.com" },
    ]);
  });

  it("string vazia = nenhuma ficha", () => {
    expect(parseFichas("")).toEqual([]);
    expect(parseFichas("  , ")).toEqual([]);
  });

  it("aceita ponto-e-vírgula como separador", () => {
    expect(parseFichas("ana@x.com; bia@x.com")).toEqual([
      { email: "ana@x.com" },
      { email: "bia@x.com" },
    ]);
  });
});

describe("serializarFichas", () => {
  it("monta 'Nome <email>, …' (só e-mail quando sem nome)", () => {
    expect(
      serializarFichas([{ nome: "Ana Souza", email: "ana@x.com" }, { email: "bia@x.com" }]),
    ).toBe("Ana Souza <ana@x.com>, bia@x.com");
  });

  it("vazio = string vazia", () => {
    expect(serializarFichas([])).toBe("");
  });

  it("ida e volta preserva", () => {
    const s = "Ana Souza <ana@x.com>, bia@x.com";
    expect(serializarFichas(parseFichas(s))).toBe(s);
  });
});

describe("ehEmailValido", () => {
  it("aceita e-mail comum e 'Nome <email>'", () => {
    expect(ehEmailValido("ana@x.com")).toBe(true);
    expect(ehEmailValido("Ana <ana@x.com>")).toBe(true);
  });
  it("recusa lixo", () => {
    expect(ehEmailValido("semarroba")).toBe(false);
    expect(ehEmailValido("a@b")).toBe(false);
  });
});
