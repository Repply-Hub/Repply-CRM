# Anexos em Tarefas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** anexar vários arquivos a uma tarefa (ao criar e ao editar), espelhando os anexos de negócio, com um clipe de contagem no card do Kanban.

**Architecture:** espelha o pacote de anexos de negócio (`pedido_anexos`), mas **autocontido no domínio de tarefa** — sem tocar em nenhum arquivo do caminho dos negócios (o desenho pediu isso, e os arquivos de negócio nem existem nesta cópia local). Reusa só as peças de baixo nível já presentes (`LinkAnexoPrivado`, `ImagemPrivada`, `file-validation`, `download-file`). Tabela `tarefa_anexos` + balde `tarefa-anexos` novos; hook `use-tarefa-anexos`; componente `CampoDeAnexosDaTarefa`.

**Tech Stack:** React 18 + Vite + TS (frouxo), TanStack Query, shadcn/ui, Supabase (Postgres + Storage), Vitest.

**Desenho:** `docs/superpowers/specs/2026-09-22-tarefa-anexos-design.md`. **Relatório-molde** (código real de referência, na pasta scratchpad): `.../scratchpad/molde-anexos-report.md`.

## Global Constraints

- **PT-BR** em interface, comentário, erro e commit. **Nada de dado real** (usar "Ana Souza", "Obra Exemplo").
- **Espelhar, não tocar negócio:** NÃO editar `CampoDeAnexos.tsx`, `use-pedido-anexos.ts`, `anexos-do-negocio.ts` nem nada de `src/components/pedidos/`. O molde é lido com `git show origin/main:<caminho>` (esta cópia local não tem esses arquivos).
- **`.delete()`/`.update()` conferem contagem** (`{ count: 'exact' }`, `count === 0` = recusa via `recusaSemErro`, nunca `!count`). Recusa da RLS volta sem erro (CLAUDE.md §4.6).
- **`usuario_id`/`criado_por` recebem `profile.id`** (não `user_id`) — `tarefa_anexos.criado_por` referencia `usuarios(id)`.
- **Migration:** só acrescenta arquivo; versão (`AAAAMMDDHHMMSS`) única no local **e** no `origin` (`git fetch` + conferir antes); **aplicar em produção pede o "pode" do Lucas**. Escrever ≠ aplicar.
- **Tipos à mão:** `src/integrations/supabase/types.ts` não é regenerado; atualizar manualmente.
- **Verificação:** `npm run test` (nº não cai) · `npx tsc --noEmit -p tsconfig.app.json` (com `-p`; base ~36, não sobe) · `npm run build` · `npm run lint` (nº não sobe).
- **Git:** o controlador faz o git (subagentes não commitam); `add` arquivo a arquivo; publica por cherry-pick sobre `origin/main`.

---

## Task 1: Banco — tabela `tarefa_anexos` + balde + tipos

**Files:**
- Create: `supabase/migrations/20260922130000_tarefa_anexos.sql` (ajuste o carimbo se colidir)
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: tabela `public.tarefa_anexos (id, tarefa_id, url, nome, tipo, tamanho_bytes, criado_por, created_at)`; balde `tarefa-anexos`; RLS por existência sobre `tarefas`.

- [ ] **Passo 1: conferir carimbo único**

Run: `git fetch origin && ls supabase/migrations/ | grep 20260922 ; git log origin/main --oneline -- 'supabase/migrations/20260922*' | head`
Se `20260922130000` já existir, use `20260922131000`.

- [ ] **Passo 2: escrever a migration**

