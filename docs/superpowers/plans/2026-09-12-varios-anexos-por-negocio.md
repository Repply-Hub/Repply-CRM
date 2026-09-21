# Vários anexos por negócio — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um negócio passa a aceitar vários anexos (PDF e imagem), com o mais novo em cima e o botão de adicionar embaixo — sem que nenhum dos 5.438 anexos de hoje se perca, e sem que uma reimportação apague anexo de negócio que já existe.

**Architecture:** Uma tabela nova, `pedido_anexos`, com as regras de acesso escritas como condição de existência sobre `pedidos` — assim elas seguem as do negócio sem viver em dois lugares. As regras do que pode subir, do nome e da ordem ficam em funções puras; o envio e a gravação ficam num gancho só, hoje copiado em duas telas. `pedidos.pdf_url` para de ser escrita e lida, mas não é apagada: é a rota de volta.

**Tech Stack:** React 18 + TypeScript (frouxo) + Vite, TanStack Query, Supabase (migration nova, com cópia de dados), shadcn/Radix, Vitest + Testing Library (jsdom, **sem** `user-event`).

**Desenho aprovado:** `docs/superpowers/specs/2026-09-12-varios-anexos-por-negocio-design.md`. Leia antes da primeira tarefa.

## Global Constraints

- Tudo em **PT-BR**: tela, comentário, nome de teste, mensagem de commit.
- 🔴 **Dado real não entra em teste nem comentário** (CLAUDE.md §6.9). Nos testes use `negocio-1`, `empresa-1`, `orcamento.pdf`, `foto-obra.jpg`.
- 🔴 **A migration é escrita, NÃO aplicada.** Ela cria tabela **e copia 5.438 linhas**: é escrita em produção, e quem aplica é o Lucas (`escrita-em-producao-passa-pela-mao-do-lucas`). Escreva, atualize os tipos à mão (CLAUDE.md §6.8) e avise que está pendente.
- **Nunca edite migration existente** — só acrescente arquivo novo (CLAUDE.md §6.3). Toda tabela nova nasce com RLS habilitada e política escrita **no mesmo arquivo** (§6.2).
- 🔴 **`.delete()` e `.update()` pedem a contagem** (`{ count: 'exact' }`) e tratam `count === 0` como recusa, com `recusaSemErro` (CLAUDE.md §4.6). Nunca `!count`.
- 🔴 **Nenhum arquivo é apagado do balde.** Tirar um anexo tira a linha da tabela; o arquivo fica.
- Erro de gravação na tela: `mensagemDeErro`. Modal: `<ConteudoDialogo>`.
- Tipos: `npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`**. Critério **por arquivo**: guarde a linha de base antes da Tarefa 1.
- Git — outra sessão trabalha na mesma pasta e empurra commits com frequência:
  - `git fetch origin && git log --oneline HEAD..origin/main` **antes de começar**;
  - `git status --short` num comando **separado** antes de cada commit;
  - `git commit -F <arquivo-da-mensagem> --only -- <caminhos>`, nunca `git add -A`;
  - **nunca** `git push`; toda mensagem termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **Ensaio não grava em produção**, com uma exceção dita no desenho (subir anexo num negócio de teste, apagando depois).

## Decisões técnicas deste plano (tomadas ao escrever, com o porquê)

