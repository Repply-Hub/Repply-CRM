# Investigação — migração do scraper DOM Natal (PDF real + Edge Function)

**Fase 1 — só investigação. Nada foi alterado em banco, Storage ou código de produção.**

Data: 01/09/2026 · Ambiente medido: repositório local + chamadas de teste ao endpoint
público do DOM e a PDFs de amostra.

> ⚠️ **Supabase MCP indisponível nesta sessão** (`CONNECT_TIMEOUT` após 30s). O schema
> abaixo foi reconstruído a partir das migrations versionadas e de
> `src/integrations/supabase/types.ts`. Onde os dois divergem, está marcado — e essa
> divergência é, por si só, um dos achados.

---

## 0. Resumo executivo — leia isto antes de planejar a Fase 2

1. **Não existe "fluxo n8n" neste repositório.** O que alimenta o DOM Natal hoje é uma
   **rotina em GitHub Actions** (`.github/workflows/scrape-dom-natal.yml`) que roda o
   script Python `scripts/dom_natal_scraper.py`. Ele já faz **exatamente** o que a Fase 2
   quer (lista edições pela API JSON → baixa o PDF real → extrai texto com `pdfplumber`
   → filtra LP/LI/LO por regex → grava). A migração proposta é, na prática, **portar esse
   Python para uma Edge Function Deno** e adicionar (a) guarda do PDF no Storage e (b)
   isolamento por `empresa_id`. Se houver um n8n de verdade rodando fora do repo, ele não
   está documentado em lugar nenhum — **confirmar com o Lucas antes de desligar
   qualquer coisa.**

2. **Há duas tabelas concorrentes e a UI lê a "errada".** O Python grava em
   **`dom_licencas`**. A tela (`src/pages/Portal.tsx`) lê **`licencas_natal`**. Nenhum
   arquivo em `src/` consulta `dom_licencas` (só aparece em `types.ts`). Ou seja: a
   coleta do GitHub Actions **nunca chega na tela**. É por isso que o card "Diário
   Oficial - Natal" mostra "0 registros carregados" no print — o botão "Atualizar Dados"
   do Natal chama `list-dom-editions`, que só **conta** edições e não grava nada.

3. **`dom_licencas` tem colunas que nenhuma migration criou.** `types.ts` declara
   `acao`, `atividade`, `endereco`, `renovacao`, `requerente` — nada disso está no
   `create table`. Foram adicionadas direto no banco (painel ou por um processo externo).
   Isso é a pista mais forte de que **existe, sim, um automatismo externo** (n8n?) que
   evoluiu o schema por fora do controle de versão.

4. **Nenhuma das 10 edições de amostra (mai–ago/2026) contém uma publicação real de
   licença ambiental LP/LI/LO.** O único casamento literal de "Licença de Operação" veio
   **dentro de uma portaria normativa** — um **falso positivo** que o regex atual
   (`dom_licencas` e o Python) capturaria. O DOM de Natal é município: publica portaria,
   dispensa de licitação, "Natal Mais Verde", nomeação. O licenciamento **ambiental** do
   RN é estadual e sai no **IDEMA**, não aqui. **Antes da Fase 2, alinhar com o Lucas o
   que ele realmente quer pescar do DOM Natal** (licença de construção / alvará /
   habite-se da SEMURB? ou de fato as raras LP/LI/LO municipais?). O custo de errar isso
   é construir um scraper que devolve quase só placeholder.

5. **Extração de texto: 3/3 PDFs de amostra são nativos e pesquisáveis. 0 escaneados,
   0 precisam de OCR.** Gerados por InDesign → Adobe PDF Library. `pdf-parse@1.1.1` (já
   usado em 3 Edge Functions do projeto) e `unpdf@1.8.1` extraíram o texto sem problema.

6. **O endpoint `GET /api/dom/data/{mes}/{ano}` ignora qualquer query string.** Sempre
   devolve o mês inteiro. O "quantidade visível" do site é 100% client-side (DataTables).

7. **`scrape-licencas-idema` NÃO usa Storage.** Ele baixa o PDF, extrai e descarta. O
   padrão de path `{empresa_id}/...` que a Fase 2 quer replicar vem de **outros** baldes
   privados do projeto — `fabricante-arquivos` e `pedido-anexos` (detalhe no §6).

8. **Nenhuma das tabelas do Portal tem `empresa_id`** — e isso foi **decisão
   deliberada** (migration `20260822221102`). São dados públicos, iguais para todo
   mundo; o que isola é a seção `portal`, não a linha. Adicionar `empresa_id` a
   `dom_licencas` contraria essa decisão — **é assunto para o Lucas** (§1 e §6).

---

## 1. Schema atual

