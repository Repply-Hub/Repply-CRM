# Dashboard e Plano de Vendas

Como cada número da tela é calculado, **de qual coluna de data ele sai** e por quê. Este
documento existe porque a resposta não é a mesma para todas as métricas — e a diferença
entre elas já produziu número errado em produção.

Estado: descrito a partir do código de **21/08/2026**, migrations
`20260821120000_dashboard_datas_por_fechamento.sql` e
`20260821120100_data_fechamento_em_todos_os_caminhos.sql`.

> ⚠️ **As duas migrations acima estavam escritas e ainda não aplicadas** quando este
> documento foi escrito. Escrever migration não é aplicá-la — confira antes de confiar nos
> números da tela (`CLAUDE.md` §9).

---

## 1. Onde mora cada coisa

| Arquivo | Papel |
|---|---|
| `src/pages/Dashboard.tsx` | Orquestra: filtros do topo (fabricante, responsável, período), os 4 cartões de KPI, a exportação em PDF |
| `src/components/dashboard/DashboardCharts.tsx` | Todos os gráficos. Carregado por `lazy()` — o recharts é o maior pedaço de código da página |
| `src/components/dashboard/PlanoVendasSection.tsx` | A seção de metas por fábrica, com a quebra por vendedor |
| `src/hooks/use-dashboard.ts` | `useDashboardStats`, `useIndicadoresVendedor`, `useFaturamentoMensal` |
| `src/hooks/use-plano-vendas.ts` | `usePlanoVendasProgresso`, `usePlanoVendasProgressoPorVendedor` |
| `dashboard_stats` (RPC) | Os 4 KPIs, a segmentação por ticket e os dois rendimentos |
| `dashboard_indicadores_vendedor` (RPC) | "Conversão por Vendedor" e a lista do seletor "Responsável" |
| `plano_vendas_progresso` / `..._por_vendedor` (RPC) | O Plano de Vendas |
| `vw_faturamento_mensal` (visão) | O gráfico "Faturamento Mensal" e o selo "+X% últ. mês" |

**Tudo soma no servidor.** Nenhuma dessas contas puxa `pedidos` para o navegador — ver
`SPEC.md` §10.7. As RPCs são `SECURITY INVOKER`, então a RLS de `pedidos` já separa a
empresa sozinha.

---

## 2. As duas colunas de data — a distinção que organiza o resto

`pedidos` tem duas datas que interessam ao Dashboard, e nenhuma das duas tem o nome do que
guarda (é o [item 21 da dívida técnica](../divida-tecnica.md)):

| Coluna | O que é de verdade | Como aparece na tela |
|---|---|---|
| `data_pedido` | **Data de criação** do negócio | "Data de criação" |
| `prazo_resposta` | **Data de fechamento** — o dia em que a venda foi ganha ou perdida | "Data de Fechamento" |

A regra, decidida pelo Lucas em 21/08/2026:

> **Dinheiro conta pelo dia em que o negócio foi ganho. Conversão conta pelo dia em que o
> negócio nasceu.**

Um negócio criado em 28/junho e fechado em 3/julho é **faturamento de julho**. Antes desta
mudança ele entrava em junho — e sumia da meta de julho, que é o mês em que a venda
realmente aconteceu.

---

## 3. Métrica por métrica

### Conta por FECHAMENTO (`prazo_resposta`)

| Métrica | Onde aparece | De onde sai |
|---|---|---|
| **Faturamento Total** | Cartão de KPI | `dashboard_stats.total_faturamento` — soma de `valor_total` dos negócios com `status='fechamento'` que fecharam no período |
| **Negócios Fechados** | Cartão de KPI | `dashboard_stats.pedidos_fechados_periodo` |
| **Ticket Médio** | Cartão de KPI | Faturamento Total ÷ Negócios Fechados. Os dois lados da divisão saem da **mesma** janela de tempo — senão o ticket vira a razão entre dois conjuntos diferentes de negócios |
| **Faturamento por Fábrica** | Rosca | `dashboard_stats.rendimento_fabricante` |
| **Rendimento por Responsável** | Barras | `dashboard_stats.rendimento_vendedor` |
| **Faturamento Mensal** | Linha/barras | `vw_faturamento_mensal`, agrupada por `date_trunc('month', prazo_resposta)` |
| **Plano de Vendas** | Seção própria | `plano_vendas_progresso` — a CTE `vendido` recorta por `prazo_resposta` |

**Por quê:** todas são dinheiro de venda ganha. Meta é compromisso do mês em que a venda
**fecha**, não do mês em que o negócio nasceu.

### Conta por CRIAÇÃO (`data_pedido`) — e continua assim de propósito

