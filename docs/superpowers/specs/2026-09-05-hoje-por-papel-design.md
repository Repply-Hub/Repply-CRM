# A tela "Hoje" por papel: pauta ampliada, barra de filtros e painel

**Data:** 05/09/2026 · **Estado:** especificação aprovada, plano ainda não escrito

---

## 1. Por que este trabalho existe

A MD Representações mantém, fora do CRM, um **"Dashboard de oportunidades"** construído
internamente. Hoje a equipe atualiza o negócio lá e depois de novo no CRM. O objetivo deste
trabalho é fazer a tela "Hoje" cobrir o que aquele painel cobre — com a vantagem de já estar
ligada à aba de Negócios, então **uma atualização só**, pelo botão "Retomar depois" que já
existe.

### O que NÃO vamos copiar do dashboard da MD, e por quê

| No dashboard da MD | Decisão aqui |
|---|---|
| Agrupamento por "grupo de marca" (Elizabeth\|Eliane\|Decortiles, Dexco, Saint Gobain…) | **Fora.** Era limitação do Bitrix, que agrupava fabricantes na exportação. O CRM guarda marca individual, que é o modelo certo. Confirmado pelo dono do produto em 05/09/2026 |
| Abas de mês (Maio, Junho, Julho, Agosto) sobre "Data de Término" | **Fora.** O painel é a foto de agora. Ver §5.1 |
| Aba "Falta de Contato" | **Fora.** Era uma **etapa de perdido** do Bitrix (60 dias sem fechar e sem retorno), não uma categoria de risco do funil |

---

## 2. Decisões do dono do produto (04–05/09/2026 — não reabrir)

1. **Fila curta em cima, painel embaixo.** A pauta do dia continua sendo uma fila que zera. O
   bloco "No geral" do rodapé vira o painel com filtros. Uma tela, dois ritmos.
2. **Uma chave de permissão por pessoa:** "vê a pauta e os números de todo mundo" × "só os
   próprios". O padrão vem do papel — vendedor vê os próprios, gestor vê todos —, e o gestor
   pode mudar pessoa a pessoa.
3. **Filtro por fabricante individual.** Sem grupo de marca.
4. **Sem filtro de período.**
5. **Uma verdade só.** Qualquer alteração feita por qualquer uma das partes vale para todos.
   Quando o gestor adia um negócio de um vendedor, **sai da pauta dos dois** e o vendedor
   **recebe um aviso** dizendo quem adiou e até quando.
6. **O cartão "Sem Próxima Ação" passa a contar retorno marcado**, não só tarefa aberta.
7. **A fila do gestor traz os negócios da empresa**, mesmo repetindo o que os donos já veem —
   decisão tomada com a medição da §3.2 na mesa.
8. **Quem tem a chave age**, não só vê: pode adiar negócio de colega.
9. **O preset "Total" concede a chave.**
10. **O filtro por etapa entra**, mesmo recortando pouco na MD hoje.

**Fora de escopo, registrado para o futuro:** campo **motivo de perdido**, que aparece ao marcar
um negócio como perdido, para depois filtrar os perdidos por motivo — sendo "falta de contato
com o cliente" um dos motivos. É o que substitui, no nosso modelo, a etapa que o Bitrix tinha.

---

## 3. O que foi medido em produção antes de desenhar

Tudo abaixo é medição real na MD Representações, feita em 04–05/09/2026.

### 3.1 Tamanho

| | |
|---|---|
| Negócios abertos | **146** |
| Pessoas com negócio aberto no nome | 7 |
| Fabricantes com negócio aberto | 21 (27 ativos) |
| Funis | 1, com 6 colunas |
| Distribuição por etapa | Negociação **136** · Orçamento Enviado 9 · Novo Lead 1 |

### 3.2 🔴 A fila ampliada do gestor repete o que os donos já veem

Simulação da regra atual aplicada à empresa inteira:

- 128 dos 146 abertos se qualificam como "parados";
- o "há quantos dias" tem **apenas 2 valores distintos** entre eles — esse critério não separa
  ninguém hoje, então **quem manda no ranking é o valor**;
- a pauta do gestor seria os 7 maiores negócios da empresa, de 4 pessoas;
- **7 de 7 já estão na pauta dos próprios donos.**

