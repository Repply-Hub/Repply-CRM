# CLAUDE.md — Repply CRM

Este arquivo orienta o Claude Code quando trabalha neste repositório.
**Leitura obrigatória antes de escrever qualquer código.**

---

## 1. O que é este projeto

**Repply CRM** — SaaS multi-empresa para **representantes comerciais**. Cada empresa de
representação tem seu espaço isolado, com sua equipe, suas marcas representadas, sua
carteira e seu funil.

Cliente-âncora: **MD Representações** (Natal/RN, materiais de construção). Já existem
empresas de fora usando — **este sistema está em produção com cliente pagante.**

> ⚠️ **Este NÃO é o Repply Imob.** Imob é outro produto, outro público (incorporadora e
> imobiliária), outro repositório, outra base de código. Documentos herdados da agência
> chamam este sistema de "Imob" — está errado. Ver `SPEC.md` §1.2.

### Documentos de referência

| Arquivo | Quando consultar |
|---|---|
| `SPEC.md` | **Sempre antes de construir algo novo.** Domínio, estado real de cada módulo, escopo por fase, decisões e porquês |
| `README.md` | Setup, stack, estrutura, scripts, deploy |
| `docs/README.md` | Índice dos documentos técnicos por assunto |
| `docs/divida-tecnica.md` | O que está quebrado, com custo e ordem de conserto |
| `../../../2-MD REPRESENTAÇÕES/1-Brandbooks e Wiki/Cérebro MD/` | Wiki da MD — a fonte mais rica de domínio da representação. **Leia como caso de uso, não como especificação** (ver `SPEC.md` §4) |
| `../../Playbooks e Identidade visual/repply_playbook_v4.md` | Contexto de negócio e marca da Repply |

---

## 2. Stack

- **Framework:** React 18 + TypeScript + **Vite** (não é Next.js)
- **Roteamento:** React Router 6, com carregamento sob demanda por página
- **UI:** shadcn-ui sobre Radix + Tailwind CSS 3
- **Dados:** TanStack Query (React Query) — um hook por domínio em `src/hooks/`
- **Formulários:** React Hook Form + Zod
- **Gráficos:** Recharts · **Mapas:** Leaflet + OpenStreetMap (sem chave de API)
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions em Deno)
- **Testes:** Vitest + Testing Library, ambiente jsdom
- **Deploy:** Vercel — 🔴 **`git push` PUBLICA.** Desde 26/08/2026 o repositório voltou a
  ser público e a publicação é automática a cada commit no `main`. Ver §16

**TypeScript está frouxo de propósito** (`strictNullChecks: false`, `noImplicitAny: false`).
Não conte com garantia de tipo ao ler nem ao escrever: o compilador não vai te avisar.

Atalho de caminho: `@/*` → `./src/*`.

---

## 3. Como o Lucas pede coisas

O Lucas é o dono do produto e **não codifica**. Toda mensagem visível para ele em
**PT-BR coloquial**. Jargão técnico só dentro do código e de comentário técnico.

**Explique a consequência prática antes do mecanismo.** Use analogia concreta quando o
conceito for estrutural. Nomeie arquivos e serviços, mas sempre dizendo para que servem.

| Em vez de | Use |
|---|---|
| "schema" / "migration" | "estrutura do banco" / "mudança no banco" |
| "RLS bloqueou" | "a regra de segurança do banco recusou essa consulta" |
| "edge function" | "função que roda no servidor" |
| "enum" | "lista fixa de opções gravada no código" |
| "chunk load error" | "o navegador está pedindo um arquivo de uma versão antiga do site" |
| "TypeError" | "o código tentou usar uma variável que estava vazia" |
| "índice trigram" | "atalho de busca no banco" |
| "cache envenenado" | "o navegador guardou o arquivo errado e não pede de novo" |

### Skills conforme o pedido

| Ele pede… | Use |
|---|---|
| Pensar antes de fazer, discutir uma ideia | `superpowers:brainstorming` |
| Construir algo novo com plano | `superpowers:writing-plans` → `executing-plans` |
| "isso não funciona", bug, comportamento estranho | `superpowers:systematic-debugging` |
| Revisar o que foi feito | `superpowers:requesting-code-review` |
| Confirmar que está pronto | `superpowers:verification-before-completion` |

**Sempre responda em PT-BR**, independentemente do idioma da skill ou do código.

---

## 4. Vocabulário do produto

Interface em português do ramo. Código e banco em português também (herdado) — **não
traduza para inglês**, a consistência vale mais que a preferência.

| Na tela | No banco | O que é de verdade |
|---|---|---|
| **Negócio** | `pedidos` | Um **orçamento**. É o objeto central do sistema |
| **Cliente** | `clientes` | A empresa que compra (construtora, loja, PJ) |
| **Contato** | `contatos` | A pessoa dentro do cliente |
| **Fabricante** | `fabricantes` | A **representada** — a marca que o representante vende |
| **Obra** | `obras` | O canteiro. Pode ter CNPJ próprio (SPE) |
| **Etapa** | `kanban_colunas` | Coluna do funil, configurável por empresa |
| **Usuário** | `usuarios` | Membro da equipe. Antigamente `vendedores` |
| **Empresa** | `empresas` | O **assinante do SaaS**, não o cliente dele |

### Seis ambiguidades que já causaram bug

1. **"empresa" significa duas coisas.** `empresas` é o assinante do SaaS. Mas `clientes`
   tem um campo `empresa` de texto, que é o nome da empresa **cliente**. Inquilino é
   sempre `empresa_id`.
2. **"vendedor" virou "usuário", mas não em todo lugar.** Sobrou em
   `historico_contatos.vendedor_id`, nas funções `is_gestor()`, `get_my_vendedor_id()`,
   `vendedor_in_my_empresa()` e na visão `vw_indicadores_vendedor`. Código novo usa
   `usuarios` / `usuario_id` / `get_my_usuario_id()`. **Não remova os antigos** sem varrer
   as políticas de segurança que ainda os usam.