1. **As regras de acesso da tabela nova são um `EXISTS` sobre `pedidos`**, e não uma cópia das condições de `pedidos`. Quem enxerga o negócio enxerga o anexo; quem pode mudar o negócio pode anexar e tirar. Copiar as condições criaria duas verdades, e a segunda envelhece calada.
2. **O envio do arquivo vira um lugar só.** Hoje o mesmo trecho de upload está copiado em `NovoNegocioDialog` e `EditarPedido` — é o padrão que o CLAUDE.md §7.14 descreve como "o conserto no arquivo errado".
3. **A reimportação já não toca em anexo** (o `patch` de `alteracoes-por-codigo.ts` só leva nome, observações e marcador). O plano **prende isso com teste** em vez de reescrever o caminho.
4. **A coluna antiga continua no banco e sai das telas.** Depois da cópia, ninguém lê nem escreve `pdf_url` — mas ela fica, porque é o único jeito de voltar atrás sem backup.
5. **Miniatura de imagem só na lista da ficha.** Na lista de negócios, onde há centenas de linhas, o que aparece é o nome: baixar imagem por linha deixaria a tela lenta para ganhar pouco.

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/<timestamp>_pedido_anexos.sql` (cria) | tabela, RLS e a cópia dos anexos de hoje |
| `src/integrations/supabase/types.ts` (mexe) | os tipos da tabela nova, à mão |
| `src/lib/anexos-do-negocio.ts` + teste (cria) | o que pode subir, o nome, a ordem, o "+N" |
| `src/hooks/use-pedido-anexos.ts` + teste (cria) | listar, enviar e tirar — o único lugar que fala com o balde |
| `src/components/pedidos/CampoDeAnexos.tsx` (cria) | a lista com o botão embaixo, usada em três telas |
| `src/components/pedidos/PainelDoNegocio.tsx` (mexe) | a ficha mostra a lista |
| `src/components/pedidos/NovoNegocioDialog.tsx`, `src/pages/EditarPedido.tsx` (mexe) | passam a gravar na lista nova |
| `src/pages/Negocios.tsx`, `src/components/pedidos/PainelDeNegocios.tsx` (mexe) | a coluna Anexo com "+N" |
| `src/hooks/use-bulk-import.ts` (mexe) | a importação cria um anexo por link, só ao criar |
| `src/test/reimportacao-nao-mexe-em-anexo.test.ts` (cria) | a trava da decisão 3 |

---

### Task 1: A tabela dos anexos, e a cópia dos que já existem

**Files:**
- Create: `supabase/migrations/<timestamp>_pedido_anexos.sql`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: `pedido_anexos(id, pedido_id, url, nome, tipo, tamanho_bytes, criado_por, created_at)`.

- [ ] **Step 1: Escreva a migration** (nome no padrão dos vizinhos — `ls supabase/migrations | tail -3`):

```sql
-- Vários anexos por negócio (desenho de 12/09/2026).
--
-- Até aqui o anexo era UMA coluna, `pedidos.pdf_url`. Ela NÃO é apagada: depois da cópia
-- abaixo ninguém escreve nem lê essa coluna, e ela fica como rota de volta.
create table if not exists public.pedido_anexos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  url text not null,
  nome text not null,
  tipo text,
  tamanho_bytes bigint,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pedido_anexos_pedido_id_idx on public.pedido_anexos (pedido_id);

alter table public.pedido_anexos enable row level security;

-- 🔴 AS REGRAS SEGUEM AS DO NEGÓCIO, por existência — e não por cópia das condições de
-- `pedidos`. Quem enxerga o negócio enxerga os anexos; quem pode MUDAR o negócio pode
-- acrescentar e tirar anexo. Copiar as condições criaria duas verdades, e a segunda envelhece
-- calada no dia em que a regra do negócio mudar.
create policy pedido_anexos_select on public.pedido_anexos
  for select using (
    exists (select 1 from public.pedidos p where p.id = pedido_id)
  );

create policy pedido_anexos_insert on public.pedido_anexos
  for insert with check (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
        and (
          p.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(p.usuario_id))
          or (public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar') and public.usuario_in_my_empresa(p.usuario_id))
        )
    )
  );

create policy pedido_anexos_delete on public.pedido_anexos
  for delete using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
        and (
          p.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(p.usuario_id))
          or (public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar') and public.usuario_in_my_empresa(p.usuario_id))
        )
    )
  );

-- A cópia dos anexos que já existem. O SELECT de `pedidos` já corta pela empresa de quem roda,
-- mas esta migration roda como dono do banco: ela copia TODOS, que é o que se quer.
--
-- O nome sai do fim do endereço, com os %20 desfeitos; sem nome utilizável, fica 'anexo.pdf' —
-- melhor um rótulo honesto que uma linha sem nome na tela.
insert into public.pedido_anexos (pedido_id, url, nome, tipo, created_at)
select
  p.id,
  p.pdf_url,
  coalesce(
    nullif(replace(split_part(split_part(p.pdf_url, '?', 1), '/', -1), '%20', ' '), ''),
    'anexo.pdf'
  ),
  'application/pdf',
  p.created_at
from public.pedidos p
where p.pdf_url is not null
  and trim(p.pdf_url) <> ''
  and not exists (select 1 from public.pedido_anexos a where a.pedido_id = p.id);

comment on table public.pedido_anexos is 'Anexos de um negócio (PDF e imagem). Substitui pedidos.pdf_url, que fica como histórico.';
```

- [ ] **Step 2: Confira a conta ANTES de dar por pronta.** Rode as duas contagens (leitura, sem gravar) e anote no relatório: `select count(*) from pedidos where pdf_url is not null and trim(pdf_url) <> ''` deve bater com o que a cópia vai inserir — **5.438** em 12/09/2026.

- [ ] **Step 3: Atualize os tipos à mão** em `src/integrations/supabase/types.ts`: `pedido_anexos` com `Row`, `Insert` e `Update`, seguindo o formato das tabelas vizinhas.

- [ ] **Step 4: Verifique** — `npx tsc --noEmit -p tsconfig.app.json` (sem subir) e `npm run test`.

- [ ] **Step 5: 🔴 NÃO APLIQUE.** No relatório: "a migration `<nome>` cria a tabela e **copia 5.438 anexos**; está pendente de aplicação pelo Lucas, e as telas das tarefas seguintes só funcionam depois dela".

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- supabase/migrations/<arquivo>.sql src/integrations/supabase/types.ts`.
Mensagem: `feat(negocios): tabela de anexos do negócio, com as regras do negócio e a cópia dos atuais`