Parte disso é temporária: os "2 valores distintos" vêm de a migração do Bitrix ter carimbado
histórico em todos os negócios em 01/09, e se corrige sozinho. A sobreposição, porém, é
estrutural — os maiores da empresa são os maiores de alguém, e cada dono tem 7 vagas.

**O dono do produto viu esta medição e manteve a decisão.** Fica registrada para que, se a fila
do gestor parecer redundante em uso, ninguém precise redescobrir o motivo.

### 3.3 🔴 Dois dos três cartões do painel estão degenerados

| Cartão | Mostra hoje na MD | Por quê |
|---|---|---|
| Negócios Parados | **0** | 126 dos 146 têm "última atividade" em 01/09 — o carimbo da migração. **Cura-se sozinho** |
| Sem Próxima Ação | **146 de 146** | Significa "não existe tarefa aberta ligada ao negócio", e **nenhum negócio da MD tem tarefa**. **Não se cura** |
| Valor em Risco | R$ 9,5 mi | É a carteira aberta inteira, por consequência dos dois acima |

### 3.4 O que o banco permite e proíbe hoje

| Fato conferido | Consequência para o desenho |
|---|---|
| `pedidos_select` = `usuario_id IN (usuarios_da_minha_empresa())` | **Qualquer pessoa da empresa já lê qualquer negócio dela.** O "só vejo os meus" da pauta é escolha de produto, não tranca |
| `pauta_do_dia_de(uuid)` está **revogada de `authenticated`** | O navegador não pode chamá-la. A porta é `pauta_do_dia()`, e é ela que decide o alcance |
| `historico_contatos_insert` aceita `p.usuario_id = get_my_usuario_id() OR (is_gestor() AND usuario_in_my_empresa(...))` | Gestor já pode adiar negócio alheio; **vendedor com a chave, não** — precisa afrouxar (§6.3) |
| `notificacoes_insert` exige `is_gestor() AND usuario_in_my_empresa(...)` | O aviso **não pode sair do navegador** de quem não é gestor (§6.4) |
| `notificacoes_select` deixa gestor ver as de toda a empresa | O aviso criado para o vendedor **aparece no sino de todos os gestores** se nada for feito (§6.4) |
| `has_permission` e `has_funcionalidade` respondem "pode" para gestor **sem olhar a linha** | Não dá para restringir um gestor por elas. A pauta lê a configuração direto (§6.1) |
| `dashboard_negocios_risco` já aceita `p_usuario_ids`, `p_fabricante_ids`, `p_funil_id`, `p_dias_parado` | Metade da barra de filtros já existe no servidor. Falta **etapa** |
| O e-mail das 7h está **ligado** na MD, seg–sex (`pauta_resumo_email = true`) | Ampliar a pauta muda o e-mail do gestor sozinho, no primeiro dia útil (§6.5) |

---

## 4. Etapa 1 — O bug do "Abrir negócio"

**Independente do resto. Vai primeiro e sozinho.**

### 4.1 A causa

`Hoje.tsx` navega para `/app?negocio=<id>`. A rota `/app` renderiza `<Negocios
defaultView="pipeline">`, que **lê o parâmetro** (`searchParams.get('negocio')`) e abre o painel
lateral. O parâmetro não é ignorado — a hipótese óbvia está errada.

O defeito está no conteúdo: `selectedViewOrder` procura o negócio **só entre as linhas já
carregadas na tela**, e nunca busca por identificador. O que está carregado é estreito por quatro
motivos independentes: período padrão = **mês atual**, funil vindo do armazenamento local, teto de
**50 por coluna** no Kanban, e o termo de busca guardado. A pauta, de propósito, escolhe o
**oposto** — o mais parado primeiro. Quando não acha, o corpo do painel cai num girador **sem
tempo limite, sem texto e sem erro**.

Por isso o bug parece intermitente: negócio criado neste mês, no funil salvo, abre normalmente.

### 4.2 O conserto

1. **`usePedidoPorId(id)`** em `src/hooks/use-pedidos.ts`, reaproveitando `montarSelectDeNegocios()`
   — é o que garante o registro completo, **inclusive `marcador`**, que o painel usa e que
   `usePedidoCompleto` não traz. Molde de forma (não de conteúdo): `usePedidoOptionPorId`, que já
   existe para exatamente esta classe de problema.
2. Encadear como **último** recurso no `useMemo` do painel, com `enabled` ligado só quando há
   identificador e a busca local falhou. **Local primeiro, buscado depois** — senão, depois de
   arrastar um card no Kanban, o painel mostraria o estado velho.