3. **"Negócio" na tela é `pedidos` no banco.** Não renomeie nenhum dos dois.
4. 🔴 **`prazo_resposta` NÃO é prazo de resposta — é a DATA DE FECHAMENTO.** O nome da coluna
   mente. A tela escreve "Data de Fechamento" (`NovoNegocioDialog.tsx:773`), a importação
   rotula "Fechamento" (`importPedidosUtils.ts:17`), e é essa coluna que o Dashboard usa em
   **todas as métricas de dinheiro**. Um plano inteiro foi desenhado sobre ela em 24/08/2026
   acreditando no nome, e teve de ser refeito.
   **Nunca a use como prazo de coisa nenhuma.** Para negócio aberto ela é uma previsão
   herdada da planilha que ninguém atualiza — dos 193 abertos, **32 têm data de fechamento
   anterior à data de criação**. Quem precisa de "há quanto tempo está parado" usa
   `pedidos_historico_status` (confiável a partir de 08/2026) ou `data_pedido` (sempre).
   O mapa completo de tela × banco está em
   [`docs/arquitetura/modelo-de-dados.md`](docs/arquitetura/modelo-de-dados.md), junto com o
   motivo de não renomearmos (o rename quebra 8 funções do banco em silêncio).

5. 🔴 **`usuarios.id` e `usuarios.user_id` são identificadores DIFERENTES da mesma pessoa,
   e as colunas "quem fez" se dividem entre os dois.** `user_id` é o login (a linha em
   `auth.users`); `id` é a linha na nossa tabela `usuarios`. **Nenhum `usuarios.id` existe
   em `auth.users`** — medido em 26/08/2026: 0 de 26 pessoas.

   Não dá para deduzir qual usar pelo nome da coluna. As duas famílias convivem:

   | coluna | aponta para | mande |
   |---|---|---|
   | `historico_contatos.usuario_id` | `usuarios(id)` | `profile.id` |
   | `tarefas.usuario_id` | `usuarios(id)` | `profile.id` |
   | `configuracoes_automacao.updated_by` | `auth.users(id)` | **`profile.user_id`** |

   **Confira no banco antes de escrever**, com
   `select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'sua_tabela'::regclass`.

   Errar não dá erro visível: a gravação inteira é recusada pela chave estrangeira e, se o
   `catch` da tela for o padrão de baixo, a pessoa vê uma frase genérica. A aba Automação
   ficou assim desde que nasceu — **zero linha gravada**, e ninguém percebeu porque a tela
   "Hoje" usa o padrão quando não há configuração. Custou duas investigações no mesmo dia.

6. 🔴 **Erro do Supabase NÃO é um `Error`.** É um objeto simples
   (`{ message, details, hint, code }`), então `e instanceof Error` dá **falso** justamente
   para os erros que interessam, e a tela cai na frase genérica do `else` — escondendo a
   explicação que o banco mandou junto.

   Use `mensagemDeErro` de `src/lib/mensagem-de-erro.ts` em gravação de tabela, e
   `mensagemDeErroDaFunction` de `src/lib/erro-edge-function.ts` quando o erro vier de
   função que roda no servidor (ali a frase está dentro do corpo HTTP e a leitura é
   assíncrona). O padrão abaixo existe em ~13 outros arquivos e é dívida conhecida:

   ```ts
   e instanceof Error ? e.message : 'Não foi possível salvar'   // ❌ esconde erro de banco
   ```

### Termos do ramo

| Termo | Significado |
|---|---|
| **Representada** | A fábrica que o representante representa |
| **SPE** | Sociedade de Propósito Específico — CNPJ criado só para uma obra |
| **Alçada de desconto** | Até quanto o vendedor pode dar desconto sem pedir autorização |
| **Tabela de preços** | A lista de preços vigente de uma fábrica |
| **Orçamento parado** | Enviado e sem resposta há X dias. É a maior fonte de perda |

---

## 5. Convenções

1. **PT-BR** em interface, documentação, mensagem de erro, comentário e commit.
2. **Arquivos:** kebab-case para hooks e utilitários (`use-pedidos.ts`), PascalCase para
   componentes (`ImportPedidosDialog.tsx`).
3. **Um hook por domínio** em `src/hooks/`, envolvendo TanStack Query.
4. **`src/components/ui/`** é shadcn gerado — trate como camada-base. Estenda por
   propriedade e classe, não editando a primitiva.
5. **Componentes de domínio** ficam em `src/components/<dominio>/`.
6. **Teste ao lado do código** (`*.test.ts`) ou em `src/test/`.
7. **Commit no padrão convencional, em português:**
   `fix(negocios): corrige lentidão na busca do pipeline`
8. **Dinheiro:** campo de entrada é `<CampoMoeda>`; exibir e ler valor é
   `formatarMoedaBRL` / `parseMoedaBRL` (`src/lib/moeda.ts`). Ver §7.10.
9. **Modal:** `<ConteudoDialogo>` em vez de `<DialogContent>`. Ver §7.11.

### 🔴 Gráfico novo: pergunte o período ao Lucas ANTES de construir

**Todo painel, cartão ou gráfico novo precisa de uma resposta explícita: ele conta por
data de criação (`data_pedido`) ou por data de fechamento (`prazo_resposta`)?**

Não dá para deduzir do nome da métrica. As duas respostas produzem números plausíveis,
ninguém percebe a troca olhando a tela, e o erro só aparece quando alguém compara com a
planilha — semanas depois. Foi assim que o Dashboard inteiro passou meses respondendo
"criados no período" **inclusive nas métricas de dinheiro**.

O par de perguntas que resolve:

1. **É dinheiro ou é conversão?** Dinheiro conta por fechamento. Conversão é conta de
   safra: dos criados no período, quantos ganharam — e conta por criação.
2. **O numerador é subconjunto do denominador?** Se não for, a razão pode passar de 100%.
   Medido: a fórmula alternativa da taxa de conversão daria **157%** na semana de
   29/12/2025.

Detalhe métrica a métrica em [`docs/modulos/dashboard.md`](docs/modulos/dashboard.md).

---

## 6. Regras absolutas (violar = bug crítico)

### Banco e segurança

1. **A autorização real é a RLS do Postgres.** Esconder botão não protege nada. Nunca
   tente replicar autorização só no frontend.
2. **Toda tabela nova nasce por migration**, com RLS habilitada e política escrita, no
   mesmo arquivo. **Nunca crie tabela pelo painel do Supabase.**
   > Foi exatamente assim que a `webhook_debug` ficou sem proteção e vazou a chave do
   > WhatsApp: nasceu à mão, nunca passou por revisão de código. Ver `SPEC.md` §11.1.