Create `supabase/migrations/20260922130000_tarefa_anexos.sql`:
```sql
-- Anexos de uma tarefa. Espelha pedido_anexos (20260917100000_pedido_anexos.sql): uma linha por
-- arquivo, regras POR EXISTENCIA sobre a tarefa (quem enxerga a tarefa enxerga os anexos; quem
-- pode EDITAR a tarefa - dono ou gestor - acrescenta e tira anexo). Tarefa nunca teve anexo:
-- nasce vazia, sem copia retroativa.
create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  url text not null,
  nome text not null,
  tipo text,
  tamanho_bytes bigint,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tarefa_anexos_tarefa_id_idx on public.tarefa_anexos (tarefa_id);

alter table public.tarefa_anexos enable row level security;

create policy tarefa_anexos_select on public.tarefa_anexos
  for select using (
    exists (select 1 from public.tarefas t where t.id = tarefa_id)
  );

create policy tarefa_anexos_insert on public.tarefa_anexos
  for insert with check (
    exists (
      select 1 from public.tarefas t
      where t.id = tarefa_id
        and (
          t.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(t.usuario_id))
        )
    )
  );

create policy tarefa_anexos_delete on public.tarefa_anexos
  for delete using (
    exists (
      select 1 from public.tarefas t
      where t.id = tarefa_id
        and (
          t.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(t.usuario_id))
        )
    )
  );

comment on table public.tarefa_anexos is 'Anexos de uma tarefa (PDF, imagem e arquivos de escritorio).';

-- Balde do Storage, espelhando pedido-anexos (publico; a leitura fina fica nas policies abaixo,
-- prontas para o dia em que o balde fechar - plano dos baldes privados).
insert into storage.buckets (id, name, public)
values ('tarefa-anexos', 'tarefa-anexos', true)
on conflict (id) do nothing;

-- Policies de storage.objects, espelho exato das de pedido-anexos: envio SO na pasta da propria
-- empresa (primeiro segmento do caminho = empresa_id); leitura pela empresa/dono; remocao pelo
-- dono do arquivo, gestor da empresa ou admin.
create policy tarefa_anexos_obj_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'tarefa-anexos'
    and (storage.foldername(name))[1] = (get_my_empresa_id())::text
  );

create policy tarefa_anexos_obj_select on storage.objects
  for select to authenticated using (
    bucket_id = 'tarefa-anexos'
    and (
      (storage.foldername(name))[1] = (get_my_empresa_id())::text
      or owner_id = (auth.uid())::text
      or is_admin()
    )
  );

create policy tarefa_anexos_obj_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'tarefa-anexos'
    and (
      owner_id = (auth.uid())::text
      or (is_gestor() and (storage.foldername(name))[1] = (get_my_empresa_id())::text)
      or is_admin()
    )
  );
```

- [ ] **Passo 3: atualizar `types.ts` à mão**

No objeto `Tables` de `src/integrations/supabase/types.ts`, acrescente o bloco `tarefa_anexos` (em ordem alfabética, perto de `tarefas`), espelhando a forma que `pedido_anexos` já tem no `origin/main` (confira com `git show origin/main:src/integrations/supabase/types.ts | grep -A40 "pedido_anexos:"`):
```ts
      tarefa_anexos: {
        Row: {
          id: string
          tarefa_id: string
          url: string
          nome: string
          tipo: string | null
          tamanho_bytes: number | null
          criado_por: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tarefa_id: string
          url: string
          nome: string
          tipo?: string | null
          tamanho_bytes?: number | null
          criado_por?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tarefa_id?: string
          url?: string
          nome?: string
          tipo?: string | null
          tamanho_bytes?: number | null
          criado_por?: string | null
          created_at?: string
        }
        Relationships: []
      }
```

- [ ] **Passo 4: conferir tipo**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: nº de erros não sobe.

- [ ] **Passo 5: commit (NÃO aplicar a migration ainda — só o "pode" do Lucas aplica)**

```bash
git add supabase/migrations/20260922130000_tarefa_anexos.sql src/integrations/supabase/types.ts
git commit -m "feat(tarefas): tabela tarefa_anexos + balde (anexos de tarefa)"
```

---

## Task 2: Validação e helpers de anexo de tarefa (TDD)

**Files:**
- Create: `src/lib/anexos-de-tarefa.ts`
- Test: `src/lib/anexos-de-tarefa.test.ts`