3. **Três estados no corpo do painel**, não dois: carregando, encontrado e **"Este negócio não
   está mais disponível"** com o botão Fechar. Sem o terceiro, negócio apagado ou de outra empresa
   continua girando para sempre.

### 4.3 Dois defeitos vizinhos, consertados junto

- **O botão "Fechar" não limpa `?negocio=` do endereço.** Recarregar reabre o negócio que a pessoa
  fechou, e o link copiado da barra manda outra pessoa para lá. Conserto: uma função
  `fecharPainel()` que zera o estado **e** limpa o parâmetro, usada nos três pontos de saída.
- **"Excluir" fica clicável enquanto o painel está vazio.** Dá para apagar, direto da pauta, um
  negócio cujo painel nunca mostrou uma linha. Conserto: esconder Editar e Excluir enquanto não
  houver dado, e pôr o nome do negócio no título da confirmação.

### 4.4 Testes

Dois testes puros, sem renderizar tela:

1. **Contrato do select** — afirmar que o texto de `montarSelectDeNegocios()` contém cada campo que
   o painel lê, com `marcador` na lista explícita e um comentário dizendo por que está ali.
2. **Guarda de fonte**, no molde de `uma-leitura-de-planilha-so.test.ts` — ler `Negocios.tsx` e
   falhar se o painel voltar a depender só da varredura local.

Sem isso, o conserto some do mesmo jeito que o das datas do Bitrix sumiu (CLAUDE.md §7.14).

---

## 5. Etapa 2 — A barra de filtros e o painel

**Afeta só esta tela.** Não mexe em e-mail nem em regra de banco de escrita.

### 5.1 A barra

Três filtros, combináveis: **etapa** do funil, **fabricante** (vários), e **responsável** — este
último só para quem tem a chave da §6.

**Sem período, e isso é deliberado.** Um negócio aberto criado há meses continua sendo risco hoje;
recortar por data esconderia justamente os mais antigos parados, que são os que mais importa achar.
Na MD os abertos mais antigos são de **2022**.

**O estado dos filtros vive no endereço da página**, não no armazenamento local: sobrevive ao
recarregar, dá para mandar por link ("olha esses três fabricantes") e não fica preso a um
navegador. O precedente de filtro em armazenamento local existe na tela de Negócios e é
justamente a origem de um dos quatro motivos do bug da §4.1.

### 5.2 O filtro de etapa no servidor

`dashboard_negocios_risco` ganha `p_etapas text[]`, comparado contra `pedidos.status`, que já é o
**slug** da coluna. Comparar texto com texto evita juntar `kanban_colunas` só por causa de um
filtro opcional — a armadilha do CLAUDE.md §7.16, que já custou 11 segundos numa função de
agregação. Array vazio vira `null` antes de sair do navegador (§7.8).

### 5.3 O cartão "Sem Próxima Ação"

Passa a ser: **sem tarefa aberta E sem retorno marcado para o futuro**. O retorno vem de
`historico_contatos.proximo_contato_em`, que é o que o botão "Retomar depois" grava.

Assim o cartão vira o placar do hábito que se quer criar: começa em 146 e cai a cada botão
apertado. Hoje ele mede um hábito que a equipe não tem.

🔴 **Cuidado de fuso:** `proximo_contato_em` é data, e comparar com `now()` cru trata meia-noite
UTC como 21h do dia anterior em Natal — um negócio adiado para hoje apareceria como "sem próxima
ação" até as 21h. A comparação usa `(now() at time zone 'America/Sao_Paulo')::date`, como a
`pauta_do_dia_de` já faz.

**O cartão precisa dizer que mudou de definição** na primeira semana — um número que cai de 146
para 90 sem explicação parece defeito.

### 5.4 O que entra de novo no painel

O conjunto mínimo que entrega valor, sem inchar:

- **Quantidade ao lado do valor** em cada cartão e em cada linha das tabelas. Hoje há valor sem
  contagem em vários pontos, e "R$ 1,3 mi" sem "18 negócios" não diz se é um problema grande ou um
  negócio grande.
- **Resumo por fabricante**: quantidade e valor, ordenado por valor. É a tabela que o pessoal da MD
  mais olha.
- **Os 10 maiores parados**: negócio, fabricante, valor, dias parado, responsável. É a única parte
  do dashboard da MD que **gera ação direta** — dá para sair clicando.

