/**
 * Conta quanto falta na dívida técnica, lendo a tabela "Resumo" de `docs/divida-tecnica.md`.
 *
 * Uso: `node scripts/contar-divida.mjs`
 *
 * 🔴 POR QUE ISTO EXISTE. O documento tem 75 itens e o dono do produto perguntou, com razão,
 * "onde vejo quanto falta?". A resposta não podia ser "pergunte a mim": o placar no topo do
 * documento é mantido à mão e envelhece, e a contagem na mão erra — ao contar pela primeira vez
 * eu li o `⏳` na coluna errada e inflei o número de críticos.
 *
 * A VERDADE é a coluna **Gravidade**: `✅` significa fechado. A coluna "Bloqueia?" é texto
 * livre e NÃO serve para contar — ela tem ✅ e ⏳ falando de outras coisas (por exemplo, o item
 * 3 diz "✅ código corrigido · ⚠️ o dado gravado continua errado", que é um item ABERTO).
 */

import { readFileSync } from 'node:fs';

const CAMINHO = 'docs/divida-tecnica.md';
const GRAVIDADES = ['Crítica', 'Alta', 'Média', 'Baixa', 'Produto'];

// 🔴 Conta SÓ a tabela "Resumo". O placar no topo também tem linhas que começam com `| 16 |`,
// e na primeira versão deste script elas entraram na conta: 79 itens em vez de 75. Uma tabela
// que fala sobre a lista não pode ser contada como parte da lista.
const texto = readFileSync(CAMINHO, 'utf8');
const inicio = texto.indexOf('\n## Resumo');
if (inicio < 0) {
  console.error(`Não achei a seção "## Resumo" em ${CAMINHO}.`);
  process.exit(1);
}
const linhas = texto
  .slice(inicio)
  .split('\n')
  .filter((l) => /^\| \d+ \|/.test(l));

const itens = linhas.map((l) => {
  const celulas = l.split('|').map((c) => c.trim());
  const numero = celulas[1];
  const nome = celulas[2].replace(/\]\([^)]*\)/, ']').replace(/^\[|\]$/g, '');
  const gravidade = celulas[3].replace(/\*/g, '');
  const resolvido = gravidade.includes('✅');
  const nivel = GRAVIDADES.find((g) => gravidade.toLowerCase().includes(g.toLowerCase())) ?? 'Outra';
  return { numero, nome, nivel, resolvido, bloqueia: celulas[4] ?? '' };
});

const abertos = itens.filter((i) => !i.resolvido);
const porNivel = {};
for (const i of abertos) porNivel[i.nivel] = (porNivel[i.nivel] ?? 0) + 1;

console.log(`\nDÍVIDA TÉCNICA — ${CAMINHO}\n`);
console.log(`  itens no inventário ... ${itens.length}`);
console.log(`  ✅ resolvidos ......... ${itens.length - abertos.length}`);
console.log(`  abertos ............... ${abertos.length}\n`);

console.log('  abertos por gravidade:');
for (const g of [...GRAVIDADES, 'Outra']) {
  if (porNivel[g]) console.log(`    ${g.padEnd(8)} ${porNivel[g]}`);
}

const criticos = abertos.filter((i) => i.nivel === 'Crítica');
if (criticos.length) {
  console.log('\n  CRÍTICOS abertos:');
  for (const i of criticos) console.log(`    ${i.numero.padStart(3)}  ${i.nome}`);
}

const altos = abertos.filter((i) => i.nivel === 'Alta');
if (altos.length) {
  console.log('\n  ALTOS abertos:');
  for (const i of altos) console.log(`    ${i.numero.padStart(3)}  ${i.nome}`);
}

console.log(
  '\n  ⚠️ O placar no topo do documento é mantido à mão. Se estes números não baterem com ele,\n' +
    '     o placar está velho — atualize-o no mesmo commit em que marcar um item como resolvido.\n',
);