**Interfaces:**
- Produces: `recusaDoAnexoDeTarefa(arquivo): string | null`, `ACCEPT_DO_CAMPO_DE_TAREFA: string`, `ehImagem(tipo)`, `tamanhoLegivel(bytes)`, `nomeDoAnexo(url)`, `ordenarAnexos(lista)`.

- [ ] **Passo 1: escrever o teste que falha**

Create `src/lib/anexos-de-tarefa.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { recusaDoAnexoDeTarefa, ehImagem, tamanhoLegivel, ordenarAnexos } from './anexos-de-tarefa';

const arq = (over: Partial<{ name: string; size: number; type: string }> = {}) => ({
  name: 'doc.pdf', size: 1024, type: 'application/pdf', ...over,
});

describe('recusaDoAnexoDeTarefa', () => {
  it('aceita PDF, imagem e arquivos de escritório', () => {
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.pdf', type: 'application/pdf' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.png', type: 'image/png' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.zip', type: '' }))).toBeNull(); // ZIP sem MIME confiável: extensão decide
  });
  it('recusa acima de 15 MB, citando o limite', () => {
    const r = recusaDoAnexoDeTarefa(arq({ size: 20 * 1024 * 1024 }));
    expect(r).toContain('15');
  });
  it('recusa tipo fora da lista (.exe)', () => {
    expect(recusaDoAnexoDeTarefa(arq({ name: 'v.exe', type: 'application/octet-stream' }))).not.toBeNull();
  });
});

describe('ehImagem / tamanhoLegivel / ordenarAnexos', () => {
  it('ehImagem só para image/*', () => {
    expect(ehImagem('image/png')).toBe(true);
    expect(ehImagem('application/pdf')).toBe(false);
    expect(ehImagem(null)).toBe(false);
  });
  it('tamanhoLegivel em PT-BR, vazio quando não há bytes', () => {
    expect(tamanhoLegivel(null)).toBe('');
    expect(tamanhoLegivel(2 * 1024 * 1024)).toBe('2,0 MB');
    expect(tamanhoLegivel(500 * 1024)).toBe('500 KB');
  });
  it('ordenarAnexos põe o mais novo em cima e não muta o array', () => {
    const a = { created_at: '2026-09-01T00:00:00Z' };
    const b = { created_at: '2026-09-05T00:00:00Z' };
    const orig = [a, b];
    expect(ordenarAnexos(orig)).toEqual([b, a]);
    expect(orig).toEqual([a, b]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run src/lib/anexos-de-tarefa.test.ts` → FAIL (módulo não existe).

- [ ] **Passo 3: implementar**

