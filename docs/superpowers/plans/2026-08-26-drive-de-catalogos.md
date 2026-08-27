# Drive de catálogos por fabricante — plano de implementação

> **Para quem for executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** o representante anexa catálogos, folders e planilhas na ficha de cada fábrica,
vê a capa do PDF no cartão, abre a pré-visualização e baixa. **Sem o envio por WhatsApp** —
esse é a entrega 3.

**Arquitetura:** tabela nova `fabricante_arquivos` + balde **privado desde o nascimento**, com
link temporário assinado a cada exibição. A capa da primeira página do PDF é gerada **no
navegador, no momento de anexar**, e guardada como imagem pequena ao lado do arquivo.

**Entrega 2 de 3.** Desenho: `docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md`.
A entrega 1 (limpeza) foi ao ar em 26/08/2026, commit `acbcb415`.

---

## Restrições globais

- **PT-BR** em interface, documentação, comentário e commit.
- **Verificação obrigatória**, critério é *não subir*: `npx tsc --noEmit -p tsconfig.app.json`
  (**35**) · `npm run test` (**223** + os que este plano acrescenta) · `npm run build` (compila)
  · `npx eslint .` (**456** — a linha de base caiu de 493 na entrega 1).
- 🔴 `npx tsc --noEmit` **sem** `-p` não confere nada e devolve sucesso.
- 🔴 **Nunca `git add -A`.** Duas sessões na mesma pasta. `git status --short` num comando
  separado do commit. O `deno.lock` modificado **não é desta entrega**.
- 🔴 **Autorização do Lucas por commit**, e `git push` **publica em produção** — rode a
  verificação **antes** de pedir o "pode".
- 🔴 **Nada é aplicado no banco sem autorização explícita.**
- **Teto de arquivo: 50 MB.** **Excluir: gestor OU `has_permission(..., 'fabricantes', 'excluir')`.**
- **Layout: grade de cartões arredondados lado a lado. Não é lista.** Foi pedido explicitamente.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/2026XXXX_fabricante_arquivos.sql` | **criar** — tabela, RLS, balde privado, políticas do Storage |
| `src/lib/fabricante-arquivos.ts` | **criar** — funções puras: rótulo da edição, ordenação, tamanho legível |
| `src/lib/fabricante-arquivos.test.ts` | **criar** — os testes delas |
| `src/lib/arquivo-privado.ts` | modificar — ganha `enderecoDoObjeto(balde, caminho)` |
| `src/lib/capa-do-pdf.ts` | **criar** — desenha a 1ª página do PDF numa imagem pequena |
| `src/hooks/use-fabricante-arquivos.ts` | **criar** — listar, anexar, renomear, excluir |
| `src/components/fabricantes/DriveDaFabrica.tsx` | **criar** — a grade de cartões |
| `src/components/fabricantes/CartaoDeArquivo.tsx` | **criar** — um cartão |
| `src/components/fabricantes/AnexarArquivoDialog.tsx` | **criar** — o formulário de anexar |
| `src/pages/Fabricantes.tsx` | modificar — o aviso dá lugar ao drive |
| `package.json` | modificar — `pdfjs-dist` |

**Por que arquivos separados e não tudo em `Fabricantes.tsx`:** aquele arquivo tinha 1.243
linhas e a entrega 1 já tirou 692. Devolver 500 linhas de drive ali desfaz o ganho e recria o
problema que o `CLAUDE.md` §14 aponta. O drive entra como **um componente** que a página chama.

**Não toque** em `src/components/chat/FilePreviewDialog.tsx`: ele já resolve PDF, planilha e
Word, e é usado pelo chat. Reaproveite pela propriedade `file`.

---

## Tarefa 1: o banco e o balde

**Arquivos:**
- Criar: `supabase/migrations/2026XXXXXXXXXX_fabricante_arquivos.sql`

**Interfaces:**
- Produz: tabela `fabricante_arquivos` e o balde `fabricante-arquivos`. As tarefas 4 e 7 usam.

- [ ] **Passo 1: escrever a migration**

```sql
-- ============================================================================
-- Drive de catálogos por fabricante
-- ============================================================================
-- Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
--
-- Substitui o módulo de catálogo de produtos, removido em 26/08/2026 (commit acbcb415).
-- ============================================================================

