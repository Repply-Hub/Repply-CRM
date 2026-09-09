# A tela "Hoje" ganha a tabela do time, a voz e o painel que não sai do lugar

> Desenho validado com o dono do produto em 08–09/09/2026. Continua o trabalho publicado em
> 08/09/2026 (`docs/superpowers/specs/2026-09-05-hoje-por-papel-design.md`).

## 1. Por que este trabalho existe

A Etapa 3 entregou o gesto que faltava no CRM — **marcar o retorno de um negócio** —, que era a
única coisa que o "Dashboard de Oportunidades" da MD fazia e o CRM não. O que sobrou de
diferença é **forma**, não função:

- lá o gestor olha uma **tabela inteira** e age em qualquer linha; aqui ele olha uma fila de 7;
- lá a ação está em cada linha; aqui abrir o negócio **tira você da tela**.

E o dono do produto pediu duas coisas novas: uma **voz** para a tela e o e-mail, e uma **tarefa
automática** quando alguém adia um negócio.

### O que este trabalho NÃO faz

| | Por quê |
|---|---|
| Não cria uma segunda tela de Negócios | A visão Lista já existe, com colunas arrastáveis, ordenação, filtros, busca e paginação. Medido em 08/09/2026: a Érika (vendedora) enxerga ali os **12.019** negócios da MD, de 8 pessoas. Isso é o modelo normal de CRM — o funil é espaço compartilhado — e **não** é vazamento |
| Não copia o agrupamento por grupo de marca, as abas de mês nem a aba "Falta de Contato" do painel da MD | Já decidido e registrado na spec de 05/09/2026 §1 |
| Não cria o campo "motivo de perdido" | Continua registrado como trabalho futuro |
| Não mexe nos três cartões do topo do Radar | Eles mostram o total da **empresa** para qualquer pessoa. Medido: Érika e Fabiola recebem os mesmos números (145 sem próxima ação, R$ 7.402.422,24). Mudar o número que a tela mostra é decisão de produto, e fica em aberto (§7) |
| Não permite editar o negócio pelo painel novo | O painel é de **ver**. Editar continua sendo o formulário de sempre |

---

## 2. Decisões do dono do produto (08–09/09/2026 — não reabrir)

1. **A fila volta a ser sempre pessoal.** Para todo mundo, gestor ou não: só os próprios
   negócios.
2. **A chave `pauta_de_todos` muda de significado.** Deixa de ampliar a fila; passa a liberar a
   **tabela do time**, o gráfico por vendedor e o filtro de responsável.
3. **A tabela traz só o que pede atenção** — parado há X dias OU sem próxima ação. Hoje na MD
   são 145. A tela "Hoje" continua sendo a tela do que precisa de você.
4. **Cada linha da tabela ganha "Abrir negócio" e "Retomar depois"**, e a tabela pagina de 10 em
   10 por um "Ver mais".
5. **O painel do negócio abre sem sair da tela**, na pauta, na tabela e nas fichas de empresa e
   de contato.
6. **O "Retomar depois" cria uma tarefa**, por uma caixinha marcada por padrão que a pessoa pode
   desmarcar. Prazo no dia do retorno, descrição = o motivo, responsável = **o dono do
   negócio**.
7. **A fila esconde a linha do negócio quando já existe tarefa aberta para ele.** Uma linha só,
   com o motivo à vista.
8. **A voz muda com o que está acontecendo**, em vez de uma frase fixa.

---

## 3. O que a decisão 1 resolve de graça

A decisão de tornar a fila pessoal não é só estética. Ela fecha três coisas que estavam abertas:

**(a) A pendência do e-mail.** Publicado em 08/09/2026, o e-mail das 7h de um gestor podia trazer
negócios de colegas dentro de "N coisas esperam você" e "R$ X em jogo". Duas decisões de redação
estavam na mesa do dono do produto. Com a fila pessoal, o e-mail volta a ser pessoal e **as duas
decisões deixam de existir**.

