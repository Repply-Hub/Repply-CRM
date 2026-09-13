# A pauta do dia que encolhe até zerar — desenho

**Data:** 12/09/2026
**Pedido:** dono do produto, 12/09/2026
**Estado:** aprovado na conversa; falta a revisão do documento escrito

---

## 1. O que foi pedido

Três regras novas, nas palavras do dono do produto:

1. **Todo gestor recebe a visão da equipe no e-mail.** Se ele tiver negócio no próprio nome, esse
   aparece **primeiro** na pauta dele; os negócios da equipe vêm logo em seguida.
2. **A pauta encolhe.** Conforme a pessoa vai dando os retornos, a pauta diminui **até zerar** — e
   não se recompõe. Assim, empresa com muita demanda para de ficar sempre lotada no teto, e nasce
   a cultura do pequeno esforço diário.
3. **Quem quiser ver mais usa a tabela de baixo**, que já filtra pelas permissões: quem não é
   gestor e não tem a chave de ver a pauta de toda a equipe vê só os negócios dele.

As decisões tomadas na conversa, que entram aqui como entrada fixa:

| Pergunta | Decisão |
|---|---|
| O que conta como "dar retorno" | Qualquer ação no negócio (ver §3.1) |
| Teto da pauta do gestor | O mesmo teto do dia da empresa |
| Enchimento com negócio não parado | Acaba: só entra o que está parado |
| Cartões de risco e "Resumo por fabricante" | Seguem a permissão |
| O ajuste "mínimo de itens" | Vira um número só na tela ("Até 7 itens por dia") |
| Quem não tem nada parado | Continua sem receber o e-mail das 7h |

---

## 2. O que está no ar hoje, e o que isto desfaz

A fila da tela "Hoje" e o e-mail das 7h saem da mesma função de banco, `pauta_do_dia_de(uuid)`.
Hoje ela:

- monta a fila **só com os negócios da própria pessoa** — decisão de 09/09/2026, migration
  `20260909120000_fila_pessoal.sql`;
- ordena por valor e corta no teto (`pauta_max_itens`, 7 por padrão), descontando os compromissos
  do dia;
- **completa a fila** com negócios que não estão parados quando não há parados suficientes
  (`pauta_min_itens`, 3 por padrão);
- recalcula tudo a cada leitura, então **uma vaga liberada é preenchida na hora** pelo próximo da
  lista.

🔴 **Este desenho desfaz a decisão de 09/09/2026** — e é preciso dizer por quê, porque o motivo
registrado naquela migration era legítimo: *"o teto de 7 era disputado por valor com os da equipe
inteira, e o negócio de R$ 8 mil do gestor perdia a vaga para o de R$ 2 milhões de um colega"*.

A regra nova resolve exatamente isso: **os negócios do gestor ocupam as primeiras vagas**, e a
equipe preenche o resto. O que sobrou de 09/09 e continua valendo: a chave `pauta_de_todos` é o
que decide quem vê a equipe, e a tabela do time continua sendo o lugar de agir sobre negócio
alheio deliberadamente.

O gestor hoje recebe a visão da equipe num **e-mail separado** ("pulso da equipe"), disparado só
quando a fila pessoal dele vem vazia. Com a regra nova a pauta dele já é a visão da equipe, então
esse segundo formato vira o que ele deveria ter sido desde o começo: uma rede de segurança para o
dia em que não houver nada parado. Ele **não é removido** (decisão do dono do produto).

---

## 3. O desenho

### 3.1 O que conta como "dar retorno"

Um negócio sai da pauta do dia quando, **naquele dia**, aconteceu qualquer uma destas coisas —
feita por **qualquer pessoa**, não só pelo dono:

| Gesto | Onde fica gravado |
|---|---|
| Mudou de etapa | `pedidos_historico_status`, `tipo = 'status'`, **com etapa anterior preenchida** |
| "Retomar depois" ou contato registrado | `historico_contatos`, `data_contato` = hoje |
| Tarefa do negócio criada | `tarefas.pedido_id` preenchido, `created_at` = hoje |
| Tarefa do negócio concluída | `tarefas.pedido_id` preenchido, `status = 'concluida'`, `updated_at` = hoje |