---

### Task 2: As regras do anexo (o que sobe, o nome, a ordem, o "+N")

**Files:**
- Create: `src/lib/anexos-do-negocio.ts`
- Create: `src/lib/anexos-do-negocio.test.ts`

**Interfaces:**
- Consumes: `MAX_FILE_SIZE_BYTES` e `sanitizeFileName` (`src/lib/file-validation.ts`); `filenameFromUrl` (`src/lib/download-file.ts`).
- Produces:
  ```ts
  export const TIPOS_DE_ANEXO_ACEITOS: readonly string[];      // pdf, jpeg, png
  export const EXTENSOES_DE_ANEXO_ACEITAS: readonly string[];  // .pdf, .jpg, .jpeg, .png
  export const ACCEPT_DO_CAMPO: string;                        // para o <input type="file">
  export interface ArquivoParaAnexar { name: string; size: number; type: string }
  export function recusaDoAnexo(arquivo: ArquivoParaAnexar): string | null;
  export function ehImagem(tipo?: string | null): boolean;
  export function nomeDoAnexo(url: string): string;
  export function tamanhoLegivel(bytes?: number | null): string;
  export interface AnexoNaLista { id: string; nome: string; created_at: string }
  export function ordenarAnexos<T extends { created_at: string }>(anexos: readonly T[]): T[];
  export function resumoDaColunaDeAnexos<T extends { nome: string }>(anexos: readonly T[]): { primeiro: T | null; extras: number };
  ```

- [ ] **Step 1: Write the failing test** — crie `src/lib/anexos-do-negocio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  recusaDoAnexo, ehImagem, nomeDoAnexo, tamanhoLegivel, ordenarAnexos, resumoDaColunaDeAnexos,
} from './anexos-do-negocio';

const pdf = { name: 'orcamento.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' };

describe('recusaDoAnexo', () => {
  it('aceita PDF e imagem dentro do tamanho', () => {
    expect(recusaDoAnexo(pdf)).toBeNull();
    expect(recusaDoAnexo({ name: 'foto-obra.jpg', size: 500_000, type: 'image/jpeg' })).toBeNull();
    expect(recusaDoAnexo({ name: 'print.png', size: 500_000, type: 'image/png' })).toBeNull();
  });

  it('🔴 recusa arquivo acima de 15 MB, dizendo o limite', () => {
    const recusa = recusaDoAnexo({ ...pdf, size: 20 * 1024 * 1024 });
    expect(recusa).toContain('15 MB');
  });

  it('recusa tipo que não é PDF nem imagem, dizendo o que vale', () => {
    const recusa = recusaDoAnexo({ name: 'proposta.docx', size: 10_000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(recusa).toContain('PDF');
    expect(recusa).toContain('imagem');
  });

  it('confere também a extensão — arquivo sem tipo informado pelo navegador não escapa', () => {
    expect(recusaDoAnexo({ name: 'planilha.xlsx', size: 10_000, type: '' })).not.toBeNull();
    expect(recusaDoAnexo({ name: 'orcamento.pdf', size: 10_000, type: '' })).toBeNull();
  });
});

describe('ehImagem', () => {
  it('separa imagem de PDF — é o que decide miniatura ou ícone', () => {
    expect(ehImagem('image/png')).toBe(true);
    expect(ehImagem('application/pdf')).toBe(false);
    expect(ehImagem(null)).toBe(false);
  });
});

describe('nomeDoAnexo', () => {
  it('tira o nome do fim do endereço, com os espaços de volta', () => {
    expect(nomeDoAnexo('https://exemplo.co/storage/v1/object/public/pedido-anexos/empresa-1/abc/Or%C3%A7amento%20final.pdf'))
      .toBe('Orçamento final.pdf');
  });
  it('endereço sem nome utilizável vira rótulo honesto', () => {
    expect(nomeDoAnexo('https://exemplo.co/storage/v1/object/public/pedido-anexos/')).toBe('anexo.pdf');
  });
});

describe('tamanhoLegivel', () => {
  it('escreve em MB e KB, no padrão brasileiro', () => {
    expect(tamanhoLegivel(2_516_582)).toBe('2,4 MB');
    expect(tamanhoLegivel(102_400)).toBe('100 KB');
  });
  it('sem tamanho, não inventa número', () => {
    expect(tamanhoLegivel(null)).toBe('');
    expect(tamanhoLegivel(0)).toBe('');
  });
});

describe('ordenarAnexos', () => {
  it('🔴 o mais novo em cima — é o desenho que o Lucas pediu', () => {
    const anexos = [
      { id: 'a', created_at: '2026-09-10T10:00:00Z' },
      { id: 'b', created_at: '2026-09-12T10:00:00Z' },
      { id: 'c', created_at: '2026-09-11T10:00:00Z' },
    ];
    expect(ordenarAnexos(anexos).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('resumoDaColunaDeAnexos', () => {
  it('um anexo: só ele, sem "+"', () => {
    expect(resumoDaColunaDeAnexos([{ nome: 'orcamento.pdf' }])).toEqual({ primeiro: { nome: 'orcamento.pdf' }, extras: 0 });
  });
  it('três anexos: o primeiro e mais dois', () => {
    const r = resumoDaColunaDeAnexos([{ nome: 'a.pdf' }, { nome: 'b.pdf' }, { nome: 'c.jpg' }]);
    expect(r.primeiro).toEqual({ nome: 'a.pdf' });
    expect(r.extras).toBe(2);
  });
  it('nenhum anexo: nada a mostrar', () => {
    expect(resumoDaColunaDeAnexos([])).toEqual({ primeiro: null, extras: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/anexos-do-negocio.test.ts`. Expected: FAIL (módulo não existe).

