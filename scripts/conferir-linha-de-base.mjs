/**
 * O robô de conferência: roda os três comandos do `CLAUDE.md` §9 e recusa quando o número piora.
 *
 * Uso: `node scripts/conferir-linha-de-base.mjs`
 * Roda no GitHub Actions a cada envio para o `main` (.github/workflows/conferencia.yml), e
 * funciona igual na sua máquina.
 *
 * 🔴 POR QUE ISTO EXISTE (item 45 da dívida técnica). `git push` no `main` publica para cliente
 * pagante em minutos. Até 26/08/2026 havia duas travas entre o commit e o cliente; a segunda
 * sumiu quando o repositório voltou a ser público. Desde então a rede de proteção inteira era
 * alguém LEMBRAR de rodar `npm run test`, `tsc` e `lint` antes de publicar.
 *
 * A regra comparada aqui está em `comparar-linha-de-base.mjs`, com 8 testes — inclusive o caso
 * de a linha de base vir incompleta, que é como um robô assim morre (recusa tudo, alguém
 * desliga).
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  compararComALinhaDeBase,
  contarErrosDeTipo,
  contarProblemasDeLint,
  contarTestesQuePassaram,
} from './comparar-linha-de-base.mjs';

const CAMINHO_DA_BASE = '.github/linha-de-base.json';

/** Roda e devolve a saída, mesmo quando o comando termina com erro (é o caso esperado). */
function rodar(comando) {
  try {
    return { saida: execSync(comando, { encoding: 'utf8', stdio: 'pipe' }), deuCerto: true };
  } catch (e) {
    return { saida: `${e.stdout ?? ''}${e.stderr ?? ''}`, deuCerto: false };
  }
}

function titulo(t) {
  console.log(`\n─── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);
}

titulo('Testes');
const testes = rodar('npm run test');
console.log(testes.saida.split('\n').slice(-12).join('\n'));
const quantosTestes = contarTestesQuePassaram(testes.saida);
if (!testes.deuCerto) {
  console.error(
    '\n❌ A bateria de testes NÃO passou. Isto não é questão de número: teste vermelho para aqui.',
  );
  process.exit(1);
}

titulo('Tipos');
const tipos = rodar('npx tsc --noEmit -p tsconfig.app.json');
const quantosTipos = contarErrosDeTipo(tipos.saida);
console.log(`erros de tipo: ${quantosTipos}`);

titulo('Lint');
const lint = rodar('npm run lint');
const quantosLint = contarProblemasDeLint(lint.saida);
console.log(`problemas de lint: ${quantosLint}`);

let base;
try {
  base = JSON.parse(readFileSync(CAMINHO_DA_BASE, 'utf8'));
} catch (e) {
  console.error(`\n❌ Não consegui ler ${CAMINHO_DA_BASE}: ${e.message}`);
  process.exit(1);
}

const agora = { tsc: quantosTipos, lint: quantosLint, testes: quantosTestes };
const { ok, problemas, avisos } = compararComALinhaDeBase(base, agora);

titulo('Comparação com a linha de base');
console.log(`linha de base: ${JSON.stringify(base)}`);
console.log(`esta execução: ${JSON.stringify(agora)}`);

for (const aviso of avisos) console.log(`\n⚠️  ${aviso}`);

if (!ok) {
  console.error('\n❌ RECUSADO — o número piorou:\n');
  for (const p of problemas) console.error(`   • ${p.mensagem}`);
  console.error(
    `\nConserte o que entrou neste envio. Se a piora for proposital e combinada, ajuste ${CAMINHO_DA_BASE} no mesmo commit, dizendo por quê na mensagem.`,
  );
  process.exit(1);
}

console.log('\n✅ Nada piorou.');