🔴 **Editar um campo solto do negócio NÃO conta**, e a razão é medida, não estética: importação
grava milhares de edições de campo de uma vez. Medido em 12/09/2026 no banco de produção, em dias
recentes de importação: um dia com 9.498 edições de campo alcançando 4.637 negócios; outro com
10.063 negócios recebendo linha de etapa. Se qualquer mexida contasse, um dia de importação zeraria
a pauta da empresa inteira e o sistema diria "dia cumprido" para gente que não trabalhou.

🔴 **"Com etapa anterior preenchida" é o que separa gesto humano de importação.** Medido na mesma
data, nos três dias de carga do banco: as linhas em massa (10.063, 1.956 e 284 negócios) têm
**todas** `status_anterior` nulo. Quem move o negócio de verdade grava de onde ele saiu. Isso
também deixa de fora a criação de um negócio novo, o que é certo: criar não é dar retorno.

Quando esta regra errar, ela erra para o lado seguro — **o negócio continua na fila**, em vez de
sumir sem ninguém ter feito nada.

Duas qualificações que só ficaram claras ao escrever o plano, e que valem estar aqui porque
estreitam o "qualquer ação":

- **Concluir a tarefa de um negócio só conta quando o negócio estava na pauta do dia.** Negócio
  com tarefa aberta não aparece na pauta (regra de 11/09: tarefa aberta é próxima ação) — a
  exceção é a tarefa **vencida**, e aí sim concluí-la conta como retorno. Fora desse caso,
  concluir a tarefa não faz o negócio aparecer como "feito" hoje: ele volta amanhã, se continuar
  parado.
- **Negócio ganho ou perdido hoje conta como feito.** A etapa que decide se ele é candidato é a da
  virada do dia, lida da primeira mudança de etapa de hoje. Uma versão anterior deste desenho
  deixava o negócio ganho sair da conta; a revisão da implementação mostrou que, com a etapa lida
  ao vivo, o próximo da fila **entrava na vaga dele** — a recomposição que o pedido derruba. Por
  isso a etapa passou a ser a da virada.

### 3.2 A lista do dia

**Na virada do dia o sistema escolhe a lista, e ela vale o dia inteiro.** Durante o dia ela só
encolhe: cada negócio que recebe retorno sai, e **nada entra no lugar**. Nem o teto se move — vaga
aberta fica aberta.

Em termos de implementação, três coisas passam a ser medidas **no começo do dia** e não "agora":

1. **Há quantos dias o negócio está parado** — conta só o histórico anterior à virada do dia. É o
   que congela a lista: um negócio que recebeu ação hoje continua sendo o mesmo candidato que era
   de manhã, e por isso o lugar dele não é ocupado por outro.
2. **Quantas vagas os compromissos ocupam** — conta os compromissos do dia que já existiam na
   virada, **concluídos ou não**. Sem isso, concluir uma tarefa abriria vaga e puxaria um negócio
   novo para dentro (recomposição), e criar uma tarefa às 10h derrubaria um negócio da lista.
3. **A escolha e a ordem** — os do próprio dono primeiro (§3.3) e, depois deles, os da equipe;
   entre os parados, **os de maior valor entram primeiro**, cortando no teto. É a regra que a pauta
   já usa hoje, mantida por decisão do dono do produto em 13/09/2026. A alternativa, "os parados
   há mais tempo", foi descartada por um motivo medido: na MD, hoje, isso quer dizer "intocado desde
   a importação do Bitrix" — todos empatam em 12 dias — e tiraria da pauta os negócios trabalhados
   depois da importação que pararam de novo.

**Exceção deliberada: compromissos da agenda continuam ao vivo.** Reunião marcada às 10h para as
15h **aparece** na pauta. Esconder um compromisso do dia até amanhã seria defeito, não regra. A
consequência aceita: num dia assim a tela pode mostrar mais itens que o teto — o teto governa os
negócios, e "reunião marcada não se corta por teto" já é a promessa da tela de Configurações.

### 3.3 A pauta do gestor

Para quem tem a chave `pauta_de_todos` (todo gestor, por padrão):

- os negócios **no nome dele** ocupam as primeiras vagas, em ordem de valor;
- o resto do teto é preenchido pelos negócios parados da equipe, os de maior valor primeiro;
- cada item de colega mostra **de quem é** — a etiqueta de dono existia na tela e saiu em 09/09,
  quando a fila virou pessoal. Ela volta. O e-mail já sabe mostrar o nome (`montarItens` em
  `supabase/functions/pauta-resumo-diario/corpo.ts` nunca deixou de tratar o campo).