Ficam de fora, por ora: exportar CSV e os gráficos por responsável em barra (já existe um).

### 5.5 A lista nominal por responsável

`dashboard_negocios_risco` já decide **no servidor**: devolve a lista nominal por vendedor quando
`is_gestor()`, e um array vazio para os demais. Esta tela **não** tem o defeito do item 60 da
dívida técnica — aquele é do Dashboard, onde o corte é feito no navegador e a lista nominal chega
inteira a qualquer vendedor.

A única mudança aqui: o portão passa de **papel** para **a chave**, para acompanhar a decisão 2.
A decisão continua no servidor. O item 60 segue aberto, na outra tela, e não é tocado por este
trabalho.

---

## 6. Etapa 3 — A permissão e a pauta ampliada

**A que mexe fora da tela.** Vai por último.

### 6.1 Onde a chave mora

Uma **funcionalidade** chamada `pauta_de_todos`, dentro do módulo `pedidos`, com rótulo dizendo
"Ver a pauta e os números de toda a equipe (tela Hoje)".

**Por que funcionalidade e não módulo novo:** um módulo `hoje` faria o catálogo do navegador ter 15
entradas e o do banco 14. Aplicar qualquer preset grava como "não pode ver" todo módulo que falte
no preset — foi exatamente assim que, entre 24 e 31/08/2026, o preset "Total" passou a **tirar** o
Plano de Vendas de quem o recebia. Como funcionalidade, o erro equivalente fecha para o lado
seguro: a pessoa perde o acesso, não ganha.

**Como o padrão por papel é expresso:** por **ausência de configuração**, não por linha gravada em
cada pessoa. Sem nada configurado, vendedor vê os próprios e gestor vê todos. Assim ninguém precisa
de um passo de migração por usuário, e o gestor só grava quando quiser divergir do padrão.

🔴 **A verificação não pode usar `has_funcionalidade`.** Ela responde "pode" para gestor, admin e
empresa **sem olhar a linha** — com ela, um gestor nunca poderia ser restringido, e a decisão 2 diz
que o gestor gerencia pessoa a pessoa. A pauta lê a configuração direto, com o papel entrando só
como padrão na ausência dela.

### 6.2 Os quatro pontos de encaixe que não podem ser esquecidos

1. 🔴 **Consertar o casamento seção→módulo ANTES.** Hoje a tela de permissões procura a qual seção
   cada módulo pertence com uma busca que devolve a **primeira** seção que cita o módulo. Para
   `pedidos`, isso encontra "Hoje" antes de "Negócios" — e como "Hoje" está desligada nas 7 empresas
   fora da MD, **o módulo Negócios inteiro é filtrado para fora da matriz de permissões dessas
   empresas**. É bug vivo hoje, independente deste trabalho, e a chave nova nasceria invisível
   junto. Conserto: preferir a seção **não desligável** quando mais de uma cita o módulo, numa
   função em `src/lib/secoes.ts` usada pelos dois componentes, com teste fixando que `pedidos`
   resolve para `pipeline`.
2. 🔴 **A tela de permissões por pessoa não mostra funcionalidade nenhuma** — só as quatro caixas
   de ver/criar/editar/excluir. Funcionalidade fina só existe no editor de **presets**. Sem um
   interruptor na tela por pessoa, a chave nasce inalcançável, como aconteceu com
   `ver_metas_vendedor`. Entra junto: um interruptor na linha do módulo Negócios.
3. 🔴 **Reemitir `montar_permissoes_preset_padrao()`** com a chave na lista de `pedidos`, partindo
   do texto vigente em produção. Por decisão 9, ela **entra** nos ramos `total` e `operacional` —
   ao contrário de `ver_metas_vendedor`, que fica de fora.
4. **Backfill:** reescrever a função não alcança os presets já gravados nas 8 empresas. A mesma
   migration precisa atualizar as linhas existentes de `origem = 'padrao'`, no molde cirúrgico que
   a `20260831200000` usou para o Plano de Vendas.

### 6.3 Quem pode adiar

Por decisão 8, **quem tem a chave age**. A regra de `historico_contatos_insert` passa a aceitar
também quem tem a chave, além de quem é dono e de quem é gestor. Sem isso, um vendedor com a chave
veria a pauta dos colegas e o botão falharia — pior que não ter o botão.

### 6.4 O aviso ao vendedor

