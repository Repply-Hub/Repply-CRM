# Skills e regras de IA a nível de repositório — desenho

> Status: DESENHO APROVADO em 16/09/2026 (Lucas), com a ponte da pasta de cima.
> Autor da conversa: Opus 4.8. Sub-skill de execução obrigatória: `subagent-driven-development`
> **não** é obrigatória aqui — é tarefa de configuração e documentação, ver §9.

## 1. O que se quer

Trazer para **dentro do repositório** (o que sobe para o GitHub) as skills que a equipe já
usa de fato — **Superpowers** (obra/superpowers, MIT) e **Humanizer** (blader/humanizer, MIT) —
e escrever as **regras de quando usá-las**, de um jeito que valha para **qualquer** IA e para
**qualquer pessoa** que clone o projeto, mesmo sem ter as skills instaladas na máquina.

Pedido do Lucas em 16/09/2026. Hoje o Superpowers está instalado só na máquina do Lucas
(duas versões: 6.0.3 e 6.1.1), como plugin de usuário — nada disso está no repositório, então
quem clona não recebe. A versão atual do Superpowers é a **6.3.0**.

## 2. O que existe hoje (medido em 16/09 — não re-descobrir)

- **O fluxo Superpowers já é o jeito de trabalhar daqui**: 14 desenhos em
  `docs/superpowers/specs/` e 29 planos em `docs/superpowers/plans/`, execução registrada em
  `.superpowers/sdd/` (pasta ignorada pelo git). O `CLAUDE.md` §3 já tem uma tabela "Skills
  conforme o pedido".
- **Nenhum arquivo de skill está versionado.** Busca por `AGENTS.md`, `GEMINI.md`,
  `.cursor`, `.github/copilot-instructions.md`: nada existe no repositório. O único guia de IA
  é o `CLAUDE.md`.
- **`.claude/settings.json` e `.claude/settings.local.json` são ignorados pelo git** (ver
  `.gitignore`) — a casa escolheu não versionar configuração do Claude. Logo, **um gancho de
  início de sessão em `.claude/settings.json` não pode ser versionado** sem mexer no
  `.gitignore`. `.claude/skills/…` e `.agents/skills/…` **são** versionáveis (conferido).
- **A sessão do Lucas abre na pasta de cima** (`Repply CRM/`, fora do git), que contém
  `repositorio/`. Conferido na documentação oficial do Claude Code: quando a sessão abre na
  pasta de cima, o `repositorio/CLAUDE.md` e as skills de `repositorio/.claude/skills/` **só
  entram no contexto quando a IA lê o primeiro arquivo dentro de `repositorio/`** — não no
  início. E o `.claude/settings.json` do repositório **nunca** vale para uma sessão aberta na
  pasta de cima ("não é herdado de diretórios acima"). Ver a memória
  `sessao-na-pasta-de-cima-nao-carrega-o-repositorio`.
- **Nenhuma pasta é lida por todas as IAs.** O Claude lê só `.claude/skills`; o Codex lê só
  `.agents/skills`; Cursor, Copilot e OpenCode leem as duas (mais a `.claude` por
  compatibilidade). Codex tem teto de **32 KiB** para o `AGENTS.md` (`project_doc_max_bytes`).
- **Esta pasta local está divergida do publicado**: `origin/main` e o `main` local têm 235 e
  197 commits diferentes (trabalho de outras sessões, como Duplicar negócio). A instalação é
  construída numa **cópia limpa a partir de `origin/main`** e publica **só os commits desta
  conversa**. Ver `dois-chats-mesma-pasta-git`.

## 3. Decisões do dono do produto (16/09/2026 — não reabrir)

1. **Suportar qualquer IA** (Codex, Gemini, Cursor, Copilot, Windsurf), não só o Claude → as
   skills ficam em **duas pastas** (`.claude/skills/` e `.agents/skills/`), com **uma trava que
   falha se as duas divergirem**.