Create `src/lib/anexos-de-tarefa.ts` (espelha `anexos-do-negocio.ts`, com a lista ampla de escritório; helpers genéricos re-implementados aqui para o domínio ser autocontido, já que `anexos-do-negocio.ts` não existe nesta cópia):
```ts
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './file-validation';
import { filenameFromUrl } from './download-file';

/**
 * O que pode ser anexado a uma TAREFA: lista ampla "de escritório" (decisão do dono do produto,
 * 22/09/2026). Tarefa é trabalho interno, não orçamento — por isso mais larga que a de negócio.
 */
export const TIPOS_DE_ANEXO_DE_TAREFA_ACEITOS = [
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
] as const;

export const EXTENSOES_DE_ANEXO_DE_TAREFA_ACEITAS = [
  '.pdf', '.jpg', '.jpeg', '.png',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip',
] as const;

export const ACCEPT_DO_CAMPO_DE_TAREFA = EXTENSOES_DE_ANEXO_DE_TAREFA_ACEITAS.join(',');

export interface ArquivoParaAnexar { name: string; size: number; type: string }

/**
 * Confere tamanho, depois EXTENSÃO (sempre exigida — sobrevive a `type` vazio de app de celular)
 * E o tipo MIME quando o navegador informou algum. Devolve a frase em PT-BR ou null.
 */
export function recusaDoAnexoDeTarefa(arquivo: ArquivoParaAnexar): string | null {
  if (arquivo.size > MAX_FILE_SIZE_BYTES) {
    return `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_MB} MB.`;
  }
  const nome = (arquivo.name ?? '').toLowerCase();
  const extensaoAceita = EXTENSOES_DE_ANEXO_DE_TAREFA_ACEITAS.some((ext) => nome.endsWith(ext));
  const tipoAceito = (TIPOS_DE_ANEXO_DE_TAREFA_ACEITOS as readonly string[]).includes(arquivo.type);
  const passa = extensaoAceita && (!arquivo.type || tipoAceito);
  if (!passa) {
    return 'Tipo de arquivo não aceito. Envie PDF, imagem, Word, Excel, PowerPoint, texto/CSV ou ZIP.';
  }
  return null;
}

/** true para imagem — decide entre miniatura e ícone. */
export function ehImagem(tipo?: string | null): boolean {
  return !!tipo && tipo.startsWith('image/');
}

/** Tamanho em PT-BR: uma casa em MB, KB inteiro abaixo de 1 MB, vazio sem bytes. */
export function tamanhoLegivel(bytes?: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  const kb = Math.round(bytes / 1024);
  if (kb >= 1024) return '1,0 MB';
  return `${kb} KB`;
}

/** Nome do arquivo a partir do fim do endereço (uma decodificação só, via filenameFromUrl). */
export function nomeDoAnexo(url: string): string {
  return filenameFromUrl(url, 'anexo');
}

/** Mais novo em cima. Estável, não muta o array recebido. */
export function ordenarAnexos<T extends { created_at: string }>(anexos: readonly T[]): T[] {
  return [...anexos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npx vitest run src/lib/anexos-de-tarefa.test.ts` → PASS.

- [ ] **Passo 5: commit**

```bash
git add src/lib/anexos-de-tarefa.ts src/lib/anexos-de-tarefa.test.ts
git commit -m "feat(tarefas): validação e helpers de anexo de tarefa (tipos de escritório)"
```

---

## Task 3: Hook `use-tarefa-anexos.ts` (TDD, espelha `use-pedido-anexos`)

**Files:**
- Create: `src/hooks/use-tarefa-anexos.ts`
- Test: `src/hooks/use-tarefa-anexos.test.tsx`

**Interfaces:**
- Consumes: `anexos-de-tarefa` (Task 2), `sanitizeFileName` (`file-validation`), `useAuth`, `mensagemDeErro`, `recusaSemErro`.
- Produces: `AnexoDaTarefa` (`{ id, url, nome, tipo, tamanhoBytes, criadoEm }`); `useAnexosDaTarefa(tarefaId?)`; `useAdicionarAnexoDaTarefa(tarefaId)`; `useRemoverAnexoDaTarefa(tarefaId)`; e a função pura reutilizável no fluxo de criar: `enviarAnexoDeTarefa(tarefaId, arquivo, profile): Promise<AnexoDaTarefa>`.

- [ ] **Passo 1: ler o molde**

Run: `git show origin/main:src/hooks/use-pedido-anexos.ts` e `git show origin/main:src/hooks/use-pedido-anexos.test.tsx` — são a referência exata. O relatório-molde (`.../scratchpad/molde-anexos-report.md`, itens 4 e 8) já traz o conteúdo comentado.

- [ ] **Passo 2: escrever o teste que falha** (espelha `use-pedido-anexos.test.tsx`, trocando `pedido_anexos`→`tarefa_anexos`, `pedido-anexos`→`tarefa-anexos`, `pedidoId`→`tarefaId`, e SEM os casos de `useHerdarAnexos`)

Cobrir: lista ordenada + mapeamento `tamanho_bytes→tamanhoBytes`/`created_at→criadoEm`; adicionar (caminho `empresa-1/<uuid>/<nome-sanitizado>`, grava nome ORIGINAL, invalida `['tarefa_anexos', tarefaId]`); recusa de tipo (.exe) e de tamanho (20 MB) NÃO sobem nem gravam; sem `empresa_id` recusa antes de subir; upload ok + insert falha → mensagem "foi enviado, mas não ficou preso"; remover com `{count:'exact'}` invalida; `count===0` → erro "NÃO foi removido", sem toast de sucesso. (Reaproveitar o dublê de `supabase` do teste-molde.)

