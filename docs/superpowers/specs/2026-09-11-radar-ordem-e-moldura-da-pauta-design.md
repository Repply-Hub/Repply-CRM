# Tela "Hoje" — o Radar com a ordem e a moldura da pauta

**Pedido do Lucas (10/09/2026), caminho escolhido em 11/09/2026:** a tabela dos negócios da equipe
que pedem atenção sobe para cima dos gráficos, e os blocos de baixo ganham o mesmo contraste da
pauta. Registrado na memória `radar-de-risco-ordem-e-contraste`.

## Por que a tela está assim (medido no código)

- No tema claro, **cartão e fundo são o mesmo branco** (`--card` e `--background` em `0 0% 100%`,
  `src/index.css`). O que separa um bloco do fundo é só a borda e a sombra.
- A **pauta** (`ItemPauta`, `src/pages/Hoje.tsx`) desenha cada item com `rounded-xl border
  border-border bg-card`: **borda com força total** e nenhuma sombra.
- Os **três cartões de risco, os dois gráficos e a tabela do time** usam o `Card`, cuja base traz a
  borda a 30% (`src/components/ui/card.tsx`), que o Radar sobe só para 60% (`border-border/60`),
  mais uma sombra de 3–4% de opacidade (`shadow-card`). No branco sobre branco, a borda some.
- Por dentro das duas tabelas, as linhas se separam por uma borda a 50%, o cabeçalho não tem faixa,
  e o nome do negócio tem o mesmo peso de tudo em volta.

## O desenho

### 1. A ordem

Em `src/components/pauta/RadarDeRisco.tsx`: **três cartões → tabela do time → os dois gráficos**. A
tabela sai do fim e entra logo depois da grade dos cartões; a grade dos gráficos vai para o fim. O
espaço entre os blocos continua igual ao de hoje (20 px).

### 2. A moldura dos seis blocos

Os três cartões de risco, o gráfico "Risco por vendedor", o "Resumo por fabricante" e a tabela do
time passam a ter **a mesma borda da pauta**:

- borda com força total (`border-border`), no lugar de 60%;
- **sem a sombra** fraca;
- **sem o efeito ao passar o mouse** (a sombra que cresce e a borda que fica laranja). Nenhum desses
  blocos é clicável como um todo, e o efeito prometia um clique que não existe. As **linhas** da
  tabela do time continuam reagindo ao mouse, porque elas são clicáveis.

O canto arredondado já é o mesmo da pauta (`rounded-xl`). A moldura fica escrita **num lugar só**,
para os seis blocos não voltarem a divergir um do outro.

### 3. Por dentro das duas tabelas

Vale para o "Resumo por fabricante" e para a tabela do time:

- **cabeçalho com faixa cinza clara** (`bg-muted`, o mesmo cinza do selo "Hoje" da pauta), com o
  mesmo texto pequeno em caixa alta de hoje;
- **separador das linhas com força total**, no lugar de 50%;
- **números mais fortes**: valor, dias sem mexer e quantidade ficam em peso semibold na cor do
  texto principal — já estão em fonte mono, que se mantém;
- na tabela do time, **o nome do negócio ganha peso** e a cor do texto principal: é o que se lê
  primeiro, como o título de cada item da pauta. Fabricante, etapa e responsável continuam em cinza.
- Um espaço lateral igual em todas as células, para a faixa do cabeçalho e as linhas se alinharem.

### 4. O gráfico "Risco por vendedor"

Os **nomes dos vendedores** no eixo passam do cinza secundário para a cor do texto principal: são o
que se lê primeiro no gráfico. A grade e o eixo de valores ficam como estão — são as mesmas
propriedades dos gráficos do Dashboard (`commonAxisProps` e `commonGridProps`, em
`src/components/charts/DashboardChartTooltip.tsx`), e mexer nelas mudaria aquela tela também.

## O que não muda

- A pauta, a barra de filtros, os textos, os dados e as cores da marca.
- O miolo dos três cartões de risco, que já tem hierarquia forte: número grande, selo colorido e
  ícone.
- A base do `Card` (`src/components/ui/card.tsx`): ela serve o sistema inteiro, e o projeto estende
  por classe, sem editar a primitiva (`CLAUDE.md` §5.4).
- No tema escuro vale a mesma troca. A borda de lá (`--border` 16% sobre cartão 10%) também fica
  mais visível com força total, e isso tem de ser conferido na tela.

## Como se prova

1. **Teste de ordem**: com o `RadarDeRisco` montado e os dados simulados, a tabela do time vem
   **antes** dos dois gráficos na ordem do documento. É o que impede a ordem de voltar sem ninguém
   notar.
2. **Na tela, antes e depois**, nos temas claro e escuro. A visão de vendedor (só o "Resumo por
   fabricante") dá para ver com o usuário de teste da empresa de demonstração. A visão de gestor (com
   "Risco por vendedor") precisa de uma conta gestora lá; **promover o usuário de teste é escrita em
   produção e pede o aval do Lucas antes**.
3. `tsc` não sobe, a suíte passa e o site compila.
4. 🔴 **O Lucas vê as capturas antes de publicar.** É mudança de aparência, e aqui quem decide é a
   opinião dele, não a medição.

## Fora do escopo

- Alinhar o cartão "Sem Próxima Ação" e a tabela do time à regra nova da tarefa vencida (decisão
  separada, anotada na migration `20260911090000`).
- Qualquer mudança nos gráficos do Dashboard.