create table public.fabricante_arquivos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  fabricante_id uuid not null references public.fabricantes(id) on delete cascade,
  nome          text not null,
  caminho       text not null unique,
  -- A capa da 1ª página, só para PDF. Nula quando não deu para gerar — e NÃO gerar não é
  -- erro: PDF protegido cai no ícone do formato e o anexo segue.
  capa_caminho  text,
  tamanho       bigint not null,
  mime          text,
  -- 🔴 Ano obrigatório, mês opcional. Fábrica que faz catálogo anual não deve ser obrigada a
  -- inventar um mês; fábrica que faz mensal precisa distinguir as edições.
  edicao_ano    integer not null check (edicao_ano between 2000 and 2100),
  edicao_mes    integer check (edicao_mes between 1 and 12),
  -- 🔴 `usuarios(id)`, NÃO `auth.users`. As colunas "quem fez" deste banco se dividem entre os
  -- dois, e mandar o errado faz a gravação inteira ser recusada em silêncio. CLAUDE.md §4.5.
  enviado_por   uuid references public.usuarios(id),
  created_at    timestamptz not null default now()
);

-- A ordem que a tela usa: edição mais nova primeiro. `coalesce(mes, 0)` faz o catálogo do ANO
-- se comportar como se fosse de janeiro, então a edição mensal mais recente ganha dele.
create index fabricante_arquivos_ordem
  on public.fabricante_arquivos (fabricante_id, edicao_ano desc, coalesce(edicao_mes, 0) desc, created_at desc);

alter table public.fabricante_arquivos enable row level security;

-- ── Ver e anexar: qualquer pessoa da empresa ───────────────────────────────
-- O catálogo é da FÁBRICA, não de quem subiu: um representante anexa a edição de setembro e
-- os treze da equipe usam. Decisão do Lucas em 26/08/2026.
create policy fabricante_arquivos_select on public.fabricante_arquivos
  for select to authenticated
  using (empresa_id = get_my_empresa_id());

create policy fabricante_arquivos_insert on public.fabricante_arquivos
  for insert to authenticated
  with check (empresa_id = get_my_empresa_id());

create policy fabricante_arquivos_update on public.fabricante_arquivos
  for update to authenticated
  using (empresa_id = get_my_empresa_id())
  with check (empresa_id = get_my_empresa_id());

-- ── Excluir: gestor ou quem tem a permissão ────────────────────────────────
-- Mesmo padrão de `pedidos` (migration 20260824143000). O módulo `fabricantes` já existe em
-- permissoes_usuario com a coluna pode_excluir — nenhuma permissão nova.
create policy fabricante_arquivos_delete on public.fabricante_arquivos
  for delete to authenticated
  using (
    empresa_id = get_my_empresa_id()
    and (is_gestor() or has_permission(get_my_usuario_id(), 'fabricantes', 'excluir'))
  );

comment on table public.fabricante_arquivos is
  'Catálogos, folders e materiais de cada fabricante. Visível para a empresa inteira; só '
  'gestor ou quem tem permissão exclui. Arquivos ficam no balde PRIVADO fabricante-arquivos.';

-- ── O balde, PRIVADO desde o nascimento ────────────────────────────────────
-- 🔴 Os outros 6 baldes deste projeto são ABERTOS: qualquer pessoa com o link baixa 5 GB de
-- anexo de negócio e as imagens de e-mail dos clientes, sem login. A outra sessão está
-- fechando isso (docs/operacao/plano-baldes-privados.md). Nascer aberto criaria o sétimo
-- buraco justamente enquanto os seis fecham — e com material comercial de representada.
insert into storage.buckets (id, name, public, file_size_limit)
values ('fabricante-arquivos', 'fabricante-arquivos', false, 52428800)
on conflict (id) do nothing;

-- ── Políticas do balde ─────────────────────────────────────────────────────
-- O caminho é `{empresa_id}/{fabricante_id}/{arquivo}`. É a PRIMEIRA pasta que permite
-- recusar quem é de outra empresa — por isso ela existe, não é organização visual.
create policy "fabricante_arquivos_ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
  );