3. **Nunca edite migration existente.** Só acrescente arquivo novo.
4. **Some no banco, não no navegador.** Total, contagem e agregação saem de função de
   banco ou de contagem exata do servidor. `pedidos` já tem milhares de linhas.
5. **Nunca commite credencial.** Nem em documento, nem em comentário, nem em exemplo.

### Dados no frontend

6. **Mutação invalida a lista inteira de chaves relacionadas.** Ao mexer em `pedidos`,
   olhe a lista de invalidação em `use-pedidos.ts` antes — inclui painéis que não parecem
   ligados, como `vw_faturamento_mensal`.
7. **`ProtectedRoute` tem mais de dois estados.** Além de logado e deslogado, trata:
   perfil ainda carregando, usuário excluído de forma reversível (`deleted_at`), sessão
   órfã (existe sessão, mas a linha de perfil sumiu — dispara saída automática) e usuário
   sem empresa. **Nunca assuma que ter sessão significa que o app está usável** — confira
   `profileLoaded` / `profileAttempted`.

### Tipos

8. **`src/integrations/supabase/types.ts` é gerado**, mas não há banco local neste
   ambiente. Ao criar RPC ou mudar tabela, **atualize o arquivo à mão** para bater.

---

## 7. Armadilhas medidas neste código

Cada uma custou horas ou dinheiro de alguém. Estão aqui para não custarem de novo.

### 7.1 Número de WhatsApp: o nono dígito

Enfiar o 9 em qualquer número de 10 dígitos **quebra os telefones fixos que têm WhatsApp**.
Um cliente real, com fixo `(84) 2030-0387`, virava um número inexistente — e isso
respondia por 100% das falhas de envio.

A regra correta está em `normalizeWhatsappPhone`, com testes que fixam o contrato
(`src/hooks/whatsapp-phone.test.ts`). **A mesma regra existe duplicada** nas funções de
borda (`supabase/functions/_shared/whatsapp.ts`). Se as duas divergirem, a mesma pessoa
vira duas conversas.

### 7.2 Identificador de grupo do WhatsApp é literal

`whatsapp_conversas.telefone` guarda o identificador do grupo em dois formatos, e o
formato antigo **tem hífen**. Qualquer `replace(/\D/g, "")` apaga o hífen e monta um
destino inexistente — a uazapi responde sucesso e não entrega nada. Foi bug silencioso
por meses.

### 7.3 `.eq(coluna, null)` nunca casa

No PostgREST isso vira `coluna=eq.null`, e em SQL `NULL = NULL` não é verdadeiro. Use
`.is(coluna, null)`. Sintoma típico: o clique parece funcionar e o estado volta sozinho
ao recarregar.

### 7.4 Busca por texto sob RLS não usa índice

Consulta direta com `.ilike()` **não consegue** usar o índice de busca quando há RLS,
porque o Postgres não pode avaliar o texto antes da política. Medido de verdade: buscar
um termo raro levava 12 segundos e estourava o tempo limite — quanto mais raro o termo,
pior.

A saída é RPC `SECURITY DEFINER` que repete as mesmas cláusulas da política
explicitamente, deixando o índice cortar primeiro. Exemplo pronto: `wa_buscar_mensagens`
(12.013 ms → 22 ms). **Ao criar busca textual nova, siga esse padrão.**

### 7.5 Página que quebra depois de um deploy

Todas as páginas carregam sob demanda, e o Vite nomeia cada arquivo pelo conteúdo. Quando
sai um deploy, quem estava com a aba aberta aponta para arquivos que não existem mais — e
o React **guarda a promessa rejeitada**, então nem trocar de tela recria o módulo. Só
recarregar resolve.

Por isso existe `lazyComRetry`, que traduz isso na tela de "saiu versão nova". **Use
`lazyComRetry` em vez de `React.lazy` direto.**

### 7.6 `vercel.json` não aceita comentário

JSON não tem comentário e a Vercel **recusa** propriedade desconhecida dentro das regras —
o deploy falha na validação. Já aconteceu. A explicação de cada regra vive em
`docs/arquitetura/integracoes-externas.md`, não no arquivo.

E a exclusão de `/assets` da regra de reescrita **não é decoração**: sem ela, arquivo
inexistente devolve a página inteira com status de sucesso, e o navegador guarda página
no lugar de código — com cura só por limpeza manual de cache.

### 7.7 Ordenar mês por rótulo embaralha o gráfico

Ordene por `mes_ano` (`AAAA-MM`, que ordena certo como texto), nunca pelo rótulo
formatado.

### 7.8 Array vazio em filtro de RPC filtra tudo fora

`= ANY('{}')` não casa com nada. Converta array vazio em `null` antes de mandar para o
servidor — `null` é quem significa "sem filtro".

### 7.9 Predicado que cita duas colunas de data derruba o índice (e a RLS cobra por linha)

Parece natural dar à RPC um parâmetro tipo `p_date_field` para escolher entre
`data_pedido` e `prazo_resposta`. **Não faça.** Medido nesta base:

| Forma | Resultado |
|---|---|
| `CASE WHEN p_date_field = ... THEN a ELSE b END >= p_date_from` | `pedidos_stats` de **~4ms para 16–31 SEGUNDOS**, com os índices existindo |
| "OU de blocos" (cada bloco cita uma coluna só) | **~30–200ms** — melhor, mas ainda 10 a 50× o original |
| Coluna **cravada no texto** de cada recorte | Volta ao Index Scan |

Duas coisas se somam. O PostgREST **sempre** chama RPC por argumento nomeado
(`func(p_a := ...)`), que é o caso do plano genérico, e aí um predicado citando duas
colunas faz o Postgres largar o Index Scan. E a política de RLS de `pedidos` chama
`usuario_in_my_empresa` **uma vez por linha varrida** — sair de ~100 linhas para 11,9 mil é
o que transforma 4ms em segundos.

Por isso `dashboard_stats` tem duas CTEs separadas em vez de um parâmetro. História
completa em [`docs/modulos/dashboard.md`](docs/modulos/dashboard.md) §6.

### 7.10 `type="number"` não aceita máscara, e `parseFloat` come dinheiro brasileiro

Duas armadilhas que andam juntas, e as duas são silenciosas:

1. **`<Input type="number">` recusa texto formatado.** O navegador devolve **string
   vazia** para `"99.888,47"` — sem erro nenhum. O campo se apaga sozinho a cada tecla e
   grava zero. Em `type="number"` a **roda do mouse** também altera o valor quando o
   cursor está por cima.