- [ ] **Step 3: Write the implementation** — crie `src/lib/anexos-do-negocio.ts` com as funções acima. Pontos que o código precisa respeitar, cada um com comentário dizendo o porquê:

```ts
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './file-validation';
import { filenameFromUrl } from './download-file';

/**
 * O que pode ser anexado a um negócio: PDF e imagem (decisão do dono do produto, 12/09/2026).
 * Não é "qualquer arquivo" — planilha e Word ninguém abre no celular em obra, e o balde cresce
 * sem controle.
 */
export const TIPOS_DE_ANEXO_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const EXTENSOES_DE_ANEXO_ACEITAS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;
export const ACCEPT_DO_CAMPO = EXTENSOES_DE_ANEXO_ACEITAS.join(',');

/**
 * 🔴 CONFERE TIPO **E** EXTENSÃO. O navegador nem sempre informa o tipo (arquivo vindo de
 * aplicativo de celular chega com `type` vazio), e o `accept` do campo é só sugestão: arrastar
 * um arquivo para a área de envio passa por cima dele.
 */
export function recusaDoAnexo(arquivo: ArquivoParaAnexar): string | null { /* … */ }
```
- `recusaDoAnexo` devolve **a frase pronta**, em PT-BR, dizendo o limite (15 MB) ou o que vale (PDF ou imagem) — a tela não escreve a sua.
- `nomeDoAnexo` usa `filenameFromUrl(url, 'anexo.pdf')` e desfaz `%20` (o `decodeURIComponent` protegido por `try/catch`: endereço herdado pode ter porcentagem solta e quebraria a lista inteira).
- `tamanhoLegivel` usa vírgula decimal e uma casa em MB; abaixo de 1 MB escreve KB inteiro; `0`/`null` devolvem vazio.
- `ordenarAnexos` é estável e não muda o array recebido.

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/anexos-do-negocio.test.ts`. Expected: PASS.

- [ ] **Step 5: Tipos e lint** dos dois arquivos.

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/lib/anexos-do-negocio.ts src/lib/anexos-do-negocio.test.ts`.
Mensagem: `feat(negocios): regras do anexo — o que sobe, o nome, a ordem e o resumo da coluna`

---

### Task 3: O gancho que lista, envia e tira

**Files:**
- Create: `src/hooks/use-pedido-anexos.ts`
- Create: `src/hooks/use-pedido-anexos.test.tsx` (espelhe `src/hooks/use-responsaveis-do-negocio.test.tsx`)

**Interfaces:**
- Consumes: `recusaDoAnexo`, `nomeDoAnexo`, `ordenarAnexos` (T2); `sanitizeFileName` (`file-validation.ts`); `recusaSemErro` (`src/lib/recusa-do-banco.ts`); `mensagemDeErro`.
- Produces:
  ```ts
  export interface AnexoDoNegocio { id: string; url: string; nome: string; tipo: string | null; tamanhoBytes: number | null; criadoEm: string }
  export function useAnexosDoNegocio(pedidoId?: string | null);
  export function useAdicionarAnexo(pedidoId: string);   // mutação: (arquivo: File) => AnexoDoNegocio
  export function useRemoverAnexo(pedidoId: string);     // mutação: (anexoId: string) => void
  ```

- [ ] **Step 1: Write the failing test** — três provas, com o Supabase simulado:

```ts
it('o arquivo sobe para a pasta da empresa e a linha guarda nome, tipo e tamanho', async () => { /* … */ });

it('🔴 arquivo recusado não sobe nem grava linha', async () => {
  // A recusa é a mesma de `recusaDoAnexo`: 20 MB e .docx param aqui, antes de qualquer rede.
});

it('🔴 tirar anexo que a regra do banco recusa NÃO diz que removeu', async () => {
  // `delete` com count 0 e `error: null` é recusa silenciosa (CLAUDE.md §4.6).
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/use-pedido-anexos.test.tsx`.