create policy "fabricante_arquivos_subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
  );

create policy "fabricante_arquivos_apagar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
    and (is_gestor() or has_permission(get_my_usuario_id(), 'fabricantes', 'excluir'))
  );

-- ── Limpeza que sobrou da entrega 1 ────────────────────────────────────────
-- Apagar `tabela_precos` levou o gatilho junto, mas deixou a FUNÇÃO dele órfã. Conferido em
-- 26/08/2026: nenhum gatilho a usa.
drop function if exists public.tabela_precos_preenche_empresa();
```

- [ ] **Passo 2: testar em transação desfeita**

Rode o corpo entre `begin;` e `rollback;`. No meio, confira:

```sql
select to_regclass('public.fabricante_arquivos') as tabela;
select public from storage.buckets where id = 'fabricante-arquivos';   -- tem que ser false
select count(*) from pg_policies where tablename = 'fabricante_arquivos';  -- 4
```

- [ ] **Passo 3: NÃO aplicar ainda.** Só depois da Tarefa 8, com autorização.

---

## Tarefa 2: assinar um objeto de balde privado

**Arquivos:**
- Modificar: `src/lib/arquivo-privado.ts`

**Interfaces:**
- Produz: `enderecoDoObjeto(balde: string, caminho: string, validadeSegundos?: number): Promise<string | null>`.
  As tarefas 4, 6 e 7 usam.

**Por que não dá para usar o que já existe:** `enderecoDoArquivo(url)` recebe uma **URL já
gravada** e extrai balde e caminho dela — foi feito para converter os 11.917 endereços públicos
que o banco guarda. O drive guarda o **caminho**, não uma URL, e num balde privado não existe
URL pública para converter. E o `enderecoDoArquivo` **devolve a URL original quando a assinatura
falha**, que num balde privado é um endereço que não abre.

⚠️ **Este arquivo é da outra sessão** (plano dos baldes privados). A mudança é **aditiva** — uma
função nova, mais o reaproveitamento interno. Confira `git log -1 src/lib/arquivo-privado.ts`
antes de editar e avise se ela tiver mexido ali no meio-tempo.

- [ ] **Passo 1: acrescentar a função**

```ts
/**
 * Link temporário para um objeto de balde PRIVADO, a partir de balde e caminho.
 *
 * Diferente de `enderecoDoArquivo`, que parte de uma URL já gravada: aqui não há URL de
 * origem, porque o balde nasceu privado e nunca teve endereço público.
 *
 * 🔴 DEVOLVE `null` QUANDO FALHA, e isso é de propósito. O `enderecoDoArquivo` devolve a URL
 * original como rede de proteção — o que serve para balde ainda aberto e é inútil aqui: um
 * endereço não assinado de balde privado não abre. Quem chama precisa tratar o `null` e
 * mostrar que o arquivo não pôde ser aberto, em vez de exibir uma imagem quebrada.
 */
export async function enderecoDoObjeto(
  balde: string,
  caminho: string,
  validadeSegundos = VALIDADE_PADRAO_SEGUNDOS,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(balde)
      .createSignedUrl(caminho, validadeSegundos);
    if (error || !data?.signedUrl) {
      registraQueda(balde, error?.message ?? 'sem endereço na resposta');
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    registraQueda(balde, e instanceof Error ? e.message : 'falha inesperada');
    return null;
  }
}
```

- [ ] **Passo 2: conferir que não quebrou o que já existia**

```bash
npx vitest run src/lib/arquivo-privado.test.ts
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```

Esperado: os testes existentes passam; tipos em 35.

---

## Tarefa 3: as funções puras, com teste

**Arquivos:**
- Criar: `src/lib/fabricante-arquivos.ts`, `src/lib/fabricante-arquivos.test.ts`

**Interfaces:**
- Produz: `rotuloDaEdicao`, `compararPorEdicao`, `tamanhoLegivel`. As tarefas 6 e 7 usam.

**Por que é tarefa própria:** os 18 arquivos de teste deste projeto testam **função pura** —
nenhum renderiza componente. Estas três são a parte testável do drive, e testá-las aqui é o que
permite as tarefas seguintes não terem teste nenhum sem que isso seja descuido.

- [ ] **Passo 1: escrever os testes primeiro**

```ts
import { describe, it, expect } from 'vitest';
import { rotuloDaEdicao, compararPorEdicao, tamanhoLegivel } from './fabricante-arquivos';