2. **`parseFloat("99.888,47")` devolve `99.888`** — mil vezes menos, sem erro. `parseFloat`
   é função de padrão americano: ela para na vírgula.

O estrago real: três negócios gravados mil vezes maiores que o certo, o pior deles
`106.387.320,00` no lugar de `106.387,32`, e nada na tela indicava erro.

**Use `<CampoMoeda>`** (`src/components/shared/CampoMoeda.tsx`) em campo de dinheiro, e
`parseMoedaBRL` / `formatarMoedaBRL` (`src/lib/moeda.ts`) para ler e mostrar valor. Nunca
`parseFloat` em dinheiro, nunca `type="number"` em campo com máscara.

**Quantidade também não é `type="number"`.** `itens_pedido.quantidade` é `numeric(10,3)`, e
metro quadrado e quilo pedem casa quebrada — mas a mesma vírgula que o campo de número
recusa é a que o usuário brasileiro digita. Use `<CampoMoeda comPrefixo={false}
casasDecimais={3}>`: é a máscara, sem o "R$".

**Completar as casas decimais é comportamento de DINHEIRO. Para quantidade é o contrário:**

- Dinheiro sempre tem duas casas. `"1.234,5"` é um valor meio escrito, e completar para
  `"1.234,50"` ao sair do campo só mostra o que já estava guardado.
- Quantidade não. Completar `1,5` para `"1,500"` cria um número que **se lê como mil e
  quinhentos** — o formato americano de milhar, na tela de quem escreve `1.500`. Uma
  unidade e meia vira mil e quinhentas sem nada mudar no banco.

`casasDecimais={3}` é o **teto** do que se pode digitar, nunca uma ordem de exibir três
casas. Complete casas só onde a unidade é dinheiro.

**Campo apagado não é zero.** Enquanto a pessoa digita, campo vazio tem que ficar vazio: se
o pai converte `null` em `0` e devolve, o campo salta para `"0"` com o cursor no fim, no
meio da troca do número — e redigitar é onde o erro nasce. Vazio e zero valem o mesmo
número; brigar com quem está digitando é pior que a diferença.

### 7.11 Modal sem teto de altura prende o usuário na tela

O `DialogContent` do shadcn **não tem teto de altura nem rolagem**, e é centralizado por
deslocamento de 50%. Conteúdo mais alto que a janela transborda para os **dois** lados: o
botão Salvar some por baixo e o "X" some por cima ao mesmo tempo. Como este projeto
desligou Esc e clique-fora (`src/components/ui/dialog.tsx:42`), a pessoa preenche o
formulário inteiro e **só sai recarregando a página**.

Já acontece hoje, em notebook 1366x768 sem zoom.

**Use `<ConteudoDialogo>`** de `src/components/shared/DialogoResponsivo.tsx` no lugar de
`<DialogContent>`. Só trocar a tag já tira a tela do beco sem saída; envolver o miolo em
`<CorpoDialogo>` é o que deixa título e botões parados enquanto só o meio rola. Altura em
`dvh`, não `vh` — no celular `100vh` mede a tela com a barra de endereço escondida, e o
rodapé do modal fica atrás dela.

### 7.12 Campo de data não converte fuso — e `getTimezoneOffset` recua um dia

O calendário entrega **meia-noite no fuso local**. Se a gravação usa
`format(d, 'yyyy-MM-dd')` do date-fns — que também lê o fuso local —, os dois já falam a
mesma língua e **não há nada a converter**.

O que existia aqui, nos quatro campos de data dos formulários de negócio:

```js
const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
```

`getTimezoneOffset()` devolve **+180** no Brasil, então isso recua três horas e a data cai
no dia anterior às 21h. Medido com `TZ=America/Sao_Paulo`:

| Usuário clicou | Sistema gravava |
|---|---|
| `2024-03-15` | `2024-03-14` |
| `2024-03-01` | `2024-02-29` |

Clicar no dia 1º jogava o negócio para o **mês anterior** — e o botão já mostrava o dia
errado logo depois do clique.

**Esse idioma não é errado por si:** ele é o jeito certo de fazer `toISOString()` (que lê
UTC) devolver a data local. Casado com `format()`, faz o oposto do que promete. A regra
simples: **converta o fuso no ponto onde a data vira texto, nunca no ponto onde ela é
escolhida** — e escolha uma só das duas famílias, `format` (local) ou `toISOString` (UTC).

Ler do banco sempre esteve certo e é o padrão a copiar: âncora de meio-dia,
`new Date(p.data_pedido + 'T12:00:00')`, imune a qualquer deslocamento de fuso.

Passou dois anos sem ninguém notar porque só **4 negócios** nasceram dentro do CRM — os
outros 11.903 vieram da importação, que monta a data por outro caminho.

### 7.13 Calendário abre no mês de hoje, não no mês da data escolhida

`react-day-picker` v8 decide o mês de abertura por `month ?? defaultMonth ?? hoje`.
**`selected` não entra nessa conta.** Um campo com março/2024 escolhido abre em agosto/2026
e obriga a 29 cliques na setinha — com quatro anos de histórico importado, inviabiliza
consultar o passado.

**Todo `<Calendar>` precisa de `defaultMonth`.** A primitiva `ui/calendar.tsx` repassa
`{...props}` ao `DayPicker`, então basta a propriedade — não se edita a primitiva (§5.4).
Use `mesDoCalendario(...)` de `src/components/shared/mes-calendario.ts`, que escolhe a
primeira data preenchida e cai no mês atual quando não há nenhuma:

```tsx
<Calendar defaultMonth={mesDoCalendario(prazoResposta, dataPedido)} … />
```

Ele aceita **só `Date` de verdade**: `new Date("2024-03-01")` no horário de Brasília devolve
29/02, e o calendário abriria em fevereiro.

**Quando `defaultMonth` NÃO basta:** ele só vale na montagem. Serve porque `PopoverContent`
é Radix dentro de `Portal` sem `forceMount`, e desmonta ao fechar. Mas se o **mesmo**
elemento `<Calendar>` servir dois campos (as abas De/Até do `DateRangePicker`), trocar de
aba não remonta nada e o mês nunca é recalculado. Aí é `month` + `onMonthChange`, via
`useMesVisivel(alvo, chaveDeReinicio)` do mesmo arquivo.

