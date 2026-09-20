# Portal de Consultas — automação do Diário Oficial de Natal (DOM)

Como o Repply CRM busca, filtra e mostra publicações de licença ambiental do Diário
Oficial do Município de Natal. É uma das três fontes da tela **Portal de Consultas**
(`src/pages/Portal.tsx`) — as outras duas são IDEMA e Diário de Extremoz, que têm
pipeline próprio e não estão neste documento.

> 🔴 **Estado medido em 14/09/2026: a automação nunca teve uma execução bem-sucedida sob
> o pipeline atual.** Ver §6 antes de assumir que os dados na tela estão em dia.

---

## 1. Visão geral

```
GitHub Action (mensal)          scripts/scrape-dom-natal-licencas.ts        Supabase
       |                                    |                                  |
       |-- dispara --------------------->   |                                  |
       |                                    |-- lista edições do mês -------->  API JSON da Prefeitura
       |                                    |   (natal.rn.gov.br/api/dom/...)
       |                                    |-- pula edição já gravada ------>  select licencas_natal (dedupe por pdf_link)
       |                                    |-- baixa o PDF ----------------->  natal.rn.gov.br
       |                                    |-- arquiva o PDF --------------->  Storage privado "dom-natal"
       |                                    |-- extrai o texto (pdfjs-dist)
       |                                    |-- reconhece LP/LI/LO --------->  src/lib/dom-natal-licencas.ts
       |                                    |-- grava (upsert, dedupe por hash) -> licencas_natal
                                                                                       |
                                                                              Portal.tsx lê e mostra
```

Objetivo: achar publicações de **Licença Prévia (LP)**, **Licença de Instalação (LI)** ou
**Licença de Operação (LO)** dentro das edições do DOM de Natal — um sinal de prospecção
(obra nova começando) para a equipe comercial da MD.

