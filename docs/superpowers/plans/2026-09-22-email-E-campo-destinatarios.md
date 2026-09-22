# E-mail E — Fichinhas + autocompletar de destinatário — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os 3 campos de texto Para/Cc/Cco do compositor por um campo de **fichinhas** (chips) com **autocompletar** (equipe → clientes → recentes), sem mudar o contrato de envio/autosave.

**Architecture:** Um componente `CampoDestinatarios` (chips + lista de sugestões via shadcn Command) guarda `Array<{nome?,email}>` internamente e serializa para a MESMA string "Nome <email>, …" de hoje. As sugestões vêm de uma RPC nova `email_buscar_destinatarios` (SECURITY DEFINER, §7.4), consumida por um hook. O `CompositorEmail` troca os 3 `<Input>` pelo componente; envio (`parseEnderecos`) e autosave não mudam.

**Tech Stack:** React 18 + Vite + TS, shadcn (Command/Popover), TanStack Query, Supabase RPC, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-email-reforma-compositor-acoes-autocompletar-design.md` (seção E).

## Global Constraints

- PT-BR em tela/comentário/commit; doc técnico seco.
- Verificação (§9): `tsc` baseline (36, não sobe); `npm run test` não cai; `build` compila; `lint` não sobe.
- Sem dado real de cliente/equipe em teste/comentário (§6.9): "Ana Souza", "ana@x.com".
- 🔴 **RPC muda o banco de produção** (§6, §11, AGENTS §4): medir → ensaiar (RAISE que desfaz) → **parar e pedir o "pode"** → aplicar. Nasce por migration (§6.2). `types.ts` à mão (§6.8). A RPC é SECURITY DEFINER escopada por `get_my_empresa_id()`, `EXECUTE` só p/ `authenticated` (revoke de public/anon) — não vazar entre empresas (ver memória `visoes-v-md-tiveram-acesso-revogado`).
- Não cria contato no CRM: e-mail digitado fora da base **vira fichinha e pronto**.
- Publicar só os meus commits; `git fetch` antes; nunca `git add -A`. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Schema confirmado (medido 22/09): `usuarios(email,nome,empresa_id,deleted_at)`, `contatos(email,nome_contato,empresa_id)`, `clientes(email,nome_contato,razao_social,empresa_id)`, recentes de `email_mensagens(direcao='enviado').destinatarios` (jsonb). `pg_trgm` instalado. Volumes pequenos (usuarios 39, contatos ~2k, clientes ~2k, enviados 860) → `ilike` é rápido, **sem índices trigram novos**.

Âncoras: `CompositorEmail.tsx` — os 3 campos Para/Cc/Cco são `<Input>` (Para ~112-145, Cc ~147-162, Cco ~164-179 aprox.), `onChange({...valores, destinatario/cc/cco})`. `parseEnderecos` (`src/lib/enderecos-email.ts`) já lê "Nome <email>, …". `separarRemetente` em `email-enderecos.tsx`.

---

### Task 1: RPC `email_buscar_destinatarios` (banco) — PARE E CONVERSE

**Files:**
- Create: `supabase/migrations/<versao>_email_buscar_destinatarios.sql`
- Modify: `src/integrations/supabase/types.ts` (assinatura da RPC, à mão)

**Interfaces:**
- Produces: `email_buscar_destinatarios(p_termo text, p_limite int default 8) returns table(nome text, email text, origem text)`. `origem` ∈ 'equipe'|'cliente'|'recente'. Dedupe por `lower(email)` (equipe vence cliente vence recente). Ordena origem → "começa com o termo" → nome.

- [ ] **Step 1: Medir** (feito: volumes acima). Confirmar que `get_my_empresa_id()` existe e é chamável.
- [ ] **Step 2: Escrever a migration** (a RPC):
```sql
create or replace function public.email_buscar_destinatarios(p_termo text, p_limite int default 8)
returns table(nome text, email text, origem text)
language sql stable security definer set search_path = public
as $$
  with emp as (select public.get_my_empresa_id() as id),
  pat as (select '%' || coalesce(p_termo,'') || '%' as like_pat, coalesce(p_termo,'') || '%' as prefixo),
  cand as (
    select u.nome as nome, lower(u.email) as email, 'equipe' as origem, 0 as ord
    from usuarios u, emp, pat
    where u.empresa_id = emp.id and u.deleted_at is null and coalesce(u.email,'') <> ''
      and (u.nome ilike pat.like_pat or u.email ilike pat.like_pat)
    union all
    select c.nome_contato, lower(c.email), 'cliente', 1
    from contatos c, emp, pat
    where c.empresa_id = emp.id and coalesce(c.email,'') <> ''
      and (coalesce(c.nome_contato,'') ilike pat.like_pat or c.email ilike pat.like_pat)
    union all
    select coalesce(nullif(cl.nome_contato,''), cl.razao_social), lower(cl.email), 'cliente', 1
    from clientes cl, emp, pat
    where cl.empresa_id = emp.id and coalesce(cl.email,'') <> ''
      and (coalesce(cl.nome_contato,'') ilike pat.like_pat or coalesce(cl.razao_social,'') ilike pat.like_pat or cl.email ilike pat.like_pat)
    union all
    select d->>'name', lower(d->>'email'), 'recente', 2
    from (select destinatarios from email_mensagens
          where empresa_id = (select id from emp) and direcao='enviado'
          order by data_mensagem desc limit 300) m,
         jsonb_array_elements(coalesce(m.destinatarios,'[]'::jsonb)) d, pat
    where coalesce(d->>'email','') <> ''
      and (coalesce(d->>'name','') ilike pat.like_pat or (d->>'email') ilike pat.like_pat)
  ),
  dedup as (
    select distinct on (email) nome, email, origem, ord
    from cand order by email, ord
  )
  select nome, email, origem from dedup, pat
  order by ord,
           case when email like lower((select prefixo from pat)) or coalesce(nome,'') ilike (select prefixo from pat) then 0 else 1 end,
           coalesce(nome, email)
  limit greatest(1, coalesce(p_limite, 8));
