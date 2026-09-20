#!/usr/bin/env node
// Sincroniza as skills de IA entre as duas pastas que o repositório versiona.
//
// Por quê: nenhuma ferramenta de IA lê as duas pastas. O Claude Code lê só
// `.claude/skills`; o Codex lê só `.agents/skills`; Cursor, Copilot e OpenCode
// leem as duas. Para todas encontrarem as skills, guardamos DUAS cópias iguais.
//
// A fonte é `.claude/skills`. Este script recria `.agents/skills` a partir dela.
// Fluxo ao mudar uma skill: edite em `.claude/skills`, rode `npm run skills:sincronizar`
// e commite as duas pastas. O teste `src/test/skills-nas-duas-pastas.test.ts` falha
// se elas divergirem.
//
// Cópia de verdade, nunca junção nem link simbólico: junção do Windows já apagou o
// node_modules real aqui (ver a memória worktree-com-juncao-apaga-node-modules).

import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raizDoRepo = join(dirname(fileURLToPath(import.meta.url)), "..");
const fonte = join(raizDoRepo, ".claude", "skills");
const espelho = join(raizDoRepo, ".agents", "skills");

if (!existsSync(fonte)) {
  console.error(`Fonte não encontrada: ${fonte}`);
  process.exit(1);
}

rmSync(espelho, { recursive: true, force: true });
mkdirSync(dirname(espelho), { recursive: true });
cpSync(fonte, espelho, { recursive: true });

console.log(`Skills sincronizadas: .claude/skills → .agents/skills`);
