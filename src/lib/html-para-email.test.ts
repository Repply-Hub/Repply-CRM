import { describe, it, expect } from "vitest";
import { prepararHtmlParaEmail } from "./html-para-email";

describe("prepararHtmlParaEmail", () => {
  it("dá margem inline aos parágrafos", () => {
    const out = prepararHtmlParaEmail("<p>linha 1</p><p>linha 2</p>");
    expect((out.match(/margin/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain("linha 1");
    expect(out).toContain("linha 2");
  });

  it("preserva linha em branco (p vazio não colapsa)", () => {
    const out = prepararHtmlParaEmail("<p>a</p><p></p><p>b</p>");
    expect(out).toMatch(/<p[^>]*>(<br\s*\/?>|&nbsp;)<\/p>/i);
    expect(out).toContain(">a</p>");
    expect(out).toContain(">b</p>");
  });

  it("não inventa conteúdo nem remove o texto", () => {
    const out = prepararHtmlParaEmail("<p>oi <strong>mundo</strong></p>");
    expect(out).toContain("<strong>mundo</strong>");
  });

  it("não duplica margin quando o parágrafo já tem", () => {
    const out = prepararHtmlParaEmail('<p style="margin:0 0 2em 0">x</p>');
    expect((out.match(/margin/g) || []).length).toBe(1);
  });

  it("lida com vazio/nulo", () => {
    expect(prepararHtmlParaEmail("")).toBe("");
    expect(prepararHtmlParaEmail(undefined as unknown as string)).toBe("");
  });
});
