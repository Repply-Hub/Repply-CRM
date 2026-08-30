# Base de demonstração da empresa Repply — desenho

> **Estado:** desenho aprovado pelo Lucas em 30/08/2026. Nada inserido ainda.
> **Objetivo:** dar à equipe comercial da Repply um ambiente de demonstração próprio, com dados
> fictícios em todos os módulos, para parar de usar a base da MD Representações em reunião com
> cliente.

---

## 1. O que motivou

Hoje as apresentações comerciais do Repply CRM são feitas na conta da **MD Representações**, o
cliente pioneiro. Isso significa mostrar, numa sala com pessoas de fora, a carteira real de
1.305 clientes da MD, seus 11.910 negócios, seus valores e suas conversas de WhatsApp.

O Lucas criou a empresa **Repply** em 29/08/2026 para substituir esse ambiente. Ela está vazia.

**Este documento descreve o que será inserido nela, e — mais importante — por que essa tarefa é
mais perigosa do que parece e como ela fica segura.**

---

## 2. O que foi medido em 30/08/2026

### 2.1 A empresa de destino

| | |
|---|---|
| `empresas.id` | `9b17bfdf-f631-4af6-9471-a68411909a04` |
| Nome | Repply |
| Criada | 29/08/2026 |
| Preset de seções | **Preset MD Representações** — ou seja, todas as seções ligadas, inclusive Portal e Hoje |
| Assinatura | `plan_status = active`, origem `cortesia` |
| Código de acesso | `98EFE99E` |

O preset importa: a empresa nasceu com **todas as telas visíveis**, que é exatamente o que uma
demonstração precisa. Não é preciso mexer em seção nenhuma.

A assinatura ativa também importa. Em 30/08/2026 o "cerco do bloqueio de plano" foi aplicado em
produção (140 políticas de gate, função `tabelas_fora_do_gate()` presente). Empresa fora de dia
não grava quase nada. **A Repply passa.**

### 2.2 O único usuário

| | |
|---|---|
| `usuarios.id` | `37b5a8eb-09d8-4cd6-b823-8b19022edbac` |
| `usuarios.user_id` (login) | `1fb1cf42-cd27-4146-91ad-4057f94d5473` |
| Nome / e-mail | Repply Suporte · suporte@repplyhub.com.br |
| Papel | `empresa` |

Lembrete do `CLAUDE.md` §4.5: **os dois identificadores são da mesma pessoa e não são
intercambiáveis.** As colunas se dividem entre eles, e errar não dá erro visível — a gravação é
recusada pela chave estrangeira e a tela mostra uma frase genérica.

Nesta base:

| coluna | mande |
|---|---|
| `clientes.usuario_id`, `contatos.usuario_id`, `pedidos.usuario_id`, `tarefas.usuario_id` | `usuarios.id` |
| `eventos.user_id`, `eventos.criado_por` | `usuarios.user_id` (o login) |

### 2.3 O que a empresa já tem, criado por gatilho

| tabela | linhas |
|---|---|
| `funis` | 1 — `a5f1074c-f35b-4b99-b90c-da4a4014bbb3` |
| `kanban_colunas` | 6 |
| `tarefas_kanban_colunas` | 3 |
| `marcadores` | 3 |
| `permissao_presets` | 4 |
| `configuracoes_campos` | 30 |

**Nada disso será recriado.** As 6 etapas do funil, com os identificadores que os negócios vão
usar:

| ordem | slug | nome |
|---|---|---|
| 0 | `novo_lead` | Novo Lead |
| 1 | `elaboracao` | Elaboração de Orçamento |
| 2 | `enviado` | Orçamento Enviado |
| 3 | `negociacao` | Negociação |
| 4 | `fechamento` | Fechamento *(é o slug de GANHO)* |
| 5 | `perdido` | Perdido |

Tudo o mais está em zero: clientes, contatos, negócios, obras, fabricantes, tarefas, eventos,
metas, chat, WhatsApp e e-mail.

### 2.4 🔴 O isolamento entre empresas NÃO é por `empresa_id`

**É a medição que manda no desenho inteiro desta tarefa.**

- `pedidos` **não tem** coluna de empresa. Só `usuario_id`.
- `obras` **não tem** coluna de empresa **nem** `usuario_id`. Só `cliente_id`.
- `contatos` só tem `usuario_id`.
- `clientes` tem `empresa_id`, mas ele está **nulo nas 1.306 linhas** e nenhuma política o lê.

A corrente real é:

```
empresa  ←  usuário  ←  cliente  ←  obra
                          ↑
                       negócio  (também preso ao usuário)
```

Conferido nas políticas de segurança em produção:

| tabela | o que decide quem vê |
|---|---|
| `clientes` | `usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id)` |
| `pedidos` | `usuario_id IN (SELECT usuarios_da_minha_empresa())` |
| `obras` | existe um `clientes` com esse `cliente_id` cujo `usuario_id` é da minha empresa |
| `fabricantes` | `empresa_id = get_my_empresa_id()` — **a única do núcleo que usa `empresa_id`** |
| `eventos` | `user_id = auth.uid()` ou mesmo grupo ou calendário de empresa |

**Consequência prática:** um negócio ou uma obra fictícia não "pertence à Repply" por eu dizer
que pertence. Pertence porque o responsável — ou o cliente — pertence. Se eu prender qualquer
registro ao usuário errado, ele nasce dentro do CRM de outra empresa.

### 2.5 🔴 Duas tabelas mostram para TODAS as empresas o registro sem dono

Descoberto ao ler as políticas:

```sql
contatos_select : (usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id) OR usuario_id IS NULL)
tarefas_select  : (usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id) OR usuario_id IS NULL)
```

O `OR usuario_id IS NULL` significa: **contato ou tarefa sem responsável aparece na tela de
todas as empresas do sistema, inclusive a MD.**

Um contato fictício criado sem responsável apareceria na carteira da MD. Era um passo de
distância do oposto exato do que esta tarefa quer resolver.

> **Regra desta base:** nenhum `contato` e nenhuma `tarefa` sem `usuario_id`. Sem exceção.

Registrado também como achado fora do escopo desta tarefa: essa cláusula é um vazamento
independente, que vale para qualquer linha órfã que exista ou venha a existir. Não é consertada
aqui — é decisão própria do dono do produto.

### 2.6 A equipe fictícia pode existir sem login

`usuarios.user_id` é **anulável** (`FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE
CASCADE`, mas a coluna aceita nulo).

Isso permite criar vendedores fictícios que aparecem como responsável, nos gráficos de conversão
e nas metas do Plano de Vendas, **sem criar nenhum login** — nenhuma senha nova no mundo, nenhuma
credencial a rotacionar depois.

**Limite conhecido:** `eventos` se prende ao login (`user_id → auth.users`). Compromissos do
calendário só podem pertencer ao **Repply Suporte**, que é o único com login. Os vendedores
fictícios entram como participantes, não como donos.

### 2.7 Onde carimbar

`clientes`, `contatos`, `pedidos` e `obras` têm `campos_extras jsonb NOT NULL DEFAULT '{}'`.
É onde vai a marca de origem de cada linha desta base.

---

## 3. Decisões tomadas

Todas do Lucas, em 30/08/2026.

| # | Decisão | Escolha | Observação |
|---|---|---|---|
| 1 | Marcas representadas | **Marcas reais do ramo** | Levantei o risco de usar marca de terceiro numa peça comercial; ele decidiu por reais |
| 2 | Nome na tela | **Manter "Repply"** | Sem renomear, sem nome fantasia |
| 3 | Comunicação | **WhatsApp + E-mail + Chat interno**, os três | Mensagens fictícias, nada enviado a ninguém |
| 4 | Volume | **~150 negócios em 12 meses** | Enche as 6 colunas e dá curva de 12 meses no faturamento |
| 5 | Equipe | **Sem login** | Decisão minha, comunicada e não contestada (§2.6) |

### 3.1 Ressalva sobre a decisão 1, e como ela é atendida

A MD e a JHS já cadastraram 28 marcas reais no sistema: Asperbras, Astra, Brasilit, Carmelo
Fior, Deca Louças, Deca Metais, Decortiles, Durafloor, Ecophon, Eliane, Eliane Floor, Elizabeth,
Hidracor, Hydra, Invita, Iquine, Isover, Nambei, Owa Sonex, Pado, Placo, Pormade, Quartzolit,
Ralo Linear, Socelme, Soprano, Taschibra, WDB.

**Se a demonstração usasse essas mesmas marcas, ela revelaria indiretamente a carteira de
representadas da MD** — o mesmo tipo de vazamento que motivou a tarefa.

Por isso as 8 marcas da base de demonstração são reais **e escolhidas fora dessa lista**:

| marca | categoria |
|---|---|
| Portobello | Revestimentos cerâmicos |
| Biancogres | Porcelanato |
| Docol | Metais sanitários |
| Amanco | Tubos e conexões |
| Suvinil | Tintas |
| Vedacit | Impermeabilizantes |
| Lorenzetti | Elétrica e aquecimento |
| Votorantim Cimentos | Cimento e argamassa |

### 3.2 Nomes de pessoas