**Cuidado com o teto de ano:** `toYear={new Date().getFullYear()}` trava o seletor no ano
corrente e impede escolher data futura em campo de prazo ou de fim de período.

**Armadilha de fábrica:** `ui/calendar.tsx` esconde o rótulo do mês (`caption_label: hidden`)
e anula as setas (`IconLeft`/`IconRight` devolvendo `null`), e o CSS do react-day-picker não
é importado em lugar nenhum — os botões ficam sem tamanho. **Sem `captionLayout="dropdown-buttons"`
o calendário fica mudo, preso no mês atual, sem saída.** Quatro campos do sistema estavam
assim. Ao acrescentar calendário novo, passe `captionLayout`, `fromYear` e `toYear`.

**Não conserte a navegação da agenda.** `CalendarHeader`, `CalendarMonthView` e
`TimeGridView` devem abrir no mês que a pessoa está olhando, não no do último evento tocado.
Só campo de ESCOLHER data usa `defaultMonth`.

---

### 7.14 Planilha do Bitrix: a data vem em ordem AMERICANA, e o conserto precisa estar na tela certa

Duas lições numa, e a segunda é a que custou caro.

**A armadilha técnica.** O Bitrix24 exporta a data como número de série do Excel com o formato
curto embutido (`m/d/yy`) — que é **americano**. Ler a planilha e pedir o texto formatado
(`sheet_to_json` com `raw: false`) faz o SheetJS escrever `"8/12/26"` para 12 de agosto. A
partir daí ninguém sabe se é 8 de dezembro ou 12 de agosto, e o conversor precisa adivinhar:
ele assume brasileiro, **invertendo dia e mês em toda data cujo dia real seja de 1 a 12**.

Medido em produção em 01/09/2026, numa importação de 2.358 negócios:

| grupo | linhas | em meses de set a dez |
|---|---|---|
| dia 13 a 31 — o "13" denuncia o formato, o conversor acerta | 1.572 | **0** |
| dia 01 a 12 — ambíguo, o conversor chuta | 786 | **294** |

Zero contra 37,4% no mesmo arquivo. As 294 caíram em datas que ainda não aconteceram, e
**nenhuma linha foi rejeitada**.

O CSV é pior ainda: o parser do SheetJS reinterpreta a data sozinho antes de qualquer código
nosso, e `2026-08-12` volta como `8/11/26` — **um dia a menos**. Ler CSV como bytes
(`type: 'array'`) também come acento: `AÇÃO` vira `AÃÃO`.

**A armadilha de verdade: o conserto certo no arquivo errado não conserta nada.** Este bug foi
corrigido em 20/08/2026, validado contra 26.181 datas reais, e **voltou em 01/09/2026** — sem
ninguém ter revertido nada. O conserto estava em `file-parser.ts`, que nenhuma tela renderizada
chamava, enquanto a tela que a MD usa tinha a sua própria leitura de planilha. Havia **três
leituras independentes** no projeto. A validação passou por um caminho que o cliente não usa.

Hoje existe **um leitor só**: `lerPlanilhaComoObjetos`, em `src/lib/import/ler-planilha.ts`.
Ele liga `cellDates`, normaliza a data para ISO antes de qualquer adivinhação, lê CSV como
texto e tem o modo `preservarNumeros` para quem importa CNPJ (com o texto formatado,
`12345678000190` vira `"1.23457E+13"` e a limpeza grava um CNPJ que não existe).

O que sobra de ambíguo — CSV e data digitada como texto — é decidido **por coluna**, não por
célula: uma única linha com dia 25 prova que a coluna inteira é brasileira
(`src/lib/import/ordem-de-data.ts`).

🔴 **Nunca escreva `XLSX.read` numa tela.** O teste `src/test/uma-leitura-de-planilha-so.test.ts`
falha se alguém tentar — é o único guarda contra a quarta leitura nascer daqui a três meses.

E a rede de segurança que faltava: a prévia da importação agora avisa quando alguma data de
criação cai **depois de hoje**. Negócio criado no futuro não existe; foi o único sinal que
teria pegado as 786 linhas no dia. Distribuição estatística **não** teria funcionado — as
linhas sãs mantiveram dia acima de 12 e o histograma continuou com cara normal.

---

## 8. Identidade visual

Sistema de marca já implementado em `src/index.css` ("Repply Brand System V2.0"). **Use os
tokens, não valores soltos.**

| | |
|---|---|
| **Repply Orange** | `#FF5A1F` → token `--primary` |
| **Deep Black** | `#0A0A0A` → base da barra lateral e do tema escuro |
| **Pure White** | `#FFFFFF` |
| **Display / títulos** | General Sans |
| **Corpo** | Satoshi |
| **Dados e números** | JetBrains Mono |

Fontes vêm do Fontshare e do Google Fonts, declaradas em `index.html`.

**Tom visual:** sóbrio e técnico. Sem superlativo, sem linguagem de varejo. O
interlocutor é um profissional que respeita precisão e detesta ser vendido.

---

## 9. Verificação obrigatória antes de dizer "feito"

Nunca afirme que algo funciona sem ter rodado. Evidência antes de afirmação.

```sh
npm run test      # 152 testes em 10 arquivos. Tem que passar limpo
npm run build     # tem que compilar
npm run lint      # ver a ressalva abaixo

npx tsc --noEmit -p tsconfig.app.json   # 🔴 com o -p. Ver a armadilha abaixo
```

> ⚠️ **`npm run lint` NÃO passa limpo neste projeto.** Medido em 19/08/2026 no `main`:
> **498 problemas (458 erros, 40 avisos)**. É estado herdado, não regressão.
>
> Por isso, o critério aqui **não é** "o lint passou". É: **o número não subiu**. Rode
> antes de mexer, guarde o total, rode depois e compare. Se subiu, o que você acrescentou
> tem erro novo — conserte.
>
> Ver [`docs/divida-tecnica.md` §18](docs/divida-tecnica.md).

> 🔴 **`npx tsc --noEmit` sem o `-p` não confere NADA — e devolve sucesso.** O
> `tsconfig.json` da raiz tem `"files": []` e só aponta para os outros dois; sem arquivo na
> lista, o compilador não olha nada e sai com zero erros. É o comando que todo mundo digita
> por reflexo, e ele dá um "está tudo certo" falso.
>
> O que confere de verdade é **`npx tsc --noEmit -p tsconfig.app.json`**. Linha de base em
> 23/08/2026: **35 erros herdados** — mesmo critério do lint, o número não pode subir.
>
> Isso importa mais aqui do que na maioria dos projetos, porque **`npm run build` é
> `vite build` puro, sem checagem de tipo**: erro de tipo não impede publicar. Em 23/08/2026
> esse comando pegou duas coisas que o build aceitou numa boa — uma função de banco esquecida
> nos tipos e três tabelas que nunca tinham sido declaradas desde 21/08.