Run: `npx vitest run src/hooks/use-tarefa-anexos.test.tsx` → FAIL.

- [ ] **Passo 3: implementar** — crie `src/hooks/use-tarefa-anexos.ts` **espelhando `git show origin/main:src/hooks/use-pedido-anexos.ts`** com EXATAMENTE estas transformações:
  - `pedido_anexos` → `tarefa_anexos`; `pedido-anexos` → `tarefa-anexos`; `pedidoId`/`pedido_id` → `tarefaId`/`tarefa_id`; `AnexoDoNegocio` → `AnexoDaTarefa`; `useAnexosDoNegocio` → `useAnexosDaTarefa`; `useAdicionarAnexo` → `useAdicionarAnexoDaTarefa`; `useRemoverAnexo` → `useRemoverAnexoDaTarefa`; `['pedido_anexos', ...]` → `['tarefa_anexos', ...]`.
  - imports: trocar `recusaDoAnexo, nomeDoAnexo, ordenarAnexos` de `@/lib/anexos-do-negocio` por `recusaDoAnexoDeTarefa, nomeDoAnexo, ordenarAnexos` de `@/lib/anexos-de-tarefa`; usar `recusaDoAnexoDeTarefa` no lugar de `recusaDoAnexo`.
  - **REMOVER** `useHerdarAnexos` e a interface `AnexoParaHerdar` (tarefa não tem "duplicar").
  - **EXTRAIR** o corpo do upload+insert de `useAdicionarAnexoDaTarefa` para uma função pura exportada, para o fluxo de CRIAR (Task 6) reutilizar sem hook:
    ```ts
    export async function enviarAnexoDeTarefa(
      tarefaId: string,
      arquivo: File,
      profile: { id: string; empresa_id: string },
    ): Promise<AnexoDaTarefa> {
      const recusa = recusaDoAnexoDeTarefa(arquivo);
      if (recusa) throw new Error(recusa);
      const caminho = `${profile.empresa_id}/${crypto.randomUUID()}/${sanitizeFileName(arquivo.name)}`;
      const { error: erroDoEnvio } = await supabase.storage.from('tarefa-anexos').upload(caminho, arquivo);
      if (erroDoEnvio) throw erroDoEnvio;
      const { data: { publicUrl } } = supabase.storage.from('tarefa-anexos').getPublicUrl(caminho);
      const { data, error } = await supabase.from('tarefa_anexos').insert({
        tarefa_id: tarefaId, url: publicUrl, nome: arquivo.name,
        tipo: arquivo.type || null, tamanho_bytes: arquivo.size, criado_por: profile.id,
      }).select('id, url, nome, tipo, tamanho_bytes, created_at').single();
      if (error) throw new Error(`O arquivo foi enviado, mas não ficou preso a esta tarefa: ${mensagemDeErro(error)}. Tente anexar de novo.`);
      return mapearLinha(data as LinhaDeAnexo);
    }
    ```
    e `useAdicionarAnexoDaTarefa(tarefaId)` passa a chamar `enviarAnexoDeTarefa(tarefaId, arquivo, profile)` no `mutationFn` (checando `profile?.empresa_id`/`profile?.id` antes, com as mesmas mensagens do molde).

- [ ] **Passo 4: rodar e ver passar**

Run: `npx vitest run src/hooks/use-tarefa-anexos.test.tsx` → PASS. Depois `npx tsc --noEmit -p tsconfig.app.json` (nº não sobe).

- [ ] **Passo 5: commit**

```bash
git add src/hooks/use-tarefa-anexos.ts src/hooks/use-tarefa-anexos.test.tsx
git commit -m "feat(tarefas): hook use-tarefa-anexos (espelha use-pedido-anexos)"
```

---

## Task 4: Componente `CampoDeAnexosDaTarefa.tsx` (espelha `CampoDeAnexos`)