**(b) O gestor perdendo os próprios negócios.** Achado da revisão da Tarefa 4: o teto de 7 é
disputado por valor entre os negócios de toda a equipe, então o negócio de R$ 8 mil do gestor
perde a vaga para o de R$ 2 milhões de um colega. Com a fila pessoal, a disputa acaba.

**(c) O aviso ao dono continua fazendo sentido** — na verdade passa a fazer *mais*, porque quem
adia negócio alheio agora faz isso pela tabela, deliberadamente, e não por tropeço numa fila que
misturava tudo.

### O que se perde, e é justo registrar

A **etiqueta com o nome do dono** nos itens da fila, construída em 08/09/2026, deixa de aparecer:
com a fila pessoal, `pauta_do_dia_de` nunca mais preenche `responsavel`. São ~20 linhas de tela.
A coluna do banco **fica** — é a mesma que a tabela do time usa, e é o que o e-mail lê quando um
dia voltar a haver item de outra pessoa.

---

## 4. As quatro entregas

Cada uma funciona sozinha e ganha o seu próprio plano de implementação.

### 4.A — Ver o negócio sem sair da tela

**O problema:** hoje "Abrir negócio" navega para `/app?negocio=<id>`. Você perde a fila, perde o
filtro, perde o lugar onde estava. Na ficha da empresa e do contato o clique na linha faz o mesmo.

**O desenho:** o bloco `viewOrderSheet` — hoje ~380 linhas dentro de `src/pages/Negocios.tsx`,
das linhas 2320 a 2702 — sai de lá e vira `src/components/pedidos/PainelDoNegocio.tsx`.

- **Interface:** `<PainelDoNegocio pedidoId={string | null} onClose={() => void} />`. Ele busca o
  negócio sozinho com `usePedidoPorId`, que já existe desde a Etapa 1 e já cobre os quatro
  estados (achado, carregando, erro, não encontrado).
- **Quem passa a desenhá-lo:** `Negocios.tsx` (comportamento idêntico ao de hoje), `Hoje.tsx` (a
  fila), `RadarDeRisco.tsx` (a tabela) e `PainelDeNegocios.tsx` (as fichas de empresa e contato,
  que o outro trabalho já unificou em 07/09/2026).
- **Endereço:** `?negocio=<id>` passa a valer em qualquer tela, não só em Negócios. Recarregar a
  página mantém o painel aberto e o link continua servindo para mandar a alguém.

**Por que vale além do pedido:** `Negocios.tsx` tem 3.732 linhas e é um dos dois arquivos que o
`CLAUDE.md` §14 marca como "difícil de mexer com segurança". Esta extração o deixa em ~3.350.

**Risco a tratar no plano:** o painel tem ações que gravam (tarefas, comentários, PDF). As
invalidações de cache precisam funcionar a partir de qualquer tela, não só de Negócios — a lista
de chaves de `invalidarPaineisDeNegocios` em `use-pedidos.ts` é o ponto de conferência.

---

### 4.B — A voz da tela e do e-mail

**O problema:** hoje a tela diz "Hoje" e o e-mail diz "7 coisas esperam você" · "R$ 482.900 em
jogo". É correto e é morno. O dono do produto pediu impacto — "o dinheiro está na mesa" foi a
frase que ele usou como referência.

**A tensão, registrada:** o `CLAUDE.md` §8 diz que o tom é *"sóbrio e técnico. Sem superlativo,
sem linguagem de varejo."* Uma frase fixa de impacto briga com isso — e, pior, chega **todo dia
útil**: o que impressiona na segunda-feira é papel de parede na terceira semana.

**A saída escolhida:** o texto responde ao dia. O impacto vem da concretude, não do adjetivo, e
nunca se repete porque os números mudam.

**A escada, em ordem de prioridade** (a primeira que casar, vence):

| # | Quando | O que diz |
|---|---|---|
| 1 | A fila está vazia | *Nada parado. Seu dia está seu.* |
| 2 | Só compromissos, nenhum negócio | *3 compromissos hoje* |
| 3 | Um negócio destoa dos outros | *Um negócio seu está há 40 dias sem mexer* — com valor e nome embaixo |
| 4 | Compromissos e negócios | *3 compromissos e 4 negócios hoje* |
| 5 | Só negócios, com valor | *R$ 482.900 parados em 7 negócios* |
| 6 | Só negócios, sem valor somado | *7 negócios parados* |