Além disso, conforme o que mudou:

- **Mexeu em permissão ou RLS?** Teste logado como vendedor comum, não só como gestor.
- **Mexeu em consulta pesada?** Meça antes e depois. Diga o número.
- **Mexeu em algo do banco?** Confirme se a migration foi de fato aplicada — este ambiente
  não tem banco local, e escrever a migration **não é** aplicá-la.
- **Mexeu em rota ou no `vercel.json`?** Teste link direto (`/clientes`,
  `/pedidos/:id/editar`), não só a navegação pelo menu.

---

## 10. Anti-padrões (proibidos)

- ❌ Criar tabela pelo painel do Supabase
- ❌ Editar migration já existente
- ❌ Conferir tipo com `npx tsc --noEmit` sem o `-p tsconfig.app.json` (§9) — a raiz não olha arquivo nenhum e devolve sucesso sempre
- ❌ Puxar coleção inteira para o navegador só para contar ou somar
- ❌ Confiar em verificação de permissão feita só no frontend
- ❌ `React.lazy` direto em página (use `lazyComRetry`)
- ❌ `type="number"` ou `parseFloat` em campo de dinheiro (use `CampoMoeda` / `parseMoedaBRL`)
- ❌ `<DialogContent>` cru em modal com formulário (use `ConteudoDialogo`)
- ❌ Converter fuso na data que veio do calendário (§7.12) — a conversão recua um dia
- ❌ `<Calendar>` sem `defaultMonth` (§7.13) — abre no mês de hoje e ignora a data escolhida
- ❌ Parâmetro que escolhe entre duas colunas de data dentro de uma RPC (§7.9)
- ❌ Tratar `prazo_resposta` como prazo (§4.4) — é a data de fechamento, e o nome mente
- ❌ Construir gráfico novo sem perguntar ao Lucas se ele conta por criação ou por fechamento
- ❌ `XLSX.read` fora de `src/lib/import/` (§7.14) — foi assim que o conserto de datas ficou num arquivo que nenhuma tela chamava
- ❌ Limpar não-dígitos de identificador de WhatsApp
- ❌ Painel que atribua culpa — ver o princípio "registra, não interpreta" (`SPEC.md` §3.5)
- ❌ Transformar prática da MD em regra do sistema (`SPEC.md` §4)
- ❌ Chamar este produto de "Imob"
- ❌ Commitar ou enviar qualquer coisa **sem autorização do Lucas** (ver §13)
- ❌ Commitar sem antes rodar `git fetch` e conferir se entrou commit de outra pessoa
- ❌ `git add -A` (§13) — outra sessão trabalha nesta pasta; liste os arquivos um a um
- ❌ Restaurar arquivo do projeto de um backup seu (§13) — apaga o que a outra sessão
  escreveu nele, e o `git status` mostra só um `M` igual a qualquer alteração sua

---

## 11. Quando parar e perguntar ao Lucas

- A mudança altera o que o cliente **vê ou paga**
- **Vai construir gráfico, cartão ou painel novo** — pergunte se conta por data de criação
  ou de fechamento antes de escrever a primeira linha (§5)
- A mudança precisa ser aplicada no banco de produção
- Apareceu decisão de produto que não está no `SPEC.md`
- O pedido esbarra numa das decisões registradas em `SPEC.md` §10
- Descobriu risco de segurança novo
- O conserto exige mexer em algo que hoje está funcionando para cliente pagante

---

## 12. Comandos

```sh
npm run dev          # servidor de desenvolvimento, porta 8080
npm run build        # build de produção
npm run build:dev    # build sem minificar, para investigar erro de build
npm run lint         # eslint
npm run test         # vitest, uma passada
npm run test:watch   # vitest em modo contínuo
```

Rodar um teste só:

```sh
npx vitest run src/hooks/whatsapp-phone.test.ts
```

---

## 13. Git e GitHub — fluxo obrigatório

O trabalho vai **direto no `main`**, como o time já faz. A barreira não é o Pull Request:
é a **autorização do Lucas, pedida antes de cada commit.**

> 🔴 **Nunca commite nem envie nada sem avisar e receber o "pode".**
> A autorização é **por commit**. Ter recebido antes não vale para o próximo.
>
> Isso existe porque o `main` não tem proteção, a publicação em produção está a um comando
> de distância (§16),
> e a rede de proteção automática é fraca (10 arquivos de teste para 78 mil linhas, lint com
> 498 problemas herdados, TypeScript frouxo). Sem etapa humana, o erro chega ao cliente
> pagante em minutos.

### Os quatro passos, nesta ordem

**1. Avisar e esperar.** Diga o que vai subir e por quê. Espere a resposta.

**2. Conferir se entrou commit de outra pessoa.** Outros colaboradores continuam subindo
código no `main`. Antes de commitar:

```sh
git fetch origin
git log --oneline HEAD..origin/main    # vazio = nada novo
git status --short                      # a fila INTEIRA. Algo que não é seu? Pare
```

> 🔴 **O `git fetch` não é formalidade: as sessões NÃO compartilham o mesmo ponteiro.** Outra
> sessão pode ter commitado e enviado sem que o seu `HEAD` tenha andado — e aí você está
> escrevendo sobre uma base velha sem saber.
>
> Medido em 26/08/2026: quatro commits da outra sessão entraram no meio de uma tarefa, em
> arquivos que esta sessão também tocava. O sintoma quando isso acontece é enganoso — os tipos
> pularam de 35 para 40 e o build quebrou, porque um arquivo puxado do commit novo referenciava
> componentes que ainda não existiam nesta árvore.
>
> **Puxe ANTES de aplicar, nunca depois.**

**3. Avaliar conflito.** Se apareceu commit novo, veja se ele toca os mesmos arquivos que
você. Se tocar, **pare e avise o Lucas antes de tentar juntar** — não resolva conflito em
produção por conta própria.

**4. Commitar e enviar.**

