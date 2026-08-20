# Plano de reparo — datas trocadas na base da MD

**Situação:** a importação da base do Bitrix24 gravou datas com dia e mês trocados. O
código que causava isso foi corrigido em `446779ff`, mas **o que já está gravado continua
errado**.

**Estado deste plano:** proposto, **não executado**. Nada foi alterado no banco.
Levantado em 19/08/2026.

> ⚠️ **Nenhum passo deste documento pode ser executado sem autorização explícita do dono
> do produto.** Ele mexe em 11.903 registros de produção de um sistema em uso diário.

---

## 1. O que já está provado

Com evidência medida, não suposição:

| Fato | Como foi verificado |
|---|---|
| O conversor errava **26,7%** das datas | 26.181 datas dos 8 arquivos reais, conferidas contra o número de série da célula |
| Nenhuma linha era rejeitada — o erro é **silencioso** | Zero `undefined` nas 26.181 conversões |
| O erro está gravado em produção | *Estruturar Soluções Técnicas \| Quartzolit*: planilha `8/12/26` (12 de agosto) → banco `2026-12-08` (8 de dezembro) |
| A base da MD veio quase toda de importação | 11.903 de 11.905 negócios têm `import_hash` |
| **A impressão digital é única por linha** | 11.903 negócios, **11.903 `import_hash` distintos**, zero nulos |
| A troca produz datas plausíveis nos **dois sentidos** | `2026-08-12` no banco pode ser 12/08 correto ou 08/12 trocado. Olhar a data isolada não distingue — ver §4-bis |

## 2. A consequência que define o método

**A regra genérica não serve, e agora se sabe exatamente por quê.**

A tentação é: *"onde o dia for 12 ou menos, troca dia por mês"*. Medida contra o banco real,
ela derruba a distorção de setembro–dezembro de 180 negócios para 26 — resolve o grosso e
**estraga os ~15% que já estão corretos** (§4-bis).

Corretos porque escaparam do bug: os negócios criados **antes das 10h** foram convertidos
por outro caminho no código e saíram certos. E **a hora não existe mais no banco** — o
`created_at` foi gravado ao meio-dia, descartando o horário.

Ou seja: olhando só o banco, é impossível separar quem precisa de conserto de quem não
precisa. **O reparo tem que cruzar com a planilha**, linha a linha.

---

## 3. Como o `import_hash` resolve

Ao importar, o sistema calculou uma impressão digital (SHA-256) de cada linha, sobre o
conteúdo já convertido — **incluindo a data errada**. Ela está gravada em
`pedidos.import_hash`.

Isso permite o seguinte:

```
planilha original
      │
      ├─► rodar o conversor ANTIGO (com o bug)  ──►  impressão digital
      │                                                     │
      │                                                     ▼
      │                                          casa com pedidos.import_hash
      │                                                     │
      └─► rodar o conversor NOVO (correto)  ──►  data certa ─┘
                                                             │
                                                             ▼
                                              atualiza aquela linha exata
```

Cada linha da planilha encontra **uma e só uma** linha no banco. Sem adivinhação, sem
casamento por nome, sem risco de trocar um negócio por outro.

---

## 4. O que ainda precisa ser provado antes de executar

Três itens em aberto. **Enquanto qualquer um deles não fechar, o reparo não roda.**

### 4.1 Reproduzir a impressão digital

A digital é calculada sobre a linha já mapeada, com estes campos em ordem fixa:

```
negocio · cliente · contato · obra · fabricante · valor · vendedor
observacoes · status · data_pedido · prazo_resposta · campos_extras
```

Para recalcular é preciso saber **qual coluna da planilha foi ligada a qual campo** na
tela de importação. Esse mapeamento fica salvo no navegador de quem importou, não no
banco.

**Como resolver sem depender de memória:** o método se autovalida. Testa-se um mapeamento
candidato, calculam-se as 11.915 digitais e conta-se quantas batem com as do banco.

| Resultado | Leitura |
|---|---|
| ~11.903 batem | Mapeamento correto. **Segue.** |
| Poucas batem | Mapeamento errado. Tenta outro. |
| Nenhuma bate | O método não serve; usar o plano alternativo (§8) |

É tudo leitura — não altera nada.

### 4.2 Descobrir quais colunas de data foram afetadas

Já se sabe que a importação preencheu **quatro** colunas com data:

| Coluna | Situação |
|---|---|
| Coluna no banco | Veio de | Regra do erro | Confirmado? |
|---|---|---|---|
| `data_pedido` | **"Criado"** (tem hora) | Trocado se hora ≥ 10h **e** dia ≤ 12 | ✅ 15/15 datas, 100% |
| `created_at` | **"Criado"** | Mesma regra. Gravado ao meio-dia — **a hora original foi descartada** | ✅ 14/14 na amostra |
| `prazo_resposta` | **"Data de fechamento"** (sem hora) | Trocado se dia ≤ 12 | ✅ distribuição bate |
| `fechado_em` | a confirmar | — | ❌ |