| Métrica | Onde aparece | De onde sai |
|---|---|---|
| **Taxa de Conversão** | Cartão de KPI | `dashboard_stats.pedidos_fechados` ÷ `dashboard_stats.total_pedidos` |
| **Conversão por Vendedor** | Barras | `dashboard_indicadores_vendedor.qtd_fechado` ÷ `total_pedidos` |
| **Segmentação por Ticket** | Rosca | `dashboard_stats.segmentacao_alto` / `_medio` / `_baixo` |

**Por quê:** as três são contas **de safra** (§4). A Segmentação, em particular, conta
**todos** os status por faixa de valor — é "negócios criados no período por tamanho", não
"vendas por tamanho".

> A Segmentação por Ticket é a mais fácil de quebrar em silêncio: é uma rosca de três
> fatias, e ninguém percebe se ela mudar de significado. Foi por isso que
> `dashboard_stats` ganhou **duas CTEs** em vez de trocar a coluna da única CTE que
> existia.

---

## 4. Taxa de conversão é de SAFRA — e o número que justifica

**Definição:** dos negócios **criados** no período, quantos já foram ganhos (em qualquer
data).

O numerador é subconjunto do denominador. Consequência prática: **a taxa nunca passa de
100%**.

A fórmula alternativa — fechados no período ÷ criados no período — mistura dois conjuntos
que não se contêm, e estoura. Medido nesta base: na semana de **29/12/2025** ela daria
**157%**. Um painel que mostra "157% de conversão" não é um painel; é um bug com
aparência de dado.

Foi por isso que a Taxa de Conversão, a Conversão por Vendedor e a Segmentação por Ticket
**não** foram movidas para `prazo_resposta`. Elas já estavam certas.

---

## 5. Existem DOIS contadores de "fechados". Cada tela lê o seu

Esta é a parte mais fácil de alguém quebrar depois: os dois nomes são parecidos, os dois
números são plausíveis, e **a tela não denuncia a troca**.

| Campo | Significado | Quem usa |
|---|---|---|
| `pedidos_fechados` | Criados no período que **já ganharam**, em qualquer data | Só o numerador da Taxa de Conversão |
| `pedidos_fechados_periodo` | Fecharam **dentro** do período, tendo sido criados quando fosse | O cartão "Negócios Fechados" e o divisor do Ticket Médio |

Os dois são diferentes de verdade. Medido em **agosto/2026: 62 contra 45**.

`pedidos_fechados` manteve o nome e o significado **antigos** de propósito — trocar a fonte
dele mudaria a Taxa de Conversão sem ninguém pedir. `pedidos_fechados_periodo` é o campo
novo, criado pela migration `20260821120000`.

`dashboard_indicadores_vendedor` tem o mesmo par: `qtd_fechado` (safra, alimenta a
Conversão por Vendedor) e `qtd_fechado_periodo` (por fechamento, **hoje nenhum gráfico
usa** — está lá para quem precisar somar fechamento por pessoa sem reabrir a RPC).

> **Valor fechado por vendedor** só existe em `dashboard_stats.rendimento_vendedor`.
> `dashboard_indicadores_vendedor` devolve contagem, nunca dinheiro. Duas fontes para o
> mesmo dinheiro é exatamente como a bagunça de datas começou.

---

## 6. Não existe `p_date_field` aqui — e não pode passar a existir

A ideia óbvia é "põe um parâmetro para escolher a coluna de data". **Já foi tentado, e o
custo está medido.**

| Quando | O que aconteceu |
|---|---|
| `20260811120000` | Implementou a escolha com `CASE WHEN p_date_field = ... THEN p.fechado_em ELSE p.data_pedido END` dentro da comparação |
| Efeito | `pedidos_stats` saltou de **~4ms para 16–31 SEGUNDOS** numa tabela de ~15 mil linhas, **com os índices existindo** |
| `20260811140000` | Trocou o `CASE` por um "OU de blocos" (cada bloco cita uma coluna só). Melhorou para **~30–200ms** — ainda 10 a 50 vezes o original |
| `20260811150000` | Removeu `p_date_field` das RPCs do Dashboard |

**A mecânica:** o PostgREST **sempre** chama RPC por argumento nomeado
(`func(p_a := ...)`), que é o caso do plano genérico. Predicado que cita **duas colunas** —
com `CASE` ou com OU-de-blocos — faz o Postgres largar o Index Scan. E a política de RLS de
`pedidos` chama `usuario_in_my_empresa` **uma vez por linha varrida**: sair de ~100 linhas
para 11,9 mil é o que transforma 4ms em segundos.

