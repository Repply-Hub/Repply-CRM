import { describe, it, expect } from "vitest";
import { sanitizarHtmlEmail } from "./sanitizar-html-email";

describe("sanitizarHtmlEmail", () => {
  it("mantém o conjunto Essencial", () => {
    const ok =
      '<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s> ' +
      '<span style="color: #ff0000; font-size: 18px">e</span> ' +
      '<a href="https://x.com">l</a></p><ul><li>i</li></ul>' +
      '<p><img src="https://x.com/i.png" alt="x"></p>';
    const out = sanitizarHtmlEmail(ok);
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<u>");
    expect(out).toContain("color: #ff0000");
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain("<li>");
    expect(out).toContain("<img");
  });

  it("remove script, handlers e javascript:", () => {
    const mau =
      '<p onclick="x()">t</p><script>alert(1)</script>' +
      '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">j</a>';
    const out = sanitizarHtmlEmail(mau);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("remove style e iframe", () => {
    const out = sanitizarHtmlEmail(
      '<style>b{}</style><iframe src="x"></iframe><p>ok</p>',
    );
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("ok");
  });

  it("lida com nulo/indefinido sem quebrar", () => {
    expect(sanitizarHtmlEmail("")).toBe("");
    // @ts-expect-error valida entrada torta em runtime
    expect(sanitizarHtmlEmail(undefined)).toBe("");
  });
});