- [ ] **Step 3: Write the implementation.** Pontos obrigatórios:

```ts
/**
 * Os anexos de um negócio — e o ÚNICO lugar que fala com o balde `pedido-anexos`.
 *
 * 🔴 O trecho de envio estava copiado em `NovoNegocioDialog` e `EditarPedido`. Duas cópias do
 * mesmo upload é como o caminho da pasta da empresa se perde numa delas — e arquivo fora da
 * pasta da empresa fica invisível quando o balde fechar (`docs/operacao/plano-baldes-privados.md`).
 */
```
- o caminho continua sendo `${empresaId}/${crypto.randomUUID()}/${sanitizeFileName(arquivo.name)}`; **sem empresa, recusa** com a frase que já existe hoje;
- a recusa de tipo/tamanho acontece **antes** do envio (`recusaDoAnexo`);
- depois do envio, grava a linha com `nome: arquivo.name` (o nome que a pessoa reconhece, não o sanitizado), `tipo`, `tamanho_bytes` e `criado_por`;
- 🔴 se a gravação da linha falhar **depois** do envio, a tela avisa que o arquivo subiu mas não ficou preso ao negócio — não finja sucesso;
- `useRemoverAnexo` usa `.delete({ count: 'exact' })` e trata `count === 0` com `recusaSemErro`, nunca `!count`;
- as duas mutações invalidam `['pedido_anexos', pedidoId]`; a lista ordena com `ordenarAnexos`.

- [ ] **Step 4: Run test to verify it passes**; depois `npm run test`.

- [ ] **Step 5: Tipos e lint**; **Commit**:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/hooks/use-pedido-anexos.ts src/hooks/use-pedido-anexos.test.tsx
```
Mensagem: `feat(negocios): gancho dos anexos — um lugar só para enviar, listar e tirar`

---

### Task 4: O campo de anexos na tela

**Files:**
- Create: `src/components/pedidos/CampoDeAnexos.tsx`
- Create: `src/components/pedidos/CampoDeAnexos.test.tsx`

**Interfaces:**
- Consumes: T2 e T3.
- Produces:
  ```ts
  export function CampoDeAnexos(props: {
    anexos: AnexoDoNegocio[];
    onAdicionar: (arquivo: File) => void | Promise<void>;
    onRemover?: (anexoId: string) => void | Promise<void>;
    enviando?: boolean;
    somenteLeitura?: boolean;
    obrigatorio?: boolean;
  }): JSX.Element;
  ```
  O componente **não** fala com o banco: recebe a lista e devolve os gestos. É o que permite testá-lo sem rede e usá-lo no cadastro (onde o negócio ainda não existe).

- [ ] **Step 1: Write the failing test** — provas de tela:

```ts
it('o anexo mais novo aparece em cima e o botão de adicionar fica embaixo', () => { /* … */ });
it('imagem mostra miniatura; PDF mostra ícone', () => { /* … */ });
it('o × chama onRemover com o anexo daquela linha', () => { /* … */ });
it('sem permissão de editar, não há × nem botão de adicionar', () => { /* … */ });
it('arquivo recusado não chama onAdicionar, e a frase aparece na tela', () => { /* … */ });
```

- [ ] **Step 2: Run test to verify it fails.**

- [ ] **Step 3: Write the implementation.** A tela, na ordem do desenho:
  - a lista, do mais novo para o mais antigo: miniatura (imagem) ou ícone (PDF), nome, tamanho, e o **×** à direita;
  - clicar no nome abre o arquivo pelo caminho assinado (`LinkAnexoPrivado` ou `enderecoDoArquivo`, como o painel já faz);
  - **abaixo da lista**, o botão `+ Adicionar anexo` com `accept={ACCEPT_DO_CAMPO}` — 🔴 é o desenho que o Lucas pediu: o que entra sobe, o botão desce;
  - arquivo recusado mostra a frase de `recusaDoAnexo` ali mesmo, sem subir nada;
  - enquanto envia, a linha nova aparece com indicação de envio e o botão fica desabilitado.

- [ ] **Step 4: Run tests**; **Step 5: tipos e lint**; **Step 6: Commit**:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/components/pedidos/CampoDeAnexos.tsx src/components/pedidos/CampoDeAnexos.test.tsx
```
Mensagem: `feat(negocios): campo de anexos com o mais novo em cima e o botão embaixo`

---

### Task 5: As três telas do negócio passam a usar a lista

**Files:**
- Modify: `src/components/pedidos/PainelDoNegocio.tsx` (a ficha)
- Modify: `src/components/pedidos/NovoNegocioDialog.tsx` (o cadastro)
- Modify: `src/pages/EditarPedido.tsx` (a edição)
- Modify: `src/hooks/use-edit-pedido.ts` (para de gravar `pdf_url`)

