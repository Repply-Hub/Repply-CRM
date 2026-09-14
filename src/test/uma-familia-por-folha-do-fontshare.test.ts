import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cada folha de estilo do Fontshare pede UMA família só.
 *
 * 🔴 O BUG QUE ISTO IMPEDE. Até 14/09/2026 o `index.html` pedia General Sans e Satoshi numa
 * folha combinada (`?f[]=general-sans@…&f[]=satoshi@…`). O servidor do Fontshare responde
 * certo, mas a rede de entrega dele guarda a resposta pelo PRIMEIRO `f[]` e ignora os
 * seguintes — e vale a última resposta gravada. A folha combinada dividia a cópia guardada com
 * todo site que pede só General Sans: a Satoshi não chegava, e o corpo do sistema inteiro caía
 * na fonte do aparelho.
 *
 * Medido em 14/09/2026, com `curl`:
 * - a URL de produção voltava com 4 faces de General Sans e nenhuma de Satoshi, gravada no
 *   cache no mesmo segundo que a URL "só General Sans";
 * - a mesma URL com um parâmetro inútil (que fura o cache) voltava com as duas famílias;
 * - pedir a combinada e, em seguida, só a primeira família fazia a combinada passar a
 *   responder só a primeira. E o inverso também.
 *
 * Nenhum teste de comportamento pega isso: a página funciona, só que na fonte errada, e o
 * defeito aparece e some conforme quem pediu por último. Com uma família por folha, qualquer
 * cópia guardada sob aquela chave contém a família pedida.
 */

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
  // Comentário não é código: a explicação no próprio index.html pode citar a URL antiga.
  .replace(/<!--[\s\S]*?-->/g, '');

const folhas = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const folhasDoFontshare = folhas.filter((url) => url.startsWith('https://api.fontshare.com/v2/css'));

describe('uma família por folha do Fontshare', () => {
  it('🔴 nenhuma folha do Fontshare pede duas famílias', () => {
    expect(folhasDoFontshare.length).toBeGreaterThan(0);

    const combinadas = folhasDoFontshare.filter(
      (url) => (url.match(/f(\[\]|%5B%5D)=/gi) ?? []).length !== 1,
    );

    expect(combinadas).toEqual([]);
  });

  it('as três fontes da marca continuam pedidas (CLAUDE.md §8)', () => {
    expect(folhasDoFontshare.some((url) => url.includes('f[]=general-sans@'))).toBe(true);
    expect(folhasDoFontshare.some((url) => url.includes('f[]=satoshi@'))).toBe(true);
    expect(folhas.some((url) => url.startsWith('https://fonts.googleapis.com/css2?family=JetBrains+Mono'))).toBe(true);
  });
});
