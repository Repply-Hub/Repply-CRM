import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Duplicar negócio tem UM caminho só: o botão do painel navega para `/pedidos/novo?copiaDe=`, e
 * quem traduz o negócio em preenchimento é `montarCopiaDeNegocio`.
 *
 * 🔴 O que isto impede é a segunda rotina de cópia — uma tela montando "à mão" o negócio novo,
 * com as regras de etapa e de campos extras repetidas e divergentes. É o mesmo desenho das
 * varreduras de planilha e de CNPJ: teste de comportamento não pega cópia nova, porque cada
 * cópia passa nos próprios testes.
 */

const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) achados.push(caminho);
  }
  return achados;
}
// `sep`, e não uma barra escrita à mão: no Windows o caminho vem com contrabarra.
const relativo = (caminho: string) => relative(RAIZ, caminho).split(sep).join('/');

describe('duplicar negócio por um caminho só', () => {
  it('🔴 o painel do negócio duplica navegando para /pedidos/novo?copiaDe=', () => {
    const codigo = ler('components/pedidos/PainelDoNegocio.tsx');
    expect(codigo).toContain('Duplicar');
    expect(codigo).toMatch(/\/pedidos\/novo\?copiaDe=/);
  });

  it('🔴 só a tela de novo negócio monta a cópia', { timeout: 60_000 }, () => {
    const podem = new Set(['lib/copia-de-negocio.ts', 'pages/NovoPedido.tsx']);
    const infratores = arquivosDeCodigo(RAIZ)
      .filter((c) => /montarCopiaDeNegocio\s*\(/.test(readFileSync(c, 'utf8')))
      .map(relativo)
      .filter((r) => !podem.has(r));
    expect(infratores).toEqual([]);
  });
});