**Interfaces:**
- Consumes: `CampoDeAnexos` (T4); `useAnexosDoNegocio`, `useAdicionarAnexo`, `useRemoverAnexo` (T3).
- 🔴 **Depois desta tarefa, nenhuma tela escreve `pedidos.pdf_url`.** A coluna fica no banco (decisão 4), mas sai do caminho.

- [ ] **Step 1: A ficha do negócio.** Em `PainelDoNegocio.tsx`, troque o bloco `{negocio.pdf_url && ( … )}` (o "Anexo" com o botão "Ver PDF anexado") pela lista:

```tsx
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Anexos
                  </p>
                  <CampoDeAnexos
                    anexos={anexos ?? []}
                    onAdicionar={(arquivo) => adicionarAnexo.mutate(arquivo)}
                    onRemover={(anexoId) => removerAnexo.mutate(anexoId)}
                    enviando={adicionarAnexo.isPending}
                    somenteLeitura={!podeEditar}
                  />
                </div>
```
com os ganchos da T3 no topo do componente (`useAnexosDoNegocio(pedidoId)` e as duas mutações). `podeEditar` já existe no arquivo.

- [ ] **Step 2: O cadastro.** Em `NovoNegocioDialog.tsx`, o negócio **ainda não existe** quando a pessoa escolhe os arquivos: guarde-os em memória e envie depois da criação.
  - troque `const [pdfFile, setPdfFile] = useState<File | null>(null)` por `const [arquivosPendentes, setArquivosPendentes] = useState<File[]>([])`;
  - no lugar do bloco de anexo de hoje, use o `<CampoDeAnexos>` alimentado pelos arquivos pendentes (converta cada `File` para o formato da lista com `URL.createObjectURL` só para a miniatura);
  - a validação de campo obrigatório (`anexo_pdf`) passa a olhar `arquivosPendentes.length > 0`;
  - no `handleSubmit`, **depois** de `createPedido.mutateAsync` devolver o id, envie um a um pelo gancho da T3. 🔴 Falha no envio **não** derruba o negócio já criado: avise "o negócio foi criado, mas N anexos não subiram — acrescente pela ficha", no mesmo desenho do aviso de participantes que já existe ali;
  - apague o trecho de upload que existe hoje neste arquivo (ele mudou de lugar, T3).
  - ⚠️ **Se o pacote 3 (duplicar negócio) já tiver sido executado:** a cópia levava `copiaDe.pdfUrl`, um anexo só. Troque por `copiaDe.anexos` (a lista de referências) e, ao criar, insira uma linha por anexo apontando para **os mesmos arquivos** — a cópia continua não duplicando arquivo no balde. Se o pacote 3 ainda não rodou, não faça nada aqui: o plano dele já nasce com a lista.

- [ ] **Step 3: A edição.** Em `EditarPedido.tsx`, troque o campo de anexo pelo `<CampoDeAnexos>` ligado aos ganchos (aqui o negócio já existe, então cada gesto grava na hora, como na ficha). Apague o trecho de upload deste arquivo. Em `use-edit-pedido.ts`, tire `pdf_url` do payload e da montagem do `update` — com um comentário dizendo que os anexos agora têm tabela própria.

- [ ] **Step 4: Conferência na tela** (com a migration da T1 **aplicada**; sem ela, pare e avise): a ficha lista os anexos, acrescenta e tira; o cadastro cria negócio com dois anexos; a edição acrescenta um terceiro.

- [ ] **Step 5: Tipos, lint e suíte** dos quatro arquivos; `npm run test` sem regressão.

- [ ] **Step 6: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/components/pedidos/PainelDoNegocio.tsx src/components/pedidos/NovoNegocioDialog.tsx src/pages/EditarPedido.tsx src/hooks/use-edit-pedido.ts
```
Mensagem: `feat(negocios): ficha, cadastro e edição usam a lista de anexos`

---

### Task 6: A coluna Anexo com "+N"

**Files:**
- Modify: `src/lib/select-de-negocios.ts` e `src/lib/select-de-negocios.test.ts`
- Modify: `src/pages/Negocios.tsx`
- Modify: `src/components/pedidos/PainelDeNegocios.tsx`

**Interfaces:**
- Consumes: `resumoDaColunaDeAnexos` (T2).
- Produces: o select compartilhado passa a trazer `anexos:pedido_anexos(id, url, nome, tipo, created_at)`.

- [ ] **Step 1: Write the failing test** — em `select-de-negocios.test.ts`:

```ts
it('traz os anexos do negócio, que a coluna Anexo e a exportação leem', () => {
  expect(montarSelectDeNegocios()).toContain('anexos:pedido_anexos(');
});
```

- [ ] **Step 2: Acrescente o embed** em `montarSelectDeNegocios`, depois de `marcador:marcadores(...)`:
```ts
  anexos:pedido_anexos(id, url, nome, tipo, created_at)