$$;

revoke all on function public.email_buscar_destinatarios(text, int) from public, anon;
grant execute on function public.email_buscar_destinatarios(text, int) to authenticated;
```
- [ ] **Step 3: Ensaiar** — um `execute_sql` que cria a função, chama `select * from email_buscar_destinatarios('a', 8)` sob um `set_config` de `authenticated` + um `sub` de usuário real (padrão §7.15/ensaio), e termina com `RAISE` que desfaz. Confere que ordena equipe→cliente→recente e dedupa, e que roda < ~200ms. **Sem copiar e-mail real para arquivo.**
- [ ] **Step 4: PARAR** — apresentar medição + ensaio ao Lucas; **aplicar só com o "pode"** (via `apply_migration`).
- [ ] **Step 5:** `types.ts` à mão: adicionar `email_buscar_destinatarios` em `Functions` (Args `{p_termo, p_limite?}`, Returns `{nome,email,origem}[]`).
- [ ] **Step 6: Commit** (migration + types) `feat(email): RPC email_buscar_destinatarios (equipe/clientes/recentes)`.

---

### Task 2: helpers puros de serialização (chips ↔ string)

**Files:**
- Create: `src/lib/destinatarios-chips.ts` + `src/lib/destinatarios-chips.test.ts`

**Interfaces:**
- Produces: `type Ficha = { nome?: string; email: string }`; `parseFichas(valor: string): Ficha[]` (usa `parseEnderecos` + `separarRemetente`); `serializarFichas(fichas: Ficha[]): string` ("Nome <email>, …", só e-mail quando sem nome). `ehEmailValido(s): boolean` (reusar `enderecoPareceValido`).

- [ ] **Step 1: Teste que falha**:
```ts
expect(parseFichas("Ana <ana@x.com>, bia@x.com")).toEqual([{nome:"Ana",email:"ana@x.com"},{email:"bia@x.com"}]);
expect(serializarFichas([{nome:"Ana",email:"ana@x.com"},{email:"bia@x.com"}])).toBe("Ana <ana@x.com>, bia@x.com");
expect(serializarFichas([])).toBe("");
// ida-e-volta preserva
expect(serializarFichas(parseFichas("Ana <ana@x.com>, bia@x.com"))).toBe("Ana <ana@x.com>, bia@x.com");
```
- [ ] **Step 2-4:** rodar/falhar → implementar (delegando a `parseEnderecos`/`separarRemetente`) → passar. `tsc`.
- [ ] **Step 5: Commit** `feat(email): helpers de serializacao de fichinhas de destinatario`.

---

### Task 3: hook `use-buscar-destinatarios`

**Files:**
- Create: `src/hooks/use-buscar-destinatarios.ts`

**Interfaces:**
- Produces: `useBuscarDestinatarios(termo: string): { sugestoes: {nome:string|null;email:string;origem:string}[]; carregando: boolean }`. Debounce ~200ms; só busca com `termo.trim().length >= 2`; chama `supabase.rpc('email_buscar_destinatarios', {p_termo, p_limite: 8})`; `keepPreviousData`.

- [ ] **Step 1:** Implementar com `useQuery` (queryKey `["buscar_destinatarios", termoDebounced]`, `enabled: termoDebounced.length>=2`). Debounce local (useEffect + setTimeout, como o da busca de e-mail).
- [ ] **Step 2:** `tsc`. (Sem teste unitário — depende do Supabase; a lógica pura está na Task 2.)
- [ ] **Step 3: Commit** `feat(email): hook use-buscar-destinatarios (autocompletar via RPC)`.

---

### Task 4: componente `CampoDestinatarios`

**Files:**
- Create: `src/components/email/CampoDestinatarios.tsx` + `src/components/email/campo-destinatarios.test.tsx`

**Interfaces:**
- Consumes: `parseFichas`/`serializarFichas` (Task 2), `useBuscarDestinatarios` (Task 3), shadcn `Command`/`Popover`.
- Produces:
```tsx
export function CampoDestinatarios(props: {
  id: string; label: string; valor: string;
  onChange: (valor: string) => void; emailDaConta?: string | null;
}): JSX.Element
```
Mostra as fichas (nome/e-mail, "x" remove) + input. Digitar abre a lista de sugestões (embaixo). Enter/vírgula OU clique numa sugestão adiciona a ficha; Backspace no vazio remove a última. Não duplica e-mail (dedupe por lower). Serializa e chama `onChange` a cada mudança. E-mail digitado inválido: não bloqueia (vira ficha; o Nylas valida) — mas a ficha ganha um leve destaque se `!ehEmailValido`.

- [ ] **Step 1: Teste que falha** (`campo-destinatarios.test.tsx`): renderiza com `valor="Ana <ana@x.com>"` → mostra a ficha "Ana"; digitar "bia@x.com" + Enter → `onChange` recebe `"Ana <ana@x.com>, bia@x.com"`; clicar o "x" da ficha → `onChange` sem ela. (Sugestões via RPC ficam fora do teste unitário — mockar o hook ou não exercitar.)
- [ ] **Step 2-4:** rodar/falhar → implementar → passar. `tsc`; `build`.
  - Fichas: `parseFichas(valor)`. Adicionar: `serializarFichas([...fichas, nova])` → `onChange`. Remover idem.
  - Sugestões: `useBuscarDestinatarios(termoDigitado)`; lista clicável; navegar com setas (Command já faz).
  - Não sugerir a própria caixa (`emailDaConta`) nem e-mails já como ficha.
- [ ] **Step 5: Commit** `feat(email): CampoDestinatarios (fichinhas + sugestoes)`.

---

### Task 5: usar `CampoDestinatarios` no compositor

**Files:**
- Modify: `src/components/email/CompositorEmail.tsx`

**Interfaces:**
- Consumes: `CampoDestinatarios`. Troca os 3 `<Input>` (Para/Cc/Cco) por `<CampoDestinatarios>`, cada um ligado a `valores.destinatario/cc/cco` e ao mesmo `onChange` de hoje (`onChange({ ...valores, destinatario: v })`). `emailDaConta` novo prop opcional para não sugerir a própria caixa.

- [ ] **Step 1:** Trocar o `<Input id="to">` por `<CampoDestinatarios id="to" label="Para" valor={valores.destinatario} onChange={(v)=>onChange({...valores, destinatario:v})} emailDaConta={emailDaConta} />`. Idem Cc (`mostrarCc`) e Cco (`mostrarCco`). O efeito que REVELA Cc/Cco (5028d672) segue valendo.
- [ ] **Step 2:** `CompositorEmail` ganha prop `emailDaConta?: string|null`; `Emails.tsx` passa `connectedEmail` no `propsCompositor`.
- [ ] **Step 3:** `tsc`; `vitest` (compositor-moldura não cai — a "Para" agora é o novo campo; ajustar o teste se ele consultava `getByLabelText("Para")` como input); `build`.
- [ ] **Step 4: Commit** `feat(email): compositor usa fichinhas nos campos Para/Cc/Cco`.

---

### Task 6: Verificação final e publicação
- [ ] `tsc` 36; `npm run test` não cai; `build`; `lint` não sobe.
- [ ] Crivo (AGENTS §3): equipe/cliente/recente na ordem; e-mail fora da base vira ficha; Backspace remove; celular; empresa sem contatos (lista curta); a própria caixa não sugerida.
- [ ] `git fetch`; rebase se andou; reverificar; `git push origin HEAD:main`. A RPC já foi aplicada (Task 1) — dizer que já está no banco.
- [ ] Avisar o Lucas: conferência visual (fichinhas, autocompletar equipe/clientes/recentes, e-mail avulso).

## Self-Review (cobertura do spec E)
- Fichinhas em Para/Cc/Cco → Task 4 + 5.
- Autocompletar equipe→clientes→recentes → Task 1 (RPC) + 3 (hook) + 4.
- E-mail fora da base vira ficha, sem criar contato → Task 4.
- Serializa para a string de hoje (envio/autosave intactos) → Task 2 + 4.
- RPC SECURITY DEFINER escopada, sem vazar empresa → Task 1.