**A única forma que manteve Index Scan é ter a coluna cravada no texto de cada recorte.**
Por isso `dashboard_stats` tem duas CTEs separadas (`base_criados` e `base_fechados`) em
vez de um parâmetro, e por isso `dashboard_indicadores_vendedor` resolve
`qtd_fechado_periodo` com subconsulta correlacionada em vez de um segundo `LEFT JOIN`.

> Vale para qualquer RPC nova deste sistema, não só para o Dashboard. Ver `CLAUDE.md` §7.9.

### Índices que sustentam isso

```sql
idx_pedidos_prazo_resposta         -- btree (prazo_resposta), já existia
idx_pedidos_status_prazo_resposta  -- btree (status, prazo_resposta), novo
```

O composto existe porque **todo** recorte de dinheiro criado nesta leva é
`status='fechamento' E prazo_resposta entre X e Y` — com ele o Postgres resolve os dois de
uma vez em vez de cruzar dois índices.

---

## 7. Plano de Vendas soma o período inteiro

`plano_vendas_progresso` só sabia olhar **um** mês (`p_ano`, `p_mes`), e a tela mandava o
mês da **data inicial** do período. Resultado: filtrar "01/jan a 31/dez" mostrava **só
janeiro** — e a tela não avisava que o resto tinha sido descartado.

Agora a função recebe o intervalo e:

- soma as metas de **todos os meses que o intervalo toca** (mês do início até mês do fim,
  inclusive);
- soma o vendido do intervalo inteiro, por `prazo_resposta`.

**Meta é valor mensal.** Um período que pega meia agosto soma a meta **cheia** de agosto —
ratear meio mês seria inventar número.

**A soma é feita mês a mês antes de virar total.** A regra "usa a meta de equipe; se não
houver, usa a soma das individuais" vale **por mês**. Somar tudo primeiro e aplicar a regra
depois daria número errado num período em que um mês tem meta de equipe e o outro só tem
individuais.

As assinaturas antigas (`p_ano`, `p_mes`) continuam existindo como **atalho** que chama a
nova — assim o banco pode subir antes da tela sem quebrar nada.

> `plano_vendas_progresso` e `plano_vendas_progresso_por_vendedor` **mudam sempre juntas.**
> A agregada usa `FULL OUTER JOIN` (mostra fábrica com venda e sem meta) e a por-vendedor
> parte das metas individuais. Se só uma trocar de coluna de data ou de janela, o total da
> seção e a quebra "Por vendedor" passam a discordar na tela — e ninguém consegue dizer
> qual das duas está certa.

---

## 8. O selo "+X% últ. mês"

Comparava o último mês do período com o penúltimo **da lista já filtrada**. Com o período
padrão (só o mês corrente) a lista filtrada tem um item só, não existe mês anterior, e o
selo ficava travado num "+0%" verde **para sempre** — número que nunca foi verdade.

Agora o mês anterior é buscado na lista **completa** de `vw_faturamento_mensal`. Sem mês
anterior no histórico, o selo simplesmente **não é desenhado**, em vez de mentir zero.

No mesmo lugar: um mês entra no gráfico quando **se sobrepõe** ao período escolhido. Antes
o teste era se o **dia 1** do mês caía dentro do intervalo — então "15/jan a 20/ago"
apagava janeiro inteiro do gráfico, sem aviso.

---

## 9. O gráfico "Rendimento por Fábrica" foi removido

Era um segundo cartão, em barras, mostrando **exatamente o mesmo array** que a rosca
"Faturamento por Fábrica" (`dashboard_stats.rendimento_fabricante`) — mudando só o desenho
e ganhando um seletor Maior/Menor.

Dois cartões para o mesmo número fazem a tela parecer maior do que a informação que ela
tem. Ficou a rosca, que já agrupa as fábricas pequenas em "Outros" com o detalhe ao passar
o mouse.

Com isso sobraram três cartões numa grade de duas colunas, e "Rendimento por Responsável"
passou a ocupar a linha inteira (`lg:col-span-2`) — meia linha vazia ao lado de um gráfico
parece, na tela, gráfico que não carregou.

---

## 10. `fechado_em` está envenenada. A coluna que vale é `prazo_resposta`

**Todos os 11.715 registros preenchidos de `fechado_em` têm 18 ou 19/08/2026** — os dois
dias em que a importação do Bitrix rodou. São duas datas distintas para uma história que
vai de 2022 a 2026.

Aconteceu porque o gatilho carimba a data quando o negócio entra em etapa final *dentro do
Repply*, e para a base importada isso foi o dia da importação.