**O valor esperado é baixo, de propósito.** O licenciamento ambiental do Rio Grande do
Norte é competência **estadual** (IDEMA — já coberto por outra automação do Portal). O
DOM **municipal** de Natal quase nunca publica LP/LI/LO: a investigação da Fase 1
(`docs/investigacao-dom-pdf.md`, 01/09/2026) varreu 10 edições reais e achou **zero**
publicações verdadeiras — só um falso positivo (uma portaria normativa que *cita* "Licença
de Operação" sem conceder nenhuma). Esta automação existe para não deixar um buraco na
cobertura do Portal, não porque se espera volume.

---

## 2. Onde roda, e por quê não é Edge Function

**Hoje: GitHub Action** — [`.github/workflows/scrape-dom-natal.yml`](../../.github/workflows/scrape-dom-natal.yml),
que executa [`scripts/scrape-dom-natal-licencas.ts`](../../scripts/scrape-dom-natal-licencas.ts)
(Node + `tsx`, sem Python).

Já foi uma Edge Function (`supabase/functions/scrape-dom-natal-licencas`). Foi **removida
em 10/09/2026**: cada edição do DOM de Natal tem 60 a 170 páginas, e extrair o texto de
uma passa de 200–400 MB — acima do teto fixo de 256 MB do worker da Edge Function
(`WORKER_RESOURCE_LIMIT`). Três motores de extração foram tentados (`pdf-parse`, `pdf.js`,
MuPDF/WASM), todos estouravam. A leitura voltou para um runner do GitHub Actions, que tem
RAM de sobra. O cron que chamava a Edge Function foi desagendado na mesma migração
(`supabase/migrations/20260910170000_desagenda_cron_scrape_dom_natal.sql`) — o agendamento
que vale hoje é só o `schedule:` do workflow.

**A lógica de reconhecimento (o que É e o que NÃO é LP/LI/LO) mora em
[`src/lib/dom-natal-licencas.ts`](../../src/lib/dom-natal-licencas.ts)**, importada direto
pelo script — não há cópia para o runner manter em sincronia. É o mesmo arquivo que tem
teste (`dom-natal-licencas.test.ts`, 11 casos).

---

## 3. Cadência e disparo

| Modo | Quando | Parâmetros |
|---|---|---|
| `schedule` | dia 1 de cada mês, 09:00 UTC (06:00 em Brasília) | mês corrente + 1 mês anterior, teto de 45 edições |
| `workflow_dispatch` (manual, pela aba Actions do GitHub) | sob demanda | `meses_atras` (padrão 1), ou `mes`+`ano` específicos, `max` (padrão 45) |

**Cadência mensal é deliberada** — publicação de LP/LI/LO no DOM municipal é rara o
bastante para não compensar varrer todo dia (chegou a rodar diário, seg–sex, na versão
anterior em Python).

**Teto de 45 edições por execução**: cada edição leva ~40–70s (baixar + extrair 60–170
páginas + pausa de 1s entre downloads, para não levar bloqueio por rajada do host de
storage da Prefeitura). 45 cabe folgado no limite de 30 min do job. Só importa no primeiro
backfill grande (~55 edições de uma vez): o script imprime quantas ficaram de fora
(`restantes`) e basta rodar de novo — o dedupe pula o que já entrou.

🔴 **Não existe scraping sob demanda pela tela.** Ao contrário de IDEMA e Extremoz — cujo
botão "Atualizar Dados" no Portal dispara uma Edge Function de verdade —, o botão do card
"Diário Oficial - Natal" chama só `fetchNatalFromDb()` (`src/pages/Portal.tsx:676`), que
**relê o banco**. Para trazer edição nova, é preciso esperar o cron mensal ou disparar o
workflow manualmente no GitHub.

---

## 4. Como o reconhecedor decide o que é uma publicação real

Arquivo: `src/lib/dom-natal-licencas.ts` (lógica pura, sem I/O — por isso é testável e
reaproveitada pelo script sem cópia).

1. **`segmentarBlocos`** quebra o texto da edição em blocos: por parágrafo (linha em
   branco dupla) e por início de cabeçalho de ato em CAIXA ALTA (`PORTARIA`, `DECRETO`,
   `EDITAL`, `SECRETARIA MUNICIPAL`...). Blocos curtos (< 40 caracteres) são colados no
   anterior.
2. **`classificarTipoLicenca`** testa se o bloco menciona LP, LI ou LO (regex tolerante a
   acento/hífen).
3. **`pareceContextoNormativo`** rejeita o bloco se ele parece **texto de norma** (uma
   portaria/decreto que *fala sobre* licenças, sem conceder nenhuma) — é o guarda contra o
   falso positivo medido na Fase 1: uma portaria da SEMURB que lista "emissão de Licença de
   Operação" como um dos usos possíveis de um laudo técnico, sem que isso seja uma licença
   concedida a ninguém.
4. **`temSinalDePublicacaoReal`** exige, além da menção ao tipo, um sinal concreto de ato:
   "torna público que requereu/recebeu", verbo de concessão perto do termo, número de
   licença, ou CNPJ de empreendedor junto de menção a obra/empreendimento.
5. **`extrairPublicacoesDeLicenca`** só devolve o que passou nos três testes. O texto do
   bloco é aparado em 2000 caracteres (o que cabe em `licencas_natal.bloco_texto`).

O filtro é conservador de propósito: melhor devolver "nada encontrado" na maioria das
edições do que encher a tela de prospecção com portarias que só citam o termo.

---

## 5. Banco e Storage

### 5.1 Tabela `licencas_natal`

Única fonte que a tela lê (`Portal.tsx` → `fetchNatalFromDb`). Colunas relevantes para
esta automação:

| Coluna | Preenchida por este scraper? | Observação |
|---|---|---|
| `data_edicao`, `numero_dom` | sim | vêm do HTML da listagem de edições |
| `tipo_licenca` | sim | "Licença Prévia" / "Licença de Instalação" / "Licença de Operação" |
| `cnpj`, `email` | sim, por regex sobre o bloco | pode vir vazio se o bloco não tiver |
| `bloco_texto` | sim | o trecho reconhecido (até 2000 chars) |
| `bloco_texto_hash` | sim | sha-256 do bloco — **chave de dedupe** (índice único) |
| `pdf_nome`, `pdf_link` | sim | nome do arquivo e URL pública original |
| `pdf_storage_path` | sim | caminho no bucket `dom-natal` (`null` se o upload falhar — não trava o resto) |
| `construtora`, `nome_contato`, `fase_obra`, `endereco_obra`, `razao_social` | **não** | só o scraper Python antigo (removido) preenchia. A tela mostra "—" quando vazio, ver `Portal.tsx:970-971` |

**Dedupe em dois níveis:**
- Por **edição**: antes de baixar, o script lê todo `pdf_link` já gravado e pula os que já
  existem — não reprocessa PDF já visto.
- Por **bloco**: `upsert(..., onConflict: 'bloco_texto_hash', ignoreDuplicates: true)`. Uma
  edição sem nenhuma publicação real grava **um marcador idempotente**
  (`"(Nenhuma LP/LI/LO identificada nesta edição)"`, hash pela URL) — isso evita reler a
  mesma edição vazia todo mês. `isNatalRelevantRecord` (`Portal.tsx:86-94`) filtra esses
  marcadores fora da tela.

**RLS** (`supabase/migrations/20260901120000_dom_natal_licencas_fonte_unica.sql`): só
`select`, exige `empresa_tem_secao('portal')`. **Não há policy de escrita para usuário** —
só o script grava, com `SUPABASE_SERVICE_ROLE_KEY` (que ignora RLS).

### 5.2 Storage — bucket `dom-natal`

Privado, sem pasta por empresa (documento público, igual para todo assinante — mesma
lógica de `empresa_tem_secao('portal')` em vez de `empresa_id`). Caminho:
`{AAAA}/{MM}/{arquivo}.pdf`. Só o script (service role) escreve; leitura exige a seção
`portal`.

---

## 6. 🔴 Estado real: por que a tela mostra "nenhum registro" mesmo com o banco povoado

Duas causas empilhadas — a automação em si (GitHub Actions) e o conteúdo já gravado.
Resumo:

### 6.1 O GitHub Actions está bloqueado pelo firewall do site (confirmado)

Medido com `gh run list --workflow=scrape-dom-natal.yml`: **toda execução do workflow, sem
exceção, falhou** — por dois motivos diferentes, nenhum deles "o site não tem nada para
achar":

| Período | Causa |
|---|---|
| até 01/09/2026 (execuções diárias/semanais, ainda em Python) | `requirements.txt` não encontrado — o script Python já tinha saído do repositório, o workflow ainda tentava instalá-lo |
| 10/09/2026 (`workflow_dispatch` manual, já em Node/tsx) | `ConnectTimeoutError` ao chamar `natal.rn.gov.br` |

A causa da falha de 10/09 foi confirmada em 14/09/2026: o site tem, na frente, um
**firewall FortiGate** (cookie `FGTServer` na resposta) que bloqueia a faixa de IP do
GitHub Actions — uma Edge Function de diagnóstico do Supabase (infra diferente) conectou
sem problema, listagem e download de PDF, nos mesmos endpoints. Detalhe completo no
documento de histórico.

**✅ Corrigido em 14/09/2026**: o script agora roteia a rede pela Edge Function `relay-dom-natal` quando roda no
GitHub Actions (`GITHUB_ACTIONS === 'true'`) — ela busca e repassa os bytes sem processar
nada, e a infraestrutura do Supabase não sofre o bloqueio. Fora do GitHub Actions, o
script continua indo direto. **Falta a confirmação final**: disparar o workflow de
verdade e ver se `Executar scraper` fecha em verde — ainda não feito nesta sessão.

### 6.2 A tabela TEM dados — de uma execução que não está no histórico do GitHub

Conferido em 14/09/2026, lendo a resposta de rede que a própria tela gera ao clicar em
"Atualizar Dados": `licencas_natal` tem **mais de 50 linhas reais**, edições de
`numero_dom` 6124 a 6188 (final de junho a 09/09/2026) — **não está vazia.**

**Toda linha é o marcador `"(Nenhuma LP/LI/LO identificada nesta edição)"`, com
`tipo_licenca: null`.** O reconhecedor rodou de fato, edição por edição, e não achou
nenhuma publicação real em nenhuma das ~55 processadas — coerente com o achado da Fase 1
(§4 acima: 0 de 10 numa amostra bem menor). `isNatalRelevantRecord` filtra esses
marcadores antes da tabela chegar à tela — **por isso ela mostra "Nenhum registro
encontrado" mesmo com o banco não estando vazio.** Isto é o filtro funcionando como
desenhado (esconder marcador, não esconder falha), não um bug — mas explica por si só o
sintoma "sempre retorna vazio", sem precisar do bloqueio de firewall para justificar esse
caso específico.

**Quem gravou essas ~55 linhas, já que o único run do GitHub Actions em 10/09 começou às
22:18 UTC e falhou em 45s?** Os `created_at` das linhas vão de 19:17 a 20:25 UTC no mesmo
dia — **antes** do run que falhou, sem execução correspondente no histórico do
`gh run list`. Explicação mais provável: alguém rodou o script **manualmente/localmente**
(`npx tsx scripts/scrape-dom-natal-licencas.ts`, fora do runner do GitHub) — o que também
explicaria por que funcionou (não está na faixa de IP bloqueada). Não confirmado com quem
rodou.

**Antes de considerar a automação "funcionando de novo", disparar manualmente** (aba
Actions do GitHub → "Scrape DOM Natal" → "Run workflow") e conferir se `Executar scraper`
passa. Com a correção do §6.1 aplicada (relay já publicado em produção), a expectativa é
que passe — mas isso ainda não foi confirmado com uma execução real do workflow.

---

## 7. Pré-requisitos

Segredos no repositório GitHub (Settings → Secrets and variables → Actions):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Sem eles, o passo `Executar scraper` falha na checagem de `requireEnv` do script, com
mensagem apontando o nome da variável ausente.

---

## 8. Onde mexer

| Quero... | Arquivo |
|---|---|
| Mudar a cadência ou os parâmetros padrão | `.github/workflows/scrape-dom-natal.yml` |
| Mudar como edições são descobertas/baixadas, paginação, dedupe por PDF | `scripts/scrape-dom-natal-licencas.ts` |
| Mudar o que conta como publicação real (regex, filtro de falso positivo) | `src/lib/dom-natal-licencas.ts` — **tem teste**, rode `npx vitest run src/lib/dom-natal-licencas.test.ts` depois |
| Mudar como a tela filtra/mostra | `src/pages/Portal.tsx` — `isNatalRelevantRecord`, `normalizeNatalLicenseType`, `fetchNatalFromDb` |
| Mudar tabela/RLS/Storage | migration nova (nunca editar as existentes) — ver `supabase/migrations/20260901120000_dom_natal_licencas_fonte_unica.sql` para o padrão do bucket sem `empresa_id` |

---

## Ver também

- [`../investigacao-dom-pdf.md`](../investigacao-dom-pdf.md) — investigação da Fase 1
  (01/09/2026): schema anterior (`dom_licencas`, hoje removida), teste de extração de PDF
  real, e o raciocínio por trás do filtro conservador. Histórico, não estado atual —
  várias decisões ali (Edge Function, `empresa_id`) mudaram depois.
- [`../divida-tecnica.md`](../divida-tecnica.md) — se a falha de rede do §6 se confirmar
  persistente, é candidata a item novo ali.
