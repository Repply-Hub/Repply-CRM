# AGENTS.md — regras para qualquer IA no Repply CRM

Este arquivo vale para **qualquer** ferramenta de IA que trabalhe neste repositório
(Claude Code, Codex, Gemini, Cursor, Copilot, Windsurf, OpenCode…). O `CLAUDE.md` e o
`GEMINI.md` puxam este arquivo. **Responda sempre em português do Brasil**, seja qual for o
idioma da skill ou do código.

> 🔴 **O manual completo é o `CLAUDE.md`. Leia-o antes de escrever qualquer código.**
> Ele traz o porquê de cada decisão estranha e as armadilhas que já custaram dinheiro. Este
> arquivo é o resumo que liga as skills e aponta as regras; o `CLAUDE.md` é o detalhe.

---

## 1. Skills: use antes de agir

Este projeto trabalha com **skills** — conjuntos de instruções para tarefas específicas.
Elas vivem em `.claude/skills/` e `.agents/skills/` (duas cópias iguais, porque cada
ferramenta lê uma pasta diferente).

**Antes de qualquer tarefa — inclusive antes de perguntar, explorar o código ou abrir
arquivos —, verifique se uma skill se aplica e, se aplicar, use-a.** As skills de **processo**
(brainstorming, systematic-debugging) vêm antes das de implementação: elas definem o jeito, as
outras executam. Se houver 1% de chance de uma skill servir, invoque-a; se não servir, você
não é obrigado a seguir.

Pensamentos como "isso é simples demais", "primeiro deixa eu olhar o código", "eu lembro dessa
skill" são justamente o sinal de parar e invocar a skill.

### Quando usar cada skill

| O pedido é… | Skill |
|---|---|
| Pensar antes de fazer, discutir uma ideia, **construir algo novo** | `brainstorming` (sempre primeiro), depois `writing-plans` |
| Executar um plano já escrito, com tarefas independentes | `subagent-driven-development` (é a que os planos daqui exigem) ou `executing-plans` |
| "Isso não funciona", bug, comportamento estranho | `systematic-debugging` (antes de propor conserto) |
| Escrever teste, começar um conserto ou funcionalidade | `test-driven-development` (teste antes do código) |
| Revisar o que foi feito | `requesting-code-review`; ao receber revisão, `receiving-code-review` |
| Confirmar que está pronto, antes de dizer "feito" ou publicar | `verification-before-completion` |
| Trabalho isolado do resto, várias frentes independentes | `dispatching-parallel-agents`, `using-git-worktrees` |
| Suavizar texto que soa "de robô" **num texto que o cliente lê** | `humanizer` — ver a regra abaixo |
| Criar ou editar uma skill | `writing-skills` |

Os desenhos vão para `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md` e os planos para
`docs/superpowers/plans/`, ambos commitados. O rascunho da execução fica em `.superpowers/sdd/`
(ignorado pelo git). É o padrão que este projeto já usa em dezenas de entregas.

### Humanizer: só em texto que o cliente lê

Use o `humanizer` em **apresentação comercial, guia de implantação, modelos de WhatsApp e
e-mail, texto de tela que o cliente vê**. **Nunca** em mensagem de commit nem em documento
técnico interno (`CLAUDE.md`, `SPEC.md`, `docs/`), que devem ficar secos e diretos. Ressalva:
o Humanizer foi feito para inglês — as regras de **estrutura** (frase de efeito, trio forçado,
travessão em excesso, significado inflado) servem para o português; a **lista de palavras**
dele, não.

---

## 2. Antes de escrever código (as duas regras de "menos é mais")

1. **Procure o que já existe antes de escrever.** Este projeto tem peça pronta para quase tudo
   — dinheiro (`CampoMoeda`), modal (`ConteudoDialogo`), data ("hoje" com `hojeLocal`), erro do
   banco (`mensagemDeErro`), busca por texto (o padrão de `wa_buscar_mensagens`). Reimplementar
   o que está a alguns arquivos de distância é a fonte mais comum de bug. Leia o `CLAUDE.md` e
   procure no `src/` antes de criar.
2. **Num conserto, ache TODOS os que usam a função e conserte no ponto comum.** Um relatório
   nomeia um sintoma; antes de editar, procure quem chama a função que você vai tocar e conserte
   uma vez, onde todos passam. Consertar num arquivo que a tela não usa não conserta nada — foi o
   que fez o bug de datas voltar depois de "resolvido" (`CLAUDE.md` §7.14).

