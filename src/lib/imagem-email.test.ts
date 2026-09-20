import { describe, it, expect } from "vitest";
import {
  caminhoImagemEmail,
  TIPOS_IMAGEM_ACEITOS,
  TAMANHO_MAX_IMAGEM,
  extensaoValida,
} from "./imagem-email";

describe("caminhoImagemEmail", () => {
  it("gera path único em inline/{empresa} preservando a extensão", () => {
    const p = caminhoImagemEmail("emp1", "foto.PNG");
    expect(p).toMatch(/^inline\/emp1\/[0-9a-f-]{36}\.png$/);
  });

  it("normaliza jpeg para jpg", () => {
    expect(caminhoImagemEmail("emp1", "a.jpeg")).toMatch(/\.jpg$/);
  });

  it("cai para png quando não há extensão conhecida", () => {
    expect(caminhoImagemEmail("emp1", "semext")).toMatch(/\.png$/);
    expect(caminhoImagemEmail("emp1", "arquivo.bmp")).toMatch(/\.png$/);
  });

  it("dois uploads do mesmo nome não colidem", () => {
    expect(caminhoImagemEmail("emp1", "a.png")).not.toBe(
      caminhoImagemEmail("emp1", "a.png"),
    );
  });
});

describe("validação", () => {
  it("aceita png/jpg/gif/webp", () => {
    expect(TIPOS_IMAGEM_ACEITOS).toEqual(
      expect.arrayContaining([
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
      ]),
    );
    expect(extensaoValida("image/jpeg")).toBe(true);
    expect(extensaoValida("application/pdf")).toBe(false);
  });

  it("tem teto de tamanho positivo", () => {
    expect(TAMANHO_MAX_IMAGEM).toBeGreaterThan(0);
  });
});