2. **Regra de publicação para qualquer IA = autonomia com cuidados** (a regra que as sessões
   do Claude seguem desde 27/08): a IA salva e publica sozinha **só o que ela mesma escreveu**,
   depois da verificação completa, sempre relatando. Continuam pedindo conversa: dado de
   produção, exclusão, mudança no banco, e decisão sobre o que o cliente vê ou paga.
3. **Ponytail: não instalar.** Só as duas ideias boas dele viram regra escrita (procurar o que
   já existe antes de escrever; num conserto, achar todos os chamadores e consertar no ponto
   comum). Motivos do descarte em §8.
4. **A ponte da pasta de cima** é montada nesta máquina (fora do git), para as regras
   carregarem assim que a conversa abre.

## 4. Onde cada coisa fica (dentro de `repositorio/`, versionado)

```
repositorio/
├── AGENTS.md                     ← NOVO. O arquivo curto que quase toda IA lê ao abrir.
├── CLAUDE.md                     ← só ACRESCENTA `@AGENTS.md` no topo e ajusta §13; resto intacto.
├── GEMINI.md                     ← NOVO. Só `@AGENTS.md`.
├── .claude/skills/               ← NOVO. As 14 skills (o Claude lê aqui).
│   ├── README.md                 ←   origem, versão, licença, "não editar à mão só uma cópia".
│   ├── brainstorming/ …          ←   13 skills do Superpowers 6.3.0
│   └── humanizer/SKILL.md
├── .agents/skills/               ← NOVO. Cópia idêntica (Codex e os outros leem aqui).
│   └── (espelho de .claude/skills/)
├── scripts/sincronizar-skills.mjs ← NOVO. Copia .claude/skills → .agents/skills.
└── src/test/skills-nas-duas-pastas.test.ts ← NOVO. Falha se as duas pastas diferirem.
```

**As 14 skills:** 13 do Superpowers — `brainstorming`, `dispatching-parallel-agents`,
`executing-plans`, `finishing-a-development-branch`, `receiving-code-review`,
`requesting-code-review`, `subagent-driven-development`, `systematic-debugging`,
`test-driven-development`, `using-git-worktrees`, `verification-before-completion`,
`writing-plans`, `writing-skills` — mais `humanizer`. A 14ª do Superpowers, `using-superpowers`,
**não** é copiada como skill: o conteúdo dela (o "aviso que liga as skills") vive no `AGENTS.md`,
para não carregar duas vezes e não trazer referências a mecanismo de plugin.

## 5. O `AGENTS.md` — conteúdo (curto, < 20 KB para caber no teto do Codex)

1. **Aviso que liga as skills** (adaptado do `using-superpowers`): antes de qualquer tarefa,
   ver se uma skill se aplica e usá-la; as skills estão em `.claude/skills/` e `.agents/skills/`.
   As de processo (brainstorming, systematic-debugging) vêm antes das de implementação.
2. **Tabela "quando usar cada skill"** (PT-BR), ampliando a do `CLAUDE.md` §3, agora nomeando
   `subagent-driven-development` (a que os planos de fato exigem) e o `humanizer`.
3. **Humanizer: só em texto que o cliente lê** (apresentação comercial, guia de implantação,
   modelos de WhatsApp/e-mail). Nunca em mensagem de commit nem em documento técnico interno
   (`CLAUDE.md`/`SPEC.md`/`docs/`), que ficam secos. Ressalva: o Humanizer foi feito para
   inglês — as regras de estrutura servem para o português, a lista de palavras dele não.
4. **As duas ideias do Ponytail** como regra geral.
5. **Regra de publicação** (autonomia com cuidados), valendo para qualquer IA, apontando os
   cuidados de git do `CLAUDE.md` §13 (fetch antes, nunca `add -A`, publicar só os próprios
   commits) e §16 (`git push` publica).
6. **Adaptações da casa que vencem as skills**: onde `using-git-worktrees` e
   `finishing-a-development-branch` descreverem fluxo de branch/PR/worktree, **vale o fluxo
   daqui** (direto no `main`, sem PR; cópia de publicação irmã; cherry-pick só dos próprios
   commits). É o princípio que as próprias skills declaram: instrução do projeto vence skill.