O aviso **é criado no servidor**, por função com privilégio, não pelo navegador: a regra de
`notificacoes` exige ser gestor para inserir, e a chave é permissão, não papel.

Dois cuidados:

- **`notificacoes.usuario_id` é `usuarios.id`, não o identificador de login** (CLAUDE.md §4.5).
  Errar não dá erro: grava zero linhas.
- O aviso é para o **dono do negócio**. Como a regra de leitura deixa gestor ver as notificações de
  toda a empresa, o texto precisa deixar claro de quem é — senão cai no sino dos 5 gestores da MD
  como se fosse deles.

**Sobre criar mais uma notificação:** o próprio código da tela "Hoje" registra que 33 das 36
notificações do sistema nunca foram clicadas. Esta é diferente por construção — ela avisa de uma
mudança que **alguém fez no trabalho da pessoa**, e leva direto ao negócio. Se em duas semanas ela
também não for clicada, o certo é remover, não insistir.

### 6.5 A pauta ampliada, e o e-mail

`pauta_do_dia()` continua sendo a única porta do navegador. Ela passa a decidir o alcance: sem a
chave, os próprios; com a chave, os da empresa.

**O retorno ganha uma coluna `responsavel`**, para a tela mostrar de quem é cada item.

🔴 **Acrescentar coluna ao retorno obriga a apagar e recriar a função — e isso apaga a revogação
de `authenticated` que existe hoje**, devolvendo a pauta dos colegas a qualquer pessoa logada. A
migration precisa **reemitir a revogação no mesmo arquivo**. Se esquecer, o vazamento é silencioso.

**Os compromissos continuam pessoais.** Agenda e tarefa do gestor são dele; só os negócios se
ampliam. E eles continuam consumindo vaga no teto de 7.

**O e-mail das 7h muda junto** — é a mesma função, e está ligado na MD de segunda a sexta. O e-mail
do gestor passa a trazer negócios de outras pessoas, e precisa dizer de quem. **Avisar a equipe
antes de publicar**, no dia anterior.

---

## 7. Como verificar

**Antes de qualquer coisa:** `git fetch` e conferir se a outra sessão ou o Gabriel commitaram —
aconteceu durante esta investigação.

**Etapa 1.** Logado como vendedor comum (não como gestor, CLAUDE.md §9): abrir "Hoje", clicar em
"Abrir negócio" no item mais antigo da pauta e ver a ficha carregar. Fechar pelo botão do rodapé e
conferir que o endereço volta a `/app`. Recarregar e conferir que o painel **não** reabre.

**Etapa 2.** Marcar dois fabricantes e conferir que os três cartões e as duas tabelas mudam juntos.
Copiar o endereço, abrir em outra aba e conferir que os filtros vieram. Medir a consulta **como
usuário logado**, com `statement_timeout` de 8s (§7.15) — pelo painel do Supabase mede-se outra
coisa.

**Etapa 3.** Com a chave desligada, o vendedor vê só os próprios na fila e não vê o filtro de
responsável. Ligada, vê os dos colegas com o nome do dono. Adiar um negócio de colega e conferir
três coisas: sai da fila dos dois, o dono recebe o aviso, e o aviso **não** aparece como se fosse
dos outros gestores. Conferir no banco que a revogação de `pauta_do_dia_de` continua no lugar.

**Sempre:** `npx tsc --noEmit -p tsconfig.app.json` (com o `-p`), `npx vitest run`, `npx vite build`.

---

## 8. Riscos aceitos

1. **A fila do gestor repete o que os donos veem** (§3.2). Decisão consciente.
2. **O filtro de etapa recorta pouco na MD hoje** — 136 dos 146 numa coluna só. Construído para as
   outras empresas e para quando o funil amadurecer.
3. **O preset "Total" passa a conceder a visão da equipe** (decisão 9). Um clique em lote abre os
   números nominais dos colegas; é o comportamento pedido.
4. **7 das 8 empresas não têm a seção "Hoje" ligada.** Nada aqui deve aparecer para elas — exceto o
   conserto do §6.2.1, que **devolve** a elas o módulo Negócios na tela de permissões.
5. **Ampliar uma função com privilégio é decisão de segurança.** `pedidos` não tem coluna de
   empresa; o recorte passa por `usuarios`. Errar a família de identificador não dá erro, dá zero
   linhas — ou, no pior caso, vaza entre empresas.
