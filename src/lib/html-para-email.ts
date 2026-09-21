/**
 * Prepara o HTML do editor para a CAIXA de quem recebe (Gmail e afins): dá
 * espaçamento inline aos parágrafos e preserva as linhas em branco.
 *
 * Por quê: o editor gera `<p>` por parágrafo e `<p></p>` para linha em branco.
 * As caixas de e-mail DESCARTAM a margem de folha de estilo (a que separa um
 * parágrafo do outro) e COLAPSAM parágrafos vazios — então o espaçamento que a
 * pessoa deu no Repply some ao chegar. Estilo INLINE sobrevive; é o que este
 * helper injeta. É fidelidade, não segurança — a limpeza é do
 * `sanitizarHtmlEmail`, que roda antes.
 */
export function prepararHtmlParaEmail(html: string): string {
  const bruto = html ?? "";
  if (!bruto) return "";
  const doc = new DOMParser().parseFromString(`<body>${bruto}</body>`, "text/html");
  doc.body.querySelectorAll("p").forEach((p) => {
    // Linha em branco: sem texto e sem elementos-filho. Vira um <br> para ter
    // altura real e não colapsar na caixa de quem recebe.
    if ((p.textContent ?? "").trim() === "" && p.children.length === 0) {
      p.innerHTML = "<br>";
    }
    const estilo = p.getAttribute("style") ?? "";
    if (!/margin/i.test(estilo)) {
      const base = estilo && !estilo.trim().endsWith(";") ? `${estilo};` : estilo;
      p.setAttribute("style", `${base}margin:0 0 1em 0`);
    }
  });
  return doc.body.innerHTML;
}