**Files:**
- Create: `src/components/tarefas/CampoDeAnexosDaTarefa.tsx`

**Interfaces:**
- Consumes: `AnexoDaTarefa` (Task 3), `ACCEPT_DO_CAMPO_DE_TAREFA`/`ehImagem`/`tamanhoLegivel`/`recusaDoAnexoDeTarefa` (Task 2), `LinkAnexoPrivado`, `ImagemPrivada`.
- Produces: `CampoDeAnexosDaTarefa` com props `{ anexos: AnexoDaTarefa[]; onAdicionar: (f: File)=>void|Promise<void>; onRemover?: (id: string)=>void|Promise<void>; enviando?: boolean }`.

- [ ] **Passo 1: implementar** — crie `src/components/tarefas/CampoDeAnexosDaTarefa.tsx` **espelhando `git show origin/main:src/components/pedidos/CampoDeAnexos.tsx`** (conteúdo no relatório-molde item 3) com estas transformações:
  - imports de `@/lib/anexos-do-negocio` → `@/lib/anexos-de-tarefa` (`ACCEPT_DO_CAMPO`→`ACCEPT_DO_CAMPO_DE_TAREFA`, `recusaDoAnexo`→`recusaDoAnexoDeTarefa`; `ehImagem`, `tamanhoLegivel` iguais); tipo `AnexoDoNegocio` de `@/hooks/use-pedido-anexos` → `AnexoDaTarefa` de `@/hooks/use-tarefa-anexos`.
  - `CampoDeAnexosProps`→`CampoDeAnexosDaTarefaProps`; `CampoDeAnexos`→`CampoDeAnexosDaTarefa`.
  - manter TODO o resto igual: `<ul>` ANTES do botão (o mais novo em cima; ordena por `criadoEm`), miniatura via `ImagemPrivada` para imagem e `FileText` para o resto, `<input accept={ACCEPT_DO_CAMPO_DE_TAREFA}>`, recusa exibida em `role="alert"`, `enviando` mostra a linha "Enviando…". Remover a prop `obrigatorio` (tarefa não exige anexo).

- [ ] **Passo 2: conferir tipo/build**

Run: `npx tsc --noEmit -p tsconfig.app.json` → nº não sobe.

- [ ] **Passo 3: commit**

```bash
git add src/components/tarefas/CampoDeAnexosDaTarefa.tsx
git commit -m "feat(tarefas): componente CampoDeAnexosDaTarefa"
```

---

## Task 5: `useCreateTarefa` devolve o `id` da tarefa nova

**Files:**
- Modify: `src/hooks/use-tarefas.ts` (`useCreateTarefa`, ~linha 151)

**Interfaces:**
- Produces: `createTarefa.mutateAsync(payload)` passa a resolver `{ id: string }`.

- [ ] **Passo 1: editar o insert**

Em `src/hooks/use-tarefas.ts`, no `mutationFn` de `useCreateTarefa` (~151), troque
```ts
      const { error } = await supabase.from('tarefas' as any).insert(payload as any);
      if (error) throw error;
```
por
```ts
      const { data, error } = await supabase.from('tarefas' as any).insert(payload as any).select('id').single();
      if (error) throw error;
      return data as { id: string };
```
(o resto do `onSuccess`/invalidações fica igual.)