Nenhuma dessas duas é desculpa para ler de menos: elas encurtam a **solução**, nunca a leitura.
Entenda o problema inteiro — todos os caminhos que um usuário comum tomaria — antes de escolher
o conserto. Diferente de um `.delete()` que some sem erro, um conserto pequeno no lugar errado é
um segundo bug disfarçado de eficiência.

---

## 3. Analisar por todas as perspectivas (prática fixa)

Toda mudança passa por este crivo, e a resposta diz o que muda para quem:

- **Quem usa:** dono, gestor, vendedor interno, vendedor externo no celular, administrativo,
  super-admin da Repply — e a pessoa **sem** a permissão, sem vínculo de WhatsApp, recém-convidada.
- **Qual empresa:** a MD, a JHS e as outras assinantes, e a de demonstração. Multi-empresa: o que
  serve a uma não pode quebrar ou impor escolha às outras (`SPEC.md` §4).
- **Em que estado:** primeira vez/lista vazia, dado antigo importado, volume grande (12 mil
  negócios), empresa bloqueada por cobrança, sessão expirada, duas abas, aba aberta durante uma
  publicação.
- **Por qual caminho:** tela normal, link direto na barra, ação em massa, importação, exportação,
  automação, e-mail, webhook.
- **Com que efeito lateral:** painéis que leem o mesmo campo, histórico, notificação, desempenho
  sob a regra de segurança, e o que acontece se falhar no meio.
- **O avesso:** quem usa diferente de quem pediu — o que piora para essa pessoa?

Explique a **consequência prática antes do mecanismo**, sem jargão (`CLAUDE.md` §3). Quando uma
perspectiva levantar decisão de produto, **pergunte** em vez de escolher sozinho.

🔴 **Funcionalidade nova cobre TODAS as superfícies que ela toca — não só a que o pedido citou.**
Ao acrescentar algo, liste ANTES de codar onde aquilo aparece de verdade: cadastro, edição,
ficha/detalhe (a folha lateral), card do quadro, linha da lista, exportação, notificação. O pedido
nomeia um ponto; a funcionalidade vive em vários. Percorra as superfícies irmãs da que você mexeu e
confirme que a funcionalidade chegou a cada uma antes de dizer "feito".

> Foi assim que o campo de anexo de tarefa entrou na criação e na edição mas ficou de fora da ficha
> lateral (o detalhe) — uma superfície padrão que passou batido e o dono teve de apontar. "Adicionar
> anexo à tarefa" não é uma tela, são todas as telas onde a tarefa se mostra.

---

## 4. Publicar: autonomia com cuidados

Regra desde 27/08/2026, valendo para **qualquer IA**. `git push` no `main` **publica** o site
para cliente pagante em minutos (`CLAUDE.md` §16).

**Pode commitar e publicar sozinho** o que **você mesmo** escreveu, **depois** da verificação
completa (§5), sempre relatando o que subiu e com que evidência.

**Pare e converse antes** quando o próximo passo:

- escreve ou apaga **dado de produção**;
- **exclui** qualquer coisa (irreversível);
- muda o **banco** de produção (migration escrita não é migration aplicada — ver `CLAUDE.md` §6);
- é **decisão de produto** que muda o que o cliente vê ou paga (`CLAUDE.md` §11);
- descobriu **risco de segurança** novo.

Cuidados de git que **não** mudam (várias sessões dividem esta pasta — `CLAUDE.md` §13):

- `git fetch` antes de commitar e conferir se entrou commit de outra pessoa.
- **Nunca** `git add -A`; liste os arquivos um a um; confira `git status --short` num comando
  separado.
- **Publique só os seus commits.** Nunca toque, reordene, refaça ou publique commit de outra
  sessão. Se houver commit alheio no caminho, publique os seus por uma cópia separada
  (worktree a partir de `origin/main` + cherry-pick dos seus), nunca `git push` do ramo inteiro.
- Nunca restaure arquivo do projeto de backup privado — use `git checkout HEAD -- <arquivo>`.

---

## 5. Verificar antes de dizer "feito" (evidência antes de afirmação)

Rode e confira a saída **antes** de publicar, não depois (`CLAUDE.md` §9):

- `npm run test` — a bateria tem que passar; o número de testes não pode cair.
- `npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`**; sem ele não confere nada e mente
  sucesso. O número de erros herdados não pode subir.
- `npm run build` — tem que compilar.
- `npm run lint` — não passa limpo (estado herdado); o critério é **o número não subir**.

Mexeu em permissão/RLS → teste como vendedor comum, não só gestor. Mexeu em consulta pesada →
meça antes e depois. Mexeu no banco → confirme que a migration foi mesmo aplicada.