**A regra do degrau 3, e por que ela é relativa.** Medido em 09/09/2026: os 150 negócios abertos
da MD estão parados entre **0 e 7 dias**, média 6,4, e **nenhum** acima de 30 — resíduo da
migração do Bitrix, que carimbou todo mundo em 01/09/2026. Um limite fixo ("40 dias") nunca
dispararia hoje e, daqui a algumas semanas, dispararia para todo mundo ao mesmo tempo, que é
pior. Então o degrau 3 é **relativo à própria fila**: o primeiro colocado precisa estar parado
há pelo menos o **dobro** do segundo colocado, e acima do ajuste de dias da empresa
(`pauta_dias_parado`, 3 na MD).

Duas precisões, para não sobrar leitura dupla: "primeiro" e "segundo colocado" são **entre os
negócios**, ignorando compromissos, que não têm dias parados; e com **um** negócio só na fila não
há segundo colocado, então o degrau 3 não casa e a frase cai para o degrau 5.

**Onde a regra mora:** uma função pura em `src/lib/`, com testes, e a mesma decisão alimenta **o
título da tela e o e-mail** (assunto e manchete). Uma fonte só — senão a tela e o e-mail
divergem, que é como o projeto já se machucou antes (`CLAUDE.md` §7.14: o conserto no arquivo que
nenhuma tela chamava).

**Cuidado de implementação:** a edge function `pauta-resumo-diario` roda em Deno e **não importa
de `src/`**. A função pura precisa ser copiada para lá ou viver em lugar alcançável pelos dois; o
plano decide, e o teste tem que prender as duas cópias no mesmo contrato.

---

### 4.C — A fila vira pessoal, a tabela vira o time

**No banco:**

- `pauta_do_dia_de` deixa de chamar `ve_pauta_de_todos` na CTE `gente`. A fila é sempre
  `u.id = p_usuario_id`.
- A tabela precisa paginar, e o painel de agregados **não** deve ser recalculado a cada "Ver
  mais". Por isso a lista sai de dentro de `dashboard_negocios_risco` e vira função própria —
  `negocios_em_risco(filtros…, p_limite int, p_deslocamento int)` — com o mesmo portão
  `eu_vejo_pauta_de_todos()` que a Etapa 3 instalou, e devolvendo também o total, para o "Ver
  mais" saber quando parar.
- `dashboard_negocios_risco` mantém os agregados e os dois gráficos. O `top_parados` sai dela.

**Na tela:**

- A fila perde a etiqueta de dono (§3).
- A tabela ganha duas ações por linha: **Abrir negócio** (o painel de 4.A, sem sair da tela) e
  **Retomar depois** (o mesmo diálogo da fila).
- "Ver mais" acrescenta 10. O primeiro carregamento traz 10. **Mexer em qualquer filtro volta
  para 10** — senão a pessoa filtra depois de ter aberto 60 linhas e recebe uma consulta de 60
  linhas sobre um recorte que ela acabou de estreitar.
- Para quem **não** tem a chave, a tabela continua existindo com os próprios negócios, sem a
  coluna de responsável — é o que a Etapa 3 já entregou em 08/09/2026.

**Cuidado medido:** `dashboard_negocios_risco` **não é** `SECURITY DEFINER`, roda com o
privilégio de quem chama. A função nova tem que seguir o mesmo padrão e usar
`eu_vejo_pauta_de_todos()` (liberada para `authenticated`), nunca `ve_pauta_de_todos(uuid)`
(revogada de propósito). Custo atual do painel, medido como usuário logado: **29,0 ms** quente.
O plano mede de novo — `CLAUDE.md` §7.15 e §7.16.

---

### 4.D — A tarefa automática do "Retomar depois"

**No diálogo:** uma caixinha **"Criar tarefa para o responsável"**, marcada por padrão.