> ⚠️ **Nunca `git add -A`.** Pode haver outra sessão de trabalho na mesma pasta. Liste os
> arquivos um a um, e confira a fila (`git status --short`) num comando SEPARADO do commit
> — arquivo que a outra sessão já deixou estagiado entra no seu commit mesmo sem você ter
> adicionado. Já aconteceu duas vezes.

> 🔴 **Nunca restaure arquivo compartilhado de backup privado.** Copiar um `.bak` que você
> fez "para poder voltar atrás" por cima de um arquivo do projeto APAGA o que a outra sessão
> escreveu nele nesse meio-tempo — e o `git status` mostra só um `M`, igual a qualquer outra
> alteração sua.
>
> Aconteceu em 26/08/2026: um backup de `Obras.tsx`, feito minutos antes, desfez a
> funcionalidade de vincular contatos à obra que a outra sessão acabara de entregar. Foi
> pego ao conferir a fila antes do commit, e só não virou perda porque o trabalho dela já
> estava commitado.
>
> Para desfazer o SEU trabalho, use o git, que sabe o que é seu e o que não é:
>
> ```sh
> git diff arquivo.tsx            # veja o que você mudou, antes de descartar
> git checkout HEAD -- arquivo.tsx  # volta ao commitado, preservando o de todo mundo
> ```
>
> E se precisar mesmo de um arquivo de outro commit, **puxe o commit inteiro** (`git pull
> --rebase`), nunca um arquivo solto: arquivo novo costuma depender de outros que vieram
> junto, e sozinho ele só quebra a compilação.

```sh
git status --short                      # a fila INTEIRA. Algo que não é seu? Pare.
git add caminho/um.ts caminho/dois.tsx  # um a um, nunca -A
git diff --cached --name-only           # confira de novo antes de commitar
git commit -m "tipo(escopo): descrição em português"
git push origin main
```

Mensagem no padrão convencional, em português. Prefixos: `feat`, `fix`, `refactor`,
`docs`, `chore`, `style`.

**5. Publicar — já aconteceu.** 🔴 **O `git push` do passo 4 É a publicação.** Desde
26/08/2026 a Vercel publica sozinha a cada commit no `main`; não há comando a rodar depois.

Isso **aperta** o passo 1, não afasta: o "pode" do Lucas agora libera código para o cliente
pagante no mesmo gesto, sem etapa intermediária onde alguém repense. Ver §16.