Efeito medido na equipe de referência em 12/09/2026, com teto 7: dos seis gestores, um veria 3
negócios próprios e 4 da equipe, outro veria 1 próprio e 6 da equipe, e os outros quatro — que não
têm negócio no nome — veriam 7 da equipe. Nenhum vendedor da base tem a chave hoje, então **nenhum
vendedor muda de comportamento** por causa desta parte.

**Quando um vendedor dá o retorno, o negócio sai também da pauta do gestor** — é o mesmo negócio.
O gestor vê o time zerando o dia.

### 3.4 Só entra o que está parado

Some o enchimento: a pauta deixa de completar com negócios dentro do prazo quando faltam parados.

Consequência boa de graça: o e-mail das 7h para de chamar de "parado" o que não está. Hoje a voz da
pauta diz "R$ X parados em N negócios" contando a fila inteira, enchimento incluído — é a dívida
técnica §71.

O ajuste vira um número só na tela de Configurações → Automação: *"Quantos itens por dia: 3 a 7"*
passa a ser *"Até quantos itens por dia: 7"*. O valor de `pauta_min_itens` **não é apagado do
banco** — a função para de lê-lo e a tela para de mostrá-lo, então voltar atrás é reemitir a
função.

Medido em 12/09/2026: **nenhuma empresa jamais salvou esses ajustes** (todas no padrão 3/3/7), e o
mínimo **não acrescenta hoje um único negócio a ninguém** — os cinco vendedores com carteira ativa
têm entre 20 e 41 negócios parados cada um, muito acima do mínimo. Ou seja: esta parte não muda
nenhuma tela hoje; ela impede a mentira no dia em que uma equipe zerar o atraso.

### 3.5 Quando zera