```
🔴 **Não** troque `pdf_url` de lugar nem o tire do select: ele continua saindo porque a coluna do banco ainda existe (decisão 4), e há telas lendo o valor legado enquanto a migration não for aplicada.

- [ ] **Step 3: A coluna na lista.** Em `Negocios.tsx`, no trecho `if (colId === 'pdf_url')`, troque o conteúdo por:

```tsx
              {(() => {
                // "O primeiro, com +N ao lado" (decisão 3 do desenho): abrir o primeiro é o
                // gesto de hoje, e o "+N" conta quantos mais existem sem encher a linha.
                const { primeiro, extras } = resumoDaColunaDeAnexos(pedido.anexos ?? []);
                if (!primeiro) return '—';
                return (
                  <span className="inline-flex items-center gap-1.5">
                    <LinkAnexoPrivado url={primeiro.url} title={primeiro.nome} />
                    {extras > 0 && <span className="text-[10px] text-muted-foreground">+{extras}</span>}
                  </span>
                );
              })()}
```
A ordenação da coluna continua por presença: troque a leitura de `p.pdf_url` por `(p.anexos?.length ?? 0) > 0` no comparador (`Negocios.tsx` e `PainelDeNegocios.tsx`, onde hoje está `case 'anexo': return p.pdf_url ? 0 : 1;`).

- [ ] **Step 4: A mesma troca em `PainelDeNegocios.tsx`**, na célula `{p.pdf_url ? <LinkAnexoPrivado … /> : '—'}`.

- [ ] **Step 5: Run tests, tipos e lint**; **Commit**:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/lib/select-de-negocios.ts src/lib/select-de-negocios.test.ts src/pages/Negocios.tsx src/components/pedidos/PainelDeNegocios.tsx
```
Mensagem: `feat(negocios): a coluna Anexo mostra o primeiro e quantos mais existem`

---

### Task 7: A planilha — exporta todos, importa só ao criar

**Files:**
- Create: `src/test/reimportacao-nao-mexe-em-anexo.test.ts`
- Modify: `src/pages/Negocios.tsx` (a coluna da exportação)
- Modify: `src/hooks/use-bulk-import.ts` (um anexo por link, só ao criar)
- Modify: `src/components/pedidos/ImportPedidosDialog.tsx` (a frase da prévia)

**Interfaces:**
- Consumes: `resolveEspelhoPdfUrls` (`src/lib/import/resolve-pedido-pdf.ts`), que hoje recebe **um endereço por linha** e devolve o endereço já baixado para o balde.
- 🔴 **A decisão 3 deste plano já é verdade hoje:** o `patch` de `alteracoes-por-codigo.ts` só leva `nome`, `observacoes` e `marcador_id`. A tarefa **prende** isso, não conserta.

- [ ] **Step 1: Write the failing test** — crie `src/test/reimportacao-nao-mexe-em-anexo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 A PIOR FALHA POSSÍVEL DESTE PACOTE seria esta: alguém reimporta uma planilha antiga e os
 * anexos que a equipe acrescentou pela tela somem — sem erro, sem aviso, e sem ninguém
 * perceber até precisar do orçamento.
 *
 * A decisão do dono do produto (12/09/2026) é clara: a coluna Anexo vale só para negócio NOVO.
 * Hoje isso é verdade porque `montarAlteracoesPorCodigo` só monta `nome`, `observacoes` e
 * `marcador_id`. Este teste existe para continuar verdade.
 */
const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');

describe('reimportação não mexe em anexo', () => {
  it('🔴 o pacote de alterações por código não carrega anexo nenhum', () => {
    const codigo = ler('lib/import/alteracoes-por-codigo.ts');
    expect(codigo).not.toMatch(/patch\.(pdf_url|anexos?)\b/);
    expect(codigo).not.toMatch(/pedido_anexos/);
  });

  it('🔴 a gravação das alterações não cria nem apaga anexo', () => {
    const codigo = ler('hooks/use-bulk-import.ts');
    const trecho = codigo.slice(codigo.indexOf('async function atualizarNegociosPorCodigo'));
    expect(trecho).not.toMatch(/pedido_anexos/);
  });
});
```

- [ ] **Step 2: Run test** — `npx vitest run src/test/reimportacao-nao-mexe-em-anexo.test.ts`. Expected: **PASS de primeira** (é trava, não conserto). Prove que ela sabe falhar: acrescente `patch.pdf_url = '';` temporariamente em `alteracoes-por-codigo.ts`, veja falhar, **desfaça** e confira com `git diff`.