7. **"O manual completo é o `CLAUDE.md` — leia antes de escrever código"**, com as ~10
   armadilhas mais caras copiadas ali (data que muda de dia, dinheiro em campo de número,
   zero linhas não é sucesso, `prazo_resposta` é data de fechamento, tela que gira é tempo
   limite, medir como usuário logado, etc.), para a IA que não abre o `CLAUDE.md` inteiro.
8. **Origem e licença** das skills (MIT, obra/superpowers 6.3.0 e blader/humanizer).

O `CLAUDE.md` ganha só `@AGENTS.md` no topo (o Claude lê `CLAUDE.md`, não `AGENTS.md`) e o §13
passa a apontar a regra de autonomia com cuidados — **sem** perder nenhum dos cuidados de git
que ele já traz. O `GEMINI.md` é só `@AGENTS.md` (o Gemini aceita `@import`).

## 6. A trava das duas pastas

`scripts/sincronizar-skills.mjs` copia `.claude/skills/` sobre `.agents/skills/` (a `.claude` é
a fonte). `src/test/skills-nas-duas-pastas.test.ts` compara as duas árvores arquivo a arquivo e
**falha** se qualquer arquivo diferir ou faltar — junto dos outros guardas estruturais de
`src/test/`. Quem atualizar uma skill edita em `.claude/skills/`, roda o script e commita as duas.
Cópia de verdade, **não** junção nem link simbólico (junção já apagou o `node_modules` aqui —
ver `worktree-com-juncao-apaga-node-modules`).

## 7. A ponte da pasta de cima (nesta máquina, fora do git)

- `Repply CRM/CLAUDE.md` (novo, fora do repositório, por máquina): importa
  `@repositorio/AGENTS.md`, para uma sessão aberta na pasta de cima já receber as regras no
  início.
- `Repply CRM/.claude/launch.json`: trocar `--prefix mdrepresentacoes` por `repositorio` (o
  lançador do servidor de teste parou com a renomeação da pasta).

Quem clona o repositório numa pasta só abre dentro dele e recebe tudo nativamente — a ponte é
só para o hábito desta máquina de abrir na pasta de cima. Uma nota em `docs/` registra como
refazer a ponte noutra máquina.

## 8. Por que o Ponytail fica de fora (registro da análise)

Ele empurra o campo nativo do navegador (o campo de número nativo gravou valores mil vezes
maiores aqui, `CLAUDE.md` §7.10); corta "configuração que ninguém usa" (num SaaS multi-empresa,
a opção que a MD não usa é a que o próximo cliente precisa, `SPEC.md` §4); encurta a explicação
e entrega a versão simples antes de perguntar (contra o pedido de 16/09 de olhar todas as
perspectivas e contra "pergunte antes de mudar o que o cliente vê"); pede um teste sem estrutura
(o projeto usa teste-antes-do-código); fica ligado em toda conversa e subagente, consumindo o
limite de uso; e trata "construir demais", que não é o problema desta base — os erros caros vieram
de ler de menos e de falhas silenciosas. As duas ideias boas dele entram como regra escrita.

## 9. Verificação e publicação

Construído numa cópia limpa a partir de `origin/main` (worktree isolado no scratchpad, com o
`node_modules` da principal ligado só na hora de rodar teste, e desligado antes de remover — ver
`worktree-com-juncao-apaga-node-modules`). Antes de publicar: o teste novo passa; a bateria
completa não regride; `tsc -p tsconfig.app.json` não ganha erro novo no arquivo novo; `build`
compila. Publica **só os commits desta conversa** por cherry-pick sobre o `origin/main` do
momento (`escrita-em-producao-passa-pela-mao-do-lucas`). É mudança de documentação e
configuração — **não toca banco de produção, não toca dado de cliente**.

Por ser tarefa de configuração/documentação bem delimitada, não passa por
`subagent-driven-development`: os arquivos são escritos e revisados direto, com a mesma
verificação acima.
