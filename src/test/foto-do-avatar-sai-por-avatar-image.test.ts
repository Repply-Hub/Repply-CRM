import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Foto de pessoa dentro de <Avatar> sai por <AvatarImage>, nunca por <img> cru.
 *
 * 🔴 O DEFEITO QUE ISTO IMPEDE (relatado pelo Lucas em 11/09/2026: fotos "cortadas" nos
 * responsáveis dos negócios). O <AvatarFallback> — as iniciais de reserva — só some quando o
 * <Avatar> sabe que a foto carregou, e quem conta isso a ele é o <AvatarImage>. Com um <img>
 * cru no lugar, o <Avatar> nunca fica sabendo: foto E iniciais aparecem juntas, lado a lado
 * dentro do mesmo círculo, e a foto fica espremida.
 *
 * Achado em 4 lugares, todos consertados: os dois do campo de responsáveis, o balão de perfil
 * do usuário e a foto do grupo no chat. O defeito é um PADRÃO, não um lugar — por isso o
 * teste é uma varredura, no mesmo molde de `uma-leitura-de-planilha-so.test.ts`.
 *
 * A prova de comportamento — que o <AvatarImage> esconde as iniciais quando a foto carrega —
 * está em `src/components/pedidos/CampoDeResponsaveis.foto.test.tsx`.
 */

const RAIZ = join(process.cwd(), 'src');

/**
 * Quem pode ter <img> cru dentro de <Avatar>, e por quê.
 *
 * `pages/WhatsAppInbox.tsx`: os 8 avatares de lá usam um TERNÁRIO — `url ? <img> :
 * <AvatarFallback>` —, então foto e iniciais nunca aparecem juntas e o defeito acima não
 * acontece. Sobra lá um problema menor e diferente: link de foto quebrado mostra o ícone de
 * imagem quebrada em vez das iniciais. Ficou de fora em 11/09/2026 por não ser o defeito
 * relatado e porque o arquivo estava em edição por outra frente. Ao mexer nesses avatares,
 * troque por <AvatarImage> + <AvatarFallback> e tire o arquivo desta lista.
 */
const PODEM_TER_IMG_CRU = ['pages/WhatsAppInbox.tsx'];

function arquivosDeTela(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) {
      arquivosDeTela(caminho, achados);
    } else if (item.endsWith('.tsx') && !/\.test\.tsx$/.test(item)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Quantos blocos `<Avatar ...> ... </Avatar>` do texto têm um `<img` dentro. */
function avataresComImgCru(texto: string): number {
  let quantos = 0;
  // O `[\s>]` depois de `Avatar` é o que separa `<Avatar` de `<AvatarImage` e `<AvatarFallback`.
  for (const m of texto.matchAll(/<Avatar[\s>]/g)) {
    const fim = texto.indexOf('</Avatar>', m.index);
    if (fim < 0) continue;
    if (/<img\b/.test(texto.slice(m.index, fim))) quantos += 1;
  }
  return quantos;
}

describe('foto de pessoa dentro de <Avatar>', () => {
  // 20s pelo mesmo motivo do teste das planilhas: este teste lê o projeto inteiro do disco.
  it('🔴 nenhuma tela desenha a foto com <img> cru dentro do <Avatar>', { timeout: 20_000 }, () => {
    const permitidos = new Set(PODEM_TER_IMG_CRU);

    const infratores = arquivosDeTela(RAIZ)
      .filter((caminho) => avataresComImgCru(readFileSync(caminho, 'utf8')) > 0)
      .map((caminho) => relative(RAIZ, caminho).split(sep).join('/'))
      .filter((relativo) => !permitidos.has(relativo));

    expect(infratores).toEqual([]);
  });
});