describe('rotuloDaEdicao', () => {
  it('mês e ano viram "set/2026"', () => {
    expect(rotuloDaEdicao(2026, 9)).toBe('set/2026');
  });
  it('sem mês, só o ano', () => {
    expect(rotuloDaEdicao(2026, null)).toBe('2026');
  });
  it('todos os doze meses têm rótulo', () => {
    const vistos = new Set(Array.from({ length: 12 }, (_, i) => rotuloDaEdicao(2026, i + 1)));
    expect(vistos.size).toBe(12);
  });
});

describe('compararPorEdicao', () => {
  const a = (ano: number, mes: number | null) => ({ edicao_ano: ano, edicao_mes: mes });

  it('ano mais novo vem primeiro', () => {
    expect(compararPorEdicao(a(2025, 1), a(2026, 1))).toBeGreaterThan(0);
  });
  it('no mesmo ano, mês mais novo vem primeiro', () => {
    expect(compararPorEdicao(a(2026, 3), a(2026, 9))).toBeGreaterThan(0);
  });
  it('🔴 o catálogo do ANO perde para a edição mensal do mesmo ano', () => {
    // "set/2026" é mais atual que "2026": o do ano se comporta como janeiro.
    expect(compararPorEdicao(a(2026, null), a(2026, 9))).toBeGreaterThan(0);
  });
  it('ordena uma lista inteira', () => {
    const lista = [a(2026, null), a(2025, 12), a(2026, 9), a(2026, 3)];
    expect([...lista].sort(compararPorEdicao)).toEqual([a(2026, 9), a(2026, 3), a(2026, null), a(2025, 12)]);
  });
});