### 1.1 `dom_licencas` — a tabela que o scraper Python alimenta

**Migration de criação:** [`supabase/migrations/20260619000000_dom_licencas.sql`](../supabase/migrations/20260619000000_dom_licencas.sql)

```sql
create table public.dom_licencas (
  id             uuid        primary key default gen_random_uuid(),
  data_edicao    date,
  numero_edicao  text,
  tipo_edicao    text,
  url_pdf        text        not null,
  tipos_licenca  text[]      not null default '{}',
  processo       text,
  texto_bloco    text,
  criado_em      timestamptz default now(),
  unique (url_pdf, texto_bloco)
);

alter table public.dom_licencas enable row level security;
```

**Constraints / índices:**

| Item | Definição | Observação |
|---|---|---|
| PK | `id` (uuid, default `gen_random_uuid()`) | |
| UNIQUE | `(url_pdf, texto_bloco)` | **É a chave de dedupe.** O Python faz `upsert(..., on_conflict="url_pdf,texto_bloco")`. Índice único implícito criado por essa constraint. |
| RLS | habilitada | |

**Nenhum índice adicional** (sem índice em `data_edicao`, `processo` ou GIN em
`tipos_licenca`). Volume hoje é baixo, então não dói — ainda.

**Policies de RLS** (estado após [`20260822221102_portal_exige_secao.sql`](../supabase/migrations/20260822221102_portal_exige_secao.sql)):

```sql
-- SELECT: exige a seção 'portal' da empresa
create policy dom_licencas_select on public.dom_licencas
  for select to authenticated using (empresa_tem_secao('portal'));

-- Não há policy de INSERT/UPDATE/DELETE.
-- Escrita só via service_role (GitHub Actions / Edge Function), que ignora RLS.
```

Comentário textual da própria migration, que responde direto à pergunta da Fase 1:

> POR QUE A CONDIÇÃO É "VOCÊ TEM O PORTAL?" E NÃO "ESTA LINHA É SUA?": estas tabelas não
> têm `empresa_id`. São dados públicos de licença ambiental e de diário oficial, iguais
> para todo mundo — o que não pode é a empresa que não contratou o módulo alcançá-los.

**→ `empresa_id`: NÃO existe em `dom_licencas`, e a ausência é intencional.** Adicioná-lo
na Fase 2 é uma mudança de produto (ver §6 e §7).

### 1.2 ⚠️ Divergência: `types.ts` declara colunas que nenhuma migration criou