A tela "Hoje" hoje tem três estados: carregando, fila vazia com a tabela do time vazia ("Nada
parado. Seu dia está seu.", com sol), e fila vazia com a tabela cheia ("Sua fila está vazia").

Entra um quarto, e ele **ganha dos outros dois** quando vale:

- **Durante o dia**, com pelo menos um feito: uma linha discreta abaixo da manchete — *"3 de 7
  feitos hoje"*. Conta só negócios; compromisso não entra na conta.
- **Ao chegar a zero**, com pelo menos um feito: **"Pauta de hoje zerada"**, com o sol.

A frase é neutra quanto a quem fez, de propósito: na pauta do gestor o trabalho pode ter sido do
time, e "você zerou" seria falso ali.

Quem não tinha nada parado continua vendo as frases de hoje — a diferença entre "não havia nada" e
"eu fiz tudo" é justamente o que hoje não existe.

Para a tela saber disso, a função de banco passa a devolver também os negócios **já feitos hoje**,
marcados com um tipo próprio (`negocio_feito`). Quem consome tem de filtrar:

- `src/pages/Hoje.tsx` — desenha só os pendentes, conta os feitos;
- `supabase/functions/pauta-resumo-diario/index.ts` — filtra os feitos **antes** de decidir se há
  e-mail a mandar; com a lista inteira, uma pauta zerada pareceria cheia e o e-mail sairia.

🔴 **A voz da pauta não é tocada.** `vozDaPauta` (e a cópia byte a byte do e-mail) continua como
está: os dois lados passam a ela apenas o que está na tela. Filtrar dentro dela significaria editar
o arquivo duplicado e mexer na frase que já está no ar — risco sem ganho, quando quem chama já sabe
o que quer contar.

### 3.6 O e-mail das 7h

Não muda de formato: ele lê a mesma função, então herda a lista do dia, a ordem do gestor e o fim
do enchimento sem uma linha de regra nova. Às 7h nada foi feito ainda, então o gestor recebe a
pauta cheia com os dele em cima.

O que muda é só a higiene descrita em §3.5: filtrar os itens marcados como feitos, para o caso de o
envio rodar (ou ser reprocessado) depois de alguém já ter trabalhado.

Quem não tem nada parado continua sem receber e-mail — decisão do dono do produto. Um e-mail diário
que diz "nada para fazer" vira ruído e ensina a ignorar o remetente.

### 3.7 O painel de baixo segue a permissão

Medido em 12/09/2026: os três cartões de risco e o "Resumo por fabricante" mostram **o número da
empresa inteira para todo mundo**. Uma vendedora e uma gestora da mesma empresa recebem hoje
exatamente o mesmo valor em risco. Isso nunca foi decisão — é a regra de leitura de `pedidos`, que
é da empresa inteira, aparecendo sem portão.

Passam a seguir a mesma chave da pauta: sem a chave, os cartões e o resumo por fabricante contam só
os negócios da pessoa. O gráfico por vendedor e a lista dos 10 maiores já seguem desde 07/09; com o
corte feito uma vez na origem, o portão deles fica redundante e sai junto.

⚠️ **Isto muda números que as pessoas veem todo dia.** Para quem não tem a chave, o valor em risco
vai cair — não porque algo sumiu, mas porque ele passa a ser o valor em risco *dela*.

### 3.8 O que não muda

- O teto (7) e o corte de dias (3) continuam ajustáveis em Configurações → Automação.
- Quem pode adiar negócio de colega continua sendo decidido no servidor, por `registrar_retorno`.
- A tabela do time continua sendo o lugar de ver mais do que a pauta, já filtrada por permissão
  (`negocios_em_risco_de`, que lê a mesma chave).
- A tarefa vencida continua devolvendo o negócio para a pauta (migration de 11/09).
- `pauta_do_dia_de` continua fechada para o navegador (`CREATE OR REPLACE`, nunca `DROP`).

---

## 4. Arquitetura

Uma regra, um lugar: **`pauta_do_dia_de(uuid)`**. Tela e e-mail leem dela; nenhuma das duas pontas
recalcula nada. É o que impede a tela dizer 5 e o e-mail dizer 7.

```
                    configuracoes_automacao (dias parado, teto)
                                    │
   pedidos ─ pedidos_historico_status ─ historico_contatos ─ tarefas ─ eventos
                                    │
                         pauta_do_dia_de(usuario)
                          ├── negocio_parado  (pendentes, na ordem do dia)
                          ├── negocio_feito   (os que receberam retorno hoje)
                          └── compromisso     (ao vivo, da agenda)
                                    │
                 ┌──────────────────┴──────────────────┐
        pauta_do_dia()                        pauta-resumo-diario
        (tela "Hoje")                          (e-mail das 7h)
```

### Mudanças no banco

**`pauta_do_dia_de(uuid)`** — `CREATE OR REPLACE`, assinatura inalterada:

1. Volta a ler a chave (`ve_pauta_de_todos`) para decidir de quem são os negócios candidatos.
2. O "há quantos dias está parado" passa a olhar só o histórico anterior à virada do dia.
3. Os compromissos que descontam vaga passam a ser os que já existiam na virada, concluídos ou não.
4. Entra o conjunto "agiu hoje" (§3.1), que separa pendentes de feitos.
5. A escolha passa a ser: primeiro os do próprio dono, depois os da equipe, dentro do teto.
6. Sai a cláusula de enchimento por `pauta_min_itens`.
7. Os feitos saem no resultado com `tipo = 'negocio_feito'`, depois dos pendentes.

**`dashboard_negocios_risco(...)`** — `CREATE OR REPLACE`, assinatura inalterada: um portão só, na
origem dos negócios, avaliado uma vez por consulta (subconsulta sem correlação, para não virar
chamada por linha — a armadilha do CLAUDE.md §7.16).

### Mudanças na tela

| Arquivo | O quê |
|---|---|
| `src/lib/pauta-do-dia.ts` (novo) | `separarAPauta`: o que a tela desenha, o que já foi feito, e o denominador do contador |
| `src/hooks/use-pauta.ts` | o tipo do item ganha `negocio_feito` |
| `src/pages/Hoje.tsx` | usa `separarAPauta`; linha "N de M feitos hoje"; estado "Pauta de hoje zerada"; volta a etiqueta de dono no item |
| `src/components/configuracoes/AutomacaoTab.tsx` | um número só, "Até quantos itens por dia" |
| `src/hooks/use-configuracoes-automacao.ts` | sai `pauta_min_itens` |

### Mudanças no e-mail

| Arquivo | O quê |
|---|---|
| `supabase/functions/pauta-resumo-diario/corpo.ts` | expõe `soOsPendentes` |
| `supabase/functions/pauta-resumo-diario/index.ts` | filtra antes de decidir se envia |

---

## 5. Testes

O que é regra pura de TypeScript tem teste automatizado; o que é SQL é conferido por simulação
medida no banco antes de aplicar, como as migrations anteriores desta série.

**Automatizados (Vitest):**

1. `pauta-do-dia.test.ts` — a separação pendentes/feitos e o denominador do contador ("3 de 7"),
   com itens inventados; compromisso não entra no denominador.
2. `hoje-estados.test.tsx` — com feitos e nenhum pendente, a tela mostra "Pauta de hoje zerada";
   com feitos e pendentes, mostra a linha do contador; sem nenhum feito, as frases de hoje
   continuam; o negócio feito não é desenhado como item da fila.
3. `hoje-estados.test.tsx` — item de colega mostra a etiqueta com o nome do dono; item próprio,
   não.
4. `corpo-do-resumo-diario.test.ts` — `soOsPendentes` tira o item feito e mantém o compromisso.

🔴 Nomes e valores **inventados** em todos eles (CLAUDE.md §6.9).

**Simulação no banco antes de aplicar a migration**, reescrevendo a consulta como `SELECT` puro e
rodando para todas as pessoas ativas das empresas com a seção "Hoje" ligada — cenário "antes" e
cenário "depois", lado a lado, como a migration de 09/09 fez. O cenário "antes" tem de reproduzir
a chamada real da função, pessoa a pessoa; é isso que prova a simulação fiel.

---

## 6. Ordem de publicação

🔴 **Tela primeiro, e-mail depois, banco por último.** É o inverso da ordem do pacote anterior, e o
motivo é o tipo novo:

1. **Site.** Tela nova + função velha = nenhum item `negocio_feito` chega, o contador nunca
   aparece, a pauta se comporta como hoje. Inofensivo.
2. **Função de borda** (`npx supabase functions deploy pauta-resumo-diario`). Mesmo raciocínio.
3. **Migration.** A partir daqui a função devolve os feitos — e as duas pontas já sabem filtrá-los.

Na ordem inversa haveria uma janela em que a tela e o e-mail desenhariam os negócios **já feitos**
como se fossem pendentes.

**Para voltar atrás:** reemitir as duas funções com o texto anterior (`CREATE OR REPLACE`, nunca
`DROP` — `pauta_do_dia_de` tem `authenticated` revogado de propósito e um `DROP` apagaria isso em
silêncio). O valor de `pauta_min_itens` continua no banco, então a volta é completa.

---

## 7. Riscos conhecidos

| Risco | Tamanho | O que fazemos |
|---|---|---|
| Importação zerando a pauta de todo mundo | Era grande | §3.1: edição de campo não conta, e etapa sem anterior não conta |
| Cartões de risco caindo de valor para vendedor | Visível no primeiro dia | É o pedido; avisar a equipe antes |
| Gestor com muitos negócios próprios não vendo a equipe | Zero hoje | Nenhum gestor da base tem mais de 3 negócios abertos; se um dia tiver, o teto é dele mesmo |
| Tarefa concluída hoje contar como "ação" sem ser follow-up | Pequeno | Aceito: concluir tarefa do negócio é trabalho no negócio |
| Contato registrado com data retroativa não contar | Pequeno | Aceito: erra para o lado de manter na fila |
| Editar o valor de um negócio na borda do corte troca um negócio por outro na lista | Raro | Aceito: a conta continua a mesma; selar exigiria reconstruir o valor da virada pelo histórico |
| Trocar o dono move o negócio de uma pauta para outra no meio do dia | Raro | Aceito, pelo mesmo motivo |
| Mudar o prazo ou apagar um compromisso de hoje abre vaga, e um negócio entra | Raro | Aceito: o compromisso da virada é contado pelo prazo atual |
| Reabrir ou editar tarefa pode esconder o negócio sem dar crédito | Raro | Aceito: erra para o lado de não inventar trabalho |
| Importação que mude a etapa no dia mexe na lista | Raro | Aceito: importação grava etapa anterior nula e não conta como retorno |

⚠️ **Armadilha de fuso já medida nesta base:** `historico_contatos.data_contato` guarda valores
gravados de duas formas — meia-noite em UTC (o que o "Retomar depois" grava) e meio-dia em UTC (o
que as telas de contato gravam). Comparar essa coluna convertendo para o fuso de São Paulo joga o
primeiro grupo para o dia anterior. A comparação tem de ser feita em UTC. É a mesma família de
armadilha do CLAUDE.md §7.12.