- [ ] **Passo 2: conferir tipo e testes**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/hooks` → nº de tipo não sobe; testes de tarefas passam.

- [ ] **Passo 3: commit**

```bash
git add src/hooks/use-tarefas.ts
git commit -m "feat(tarefas): criar tarefa devolve o id (para prender anexos)"
```

---

## Task 6: Seção de anexos no `TarefaFormDialog` (criar e editar)

**Files:**
- Modify: `src/components/tarefas/TarefaFormDialog.tsx`

**Interfaces:**
- Consumes: `CampoDeAnexosDaTarefa` (Task 4); `useAnexosDaTarefa`/`useAdicionarAnexoDaTarefa`/`useRemoverAnexoDaTarefa`/`enviarAnexoDeTarefa` (Task 3); `useCreateTarefa` devolvendo id (Task 5); `useAuth`.

- [ ] **Passo 1: estado e ganchos** — no topo do componente (perto dos outros hooks; `editingTarefa`/`open` já existem, ~linha 60):
```ts
  const { profile } = useAuth();
  // EDITAR: os anexos vêm do banco e cada gesto grava na hora.
  const anexosSalvos = useAnexosDaTarefa(editingTarefa?.id);
  const adicionarAnexo = useAdicionarAnexoDaTarefa(editingTarefa?.id ?? '');
  const removerAnexo = useRemoverAnexoDaTarefa(editingTarefa?.id ?? '');
  // CRIAR: a tarefa ainda não existe — os arquivos ficam em memória até ela nascer.
  const [anexosPendentes, setAnexosPendentes] = useState<File[]>([]);
```
Ao abrir/fechar o diálogo (no mesmo efeito que já reseta `form`), zere `setAnexosPendentes([])`.

- [ ] **Passo 2: encaixar o `<CampoDeAnexosDaTarefa>` no JSX** — logo após o bloco "Marcadores" (~linha 287) e ANTES de `</CorpoDialogo>` (~288):
```tsx
          <div className="space-y-1.5">
            <Label>Anexos</Label>
            {editingTarefa ? (
              <CampoDeAnexosDaTarefa
                anexos={anexosSalvos.data ?? []}
                onAdicionar={(f) => adicionarAnexo.mutate(f)}
                onRemover={(id) => removerAnexo.mutate(id)}
                enviando={adicionarAnexo.isPending}
              />
            ) : (
              <CampoDeAnexosDaTarefa
                anexos={anexosPendentes.map((f, i) => ({
                  id: `pendente-${i}`, url: '', nome: f.name, tipo: f.type || null,
                  tamanhoBytes: f.size, criadoEm: new Date(Date.now() + i).toISOString(),
                }))}
                onAdicionar={(f) => setAnexosPendentes((xs) => [...xs, f])}
                onRemover={(id) => setAnexosPendentes((xs) => xs.filter((_, i) => `pendente-${i}` !== id))}
              />
            )}
          </div>
```
> No modo criar, a lista pendente mostra ícone + nome + tamanho (sem miniatura de imagem — a miniatura aparece depois de salvar). `url: ''` faz `LinkAnexoPrivado` não abrir nada até existir; é aceitável para itens ainda não enviados.

- [ ] **Passo 3: no `handleSave`, subir os pendentes DEPOIS de criar a tarefa** — no ramo `else` (criar) de `handleSave` (~166), troque
```ts
        await createTarefa.mutateAsync(payload);
        toast.success('Tarefa criada');
```
por
```ts
        const { id } = await createTarefa.mutateAsync(payload);
        if (anexosPendentes.length > 0) {
          if (!profile?.empresa_id || !profile?.id) {
            toast.error('Tarefa criada, mas os anexos não subiram: seu usuário/empresa não foi identificado.');
          } else {
            const falhas: string[] = [];
            for (const arquivo of anexosPendentes) {
              try {
                await enviarAnexoDeTarefa(id, arquivo, { id: profile.id, empresa_id: profile.empresa_id });
              } catch (e) {
                falhas.push(arquivo.name);
              }
            }
            if (falhas.length > 0) toast.error(`Tarefa criada, mas ${falhas.length} anexo(s) não subiram: ${falhas.join(', ')}.`);
          }
        }
        toast.success('Tarefa criada');
```
(imports: acrescentar `useState` se ainda não estiver; `CampoDeAnexosDaTarefa`; os hooks e `enviarAnexoDeTarefa` de `@/hooks/use-tarefa-anexos`; `useAuth`.)

- [ ] **Passo 4: conferir tipo e build**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run build` → tipo não sobe; build compila.

- [ ] **Passo 5: commit**

```bash
git add src/components/tarefas/TarefaFormDialog.tsx
git commit -m "feat(tarefas): anexos no formulário de tarefa (criar e editar)"
```

