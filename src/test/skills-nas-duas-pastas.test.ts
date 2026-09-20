// Guarda estrutural: as skills de IA vivem em DUAS pastas iguais.
//
// Nenhuma ferramenta de IA lê as duas: o Claude Code lê só `.claude/skills`,
// o Codex lê só `.agents/skills`, e Cursor/Copilot/OpenCode leem as duas. Por
// isso o repositório guarda duas cópias idênticas. Este teste falha se alguém
// mexer numa e esquecer a outra — o conserto é rodar `npm run skills:sincronizar`
// e commitar as duas pastas. Ver docs/superpowers/specs/2026-09-16-skills-e-regras-no-repositorio-design.md.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const raiz = process.cwd();
const pastaClaude = join(raiz, ".claude", "skills");
const pastaAgents = join(raiz, ".agents", "skills");

function listarArquivos(raizBase: string): string[] {
  // Caminho relativo SEMPRE a partir da raiz, mesmo dentro de subpastas —
  // senão um arquivo aninhado perde o prefixo da pasta e não é encontrado depois.
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) andar(caminho);
      else achados.push(relative(raizBase, caminho).split("\\").join("/"));
    }
  };
  andar(raizBase);
  return achados.sort();
}

describe("as skills estão iguais nas duas pastas", () => {
  const daClaude = listarArquivos(pastaClaude);
  const dosAgents = listarArquivos(pastaAgents);

  it("as duas pastas têm exatamente os mesmos arquivos", () => {
    // Se falhar: uma skill foi criada/removida em só uma das pastas.
    // Rode `npm run skills:sincronizar` para refazer .agents/skills a partir de .claude/skills.
    expect(dosAgents).toEqual(daClaude);
  });

  // Folga de 20s (3º argumento do it): este caso lê o conteúdo de dezenas de
  // arquivos de skill. Sob carga (bateria inteira + tsc em paralelo) a leitura
  // passa dos 5s padrão do vitest, e o guarda derrubava a bateria por flake de
  // I/O, não por diferença real de conteúdo.
  it("cada arquivo tem o mesmo conteúdo nas duas pastas", () => {
    // Só confere os que existem nas duas (o teste acima cobre os que faltam),
    // para a mensagem de erro apontar a DIFERENÇA de conteúdo, não a ausência.
    const comuns = daClaude.filter((a) => dosAgents.includes(a));
    const diferentes = comuns.filter(
      (a) =>
        readFileSync(join(pastaClaude, a)).toString("utf8") !==
        readFileSync(join(pastaAgents, a)).toString("utf8"),
    );
    // Se falhar: editaram uma skill numa pasta e não na outra.
    // Rode `npm run skills:sincronizar` e commite as duas.
    expect(diferentes).toEqual([]);
  }, 20000);

  it("há pelo menos uma skill em cada pasta (a trava não está medindo o vazio)", () => {
    expect(daClaude.length).toBeGreaterThan(0);
    expect(dosAgents.length).toBeGreaterThan(0);
  });
});
