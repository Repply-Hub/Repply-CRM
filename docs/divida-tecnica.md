# Dívida técnica — inventário

O que está quebrado, mal resolvido ou pendente neste sistema, com **o custo real** e **a
ordem de conserto**. Escrito para que ninguém precise redescobrir cada item.

Levantado em 19/08/2026, ao assumir o projeto da agência que o construiu. Itens 22 a 31
acrescentados em 21/08/2026; o 58 em 30/08/2026; o 59 e o 60 em 31/08/2026.

> **Este documento não é lista de desejos.** Cada item aqui já tem consequência medida ou
> observada. Melhoria que ainda é opinião não entra.

---

## Resumo

| # | Item | Gravidade | Bloqueia? |
|---|---|---|---|
| 1 | [Chave do WhatsApp legível](#1-a-chave-do-whatsapp-está-legível) | **Crítica** | ⏳ Exposição fechada em 20/08. Restam 3 fases — [plano](operacao/plano-blindagem-whatsapp.md) |
| 2 | [Titularidade dos serviços](#2-titularidade-dos-serviços) | **Crítica** | Sim — impede aplicar mudança de banco |
| 3 | [Importação: formatação de datas](#3-importação--formatação-de-datas) | **Alta** | ✅ código corrigido em 01/09/2026 (item 40) · ⚠️ o dado gravado continua errado |
| 4 | [Agendamentos nunca funcionaram](#4-os-agendamentos-nunca-funcionaram) | Alta | Não |
| 5 | [Cobertura de teste quase zero](#5-cobertura-de-teste-quase-zero) | Alta | Não |
| 6 | [Função `import-data` órfã](#6-função-import-data-órfã) | Média | Não |
| 7 | [Arquivos grandes demais](#7-arquivos-grandes-demais) | Média | Não |
| 8 | [Controle de seção é só cosmético](#8-controle-de-seção-é-só-cosmético) | ✅ Resolvido | Já existe em produção — item desatualizado, corrigido em 28/08 |
| 9 | [Legado do Gmail](#9-legado-do-gmail) | Baixa | Não |
| 10 | [Resend preparado e nunca concluído](#10-resend-preparado-e-nunca-concluído) | Baixa | Não |
| 11 | [Apelidos de `vendedor`](#11-apelidos-de-vendedor) | Baixa | Não |
| 12 | [TypeScript configurado frouxo](#12-typescript-configurado-frouxo) | Baixa | Não |
| 13 | [Duas gerações de política em `clientes`](#13-duas-gerações-de-política-em-clientes) | ✅ Resolvida | Corrigido na migration `20260826120000` |
| 14 | [Coluna `import_hash` sem migration](#14-coluna-import_hash-sem-migration) | Média | Não |
| 15 | [Código morto em `Negocios.tsx`](#15-código-morto-em-negociostsx) | Baixa | Não |
| 16 | [Webhook do WhatsApp aceita qualquer um](#16-o-webhook-do-whatsapp-aceita-qualquer-um) | **Crítica** | Não |
| 17 | [Instância fantasma na uazapi](#17-instância-fantasma-na-uazapi) | Média | Não |
| 18 | [O lint não passa](#18-o-lint-não-passa) | Média | Não |
| 19 | [11.903 negócios com data trocada](#19-11903-negócios-com-data-trocada-em-produção) | **Alta** | Distorce todo relatório por data |
| 20 | [Empresa "MD" duplicada com 6.374 negócios órfãos](#20-empresa-md-duplicada-com-6374-negócios-órfãos) | Média | Não |
| 21 | [Colunas de data com nome que não bate com a tela](#21-colunas-de-data-com-nome-que-não-bate-com-a-tela) | Média | Não |
| 22 | [Automação diária nunca rodou, e tem 5 defeitos em série](#22-a-automação-diária-nunca-rodou-e-tem-cinco-defeitos-em-série) | Baixa hoje, **Alta** se agendada | Não — está dormente, nunca criou notificação |
| 23 | [Etapa final é reconhecida por texto fixo](#23-etapa-final-é-reconhecida-por-texto-fixo-não-por-marca-na-tabela) | **Alta** | Sim — impede funil realmente configurável |
| 24 | [`SearchableSelect` identifica opção pelo rótulo](#24-searchableselect-identifica-a-opção-pelo-rótulo) | Média | Não |
| 25 | [522 tamanhos de fonte travados em pixel](#25-522-tamanhos-de-fonte-travados-em-pixel) | Média | Não |
| 26 | [Cabeçalho de página sem slot de ação](#26-o-cabeçalho-de-página-não-tem-slot-de-ação-e-7-páginas-o-remontam-à-mão) | Baixa | Não |
| 27 | [`src/data/mockData.ts` órfão](#27-srcdatamockdatats-é-arquivo-órfão) | Baixa | Não |
| 28 | [Busca de negócio filtra por lista de ids na URL](#28-a-busca-de-negócio-filtra-por-lista-de-ids-na-url-e-por-isso-tem-teto) | Média | Não — mas a busca fica incompleta com termo curto |
| 29 | [Filtro de período do WhatsApp abre no mês errado](#29-o-filtro-de-período-do-whatsapp-abre-no-mês-errado) | Baixa | Não — último calendário com o defeito |
| 30 | [Miudezas do módulo Calendário](#30-miudezas-do-módulo-calendário) | Baixa | Não |
| 31 | [Exceções da seleção em massa viajam na URL](#31-a-lista-de-exceções-da-seleção-em-massa-viaja-na-url-e-trava-em-800) | Média | Trava a operação acima de ~800 e não explica por quê |
| 32 | [Cópia sem uso da chave do Resend no Vault](#32-cópia-sem-uso-da-chave-do-resend-no-vault) | Baixa | Não — higiene de credencial |
| 33 | [O WhatsApp não tem contagem de envio nenhuma](#33-o-whatsapp-não-tem-contagem-de-envio-nenhuma) | **Alta** | Não hoje — mas um número da MD é compartilhado por 13 pessoas, sem trava |
| 34 | [A etapa da configuração não é verificada contra a tela](#34-a-etapa-gravada-na-configuração-não-é-verificada-contra-a-tela) | Média | Já travou o Novo Negócio 3 vezes — campo obrigatório sem onde preencher |
| 35 | [Logo de e-mail é um arquivo único para todas as empresas](#35-logo-de-e-mail-é-um-arquivo-único-para-todas-as-empresas) | ✅ Resolvida | Corrigido na migration `20260831140000` |
| 36 | [Matriz de permissões ainda decorativa em criar/editar, e em 3 módulos que não são tabela](#36-matriz-de-permissões-ainda-decorativa-em-criareditar-e-em-3-módulos-que-não-são-tabela) | Média | Não — falsa sensação de controle, não vazamento |
| 36 | [As 8 visões `v_md_*` entregam a carteira de clientes sem login](#36-as-8-visões-v_md_-entregam-a-carteira-de-clientes-sem-login) | **Crítica** | Sim — 1.305 clientes legíveis sem login |
| 37 | [A pré-visualização de anexo executa o HTML do arquivo](#37-a-pré-visualização-de-anexo-executa-o-html-do-arquivo-recebido) | **Crítica** | Sim — arquivo de estranho roda na sessão de quem abre |
| 38 | [Excluir usuário não tira o acesso](#38-excluir-usuário-não-tira-o-acesso) | **Crítica** | Latente — 0 excluídos hoje, mas não há como revogar |
| 39 | [Excluir etapa do Kanban move negócios mesmo quando o banco recusa](#39-excluir-etapa-do-kanban-move-os-negócios-mesmo-quando-o-banco-recusa) | **Crítica** | Sim — pode carimbar centenas como fechados hoje |
| 40 | [O conserto de datas não alcança a tela de Negócios](#40--o-conserto-de-datas-da-importação-não-alcança-a-tela-de-negócios) | **Crítica** | **Sim — reabre a prioridade zero** |
| 41 | [Duas funções do banco atravessam a fronteira entre empresas](#41-duas-funções-do-banco-atravessam-a-fronteira-entre-empresas) | ✅ Resolvido | Corrigido na migration `20260829120000` — a tela só acompanhou em 31/08 |
| 42 | [Funções de servidor abertas sem motivo, e duas sem conferir quem chamou](#42-seis-funções-de-servidor-abertas-sem-motivo-escrito-e-duas-sem-conferir-quem-chamou) | Alta | Não |
| 43 | [Os 22.276 arquivos do Storage podem ser LISTADOS sem login](#43-os-22276-arquivos-do-storage-podem-ser-listados-sem-login) | Alta | Complementa o plano dos baldes |
| 44 | [A matriz de permissões só é conferida em 2 dos 15 módulos](#44-a-matriz-de-permissões-só-é-conferida-pelo-banco-em-2-dos-15-módulos) | Alta | Não — mas a tela promete o que não entrega |
| 45 | [Não existe conferência automática, e o `git push` publica](#45-não-existe-conferência-automática--e-agora-o-git-push-publica) | Alta | Não — protege todo o resto |
| 46 | [`types.ts` com 21 objetos fora de sincronia, e dá para regerar](#46-typests-tem-21-objetos-fora-de-sincronia-e-pode-ser-regerado) | Alta | Não |
| 47 | ["Salvo" quando o banco recusou — o mesmo defeito em 4 telas](#47-salvo-quando-o-banco-recusou--o-mesmo-defeito-em-quatro-telas) | Alta | Não |
| 48 | [O Radar de Risco conta edição de campo como movimento](#48-o-radar-de-risco-conta-edição-de-campo-como-movimento) | Alta | Não — R$ 5,0 mi no lugar de R$ 14,4 mi |
| 49 | [O filtro "Etapa" não filtra, em dois lugares](#49-o-filtro-etapa-não-filtra-em-dois-lugares) | Alta | Não — mas a Ação em massa não tem desfazer |
| 50 | [A soma em reais do Kanban usa só os cartões carregados](#50-a-soma-em-reais-do-kanban-usa-só-os-cartões-carregados) | Alta | Não |
| 51 | [O Calendário mostra menos de 10% dos prazos, e um dia antes](#51-o-calendário-mostra-menos-de-10-dos-prazos-e-desenha-um-dia-antes) | Alta | Não |
| 52 | [Importar contatos cria construtoras duplicadas](#52-importar-contatos-cria-construtoras-duplicadas) | Alta | Suja a base a cada importação |
| 53 | [Ler clientes é ~130× mais caro por linha que ler negócios](#53-ler-a-lista-de-clientes-é-130-mais-caro-por-linha-do-que-ler-negócios) | Média | Não hoje — piora sozinho |
| 54 | [`app_erros` mistura desenvolvimento e produção](#54-app_erros-mistura-desenvolvimento-e-produção-e-ninguém-olha) | Média | Não |
| 55 | [Coisas que deveriam ser por empresa e são globais](#55-coisas-que-deveriam-ser-por-empresa-e-são-compartilhadas-por-todas) | Média | Não |
| 56 | [Onze pontos da documentação afirmam o que não é verdade](#56-onze-pontos-da-documentação-afirmam-coisa-que-não-é-verdade-hoje) | Média | Não |
| 57 | [Os módulos que justificam o produto estão vazios](#57-os-módulos-que-justificam-o-produto-estão-vazios) | Produto | Decisão de produto pendente |
| 58 | [Contato sem responsável aparece para TODAS as empresas](#58-contato-sem-responsável-aparece-para-todas-as-empresas) | **Alta** | Latente — 0 órfãos hoje, mas 3 caminhos podem criar um |
| 59 | [O link de redefinir senha aponta para `localhost`](#59-o-link-de-redefinir-senha-aponta-para-localhost) | **Alta** | **Sim — ninguém consegue redefinir a própria senha hoje.** O conserto é de painel |
| 60 | [O ranking de vendedores chega inteiro no navegador de todo mundo](#60-o-ranking-de-vendedores-chega-inteiro-no-navegador-de-todo-mundo) | **Alta** | Não — mas entrega pela porta dos fundos o que foi fechado pela da frente em 31/08 |

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
| **GitHub** | ✅ **Resolvido em 22/08/2026** — o repositório saiu da conta pessoal do desenvolvedor anterior e passou a ser `Repply-Hub/Repply-CRM`. Confirmado pelo endereço de envio do `origin` |
| Vercel, uazapi, Google Cloud | ❌ Pendentes |
| Gemini / Lovable AI / Resend | ❔ Titular a confirmar |
| Lovable | ✅ Dispensado (último commit do robô em 19/06/2026) |

> **A pasta `.lovable/` foi removida do repositório em 22/08/2026**, no commit `c6ad4ea4`.
> Eram dois arquivos de memória do robô (`plan.md` e uma nota de banco de dados), sem uso
> desde que ele foi dispensado.
>
> Registrado aqui porque a remoção **pegou carona num commit de conserto de link** e a
> mensagem daquele commit não a menciona: os arquivos já estavam na fila de commit,
> preparados por outra sessão de trabalho, e foram junto. Quem for ler o histórico não teria
> como entender por que um conserto de navegação apagou arquivos do Lovable.
>
> Isto **não** afeta a integração `Lovable AI` que lê PDF de licença
> (`extract-natal-pdf`, ver [integrações externas](arquitetura/integracoes-externas.md) §5)
> — são coisas diferentes com o mesmo nome: uma é o robô que escrevia código, a outra é um
> serviço de leitura de PDF que continua em uso.

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

**Gravidade: alta. ⚠️ O CONSERTO EXISTE E NÃO ESTÁ NO CAMINHO QUE A MD VAI USAR.**

> 🔴 **Corrigido em 28/08/2026:** este item dizia "✅ o código foi corrigido em `446779ff`".
> O conserto é real e está certo — mas mora em `src/lib/import/file-parser.ts`, e **a tela de
> Negócios não chama esse arquivo**. Quatro das cinco telas de importação seguem no leitor
> antigo. Ver **[item 40](#40--o-conserto-de-datas-da-importação-não-alcança-a-tela-de-negócios)**,
> que é onde este assunto continua.
>
> Os dados já gravados também não foram reparados — ver
> [item 19](#19-11903-negócios-com-data-trocada-em-produção).

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

- 🔴 **Publicar não está mais a um comando de distância: está a ZERO.** Desde 26/08/2026 o
  repositório voltou a ser público e a Vercel publica sozinha a cada commit no `main`. Quem
  escreve o código o coloca no cliente pagante no mesmo gesto, e **sumiu a etapa onde o erro
  ainda podia aparecer antes** (ver `CLAUDE.md` §16). Isso torna a cobertura de teste mais
  cara de não ter, não menos
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

**Gravidade: ✅ RESOLVIDO — registro histórico.**

> 🔴 **Corrigido em 28/08/2026:** este item está DESATUALIZADO e o texto abaixo descreve o
> estado de agosto. O controle de seções por empresa **existe e está em produção**:
> `src/lib/secoes.ts`, `src/hooks/use-secoes.ts`, `src/pages/AdminSecoes.tsx`, as funções
> `empresa_tem_secao` / `minhas_secoes` / `admin_definir_excecao_secao` e o guarda de rota em
> `src/App.tsx`. As quatro tabelas de licença exigem `empresa_tem_secao('portal')`.
>
> Enquanto isto dizia o contrário, a Repply podia estar deixando de vender por acreditar que
> entregaria o Portal junto. O `SPEC.md` §7.4 ainda repete o texto antigo — ver
> [item 56](#56-onze-pontos-da-documentação-afirmam-coisa-que-não-é-verdade-hoje).

O texto original, mantido para quem procurar pelo sintoma:

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

**Gravidade: alta. ✅ CORRIGIDO em 26/08/2026, migration
`20260826120000_fase2_gaps_criticos_permissao.sql`.**

É o gêmeo exato do bug corrigido em `pedidos` pela migration
`20260824143000_pedidos_rls_fase_zero.sql` — aquela migration, ao corrigir `pedidos`, já
apontava que faltava fazer o mesmo aqui. `clientes_select/insert/update/delete` (abril/2026)
já eram as regras corretas; o conserto foi só apagar a política antiga que convivia com elas
(texto original do achado abaixo, mantido como registro).

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

## 22. A automação diária nunca rodou, e tem cinco defeitos em série

**Gravidade: alta SE alguém a agendar. Hoje o impacto real é zero — ela está dormente.**

**Medido em 26/08/2026, em produção:**

| | |
|---|---|
| agendamento (`cron.job`) | **não existe** |
| execuções registradas em `automation_logs` | **nenhuma** |
| notificações `inatividade` no banco | **0** |
| notificações `followup` no banco | **0** |
| (as 36 notificações que existem são `evento_lembrete`, de outro caminho) | |

🔴 **A versão anterior deste item dizia que "o vendedor recebe follow-up atrasado para
venda que já fechou". Isso nunca aconteceu** — a função nunca foi invocada uma vez. O
defeito do slug é real e está descrito abaixo, mas ele não tem consequência enquanto nada
chamar a função. Corrigido aqui para não mandar ninguém consertar um sintoma inexistente.

**Não basta trocar o slug e agendar.** São cinco coisas, e as três últimas foram
encontradas em 26/08/2026:

**Confirmado no código em 21/08/2026:**

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

### O que aconteceria se ela fosse ligada hoje

`'perdido'` casa e é excluído certo. `'fechamento'` **não casa com nada**, então negócio
já **ganho** continuaria no filtro, e a linha 52 (`if (!pedido) continue; // already
closed`) nunca o descartaria. O vendedor receberia **"⚠️ Follow-up atrasado"** para venda
que já fechou. É o inverso do que o comentário do código promete — não deixaria de
disparar, dispararia demais.

### Está no banco também

A definição vigente de `vw_pedidos_inativos` — que a mesma função consome na segunda parte
(linha 101) — repete o slug morto:

`20260504172116_d58aba56-...sql:79` → `WHERE p.status NOT IN ('fechado', 'perdido');`

Ou seja, negócio ganho e parado também gera **"🔴 Pedido parado há N dias"**.

Terceira ocorrência: `supabase/functions/import-data/index.ts:38`, no prompt que descreve
os status válidos — mas essa função é órfã (item 6).

### Defeito 3: a visão não tem corte de dias nenhum

`vw_pedidos_inativos` **não filtra por tempo**. Não existe `WHERE dias_parado > N` — ela
devolve todo negócio aberto. Medido em 26/08/2026: **8.712 linhas**. A função percorre a
lista inteira criando uma notificação por linha, uma vez por dia.

O campo "Dias para alerta" que existia na aba Automação até 26/08/2026 sugeria que esse
corte era configurável. Nunca foi: aquele campo era um `useState('5')` que não era lido do
banco nem gravado nele, ao lado de dois interruptores sem função de clique.

### Defeito 4: a função lê colunas que a visão não devolve

`index.ts` monta a notificação com `p.usuario_id` e `p.cliente_id`. A definição vigente da
visão devolve `pedido_id, status, ultima_atualizacao, dias_parado, cliente_nome,
usuario_nome` — **nenhum dos dois id está lá**. Os dois chegariam `undefined` e a inserção
falharia nas 8.712, ou gravaria nulo onde a coluna permitir.

### Defeito 5 (o que invalida a métrica): `dias_parado` mede a importação, não a parada

A visão calcula `now() - p.updated_at`, e `updated_at` é uma das
[colunas envenenadas pela importação](arquitetura/modelo-de-dados.md) — carimbada entre
18 e 21/08/2026 em massa. Medido em 26/08/2026:

```
negócios na visão ............... 8.712
com "parado" entre 0 e 7 dias ... 8.712   ← TODOS
com mais de 7 dias .............. 0
carimbados pela importação ...... 8.707
datas distintas de atualização .. 6
```

**Não existe negócio "parado há mais de 7 dias" segundo essa conta** — e existem milhares
parados de verdade. O número mede há quanto tempo a importação rodou. Consertar os
defeitos 1 a 4 e agendar produziria 8.712 notificações dizendo "parado há 7 dias" no mesmo
dia, todas com o mesmo número, todas erradas.

### Conserto

**Não é trocar o slug e agendar.** Nessa ordem:

1. Trocar `'fechado'` por `'fechamento'` nos três pontos (o da visão exige migration nova —
   nunca editar a existente)
2. Trocar a base do tempo: `pedidos_historico_status` (confiável a partir de 08/2026) ou
   `data_pedido`, nunca `updated_at`
3. Pôr corte de dias na visão, e ler o corte de `configuracoes_automacao` em vez de cravar
4. Devolver `usuario_id` e `cliente_id` na visão
5. Só então agendar

**Antes de fazer isso, confira se ainda faz sentido.** A seção "Hoje"
([plano](operacao/plano-pauta-do-dia.md)) já entrega essa ideia funcionando, com o corte
configurável de verdade, priorização por valor e teto diário — justamente para não virar
8.712 avisos. Reviver esta função criaria **um segundo lugar com a mesma regra**, e é assim
que os dois números divergem seis meses depois. Decisão do Lucas em 26/08/2026: **deixar
documentada e dormente**, sem consertar nem apagar.

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

## 31. A lista de exceções da seleção em massa viaja na URL, e trava em ~800

**Gravidade: média. Não apaga dado errado — trava a operação e não explica por quê.**

No modo "todos os filtrados", desmarcar itens acumula ids em `excludedIds`, e a exclusão
manda a lista inteira dentro do endereço da consulta:

```ts
// src/hooks/use-pedidos.ts:654
if (excludeIds && excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
```

É o **mesmo problema do item 28** (a busca de negócio filtrando por lista de ids), com os
mesmos números medidos nesta base: ~37 bytes por id, o servidor recusa por volta de 29 KB.

| exceções | endereço |
|---|---|
| 500 | ~18 KB |
| **800** | **~29 KB — limite conhecido** |
| 1.000 | ~36 KB |

Com a opção "Exibir 100" da paginação, **8 cliques em "Apenas esta página" bastam** para
chegar lá. Com busca ativa é antes, porque o mesmo endereço carrega também os ids de
cliente, fabricante e obra que casam com o termo (`use-pedidos.ts:668`).

**O que acontece:** a consulta falha na primeira iteração, cai no `catch` e mostra um
`toast.error` genérico (`Negocios.tsx:1204-1206`). **Não apaga nada** — a direção é segura.
Mas o usuário fica sem saída e sem explicação, e nada na tela avisa que a lista de exceções
tem tamanho.

**Conserto:** o mesmo do item 28 — uma RPC `SECURITY DEFINER` que receba o filtro e as
exceções no corpo da requisição e resolva dentro do banco, sem trafegar id nenhum.
**As três migram juntas** (esta, o item 28 e `resolveSearchMatches`), porque é o mesmo
padrão herdado. Enquanto isso não acontece, um paliativo honesto seria travar o acúmulo de
exceções num teto e dizer isso na tela.

**Não confundir com o defeito irmão, que JÁ foi corrigido:** as exceções ficarem órfãs
quando o filtro muda (o botão prometia "Excluir 1.574" e o banco apagava 1.584). Esse foi
resolvido em 21/08/2026 — ver Resolvidos.

---

## 32. Cópia sem uso da chave do Resend no Vault

**Gravidade: baixa. Registrado em 26/08/2026, a pedido do Lucas, para fazer depois.**

A chave da API do Resend existe em **três** lugares do projeto Supabase, e só um é lido:

| onde | nome | quem lê |
|---|---|---|
| Project Settings → Edge Functions → Secrets | `RESEND_API_KEY` | ✅ a função do resumo diário |
| Project Settings → Edge Functions → Secrets | `Resend_api_key` | ninguém — sobra da grafia antiga |
| Integrations → **Vault** | `RESEND_API_KEY` | **ninguém** |

A cópia no Vault nasceu de uma confusão entre duas telas: as duas se chamam "Secrets", as duas
têm um botão "Add new secret", mas o Vault é o cofre do **banco** e não alimenta função de
servidor. A história completa está no comentário de `lerChaveDoResend`, em
`supabase/functions/pauta-resumo-diario/index.ts`.

**Por que limpar:** chave viva parada num lugar que ninguém consulta é superfície a mais sem
contrapartida — mais um sítio de onde vazar, e mais um para alguém rotacionar por engano
achando que é a que vale. Nada quebra hoje.

**Conserto:** apagar `RESEND_API_KEY` do Vault e `Resend_api_key` dos secrets das Edge
Functions. Depois **republicar a função** — segredo trocado não afeta instância já morna — e
conferir que `aviso_nome_do_segredo` sumiu do registro em `automation_logs`.

---

## 33. O WhatsApp não tem contagem de envio nenhuma

**Gravidade: alta. Não bloqueia nada hoje — e é por sorte, não por desenho.**

**Medido em 26/08/2026:**

```
limite de frequência em supabase/functions/whatsapp-send   ->  NÃO EXISTE
                                     para texto            ->  nenhum
                                     para mídia            ->  nenhum

MD Representações  ->  número 1: 13 pessoas ligadas   (conectado)
                       número 2: 12 pessoas ligadas   (conectado)
```

A conexão com o WhatsApp é por **API não oficial**. Número que dispara muita mensagem em pouco
tempo é derrubado, e perder o número é perder operação — não funcionalidade.

**Por que ninguém sentiu ainda:** todo envio é hoje um humano digitando na caixa de entrada, um
de cada vez. O ritmo humano é a única trava que existe. Qualquer código novo que mande mensagem
em laço, ou qualquer pessoa com acesso ao console do navegador, passa por cima disso sem
encontrar nada.

🔴 **O teto tem que ser por NÚMERO, não por pessoa.** Treze pessoas com dez envios cada dão 130
disparos de um único aparelho — e quem o WhatsApp bane é o aparelho. Foi essa conta que corrigiu
o desenho do drive de catálogos, e é o erro que qualquer trava por usuário vai repetir.

### Por que não foi corrigido junto com o drive de catálogos

`whatsapp-send` é o **caminho crítico do atendimento**. Um representante numa conversa rápida
manda muitas mensagens em pouco tempo, de forma inteiramente legítima — uma trava genérica ali
quebraria o atendimento para proteger o catálogo. O envio de catálogo ganhou trava própria, no
seu próprio caminho.

### O conserto, quando for a hora

O mecanismo desenhado para o catálogo serve inteiro:
[`superpowers/specs/2026-08-26-drive-de-catalogos-design.md`](superpowers/specs/2026-08-26-drive-de-catalogos-design.md) §8.

1. Registrar cada envio com `instancia_id`, `usuario_id` e a hora
2. Contar **no servidor**, dentro da função — botão desabilitado não protege de nada
3. Dois tetos: por número (o que protege o ativo) e por pessoa (o que limita abuso)
4. A mensagem de recusa diz **quando libera** e **de quem é o limite** — aviso sem horário faz a
   pessoa clicar de novo, e "você atingiu seu limite" para quem mandou duas mensagens parece bug

---

## 34. A etapa gravada na configuração não é verificada contra a tela

**Gravidade: média. Já travou o assistente de Novo Negócio TRÊS vezes.**

A aba **Campos** das Configurações deixa cada empresa marcar um campo como obrigatório e
dizer em que **etapa** do assistente ele vive (`configuracoes_campos.etapa`). A tela, por
outro lado, decide onde desenhar cada campo **no código**.

🔴 **Nada liga as duas coisas.** Elas combinam por acordo tácito, e quando desencontram o
resultado é sempre o mesmo: **um campo obrigatório sem lugar onde ser preenchido**. O botão
some, sem mensagem, e não há como sair do passo.

### As três vezes

| quando | o quê | como foi resolvido |
|---|---|---|
| antes de 08/2026 | `proximo_contato` saiu da tela; a linha de configuração ficou | exceção escrita à mão em `NovoNegocioDialog` |
| — | `obra_id` não é desenhado quando a seção Obras está desligada | segunda exceção à mão |
| **26/08/2026** | `anexo_pdf` foi movido para o passo 2; a configuração continuou dizendo passo 1 | migration `20260826234500`, e mais dois consertos no código (commit `841c7d63`) |

O terceiro caso mostra por que exceção à mão não é conserto: o campo **existia** e **devia**
continuar obrigatório — só tinha mudado de passo. Uma exceção teria escondido o problema em
vez de alinhar as duas verdades.

E ele veio acompanhado de dois defeitos DORMENTES que a mudança acordou: o botão "Próximo" e o
`handleNext` exigiam o passo 2 completo para sair do passo 1. Eram inofensivos enquanto o
passo 2 não tinha campo obrigatório nenhum.

### O estado hoje: consistente, mas sem rede

Medido em 26/08/2026, depois dos consertos — as 12 chaves configuradas são todas conhecidas
pelo código, e cada uma é desenhada no passo que a configuração declara:

```
obrigatórios do PASSO 1 ... cliente_id, data_pedido, fabricante_id, vendedor_id
obrigatórios do PASSO 2 ... anexo_pdf
```

**Não há incêndio aberto.** O que não existe é o que impede o próximo desencontro — e ele vem
de graça no dia em que alguém mover um campo de passo, esconder um por seção, ou acrescentar
uma chave em `configuracoes_campos` que a tela não conhece.

### O conserto, por ordem de custo

1. **Uma fonte só para "que campo vive em que passo".** Hoje isso está em dois lugares: a
   ordem do JSX e a coluna `etapa`. Declarar um mapa em código e usá-lo tanto para desenhar
   quanto para validar acaba com a classe inteira de bug — as duas verdades viram uma.
2. **Um aviso em desenvolvimento** quando chega configuração com `campo_key` que o mapa não
   conhece. Barato, e transforma "o botão não habilita" em "este campo não existe na tela".
3. **Enquanto nenhum dos dois existir:** ao mover um campo de passo, mover a linha de
   `configuracoes_campos` na MESMA entrega, e conferir com

   ```sql
   select campo_key, etapa, bool_or(obrigatorio) from configuracoes_campos
    where entidade = 'pedidos' and origem = 'padrao' group by 1,2 order by 1;
   ```

---

## 35. Logo de e-mail é um arquivo único para todas as empresas

**Gravidade: média. ✅ CORRIGIDO em 31/08/2026, migration
`20260831140000_logo_da_empresa_por_empresa.sql`.**

Achado em 26/08/2026, durante a correção dos gaps de permissão da Fase 2 (auditoria de
RLS/Storage) — não era um dos 4 itens daquela fase, ficou registrado à parte. A correção
foi além do que este item sugeria: em vez de só prefixar `logo-email.png` com `empresa_id`,
nasceu um bucket `branding` próprio (`<empresa_id>/logo.png`, só PNG, escrita restrita a
`is_gestor()`), e a assinatura de e-mail passou a usar a mesma fonte (`empresas.logo_url`)
em vez de um arquivo à parte. O caminho `logo-email.png` foi removido da política
`email_assets_write` do bucket `email-assets` — texto original do achado abaixo, mantido
como registro.

O bucket `email-assets` guarda a logo usada na assinatura de e-mail sob um caminho **fixo e
único**, sem `empresa_id` nenhum: `logo-email.png`. A referência é uma constante
(`LOGO_EMAIL_URL` em `src/lib/assinatura-email.ts`), não uma função de `empresa_id` — usada
igual em `Configuracoes.tsx` e `Emails.tsx`.

Na prática: é o **mesmo arquivo** para qualquer empresa que use o Repply CRM. Se a empresa B
trocar a logo do e-mail dela, a logo de todo mundo muda junto — inclusive a da MD
Representações — porque é o mesmo objeto no Storage. Um comentário do próprio código
(`Configuracoes.tsx`, função `uploadEmailLogo`) já registra a intenção errada: *"o path é
fixo de propósito (uma logo por empresa hoje)"* — a frase descreve o que deveria acontecer,
não o que o caminho do arquivo realmente permite.

**Por que não foi mexido agora:** hoje só a MD Representações usa a função de verdade, então
o sintoma (logo de uma empresa vazando pra outra) ainda não apareceu. Mas é o tipo de bug que
só aparece quando a segunda empresa paga mexe nessa tela — e aí já é incidente visível pro
cliente, não achado de auditoria. Resolver direito não é só política de RLS: exige mudar o
caminho para algo como `{empresa_id}/logo-email.png`, migrar a logo já cadastrada da MD para
o novo caminho, e trocar `LOGO_EMAIL_URL` de constante para função de `empresa_id` em todo
lugar que a usa (achado por enquanto em `assinatura-email.ts`, `Configuracoes.tsx` e
`Emails.tsx`) — maior que uma migration de RLS, por isso ficou de fora da Fase 2.

**Como conferir:** `supabase.storage.from('email-assets').list()` mostra um único
`logo-email.png` na raiz do bucket, sem pasta por empresa.

---

## 36. As 8 visões `v_md_*` entregam a carteira de clientes sem login

**Gravidade: crítica. Medido em 27/08/2026, reproduzido assumindo o papel anônimo.**

Existem 8 visões no banco — `v_md_base`, `v_md_final`, `v_md_resultado`, `v_md_fatos`,
`v_md_arestas`, `v_md_dominio`, `v_md_grupo`, `v_md_socio` — que **não aparecem em nenhuma das
290 migrations** e que **nenhuma linha do código usa**. Nasceram à mão no painel do Supabase,
pelo jeito durante o trabalho de relacionar obras e grupos empresariais.

São `SECURITY DEFINER`, o que faz a segurança por linha deixar de valer, e o papel `anon` tem
leitura nas oito:

```sql
set role anon;
select count(*) from clientes;      -->     0   -- a política funciona
select count(*) from v_md_final;    --> 1.305   -- a visão passa por cima
```

1.305 dos 1.306 clientes, com razão social, CNPJ, e-mail, telefone, cidade, contagem de
negócios e o mapa de grupos empresariais que a MD montou. E-mail e telefone são dado pessoal —
isto é assunto de LGPD, não só de arquitetura.

**É o `webhook_debug` de novo** (item 1): objeto nascido fora de migration, sem revisão.

### Conserto

`revoke select on public.v_md_* from anon, authenticated;` — um comando, reversível, e **nada
deixa de funcionar** porque nenhum arquivo do sistema as usa. Depois se decide, com calma, se
viram migration de verdade ou se vão para o esquema `backup`, onde o resto do material de
investigação já está corretamente guardado.

---

## 37. A pré-visualização de anexo executa o HTML do arquivo recebido

**Gravidade: crítica.**

`src/components/chat/FilePreviewDialog.tsx:57` e `:88` convertem `.xlsx`, `.xls`, `.csv` e
`.docx` em página e injetam o resultado com `dangerouslySetInnerHTML` **sem limpar**. Célula
com formatação mista carrega HTML próprio (o campo `h` do SheetJS), e o `mammoth` não sanitiza
por contrato.

**Quem dispara: qualquer pessoa com o número de WhatsApp da empresa.** O diálogo é usado na
caixa (`WhatsAppInbox.tsx`), não só no chat interno. Não precisa de conta nem de link suspeito —
precisa que alguém clique em "pré-visualizar", que é o gesto do dia.

O código roda com a sessão da pessoa, e o token do Supabase vive no `localStorage`.

### Conserto

Duas linhas. `dompurify` já é dependência e já é usado certo em `LeitorEmail.tsx` e
`assinatura-email.ts` — falta aqui.

---

## 38. Excluir usuário não tira o acesso

**Gravidade: crítica. Latente: hoje há 0 usuários excluídos.**

`UsuariosTab.tsx:620` só carimba `deleted_at` na linha de `usuarios`. O login em `auth.users`
continua existindo e **não há nenhuma chamada de revogação em todo o repositório**.

Pior: as quatro funções que respondem "quem é você" **não conferem a exclusão** — conferido no
banco de produção:

| função | confere `deleted_at`? |
|---|---|
| `get_my_usuario_id()` | não |
| `get_my_empresa_id()` | não |
| `is_gestor()` | não |
| `usuario_in_my_empresa()` | não |

Ou seja: o `ProtectedRoute` barra a TELA, e a política do banco continua liberando. Quem foi
removido, com a sessão salva ou entrando de novo com a mesma senha, continua lendo e gravando
o que o cargo dele permitia — pelo endereço direto, sem passar pela tela.

**Não existe, hoje, caminho no produto para tirar o acesso de um ex-funcionário.**

### Conserto, e a armadilha dele

Acrescentar a checagem de exclusão **somente** às funções que respondem "quem sou eu"
(`get_my_usuario_id`, `get_my_empresa_id`, `is_gestor`). Pôr em `usuario_in_my_empresa`
apagaria da tela os negócios e clientes de quem já saiu — que é histórico legítimo.

A revogação do login é passo à parte, e não tem tela: hoje só pelo painel do Supabase.

---

## 39. Excluir etapa do Kanban move os negócios mesmo quando o banco recusa

**Gravidade: crítica.**

`use-kanban-colunas.ts` faz duas coisas em ordem: primeiro o `update` que move os negócios para
outra etapa, depois o `delete` da coluna. **Só a segunda é protegida por permissão**
(`kanban_colunas_delete` exige gestor), e o `delete` não pede as linhas de volta — no PostgREST,
apagar zero linhas **não devolve erro**.

Um vendedor comum — **12 dos 26 usuários não são gestores** — abre "Gerenciar colunas Kanban",
manda excluir uma etapa, e:

1. o `update` é **aceito** para os negócios de que ele é responsável;
2. o `delete` casa **zero** linhas e não reclama;
3. a tela mostra "Coluna excluída e negócios remanejados" e "Alterações salvas".

Depois do refetch a coluna continua lá, com os negócios dos colegas dentro e sem os dele.

🔴 **E mexe no dinheiro:** se o destino for "Fechamento" ou "Perdido", o gatilho
`fn_set_pedido_fechado_em` carimba a data de fechamento de HOJE em cada negócio movido. Eles
passam a contar como vendas fechadas hoje no Faturamento, no Ticket Médio e no Plano de Vendas —
podem ser centenas de uma vez.

### Conserto

Inverter a ordem e provar a exclusão antes de tocar em negócio: `.delete().select('id')` e, se
vier lista vazia, lançar erro. O padrão já existe neste repositório, em
`use-configuracoes-campos.ts:205-213`. E esconder o acesso para quem não é gestor — a página já
usa `useMinhaPermissao` em `Negocios.tsx` para outro botão.

---

## 40. ✅ O conserto de datas da importação não alcançava a tela de Negócios

**Resolvido no CÓDIGO em 01/09/2026. O DADO já gravado continua errado — ver o fim do item.**

> 🔴 **A previsão se confirmou, e do jeito pior.** Em 01/09/2026 o Lucas importou 2.358
> negócios pela tela de Negócios e **786 entraram com dia e mês trocados** — exatamente o que
> este item alertava. Medido em produção no mesmo dia:
>
> | grupo | linhas | em meses de set a dez/2026 |
> |---|---|---|
> | dia 13 a 31 (o conversor acerta) | 1.572 | **0** |
> | dia 01 a 12 (o conversor chuta) | 786 | **294** |
>
> Zero contra 37,4% no mesmo arquivo. As 294 caíram em datas que ainda não aconteceram.
>
> **O conserto (commit deste item):** existe agora **um leitor só**,
> `lerPlanilhaComoObjetos` em `src/lib/import/ler-planilha.ts`, e as duas telas de importação
> passaram a usá-lo. Junto vieram três coisas que o conserto de 20/08 não tinha:
>
> - **decisão por COLUNA** (`src/lib/import/ordem-de-data.ts`) para o que `cellDates` não
>   alcança — CSV e data digitada como texto. Uma linha com dia 25 decide a coluna inteira;
> - **aviso na prévia** quando alguma data de criação cai depois de hoje
>   (`src/lib/import/conferencia-de-datas.ts`) — o sinal de custo zero que teria pego as 786
>   linhas no dia;
> - **guarda estrutural** (`src/test/uma-leitura-de-planilha-so.test.ts`), que falha se
>   alguém escrever `XLSX.read` fora de `src/lib/import/`. É o que impede este item de
>   voltar uma terceira vez.
>
> Também foram consertados dois defeitos vizinhos, medidos com o SheetJS do projeto: CSV
> devolvia `2026-08-12` como `8/11/26` (**um dia a menos**) e comia acento (`AÇÃO` →
> `AÃÃO`); e o serial `"46247"` sem formato virava **o ano 46247**, que o Postgres aceita.
>
> ⚠️ **O QUE CONTINUA ABERTO: o dado.** Nada foi escrito no banco — decisão do Lucas em
> 01/09/2026, de consertar só o código nesta etapa. Seguem errados:
>
> - **os 2.358 negócios de 01/09/2026** (2026, ano corrente);
> - **os 10.427 negócios de 18 e 20/08/2026** (histórico de 2022 a 2025), o item 19.
>
> 🔴 **E o reparo NÃO é uma troca cega de dia por mês.** Simulado com `SELECT` em 01/09/2026:
> das 786 linhas suspeitas do lote novo, **~145 vieram CERTAS da planilha** e estão
> misturadas às trocadas dentro do mesmo arquivo — a ponta visível são 48 linhas que, ao
> serem "corrigidas", cairiam no futuro. Desfazer no escuro consertaria ~640 e estragaria
> ~145. O reparo confiável precisa da planilha de origem.
>
> ⚠️ **Reimportar por cima DUPLICA.** `computeRowHash` (`row-hash.ts:22-23`) inclui
> `data_pedido` e `prazo_resposta` no hash. Com a data lida corretamente o hash muda, a
> deduplicação não reconhece as linhas antigas, e a base fica com o negócio em dobro — um com
> a data errada e outro com a certa. Apagar o lote antes é parte do plano, não detalhe.
>
> **Contexto que ajuda quem for fazer:** os 2.358 de 01/09 não têm nenhum trabalho por cima
> (zero itens, zero tarefas, zero interações registradas), só o histórico de etapa que o
> gatilho cria sozinho.

<details>
<summary>O diagnóstico original, de 28/08/2026</summary>

O item 3 desta lista está marcado como resolvido em `446779ff`, com validação de 26.181 datas
reais do Bitrix a 100%. **O conserto é real e está correto — e mora num arquivo que a tela de
Negócios não chama.**

```
src/lib/import/file-parser.ts:27                     XLSX.read(buffer, { type: 'array', cellDates: true })
src/components/pedidos/ImportPedidosDialog.tsx:185   XLSX.read(buffer, { type: 'array' })
```

`parseImportFile` (o caminho corrigido) tem **um único chamador**: `ImportDataDialog.tsx`.
Quatro telas seguem no leitor antigo:

| tela | linha |
|---|---|
| **Negócios** — o caminho da migração do Bitrix | `ImportPedidosDialog.tsx:185` |
| Clientes e contatos | `ImportClientesDialog.tsx:314` |
| Catálogo | `ImportCatalogoDialog.tsx:73` |
| Catálogo global | `GlobalImportCatalogoDialog.tsx:101` |

Sem `cellDates`, o `raw: false` manda o SheetJS formatar o número de série no padrão americano
(`8/12/26`), e `sanitizeFieldValue` depois adivinha BR — invertendo toda data cujo dia seja de
1 a 12. É a cadeia de dois elos que a própria mensagem do commit `446779ff` descreve.

**Se a MD migrar hoje pela tela de Negócios, grava ~1 em cada 4 datas invertidas de novo** — o
que produziu os 11.903 do item 19. E `prazo_resposta` é a coluna que sustenta todo o dinheiro.

### Conserto

Trocar as quatro chamadas por `parseImportFile`. E **refazer a validação das 26.181 datas pela
tela**, não pelo módulo isolado — foi a validação pelo caminho errado que deu o falso "pronto".

---

</details>

## 41. Duas funções do banco atravessam a fronteira entre empresas

**Gravidade: alta. ✅ CORRIGIDO em 29/08/2026, migration
`20260829120000_duas_funcoes_atravessavam_a_parede_entre_empresas.sql`.**

As duas portas descritas abaixo foram fechadas na mesma migration:

| Função | O que mudou |
|---|---|
| `set_whatsapp_assinar_remetente_global` | A permissão passou de `is_admin() OR is_gestor()` para **só `is_admin()`**, recusando com `ERRCODE 42501`. O `UPDATE` sem `WHERE` continua ali de propósito: nunca foi o alcance o defeito, e sim **quem podia disparar**. A migration `20260830102000_gate_nas_funcoes_que_furam.sql` ainda acrescentou a checagem de `empresa_plano_ativo()`. |
| `delete_obras_bulk` | Ganhou o recorte por empresa. Identificador de obra alheia agora é ignorado em silêncio — o `COMMENT` da função diz "Filtro idêntico ao da política `obras_delete`". |

✅ **A pergunta de produto foi RESPONDIDA em 31/08/2026, pelo Lucas: o CRM assina sempre.**
Assinar é o padrão do mercado de sistemas de conversação, então não há decisão a oferecer —
e configuração que ninguém deve mudar não precisa de tela. O controle foi **removido por
inteiro** de Configurações → WhatsApp no mesmo dia.

O que ficou no banco: a coluna `empresas.whatsapp_assinar_remetente` (as dez empresas com
`true`) e a RPC, que ninguém mais chama. O envio continua lendo a coluna
(`supabase/functions/whatsapp-send/index.ts`), e o padrão dele quando não consegue ler já era
assinar. Nada mudou no que o contato recebe. Limpar coluna e RPC é higiene, não urgência —
some do produto, permanece no banco.

🔴 **Antes disso, a tela passou dois dias atrás do banco, e vale como lição.** Até 31/08 o
gestor continuava **vendo** o interruptor: clicava, o banco recusava com 42501, e o que
aparecia era "Erro ao atualizar preferência" — sem dizer que o problema era permissão. Houve
até um conserto intermediário naquele dia (esconder o cartão atrás de `is_admin`), substituído
horas depois pela remoção, quando a pergunta de produto foi respondida.

Fica o registro de que **fechar a permissão no banco não fecha o botão na tela** — é o mesmo
defeito que o [item 47](#47-salvo-quando-o-banco-recusou--o-mesmo-defeito-em-quatro-telas)
cataloga em outras quatro telas.

(texto original do achado abaixo, mantido como registro.)

**`set_whatsapp_assinar_remetente_global`** faz `UPDATE public.empresas SET ...` **sem
`WHERE`** — grava em todas. A permissão exigida é `is_admin() OR is_gestor()`, e `is_gestor()`
vale para gestor, admin **e** empresa: são **14 pessoas espalhadas pelas 8 empresas**. Um
gerente da JHS liga um botão na tela dele e muda como o WhatsApp da MD assina as mensagens.
A migration diz que o comportamento global foi intencional — fazia sentido com uma empresa só.

Varri o banco atrás do mesmo padrão: **é a única função com `UPDATE` sem `WHERE`.**

**`delete_obras_bulk`** confere o cargo e **não confere de qual empresa**. Apaga obra alheia,
com `ON DELETE CASCADE` levando os negócios ligados a ela. A única barreira hoje é adivinhar um
identificador — isso é sorte, não controle.

### Conserto

Restringir a primeira a `is_admin()` (ou recortar por `get_my_empresa_id()`), e acrescentar à
segunda a mesma condição que a política `obras_delete` já usa.

---

## 42. Seis funções de servidor abertas sem motivo escrito, e duas sem conferir quem chamou

**Gravidade: alta.**

O `supabase/config.toml` tem uma convenção boa: toda função com `verify_jwt = false` traz um
comentário dizendo por quê. As do Stripe, do Nylas e do retorno de e-mail têm.
**Seis não têm nenhum:** `import-licencas`, `portal-scraper`, `automacao-diaria`,
`eventos-lembrete`, `gmail-sync-inbox`, `gmail-callback`.

⚠️ **E `verify_jwt = true` não protege como parece:** ele só confere que o token foi assinado
pelo projeto — e a chave publicável do site é um token válido, que vai dentro do JavaScript de
`crm.repplyhub.com.br`. Toda função precisa conferir a sessão **por dentro**.

Duas não conferem:

- **`pauta-resumo-diario`** — `Deno.serve` na linha 94, cliente de serviço na 103, zero leitura
  de `Authorization`. A chave pública basta para disparar o resumo das 7h às 13 pessoas da MD,
  quantas vezes quiser.
- **`resolve-pedido-anexo`** — sem sessão, com a chave mestra, e recebendo **`empresaId` no
  corpo do pedido**: quem chama escolhe em qual pasta gravar. O filtro de origem é um teste de
  substring **sem âncora**, então `servidor-do-atacante/cdn.bitrix24.com.br/x` passa. Grava em
  balde público e devolve a URL.

**`import-licencas` e `extract-natal-pdf` são órfãs** — nenhum chamador em `src/`, `scripts/`
ou `.github/`. A primeira aceita apagar e repovoar a tabela de licenças; a segunda gasta crédito
de IA paga. **Apagar as duas do Supabase resolve inteiro.**

---

## 43. Os 22.276 arquivos do Storage podem ser LISTADOS sem login

**Gravidade: alta. Complementa `operacao/plano-baldes-privados.md`, não o substitui.**

Aquele plano mapeou muito bem que os 7 baldes estão abertos, mas o modelo de risco dele diz
*"qualquer pessoa **com o link** baixa o arquivo"*. **Não é preciso ter o link.**

Testado em 28/08/2026 pelo caminho exato que o `.list()` do JavaScript usa
(`storage.search`), assumindo o papel `anon`: dá para listar a raiz do balde, obter as pastas
(que são os `empresa_id`) e enumerar os arquivos de cada uma. Cadeia completa, sem credencial.

```
set role anon;
select count(*) from storage.objects;                            --> 22.276
select count(*) from storage.search('', 'pedido-anexos', ...);   -->     42 pastas na raiz
```

Isso muda a natureza do problema: não é "link vazado", é **inventário completo** — 14.997
anexos de negócio e 6.924 mídias de WhatsApp de clientes.

### Consequência para o plano

A listagem deveria subir para os primeiros passos: é ela que transforma o resto em algo fácil de
explorar. Enquanto o balde for público mas não listável, é preciso ter o link; listável, basta
querer.

---

## 44. A matriz de permissões só é conferida pelo banco em 2 dos 15 módulos

**Gravidade: alta.**

A tela de Configurações promete ver / criar / editar / excluir por módulo, e o `SPEC.md` §5.11
descreve o controle como granular "para cada um dos 14 módulos". No banco, **só Negócios e Plano
de Vendas têm a checagem correspondente**. Nos outros 13 as caixinhas mudam o menu, não o acesso.

O risco não é técnico, é de confiança: a gestora acredita que restringiu, para de vigiar, e o
acesso continua para quem souber o endereço direto.

### Conserto

**Não ligar tudo de uma vez** — isso trancaria gente que trabalha hoje. Medir antes o que as 8
empresas de fato configuraram nas linhas de `permissoes_usuario`, e ligar módulo a módulo.

---

## 45. Não existe conferência automática — e agora o `git push` publica

**Gravidade: alta.**

A regra do projeto é sensata: como o lint e os erros de tipo já vêm com saldo herdado, o critério
é **o número não subir**. Só que **nada confere isso**. O único robô no GitHub raspa o Diário
Oficial de Natal.

Até 26/08/2026 havia duas travas entre o commit e o cliente: a autorização do dono do produto, e
alguém rodando o comando de publicar. **A segunda deixou de existir** quando o repositório voltou
a ser público. Agora o "pode" solta o código direto, e a rede de proteção inteira é memória
humana.

### Conserto

Um workflow que rode `npm run test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run lint` a
cada envio, compare com um arquivo de linha de base commitado, e recuse quando o número subir. É
a regra que o projeto já escolheu — só deixa de depender de lembrar.

---

## 46. `types.ts` tem 21 objetos fora de sincronia, e PODE ser regerado

**Gravidade: alta.**

O `README.md` e o `CLAUDE.md` §6.8 dizem que `src/integrations/supabase/types.ts` precisa ser
mantido à mão "porque não há banco local para regenerar". **Testado em 26/08/2026: não precisa.**
O conector do Supabase já configurado no `.mcp.json` deste repositório gera o arquivo a partir do
projeto de produção. `supabase gen types typescript --project-id <ref>` faz o mesmo.

E vale, porque o arquivo está errado:

| | faltam no arquivo | sobram no arquivo |
|---|---|---|
| tabelas | 2 (`email_webhook_eventos`, `whatsapp_webhook_origem`) | — |
| visões | 8 (as `v_md_*` do item 36) | — |
| funções | 11 | 2 com a assinatura antiga |

É a origem dos `as never` espalhados pelo código e de vários dos 35 erros de tipo.

### 🔴 A ordem importa

`plano_vendas_progresso` e `plano_vendas_progresso_por_vendedor` têm **duas assinaturas cada** no
banco (a antiga por `p_ano/p_mes`, a nova por período). O gerador não sabe representar sobrecarga
e **omite as duas**. Primeiro apagar as versões antigas — ninguém as chama —, depois regerar.
Ao contrário, o problema volta e parece que a regeneração não funcionou.

---

## 47. "Salvo" quando o banco recusou — o mesmo defeito em quatro telas

**Gravidade: alta. É padrão, não caso isolado.**

No PostgREST, uma escrita que **não altera nenhuma linha não devolve erro**. Quem não pede as
linhas de volta não distingue "gravou" de "a política recusou" — e mostra sucesso nos dois casos.

| onde | o que a pessoa vê |
|---|---|
| Excluir etapa do Kanban (item 39) | "Alterações salvas", e a coluna continua lá |
| Reordenar etapas do Kanban | "Alterações salvas", e a ordem volta ao recarregar |
| Excluir / mover tarefa | Aviso de sucesso, e o item volta no refetch |
| Excluir evento com participantes | Apaga uma linha só; o evento segue na agenda de todos |

O último tem consequência de mundo real: gente aparecendo numa visita cancelada.

### Conserto

Vale uma **regra de projeto**, não quatro consertos: toda escrita que depende de permissão pede
as linhas de volta (`.select('id')`) e trata "veio vazio" como recusa. O padrão já existe em
`use-configuracoes-campos.ts:205-213` e em `use-chat.ts:797-800`.

---

## 48. O Radar de Risco conta edição de campo como movimento

**Gravidade: alta.**

A consulta de `20260824220000_dashboard_negocios_risco.sql` mede "há quanto tempo este negócio
não anda" olhando `pedidos_historico_status` **sem separar o tipo `status`**. Corrigir uma
observação tira o orçamento da lista de parados na hora, sem ele ter andado.

Medido: **R$ 5,0 milhões no lugar de R$ 14,4 milhões** em risco. O comentário no topo da própria
migration diz que a consulta existe justamente para evitar isso.

Agravante: **toda correção em massa de dados zera o radar** — o reparo de datas de 20/08 já
gravou 61 linhas de histórico que contam como movimento.

### Conserto

Migration nova com `CREATE OR REPLACE`, acrescentando a condição de tipo na cláusula da LATERAL.
O índice existente continua servindo.

---

## 49. O filtro "Etapa" não filtra, em dois lugares

**Gravidade: alta.**

**No Kanban:** marcar uma etapa não recorta nada. `KanbanColumn.tsx:50` usa a etapa só para
ligar/desligar o `enabled` da consulta — e, com a mesma `queryKey`, o TanStack devolve o cache.
As colunas seguem com os cartões e as contagens de antes, enquanto a linha de resumo em cima
(que passa por `usePedidosStats`) **obedece** ao filtro. Dois números que se contradizem na mesma
tela, sem nada indicando qual está certo.

**No modal de Ação em massa:** é inerte de ponta a ponta. `PedidosFilters.stages` está declarado
em `use-pedidos.ts:57` e **não é lido por ninguém** — nem `montarQueryDeNegocios` (linha 418) nem
`usePedidosStats` (806). O selo do botão mostra "1" e a lista não muda uma linha.

É a única tela que altera centenas de negócios com um clique, e não tem desfazer.

> `docs/modulos/negocios.md` §6 descreve a versão benigna ("renderiza vazia com contagem 0"). O
> comportamento real é o oposto — a auditoria está desatualizada e não serve de cobertura.

---

## 50. A soma em reais do Kanban usa só os cartões carregados

**Gravidade: alta.**

`KanbanColumn.tsx:83` soma no navegador os cartões já baixados (50 por vez) e mostra o resultado
**ao lado da contagem exata que veio do banco**. Nada indica que um é parcial.

O sinal que denuncia: clicar em "Ver mais" faz o dinheiro **subir**, como se estivesse entrando
venda. Quem olha o funil para saber quanto está represado em cada etapa pode estar vendo um valor
muitas vezes menor.

### Conserto

Chamar `usePedidosStats(empresaId, [stageKey], filters)` na coluna e usar o `valor` que ela
devolve — a assinatura já aceita `stages` e a `queryKey` já ignora paginação de propósito.

---

## 51. O Calendário mostra menos de 10% dos prazos, e desenha um dia antes

**Gravidade: alta.**

Dois defeitos somados, no mesmo arquivo:

1. `use-eventos.ts:105-113` pede **todos** os 11.910 negócios de uma vez, sem `.order()` e sem
   `.limit()`. O servidor devolve **1.000 e para**, com status de sucesso e sem aviso. Sem
   ordenação, quais 1.000 chegam é decisão do plano do Postgres e muda entre uma abertura e
   outra — na prática somem os fechamentos futuros.
2. `use-eventos.ts:164` monta a data sem a âncora de meio-dia que o `CLAUDE.md` §7.12 aponta como
   padrão. Um fechamento de 01/09 aparece na casa de 31/08 — **no mês anterior**. A ficha do
   negócio mostra uma data e a agenda mostra outra.

### Conserto

Não paginar: **recortar pelo mês que está na tela** (`.gte`/`.lte` em `prazo_resposta`, com o
período na `queryKey`) e ler com a âncora de meio-dia. Resolve o corte, o peso e o dia errado de
uma vez.

---

## 52. Importar contatos cria construtoras duplicadas

**Gravidade: alta.**

`ImportClientesDialog.tsx:640` busca os clientes já cadastrados para não duplicar — e essa busca
bate no teto de 1.000 do PostgREST. **A base tem 1.305.** Se a construtora estiver entre os 305
que não vieram, o código conclui "não existe" e cria um cadastro novo. Sem ordenação, quais 1.000
chegam muda a cada importação.

Cada importação suja mais a base: a mesma construtora em duas fichas, com histórico, negócios e
contatos divididos entre elas.

### Conserto

Não paginar: consultar só os nomes citados na planilha, em blocos de 50, com `buildOrFilter`. É
o padrão que o **próprio arquivo já usa 110 linhas abaixo** (linhas 769-786) e que
`src/lib/import/resolve-entities.ts:107-116` também usa.

---

## 53. Ler a lista de clientes é ~130× mais caro por linha do que ler negócios

**Gravidade: média hoje, alta conforme a base cresce.**

Medido no banco de produção, com a sessão de um vendedor real da MD:

| consulta | linhas | tempo | plano |
|---|---:|---:|---|
| `select count(*) from pedidos` | 11.910 | **6,5 ms** | Index Only Scan, lista de usuários resolvida **uma vez** |
| `select count(*) from clientes` | 1.306 | **96,5 ms** | Seq Scan, função chamada **por linha** |

A diferença está na forma da política:

```sql
-- pedidos (rápida):  usuario_id IN (SELECT usuarios_da_minha_empresa())
-- clientes (lenta):  usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id)
```

`usuario_in_my_empresa(usuario_id)` recebe a **coluna** como argumento, então o Postgres precisa
chamá-la uma vez por linha. É a mesma causa que o `CLAUDE.md` §7.9 mede como responsável por
transformar 4 ms em 16–31 segundos — lá foi contornada, a raiz nunca foi tratada.

`obras` é pior ainda: subconsulta correlacionada que chama a mesma função por linha.

O relatório de saúde do Supabase aponta **46 políticas com esse defeito em 20 tabelas**, mais
**53 chaves estrangeiras sem índice** — inclusive `itens_pedido.pedido_id` e `obras.cliente_id`.

### Conserto

Copiar a forma de `pedidos`. O jeito certo já está escrito neste mesmo banco.

---

## 54. `app_erros` mistura desenvolvimento e produção, e ninguém olha

**Gravidade: média.**

343 registros. **224 vêm de máquinas de desenvolvimento** (`versao = 'local'`), porque o ambiente
local aponta para o banco de produção. Isso torna impossível separar "o cliente travou" de "o dev
digitou errado" — e é por isso que o registro existe e ninguém o consulta.

Filtrando só produção, o quadro é **tranquilizador**: 119 registros em três semanas e **um único
travamento real** (tela de Chat, 6 vezes, 3 pessoas). O resto — cerca de 110 — é o aviso de "saiu
versão nova", que atingiu **13 das 26 pessoas** em 15 telas. Houve **63 versões publicadas em
três semanas**, e cada publicação derruba quem está com a aba aberta.

### Conserto

Não gravar quando a origem é máquina de desenvolvimento (`import.meta.env.DEV`), e olhar o que
sobra. O aviso de versão nova merece tratamento próprio: é o incômodo número um da operação.

---

## 55. Coisas que deveriam ser por empresa e são compartilhadas por todas

**Gravidade: média.**

- **Perfis de acesso** (`perfis_customizados`) são uma tabela global: cada assinante vê, renomeia
  e apaga os cargos criados pelos outros. Nome de cargo entrega região e especialidade para quem
  disputa as mesmas construtoras.
- **As imagens de assinatura de e-mail** (balde `email-assets`) podem ser listadas e apagadas por
  qualquer pessoa logada, de qualquer empresa. O padrão certo já foi aplicado em dois outros
  baldes em `20260824210000` — faltou este.
- **O `secao_preset_id` da empresa** pode ser trocado pelo próprio gestor, direto na tabela
  `empresas` — o controle de seções que a Repply usa para vender módulo a módulo é auto-serviço.
- **O código de acesso da empresa** é anunciado na tela (`CodigoAcessoButton.tsx:67`) como de uso
  único e **vale para sempre**. É um convite que circula por WhatsApp e nunca expira.

(O logotipo do rodapé de e-mail é o item 35, já registrado.)

---

## 56. Onze pontos da documentação afirmam coisa que não é verdade hoje

**Gravidade: média. O próprio projeto escreve que documento que mente é pior que documento que
não existe.**

| onde | o que diz | o que é |
|---|---|---|
| `SPEC.md` §9 · item 3 desta lista | datas da importação resolvidas e validadas | o conserto não alcança 4 das 5 telas — item 40 |
| `SPEC.md` §8 | "Publicação MANUAL desde 22/08 — `npx vercel --prod`" | desde 26/08 o `git push` publica |
| `SPEC.md` §11.3 | "toda alteração vai por branch e Pull Request" | vai direto no `main`; o PR foi revertido em 19/08 |
| `SPEC.md` §11.3 | a publicação parou por ser "repositório de organização" | era por ser **privado**; essa pista já custou dois dias |
| `SPEC.md` §7.4 · item 8 | controle de seções por empresa "não existe" | existe, em produção, com política e painel |
| `SPEC.md` §5.11 | permissão granular "para cada um dos 14 módulos" | o banco confere em 2 — item 44 |
| `SPEC.md` §11.4 | repositório em conta pessoal do dev anterior | é `github.com/Repply-Hub`, e é público |
| `CLAUDE.md` §9 · `SPEC.md` §11.3 | "152 testes em 10 arquivos, 78 mil linhas" | 568 testes, 33 arquivos, 92 mil linhas |
| `README.md` · `CLAUDE.md` §6.8 | `types.ts` não pode ser regerado | pode — item 46 |
| `operacao/plano-baldes-privados.md` | "qualquer pessoa **com o link**" | não precisa do link — item 43 |
| `modulos/negocios.md` §6 | filtro de etapa "renderiza vazia com contagem 0" | mantém os cartões antigos — item 49 |

O `SPEC.md` concentra a maior parte e virou o documento mais atrasado do conjunto.

---

## 57. Os módulos que justificam o produto estão vazios

**Não é dívida técnica — é leitura de produto. Registrado aqui porque nenhum outro documento diz.**

Contagem no banco de produção, 26/08/2026:

| módulo | registros | o que o `SPEC.md` diz dele |
|---|---:|---|
| Mensagens de WhatsApp | 54.787 | "Com ressalva" |
| Negócios | 11.910 | "Sólido" — 11.906 vieram da importação |
| E-mails | 5.295 | "Com ressalva" |
| Clientes | 1.306 | "Sólido" |
| Contatos | 1.092 | "Sólido" |
| Fabricantes | 30 | "Sólido" |
| **Tarefas** | **3** | "Sólido", e é o embrião da cobrança de follow-up |
| **Obras** | **1** | "O diferencial que motivou o produto a existir" |
| **Itens de orçamento** | **1** | "As linhas do orçamento" |
| **Tabela de preços** | **0** | um dos quatro eixos que separam o Repply de um CRM comum |
| **Histórico de interações** | **0** | parte de "Clientes e Contatos, sólido" |

Os módulos estão **construídos** — a documentação está certa quando diz "sólido", porque fala do
código. Ninguém os **alimentou**. E de pelo menos um a causa é técnica e conhecida: **a
importação nunca preenche `pedidos.obra_id`** (a coluna "Obra" da planilha vira texto em
`endereco_entrega`). Como toda a base veio da planilha, o mapa de obras nasceu vazio.

**A pergunta é de produto e não tem resposta técnica:** a MD não usa obras e tabela de preços
porque nunca foram migradas, ou porque na prática não precisa delas? As duas respostas levam a
roadmaps opostos.

---

## 58. Contato sem responsável aparece para TODAS as empresas

**Gravidade: alta. Latente — medido em 30/08/2026: 0 órfãos hoje.**

A regra de leitura de `contatos` e de `tarefas` tem uma terceira cláusula que ninguém
comenta:

```sql
contatos_select : (usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id) OR usuario_id IS NULL)
tarefas_select  : (usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id) OR usuario_id IS NULL)
```

**`OR usuario_id IS NULL` não é escopado por empresa.** Uma linha sem responsável não fica
invisível: ela fica visível para as **nove** empresas do sistema. Um contato criado sem dono
por um assinante qualquer entra na carteira da MD Representações, com nome, telefone e e-mail.

### O tamanho hoje

| tabela | órfãos | total |
|---|---:|---:|
| `contatos` | **0** | 1.092 |
| `tarefas` | **0** | 4 |

Está fechado por sorte, não por proteção. Não há `CHECK`, não há `NOT NULL`, e
`contatos.usuario_id` e `tarefas.usuario_id` **não têm chave estrangeira nenhuma** — são
colunas soltas (conferido no catálogo: só `criado_por_usuario_id` tem `REFERENCES usuarios`).

### O que cria um órfão

Três caminhos gravam contato com o dono vindo de uma consulta que pode voltar vazia, e
nenhum confere o resultado:

| arquivo | o que faz |
|---|---|
| `src/hooks/use-mutations.ts:47` | `const { data: vid } = await supabase.rpc('get_my_vendedor_id')` → `usuario_id: vid`, sem conferir |
| `src/components/clientes/ImportClientesDialog.tsx:716` | mesmo `vid`, aplicado a um lote inteiro de importação |
| `src/hooks/use-criar-contato-da-conversa.ts:54` | 🔴 `usuario_id: profile?.id ?? null` — escreve o nulo **explicitamente** |

`get_my_vendedor_id()` delega para `get_my_usuario_id()`, que devolve nulo quando não há
linha em `usuarios` para o login — a sessão órfã que o `ProtectedRoute` trata na tela, e que
a função de banco simplesmente responde com nulo.

### As duas coisas que fazem este item ser barato de consertar

**1. O padrão certo já existe no mesmo código, a poucas linhas.** `use-tarefas.ts:85` recusa
criar tarefa sem dono, com mensagem clara:

```ts
if (!usuarioRow?.id) throw new Error('Usuário não encontrado. Faça login novamente.');
```

É por isso que `tarefas` tem zero órfãos e nenhum produtor conhecido: o buraco na política
existe, mas o app não o alimenta. Em `contatos` a mesma guarda não foi escrita.

**2. O padrão certo da POLÍTICA também já existe, no mesmo banco.** `metas_vendas` aceita
`usuario_id` nulo — ali o nulo significa "meta de equipe" — e mesmo assim não vaza, porque o
nulo vem **emparelhado com a empresa**:

```sql
((usuario_id IS NULL) AND (empresa_id = get_my_empresa_id()))
```

`contatos` e `tarefas` são as **únicas duas** políticas do banco com a versão sem guarda
(varredura de `pg_policies` em 30/08/2026).

### O conserto, na ordem que não trava ninguém

1. **Fechar a torneira primeiro:** acrescentar a guarda de `use-tarefas.ts:85` aos três
   caminhos de contato. Sozinho, isso já impede o problema de nascer.
2. **Depois fechar a política.** `contatos` e `tarefas` não têm coluna `empresa_id`, então
   não dá para copiar `metas_vendas` literalmente: ou a cláusula do nulo simplesmente sai
   (com o risco de esconder linha que hoje alguém enxerga — hoje são zero, então é seguro),
   ou entra um `NOT NULL` na coluna, que é a versão definitiva.
3. **Só então** vale medir de novo. Enquanto o passo 1 não existir, uma importação grande
   pode criar centenas de órfãos entre a medição e o conserto.

> ⚠️ **Não comece pelo passo 2 sem o passo 1.** Fechar a política com a torneira aberta faz
> os contatos órfãos futuros ficarem invisíveis para todo mundo, inclusive para quem os
> criou — troca um vazamento por um sumiço silencioso, que é mais difícil de perceber.

### Como conferir a qualquer momento

```sql
select 'contatos' as tabela, count(*) filter (where usuario_id is null) as orfaos, count(*) as total from contatos
union all
select 'tarefas', count(*) filter (where usuario_id is null), count(*) from tarefas;
```

**Descoberto em 30/08/2026**, ao desenhar a base de demonstração da empresa Repply — a base
precisou de uma trava própria para não criar contato órfão e despejá-lo na carteira da MD.
Ver `docs/superpowers/specs/2026-08-30-base-demo-repply-design.md` §2.5.

---

## 59. O link de redefinir senha aponta para `localhost`

**Gravidade: alta. Em produção, afetando todo mundo. O conserto NÃO é de código.**

Relatado pelo Lucas em 27/08/2026: ele pediu redefinição de senha e o e-mail chegou com um
link para `http://localhost:3000`.

### A causa

O **Site URL** da autenticação, no painel do Supabase, está como `http://localhost:3000`.

O Supabase usa esse valor sempre que o endereço de retorno pedido pelo app **não está na
lista de endereços autorizados** (Redirect URLs). Ele não recusa nem avisa: troca em
silêncio e manda o e-mail.

### A medição que fecha o diagnóstico

Nos registros de autenticação, em 31/08/2026:

| | |
|---|---|
| requisições | 3.306 |
| endereços de internet **distintos** | **634** |
| destino efetivo registrado | `http://localhost:3000` em **todas** |
| qualquer outro valor | **nenhum** |

634 endereços distintos, de usuários reais da MD, da JHS e da PR & Cocentino, em cidades
diferentes. Não é gente rodando servidor local.

**O detalhe que confirma:** o servidor de desenvolvimento deste projeto roda na porta
**8080** (`vite.config.ts:10`). `localhost:3000` não corresponde nem à produção **nem ao
ambiente local daqui** — é sobra do andaime original, que nunca foi trocada.

### Por que só a redefinição de senha aparece quebrada

Porque é o único e-mail de autenticação em uso. Medido em `auth.users`: **os 30 logins do
sistema foram confirmados em menos de 5 segundos após a criação**, ou seja, a confirmação
de e-mail está DESLIGADA e aquele e-mail nunca é enviado. Não há convite nem link mágico
no produto.

Três pessoas já pediram redefinição; a mais recente em 27/08/2026 — o teste do Lucas.

### O conserto

No painel do Supabase, **Authentication → URL Configuration**:

- **Site URL:** `https://crm.repplyhub.com.br`
- **Redirect URLs:** incluir `https://crm.repplyhub.com.br/**` e, para o desenvolvimento
  continuar funcionando, `http://localhost:8080/**` — com **8080**, não 3000.

> ⚠️ **Ao ligar a confirmação de e-mail um dia, confira isto ANTES.** Com o Site URL
> errado, todo link de confirmação nasce quebrado, e o sintoma não aponta para a causa.

### 🔴 As DUAS configurações importam, e falhar na segunda é PIOR

Corrigir só o Site URL troca uma falha barulhenta por uma silenciosa.

Se `https://crm.repplyhub.com.br/redefinir-senha` **não estiver** na lista de endereços
autorizados, o Supabase descarta o caminho e manda a pessoa para o Site URL puro —
`https://crm.repplyhub.com.br`. E aí:

1. O cliente do Supabase lê o token da barra de endereço sozinho (`detectSessionInUrl` é
   ligado por padrão) e **cria a sessão**.
2. `LandingRoute` (`App.tsx:366-371`) vê sessão e manda a pessoa para dentro do app.
3. Ela **nunca vê o formulário de nova senha**. `RedefinirSenha.tsx` é quem chama
   `updateUser({ password })`, e essa tela não foi aberta.

Resultado: a pessoa clica no link, entra no CRM, conclui que deu certo — e descobre no
próximo login que **a senha continua a antiga**. O link para localhost pelo menos falhava
na cara; este não.

### Como conferir qual dos dois casos você está

Peça uma redefinição e olhe o **fim** do link no e-mail:

| o link termina em… | significa |
|---|---|
| `/redefinir-senha` | as duas configurações certas ✅ |
| o domínio puro, sem caminho | falta o caminho na lista de endereços autorizados |

Nos registros, um pedido de redefinição (`/recover`) grava o destino COMPLETO — então dá
para confirmar sem abrir o e-mail:

```sql
select log_attributes['referer'] as destino, log_attributes['path'] as endpoint
from logs where source = 'auth_logs' and log_attributes['path'] = '/recover'
order by timestamp desc limit 5;
```

As chamadas do dia a dia (`/user`, `/token`, `/logout`) **não** servem para isso: elas não
carregam endereço de retorno, então sempre mostram o Site URL e nunca o caminho.

### O que JÁ foi feito no código (31/08/2026)

Não conserta o acima — conserta a fragilidade que estava do lado e produziria o **mesmo
sintoma por outra causa**:

- `EsqueciSenha.tsx` montava o link com `window.location.origin`, que é "onde o navegador
  está agora". Da produção acerta; **de uma prévia da Vercel manda o endereço da prévia**,
  que não está autorizado — e aí o Supabase cai no Site URL de novo, em silêncio.
- Os três `signUp` de `use-auth.tsx` não mandavam endereço de retorno nenhum. Hoje é
  inofensivo (confirmação desligada), mas viraria bug no dia em que alguém a ligasse.

A regra ficou em `src/lib/endereco-de-retorno.ts`, com 8 testes: em máquina de
desenvolvimento vale o endereço local (senão ninguém testa), em qualquer outro lugar vale o
canônico. A comparação de hostname é **exata**, nunca por substring — `localhost.exemplo.com`
é um domínio público como outro qualquer.

---

## 36. Matriz de permissões ainda decorativa em criar/editar, e em 3 módulos que não são tabela

**Gravidade: média. Registrado em 31/08/2026, na Fase 3 de correção de permissões.**

A Fase 3 ligou `has_permission()`/`has_funcionalidade()` de verdade em várias policies de
RLS (ver migration `20260831160000_fase3_permissoes_reais_no_banco.sql`), mas só no que dava
para fazer **sem tirar capacidade de ninguém hoje**. Ficou de fora, por decisão explícita
para não quebrar produção sem aviso:

**Criar/editar liberado para qualquer vendedor da empresa, sem checar a matriz:**

| Módulo | Hoje | Por que não entrou |
|---|---|---|
| Clientes, Contatos | `criar`/`editar` = dono OU qualquer colega da empresa | Travar via `has_permission` REMOVE uma capacidade que todo vendedor tem agora — exige popular `permissoes_usuario` para cada vendedor ativo antes, ou alguém perde acesso no meio do expediente |
| Obras | `criar`/`editar` = qualquer colega da empresa (nem checa dono) | Mesmo motivo, ainda mais aberto hoje |
| Fabricantes | `criar`/`editar`/`excluir` = qualquer usuário autenticado da empresa, **sem checagem de papel nenhuma** — nem `is_gestor()` | É o único módulo sem trava de cargo alguma; corrigir precisa da mesma population prévia |

**Módulos que não são uma tabela-com-dono simples**, cada um pede solução diferente de RLS:

- **Dashboard → ver**: os números vêm de função do banco (`dashboard_stats`,
  `pedidos_stats`), não de uma linha com `usuario_id`. Checar a permissão aqui é dentro da
  função (`has_permission(get_my_usuario_id(), 'dashboard', 'ver')` no corpo do SQL), não
  como policy de tabela.
- **Portal → Importar Licenças**: aciona a edge function `import-licencas`, que hoje nem
  autentica quem chama (`verify_jwt = false`, sem segredo próprio — é o gap médio que ficou
  fora da Fase 2 de segurança). Checar a funcionalidade aqui depende de primeiro dar
  autenticação nenhuma à function.
- **E-mails → excluir**: a ação não existe no banco hoje. `email_mensagens` não tem policy
  de `DELETE` nenhuma — só é possível excluir rascunho (`email_rascunhos`). Antes de travar
  "excluir e-mail" pela matriz, alguém precisa decidir o que essa ação deveria fazer de
  verdade (arquivar? remover local só da caixa própria? apagar do servidor via Nylas?).

**Antes de mexer em qualquer um destes**: rodar um backfill dando a `permissoes_usuario` uma
linha sensata para cada vendedor ativo (equivalente ao que ele já pode fazer hoje), e só
então trocar a regra do banco — na ordem inversa, alguém perde acesso sem aviso no meio do
expediente.
## 60. O ranking de vendedores chega inteiro no navegador de todo mundo

**Gravidade: alta. Em produção, em todas as empresas. O corte é feito na tela, não no servidor.**

Achado em 31/08/2026, de passagem, enquanto se consertava outra coisa no Plano de Vendas.

### O que acontece

A RPC `dashboard_stats` devolve o array `rendimento_vendedor` com **o nome e o faturamento de
cada vendedor da empresa**. O gráfico não mostra os colegas para quem não é gestor — mas o
recorte acontece no navegador, depois de a lista inteira já ter chegado
(`src/pages/Dashboard.tsx:249-253`):

```ts
const rendimentoVendedor = useMemo(() => {
  const raw = stats?.rendimento_vendedor ?? [];
  if (isGestor) return raw;
  return raw.filter(v => v.vendedor === profile?.nome);
}, [stats, isGestor, profile?.nome]);
```

Qualquer vendedor que abra a aba de rede do navegador lê o faturamento nominal do time inteiro.
Confirmado numa sessão real de vendedor da MD: as cinco pessoas, com nome e valor.

Contraria a regra 6.1 do `CLAUDE.md` — *"a autorização real é a RLS do Postgres; esconder botão
não protege nada"* — e o anti-padrão da §10, *"confiar em verificação de permissão feita só no
frontend"*.

### Por que dói mais agora

Em 31/08/2026 o Lucas decidiu, perguntado antes e com o motivo registrado na migration
`20260831200000`, que a funcionalidade `ver_metas_vendedor` — o ranking nominal no Plano de
Vendas — ficaria **fora de todos os presets de permissão, inclusive do "Total"**, porque abrir o
desempenho da equipe aos colegas não pode acontecer como efeito colateral de um clique em lote.

Este furo entrega pela porta dos fundos exatamente o que aquela decisão fechou pela porta da
frente.

### Por que não é conserto de uma linha

O próprio comentário no código explica, e é honesto:

> `rendimento_vendedor` vem da mesma RPC `dashboard_stats` agregada pra empresa toda (KPIs,
> segmentação, etc.) — não dá pra restringir a query sem também reduzir os KPIs gerais a "só
> meu", que não foi pedido.

Ou seja: a mesma consulta serve dois propósitos com públicos diferentes. Cortar no servidor sem
separar as duas coisas transformaria o painel do vendedor num painel só dele — o que ninguém
pediu e provavelmente ninguém quer.

Os caminhos a comparar antes de mexer:

1. **Separar `rendimento_vendedor` numa RPC própria**, com o gate de permissão dentro dela. Os
   KPIs continuam agregados; só o array nominal passa a exigir autorização.
2. **Cortar dentro da própria `dashboard_stats`**, devolvendo o array já filtrado para quem não
   responde pela empresa, e deixando os demais campos intactos.
3. Manter como está e assumir o risco por escrito.

### Item vizinho, no mesmo assunto

`plano_vendas_progresso` — **as duas assinaturas** — não checa permissão nenhuma, nem `pode_ver`.
Um vendedor com o módulo Plano de Vendas desligado ainda recebe os dados chamando a RPC direto;
`EXECUTE` está concedido a `authenticated`. Confirmado por `pg_get_functiondef`: `prosecdef =
false` e zero chamadas a `has_permission` / `has_funcionalidade`.

**Alarme falso descartado no caminho:** chegou-se a suspeitar de uma segunda versão de
`plano_vendas_progresso_por_vendedor(p_ano, p_mes, …)` sem proteção. Ela é um invólucro de seis
linhas que chama a assinatura por data, então **herda** o `has_funcionalidade`. Não é furo, não
gaste conserto nisso.

### Pendente com o Lucas

O conserto tem efeito visível para cliente pagante e mexe numa consulta compartilhada. Precisa de
decisão dele sobre qual dos três caminhos seguir, antes de qualquer código.

---

## Resolvidos

### 21/08/2026 — seleção em massa na lista de Negócios

> ✅ **Commitado e no ar.**

**Desmarcar todos desmarcava só a página.** Com os 11.906 negócios selecionados pelo atalho
"Todos", a caixa do cabeçalho acrescentava a página atual às exceções em vez de limpar a
seleção. Com 10 por página, "desmarcar todos" eram **1.191 cliques**. E não existia nenhum
botão de limpar seleção na tela — a de Clientes já tinha desde sempre.

A caixa ficou **simétrica**: marcar já perguntava "apenas esta página ou todos os N?", e
desmarcar passou a fazer a mesma pergunta, num diálogo espelhado. A pergunta só aparece
quando decide algo — sem seleção fora da página atual, ela desmarca direto.

A decisão saiu da tela (2.700 linhas) e virou `src/lib/selecao-em-massa.ts`, com sete
resultados possíveis e 11 testes.

**O botão prometia menos do que o banco apagava.** Encontrado pela contraprova, e anterior a
esta leva: o contador subtrai TODAS as exceções (`totalCount - excludedIds.size`), mas o
servidor só desconta as que caem dentro do filtro vigente — e as exceções nunca eram limpas
ao trocar o filtro. Repro medido: "Todos (11.909)" → desmarcar a página 1 → filtrar por
Deca Metais → botão "Excluir 1.574", banco apaga **1.584**. A divergência era sempre para
MAIS, nunca para menos. Numa variante, o contador chegava a zero e a barra de ações sumia
com as linhas ainda marcadas na tela.

Corrigido guardando junto da seleção a **assinatura do filtro em que ela nasceu**: trocou o
filtro, a seleção é limpa com aviso na tela. Resolve de brinde a seleção que sobrevivia na
sessão do navegador e reaparecia ao voltar pelo menu com os filtros zerados.

**A caixa decidia com o total ainda em zero.** A lista e a contagem são consultas separadas;
na primeira pintura as linhas já apareciam com `totalCount = 0`, e clicar ali limpava a
seleção inteira sem perguntar. A regra passou a esperar o total chegar.

Ficou pendente o teto de ~800 exceções no endereço da consulta (item 31).

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