[`src/integrations/supabase/types.ts:1083`](../src/integrations/supabase/types.ts#L1083) —
`dom_licencas.Row`:

```ts
Row: {
  acao: string | null          // ← não está no create table
  atividade: string | null     // ← não está no create table
  criado_em: string | null
  data_edicao: string | null
  endereco: string | null      // ← não está no create table
  id: string
  numero_edicao: string | null
  processo: string | null
  renovacao: boolean | null    // ← não está no create table
  requerente: string | null    // ← não está no create table
  texto_bloco: string | null
  tipo_edicao: string | null
  tipos_licenca: string[]
  url_pdf: string
}
```

`grep -rn "requerente\|renovacao\|atividade" supabase/migrations/` → **nada** para
`dom_licencas`. Essas 5 colunas foram adicionadas **fora das migrations** (painel do
Supabase ou processo externo) e alguém atualizou `types.ts` à mão para acompanhar
(prática registrada no CLAUDE.md §8). Isso reforça a hipótese de um automatismo externo
não versionado — possivelmente o "n8n" citado no enunciado.

**Ação para a Fase 2:** conferir o schema real com o MCP quando voltar
(`select column_name, data_type from information_schema.columns where table_name =
'dom_licencas'`) e reconciliar migration + `types.ts` num arquivo novo.

### 1.3 `licencas_natal` — a tabela que a TELA de fato lê

Reconstruída de 2 migrations:

- Criação: [`20260318144410_c705f041-...sql`](../supabase/migrations/20260318144410_c705f041-88e0-4ed4-b147-a62ec78551fd.sql)
- Colunas extras: [`20260326194928_4979309f-...sql`](../supabase/migrations/20260326194928_4979309f-1dc6-4626-833e-ed3f5fcd12e6.sql)

```sql
CREATE TABLE public.licencas_natal (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_edicao  TEXT,           -- ⚠️ TEXT, não DATE (ao contrário de dom_licencas)
  numero_dom   TEXT,
  tipo_licenca TEXT,
  cnpj         TEXT,
  razao_social TEXT,
  obra_descricao TEXT,
  pdf_nome     TEXT,
  pdf_link     TEXT,
  bloco_texto  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- + ADD COLUMN IF NOT EXISTS: nome_contato, email, telefone,
--   endereco_obra, construtora, fase_obra   (todas text)
```

- **Sem constraint UNIQUE.** O dedupe de `scrape-dom-natal` é feito em código: lê todos os
  `pdf_link` já gravados e pula os repetidos (nível de PDF inteiro, não de bloco).
- **Sem `empresa_id`.**
- Há um `CREATE TABLE IF NOT EXISTS public.licencas_natal (...)` **totalmente diferente**
  (colunas `obra_id, numero, validade, status`) em
  [`20260504172116_d58aba56-...sql:123`](../supabase/migrations/20260504172116_d58aba56-3ac8-4d4c-8aeb-e14b7af32eb9.sql#L123)
  — é **no-op** (a tabela já existia), lixo de migration antiga. Ignorar.

**Policies** (após `20260822221102`):

```sql
create policy licencas_natal_select on public.licencas_natal
  for select to authenticated using (empresa_tem_secao('portal'));

create policy licencas_natal_write on public.licencas_natal
  for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());
```

---

## 2. Como o fluxo atual está estruturado

### 2.1 O que existe no repositório (3 pipelines Natal sobrepostos)

| # | Componente | Escreve em | Extração | Acionado por | Estado real |
|---|---|---|---|---|---|
| 1 | `scripts/dom_natal_scraper.py` + `.github/workflows/scrape-dom-natal.yml` | **`dom_licencas`** | `pdfplumber` (Python) | Cron GitHub Actions (seg–sex 09:00 UTC) + `workflow_dispatch` | **Ativo.** É o "fluxo cron" citado no SPEC.md §5.5. **Não aparece na tela** (UI lê `licencas_natal`). |
| 2 | `supabase/functions/scrape-dom-natal/index.ts` | `licencas_natal` | `pdf-parse@1.1.1` (Deno) | — nenhum caller em `src/` — | Órfão. Faz quase o que a Fase 2 quer, mas ninguém chama. |
| 3 | `supabase/functions/extract-natal-pdf/index.ts` | (retorna JSON; quem chama insere) | `pdf-parse` **+ IA** (Gemini 2.5 Flash via `ai.gateway.lovable.dev`) | — nenhum caller em `src/` — | Órfão. Abordagem "LLM extrai os campos". |
| 4 | `supabase/functions/list-dom-editions/index.ts` | nada (só lista) | — | `Portal.tsx` → `scrapeNatal()` | **É o único que o botão "Atualizar Dados" do Natal chama.** Só conta edições no período; não baixa PDF, não grava. |

`grep` que comprova a desconexão:

```
$ grep -rn "dom_licencas" src/
src/integrations/supabase/types.ts:1083:      dom_licencas: {      ← só o tipo, nenhuma query

$ grep -rn "licencas_natal" src/
src/pages/Portal.tsx:442:  let query = supabase.from('licencas_natal').select('*')...
```

### 2.2 Campos que o Python extrai hoje (`extrair_licencas`)

Por bloco de texto que casa LP/LI/LO, grava em `dom_licencas`:

```python
{
  "data_edicao":   edicao["data"],       # ISO, vindo do texto do <a>
  "numero_edicao": edicao["numero_edicao"],
  "tipo_edicao":   edicao["tipo"],       # "Padrão" | "Extra" | "Especial"
  "url_pdf":       edicao["url"],
  "tipos_licenca": tipos,                # lista: ["LP"], ["LI","LO"], ...
  "processo":      proc_m.group(1) or None,   # regex PADRAO_PROCESSO
  "texto_bloco":   limpo[:2000],
}
```

Ou seja: **não extrai CNPJ, e-mail, razão social, endereço nem fase de obra.** Guarda o
bloco cru (2000 chars) e o tipo. O enriquecimento fica por conta de quem lê.
(A Edge Function órfã `scrape-dom-natal` extrai um pouco mais: CNPJ e e-mail por regex.
A `extract-natal-pdf` é a única que tenta os campos ricos — via LLM.)

### 2.3 Como resolve `empresa_id` hoje

**Não resolve.** Nenhum dos 4 componentes conhece empresa. `dom_licencas` e
`licencas_natal` não têm a coluna. O acesso é regulado só pela seção `portal`
(exclusiva da MD Representações — SPEC.md §5.5). O Python usa `SUPABASE_SERVICE_ROLE_KEY`
e escreve global.

### 2.4 A API de descoberta de edições (usada pelos 3 pipelines)

`GET https://www.natal.rn.gov.br/api/dom/data/{mes}/{ano}`

Resposta (formato real, confirmado no teste — ver §5):

```json
{"data":[
  ["<a href='https://natal.rn.gov.br/storage/app/media/DOM/anexos/dom_20260802_4381bee03374018fabb4a94873c6469b.pdf' target='_blank'> Ano XXVI - Num. 6155 - 03/08/2026</a>"],
  ["<a href='.../dom_20260802_extra_ac1f7894301988a992fc0ba5673d090d.pdf' target='_blank'> Ano XXVI - Num. 6156 - Extra - 03/08/2026</a>"],
  ...
]}
```

Cada item é uma célula HTML com um `<a>`. Regex de extração (idêntico nos 3):

```
href='([^']+\.pdf)'                  → URL do PDF
(\d{2})/(\d{2})/(\d{4})              → data da edição
Num\.?\s*(\d+)                       → número da edição
-\s*(Extra|Especial)\s*-            → tipo (senão "Padrão")
```

Padrão do nome do arquivo: `dom_{AAAAMMDD}_{hash32hex}.pdf` ou
`dom_{AAAAMMDD}_extra_{hash32hex}.pdf`.

---

## 3. Teste de extração de PDF (amostra real)

### 3.1 Amostras baixadas

| # | URL | Páginas | Tamanho | Gerador (pdfinfo) |
|---|---|---|---|---|
| p1 | `.../dom_20260831_84ff746efdfd221412ea7c6b92427a3c.pdf` (URL do enunciado) | 35* | 252 730 B | Adobe InDesign CS6 → Adobe PDF Library 10.0.1 |
| p2 | `.../dom_20260802_4381bee03374018fabb4a94873c6469b.pdf` (Num. 6155, 03/08) | 4 | 881 510 B | idem |
| p3 | `.../dom_20260802_extra_ac1f7894301988a992fc0ba5673d090d.pdf` (Num. 6156, Extra) | — ** | 976 524 B | idem |
| s1–s7 | 7 edições espalhadas de jun–jul/2026 | 4–~20 | 100 KB – 341 KB | idem |

\* `pdfinfo`/`pdftotext` (poppler) leem 35 páginas; `pdf-parse` e `unpdf` (pdf.js) leem
18. Divergência de contagem de página entre motores — o **texto sai completo nos dois
casos** (~170 KB), então não bloqueia. Vale registrar para não assustar na Fase 2.

\*\* p3 tem a árvore de páginas quebrada (`pdfinfo` diz "0 page(s)"), mas `pdftotext`
extraiu 236 KB de texto normalmente. Nenhum motor falhou.

### 3.2 Resultado

| Motor | p1 | Observação |
|---|---|---|
| `pdftotext` (poppler) | 171 853 chars | referência |
| **`pdf-parse@1.1.1`** (Deno/Node) | 174 520 chars, 18 "págs" | **já usado em `scrape-dom-natal`, `scrape-licencas-idema`, `extract-natal-pdf`** |
| `unpdf@1.8.1` (pdf.js, feito p/ Deno/workers) | 165 933 chars, 18 págs | alternativa moderna, sem `Buffer` do Node |

**0 de 10 PDFs de amostra são escaneados. 0 precisam de OCR.** Todos são diagramados no
InDesign e exportados como PDF de texto. É plausível que uma errata ou anexo pontual
venha como imagem, mas na amostra (mai–ago/2026) não apareceu nenhum. **Nesta fase, sem
OCR — proporção escaneada medida: 0%.**

### 3.3 Trecho real extraído (via `pdf-parse`, de `dom_20260831_...pdf`)

Cabeçalho da edição:

```
Diário Oficial do Município
Instituído pela Lei Nº. 5.294 de 11 de outubro de 2001
Alterada pela Lei Nº. 6.485 de 28 de agosto de 2014
ADMINISTRAÇÃO DO EXCELENTÍSSIMO SENHOR PAULO EDUARDO DA COSTA FREIRE - PREFEITO
PODER  EXECUTIVO
PORTARIA Nº. 3413/2026-A.P., DE 31 DE AGOSTO DE 2026.
O PREFEITO DO MUNICÍPIO DE NATAL, no uso de suas atribuições legais, tendo em vista o
que consta o artigo 55, inciso II, da Lei Orgânica do Município, e Ofício n.º 549/2026-GP,
RESOLVE:
Art. 1º. Nomear JOÃO MARIA DE SOUZA, para exercer o cargo de provimento em comissão
de assessor de Planejamento, símbolo APL[...]
```

Único trecho da mesma edição que casa "Licença de Operação" — **e é um falso positivo**
(portaria normativa, não uma licença concedida a ninguém):

```
PORTARIA Nº 31/2026 – GS/SEMURB, DE 31 DE AGOSTO DE 2026.
Regulamenta a apresentação de laudos técnicos e dos registros fotográficos da vistoria em
substituição à realização de vistoria pela Secretaria Municipal de Meio Ambiente e Urbanismo
– SEMURB [...]
Art. 6º Os laudos técnicos poderão ser utilizados [...] para instruir processos destinados à:
I – emissão de Certidão de Conclusão de Obras;
II – emissão de Licença de Operação;
III – emissão conjunta de Certidão de Conclusão de Obras e Licença de Operação;
```

O regex atual (`PADRAO_LO = /Licen[çc]a\s+(Ambiental\s+)?de\s+Opera[çc][ãa]o.../i`)
grava esse bloco como se fosse uma licença. Na tela isso vira uma linha de prospecção
sem CNPJ, sem obra, sem nada.

---

## 4. Padrão textual dos blocos de publicação

### 4.1 Como os atos se separam dentro do diário

- O texto extraído **não tem separador estrutural confiável**. Não há `\f` (form feed)
  entre atos, não há numeração de seção consistente.
- O que se repete é o **cabeçalho do ato em CAIXA ALTA no começo da linha**:
  `PORTARIA Nº ...`, `DECRETO Nº ...`, `EXTRATO DE CONTRATO`, `AVISO DE DISPENSA DE
  LICITAÇÃO ELETRÔNICA Nº ...`, `SECRETARIA MUNICIPAL DE ...`, `EDITAL Nº ...`,
  `COMUNICADO Nº ...`, `TERMO DE ...`.
- Os scrapers atuais **não usam esses cabeçalhos**. Ambos quebram por **parágrafo duplo**
  (`re.split(r"\n\s*\n", texto)` no Python; `texto.split(/\n\s*\n/)` na Edge Function) e
  testam cada bloco. É grosseiro: um ato longo vira vários blocos; uma tabela vira um
  bloco gigante.

### 4.2 Como reconhecer LP / LI / LO

Regex em uso (Python e Edge, idênticos):

```
PADRAO_LP = /Licen[çc]a\s+Pr[ée]via(\s*[-–]?\s*LP)?/i
PADRAO_LI = /Licen[çc]a\s+de\s+Instala[çc][ãa]o(\s*[-–]?\s*LI)?/i
PADRAO_LO = /Licen[çc]a\s+(Ambiental\s+)?de\s+Opera[çc][ãa]o(\s*[-–]?\s*LO)?/i
PADRAO_PROCESSO = /Processo\s*n?[ºo°]?\.?\s*[:\-]?\s*([A-Z]{2,10}[-.]?\d{6,20})/i
```

Comentário no código (correto): "sem `\bLP\b` isolado para evitar falsos positivos" — LP
sozinho casaria com qualquer sigla.

### 4.3 🔴 O achado que muda a Fase 2: a amostra não tem publicação real de LP/LI/LO

Varri **10 edições** (p1–p3 de ago + s1–s7 de mai–jul/2026) com buscas amplas:
`licença prévia|de instalação|de operação`, `torna público que requereu`, `requereu à
SEMURB`, `recebeu da SEMURB`, `licenciamento ambiental`, `EIA/RIMA`, `impacto de
vizinhança`, `EIV`, `condicionantes`, `alvará de construção`, `habite-se`.

Resultado:

| Busca | Ocorrências reais (todas as 10 edições) |
|---|---|
| "Licença de Operação" (literal) | **2 — ambas na portaria normativa de p1 (falso positivo)** |
| "Licença Prévia" / "Licença de Instalação" (literal) | **0** |
| "torna público que requereu/recebeu ... SEMURB" | 0 |
| "impacto de vizinhança" / "EIA" / "EIV" | 0 |
| "Habite-se" | 1 (menção solta) |
| "torna público que..." | dezenas — **todas** de dispensa de licitação, credenciamento, pauta de julgamento, "Natal Mais Verde" |

**Leitura:** o licenciamento **ambiental** no RN é competência **estadual (IDEMA)** — que
o Portal já cobre por Edge Function dedicada. O DOM **municipal** de Natal, pela SEMURB,
trata de **obra e edificação** (Código de Obras, LC 258/2024): alvará de construção,
habite-se, certidão de conclusão. Publicações de LP/LI/LO municipais existem, mas são
**raras e esporádicas** — nenhuma caiu numa amostra de 10 edições cobrindo 4 meses.

**→ Pergunta obrigatória para o Lucas antes da Fase 2** (CLAUDE.md §11 — "a mudança
altera o que o cliente vê"):

> O que a MD quer pescar do Diário de Natal? (a) as raras LP/LI/LO municipais mesmo — e
> aceita que a maioria das edições volte "nada encontrado"; ou (b) os atos de **obra**
> da SEMURB (alvará de construção / habite-se / aprovação de projeto), que é o que de
> fato aparece e serve de gatilho de prospecção?

A resposta decide o dicionário de regex/prompt da Fase 2. Construir para (a) sem
confirmar entrega um módulo que parece quebrado.

---

## 5. Comportamento real do endpoint `/api/dom/data/{mes}/{ano}`

Testes com `curl` (01/09/2026), UA de navegador + `X-Requested-With: XMLHttpRequest` +
`Referer: https://www.natal.rn.gov.br/dom`:

| Chamada | HTTP | Resultado |
|---|---|---|
| `/api/dom/data/08/2026` | 200 | 27 edições, 5 039 B |
| `/api/dom/data/08/2026?length=5&start=0` | 200 | **byte a byte idêntico** à chamada sem params |
| `/api/dom/data/08/2026?quantidade=5` | 200 | **idêntico** |
| `/api/dom/data/2/2026` (mês sem zero à esquerda) | 200 | 29 edições — funciona |
| `/api/dom/data/13/2026` (mês inválido) | 200 | `{"data":[]}` |

**Conclusões:**

1. **Nenhuma paginação ou parâmetro de quantidade.** A API sempre devolve o mês inteiro.
   O seletor "Mostrar N registros" do site é o **DataTables**, puramente client-side.
2. O filtro é só **`{mes}/{ano}`** no path. Para um intervalo de datas, é uma chamada por
   mês (é o que o Python e `list-dom-editions` já fazem, iterando meses).
3. Aceita mês com ou sem zero (`2` e `02`). O código atual manda com zero (`padStart(2,
   '0')`) — manter.
4. Mês inválido não dá erro, devolve lista vazia — tratar como "0 edições".
5. Resposta é minúscula (~5 KB/mês); o custo real está em **baixar cada PDF** (100 KB –
   1 MB cada, 25–30 por mês).

---

## 6. Padrão de path no Storage com `empresa_id`

### 6.1 `scrape-licencas-idema` NÃO guarda PDF

Confirmado lendo
[`supabase/functions/scrape-licencas-idema/index.ts`](../supabase/functions/scrape-licencas-idema/index.ts):
ele faz `fetch(card.url_licenca)` → `pdfParse(Buffer.from(buf))` → `update` de 3 campos
de texto (`endereco_empreendimento`, `coordenadas_utm`, `cpf_cnpj_formatado`) → **o
buffer é descartado**. Nenhuma chamada a `supabase.storage`. Não há bucket do IDEMA.

Então o "padrão de path com `empresa_id`" a replicar vem de **outros** lugares.

### 6.2 O padrão canônico do projeto: 1ª pasta = `empresa_id`

**Balde privado `fabricante-arquivos`** —
[`20260826200000_fabricante_arquivos.sql`](../supabase/migrations/20260826200000_fabricante_arquivos.sql):

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('fabricante-arquivos', 'fabricante-arquivos', false, 52428800)  -- 50 MB, privado
on conflict (id) do nothing;

-- caminho: {empresa_id}/{fabricante_id}/{arquivo}
-- "A PRIMEIRA pasta é o que permite recusar quem é de outra empresa —
--  ela existe por isso, não é organização visual."
create policy "fabricante_arquivos_ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
  );
-- + policies de insert e delete no mesmo molde
```

**Balde `pedido-anexos`** — `supabase/functions/resolve-pedido-anexo/index.ts:95`:

```ts
const path = `${empresaId}/${crypto.randomUUID()}-anexo.${ext}`;
const { data: uploaded, error } = await supabase.storage
  .from(STORAGE_BUCKET)                       // "pedido-anexos"
  .upload(path, bytes, { contentType, upsert: false });
```

Mesma ideia em `whatsapp-webhook` (`whatsapp-media`) e `email-mensagem` (`email-assets`).

### 6.3 Helpers prontos para link assinado

`supabase/functions/_shared/arquivo-privado.ts` — `enderecoParaQuemBaixaDeFora(supabase,
url, validadeSegundos)` gera signed URL a partir de uma URL gravada. Gêmeo de
`src/lib/arquivo-privado.ts` (os dois têm de concordar).

### 6.4 O que isso significa para o bucket do DOM

Se a Fase 2 for guardar o PDF do diário, o molde é:

- Bucket **`dom-natal`** (ou `dom-pdfs`), **privado**, `file_size_limit` folgado
  (medido: PDFs de até ~1 MB; sugerir 10 MB).
- Policies em `storage.objects` no padrão `(storage.foldername(name))[1] =
  get_my_empresa_id()::text`.
- **Porém:** o diário é **um arquivo público, igual para toda empresa**. Prefixar por
  `empresa_id` só faz sentido se `dom_licencas` também ganhar `empresa_id` — e aí o mesmo
  PDF seria baixado e guardado N vezes, uma por empresa. Isso **contraria a decisão da
  migration `20260822221102`** ("estas tabelas não têm `empresa_id`... são dados
  públicos... iguais para todo mundo").
- **Alternativas a levar ao Lucas:**
  1. **Sem `empresa_id`** (coerente com hoje): path por data — `{AAAA}/{MM}/dom_...pdf`;
     bucket privado com policy `empresa_tem_secao('portal')`. Um PDF, uma cópia.
  2. **Com `empresa_id`** (se o Portal deixar de ser exclusivo da MD e virar multi-tenant
     de verdade): path `{empresa_id}/{AAAA}/{MM}/...`, `dom_licencas.empresa_id not null`,
     RLS por linha. Mais caro, duplica storage, mas isola de verdade.

Recomendação técnica: **opção 1** enquanto o Portal for exclusivo da MD. É o que o
resto do sistema assume para essas tabelas.

---

## 7. Recomendação técnica para a Fase 2

### 7.1 Antes de escrever código — 3 confirmações com o Lucas

1. **Escopo do que pescar** (§4.3): LP/LI/LO municipais raras, ou atos de obra da SEMURB?
2. **Existe um n8n externo de verdade?** (§0.1, §1.2). Se existir, ele é o dono das
   colunas `requerente/atividade/renovacao/...` de `dom_licencas`. Precisa entrar no
   inventário antes de "substituir".
3. **`empresa_id` no Portal** (§6.4): manter global (opção 1) ou multi-tenant (opção 2)?

### 7.2 Tabela — recomendação: **estruturar `dom_licencas`, aposentar `licencas_natal`
para o Natal**

- A tela hoje lê `licencas_natal`, mas o pipeline ativo escreve `dom_licencas`. Escolher
  **uma**. `dom_licencas` é a mais nova, tem `data_edicao DATE` (correto) e já tem
  dedupe. Recomendo **consolidar em `dom_licencas`** e apontar `Portal.tsx` para ela.
- Migration nova (nunca editar as existentes — CLAUDE.md §6.3) que:
  - reconcilia as colunas fantasma (§1.2) — declara no SQL o que já existe no banco;
  - adiciona os campos de prospecção que faltam: `cnpj text`, `email text`,
    `razao_social text`, `endereco_obra text`, `fase_obra text`, `municipio text` (fixo
    'Natal' aqui, mas deixa o Portal genérico);
  - adiciona `pdf_storage_path text` (caminho no bucket) e `pdf_hash text` (sha-256 do
    binário, para dedupe de PDF independente da URL);
  - índices: `create index on dom_licencas (data_edicao desc)` e
    `create index on dom_licencas using gin (tipos_licenca)`.
- Se o Lucas quiser `empresa_id` (opção 2 do §6.4), ele entra **not null** nessa mesma
  migration com RLS por linha; senão, mantém a policy `empresa_tem_secao('portal')`.

### 7.3 Chave de dedupe — **dois níveis**

1. **Nível PDF:** `pdf_hash` (sha-256 do arquivo baixado). Melhor que `url_pdf` porque o
   município às vezes republica a mesma edição em URL nova. Antes de processar: se o hash
   já existe, pula o PDF inteiro.
2. **Nível bloco:** manter a `unique (url_pdf, texto_bloco)` que já existe — ou trocar
   por `unique (pdf_hash, bloco_hash)` onde `bloco_hash = sha-256(texto_bloco
   normalizado)`. Normalizar = colapsar espaços, remover acento, lowercase, cortar em N
   chars — senão uma quebra de linha diferente do extrator gera "novo" registro.

`upsert(..., onConflict: 'pdf_hash,bloco_hash', ignoreDuplicates: true)`.

### 7.4 Lib de extração — **`unpdf`**

- **`unpdf@1.8.1`** para a Edge Function nova. Motivos: é `pdfjs-dist` empacotado para
  serverless/workers (Deno, Cloudflare, Vercel Edge), sem depender de `Buffer` nem `fs`
  do Node; API limpa (`getDocumentProxy` + `extractText`); mantida ativamente.
- **`pdf-parse@1.1.1`** é a alternativa segura: **já roda em produção** em 3 Edge
  Functions do projeto (`scrape-dom-natal`, `scrape-licencas-idema`, `extract-natal-pdf`)
  via `npm:pdf-parse@1.1.1/lib/pdf-parse.js` + `Buffer` de `node:buffer`. Se a prioridade
  for "não introduzir dependência nova", usar essa e copiar o padrão de
  `scrape-dom-natal`.
- Ambas extraíram os 3 PDFs de amostra sem erro. **Sem OCR nesta fase** (0% escaneado).
  Deixar um `if (texto.length < 500) → grava placeholder '(sem texto extraível)'` para
  não reprocessar e para sinalizar se um dia aparecer PDF-imagem.
- Cuidado medido: `pdf-parse`/`unpdf` (pdf.js) contam páginas diferente do poppler em
  alguns PDFs; o texto sai completo, então não afeta a extração — só não confiar em
  `numpages` para nada.

### 7.5 Estrutura da Edge Function (portar o Python, +Storage)

Molde: `scrape-licencas-idema` (guarda de auth já resolvida ali — reaproveitar):

1. **Auth**: dois caminhos, igual `scrape-licencas-idema` — JWT de usuário
   (`empresa_tem_secao('portal')`) **ou** `role: service_role` no JWT (cron via
   `chamar_edge_function`).
2. **Descoberta**: uma chamada `/api/dom/data/{mes}/{ano}` por mês do intervalo
   (reaproveitar `listarEdicoesMes` de `list-dom-editions`).
3. **Filtro de novos**: `select pdf_hash from dom_licencas` → set; mas o hash só se sabe
   depois de baixar. Otimização: manter também `url_pdf` gravado e pular por URL antes de
   baixar; só cair no hash para URLs novas.
4. **Por PDF novo** (lote de ~10 por execução, `restantes` no retorno — padrão já usado):
   baixar → `sha-256` → se hash conhecido, pular → `unpdf`/`pdf-parse` → **upload no
   bucket privado** (`{AAAA}/{MM}/{nome}.pdf`, `upsert:false`, ignorar erro "já existe")
   → quebrar em blocos → detectar tipo (regex do §4.2, **corrigido para excluir o padrão
   "emissão de Licença de..." / "instruir processos destinados à"** — o falso positivo do
   §3.3) → extrair CNPJ/e-mail/processo por regex → `upsert`.
5. **Sem licença no PDF**: gravar 1 placeholder por PDF (padrão atual) para não
   reprocessar.
6. **Retorno**: `{ processados, inseridos, restantes, message }` — mesmo formato de
   `scrape-dom-natal`, o `Portal.tsx` já sabe exibir.
7. **`Portal.tsx`**: trocar `scrapeNatal()` para chamar a função nova (hoje chama
   `list-dom-editions`, que não grava nada) e trocar `fetchNatalFromDb()` para ler
   `dom_licencas`.

### 7.6 Extração dos campos ricos — regex, não LLM (por ora)

`extract-natal-pdf` usa Gemini via `ai.gateway.lovable.dev` (`LOVABLE_API_KEY`). Fica
para uma fase posterior se o regex não der conta: custo por PDF, dependência de chave de
terceiro, e o texto do DOM é padronizado o bastante para regex. Se for por LLM, isolar
num passo 2 opcional (como o enriquecimento por PDF do IDEMA, que roda em
`EdgeRuntime.waitUntil`).

### 7.7 Cron

Trocar o trigger: hoje é GitHub Actions chamando Python. Passar para `pg_cron` →
`chamar_edge_function` (padrão do IDEMA), ou manter o Actions só trocando o comando para
um `curl` na Edge Function. Manter o Python e o workflow **ligados** até a Edge Function
provar paridade (rodar os dois em paralelo gravando na mesma tabela com dedupe por hash —
não vão brigar).

---

## Anexo — comandos de verificação usados

```sh
# schema
grep -rn "dom_licencas\|licencas_natal" supabase/migrations/*.sql
sed -n '1083,1130p' src/integrations/supabase/types.ts

# endpoint
curl -s -H "X-Requested-With: XMLHttpRequest" -H "Referer: https://www.natal.rn.gov.br/dom" \
  "https://www.natal.rn.gov.br/api/dom/data/08/2026"
# + variações ?length= ?quantidade= /13/2026 /2/2026  → params ignorados

# PDFs de amostra
curl -sL -A "<UA de navegador>" -o p1.pdf \
  "https://natal.rn.gov.br/storage/app/media/DOM/anexos/dom_20260831_84ff746efdfd221412ea7c6b92427a3c.pdf"
pdfinfo p1.pdf ; pdftotext p1.pdf p1.txt
node -e 'require("pdf-parse")(require("fs").readFileSync("p1.pdf")).then(d=>console.log(d.text.length))'
node --input-type=module -e 'import {extractText,getDocumentProxy} from "unpdf"; ...'

# falso positivo
grep -n -E "Licen[çc]a\s+(Ambiental\s+)?de\s+Opera[çc][ãa]o" p1.txt
```

Amostras baixadas em `/tmp/domtest/` (fora do repo; não commitadas).
