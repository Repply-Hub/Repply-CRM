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
- **Gráficos:** Recharts · **Mapas:** Google Maps + Leaflet
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions em Deno)
- **Testes:** Vitest + Testing Library, ambiente jsdom
- **Deploy:** Vercel — **publica sozinha a cada envio para `main`**

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

### Três ambiguidades que já causaram bug

1. **"empresa" significa duas coisas.** `empresas` é o assinante do SaaS. Mas `clientes`
   tem um campo `empresa` de texto, que é o nome da empresa **cliente**. Inquilino é
   sempre `empresa_id`.
2. **"vendedor" virou "usuário", mas não em todo lugar.** Sobrou em
   `historico_contatos.vendedor_id`, nas funções `is_gestor()`, `get_my_vendedor_id()`,
   `vendedor_in_my_empresa()` e na visão `vw_indicadores_vendedor`. Código novo usa
   `usuarios` / `usuario_id` / `get_my_usuario_id()`. **Não remova os antigos** sem varrer
   as políticas de segurança que ainda os usam.
3. **"Negócio" na tela é `pedidos` no banco.** Não renomeie nenhum dos dois.

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
```

> ⚠️ **`npm run lint` NÃO passa limpo neste projeto.** Medido em 19/08/2026 no `main`:
> **498 problemas (458 erros, 40 avisos)**. É estado herdado, não regressão.
>
> Por isso, o critério aqui **não é** "o lint passou". É: **o número não subiu**. Rode
> antes de mexer, guarde o total, rode depois e compare. Se subiu, o que você acrescentou
> tem erro novo — conserte.
>
> Ver [`docs/divida-tecnica.md` §18](docs/divida-tecnica.md).

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
- ❌ Puxar coleção inteira para o navegador só para contar ou somar
- ❌ Confiar em verificação de permissão feita só no frontend
- ❌ `React.lazy` direto em página (use `lazyComRetry`)
- ❌ `type="number"` ou `parseFloat` em campo de dinheiro (use `CampoMoeda` / `parseMoedaBRL`)
- ❌ `<DialogContent>` cru em modal com formulário (use `ConteudoDialogo`)
- ❌ Parâmetro que escolhe entre duas colunas de data dentro de uma RPC (§7.9)
- ❌ Construir gráfico novo sem perguntar ao Lucas se ele conta por criação ou por fechamento
- ❌ Limpar não-dígitos de identificador de WhatsApp
- ❌ Painel que atribua culpa — ver o princípio "registra, não interpreta" (`SPEC.md` §3.5)
- ❌ Transformar prática da MD em regra do sistema (`SPEC.md` §4)
- ❌ Chamar este produto de "Imob"
- ❌ Commitar ou enviar qualquer coisa **sem autorização do Lucas** (ver §13)
- ❌ Commitar sem antes rodar `git fetch` e conferir se entrou commit de outra pessoa

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
> Isso existe porque o `main` não tem proteção, a Vercel publica em produção a cada envio,
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
git status --short                      # vazio = área limpa
```

**3. Avaliar conflito.** Se apareceu commit novo, veja se ele toca os mesmos arquivos que
você. Se tocar, **pare e avise o Lucas antes de tentar juntar** — não resolva conflito em
produção por conta própria.

**4. Commitar e enviar.**

```sh
git add -A
git commit -m "tipo(escopo): descrição em português"
git push origin main
```

Mensagem no padrão convencional, em português. Prefixos: `feat`, `fix`, `refactor`,
`docs`, `chore`, `style`.

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

## Idioma

**Sempre responda em português do Brasil**, mesmo que código, comentários ou nomes de
variáveis estejam em inglês.