> **Histórico da regra:** o projeto experimentou branch + Pull Request em 19/08/2026
> (PR #1, o único do repositório). A decisão foi revertida no mesmo dia, para não conviver
> com dois padrões enquanto os colaboradores atuais commitam direto. A proteção migrou do
> Pull Request para a autorização prévia.

---

## 14. Estrutura

```
mdrepresentacoes/
├── SPEC.md · CLAUDE.md · README.md      ← os três da raiz
├── docs/                                 ← detalhe técnico por assunto
├── src/
│   ├── pages/          29 telas (uma por rota)
│   ├── components/
│   │   ├── ui/         shadcn gerado — camada-base
│   │   ├── layout/     casca do app, barra lateral, notificações
│   │   ├── shared/     usados por mais de um domínio
│   │   └── <dominio>/  pedidos, clientes, obras, catalogo, chat, tarefas, email…
│   ├── hooks/          um por domínio, envolvendo TanStack Query
│   ├── lib/            funções puras e utilitários
│   ├── integrations/   cliente e tipos do Supabase (gerados)
│   └── test/           configuração de teste
└── supabase/
    ├── migrations/     260 arquivos — só acrescente
    └── functions/      39 funções de borda em Deno
```

**Sinal de alerta:** `src/pages/WhatsAppInbox.tsx` tem 7.838 linhas e
`src/pages/Negocios.tsx` tem 2.698. Arquivo desse tamanho é difícil de mexer com
segurança. Ao encostar neles, prefira extrair a parte tocada para um componente próprio a
engordar mais o arquivo.

---

## 15. Quando estiver perdido

1. `SPEC.md` §5 diz o estado real do módulo que você está mexendo
2. `docs/divida-tecnica.md` diz se o que parece bug já é conhecido
3. Os comentários deste código são **bons** — quem escreveu explicou o porquê das
   decisões estranhas. Leia antes de "corrigir"
4. Migration recente costuma explicar comportamento novo melhor que o código
5. Se ainda assim não fechar, **pergunte ao Lucas** em vez de adivinhar

---

## 16. 🔴 `git push` PUBLICA

**Enviar para o `main` coloca no ar, sozinho, em minutos.** Não há comando a rodar depois.

Medido em 26/08/2026, direto da API do GitHub:

```
gh repo view Repply-Hub/Repply-CRM --json visibility   ->  "PUBLIC"
gh api repos/.../commits/<sha>/status                  ->  state: success, contexto "Vercel"
```

### A regra de verdade, depois de três reviravoltas em quatro dias

Este arquivo já errou duas vezes sobre exatamente isto, e o erro custou dois dias de
diagnóstico furado. A explicação que resiste:

> `Cannot deploy from a private GitHub organization repository on the Hobby plan`

A palavra que decide é **privado**, não "organização". O plano gratuito publica repositório de
organização sem problema — recusa quando esse repositório é **privado**. A conexão com o
GitHub sempre existiu e sempre disparou; era a resposta que voltava recusada.

| quando | repositório | publicação automática |
|---|---|---|
| até 24/08/2026 | privado | não |
| 24/08/2026, de manhã | público | **sim** |
| 24/08/2026, no mesmo dia | privado de novo, por apuração de segurança | não |
| **desde 26/08/2026** | **público** | **sim** — é o estado atual |

🔴 **Não mude a visibilidade do repositório para "consertar" nada.** As duas vezes que ela
mudou foi por decisão do dono do produto, com levantamento na mão. Se a publicação parar de
disparar, **confira a visibilidade antes de qualquer outra hipótese** — é a causa mais provável
e a mais fácil de medir, com o comando acima.

### O que isso muda na prática

**A trava do §13 virou a única que existe.** Antes havia duas etapas: o "pode" do Lucas para
commitar, e depois alguém rodando o comando de publicar. A segunda sumiu. Agora o "pode" solta
o código direto para o cliente pagante.

Some isso à rede de proteção fraca (lint com 493 problemas herdados, TypeScript frouxo, 18
arquivos de teste para 78 mil linhas) e a conclusão é simples: **rode a verificação do §9 ANTES
de pedir autorização, não depois.** Não existe mais um passo seguinte onde o erro apareça.

### O comando manual ainda existe, e é exceção

```sh
npx vercel --prod
```

Serve para republicar sem commit novo — por exemplo, quando a publicação automática falha e
você quer tentar de novo sem sujar o histórico. **Não use como rotina**, e nunca use quando
outra sessão estiver codando na pasta: o `vercel --prod` manda o **disco**, não o commitado,
e sobe junto o que a outra sessão deixou pela metade. Aconteceu em 24/08/2026.

Quando precisar mesmo, publique de uma cópia limpa do commitado:

```sh
git archive HEAD | tar -x -C /tmp/publicar    # só o commitado, sem .git
```

E **apague o `.env`** antes de mandar: o das máquinas de desenvolvimento não é igual ao da
Vercel, e um build com ele publicaria variável ausente ou velha **sem nenhum erro aparecer**.

Na cópia limpa não existe o vínculo `.vercel` (ele é ignorado pelo git). Recrie apontando para
o projeto que JÁ EXISTE, senão o CLI deduz pelo nome da pasta e cria um projeto novo — a
armadilha que perde domínio, variáveis e histórico:

```
.vercel/project.json
{"projectId":"prj_ljqQNZgO85fZyKJOoP5lqCw39pnn","orgId":"team_NaSoZXQeqdu96E4KMeIPDqkI"}
```

### Como conferir se uma publicação saiu

Não confie em ter rodado o comando — o CLI já reportou `ECONNRESET` em 26/08/2026 numa
publicação que **tinha concluído**. Confira o que está no ar:

```sh
gh api repos/Repply-Hub/Repply-CRM/commits/<sha>/status --jq '.state, [.statuses[].context]'
```

Para provar que uma mudança específica chegou, baixe o pedaço de código dela e procure dentro.
O nome de cada arquivo em `/assets/` carrega o resumo do conteúdo, então ele muda quando o
conteúdo muda:

```sh
curl -s https://crm.repplyhub.com.br/ | grep -oE '/assets/index-[^"]+\.js'
```

### A Vercel do desenvolvedor anterior — desconectada em 24/08/2026

Até 24/08/2026 cada commit disparava **duas** publicações: a da Repply (`vercel.com/repply1`,
que serve `crm.repplyhub.com.br`) e uma da conta do desenvolvedor anterior
(`vercel.com/arthurclimb`), que mantinha uma cópia do CRM no ar.

Conferido de novo em 26/08/2026: o commit mais recente traz **uma só** verificação, contexto
`Vercel`. A segunda conta continua fora. Se aparecerem duas num mesmo commit, a ligação
voltou — avise o Lucas.

### O conector da Vercel NÃO substitui o CLI

Um conector da Vercel foi ligado em 24/08/2026. Testado no mesmo dia, ele **não serve para
publicar este projeto**:

| Teste | Resultado |
|---|---|
| `list_teams` | vê o time `repply1` (plano gratuito) |
| `list_projects` | **0 projetos** — não enxerga o `repply-crm` |
| `get_project` no id real | **404** |
| `list_deployments` | **403** |

E a ferramenta de publicar dele pede **o código inteiro, arquivo por arquivo, dentro da
chamada** — foi desenhada para projeto pequeno gerado na hora. Além disso, ela **cria um
projeto novo** quando o nome não corresponde a um que ela enxergue: é exatamente a armadilha
que perde domínio, variáveis e histórico.

**Para que ele serve, se um dia ganhar acesso:** ler registro de build, erro em produção e
audiência — ou seja, CONFERIR uma publicação, que hoje é feito no escuro. Nunca fazê-la.

### Duas armadilhas que continuam valendo

**Deixe a Vercel construir.** Existe o caminho de construir aqui e mandar pronto
(`vercel build` + `vercel deploy --prebuilt`): **não use.** O `.env` das máquinas de
desenvolvimento não é igual ao da Vercel, então um build local pode embutir variável ausente
ou desatualizada e publicar um site quebrado **sem nenhum erro aparecer**. (O caso concreto
que originou esta regra — a chave do Google Maps — deixou de existir em 08/2026, quando o
mapa passou a ser Leaflet + OpenStreetMap sem chave; a regra continua valendo para as
variáveis do Supabase e qualquer outra que venha a existir.)

🔴 **Função de servidor é OUTRO caminho, e a publicação automática não a alcança.** O `git
push` publica o **site**. As funções em `supabase/functions/` vivem no Supabase e sobem à
parte. Commitar uma delas **não** a coloca no ar, e publicar a função **não** a commita — são
dois gestos, e esquecer qualquer um deixa código e produção divergentes sem aviso.

Aconteceu em 26/08/2026: o resumo diário rodou cinco versões publicadas no Supabase enquanto o
repositório tinha só a primeira. Ao mexer numa função, faça as duas coisas e diga qual versão
do Supabase corresponde ao commit.

### Primeira vez numa máquina

`npx vercel login` e depois o vínculo — **apontando para o projeto que já existe**:

```sh
npx vercel link --yes --project repply-crm
```

Nunca `vercel link --yes` sozinho: sem `--project` ele deduz pelo nome da pasta
(`mdrepresentacoes`) e **cria um projeto novo**. Hoje existe **um só** projeto na conta,
`repply-crm`, servindo `crm.repplyhub.com.br`.

Depois de vincular, **confira o `.gitignore`**: o `vercel link` acrescenta `.vercel` e
`.env*` no fim do arquivo sozinho, e o `.env*` entra DEPOIS do `!.env.example` — o que volta
a ignorar o arquivo de exemplo em silêncio. Já aconteceu em 23/08/2026. O arquivo tem um
comentário explicando; se as linhas reaparecerem, remova-as.

Guia completo, com o que conferir depois e os erros comuns:
[`docs/operacao/publicar-na-vercel.md`](docs/operacao/publicar-na-vercel.md).

> **Ressalva de negócio, registrada para não virar surpresa:** o plano gratuito da Vercel
> veda uso comercial, e o Repply CRM tem cliente pagante. A comparação com as alternativas
> está em [`docs/operacao/migrar-hospedagem.md`](docs/operacao/migrar-hospedagem.md).

---

## Idioma

**Sempre responda em português do Brasil**, mesmo que código, comentários ou nomes de
variáveis estejam em inglês.
