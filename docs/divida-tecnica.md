# Dívida técnica — inventário

O que está quebrado, mal resolvido ou pendente neste sistema, com **o custo real** e **a
ordem de conserto**. Escrito para que ninguém precise redescobrir cada item.

Levantado em 19/08/2026, ao assumir o projeto da agência que o construiu. Itens 22 a 30
acrescentados em 21/08/2026.

> **Este documento não é lista de desejos.** Cada item aqui já tem consequência medida ou
> observada. Melhoria que ainda é opinião não entra.

---

## Resumo

| # | Item | Gravidade | Bloqueia? |
|---|---|---|---|
| 1 | [Chave do WhatsApp legível](#1-a-chave-do-whatsapp-está-legível) | **Crítica** | ⏳ Exposição fechada em 20/08. Restam 3 fases — [plano](operacao/plano-blindagem-whatsapp.md) |
| 2 | [Titularidade dos serviços](#2-titularidade-dos-serviços) | **Crítica** | Sim — impede aplicar mudança de banco |
| 3 | [Importação: formatação de datas](#3-importação--formatação-de-datas) | ✅ Resolvida | Código corrigido em `446779ff` |
| 4 | [Agendamentos nunca funcionaram](#4-os-agendamentos-nunca-funcionaram) | Alta | Não |
| 5 | [Cobertura de teste quase zero](#5-cobertura-de-teste-quase-zero) | Alta | Não |
| 6 | [Função `import-data` órfã](#6-função-import-data-órfã) | Média | Não |
| 7 | [Arquivos grandes demais](#7-arquivos-grandes-demais) | Média | Não |
| 8 | [Controle de seção é só cosmético](#8-controle-de-seção-é-só-cosmético) | Média | Sim — impede vender sem entregar o Portal |
| 9 | [Legado do Gmail](#9-legado-do-gmail) | Baixa | Não |
| 10 | [Resend preparado e nunca concluído](#10-resend-preparado-e-nunca-concluído) | Baixa | Não |
| 11 | [Apelidos de `vendedor`](#11-apelidos-de-vendedor) | Baixa | Não |
| 12 | [TypeScript configurado frouxo](#12-typescript-configurado-frouxo) | Baixa | Não |
| 13 | [Duas gerações de política em `clientes`](#13-duas-gerações-de-política-em-clientes) | **Alta** | Não |
| 14 | [Coluna `import_hash` sem migration](#14-coluna-import_hash-sem-migration) | Média | Não |
| 15 | [Código morto em `Negocios.tsx`](#15-código-morto-em-negociostsx) | Baixa | Não |
| 16 | [Webhook do WhatsApp aceita qualquer um](#16-o-webhook-do-whatsapp-aceita-qualquer-um) | **Crítica** | Não |
| 17 | [Instância fantasma na uazapi](#17-instância-fantasma-na-uazapi) | Média | Não |
| 18 | [O lint não passa](#18-o-lint-não-passa) | Média | Não |
| 19 | [11.903 negócios com data trocada](#19-11903-negócios-com-data-trocada-em-produção) | **Alta** | Distorce todo relatório por data |
| 20 | [Empresa "MD" duplicada com 6.374 negócios órfãos](#20-empresa-md-duplicada-com-6374-negócios-órfãos) | Média | Não |
| 21 | [Colunas de data com nome que não bate com a tela](#21-colunas-de-data-com-nome-que-não-bate-com-a-tela) | Média | Não |
| 22 | [Automação diária filtra por um slug que não existe](#22-a-automação-diária-filtra-por-um-slug-que-não-existe) | **Alta** | Não — mas manda alerta errado todo dia |
| 23 | [Etapa final é reconhecida por texto fixo](#23-etapa-final-é-reconhecida-por-texto-fixo-não-por-marca-na-tabela) | **Alta** | Sim — impede funil realmente configurável |
| 24 | [`SearchableSelect` identifica opção pelo rótulo](#24-searchableselect-identifica-a-opção-pelo-rótulo) | Média | Não |
| 25 | [522 tamanhos de fonte travados em pixel](#25-522-tamanhos-de-fonte-travados-em-pixel) | Média | Não |
| 26 | [Cabeçalho de página sem slot de ação](#26-o-cabeçalho-de-página-não-tem-slot-de-ação-e-7-páginas-o-remontam-à-mão) | Baixa | Não |
| 27 | [`src/data/mockData.ts` órfão](#27-srcdatamockdatats-é-arquivo-órfão) | Baixa | Não |
| 28 | [Busca de negócio filtra por lista de ids na URL](#28-a-busca-de-negócio-filtra-por-lista-de-ids-na-url-e-por-isso-tem-teto) | Média | Não — mas a busca fica incompleta com termo curto |

---

## 1. A chave do WhatsApp está legível

**Gravidade: crítica. Exposição pública fechada em 20/08/2026; o resto em aberto.**

> **Leia primeiro:** [`operacao/plano-blindagem-whatsapp.md`](operacao/plano-blindagem-whatsapp.md)
> — as 5 fases, o que já foi feito e o que falta.

### O que é

As funções do WhatsApp gravam o pacote inteiro recebido da uazapi, cru, numa tabela de
diagnóstico chamada `webhook_debug`. A uazapi manda o **próprio token da instância dentro
do pacote**. Ninguém decidiu salvar a chave: decidiram salvar tudo, e a chave veio junto.

Medido em 05/08/2026, e **remedido em 20/08/2026**. O número real era quase o triplo do que
a auditoria da agência registrava:

| | Auditoria (05/08) | Medido (20/08) |
|---|---|---|
| Linhas na tabela | ~61.000 | **71.008** · 74 MB |
| Linhas com o `api_key` em texto puro | ~1.621 | **4.725** |
| Linhas com telefone de cliente | não medido | **53.847** (piso) |
| Linhas expondo o `instance_name` | não medido | **4.774** |
| Crescimento | não medido | ~1.200 linhas/dia |

A exposição não era teórica: uma requisição real ao PostgREST com a chave publicável do
site, **sem sessão**, devolveu `HTTP 200` e `Content-Range: 0-0/71009`. Era também o único
achado de nível **ERROR** entre os 197 avisos de segurança do projeto
(`rls_disabled_in_public`).

**A consequência que só apareceu na remedição:** a tabela publicava *as duas metades do
ataque* — a senha **e** o nome da instância. Por isso o
[item 16](#16-o-webhook-do-whatsapp-aceita-qualquer-um) nunca dependeu de alguém adivinhar
o nome da instância.

**Exposição fechada em 20/08/2026** (`20260820121510_webhook_debug_fecha_acesso_publico.sql`):
RLS ligada, zero políticas, sem concessão para `anon`/`authenticated` — o padrão que
`email_webhook_eventos`, `stripe_eventos`, `email_conta_grants` e `email_conexao_estados`
já usavam. A leitura anônima passou a devolver `HTTP 401`, e as Edge Functions continuam
gravando via `service_role` (conferido: a tabela seguiu recebendo linhas depois da mudança).

**O que continua em aberto:** a senha segue sendo gravada a cada evento, as 4.725 linhas
antigas continuam guardadas, e o webhook segue sem autenticação.

### O que isso permite

O `api_key` é a senha do WhatsApp da empresa no servidor da uazapi. Quem o tiver **não
precisa entrar no Repply**: fala direto com a uazapi e consegue ler todas as conversas,
enviar mensagem se passando pela empresa e desconectar o número.

Com a RLS desabilitada, basta ter a **chave publicável do app** — que vai dentro do
JavaScript do site e é pública por natureza. Não é "a agência consegue"; é **qualquer
pessoa que abra o código do site**.

### Como aconteceu

A tabela **não foi criada por migration** — não existe `CREATE TABLE webhook_debug` em
nenhum dos 252 arquivos. Foi criada à mão pelo painel do Supabase e, por isso, nunca
passou por revisão de código. É o motivo pelo qual escapou de todos.

> **Registrado por honestidade.** A auditoria herdada
> ([`docs/arquitetura/integracoes-externas.md`](arquitetura/integracoes-externas.md))
> descreve isso como risco "mantido por decisão do dono do produto". O dono do produto
> confirmou em 19/08/2026 que **a decisão não foi dele**. Isso não é risco aceito; é
> dívida a pagar.

### A ordem do conserto — errar a ordem tranca todo mundo

1. **Apagar o token das linhas já existentes**
2. **Parar de gravá-lo** (limpar o payload antes de inserir, nas funções que gravam)
3. **Criar a política de acesso**
4. **Só então ligar a RLS**

Ligar a RLS antes de existir política bloqueia todo mundo, inclusive o diagnóstico.

### Não termina aí

O próprio site entrega o token ao navegador no fluxo de conectar por QR Code:
`src/hooks/use-whatsapp-inbox.ts` fala **direto com a uazapi** usando
`config.api_key`. Limpar a tabela fecha metade do buraco; a outra metade é tirar essa
conversa do navegador — passando o fluxo de conexão por uma função de borda.

### Quem grava em `webhook_debug` hoje

`whatsapp-webhook` · `whatsapp-send` · `whatsapp-send-reaction` · `whatsapp-delete-message`

---

## 2. Titularidade dos serviços

**Gravidade: crítica. Fora do código.**

Situação em 19/08/2026:

| Item | Situação |
|---|---|
| Domínio, Stripe, Nylas, arquivo de ambiente | ✅ Resolvidos |
| **Supabase** | ⚠️ Conta acessível, projeto ainda em organização de terceiro |
| **GitHub** | ⚠️ Temos envio, repositório em conta pessoal do desenvolvedor anterior |
| Vercel, uazapi, Google Cloud | ❌ Pendentes |
| Gemini / Lovable AI / Resend | ❔ Titular a confirmar |
| Lovable | ✅ Dispensado (último commit do robô em 19/06/2026) |

### Por que é o item mais grave da lista

Duas razões:

1. **Bloqueia trabalho.** Enquanto o projeto Supabase não for da Repply, toda mudança de
   banco pode ser **escrita mas não aplicada nem testada** — e é aí que vive a maior parte
   do trabalho neste sistema.
2. **É a alavanca real de risco.** Quem controla o projeto Supabase e o repositório tem a
   chave-mestra do banco inteiro, acesso muito maior do que qualquer falha do código
   concede. Concluir a transferência vale mais, em segurança, do que o item 1 desta lista.

### Ainda

Uma chave do Google Maps já circulou em texto puro no histórico do repositório e foi
rotacionada. **Toda credencial que passou pelo histórico deve ser tratada como
comprometida.**

---

## 3. Importação — formatação de datas

**Gravidade: alta. ✅ O CÓDIGO FOI CORRIGIDO em 19/08/2026 (`446779ff`).**
**Os dados já gravados, não — ver [item 19](#19-11903-negócios-com-data-trocada-em-produção).**

A migração da base da MD Representações do Bitrix24 para o Repply estava travada por um
problema de formatação de datas na importação de planilha. **A causa era outra do que se
supunha:** nada era rejeitado — as datas entravam com dia e mês trocados, em silêncio, em
26,7% dos casos.

A causa tinha dois elos: o parser convertia a data em texto no formato americano (porque o
Bitrix exporta a data como número sem formato de célula), e a conversão seguinte tinha que
adivinhar se aquele texto era brasileiro ou americano. O conserto foi parar de jogar fora a
informação exata que existia na célula. Verificado contra 26.181 datas reais: de 73,3% para
100% de acerto.

**Onde olhar:**

- `sanitizeFieldValue` em `src/components/import/MappingStep.tsx` — é o caminho real de
  conversão de data, determinístico, com a regra brasileira de desambiguação
  (dia primeiro em casos como `05/03/2024`)
- [`docs/modulos/importacao.md`](modulos/importacao.md) — estrutura completa do fluxo
- As linhas que falham vão para `linhas_ignoradas_importacao` e podem ser revistas em
  `/importacao/ignoradas` — é por lá que se reproduz o problema com dado real

**Critério de pronto:** uma exportação real do Bitrix importa sem nenhuma linha ignorada
por causa de data, e as contagens conferem com a origem.

---

## 4. Os agendamentos nunca funcionaram

**Gravidade: alta.**

Dois agendamentos existem no banco:

| Agendamento | Frequência | O que deveria fazer |
|---|---|---|
| `eventos-lembrete` | 5 minutos | Enviar lembrete de evento do calendário |
| `email-sync` | 15 minutos | Atualizar o espelho da caixa de e-mail |

**Nenhum dos dois jamais executou com sucesso.** Em 05/08/2026 havia **3.656 execuções
registradas, todas com falha**, desde a criação em 23/07.

**Consequência real:** lembrete de evento nunca foi enviado a ninguém, e a caixa de e-mail
só atualiza quando alguém clica em atualizar na tela.

### Como conferir

```sql
select j.jobname, d.status, count(*), max(d.start_time), max(d.return_message)
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
group by 1, 2;
```

### São três causas empilhadas — a de cima esconde as de baixo

**Causa 1 — `cron.use_background_workers = off`** → erro de tempo esgotado ao iniciar.
Com o parâmetro desligado, o `pg_cron` abre conexão em `cron.host` e não consegue
autenticar. É parâmetro de contexto `postmaster`: **exige reiniciar o banco**
(Dashboard → Settings → Database → Custom Postgres Config).

**Causa 2 — `app.settings.service_role_key` não definida** → HTTP 401. O comando monta um
cabeçalho de autorização vazio e a função de borda recusa. Nem está no cofre de segredos.

```sql
ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role>';
```

*(A chave fica em Dashboard → Settings → API. **Nunca commite.**)*

**Causa 3 — precedência de operador no comando** → `22P02 invalid input syntax for json`.
O `::` liga mais forte que o `||`, então só o `"}` final era convertido. **Já corrigido**
em `20260805123341_corrige_precedencia_jsonb_nos_crons.sql`; o padrão certo é envolver a
concatenação inteira em parênteses antes da conversão.

### Validar depois de resolver 1 e 2

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/email-sync',
  headers := ('{"Content-Type":"application/json","Authorization":"Bearer '
              || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
  body := '{"limit":50}'::jsonb);

-- alguns segundos depois:
select id, status_code, left(content, 200) from net._http_response order by id desc limit 1;
```

---

## 5. Cobertura de teste quase zero

**Gravidade: alta.**

**10 arquivos de teste, 152 casos, para 78 mil linhas de código.** Eram 7 arquivos em
19/08/2026.

```
src/components/import-pedidos/importPedidosUtils.test.ts    7 casos
src/hooks/use-pedidos-filtro-data.test.ts                    6   (20/08 — filtro por fechamento)
src/hooks/whatsapp-phone.test.ts                            12
src/lib/erro-edge-function.test.ts                          12
src/lib/import/file-parser.test.ts                           4
src/lib/lazy-com-retry.test.ts                               4   (+10 por it.each)
src/lib/moeda.test.ts                                       26   (21/08 — dinheiro em PT-BR)
src/lib/plano-gate.test.ts                                  44
src/lib/situacao-empresa.test.ts                            20
src/test/example.test.ts                                     1
```

Agrava dois outros fatos:

- **A Vercel publica sozinha a cada envio para `main`** — não há etapa manual entre o
  commit e o cliente
- **O TypeScript está frouxo** (item 12) — o compilador também não segura o erro

É por isso que este projeto exige **autorização do Lucas antes de cada commit**
(`CLAUDE.md` §13). O projeto chegou a experimentar branch + Pull Request em 19/08/2026 e
reverteu no mesmo dia: a barreira é humana, não é o PR.

### Por onde começar

Os testes que existem já apontam o caminho: são exatamente as regras que **quebraram em
produção** (número de telefone, portão de plano, situação da empresa, erro de versão).
Priorize na mesma lógica:

1. Conversão de data na importação — é a prioridade zero do produto
2. `has_permission` e as políticas de acesso
3. Normalização de status e resolução de entidade na importação

---

## 6. Função `import-data` órfã

**Gravidade: média.**

`supabase/functions/import-data/index.ts` (290 linhas) **não está integrada ao fluxo da
interface** — nada em `src/` a invoca. E ela converte datas **usando IA (Gemini)**, sem a
regra brasileira de desambiguação que o caminho real aplica.

Já está marcada como obsoleta dentro do próprio arquivo (commit `f58578e8`).

**Decisão pendente:** integrar alinhando a regra de data, ou remover. Enquanto ficar no
repositório sem uso, é uma armadilha para quem procurar "onde a importação converte data"
e achar ela primeiro.

---

## 7. Arquivos grandes demais

**Gravidade: média.**

| Arquivo | Linhas |
|---|---|
| `src/pages/WhatsAppInbox.tsx` | 7.838 |
| `src/pages/Negocios.tsx` | 2.698 |
| `src/pages/Emails.tsx` | 2.298 |
| `src/pages/Chat.tsx` | 2.282 |
| `src/pages/Clientes.tsx` | 1.960 |
| `supabase/functions/whatsapp-webhook/index.ts` | 1.091 |

O custo não é estético: arquivo desse tamanho **não cabe de uma vez na cabeça de quem
edita** — nem humano nem assistente — e mudanças pequenas viram risco grande porque o
estado é compartilhado por tudo dentro do arquivo.

**Como tratar:** não parta para uma refatoração grande de propósito. Ao encostar num
desses arquivos por outro motivo, **extraia o pedaço que você tocou** para um componente
ou hook próprio. Diminui de forma incremental, sem parar a operação.

---

## 8. Controle de seção é só cosmético

**Gravidade: média. Bloqueia venda.**

`sidebar_empresa_padrao` define o **layout do menu** de cada empresa. Isso esconde o item
da barra lateral — **e nada mais**. A rota continua acessível e os dados continuam
chegando para quem digitar o endereço.

**Por que bloqueia venda:** o Portal de Consultas é exclusividade da MD Representações. Sem
um controle real, vender para outra empresa significa entregar o Portal junto.

Ver [`SPEC.md` §9](../SPEC.md), Fase 2.

---

## 9. Legado do Gmail

**Gravidade: baixa.**

O e-mail migrou para o **Nylas** em agosto de 2026, mas o código do Gmail ficou:

- `src/hooks/useGmail.ts`
- `src/components/email/GmailSettings.tsx`
- Funções de borda `gmail-auth-url`, `gmail-callback`, `gmail-send`, `gmail-sync-inbox`,
  `gmail-debug`
- Tabela `gmail_tokens`
- A coluna `gmail_message_id`, que hoje guarda um identificador do Nylas

**Custo:** confunde quem lê. Documentos herdados descreviam o Gmail como se fosse o
provedor atual — e estavam errados há semanas.

**Antes de remover:** confirme que nenhuma caixa ainda está conectada pelo caminho antigo.

---

## 10. Resend preparado e nunca concluído

**Gravidade: baixa.**

As tabelas `user_integrations` (com `resend_api_key`, `resend_from_email`) e
`user_domains` (com `resend_domain_id`) existem, mas **não há função de borda de envio via
Resend**. É integração começada e abandonada.

**Decisão pendente:** concluir ou remover as tabelas.

---

## 11. Apelidos de `vendedor`

**Gravidade: baixa.**

A tabela `vendedores` virou `usuarios` em abril de 2026, mas os nomes antigos sobraram:

- `historico_contatos.vendedor_id`
- Funções `get_my_vendedor_id()`, `vendedor_in_my_empresa()`
- A visão `vw_indicadores_vendedor`
- `is_gestor()` (nome mantido, semântica ampliada — ver
  [permissões](arquitetura/permissoes-e-rls.md))

> ⚠️ **Não remova sem varrer todas as políticas de segurança.** Várias ainda chamam os
> apelidos. Remover uma função usada por política derruba o acesso da tabela inteira, e o
> sintoma aparece como "sumiu tudo".

---

## 12. TypeScript configurado frouxo

**Gravidade: baixa, mas é multiplicador dos outros itens.**

`strictNullChecks: false`, `noImplicitAny: false`, variáveis e parâmetros sem uso não
sinalizados.

**Consequência:** o compilador não avisa sobre valor nulo nem sobre tipo implícito — as
duas categorias de erro mais comuns em código que fala com banco. Somado à ausência de
teste (item 5), o erro chega em produção.

**Como tratar:** apertar de uma vez geraria centenas de erros e pararia o projeto. O
caminho é apertar por arquivo, à medida que os arquivos forem tocados por outro motivo.

---

## 13. Duas gerações de política em `clientes`

**Gravidade: alta. É segurança, não organização.**

Coexistem duas políticas de acesso multi-empresa na tabela `clientes`:

| Migration | Baseada em |
|---|---|
| `20260413223933_...` | `vendedor_in_my_empresa(vendedor_id)` |
| `20260504172116_...` | `empresa_id` direto |

**Não há evidência no código de que a antiga tenha sido desativada.**

### Por que importa

No Postgres, políticas `PERMISSIVE` se **somam**: o resultado efetivo é a **união** das
duas, não a interseção. Ou seja, o acesso final é **mais permissivo do que qualquer uma
das duas isoladamente** — quase certamente não é o que se pretendia ao escrever a segunda.

### Como conferir

```sql
select policyname, permissive, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'clientes';
```

Se aparecerem as duas gerações, decida qual fica e **remova a outra em migration própria**.
Enquanto isso não for feito, ninguém sabe de verdade quem enxerga a carteira de clientes de
quem.

Vale repetir a conferência nas outras tabelas que passaram pela mesma renomeação de
`vendedores` para `usuarios`.

---

## 14. Coluna `import_hash` sem migration

**Gravidade: média.**

`src/hooks/use-bulk-import.ts` lê e escreve `pedidos.import_hash` para evitar importar a
mesma linha duas vezes. Mas **nenhuma migration cria essa coluna**, e ela não aparece em
`src/integrations/supabase/types.ts`.

Duas explicações possíveis, e as duas são problema:

- A coluna existe no banco real, criada fora do fluxo de migration — então as migrations
  não reconstroem o banco de verdade, e um ambiente novo nasceria quebrado
- A coluna não existe — então **a deduplicação da importação não funciona em produção**, e
  reimportar o mesmo arquivo duplica negócios silenciosamente

**Confirme contra o banco real** antes de confiar na deduplicação. É especialmente
relevante porque a importação é a prioridade zero (item 3).

---

## 15. Código morto em `Negocios.tsx`

**Gravidade: baixa.**

`ImportDialog` / `ImportDataDialog` continuam importados e renderizados em
`src/pages/Negocios.tsx` sem nenhum botão que os acione. O equivalente já foi removido de
`Clientes.tsx` (commit `c899bdb`), mas não aqui.

Custa pouco remover e evita que alguém tente "consertar" um caminho de importação que
ninguém usa.

---

## 16. O webhook do WhatsApp aceita qualquer um

**Gravidade: crítica. Em aberto. Confirmado no código em 19/08/2026.**

### O que é

`supabase/functions/whatsapp-webhook/index.ts` é público por natureza — a uazapi precisa
alcançá-lo, e por isso está com `verify_jwt = false` em `supabase/config.toml`
(corretamente: a uazapi não envia sessão).

O problema é o que existe **no lugar** da sessão: **nada.**

- A instância é identificada por um parâmetro na URL: `?instance=<nome>`
- A coluna `configuracoes_wapi.webhook_secret` **existe, é lida na consulta, e nunca é
  conferida**
- Não há verificação de assinatura nem de HMAC sobre o corpo

### O que isso permite

Qualquer pessoa que descubra ou adivinhe o nome da instância pode, com uma requisição
simples:

- **Injetar mensagens** na caixa de entrada de WhatsApp da empresa, como se um cliente
  tivesse escrito
- **Mudar o status de conexão** da instância

O vendedor abre o sistema e vê uma conversa que nunca existiu. Não há como distinguir da
verdadeira.

### Compare com os outros webhooks do mesmo sistema

Os outros dois endpoints públicos **fazem** a verificação:

| Endpoint | Como prova que é quem diz ser |
|---|---|
| `stripe-webhook` | Assinatura em `stripe-signature`, conferida na função |
| `email-webhook` | HMAC em `x-nylas-signature`, conferido sobre o corpo cru |
| **`whatsapp-webhook`** | **Nada** |

Ou seja, o padrão correto já está implementado duas vezes no mesmo repositório. Falta
aplicá-lo aqui.

### O conserto

Validar o `webhook_secret` que já existe no schema — ou, melhor, HMAC do corpo, seguindo o
que `email-webhook` faz. Configure o segredo na uazapi ao provisionar a instância
(`whatsapp-provision` já configura a URL do webhook; é o mesmo ponto).

> Junto com o [item 1](#1-a-chave-do-whatsapp-está-legível), forma o par de falhas abertas
> no módulo de WhatsApp. **Os dois são fase 1 do roadmap.**
>
> **Não é preciso adivinhar o nome da instância:** ele estava publicado em 4.774 linhas da
> `webhook_debug`, legível sem sessão até 20/08/2026 (ver item 1).
>
> Conserto planejado na Fase 3 de
> [`operacao/plano-blindagem-whatsapp.md`](operacao/plano-blindagem-whatsapp.md), em modo
> observação antes de passar a recusar — ligar a conferência de uma vez faria 100% das
> mensagens pararem de chegar em silêncio, acidente que já aconteceu aqui (`0715119`).

---

## 17. Instância fantasma na uazapi

**Gravidade: média.**

Dois problemas no provisionamento (`whatsapp-provision`):

1. **`deleteOrphanInstance()` engole qualquer erro** e segue em frente. Resultado possível:
   instância criada na uazapi, nunca associada nem removida corretamente no banco —
   consumindo vaga e licença na uazapi sem estar rastreada aqui.
2. **Condição de corrida na reutilização de instância:** entre conferir se a empresa já tem
   instância e inserir o vínculo não há transação nem trava. Dois usuários provisionando
   ao mesmo tempo colidem. O código trata o erro de duplicidade como sucesso — é rede de
   proteção, não correção.

**Conserto mínimo:** registrar a falha da limpeza em algum lugar auditável, em vez de
engolir em silêncio. Sem isso, ninguém descobre a instância fantasma até a conta da uazapi
não fechar.

---

## 18. O lint não passa

**Gravidade: média. Medido em 19/08/2026 no `main`.**

```
✖ 498 problems (458 errors, 40 warnings)
  5 errors and 1 warning potentially fixable with the `--fix` option.
```

### Por que importa mais do que parece

Um lint que já falha **deixa de ser sinal**. Quando o número é 458, ninguém percebe que
virou 459 — e o erro novo, que era exatamente o que a ferramenta existia para pegar,
passa. Somado à [ausência de teste](#5-cobertura-de-teste-quase-zero) e ao
[TypeScript frouxo](#12-typescript-configurado-frouxo), o projeto fica sem nenhuma rede
automática entre o commit e o cliente.

### O critério enquanto isso não for resolvido

**Não é "o lint passou". É "o número não subiu."** Rode antes, guarde o total, rode depois,
compare.

### Como sair disso

1. Rodar `npm run lint -- --fix` resolve 5 erros e 1 aviso de imediato
2. Classificar os 458 por regra — provavelmente poucas regras respondem pela maioria
3. Decidir, regra a regra: **corrigir** ou **desligar de propósito**, com o motivo escrito
   na configuração. Regra desligada conscientemente é honesta; regra ligada e violada 458
   vezes é ruído
4. Só depois disso faz sentido exigir lint limpo em Pull Request

---

## 19. 11.903 negócios com data trocada em produção

**Gravidade: alta. Mapeado, não reparado.**

A importação da base do Bitrix24 gravou dia e mês invertidos em parte das datas. O código
que causava isso **foi corrigido** em `446779ff`, mas o que já está gravado continua
errado.

### O tamanho

| Medida | Valor |
|---|---|
| Datas conferidas nos 8 arquivos reais | 26.181 |
| Convertidas erradas pelo código antigo | **26,7%** |
| Negócios da MD vindos de importação | 11.903 de 11.905 |
| Colunas de data afetadas | `data_pedido`, `prazo_resposta`, `created_at` (e possivelmente `fechado_em`) |

### O sintoma que a MD via

Filtro por data de fechamento devolvendo número que não batia com a realidade. Onde a
planilha diz que existem **6 negócios** fechando de setembro a dezembro de 2026, o sistema
mostra **~180**.

### Por que não dá para consertar com uma regra

**A corrupção não é uniforme.** Na amostra do arquivo de agosto, 8 negócios estão com a
data errada e **5 estão com a data certa**. Uma regra do tipo "troca dia por mês onde o dia
for ≤ 12" consertaria uns e estragaria os outros.

O reparo tem que ser linha a linha, pela chave `import_hash` — que é única para cada uma
das 11.903 linhas.

> **Plano completo, com cópia de segurança, validação e volta atrás:**
> [`docs/operacao/plano-reparo-datas.md`](operacao/plano-reparo-datas.md). Proposto, **não
> executado** — depende de autorização.

### Dois achados novos, medidos em 21/08/2026

Vieram à tona quando o Dashboard passou a contar dinheiro por data de fechamento
(`prazo_resposta`) — antes disso ninguém somava por essa coluna, então o estrago não
aparecia.

| Achado | Tamanho | Consequência |
|---|---|---|
| Negócios em etapa final com data de **fechamento anterior à de criação** | **445**, somando R$ **6.879.618,26**. Defasagem de 1 a 73 dias; **411** caem num mês diferente do de criação | Esse dinheiro está hoje empurrado para um mês em que não aconteceu, no Faturamento Mensal e no Plano de Vendas |
| Negócios em etapa final **sem nenhuma** data de fechamento | **2** | Invisíveis em qualquer relatório por fechamento |

A causa do primeiro: na planilha do Bitrix aquela coluna era data **prevista** de
fechamento, e nunca foi corrigida depois que a venda saiu.

**Diagnóstico e comandos de reparo estão prontos e comentados no fim de
`supabase/migrations/20260821120100_data_fechamento_em_todos_os_caminhos.sql`. Nada foi
executado.** Se for rodado, R$ 6,88 milhões trocam de mês na tela — quem já olhou meta
batida ou comissão com os números atuais precisa ser avisado **antes**.

Negócio novo não consegue mais entrar em etapa final sem data: o gatilho
`fn_set_pedido_fechado_em` passou a garantir isso (ver Resolvidos, 21/08/2026).

### O diagnóstico dos 2 negócios sem data — a versão que funciona

> ⚠️ **O bloco comentado da migration convida a rodar uma consulta que não roda.** Na linha
> 171 de `20260821120100_data_fechamento_em_todos_os_caminhos.sql`, sob o título
> "Diagnóstico:", a consulta pede `p.nome_negocio` — **coluna que não existe**. A coluna
> certa é `p.nome` (confira em `src/integrations/supabase/types.ts`). Quem copiar o bloco
> como está recebe `ERROR: 42703: column p.nome_negocio does not exist` no meio de uma
> investigação, e o mais provável é concluir que a migration está errada em vez de
> desconfiar do nome do campo.
>
> **A migration não pode ser corrigida** — ela já rodou em produção e o arquivo é o
> registro do que rodou (`CLAUDE.md` §6.3). Por isso a versão boa mora aqui.

```sql
-- Os negócios em etapa final que ficaram sem data de fechamento.
-- Confirmado em 21/08/2026 na produção: continuam sendo 2.
SELECT p.id, p.nome, p.status, p.data_pedido, p.prazo_resposta, p.fechado_em
FROM public.pedidos p
WHERE p.status IN ('fechamento', 'perdido') AND p.prazo_resposta IS NULL;
```

O **reparo** proposto (o `UPDATE` que puxa a data do histórico de status e cai na data de
criação quando não há registro) está logo abaixo do diagnóstico na mesma migration e
**não tem esse erro** — ele só cita `id`, `status` e as colunas de data. Pode ser copiado
como está, depois de autorizado.

---

## 20. Empresa "MD" duplicada com 6.374 negócios órfãos

**Gravidade: média.**

Existem duas empresas no banco com dados da MD:

| Empresa | Criada | Usuários | Negócios | Período dos negócios |
|---|---|---|---|---|
| **MD** | 25/06/2026 **16:49** | 2 | **6.374** | jun/2022 a dez/2023 |
| **MD Representações** | 25/06/2026 **17:38** | 13 | 11.905 | jan/2022 a "dez/2026" |

A primeira foi criada 49 minutos antes da segunda, tem uma importação parcial e nenhum
usuário da equipe real. Tudo indica **primeira tentativa de importação abandonada**.

### Por que importa

Ninguém da MD enxerga esses negócios — a segurança por linha separa por empresa. Mas eles:

- ocupam espaço e entram em todo backup
- **distorcem qualquer contagem global** (foi o que me fez reportar "18.279 negócios"
  quando a MD tem 11.905)
- confundem quem consultar o banco direto no futuro

### Decisão pendente

Apagar, manter como histórico, ou investigar antes. É decisão do dono do produto e
**independente do reparo das datas**.

---

*Ao resolver um item, mova-o para uma seção "Resolvidos" no fim deste documento, com a
data e o commit — o histórico do que já doeu é o que impede repetir.*

---

## 21. Colunas de data com nome que não bate com a tela

**Gravidade: média. Adiada de propósito para depois do reparo das datas.**

Três colunas de `pedidos` guardam coisa diferente do que o nome diz:

| Coluna | O nome sugere | O que realmente guarda |
|---|---|---|
| `data_pedido` | Data do pedido | **Data de criação** do negócio |
| `prazo_resposta` | Prazo de resposta | **Data de fechamento** |
| `created_at` | Quando a linha entrou no sistema | Para a base importada, **a data que veio da planilha** |

E o mesmo campo aparece com dois rótulos diferentes conforme a tela: `prazo_resposta` é
"Data de Fechamento" na ficha do negócio e "Prazo de resposta" na configuração de campos.

### Por que importa

Nome de coluna que mente é dívida silenciosa: cada pessoa que chega perde tempo
descobrindo, e alguém acaba consultando o campo errado. Foi exatamente o que aconteceu com
o filtro de período — ver [§10.8 do SPEC](../SPEC.md) e a entrada em Resolvidos.

### Por que foi adiada

Renomear coluna tem raio grande: tipos gerados, hooks, consultas, políticas de segurança,
visões, funções de banco e funções de borda. Num projeto com lint que já falha e cobertura
de teste baixa ([§5](#5-cobertura-de-teste-quase-zero), [§18](#18-o-lint-não-passa)), é
onde o erro passa despercebido.

**Decisão do dono do produto em 20/08/2026:** primeiro consertar os dados, que doem hoje;
a renomeação vira tarefa própria depois, com calma.

### Ordem sugerida quando for a hora

1. `prazo_resposta` → `data_fechamento`
2. `data_pedido` → `data_criacao` (nome que `clientes` já usa, e que a tela já mostra)
3. Padronizar os rótulos: um campo, um nome, em todas as telas
4. Só então avaliar se `created_at` e `data_criacao` continuam ambos necessários

---

## 22. A automação diária filtra por um slug que não existe

**Gravidade: alta. Confirmado no código em 21/08/2026.**

`supabase/functions/automacao-diaria/index.ts:44` exclui do follow-up os negócios já
encerrados assim:

```ts
.not("status", "in", '("fechado","perdido")')
```

**`'fechado'` não existe.** Os slugs reais, semeados em
`20260418175245_...sql:44-48` e no gatilho de empresa nova, são:

```
novo_lead · elaboracao · enviado · negociacao · fechamento · perdido
```

`'fechado'` era o nome antigo, abandonado quando as visões foram reescritas para
`'fechamento'` em `20260426171830_...sql`. A função de borda ficou para trás.

### O que acontece na prática

`'perdido'` casa e é excluído certo. `'fechamento'` **não casa com nada**, então negócio
já **ganho** continua no filtro, e a linha 52 (`if (!pedido) continue; // already closed`)
nunca o descarta. Resultado: o vendedor recebe **"⚠️ Follow-up atrasado"** para venda que
já fechou. É o inverso do que o comentário do código promete — não deixa de disparar,
dispara demais.

### Está no banco também

A definição vigente de `vw_pedidos_inativos` — que a mesma função consome na segunda parte
(linha 101) — repete o slug morto:

`20260504172116_d58aba56-...sql:79` → `WHERE p.status NOT IN ('fechado', 'perdido');`

Ou seja, negócio ganho e parado também gera **"🔴 Pedido parado há N dias"**.

Terceira ocorrência: `supabase/functions/import-data/index.ts:38`, no prompt que descreve
os status válidos — mas essa função é órfã (item 6).

**Conserto:** trocar `'fechado'` por `'fechamento'` nos três pontos. O da visão exige
migration nova (nunca editar a existente). É barato e para de gastar a confiança do
vendedor nas notificações do sistema.

---

## 23. Etapa final é reconhecida por texto fixo, não por marca na tabela

**Gravidade: alta. Bloqueia a promessa de funil configurável.**

`kanban_colunas` é anunciada como configurável por empresa e por funil (`SPEC.md` §10.1).
Mas **não existe nenhuma coluna que diga "esta etapa encerra o negócio"**. Conferido: as
colunas são `id, empresa_id, slug, nome, cor, ordem, is_sistema, created_at, updated_at`
(`20260418175245_...sql:2-13`) mais `funil_id` (`20260722140000_funis.sql:46`). Busca por
`is_final`, `etapa_final`, `is_ganho`, `tipo_etapa` nas 260 migrations: **zero**.

`is_sistema` **não serve**: marca "coluna padrão, não pode apagar" — e inclui `novo_lead`,
`elaboracao`, `enviado` e `negociacao`.

No lugar disso, o sistema compara texto. **8 pontos de decisão no frontend:**

| Arquivo | Como decide |
|---|---|
| `src/hooks/use-pedidos.ts:110` | `ETAPAS_FINAIS_ATENCAO = '(fechamento,perdido)'` — usado em 3 consultas |
| `src/hooks/use-edit-pedido.ts:8` | `ETAPAS_FINAIS = ['fechamento', 'perdido']` |
| `src/pages/Negocios.tsx:214` | `status === 'fechamento' \|\| status === 'perdido'` |
| `src/components/pedidos/kanban/KanbanCard.tsx:27` | idêntico, duplicado |
| `src/pages/EditarPedido.tsx:201` | `['fechamento', 'perdido'].includes(...)` |
| `src/components/pedidos/ImportPedidosDialog.tsx:63` | `new Set(['fechamento', 'perdido'])` |
| `src/components/pedidos/kanban/KanbanColunasDialog.tsx:169` | `slug === 'perdido' \|\| slug === 'fechamento'` |
| `src/components/import-pedidos/importPedidosUtils.ts:182` | **regex sobre o nome**: `/fech/`, `/ganho/`, `/won/`… |

E no banco, **71 linhas de migration** comparam `status` com `'fechamento'` ou `'fechado'`
literal — inclusive o gatilho da data de fechamento e todo o faturamento do Dashboard.

Ainda: `src/types/index.ts:1` fixa as etapas no compilador **sem `'perdido'`**:

```ts
export type KanbanStage = 'novo_lead' | 'elaboracao' | 'enviado' | 'negociacao' | 'fechamento';
```

### A contradição que fecha o argumento

Nada impede uma empresa criar a etapa **"Contrato Assinado"** como final. Se criar, aquele
negócio **não conta no faturamento**, não recebe data de fechamento, e continua gerando
alerta de negócio parado — porque o sistema inteiro só reconhece a palavra `'fechamento'`.

**Conserto:** uma coluna em `kanban_colunas` (`tipo_final`: `ganho` / `perdido` / `null`),
migration de backfill a partir dos slugs atuais, e trocar as comparações por consulta a
essa marca. É trabalho de raio grande — mas enquanto não for feito, "funil configurável"
só vale enquanto ninguém configurar de verdade.

---

## 24. `SearchableSelect` identifica a opção pelo rótulo

**Gravidade: média. Medido em 21/08/2026.**

`src/components/shared/SearchableSelect.tsx` é usado em **20 lugares, em 15 arquivos** —
cliente, obra, fabricante, vendedor, marcador. As opções são montadas com **id no `value`
e nome livre no `label`**.

O valor que ele **salva** é o id, e isso está certo: `onValueChange(option.value)` na
linha 116. **Renomear um item não quebra a seleção gravada** — essa parte, que parecia ser
o problema, não é.

O defeito real está uma camada abaixo. Na linha 114 o componente entrega o **rótulo** ao
cmdk como valor interno do item:

```tsx
key={option.value}
value={option.label}      // <- o cmdk passa a identificar o item por aqui
```

E a rolagem inicial procura pelo rótulo no DOM (linha 72,
`querySelector('[data-value="${scrollToLabel}"]')`).

### O que isso quebra

No cmdk 1.1.1, o item calcula `aria-selected` comparando o valor registrado (= o rótulo)
com o valor atual do Command, e a navegação por teclado pega **o primeiro do DOM**.
Com **duas opções de mesmo nome** — duas obras "Ed. Solar", dois clientes com a mesma
razão social:

- as duas ficam com `aria-selected="true"` ao mesmo tempo;
- **Enter sempre escolhe a primeira**. Não existe jeito de alcançar a segunda pelo
  teclado (o clique de mouse ainda acerta, porque usa closure);
- `scrollToLabel` também sempre cai na primeira, e **quebra o seletor CSS** se o rótulo
  contiver aspas.

Nome repetido não é caso raro neste domínio: obra com o mesmo nome em cidades diferentes e
cliente com filiais são o normal.

**Conserto:** passar `value={option.value}` ao `CommandItem` e mover o texto pesquisável
para `keywords`, que é o que o cmdk oferece exatamente para isso.

---

## 25. 522 tamanhos de fonte travados em pixel

**Gravidade: média. Contado em 21/08/2026.**

| Padrão | Ocorrências em `src/` |
|---|---|
| `text-[NNpx]` | **522** |
| `font-size: NNpx` em CSS cru | 5 — **legítimas**, são HTML de e-mail (`src/lib/assinatura-email.ts`, `src/pages/Emails.tsx:782`), onde cliente de e-mail exige px inline |

Três valores respondem por 92% do total: `text-[10px]` (315), `text-[11px]` (129),
`text-[9px]` (42). Há até `text-[6px]`.

Concentração: `WhatsAppInbox.tsx` (84), `Chat.tsx` (52), `MappingStep.tsx` (29),
`Negocios.tsx` (26), `Clientes.tsx` (21).

### Por que importa

Tamanho em pixel **ignora a preferência de letra grande** do navegador e do sistema. Quem
aumenta a fonte porque não enxerga bem não vê diferença nenhuma nessas 522 ocorrências —
elas continuam em 10px. O sistema é usado por representantes que passam o dia nele.

E some-se à causa estrutural da responsividade (ver Resolvidos, 21/08/2026): o app tira a
rolagem do documento, então o que não cabe fica **invisível**, sem barra de rolagem. Fonte
maior aqui não é só conforto — é o que decide se o texto existe na tela.

**Conserto:** trocar por `text-xs` / `text-sm` (que são `rem` e respeitam a preferência),
ou por tokens próprios se 12px for grande demais para o caso. Não vale uma varredura em
massa — troque quando estiver mexendo no arquivo por outro motivo, começando pelos cinco
arquivos da concentração.

---

## 26. O cabeçalho de página não tem slot de ação, e 7 páginas o remontam à mão

**Gravidade: baixa. Confirmado em 21/08/2026.**

> Correção de uma suposição: **o cabeçalho compartilhado existe.** É o próprio
> `AppLayout` (`src/components/layout/AppLayout.tsx:12-18`), com `title` e `subtitle`, e
> **17 páginas o usam certo**.

O problema é a porta de fuga da linha 54, `{headerContent ?? (...)}`. Como o `AppLayout`
**não oferece um slot para o botão de ação à direita**, quem precisa de um botão no
cabeçalho abandona `title`/`subtitle` e remonta o bloco inteiro:

`NovoPedido.tsx:13-20` · `ContatoDetalhe.tsx:165-180` · `EditarPedido.tsx:417-432` ·
`Chat.tsx:1241` · `ClienteDetalhe.tsx:389` · `WhatsAppInbox.tsx:5572`

O caso mais gritante é **`src/pages/Obras.tsx:325-333`**, que passa `title` **e**
`subtitle` **e também** `headerContent` reproduzindo o mesmo markup — os dois primeiros
ficam mortos.

A string de classe do título aparece **12 vezes em 10 arquivos**. Custo: mudar o
cabeçalho exige achar as 12 cópias, e quem esquece uma deixa uma página fora do padrão
sem ninguém notar.

**Conserto:** acrescentar `acoes?: ReactNode` ao `AppLayout`, renderizado à direita do
título, e devolver essas 7 páginas para `title`/`subtitle`. `headerContent` fica só para
cabeçalho de verdade diferente (Chat e WhatsApp, que têm o contato no lugar do título).

---

## 27. `src/data/mockData.ts` é arquivo órfão

**Gravidade: baixa. Conferido em 21/08/2026.**

> Correção de uma suposição: **não é dado falso rodando em produção.** A varredura por
> `mockOrders`, `mockClients`, `mockFabricantes`, `mockVendedores`, `mockContacts` e
> `KANBAN_STAGES` em `src/` devolve **zero imports**, e "Construtora Alpha" não aparece no
> pacote publicado. Nenhuma tela usa.

50 linhas, único arquivo de `src/data/`. Contém 8 negócios fictícios, 3 clientes com CNPJ
falso, 5 fabricantes, 4 vendedores com e-mail `@md.com.br`, 3 contatos e um
`KANBAN_STAGES` de 5 etapas fixas — **sem "Perdido"**.

Aquela lista fixa **já causou bug**, e o comentário que registra isso continua no código:

`src/pages/ClienteDetalhe.tsx:75` — as etapas vinham de `@/data/mockData` com 5 valores,
sem "Perdido", e quem abria a ficha do cliente não conseguia filtrar os negócios perdidos
dele. Hoje `ClienteDetalhe.tsx:82` e `Negocios.tsx:401` montam as etapas a partir de
`useKanbanColunasEmpresa`.

**O custo hoje é de leitura, não de execução:** quem procurar "quais são as etapas do
funil" acha primeiro a lista morta de 5 valores e conclui que "Perdido" não existe.

**Conserto:** apagar o arquivo. Confirme antes que nada em `supabase/functions/` o
referencia.

---

## 28. A busca de negócio filtra por lista de ids na URL, e por isso tem teto

**Gravidade: média. Sintoma agudo tapado em 21/08/2026 (`0935a27c`); a causa continua.**

Buscar um negócio por nome de cliente ou de fabricante exige casar contra **outra tabela**.
O PostgREST não filtra `pedidos` por uma coluna de `clientes` embutida no `select()`, então
o código faz em dois passos: primeiro descobre **os ids** de cliente e de fabricante que
batem com o termo, depois filtra `pedidos` por esses ids num `.or()`.

**O problema é que esse `.or()` viaja na URL.** Cada id ocupa cerca de 37 bytes ali dentro.
Medido nesta base em 21/08/2026 (2.109 clientes no total):

| Termo digitado | Clientes que casam | O que isso gera |
|---|---|---|
| `co` — começo de **Co**nstrutora, **Co**mércio, **Co**ndomínio | **1.066** | URL de **~39 KB**. O servidor recusa antes de a consulta chegar ao banco |
| `ar` | **783** | ~29 KB |
| `cons` | **603** | ~22 KB |
| `co`, casando só por **prefixo** (`ilike 'co%'`) | **244** | ~9 KB — melhora muito, e ainda assim não cabe num teto de 60 |

As **contagens** acima foram medidas no banco; os tamanhos de URL saem da mesma conta de
~37 bytes por id. Ou seja: a busca falhava **justamente nos termos mais usados do ramo**, e
falhava com cara de erro genérico.

### O que foi feito (e o que ficou faltando)

`0935a27c` pôs um teto: `PEDIDOS_OPTIONS_TETO_IDS = 60`
(`src/hooks/use-pedidos.ts:373`), com `order` antes do `limit` para que a mesma busca não
devolva 60 clientes diferentes a cada digitada. A busca **sempre responde** agora — em
troca, **fica incompleta quando o termo é curto e comum**: com "co", 60 clientes de 1.066
entram no filtro, e os negócios dos outros 1.006 só aparecem se o **nome do próprio
negócio** casar com o termo. `TarefaFormDialog` avisa na tela que a lista pode estar
cortada, o que é honesto, mas não é a mesma coisa que achar o negócio.

**O conserto definitivo é uma RPC `SECURITY DEFINER`** que faça o casamento do texto
**dentro do banco**, sem trafegar id nenhum pela URL. É exatamente o padrão que o
`CLAUDE.md` §7.4 já manda usar para busca textual, e que `wa_buscar_mensagens` já usa
(12.013 ms → 22 ms). Some o teto, some a URL gigante e some o problema de índice sob RLS de
uma vez só.

### 🔴 São DOIS lugares, e o outro é anterior e pior

`resolveSearchMatches` (`src/hooks/use-pedidos.ts:140`) — que alimenta a **busca da tela de
Negócios**, não a do formulário de tarefas — tem o **mesmo defeito** e **nenhum teto
escrito no código**:

```ts
supabase.from('clientes').select('id').ilike('empresa', `%${trimmedSearch}%`)
```

Sem `order`, sem `limit`. O que segura o tamanho hoje é o teto padrão de linhas do próprio
PostgREST, que ninguém escolheu para este caso. O resultado vai inteiro para
`buildSearchOrClause` e daí para a URL. É código mais antigo que o do formulário de
tarefas, e está na tela que a MD usa o dia todo.

> **Quando a RPC for feita, as duas migram juntas.** Migrar só uma deixa o sistema com duas
> buscas que respondem coisas diferentes para o mesmo termo digitado — e a que continuar
> por id vai seguir quebrando em silêncio nos termos comuns, agora sem ninguém procurando
> por isso.

---

## 29. O filtro de período do WhatsApp abre no mês errado

**Gravidade: baixa. Não bloqueia — mas é o último calendário do sistema com o defeito.**

Em 21/08/2026 os 18 calendários do sistema ganharam `defaultMonth` (ver `CLAUDE.md` §7.13).
**Um ficou de fora:** `src/pages/WhatsAppInbox.tsx:4168`, o filtro de período das conversas,
que é `mode="range"` e não passa nem `month` nem `defaultMonth`.

Não foi tocado de propósito: outro desenvolvedor estava trabalhando naquele arquivo na mesma
janela, e mexer nele arriscava desfazer trabalho em andamento. **Isso precisa ser passado
para ele** — é uma propriedade, no formato:

```tsx
<Calendar mode="range" defaultMonth={mesDoCalendario(range?.from, range?.to)} … />
```

O utilitário está em `src/components/shared/mes-calendario.ts`. O diálogo de exportar
conversas do mesmo módulo **já foi consertado**, porque usa o `DateRangePicker`
compartilhado — nenhum arquivo da área do WhatsApp foi editado para isso.

---

## 30. Miudezas do módulo Calendário

**Gravidade: baixa. Três defeitos anteriores, encontrados ao mexer nos seletores de data.**

Nenhum foi corrigido em 21/08/2026 porque os três mudam comportamento e precisam de decisão
do Lucas, não de conserto técnico.

**(a) O mini calendário fica parado ao clicar num dia de fora do mês.**
`src/pages/Calendario.tsx:161-165` — `handleMiniCalendarSelect` faz `setCurrentDate(date)`
sem `setMonth(date)`. Como `showOutsideDays` é `true` por padrão (`ui/calendar.tsx:12`),
clicar num dia da borda muda a agenda para outro mês e o mini calendário continua exibindo o
mês antigo. A navegação pelo cabeçalho está certa (`setMonth(nextDate)`, linha 155).

**(b) O campo Fim do evento não acompanha o Início.**
`src/components/calendar/EventDialog.tsx:224` — pôr o Início em 15/03/2024 deixa o Fim na
data de hoje. O calendário do Fim abre no mês do que está gravado (hoje), então o conserto de
21/08 está correto e o incômodo permanece. Resolver de verdade é fazer o Fim seguir o Início
preservando a duração — comportamento novo.

**(c) Ligar "Dia inteiro" no meio do preenchimento esvazia o campo.**
`src/components/calendar/EventDateTimeField.tsx:23-28` + `EventDialog.tsx:217-230` — o `type`
muda mas o texto guardado não é reformatado. Com date-fns 3.6,
`parse("2024-03-15T10:00", "yyyy-MM-dd", …)` devolve data inválida e o campo passa a mostrar
"Selecionar" até a pessoa reescolher. O campo fica visivelmente vazio, então não engana
ninguém — mas obriga a redigitar.

---

## Resolvidos

### 21/08/2026 — calendário e data escolhida

> ✅ **Commitado e no ar** (`99c45394` e `2c1583c4`).

**O dia clicado era gravado como o dia anterior.** Os quatro campos de data dos formulários
de negócio convertiam fuso com
`new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000)`. Como a gravação usa
`format(d,'yyyy-MM-dd')`, que lê o fuso LOCAL, a conversão recuava a data um dia inteiro.
Medido com `TZ=America/Sao_Paulo`: clicar em `2024-03-15` gravava `2024-03-14`; clicar no dia
1º de março gravava `2024-02-29`, jogando o negócio para o mês anterior. Escapou por dois
anos porque só 4 negócios nasceram dentro do CRM. Detalhe em `CLAUDE.md` §7.12.

**Os 18 calendários abriam no mês de hoje.** `react-day-picker` v8 ignora `selected` ao
decidir o mês inicial, e o projeto não passava `defaultMonth` em lugar nenhum — filtrar
março/2024, fechar e reabrir custava 29 cliques na setinha. Corrigidos todos, mais o
`DateRangePicker`, que precisou da forma controlada porque as abas De/Até compartilham a
mesma instância. Novo utilitário: `src/components/shared/mes-calendario.ts`. Detalhe em
`CLAUDE.md` §7.13.

**Quatro calendários não tinham navegação nenhuma** — sem setas e sem nome do mês, presos no
mês atual sem saída (os dois campos de período do histórico em Configurações → Usuários e
os dois de Próximo Contato). Ganharam `captionLayout="dropdown-buttons"`.

Ficou pendente o filtro do WhatsApp (item 29) e as miudezas do Calendário (item 30).

### 21/08/2026 — leva de dashboard, data de fechamento, dinheiro e responsividade

> ✅ **Commitado e no ar; as duas migrations foram aplicadas.** Conferido no banco em
> 21/08/2026: existem `dashboard_stats`, `plano_vendas_progresso(p_date_from, p_date_to)` e
> o gatilho `trg_pedidos_set_fechado_em`. Cada linha desta seção já é fato na tela do
> cliente.
>
> As migrations são `20260821120000_dashboard_datas_por_fechamento.sql` e
> `20260821120100_data_fechamento_em_todos_os_caminhos.sql`. **Nenhuma das duas pode ser
> editada** — o arquivo é o registro do que rodou (`CLAUDE.md` §6.3). Correção do
> diagnóstico comentado que ficou com erro de digitação: [item 19](#19-11903-negócios-com-data-trocada-em-produção).

| O que estava errado | Como foi resolvido |
|---|---|
| **O Dashboard contava dinheiro pela data de criação.** Todas as funções recortavam por `data_pedido`, inclusive as de dinheiro. Um negócio criado em 28/junho e fechado em 3/julho entrava no faturamento de **junho** e sumia da meta de julho | Faturamento Total, Negócios Fechados, Ticket Médio, Faturamento por Fábrica, Rendimento por Responsável, Faturamento Mensal e Plano de Vendas passam a contar por `prazo_resposta`. Taxa de Conversão, Conversão por Vendedor e Segmentação por Ticket continuam por criação, de propósito (conta de safra). Detalhe métrica a métrica em [`modulos/dashboard.md`](modulos/dashboard.md) |
| **"Negócios Fechados" e o Ticket Médio saíam do contador errado** — usavam o numerador da taxa de conversão ("criados no período que já ganharam"), não "fecharam no período". Em ago/2026 são **62 contra 45** | `dashboard_stats` ganhou duas CTEs (`base_criados`, `base_fechados`) e o campo novo `pedidos_fechados_periodo`. Cada tela lê o seu |
| **Plano de Vendas mostrava só um mês e não avisava.** A função só sabia olhar `p_ano`/`p_mes`, e a tela mandava o mês da data inicial — filtrar "01/jan a 31/dez" devolvia **janeiro e mais nada** | `plano_vendas_progresso` e `..._por_vendedor` passam a receber intervalo e somam as metas de todos os meses tocados. As assinaturas antigas viraram atalho de compatibilidade |
| **O selo "+X% últ. mês" ficava travado em "+0%" verde para sempre** — comparava com o penúltimo item da lista **já filtrada**, e no período padrão só existe um mês | O mês anterior passa a sair da lista completa. Sem mês anterior no histórico, o selo não é desenhado, em vez de mentir zero |
| **Mês inteiro sumia do gráfico de Faturamento Mensal** quando o dia 1 caía fora do filtro: "15/jan a 20/ago" apagava janeiro, sem aviso | O mês entra quando **se sobrepõe** ao período, não quando o dia 1 cai dentro |
| **Dois cartões para o mesmo número:** "Rendimento por Fábrica" (barras) mostrava exatamente o mesmo array da rosca "Faturamento por Fábrica" | Cartão de barras removido. Ver `SPEC.md` §10.11 |
| **A data de fechamento só era carimbada em 2 dos 6 caminhos** que mudam o status de um negócio. Perder um negócio não registrava o dia da perda; salvar a ficha de um negócio ganho com o campo em branco **apagava** a data (`use-edit-pedido.ts:75`); excluir uma etapa do kanban podia marcar centenas de negócios como ganhos, todos sem data | A regra saiu da tela e foi para o gatilho `fn_set_pedido_fechado_em`, que agora manda em `prazo_resposta` além de `fechado_em`, cobre `'fechamento'` **e** `'perdido'`, respeita a data que o usuário digitou no mesmo salvamento, mantém a data ao reabrir (`SPEC.md` §10.10) e tem rede de segurança contra etapa final sem data |
| **Data carimbada no dia errado depois das 21h.** O banco roda em UTC: `current_date` já é o dia seguinte, e uma venda fechada às 21h30 de 31/agosto cairia na meta de setembro | O dia sai convertido para `America/Sao_Paulo` |
| **A importação deixava linha perdida sem data** chegar vazia ao gatilho, saindo carimbada com o dia da importação — o mesmo mecanismo que envenenou `fechado_em` | `ImportPedidosDialog.tsx` passou a usar a data de criação como substituta para `'fechamento'` **e** `'perdido'` |
| **Campo de dinheiro era `<Input type="number">` cru, em 10 lugares.** Três negócios foram gravados **mil vezes maiores** que o certo — o pior `106.387.320,00` no lugar de `106.387,32` — sem nada na tela indicar erro. Causa: `type="number"` devolve string vazia para `"99.888,47"`, a roda do mouse altera o valor sozinha, e `parseFloat("99.888,47")` devolve `99.888` | Novos `src/lib/moeda.ts` (26 testes) e `src/components/shared/CampoMoeda.tsx`, com máscara brasileira, `type="text"` e cursor ancorado na contagem de dígitos. Armadilha registrada em `CLAUDE.md` §7.10 |
| **Modal mais alto que a janela prendia o usuário na tela.** O `DialogContent` do shadcn não tem teto de altura nem rolagem, e o projeto desligou Esc e clique-fora — Salvar sumia por baixo e o "X" por cima **ao mesmo tempo**. Já acontecia em notebook 1366x768 sem zoom | Novo `src/components/shared/DialogoResponsivo.tsx` (teto em `dvh`, miolo com rolagem própria), adotado em 16 telas. Armadilha registrada em `CLAUDE.md` §7.11 |
| **A tira de abas era cortada em tela estreita.** Em Configurações, as últimas abas (Campos e Empresa) simplesmente sumiam no celular, sem barra de rolagem em lugar nenhum — funcionalidade inteira inacessível, sem nada indicando que existia | `src/lib/toggle-group-styles.ts` ganhou `max-w-full overflow-x-auto`, `[&>*]:shrink-0` e `justify-start` |
| **Em Fabricantes o botão "Novo" era literalmente recortado**, e `xl:col-span-3` fazia a coluna **encolher ~100px** ao cruzar 1280px — era por isso que reduzir o zoom um passo piorava antes de melhorar, e o cliente precisava reduzir várias vezes | `flex-wrap` no cabeçalho do card, `min-w-0` no título, `shrink-0` nos botões; `2xl:col-span-3` no lugar de `xl:`; altura `h-full` no lugar de `h-[795px]` fixos |
| **Faltava busca em 10 pontos** onde a lista já não cabe no olho: contatos, negócio na tarefa, linhas ignoradas, filtros de fabricante e marcador em Negócios, marcador nos formulários, fabricante padrão do catálogo, marcadores de e-mail e referência do produto | Barras de busca acrescentadas. A de negócio na tarefa vai ao **servidor** a partir de 2 letras (com 300ms de represa) — dropdown com teto de 50 resultados, não relatório |
| **A busca de negócio recém-criada montava uma URL de 39 KB e o servidor recusava.** O termo "co" — começo de Construtora, Comércio e Condomínio — casa com **1.066** clientes, e cada id ocupa ~37 bytes no filtro que viaja na URL. Falhava justamente nos termos mais usados do ramo | `0935a27c` — teto de 60 ids (`PEDIDOS_OPTIONS_TETO_IDS`), com `order` antes do `limit` para o resultado não mudar sozinho entre uma digitada e outra, e aviso na tela quando a lista sai cortada. **É contenção, não cura:** a causa e o conserto definitivo (RPC `SECURITY DEFINER`) estão no [item 28](#28-a-busca-de-negócio-filtra-por-lista-de-ids-na-url-e-por-isso-tem-teto) |

**A causa estrutural da responsividade continua de pé e precisa estar registrada:** o app
tira a rolagem do documento (`src/index.css:165` — `html, body, #root { overflow: hidden }`)
e **14 páginas** repassam `overflow-hidden` ao conteúdo via `mainClassName`. A consequência
é que **o que não cabe fica invisível, sem barra de rolagem em lugar nenhum** — não fica
pequeno, não fica cortado com aviso: some. Foi assim com as abas de Configurações e com o
botão "Novo" de Fabricantes.

Os consertos acima são centrais (teto de altura no diálogo, `flex-wrap` na tira de abas,
margem `p-3 sm:p-4 md:p-6`), mas **não removem a causa**. Enquanto a rolagem do documento
estiver desligada, todo componente novo precisa se conter sozinho — e quem esquecer não
recebe nenhum sinal. Também é o que torna o [item 25](#25-522-tamanhos-de-fonte-travados-em-pixel)
mais grave do que parece: aumentar a fonte pode fazer conteúdo desaparecer.

### Anteriores

| Item | Quando | Como |
|---|---|---|
| **Filtro "data de fechamento" mostrava a base inteira** — usava `fechado_em`, carimbada pelo gatilho no momento da importação, então os 11.714 negócios importados apareciam como fechados em 18–19/08/2026. Filtrar agosto devolvia 11.715 negócios em vez de 107 | 20/08/2026 | `46137a97` — filtro passa a usar `prazo_resposta`, que tem o mesmo significado para venda importada e cadastrada à mão. Índice novo e 6 testes fixando a regra |
| **`fabricantes` e `tabela_precos` eram globais entre todas as empresas** — uma empresa via o catálogo e os preços cadastrados por outra | 19/08/2026 | `20260819124247_fabricantes_e_precos_por_empresa.sql` e `20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql` |
| **Precedência de operador no comando dos agendamentos**, que gerava `22P02 invalid input syntax for json` | 05/08/2026 | `20260805123341_corrige_precedencia_jsonb_nos_crons.sql`. *Não resolveu o item 4 — era só a terceira das três causas* |
| **Tabela `wapi_instancia_usuarios` sem migration** — criada à mão, ninguém conseguia recriar o banco do zero | 01/07/2026 | `20260701000000_wapi_instancia_usuarios_retroativa.sql`, com `CREATE TABLE IF NOT EXISTS` documentando o schema real |
| **`whatsapp-webhook` rejeitava 100% dos eventos com 401** — não estava em `config.toml`, então valia `verify_jwt = true` e o gateway barrava antes do código. Sintoma: instância `connected` na uazapi e `disconnected` no banco | commit `0715119` | `[functions.whatsapp-webhook] verify_jwt = false` |
| **Identificador de grupo do WhatsApp quebrado** por limpeza de não-dígitos, que apagava o hífen do formato antigo | 05/08/2026 | Silencioso por meses: a uazapi respondia sucesso e não entregava nada |
| **Nono dígito enfiado em telefone fixo**, que respondia por 100% das falhas de envio | — | `normalizeWhatsappPhone`, com testes fixando o contrato em `src/hooks/whatsapp-phone.test.ts` |