describe('tamanhoLegivel', () => {
  it('mostra em KB abaixo de um mega', () => {
    expect(tamanhoLegivel(348_160)).toBe('340 KB');
  });
  it('mostra em MB com uma casa', () => {
    expect(tamanhoLegivel(15 * 1024 * 1024)).toBe('15,0 MB');
  });
  it('usa vírgula, não ponto — é PT-BR', () => {
    expect(tamanhoLegivel(1_572_864)).toContain(',');
  });
  it('arquivo vazio não vira "NaN"', () => {
    expect(tamanhoLegivel(0)).toBe('0 KB');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run src/lib/fabricante-arquivos.test.ts`
Esperado: FAIL — "Failed to resolve import ./fabricante-arquivos".

- [ ] **Passo 3: escrever as três funções**

```ts
/** Rótulos curtos, minúsculos, como a etiqueta do cartão mostra. */
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/** "set/2026" quando há mês; "2026" quando a fábrica faz catálogo anual. */
export function rotuloDaEdicao(ano: number, mes: number | null | undefined): string {
  if (mes == null) return String(ano);
  return `${MESES[mes - 1]}/${ano}`;
}

interface TemEdicao {
  edicao_ano: number;
  edicao_mes: number | null;
}

/**
 * Ordena da edição mais NOVA para a mais velha, para `Array.prototype.sort`.
 *
 * 🔴 `mes ?? 0` faz o catálogo do ANO se comportar como se fosse de janeiro. Sem isso, "2026"
 * e "set/2026" empatariam e a ordem ficaria à mercê da ordem de chegada — e o representante
 * abriria a fábrica sem saber qual é a edição vigente, que é o problema que o drive resolve.
 */
export function compararPorEdicao(a: TemEdicao, b: TemEdicao): number {
  if (a.edicao_ano !== b.edicao_ano) return b.edicao_ano - a.edicao_ano;
  return (b.edicao_mes ?? 0) - (a.edicao_mes ?? 0);
}

/** Tamanho em PT-BR: vírgula decimal, e nunca "NaN" nem "0.00 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npx vitest run src/lib/fabricante-arquivos.test.ts`
Esperado: PASS, 11 testes. O total do projeto vai de 223 para **234**.

---

## Tarefa 4: o gancho de dados

**Arquivos:**
- Criar: `src/hooks/use-fabricante-arquivos.ts`

**Interfaces:**
- Consome: `enderecoDoObjeto` (Tarefa 2), a tabela (Tarefa 1).
- Produz: `useArquivosDaFabrica(fabricanteId)`, `useAnexarArquivo()`, `useExcluirArquivo()`, e o
  tipo `ArquivoDaFabrica`. As tarefas 6 e 7 usam.

⚠️ **Não escreva `useRenomearArquivo`.** O nome é escolhido ao anexar (Tarefa 7) e renomear
depois não está nesta entrega — a política de UPDATE existe na Tarefa 1 porque a edição da
edição (mês/ano) virá, mas gancho sem tela é código que nasce órfão, e este projeto acabou de
apagar 3.500 linhas disso.

- [ ] **Passo 1: o tipo e a listagem**

```ts
export interface ArquivoDaFabrica {
  id: string;
  nome: string;
  caminho: string;
  capa_caminho: string | null;
  tamanho: number;
  mime: string | null;
  edicao_ano: number;
  edicao_mes: number | null;
  enviado_por: string | null;
  created_at: string;
}

export const BALDE = 'fabricante-arquivos';
/** 50 MB. Abaixo do teto do WhatsApp para documento, de propósito — ver o desenho §5.2. */
export const TETO_BYTES = 50 * 1024 * 1024;
```

A consulta ordena **no banco**, com o mesmo critério do `compararPorEdicao`:

```ts
.order('edicao_ano', { ascending: false })
.order('edicao_mes', { ascending: false, nullsFirst: false })
.order('created_at', { ascending: false })
```

⚠️ `nullsFirst: false` é o que faz o catálogo do ano cair **depois** das edições mensais do
mesmo ano. Sem isso o Postgres põe nulo primeiro em ordem decrescente, e "2026" apareceria
acima de "set/2026" — o inverso do que a Tarefa 3 fixou em teste.

- [ ] **Passo 2: anexar, com a ordem que evita lixo**

```ts
// 1. sobe o arquivo   2. sobe a capa (se houver)   3. grava a linha
// Se a gravação da linha falhar, APAGA os dois objetos antes de propagar o erro. Sem isso,
// cada falha de rede deixa um arquivo de até 50 MB no balde que nenhuma tela mostra e ninguém
// consegue apagar — é assim que um balde engorda sem explicação.
```

Caminho: `${empresa_id}/${fabricante_id}/${crypto.randomUUID()}-${sanitizeFileName(nome)}`.
Capa: `${empresa_id}/${fabricante_id}/capas/${mesmoUuid}.jpg`.

🔴 `enviado_por: profile?.id` — esta coluna aponta para `usuarios(id)`. **Não** é `user_id`
aqui; a de `configuracoes_automacao.updated_by` é que era. Confira com
`pg_get_constraintdef` se tiver dúvida, não confie no nome.

- [ ] **Passo 3: excluir apaga o objeto TAMBÉM**

Apagar só a linha deixa o arquivo no balde para sempre. Apague os dois objetos (arquivo e capa)
e depois a linha. Se o Storage recusar por permissão, **não apague a linha** — senão a tela diz
que sumiu e o arquivo continua ocupando espaço.

- [ ] **Passo 4: invalidar a lista** em toda mutação, com a chave `['fabricante-arquivos', fabricanteId]`.

- [ ] **Passo 5: verificação de quatro pernas** (tipos 35, testes 234, build, lint ≤ 456)

---

## Tarefa 5: a capa da primeira página

**Arquivos:**
- Criar: `src/lib/capa-do-pdf.ts`
- Modificar: `package.json` (`pdfjs-dist`)

**Interfaces:**
- Produz: `gerarCapaDoPdf(arquivo: File): Promise<Blob | null>`. A Tarefa 7 usa.

- [ ] **Passo 1: instalar**

```bash
npm install pdfjs-dist
```

- [ ] **Passo 2: escrever o gerador**

Regras que o código precisa respeitar, e o comentário deve dizer por quê:

```ts
/**
 * Desenha a primeira página de um PDF numa imagem pequena.
 *
 * 🔴 RODA AO ANEXAR, NUNCA AO EXIBIR. Gerar na hora de mostrar obrigaria a baixar o PDF
 * inteiro — até 50 MB — só para desenhar um quadrado, toda vez que alguém abrisse a ficha da
 * fábrica. Gerada aqui, o cartão carrega dezenas de KB.
 *
 * 🔴 FALHAR NÃO É ERRO. PDF protegido por senha, arquivo corrompido, formato exótico: devolve
 * `null` e o cartão mostra o ícone do formato. Travar o anexo por causa da miniatura seria
 * trocar a funcionalidade pelo enfeite dela.
 *
 * A biblioteca entra por `import()` dinâmico: ela só é baixada quando alguém vai anexar um
 * PDF, e não pesa em quem está só navegando pelo sistema.
 */
export async function gerarCapaDoPdf(arquivo: File): Promise<Blob | null> {
  if (arquivo.type !== 'application/pdf') return null;
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (
      await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ).default;

    const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    const pagina = await doc.getPage(1);

    // Largura fixa: o cartão tem tamanho conhecido, e gerar maior só engorda o upload.
    const LARGURA = 400;
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: LARGURA / base.width });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await pagina.render({ canvasContext: ctx, viewport }).promise;

    return await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.8));
  } catch {
    return null;
  }
}
```

- [ ] **Passo 3: conferir que o pacote não pesou no que todo mundo baixa**

```bash
npm run build
```

Compare o tamanho de `dist/assets/index-*.js` com o de antes. **Se ele cresceu, o `import()`
dinâmico não funcionou** e a biblioteca entrou no arquivo principal — reveja o import.

- [ ] **Passo 4: verificação de quatro pernas.** ⚠️ O lint pode subir com o pacote novo; se
subir, o problema é no código escrito aqui, não no pacote — o `eslint` não olha `node_modules`.

---

## Tarefa 6: o cartão e a grade

**Arquivos:**
- Criar: `src/components/fabricantes/CartaoDeArquivo.tsx`, `src/components/fabricantes/DriveDaFabrica.tsx`

**Interfaces:**
- Consome: `ArquivoDaFabrica` e os ganchos (Tarefa 4), as puras (Tarefa 3), `enderecoDoObjeto`
  (Tarefa 2), `FilePreviewDialog` e `FilePreviewTarget` de `@/components/chat/FilePreviewDialog`.
- Produz: `<DriveDaFabrica fabricanteId empresaId />`. A Tarefa 8 usa.

- [ ] **Passo 1: o cartão**

Grade: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. Retângulos arredondados lado
a lado — **não é lista**, foi pedido assim.

Cada cartão, de cima para baixo: a **capa** (ou o ícone do formato, na mesma altura — altura
diferente deixa a grade irregular), o **nome**, a **etiqueta da edição** (`rotuloDaEdicao`), o
**tamanho** (`tamanhoLegivel`), e as ações.

Ações: **Ver** (só quando `isPreviewable(nome, mime)`), **Baixar**, **Excluir** (só para quem
pode). O botão de WhatsApp entra na entrega 3 — **não o desenhe desabilitado agora**: botão que
não faz nada é exatamente o defeito que a aba Automação acabou de perder.

- [ ] **Passo 2: os links temporários, em lote**

As capas precisam de link assinado. Peça **todos de uma vez** ao montar a lista, não um por
cartão — vinte cartões renderizando fariam vinte chamadas de assinatura em paralelo.

Quando `enderecoDoObjeto` devolver `null`, mostre o ícone do formato. **Nunca uma imagem
quebrada.**

- [ ] **Passo 3: o vazio precisa convidar**

Sem arquivo nenhum, a área mostra o convite para anexar o primeiro — não um espaço em branco.

- [ ] **Passo 4: verificação de quatro pernas**

---

## Tarefa 7: anexar

**Arquivos:**
- Criar: `src/components/fabricantes/AnexarArquivoDialog.tsx`

**Interfaces:**
- Consome: `useAnexarArquivo` (Tarefa 4), `gerarCapaDoPdf` (Tarefa 5), `TETO_BYTES`.

- [ ] **Passo 1: o formulário**

Use `<ConteudoDialogo>`, **não** `<DialogContent>` cru — `CLAUDE.md` §7.11: o modal sem teto de
altura prende a pessoa na tela, e este projeto desligou Esc e clique-fora.

Campos: o arquivo, o **nome** (vem preenchido com o nome do arquivo, editável), o **ano** (vem
o ano atual) e o **mês** (opcional, com uma opção "o ano inteiro").

- [ ] **Passo 2: recusar antes de subir**

```ts
if (arquivo.size > TETO_BYTES) {
  toast.error(`Arquivo de ${tamanhoLegivel(arquivo.size)}. O limite é 50 MB.`);
  return;
}
```

Recusar **antes** do upload é o ponto: deixar subir 200 MB para falhar no fim gasta o tempo e a
internet de quem está em obra.

- [ ] **Passo 3: a capa não pode travar o anexo**

Gere a capa, mostre "preparando a capa…" enquanto isso, e **siga sem ela** se vier `null`.

- [ ] **Passo 4: verificação de quatro pernas**

---

## Tarefa 8: ligar na ficha da fábrica e publicar

**Arquivos:**
- Modificar: `src/pages/Fabricantes.tsx`

- [ ] **Passo 1: o aviso dá lugar ao drive**

Troque o bloco tracejado (âncora: `Catálogos e materiais desta fábrica`) por:

```jsx
<DriveDaFabrica fabricanteId={selectedFab.id} empresaId={selectedFab.empresa_id} />
```

- [ ] **Passo 2: verificação de quatro pernas** (tipos 35, testes **234**, build, lint ≤ 456)

- [ ] **Passo 3: conferir que ninguém entrou na frente**

```bash
git fetch origin && git log --oneline HEAD..origin/main
```

> 🔴 **CORRIGIDO DURANTE A EXECUÇÃO: aqui a migration vem ANTES do código.**
>
> Na entrega 1 era o contrário, e por um motivo que não vale aqui: lá a migration RENOMEAVA um
> valor que o código já lia, então aplicá-la antes deixava o front cego por alguns minutos.
>
> Aqui a tabela é NOVA. Aplicá-la antes é inofensivo — ninguém lê uma tabela que nenhum código
> conhece. Publicar o código antes, ao contrário, colocaria no ar uma tela que consulta uma
> tabela inexistente: o drive apareceria quebrado para as 8 empresas até a migration entrar.
>
> **Ordem certa: migration → publicação.**

- [ ] **Passo 4: pedir autorização, commitar, enviar**

O `git push` **publica sozinho**. Confirme:

```bash
gh api repos/Repply-Hub/Repply-CRM/commits/<sha>/status --jq '.state, [.statuses[].context]'
```

- [ ] **Passo 5: aplicar a migration, com autorização explícita**, depois da publicação sair.

- [ ] **Passo 6: 🔴 provar que o balde está mesmo fechado**

Este é o passo que não pode ser pulado. Suba um arquivo pela tela, pegue o caminho dele no
banco, e peça o endereço público **sem credencial nenhuma**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://hukeirrmsoiowvvrhivx.supabase.co/storage/v1/object/public/fabricante-arquivos/<caminho>"
```

Esperado: **400 ou 404**. Se vier **200**, o balde está aberto e o catálogo da representada
está na internet — pare tudo e conserte antes de avisar que está pronto.

- [ ] **Passo 7: conferir a recusa entre empresas**

Simule um perfil de outra empresa e tente ler a lista. Tem que vir vazia — não com erro, vazia,
que é como a RLS recusa.

---

## Definição de pronto

- [ ] O representante anexa um PDF e o cartão mostra a **capa da primeira página**
- [ ] Anexa uma planilha e o cartão mostra o ícone; a pré-visualização abre a planilha
- [ ] A ordem põe a edição mais nova primeiro, e "set/2026" acima de "2026"
- [ ] Arquivo de 51 MB é recusado **antes** de subir
- [ ] Quem não é gestor e não tem a permissão **não vê** o botão de excluir — e a RLS recusa
      mesmo que ele chame direto
- [ ] 🔴 O endereço público do arquivo, sem credencial, **não abre**
- [ ] Excluir remove a linha **e** os objetos do balde
- [ ] Tipos 35, testes 234, build compila, lint não subiu de 456
