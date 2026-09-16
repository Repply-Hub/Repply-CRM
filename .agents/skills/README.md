# Skills de IA deste repositório

Estas skills são lidas pelas ferramentas de IA que trabalham no projeto. Elas existem em
**duas pastas iguais** — `.claude/skills/` (esta) e `.agents/skills/` — porque nenhuma
ferramenta lê as duas: o Claude Code lê só `.claude/skills`, o Codex lê só `.agents/skills`,
e Cursor, Copilot e OpenCode leem as duas.

**A fonte é `.claude/skills`.** Para mudar uma skill: edite aqui, rode `npm run skills:sincronizar`
(recria `.agents/skills` a partir daqui) e commite as duas pastas. O teste
`src/test/skills-nas-duas-pastas.test.ts` falha se as duas divergirem.

As regras de **quando** usar cada skill estão no `AGENTS.md` da raiz (que o `CLAUDE.md` e o
`GEMINI.md` puxam). O desenho de por que tudo isto existe está em
`docs/superpowers/specs/2026-09-16-skills-e-regras-no-repositorio-design.md`.

## Origem e licença

| Skill(s) | Origem | Licença |
|---|---|---|
| `brainstorming`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, `writing-plans`, `writing-skills` | [obra/superpowers](https://github.com/obra/superpowers) 6.3.0 | MIT |
| `humanizer` | [blader/humanizer](https://github.com/blader/humanizer) | MIT |

A 14ª skill do Superpowers, `using-superpowers`, não foi trazida como pasta: o conteúdo dela
(o aviso que liga as skills) vive no `AGENTS.md`.

Duas skills do Superpowers descrevem um fluxo de git/Pull Request/worktree diferente do desta
casa. Onde `using-git-worktrees` e `finishing-a-development-branch` divergirem do fluxo daqui
(direto no `main`, sem PR; cópia de publicação irmã; publicar só os próprios commits), **vale a
regra da casa** — como o `AGENTS.md` e o `CLAUDE.md` §13/§16 mandam. É o próprio princípio das
skills: instrução do projeto vence a skill.