🔴 **Depois de aplicar funcionalidade nova, confirme os três "não" — prática diária, sempre:**

1. **Não quebrou o que já funcionava.** Rode a suíte **inteira**, não só o arquivo que você tocou:
   um teste de outra parte que passou a falhar é a funcionalidade nova mexendo onde não devia. Foi
   assim que o campo de multi-arquivo derrubou um teste do anexo de negócio — a suíte pegou, o
   arquivo isolado não pegaria.
2. **Não quebra em produção nem altera dado de cliente.** Mudança de comportamento que o cliente vê,
   ou de banco que toque linha de cliente, **para e conversa antes** (§4) — não se descobre depois de
   publicar. Na dúvida sobre o alcance, meça (contagem, não olho) e mostre o número.
3. **É ação supervisionada.** Vale o §4: quem publica é você, mas só com o "pode" do dono e a
   evidência dos itens 1 e 2 na mão. Rode a verificação **antes** de pedir autorização, não depois —
   `git push` publica para cliente pagante no mesmo gesto (`CLAUDE.md` §16).

---

## 6. Adaptações da casa que vencem as skills

As skills são ótimas, mas foram escritas para um fluxo genérico. Onde divergirem do fluxo deste
projeto, **vale o projeto** — é o próprio princípio das skills (instrução do projeto vence a
skill):

- **`finishing-a-development-branch`** oferece abrir Pull Request. **Aqui não há PR**: o trabalho
  vai direto no `main` (o PR foi testado uma vez em 19/08 e revertido no mesmo dia). Publicar é
  `git push` dos seus commits (§4), a partir de uma cópia limpa quando houver commit alheio junto.
- **`using-git-worktrees`** manda criar worktree em `.worktrees/` dentro do repositório. **Aqui a
  cópia de publicação é irmã** do repositório (fora da árvore dele), reaproveitada entre entregas.
- **`subagent-driven-development`** diz "não pare para checar com seu parceiro humano entre
  tarefas". **Aqui vale o §4**: publicar dado/exclusão/banco/decisão de produto para e conversa.

Ponytail **não** está instalado, por decisão de 16/09/2026. As duas ideias boas dele estão no §2.

---

## 7. As armadilhas mais caras (o resto está no `CLAUDE.md`)

| Armadilha | Regra | Onde |
|---|---|---|
| `prazo_resposta` **é a data de fechamento**, não prazo de nada | nunca use como prazo | §4.4 |
| `.delete()`/`.update()` barrado pela regra de acesso volta **sem erro** | peça `{count:'exact'}`, trate `count===0` como recusa (nunca `!count`) | §4.6 |
| Campo de dinheiro | nunca `type="number"` nem `parseFloat`; use `CampoMoeda`/`parseMoedaBRL` | §7.10 |
| Data que veio do calendário | não converta fuso (recua um dia); "hoje" é `hojeLocal()`, não `toISOString().slice(0,10)` | §7.12 |
| Data do banco desenhada na tela | `new Date(<coluna de data>)` é meia-noite em UTC e cai na véspera; use `ancoraDoDia()` | §7.12 |
| `usuarios.id` ≠ `usuarios.user_id` | confira a chave estrangeira no banco antes de gravar | §4.5 |
| Erro do Supabase não é `Error` | use `mensagemDeErro`/`mensagemDeErroDaFunction` | §4.6 |
| Tela girando para sempre | é tempo limite de 8s, não lentidão; meça como usuário logado, não como admin | §7.15 |
| Gráfico/painel novo | pergunte ao dono: conta por criação ou por fechamento? | §5 |
| Tabela nova | nasce por migration com RLS e política no mesmo arquivo; nunca pelo painel do Supabase | §6.2 |
| `XLSX.read` | só dentro de `src/lib/import/` (há teste que barra o resto) | §7.14 |
| Modal com formulário | `<ConteudoDialogo>`, não `<DialogContent>` cru (prende o usuário) | §7.11 |
| Dado real de cliente/equipe | nunca em teste, plano, comentário — o repositório é público | §6.9 |

---

## Origem e licença das skills

Skills de [obra/superpowers](https://github.com/obra/superpowers) 6.3.0 (MIT) e
[blader/humanizer](https://github.com/blader/humanizer) (MIT). Como estão organizadas e como
mantê-las sincronizadas: `.claude/skills/README.md`. O desenho de tudo isto:
`docs/superpowers/specs/2026-09-16-skills-e-regras-no-repositorio-design.md`.