> ⚠️ **Achado de produto, não de dado:** a **data de fechamento** do Bitrix está guardada
> num campo chamado **`prazo_resposta`** ("prazo de resposta"). São conceitos diferentes com
> nomes trocados. Quando a MD filtra por data de fechamento na tela, vale conferir por qual
> campo o filtro realmente busca — pode não ser o que a pessoa imagina, independentemente
> do problema das datas trocadas.

### 4.3 Separar o que foi editado à mão depois

Alguém pode ter corrigido uma data manualmente no sistema desde a importação. Reparar essa
linha desfaria a correção da pessoa.

**Regra de segurança, obrigatória:** só atualizar a linha se o valor **atual** no banco for
exatamente igual ao valor que o bug teria produzido. Se estiver diferente, alguém mexeu —
**não toca, e registra numa lista para conferência humana.**

---

## 4-bis. Resultado do passo 1, executado em 19/08/2026

O passo de leitura foi executado. **Nada foi escrito no banco.** Resumo do que ficou
provado e do que travou.

### ✅ Provado

**`created_at` carrega o mesmo erro.** De 30 negócios testados, 14 casaram por
nome + valor + data de fechamento — e **os 14 casaram também no `created_at`**. Confirma
que essa coluna veio da planilha com a mesma troca, e que ela **não é** a hora em que a
linha entrou no sistema.

**Desfazer a troca corrige a maior parte da distorção.** Aplicando a regra "onde o dia for
≤ 12, troca dia por mês" sobre o que está no banco:

| Mês de 2026 | Verdade (planilha) | Banco hoje | Após desfazer |
|---|---|---|---|
| set | 4 | 39 | 5 |
| out | 1 | 49 | 11 |
| nov | 1 | 40 | 1 |
| dez | 0 | 52 | 9 |

A cauda de setembro a dezembro cai de **180 para 26**, contra uma verdade de **6**.

### ❌ Correção de uma conclusão anterior

Em análise anterior eu afirmei que "5 negócios estavam com a data correta no banco",
concluindo que a corrupção não era uniforme. **Estava errado.** Foi artefato de uma
consulta que cruzava por nome de negócio, e os nomes se repetem dezenas de vezes.

Um negócio gravado como `2026-08-12` não é um acerto: é um negócio de **8 de dezembro**
que também foi trocado. A troca produz datas plausíveis nos dois sentidos, e por isso
olhar a data isolada não distingue certo de errado.

### ✅ O modelo exato da corrupção — confirmado 100%

Duas correções importantes ao que este plano dizia antes:

**A importação foi feita em 18 e 19/08/2026, não em junho/julho.** Todos os 11.903 negócios
têm `updated_at` em 18/08 (11.796) ou 19/08 (107) — e 107 é exatamente o número de linhas do
arquivo `Negociações Agosto 2026.xlsx`. **As planilhas da pasta são as que foram
importadas.**

**`data_pedido` veio da coluna "Criado", não de "Data de fechamento".** Confirmado
comparando a distribuição das duas colunas contra o banco.

E isso revela o mecanismo completo, porque a coluna "Criado" **tem hora**:

| Situação da linha na planilha | O que aconteceu na importação |
|---|---|
| Criado **antes das 10h** | ✅ **Correto no banco** — escapou do bug |
| Criado **às 10h ou depois**, dia ≤ 12 | ❌ **Dia e mês trocados** |
| Criado **às 10h ou depois**, dia > 12 | ✅ Correto |

**Por que a hora decide:** a conversão reconhece hora com dois dígitos. Com hora de um
dígito (`8:42`), o padrão não casa, o código cai num caminho alternativo que lê o texto
como americano — e acerta por acidente.

**Validação:** o modelo aplicado ao arquivo de agosto reproduz **15 de 15** datas distintas
do banco, com as quantidades exatas. Zero divergência.

No arquivo de agosto, **16 de 107 negócios (15%) foram criados antes das 10h** e estão
corretos. São exatamente esses que uma regra genérica estragaria.

### 🔴 Por que o reparo não pode sair do banco sozinho

**A hora não existe mais no banco.** O `created_at` foi gravado sempre ao meio-dia,
descartando o horário original. Olhando só o banco, é impossível saber quem escapou do bug
e quem não.

**Só a planilha sabe.** Por isso o reparo depende dela — e por isso a regra genérica
("troca onde o dia for ≤ 12") deixava resíduo: ela não tem como distinguir os 15% que já
estão certos.

### Consequência para a chave de casamento

O teste anterior casou só 14 de 30 porque usava a coluna errada (`Data de fechamento`).
Com a coluna certa, a chave (nome + valor + data convertida pelo modelo) precisa ser
retestada — e a expectativa agora é de casamento alto.