---

## Task 7: Clipe de contagem no card do Kanban

**Files:**
- Modify: `src/hooks/use-tarefas.ts` (query `useTarefas` ~83; interface `Tarefa` ~63)
- Modify: `src/components/tarefas/TarefaKanbanCard.tsx`

- [ ] **Passo 1: trazer a contagem na query** — em `useTarefas` (~89), troque `.select('*')` por:
```ts
        .select('*, tarefa_anexos(count)')
```
E na interface `Tarefa` (~63-81) acrescente:
```ts
  tarefa_anexos?: { count: number }[];
```

- [ ] **Passo 2: mostrar o clipe no card** — em `TarefaKanbanCard.tsx`: importe `Paperclip` de `lucide-react` (junto de `Calendar`/`User`); no início do componente calcule `const qtdAnexos = tarefa.tarefa_anexos?.[0]?.count ?? 0;`; e no bloco de metadados (dentro do `<div className="mt-2 space-y-1">`, após o prazo, ~linha 74) acrescente:
```tsx
                {qtdAnexos > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    {qtdAnexos}
                  </div>
                )}
```

- [ ] **Passo 3: conferir tipo e build**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run build` → tipo não sobe; build compila.

> ⚠️ O `tarefa_anexos(count)` só devolve contagem depois que a migration (Task 1) estiver aplicada em produção. Até lá, em produção a query pode falhar (relação inexistente). Por isso **a Task 1 é aplicada ANTES de publicar a Task 7** — ver a ordem de publicação na conversa. Localmente (sem banco), o build não executa a query, então compila normalmente.

- [ ] **Passo 4: commit**

```bash
git add src/hooks/use-tarefas.ts src/components/tarefas/TarefaKanbanCard.tsx
git commit -m "feat(tarefas): clipe com contagem de anexos no card do Kanban"
```

---

## Task 8: Verificação de ponta a ponta

- [ ] **Passo 1: suíte + tipos + build + lint**

Run: `npm run test && npx tsc --noEmit -p tsconfig.app.json && npm run build && npm run lint 2>&1 | tail -3`
Expected: testes passam (nº subiu, não caiu); tipo em ~36 (não subiu); build compila; lint não subiu.

- [ ] **Passo 2: manual (após a migration aplicada em produção — com o "pode")**
  - Criar tarefa nova com um PDF e uma planilha: os dois entram (ícone + nome + tamanho); recarregar → continuam lá (agora com miniatura se imagem).
  - Editar uma tarefa e anexar/remover: grava na hora; recarregar confirma.
  - Tentar um arquivo de 20 MB e um `.exe`: recusados, com a frase, sem subir.
  - Card no quadro com 2 anexos mostra o clipe "2".
  - Como vendedor que NÃO é dono da tarefa: vê os anexos, mas não consegue adicionar/remover (recusa sem erro fantasma — a contagem é conferida).

- [ ] **Passo 3: reportar evidência ao Lucas.**

---

## Ordem, dependências e publicação

1 (banco) → 2 (validação) → 3 (hook, precisa de 2) → 4 (componente, precisa de 2+3) → 5 (criar devolve id) → 6 (formulário, precisa de 3+4+5) → 7 (card, precisa da tabela da 1) → 8.

**Publicação (com o "pode"):** aplicar a migration da Task 1 em produção **antes** de publicar o site (senão a query `tarefa_anexos(count)` da Task 7 falha em produção). Publicar por cópia limpa a partir de `origin/main` + cherry-pick dos commits (nunca o ramo inteiro), como no WhatsApp; a Vercel constrói.

## Riscos (do desenho §9 e achados)

- ZIP não tem MIME confiável entre navegadores — a extensão é o sinal que decide (já tratado em `recusaDoAnexoDeTarefa`).
- Criar com anexos pendentes: se um upload falhar depois da tarefa criada, a tarefa fica sem aquele anexo e a tela avisa quais falharam (não trava a criação).
- Não tocar em nenhum arquivo de negócio (o molde é lido, não editado).
