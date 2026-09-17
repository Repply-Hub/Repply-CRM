# "Pede atenção" respeita o que já foi agendado — desenho

**Data:** 2026-09-16 (refinado 17/09)
**Autor:** Lucas (dono do produto) + Claude
**Escopo:** só o banco (duas funções de contagem do "risco"). Sem mudança de tela.

## Problema

A tela "Hoje" tem dois lugares que contam negócio "em risco":

- a **pauta** de cima (`pauta_do_dia_de`), enxuta e curada;
- o painel **"No geral"** e a **tabela do time** de baixo (`dashboard_negocios_risco` e
  `negocios_em_risco_de`), com os cartões "Negócios Parados", "Sem Próxima Ação", "Valor em Risco",
  os gráficos por vendedor/fabricante e a tabela paginada.

A pauta já é esperta: enquanto um negócio tem **próxima ação** — um "Retomar depois" agendado para
frente, ou uma tarefa **com prazo ainda não vencido** — ele sai da pauta até a data chegar. O
"No geral" **não** faz isso, por dois motivos:

1. **O "parado" entra sozinho.** Um negócio conta em "pede atenção" se está `parado` (sem mudança
   de etapa há ≥ `p_dias_parado` dias) **OU** `sem_proxima_acao`. O ramo `parado` não olha se já
   existe próxima ação, então negócio já adiado ("Retomar depois") continua contando.
2. **Qualquer tarefa aberta conta como ação, até a vencida.** O `sem_proxima_acao` das funções de
   risco considera "tem ação" qualquer tarefa aberta, mesmo que o prazo dela já tenha passado.

Resultado: a pauta encolhe, o "No geral" quase não se mexe — foi o que o dono do produto percebeu.

Definição atual de `sem_proxima_acao` (idêntica nas duas funções):

```
sem_proxima_acao = NÃO existe tarefa aberta (status <> 'concluida')
                   E NÃO existe historico_contatos com proximo_contato_em >= hoje
```

## Decisão

**"Pede atenção" passa a significar "sem próxima ação", e "próxima ação" passa a olhar o prazo.**

- **Tem próxima ação** = um "Retomar depois" agendado para frente (`proximo_contato_em >= hoje`)
  **ou** uma tarefa aberta **com prazo ainda não vencido** (`prazo_final >= hoje`). Tarefa
  **vencida** (prazo já passou) ou **sem prazo** não conta como próxima ação — o negócio volta a
  pedir atenção. É a régua da pauta: o que segura o negócio é a **data**, não a mera existência de
  uma tarefa.
- **Pede atenção** = sem próxima ação. O ramo `parado` deixa de ser motivo por si só.
- O cartão **"Negócios Parados"** também deixa de contar os já agendados: passa a mostrar os
  negócios que estão parados **e** sem próxima ação — o subconjunto mais urgente.

Quando a data marcada chega (ou a tarefa vence) sem ninguém ter mexido, o negócio **volta** sozinho
ao "No geral" — do mesmo jeito que já volta à pauta.

## O que muda, função por função

A CTE `abertos` e as flags `parado`/`parado_desde` continuam iguais (o `parado` ainda alimenta a
coluna "dias parado" e o subconjunto do cartão). Muda a definição de `sem_proxima_acao` e os
`WHERE`/`count`/`sum`.

### `sem_proxima_acao` (nas DUAS funções, idêntico)

Acrescenta a condição de prazo na checagem da tarefa:

```
sem_proxima_acao =
  NÃO existe tarefa t (t.pedido_id = a.id
                       AND t.status <> 'concluida'
                       AND t.prazo_final IS NOT NULL
                       AND (t.prazo_final AT TIME ZONE 'America/Sao_Paulo')::date >= hoje)
  E
  NÃO existe historico_contatos hc (hc.pedido_id = a.id AND hc.proximo_contato_em >= hoje)
```

### `dashboard_negocios_risco` (os cartões e gráficos)

| Saída | Antes | Depois |
|---|---|---|
| `qtd_parados` / `valor_parados` | `WHERE parado` | `WHERE parado AND sem_proxima_acao` |
| `qtd_sem_proxima_acao` / `valor_sem_proxima_acao` | `WHERE sem_proxima_acao` | (igual, já com a nova definição) |
| `valor_risco_total` | `WHERE parado OR sem_proxima_acao` | `WHERE sem_proxima_acao` |
| `risco_por_vendedor` / `risco_por_fabricante` | filtro `parado OR sem_proxima_acao` | filtro `sem_proxima_acao` |

### `negocios_em_risco_de` (a tabela do time; o aviso da pauta vazia lê o total dela)

CTE `meus`: `WHERE (parado OR sem_proxima_acao) AND (...)` → `WHERE sem_proxima_acao AND (...)`.

O invólucro `negocios_em_risco` só repassa — não muda.

## O que NÃO muda

- **Nenhuma tela.** Os campos que as funções devolvem são os mesmos; só os números ficam certos.
  O aviso da pauta vazia lê o total da tabela, então se ajusta sozinho.
- **A pauta** (`pauta_do_dia_de`) — já está certa.
- **A coluna `proximo_contato_em`** continua gravada (é ela que devolve o negócio na data).

## Nota sobre "tarefa sem prazo"

A régua acima **não** conta uma tarefa sem prazo como próxima ação (não há data para vencer). A
pauta, hoje, conta (a cláusula dela é `prazo_final IS NULL OR ... >= hoje`). É uma diferença de 0
negócio na empresa-âncora (medido: nenhuma tarefa aberta sem prazo) e coerente com o princípio "o
que importa é a data". Se algum dia incomodar, alinhar a pauta é um ajuste de uma linha — fora de
escopo aqui.

## Fora de escopo (registrado para não se perder)

- A **tabela nova de "agendados / retomar depois" + engajamento do gestor** — projeto à parte, a
  ser desenhado depois (decisão do dono do produto: primeiro a conta, depois a tabela).

## Verificação

- **Ensaio em produção** (memória `ensaio-de-migration-em-producao`): aplicar as duas funções numa
  transação que termina em `RAISE` (desfaz tudo), medindo antes/depois na empresa-âncora:
  - negócio com "Retomar depois" agendado (ou tarefa com prazo futuro) **some** de "pede atenção";
  - negócio com tarefa **vencida** **volta** a contar;
  - o total cai para o número de "sem próxima ação".
- **Papel `authenticated` de verdade** no ensaio, para provar que `eu_vejo_pauta_de_todos()` e a
  RLS seguem valendo.
- **ACLs:** `CREATE OR REPLACE` com a **mesma assinatura** preserva as concessões — sem `DROP`.
  Conferir depois que `dashboard_negocios_risco` segue aberta a `authenticated` e
  `negocios_em_risco_de` segue fechada (só `service_role`).
- **Bateria de testes** do front continua passando (nada muda lá).