---

## 5. O passo a passo proposto

### Passo 0 — Cópia de segurança *(obrigatório, antes de tudo)*

```sql
create table public.backup_datas_20260819 as
select id, import_hash, data_pedido, prazo_resposta, created_at, fechado_em
from public.pedidos
where import_hash is not null;
```

É a volta atrás. Sem isso, o reparo não começa.

### Passo 1 — Levantar as correções *(só leitura)*

Roda o cruzamento descrito em §3 e produz uma tabela:

```
import_hash · data_atual · data_correta · vai_mudar?
```

**Entregável:** um relatório com quantas linhas mudam, quantas já estão certas, quantas
não casaram e quantas foram editadas à mão. Você aprova esse relatório antes do passo 2.

### Passo 2 — Aplicar *(a única etapa que escreve)*

- Em transação, em lotes
- Só nas linhas em que o valor atual bate com o valor do bug
- Uma coluna por vez, começando por `data_pedido`

### Passo 3 — Conferir

| Conferência | Critério de aprovação |
|---|---|
| Contagem de linhas alteradas | Igual ao previsto no relatório do passo 1 |
| Distribuição por mês × planilha | Tem que **bater exatamente** |
| Negócios fechando de set a dez/2026 | Cai de ~180 para **6** (o que a planilha diz) |
| Casos conhecidos | *Estruturar Soluções Técnicas* volta para 12/08/2026 |
| Total de negócios | Continua 11.905. **Nenhuma linha some** |

### Passo 4 — Descarte da cópia

A tabela de backup só é apagada depois de a MD confirmar, no uso real, que os números
fazem sentido. Sugestão: manter por 30 dias.

---

## 6. O que este plano NÃO faz

- **Não apaga nem recria negócio nenhum.** Só atualiza colunas de data.
- **Não mexe em cliente, contato, obra, fabricante, valor ou etapa do funil.**
- **Não mexe na empresa "MD" duplicada** — ver §7.
- **Não reimporta nada.** Reimportar perderia edições manuais, vínculos e mudanças de
  etapa feitas desde junho.

---

## 7. Decisão separada: a empresa "MD" duplicada

Durante o levantamento apareceu uma segunda empresa no banco:

| Empresa | Criada | Usuários | Negócios | Período |
|---|---|---|---|---|
| **MD** | 25/06/2026 **16:49** | 2 | **6.374** | jun/2022 a dez/2023 |
| **MD Representações** | 25/06/2026 **17:38** | 13 | 11.905 | jan/2022 a "dez/2026" |

A primeira foi criada 49 minutos antes da segunda e tem uma importação parcial. Tudo indica
uma **primeira tentativa abandonada**.

Ninguém da MD enxerga esses 6.374 negócios — a regra de segurança do banco separa por
empresa. Mas eles ocupam espaço, entram em backup e distorcem qualquer contagem global.

**Decisão sua, e independente do reparo:** apagar, manter como histórico, ou investigar
antes. Não faz parte deste plano.

---

## 8. Plano alternativo, se a impressão digital não puder ser reproduzida

Se o teste de §4.1 falhar, o casamento por chave sai de cena e sobra casar por conteúdo —
nome do negócio, valor, fabricante e data atual, juntos.

**É pior, e por um motivo concreto:** os nomes de negócio se repetem muito. *"ML2
Empreendimentos | Quartzolit"* aparece dezenas de vezes ao longo dos anos. Casar por nome
exige combinar vários campos e ainda assim sobra ambiguidade.

Nesse cenário a recomendação é **reparar só o que for inequívoco** e entregar o resto numa
planilha para conferência humana — nunca "chutar o mais provável".

---

## 9. Riscos

| Risco | Como está tratado |
|---|---|
| Reparar linha que alguém já corrigiu à mão | Regra de segurança §4.3: só mexe se o valor atual for exatamente o do bug |
| Reparar a linha errada | Chave única de 11.903 digitais distintas; sem casamento por nome |
| Estragar linha que está correta | Nenhuma regra geral é aplicada; só linhas que casaram |
| Reparo pela metade | Transação e lotes, com contagem conferida no fim |
| Descobrir depois que ficou pior | Cópia de segurança do passo 0, mantida por 30 dias |
| Mexer no que não devia | Só quatro colunas de data, e uma de cada vez |

---

## 10. Antes de dizer sim

Três perguntas cuja resposta muda o plano:

1. **Alguém corrigiu data à mão no sistema desde junho?** Se sim, a regra de §4.3 vira
   ainda mais importante e a lista de exceções precisa ser revisada por uma pessoa.
2. **A MD prefere reparar tudo de uma vez ou por período?** Reparar só 2026 primeiro é mais
   cauteloso e permite conferir o resultado no uso real antes de mexer no histórico.
3. **Os 6.374 negócios da empresa "MD" duplicada — apagar, manter ou investigar?**