**Nenhuma tela lê `fechado_em` hoje.** Ela não foi reparada e não está machucando ninguém;
daqui para frente volta a ser confiável para tudo que fechar dentro do sistema. Reparar o
passado exigiria reescrever 11 mil linhas para alimentar zero telas.

> 🔴 **Nunca aponte métrica nova para `fechado_em`.** Ver `SPEC.md` §10.8 e o
> [item 21 da dívida técnica](../divida-tecnica.md).

### Como a data de fechamento passou a ser confiável

A partir da migration `20260821120100`, quem manda em `prazo_resposta` é o gatilho
`fn_set_pedido_fechado_em`, no banco — não a tela. Existem **seis** caminhos que mudam o
status de um negócio (kanban, ação em massa, formulário de edição, cadastro novo,
importação, exclusão de etapa do kanban) e só dois carimbavam data. Todos os seis passam
pelo gatilho.

A regra, resumida:

- negócio entra em `'fechamento'` **ou** `'perdido'` sem data → carimba hoje;
- se o **mesmo salvamento** mexeu na data, quem manda é o usuário (ele pode estar
  registrando hoje uma venda de semana passada);
- ao **reabrir** o negócio, a data antiga **fica** (decisão do Lucas — vira histórico; é
  seguro porque o faturamento também exige status de ganho);
- rede de segurança: negócio em etapa final **não pode** ficar sem data.

O dia sai no fuso `America/Sao_Paulo`, não no do servidor: o banco roda em UTC, e depois
das 21h de Brasília `current_date` já é o dia seguinte — uma venda fechada às 21h30 de
31/agosto cairia na meta de setembro.

**Por que a rede de segurança importa para este documento:** depois da migration
`20260821120000`, apagar `prazo_resposta` de um negócio ganho é o mesmo que **fazer a
venda sumir do Faturamento Total e do Plano de Vendas**, sem avisar ninguém.

### O que ainda está torto no dado histórico

Medido em 21/08/2026, na produção. **Diagnóstico e comandos de reparo estão prontos e
comentados no fim da migration `20260821120100` — nada foi executado, depende de
autorização do Lucas.**

| Achado | Tamanho | Consequência na tela |
|---|---|---|
| Negócios em etapa final com data de fechamento **anterior** à de criação | **445**, R$ **6.879.618,26**. Defasagem de 1 a 73 dias; **411** caem num mês diferente do de criação | Esse dinheiro está hoje empurrado para um mês em que não aconteceu. Reparar move R$ 6,88 milhões de mês no Faturamento Mensal e no Plano de Vendas |
| Negócios em etapa final **sem nenhuma** data de fechamento | **2** | Invisíveis em qualquer relatório por fechamento. Nenhum novo consegue mais ficar assim |

> Se alguém já olhou meta batida ou comissão com os números atuais, **precisa ser avisado
> antes** de qualquer reparo.

---

## 11. Regra: gráfico novo exige perguntar o período ao Lucas

🔴 **Antes de construir qualquer painel, cartão ou gráfico novo, pergunte ao Lucas se ele
conta por data de criação ou por data de fechamento.**

Não é formalidade e não dá para deduzir do nome da métrica. As duas respostas produzem
números plausíveis, ninguém percebe a troca olhando a tela, e o erro só aparece quando
alguém compara com a planilha — semanas depois. Foi assim que o Dashboard inteiro passou
meses respondendo "criados no período" inclusive nas métricas de dinheiro.

O par de perguntas que resolve:

1. **Isso é dinheiro ou é conversão?** Dinheiro → fechamento. Conversão → safra, criação.
2. **O numerador é subconjunto do denominador?** Se não for, a razão pode passar de 100% —
   e aí a métrica está errada, não a tela.

Registrado também em `CLAUDE.md` §5 e `SPEC.md` §10.9.

---

## 12. Ao mexer aqui

- **Não crie `p_date_field`.** §6 explica o custo, com número.
- **Não troque a fonte de `pedidos_fechados` por `pedidos_fechados_periodo`** (nem o
  contrário). §5.
- **Mudou `plano_vendas_progresso`?** Mude `plano_vendas_progresso_por_vendedor` junto.
- **Criou coluna ou mudou assinatura de RPC?** `src/integrations/supabase/types.ts` é
  gerado e não há banco local — atualize à mão (`CLAUDE.md` §6.8). Enquanto isso não for
  feito, `use-plano-vendas.ts` usa `as never` nos argumentos, que é escape, não solução.
- **Mexeu em `pedidos`?** Confira a lista de invalidação em `use-pedidos.ts` — ela inclui
  `vw_faturamento_mensal`, que não parece ligada e é.
- **Meça antes e depois, e diga o número.** Esta tela já teve regressão de 4ms para 31
  segundos.