Os primeiros nomes já usados por pessoas reais no sistema foram levantados e serão evitados:
Alex, Anderson, Arthur, Daniel, Dennis, Érika, Fabiola, Fernando, Gabriel, Igor, José, Juarez,
Lucas, Margley, Pricila, Rafael, Silvia, Sororo, Vinicius, Vitor.

---

## 4. O modelo de segurança — as cinco travas

**Esta seção é o coração do desenho. O resto é conteúdo.**

### Trava 1 — Só INSERT

Zero `UPDATE` e zero `DELETE` sobre qualquer linha que já existe, em qualquer tabela. A base de
demonstração é feita **só de linhas novas**.

A única exceção admitida seria consertar uma linha que eu mesmo tivesse acabado de inserir, e
mesmo assim identificada pelo carimbo da trava 3.

### Trava 2 — Dono cravado, nunca deduzido

Todo `INSERT` escreve os identificadores da Repply **literalmente no texto do comando**, nunca
por subconsulta que "descubra" a empresa. Uma subconsulta errada acerta a empresa errada em
silêncio; um identificador cravado só pode acertar um alvo.

### Trava 3 — Carimbo em toda linha

Onde a coluna existe, `campos_extras` recebe:

```json
{ "_demo": true, "_lote": "2026-08-30" }
```

É o que permite localizar e remover a base inteira depois, sem depender de memória nem de
data de criação.

### Trava 4 — Censo antes e depois

Antes de qualquer inserção, conto as linhas de **cada empresa** nas tabelas do núcleo. Ao final,
conto de novo.

**Critério de aprovação: todo número de toda empresa que não seja a Repply tem de estar
idêntico.** Diferença de uma linha em qualquer lugar é erro meu, e a inserção é revertida.

### Trava 5 — Nenhum contato e nenhuma tarefa sem responsável

Pelo motivo da §2.5. Vale como conferência automática ao fim de cada lote:

```sql
select count(*) from contatos where usuario_id is null;  -- tem de continuar igual ao de antes
select count(*) from tarefas  where usuario_id is null;  -- idem
```

---

## 5. O conteúdo

| Bloco | Quantidade | Observação |
|---|---|---|
| Vendedores fictícios | 5 | Sem login. Papéis: 1 gestor, 4 vendedores |
| Fabricantes | 8 | §3.1 |
| Clientes | ~35 | Construtoras, lojas e um órgão público, de Natal e região |
| Contatos | ~60 | Todos com responsável (trava 5) |
| Obras | ~18 | Com coordenadas reais de Natal, para o mapa e a rota funcionarem |
| Negócios | ~150 | 12 meses, espalhados pelas 6 etapas |
| Histórico de etapas | 1 por movimentação | Sem isso o Radar de Risco e o "parado há X dias" ficam vazios |
| Comentários em negócios | ~40 | |
| Histórico de interações | ~50 | Módulo que tem 0 linhas até na MD |
| Metas | 8 fábricas × 12 meses + por vendedor | Alimenta o Plano de Vendas |
| Tarefas | ~25 | Nas 3 colunas |
| Compromissos | ~40 | Visitas a obra e reuniões |
| Rota de visita | 1 | Com paradas ordenadas |
| Marcadores de obra | 4 | Tabela `marcadores_obras`, hoje em 0. Não confundir com `marcadores` (§2.3), que já tem 3 e é de negócio/contato. A lista de obra nasce vazia por decisão de produto |
| Chat interno | 2 grupos, ~40 mensagens | |
| WhatsApp | ~12 conversas, ~180 mensagens | |
| E-mail | 1 caixa, ~30 mensagens, 4 marcadores | |

### 5.1 A regra das datas

Vale o `CLAUDE.md` §4.4: **`prazo_resposta` não é prazo — é a DATA DE FECHAMENTO**, e é dela que
saem todas as métricas de dinheiro.

- `data_pedido` — espalhado nos 12 meses. É por ele que a **taxa de conversão** conta.
- `prazo_resposta` — preenchido **só nos negócios ganhos e perdidos**, algumas semanas depois da
  criação. É por ele que o **faturamento** conta.
- Negócio ainda aberto fica **sem** data de fechamento. Inventar uma criaria exatamente a
  distorção que hoje existe na base da MD.

---

## 6. Como será executado

Um arquivo SQL versionado, `scripts/seed-demo-repply.sql`, executado pelo conector do Supabase
em lotes.

**Por que arquivo, e não comandos soltos:** mexer em produção sem registro do que entrou é o que
impede desfazer com segurança. O arquivo é o registro.

**Por que não é migration:** migration é estrutura, roda sozinha e vale para qualquer ambiente.
Isto é conteúdo de uma empresa específica e não pode rodar em lugar nenhum por conta própria.