**No banco:** `registrar_retorno` ganha `p_criar_tarefa boolean default true`. Quando verdadeiro,
além do retorno e do aviso, grava uma tarefa:

| campo | valor |
|---|---|
| título | `Retomar contato <nome do negócio>` — escolha do dono do produto em 09/09/2026 |
| descrição | o motivo digitado |
| responsável | **o dono do negócio** (`pedidos.usuario_id`), não quem clicou |
| prazo | a data do retorno |
| vínculo | `pedido_id` |

🔴 **`tarefas.usuario_id` é da família `usuarios.id`** (`CLAUDE.md` §4.5). Errar não dá erro
visível: a gravação inteira é recusada pela chave estrangeira.

**Na fila:** `pauta_do_dia_de` passa a esconder o negócio quando existe tarefa aberta ligada a
ele. Hoje a fila mostraria duas linhas no dia do retorno — a tarefa (que já entra como
compromisso) e o negócio voltando. Uma linha só, e é a tarefa, porque ela carrega o motivo.

**Qualquer** tarefa aberta ligada ao negócio esconde a linha, não só a que este gesto cria. É
deliberado e é coerente com o que a tela já faz: o cartão "Sem Próxima Ação" usa exatamente esse
critério — tarefa aberta conta como próxima ação, venha de onde vier.

**Consequência a tratar:** a tarefa entra como **compromisso** e compromissos comem vaga da fila
(`v_vagas := v_max - v_compromissos`). Isso é o comportamento certo — compromisso tem prioridade
—, mas o plano precisa conferir que o "Abrir negócio" existe na linha da tarefa, senão a pessoa
perde o caminho para o negócio no dia em que mais precisa dele.

**Borda:** negócio sem dono (`usuario_id` nulo). A tarefa não tem para quem ir; nesse caso não se
cria tarefa, e o resto do gesto acontece normalmente.

---

## 5. Ordem sugerida

**A → C → D → B.** A tabela (C) precisa do painel (A) para abrir o negócio sem sair da tela. A
tarefa (D) mexe no mesmo diálogo que C usa. A voz (B) é independente e pode furar a fila se o
dono do produto quiser um resultado visível antes.

## 6. Como se prova que funcionou

- **A:** abrir um negócio pela fila, pela tabela e pela ficha de um contato — as três abrem o
  mesmo painel, sem trocar de tela; recarregar a página mantém aberto.
- **B:** a função pura tem teste para cada um dos seis degraus, e o e-mail e a tela dizem a mesma
  frase para os mesmos dados.
- **C:** um vendedor sem a chave vê a tabela só com os próprios; com a chave, vê a empresa e o
  filtro de responsável. Medir o custo como usuário logado, antes e depois.
- **D:** adiar um negócio de colega com a caixinha marcada cria a tarefa **no nome do dono**, e
  no dia do retorno a fila mostra uma linha, não duas.

## 7. Fica em aberto, para decisão do dono do produto

**Os três cartões do topo do Radar** ("Negócios Parados", "Sem Próxima Ação", "Valor em Risco")
mostram o total da **empresa** para qualquer pessoa, inclusive vendedor sem a chave. Medido em
08/09/2026: Érika e Fabiola recebem os mesmos números. Não é vazamento nominal — são totais, sem
nome —, e é coerente com a Lista de Negócios, que também é compartilhada. Mas é diferente do
resto da tela "Hoje", que é pessoal. **Recortar por pessoa muda o número que a tela mostra**, e
isso é decisão de produto, não conserto.

## 8. Nota sobre um número usado nesta conversa

A escolha da decisão 1 se apoiou na medição de que dois dos cinco gestores da MD também vendem —
Igor Morais com 489 negócios abertos e Lucas Ferreira com 3.487. O número do Lucas Ferreira está
**inflado pela importação**: nome que não casa cai silenciosamente no usuário logado, e isso lhe
atribuiu 4.777 negócios que não são dele. A conclusão não muda (o Igor sozinho já sustenta o
argumento), mas o número não deve ser citado como se fosse verdade de negócio.