- [ ] **Step 3: A exportação leva todos.** Em `Negocios.tsx`, no mapa `valorDaColuna`, troque:
```ts
        pdf_url: p => p.pdf_url ?? '',
```
por:
```ts
        // Todos os anexos, separados por vírgula, CRUS — nunca assinados (o comentário acima
        // continua valendo: link assinado morre em uma hora e a importação o gravaria de volta).
        // A vírgula é o separador que a importação divide do outro lado.
        pdf_url: p => (p.anexos ?? []).map(a => a.url).filter(Boolean).join(', '),
```

- [ ] **Step 4: A importação cria um anexo por link, só ao criar.** Em `use-bulk-import.ts`:
  - divida a coluna por vírgula: cada linha da planilha vira uma **lista** de endereços (`String(row.pdf_url ?? '').split(',').map(s => s.trim()).filter(Boolean)`);
  - `resolveEspelhoPdfUrls` continua recebendo um endereço por vez: monte a lista achatada de todos os endereços, resolva, e reagrupe por linha — o índice de cada endereço guarda a que linha ele pertence;
  - **pare de gravar `pdf_url` no `insert` de `pedidos`**;
  - depois do `insert` em lote, com os ids devolvidos (`.select('id')` — confira se o insert já pede), grave as linhas de `pedido_anexos` na mesma ordem, uma por endereço, com `nome: nomeDoAnexo(url)`;
  - 🔴 falha ao gravar anexo **não** derruba a importação do negócio: conte em `motivosFalha` e siga. Negócio sem anexo é recuperável; negócio não importado, não.

- [ ] **Step 5: A prévia diz o que não vai mudar.** Em `ImportPedidosDialog.tsx`, onde a prévia já separa linhas novas das que serão atualizadas pelo Código/ID, acrescente a frase — com o número — quando houver linha existente **e** a coluna Anexo estiver mapeada:
  > "N linhas já existem e serão atualizadas: **os anexos delas não serão alterados.**"

- [ ] **Step 6: Run tests** (`npm run test`), tipos e lint dos quatro arquivos.

- [ ] **Step 7: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/test/reimportacao-nao-mexe-em-anexo.test.ts src/pages/Negocios.tsx src/hooks/use-bulk-import.ts src/components/pedidos/ImportPedidosDialog.tsx
```
Mensagem: `feat(negocios): planilha leva todos os anexos, e reimportação nunca mexe nos de negócio existente`

---

### Task 8: Verificação e ensaio na tela

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Suíte, tipos, lint e build**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```
Expected: testes passando; tipos e lint **por arquivo** sem subir; build compila.

- [ ] **Step 2: A conta da cópia.** Com a migration aplicada pelo Lucas, rode as duas leituras e mostre os números lado a lado: negócios com `pdf_url` preenchido × linhas em `pedido_anexos`. Eles têm de bater (5.438 em 12/09/2026). **Se não baterem, pare e avise** — é o sinal de que a cópia perdeu alguma coisa.

- [ ] **Step 3: Ensaio na tela** — `npm run dev`. 🔴 Só o passo 2 do desenho grava, e num negócio de teste que você apaga depois.
  1. Abrir um negócio que já tinha anexo: ele aparece na lista, com o nome certo, e abre.
  2. Num **negócio de teste**, acrescentar um PDF e uma imagem: os dois entram em cima, a imagem com miniatura. Tirar os dois ao terminar.
  3. Tentar subir um arquivo de 20 MB e um `.docx`: os dois são recusados, com a frase certa, e nada sobe.
  4. Na lista de negócios, um negócio com 3 anexos mostra o primeiro e "+2"; ordenar pela coluna Anexo continua separando quem tem de quem não tem.
  5. Exportar uma seleção pequena e conferir na planilha que a coluna Anexo traz os endereços separados por vírgula.
  6. Passar essa planilha pela prévia da importação: ela diz que as linhas já existem e que **os anexos não serão alterados**. **Pare na prévia.**
  7. Console do navegador: sem erro novo.

- [ ] **Step 4: Relatório** — para o Lucas, em linguagem de tela: os números da cópia, o que cada ensaio mostrou (com captura dos passos 2, 4 e 6), o total de testes e a contagem por arquivo de tipos e lint. **Não publique.**

---

## Fora deste plano — anotado para o Lucas decidir

| O quê | Por quê |
|---|---|
| Apagar `pedidos.pdf_url` do banco | É a rota de volta. Vira decisão depois que os anexos novos rodarem um tempo |
| Apagar arquivo do balde quando o anexo sai | Hoje nada apaga arquivo, e é isso que permite desfazer engano. Mexer nisso é plano próprio, com a conta do espaço na mão |
| Mandar anexo por WhatsApp ou e-mail direto da ficha | Ninguém pediu; o envio de catálogo tem caminho e travas próprias |
| Aceitar outros tipos de arquivo | Decisão 1: PDF e imagem |
| Os 4 anexos que ainda apontam para o CDN do Bitrix | Continuam como estão; baixá-los é tarefa de dado, separada |