Ordem dos lotes — cada um conferido antes do seguinte:

1. Censo inicial
2. Equipe e fabricantes
3. Clientes, contatos e obras
4. **Lote de prova: 3 negócios**, um deles já ganho — para verificar o gatilho da §8
5. O resto dos negócios, com histórico
6. Metas, tarefas, compromissos, rota
7. Chat, WhatsApp, e-mail
8. Censo final e conferência das travas

---

## 7. Como desfazer

A remoção completa é possível porque tudo carrega o carimbo da trava 3 e a corrente de dono da
§2.4. A ordem é **de baixo para cima**, senão as chaves estrangeiras recusam:

mensagens e histórico → negócios → obras → contatos → clientes → fabricantes → usuários fictícios

> 🔴 **A remoção é um `DELETE` em produção e NÃO faz parte desta etapa.** Fica escrita aqui para
> existir, não para ser executada sem conversa. Exclusão continua exigindo autorização.

---

## 8. Riscos e pontos a validar durante a execução

> **Atualização de 30/08/2026, depois da revisão do script:** os riscos 1 e 2 foram
> resolvidos na leitura do código, e a revisão encontrou **nove defeitos reais no script**
> — três deles fariam a execução abortar. Todos corrigidos antes de qualquer execução.
> O registro está na mensagem do commit `feat(demo)`.

| # | Risco | Como descubro | O que faço se acontecer |
|---|---|---|---|
| 1 | ✅ **Resolvido na leitura.** O gatilho `fn_set_pedido_fechado_em` **dispara** no INSERT e **respeita** a data de fechamento que vier preenchida — só carimba a de hoje quando ela chega vazia (migration `20260821120100:58-67`). O lote de prova continua existindo para confirmar na prática | — | — |
| 2 | ✅ **Resolvido, mas por outro mecanismo.** Quem segura a sincronização automática não é `ultima_sync_em`: é o `atualizado_em` das pastas recém-criadas (`Emails.tsx:326-338` lê a pasta, não a conta). A proteção vale 24h; depois disso a varredura dispara, não acha credencial e volta sem quebrar nada | Abrindo a tela depois do lote 7 | Nada a fazer — a falha é silenciosa e inofensiva |
| 2b | 🔴 **Aberto, e é operacional.** A caixa da demonstração com `status='conectada'` entra na rotina global de sincronização de e-mail a cada 15 minutos e **divide o orçamento de tempo com a caixa real da MD** (`email-sync/index.ts:119`, orçamento de 90s dividido pelo número de contas). Não quebra, mas encurta a janela da caixa que importa | — | Decisão do Lucas: ou a base demo é temporária e a linha sai ao fim das apresentações, ou o `email-sync` passa a ignorar conta sem credencial antes de dividir |
| 3 | O envio pela caixa de WhatsApp vai falhar na demonstração, porque não há número conectado | Conhecido de antemão | Avisar a equipe comercial: a caixa é para mostrar, não para enviar |
| 4 | O Portal de Consultas mostra licenças reais de órgãos públicos, compartilhadas entre empresas | Conhecido | É dado público, não de cliente. Fica como está |
| 5 | Outra sessão trabalha na mesma pasta e no mesmo banco | `git fetch` + `git status --short` antes de cada commit | Parar e avisar |

---

## 9. O que esta etapa NÃO faz

- ❌ Não altera **nenhuma linha de código do produto**
- ❌ Não cria tabela, coluna, migration ou qualquer mudança de estrutura
- ❌ Não toca em **nenhuma outra empresa** — verificado por censo
- ❌ Não cria login nenhum
- ❌ Não conecta WhatsApp nem e-mail de verdade; **nada é enviado a ninguém**
- ❌ Não conserta o vazamento da §2.5, que é decisão própria
- ❌ Não apaga nada

---

## 10. Critério de pronto

1. As 11 telas de seção com dado abrem cheias: Hoje, Dashboard, Negócios, Clientes, Obras,
   Fabricantes, Calendário, Tarefas, Chat, WhatsApp e E-mail. *(As outras duas seções do
   sistema ficam como estão: Portal mostra licença pública, e Configurações não recebe dado
   de demonstração.)*
2. O Kanban tem cartão nas 6 colunas.
3. O gráfico de faturamento mensal mostra 12 meses com valor.
4. O Plano de Vendas mostra meta e realizado por fábrica e por vendedor.
5. O mapa de Obras desenha pontos, e a rota de visita abre com paradas.
6. **O censo final é idêntico ao inicial para todas as empresas menos a Repply.**
7. `contatos` e `tarefas` sem responsável continuam no mesmo número de antes.
