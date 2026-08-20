# Blindagem do WhatsApp — plano de execução

> **Para quem vai executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam caixa de seleção (`- [ ]`) para acompanhar.

**O quê e o porquê estão em [`plano-blindagem-whatsapp.md`](plano-blindagem-whatsapp.md).**
Este documento é só o passo a passo. Leia o outro primeiro.

**Objetivo:** parar de gravar a senha da uazapi, apagar o acumulado com prazo de guarda de
30 dias, autenticar o webhook sem derrubar a MD, e tirar a senha do navegador.

**Abordagem:** uma função de limpeza compartilhada e testada; apagamento em lotes com
faxina em SQL puro; autenticação do webhook em modo observação antes de recusar; e o fluxo
de QR migrado do navegador para uma função de servidor.

**Pilha:** Supabase (Postgres + Edge Functions em Deno) · React 18 + TypeScript + Vite ·
Vitest.

---

## Restrições globais

- **PT-BR** em tudo o que é visível, em comentário e em mensagem de commit.
- **Autorização do Lucas antes de cada commit e de cada envio.** É por commit; a de ontem
  não vale para hoje. Ver `CLAUDE.md` §13.
- **Antes de cada commit:** `git fetch origin` e conferir se entrou commit de outra pessoa.
- **Nunca `git add -A`.** Há outra sessão trabalhando na mesma pasta. Liste os arquivos um
  a um. *(Este plano existe porque isso já quase deu errado em 20/08/2026.)*
- **Nunca edite migration existente.** Só acrescente arquivo novo.
- **Escrever a migration não é aplicá-la.** Este ambiente não tem banco local.
- **Critério do lint:** não é "passou". É **"o total não subiu"**. Base medida em
  20/08/2026: **498 problemas (458 erros, 40 avisos)**.
- **Testes:** `npm run test` tem que continuar passando limpo. Base: **120 testes**.
- **Não mexa** em `src/hooks/use-pedidos.ts`, `src/pages/Negocios.tsx` nem em migrations com
  prefixo `20260820150000` — são de outra frente de trabalho em andamento.

---

## Arquivos afetados

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/functions/_shared/sanitiza-payload.ts` | **Novo.** Única fonte da limpeza de segredo | 1 |
| `src/test/sanitiza-payload.test.ts` | **Novo.** Contrato da limpeza | 1 |
| `supabase/functions/whatsapp-webhook/index.ts` | Grava 3 vezes; passa a limpar. Depois, autentica | 2, 5, 6 |
| `supabase/functions/whatsapp-send/index.ts` | Grava 3 vezes; passa a limpar | 2 |
| `supabase/functions/whatsapp-send-reaction/index.ts` | Grava 1 vez; passa a limpar | 2 |
| `supabase/functions/whatsapp-delete-message/index.ts` | Grava 1 vez; passa a limpar | 2 |
| `supabase/migrations/<ts>_webhook_debug_faxina.sql` | **Nova.** Índice + função de faxina + agendamento | 3 |
| `supabase/functions/whatsapp-admin-provision/index.ts` | Ganha ação de reconfigurar webhook | 4 |
| `supabase/functions/whatsapp-provision/index.ts` | Passa a gerar segredo ao criar instância | 7 |
| `supabase/functions/whatsapp-instancia/index.ts` | **Nova.** conectar/status/desconectar no servidor | 8 |
| `src/hooks/use-whatsapp-inbox.ts` | 3 pontos deixam de falar com a uazapi | 9 |
| `src/hooks/use-admin-whatsapp.ts` | 3 pontos deixam de falar com a uazapi | 9 |
| `supabase/migrations/<ts>_wapi_api_key_fora_do_navegador.sql` | **Nova.** Revoga leitura da coluna | 10 |

`<ts>` = carimbo `AAAAMMDDHHMMSS` no momento de criar o arquivo.

> ⚠️ **Ao aplicar migration pelo MCP do Supabase, o banco registra um carimbo próprio.**
> Depois de aplicar, confira `select version, name from supabase_migrations.schema_migrations
> order by version desc limit 3` e **renomeie o arquivo para bater com o `version`
> registrado**. Senão alguém tenta aplicar de novo depois. Aconteceu na Fase 0.

---

# FASE 1 — Parar de gravar a senha

## Tarefa 1: A função de limpeza, com teste

**Arquivos:**
- Criar: `supabase/functions/_shared/sanitiza-payload.ts`
- Criar: `src/test/sanitiza-payload.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `sanitizaPayload(valor: unknown, segredos?: string[]): unknown` — usada nas
  tarefas 2, 5, 6.

**Por que fica em `_shared/` e o teste em `src/`:** o Vitest só coleta testes em
`src/**` (ver `vitest.config.ts`), mas **pode importar** de fora. O módulo é TypeScript
puro, sem import de URL do Deno, então o Vitest carrega direto. Isso mantém **uma cópia
só** — ao contrário de `normalizeWhatsappPhone`, que existe duplicado e que o `CLAUDE.md`
§7.1 aponta como armadilha.

- [ ] **Passo 1: escrever o teste que falha**

`src/test/sanitiza-payload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizaPayload } from '../../supabase/functions/_shared/sanitiza-payload';

/**
 * A `webhook_debug` guardou o token da instância uazapi em texto puro por 2 meses e
 * meio — 4.725 linhas, legíveis por qualquer pessoa na internet. A causa não foi
 * decidir salvar a senha: foi decidir salvar tudo, e a senha veio junto no pacote.
 *
 * Esta função é a única barreira entre o pacote cru e o banco. Se ela falhar em
 * silêncio, o vazamento volta inteiro.
 */
describe('sanitizaPayload', () => {
  const SEGREDO = 'abcd1234-token-da-instancia';

  it('tampa campo chamado token, no topo do pacote', () => {
    const saida = sanitizaPayload({ token: SEGREDO, evento: 'messages' }) as any;
    expect(saida.token).toBe('[removido]');
    expect(saida.evento).toBe('messages');
  });

  it('tampa campo sensível aninhado em qualquer profundidade', () => {
    const saida = sanitizaPayload({ a: { b: { apikey: SEGREDO } } }) as any;
    expect(saida.a.b.apikey).toBe('[removido]');
  });

  it('tampa variações de nome, sem depender de maiúscula', () => {
    const saida = sanitizaPayload({
      Token: SEGREDO, API_KEY: SEGREDO, Authorization: SEGREDO, adminToken: SEGREDO,
    }) as any;
    expect(Object.values(saida)).toEqual(
      ['[removido]', '[removido]', '[removido]', '[removido]'],
    );
  });

  it('tampa o segredo por VALOR, mesmo em campo de nome inocente', () => {
    const saida = sanitizaPayload(
      { response: `{"ok":true,"echo":"${SEGREDO}"}` },
      [SEGREDO],
    ) as any;
    expect(saida.response).not.toContain(SEGREDO);
    expect(saida.response).toContain('[removido]');
  });

  it('varre dentro de lista', () => {
    const saida = sanitizaPayload({ itens: [{ token: SEGREDO }, { ok: 1 }] }) as any;
    expect(saida.itens[0].token).toBe('[removido]');
    expect(saida.itens[1].ok).toBe(1);
  });

  it('não corrompe pacote que já está limpo', () => {
    const entrada = { evento: 'messages', chat: { nome: 'Karla', naoLidas: 3 }, ok: true };
    expect(sanitizaPayload(entrada)).toEqual(entrada);
  });

  it('não altera o objeto original — devolve cópia', () => {
    const entrada = { token: SEGREDO };
    sanitizaPayload(entrada);
    expect(entrada.token).toBe(SEGREDO);
  });

  it('aguenta valor solto sem quebrar', () => {
    expect(sanitizaPayload(null)).toBeNull();
    expect(sanitizaPayload(undefined)).toBeUndefined();
    expect(sanitizaPayload('texto')).toBe('texto');
    expect(sanitizaPayload(42)).toBe(42);
  });

  it('ignora segredo curto demais para ser um token', () => {
    const saida = sanitizaPayload({ texto: 'bom dia' }, ['a', 'dia']) as any;
    expect(saida.texto).toBe('bom dia');
  });

  it('não entra em laço infinito com referência circular', () => {
    const ciclo: any = { nome: 'x' };
    ciclo.ele_mesmo = ciclo;
    expect(() => sanitizaPayload(ciclo)).not.toThrow();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/test/sanitiza-payload.test.ts
```

Esperado: FALHA — `Failed to resolve import ".../sanitiza-payload"`.

- [ ] **Passo 3: escrever a implementação mínima**

`supabase/functions/_shared/sanitiza-payload.ts`:

```ts
/**
 * Remove segredo de um pacote antes de ele ir para `webhook_debug`.
 *
 * POR QUE ISTO EXISTE: a uazapi manda o token da própria instância dentro do pacote
 * do webhook e dentro da resposta de envio. As funções gravavam o pacote inteiro, cru.
 * Resultado medido em 20/08/2026: 4.725 linhas com o token em texto puro, numa tabela
 * que estava legível sem sessão. Ver docs/divida-tecnica.md §1.
 *
 * Tampa por DUAS vias independentes, de propósito:
 *   1. por NOME do campo  — pega o caso conhecido e qualquer campo novo com nome óbvio
 *   2. por VALOR          — pega o token escondido dentro de texto (ex.: o corpo cru da
 *                           resposta da uazapi, gravado como string)
 *
 * A via 1 sozinha falha se a uazapi renomear o campo. A via 2 sozinha falha se o
 * segredo vier de instância que não está no banco. Juntas, cobrem as duas.
 *
 * NUNCA lança. Registrar diagnóstico é conveniência; derrubar o recebimento de uma
 * mensagem por causa disso seria trocar um problema pequeno por um grande.
 *
 * Contrato fixado em src/test/sanitiza-payload.test.ts — cópia única, testada.
 */

const CHAVES_SENSIVEIS = new Set([
  "token",
  "apikey",
  "api_key",
  "admintoken",
  "admin_token",
  "authorization",
  "webhook_secret",
  "webhooksecret",
]);

const MASCARA = "[removido]";

/** Segredo curto demais vira falso positivo e apaga texto legítimo. */
const TAMANHO_MINIMO_DE_SEGREDO = 8;

/** Teto de profundidade: rede contra pacote absurdo ou referência circular. */
const PROFUNDIDADE_MAXIMA = 20;

export function sanitizaPayload(valor: unknown, segredos: string[] = []): unknown {
  try {
    const uteis = segredos.filter(
      (s) => typeof s === "string" && s.length >= TAMANHO_MINIMO_DE_SEGREDO,
    );
    return limpa(valor, uteis, 0, new WeakSet());
  } catch {
    // Se a limpeza falhar por qualquer motivo, não devolve o pacote cru: devolve
    // um marcador. Perder diagnóstico é aceitável; vazar segredo não é.
    return { _sanitizacao_falhou: true };
  }
}

function limpa(
  valor: unknown,
  segredos: string[],
  profundidade: number,
  vistos: WeakSet<object>,
): unknown {
  if (profundidade > PROFUNDIDADE_MAXIMA) return MASCARA;

  if (typeof valor === "string") {
    let saida = valor;
    for (const segredo of segredos) {
      if (saida.includes(segredo)) saida = saida.split(segredo).join(MASCARA);
    }
    return saida;
  }

  if (valor === null || typeof valor !== "object") return valor;

  if (vistos.has(valor as object)) return MASCARA;
  vistos.add(valor as object);

  if (Array.isArray(valor)) {
    return valor.map((item) => limpa(item, segredos, profundidade + 1, vistos));
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = CHAVES_SENSIVEIS.has(chave.toLowerCase())
      ? MASCARA
      : limpa(conteudo, segredos, profundidade + 1, vistos);
  }
  return saida;
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/test/sanitiza-payload.test.ts
```

Esperado: **10 passed**.

- [ ] **Passo 5: conferir que nada mais quebrou**

```bash
npm run test
```

Esperado: **130 testes passando** (120 de antes + 10 novos), zero falha.

- [ ] **Passo 6: pedir autorização e commitar**

Avise o Lucas, espere o "pode", rode `git fetch origin` e confira se entrou commit novo.

```bash
git add supabase/functions/_shared/sanitiza-payload.ts src/test/sanitiza-payload.test.ts
git commit -m "feat(whatsapp): função única de limpeza de segredo em pacote de diagnóstico"
```

---

## Tarefa 2: Ligar a limpeza nos 8 pontos que gravam

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-webhook/index.ts` (linhas ~122, ~520, ~894)
- Modificar: `supabase/functions/whatsapp-send/index.ts` (linhas ~132, ~399, ~557)
- Modificar: `supabase/functions/whatsapp-send-reaction/index.ts` (linha ~113)
- Modificar: `supabase/functions/whatsapp-delete-message/index.ts` (linha ~130)

**Interfaces:**
- Consome: `sanitizaPayload` da Tarefa 1.
- Produz: nada novo.

**Onde a senha está, medido:** `payload > token`, em 200 de 200 amostras. Mas a via por
valor cobre o caso do corpo cru gravado como texto (`response: responseText`), onde o
token aparece dentro de uma string.

- [ ] **Passo 1: importar a limpeza nos quatro arquivos**

No topo de cada um dos quatro `index.ts`, junto dos outros imports:

```ts
import { sanitizaPayload } from "../_shared/sanitiza-payload.ts";
```

> A extensão `.ts` é obrigatória — é Deno, não Node.

- [ ] **Passo 2: envolver cada `insert` em `webhook_debug`**

A regra é sempre a mesma: **o que for para `payload:` passa por `sanitizaPayload`**, e
quando o `api_key` da instância estiver no escopo, ele vai como segredo.

`whatsapp-send-reaction/index.ts` (~113) — o `config.api_key` está no escopo:

```ts
    await supabase.from("webhook_debug").insert({
      payload: sanitizaPayload({
        _debug: true, _reaction_send: true, url: wapiUrl, status: wapiStatus,
        response: responseText, fetch_error: fetchError || null,
        request_body: { Id: rawMessageId(wamid), Text: emoji },
      }, [config.api_key]),
    });
```

`whatsapp-delete-message/index.ts` (~130) — idem:

```ts
      await supabase.from("webhook_debug").insert({
        payload: sanitizaPayload({
          _debug: true, _delete_message: true, url: wapiUrl, status: wapiStatus,
          response: responseText, fetch_error: fetchError || null,
          request_body: { id: rawMessageId(mensagem.wamid) },
        }, [config.api_key]),
      });
```

`whatsapp-send/index.ts` (~399 e ~557) — `config.api_key` no escopo nos dois:

```ts
    await supabase.from("webhook_debug").insert({
      payload: sanitizaPayload({ /* ...o objeto que já estava aqui, sem alterar... */ },
        [config.api_key]),
    });
```

`whatsapp-send/index.ts` (~132, dentro de `recusaEnvio`) — **o `config` pode não existir
neste ponto**. Passe lista vazia; a via por nome de campo continua valendo:

```ts
    await supabase.from("webhook_debug").insert({
      payload: sanitizaPayload({ _envio_recusado: true, motivo, status, ...contexto }),
    });
```

`whatsapp-webhook/index.ts` (~122, dentro de `logWebhookDrop`) — sem `config` no escopo:

```ts
      .insert({ payload: sanitizaPayload({ _drop_reason: motivo, payload }) });
```

`whatsapp-webhook/index.ts` (~520 e ~894) — **é aqui que mora o pior caso**, porque grava
o pacote cru da uazapi, que é justamente onde o token vem:

```ts
    await supabase.from("webhook_debug").insert({
      payload: sanitizaPayload({
        _reaction_debug: true, msg, chat: payload.chat, reactionEmoji, reactionTargetWamid,
      }, [config.api_key]),
    });
```

```ts
  await supabase.from("webhook_debug").insert({
    payload: sanitizaPayload({ _call_debug: true, payload }, [config.api_key]),
  });
```

> Em `handleCallEvent` (~894) o `config` pode não estar no parâmetro. Se não estiver,
> **passe-o como parâmetro** a partir do `serve()` (que já tem `config`), em vez de
> chamar sem segredo — este é o ponto que mais grava token.

- [ ] **Passo 3: conferir que nenhum insert ficou de fora**

```bash
grep -rn 'from("webhook_debug").insert\|from("webhook_debug")' supabase/functions/*/index.ts
```

Esperado: **8 ocorrências, todas com `sanitizaPayload` na mesma expressão.** Se alguma
estiver crua, ela sozinha reabre o vazamento.

- [ ] **Passo 4: conferir lint e testes**

```bash
npm run lint 2>&1 | tail -3
npm run test
```

Esperado: lint **não passa de 498 problemas**; testes seguem verdes.

- [ ] **Passo 5: pedir autorização, commitar e publicar as funções**

```bash
git add supabase/functions/whatsapp-webhook/index.ts supabase/functions/whatsapp-send/index.ts supabase/functions/whatsapp-send-reaction/index.ts supabase/functions/whatsapp-delete-message/index.ts
git commit -m "fix(whatsapp): para de gravar o token da uazapi na tabela de diagnóstico"
```

> **Publicar a função é passo separado do commit.** Enviar para o `main` publica o site
> na Vercel, **não** as Edge Functions. Elas precisam ser implantadas no Supabase.

- [ ] **Passo 6: PROVAR que parou — o critério da fase**

Espere ~30 minutos de tráfego real e rode:

```sql
with chaves as (
  select distinct api_key from public.configuracoes_wapi
  where api_key is not null and length(api_key) > 8
)
select
  count(*) as linhas_novas,
  count(*) filter (
    where exists (select 1 from chaves k where w.payload::text like '%'||k.api_key||'%')
  ) as ainda_com_token
from public.webhook_debug w
where w.created_at > now() - interval '30 minutes';
```

**Aprovação: `ainda_com_token` = 0 e `linhas_novas` > 0.**

`linhas_novas > 0` importa tanto quanto o zero: se ninguém está gravando, o zero não
prova nada — prova que o tráfego parou, que seria um problema maior.

---

# FASE 2 — Esvaziar e instalar a faxina

## Tarefa 3: Apagar o acumulado e agendar a limpeza

**Arquivos:**
- Criar: `supabase/migrations/<ts>_webhook_debug_faxina.sql`

**Interfaces:**
- Consome: nada.
- Produz: `public.limpa_webhook_debug()` — apaga o que passou de 30 dias, devolve quantas
  linhas removeu.

**Pré-requisito absoluto:** a Tarefa 2 tem que estar publicada **e com o critério do Passo 6
aprovado**. Apagar antes de parar de gravar é enxugar gelo.

**Por que SQL puro e não chamada de função de servidor:** os dois agendamentos existentes
(`email-sync`, `eventos-lembrete`) disparam `net.http_post`, e para eles "sucesso" só quer
dizer que a requisição saiu — não que o efeito aconteceu. Uma faxina em SQL direto não tem
essa ambiguidade: sucesso é apagou.

> A dívida §4 diz que os agendamentos nunca funcionaram. **Isso está desatualizado.**
> Medido em 20/08/2026: `email-sync` com 1.446 sucessos e `eventos-lembrete` com 4.337,
> ambos rodando no mesmo dia. O agendamento funciona.

- [ ] **Passo 1: escrever a migration**

```sql
-- webhook_debug: apaga o acumulado e instala prazo de guarda de 30 dias
--
-- Estado antes desta migration (medido em 20/08/2026): 71 mil linhas, 74 MB, crescendo
-- ~1.200 por dia desde 08/06, sem prazo de guarda nenhum. Dentro delas: 4.725 com o
-- token da uazapi e 53.847 com telefone de cliente.
--
-- Apaga-se o acumulado INTEIRO, e não só o que excede 30 dias: o prazo vale para o que
-- for gravado depois da limpeza da Tarefa 2 (já sem segredo). Tudo o que está aqui hoje
-- foi gravado antes e está contaminado — guardar os 30 dias mais recentes seria guardar
-- ~36 mil linhas com senha e ficha de contato dentro.
--
-- Não afeta o histórico que a MD vê: as conversas vivem em whatsapp_conversas (699) e
-- whatsapp_mensagens (46.705). Nenhuma chave estrangeira liga essas tabelas a esta.

-- 1. Atalho de busca por data. Sem ele a faxina varre a tabela inteira todo dia.
create index if not exists idx_webhook_debug_created_at
  on public.webhook_debug (created_at);

-- 2. A faxina. SECURITY DEFINER porque a tabela está com RLS ligada e sem política:
--    sem isto, nem o agendamento entra.
create or replace function public.limpa_webhook_debug()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removidas integer;
begin
  delete from public.webhook_debug
  where created_at < now() - interval '30 days';
  get diagnostics removidas = row_count;
  return removidas;
end;
$$;

revoke all on function public.limpa_webhook_debug() from public, anon, authenticated;

-- 3. Agendamento diário, 03h30 UTC (00h30 em Natal) — fora do expediente da MD.
select cron.schedule(
  'faxina-webhook-debug',
  '30 3 * * *',
  $$select public.limpa_webhook_debug()$$
);
```

- [ ] **Passo 2: aplicar a migration e conferir o carimbo**

Aplique pelo MCP do Supabase. Depois:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 3;
```

**Renomeie o arquivo** para o `version` que o banco registrou.

- [ ] **Passo 3: apagar o acumulado EM LOTES**

Não use um `DELETE` único: são 74 MB e a MD está usando o sistema. Rode o bloco abaixo
quantas vezes precisar, conferindo o retorno a cada rodada:

```sql
with alvo as (
  select id from public.webhook_debug
  where created_at < now() - interval '30 days'
  limit 5000
)
delete from public.webhook_debug w
using alvo
where w.id = alvo.id;
```

Depois, para o restante contaminado (o que tem menos de 30 dias mas foi gravado antes da
Tarefa 2), troque a condição por `where created_at < '<data-hora da publicação da Tarefa 2>'`.

- [ ] **Passo 4: conferir**

```sql
select
  count(*) as linhas,
  pg_size_pretty(pg_total_relation_size('public.webhook_debug')) as tamanho,
  min(created_at) as mais_antiga
from public.webhook_debug;
```

Esperado: só linhas posteriores à publicação da Tarefa 2, e tamanho muito menor que 74 MB.

- [ ] **Passo 5: conferir que o agendamento existe e está ativo**

```sql
select jobname, schedule, active from cron.job where jobname = 'faxina-webhook-debug';
```

Esperado: uma linha, `active = true`.

> **Volte aqui em 48 horas** e confira `cron.job_run_details` para a job. Agendamento que
> ninguém confere é agendamento que não roda.

- [ ] **Passo 6: pedir autorização e commitar**

```bash
git add supabase/migrations/<arquivo-renomeado>.sql
git commit -m "chore(whatsapp): prazo de guarda de 30 dias na tabela de diagnóstico"
```

---

# FASE 3 — Autenticar o webhook

> ⚠️ **A fase de maior risco.** Ligar a conferência antes de a uazapi mandar o segredo faz
> 100% das mensagens pararem de chegar, **em silêncio**. Já aconteceu neste sistema
> (`0715119`). As tarefas 4 → 5 → 6 existem justamente para não repetir isso, e **a ordem
> não pode ser trocada**.

## Tarefa 4: Gerar o segredo e registrar o novo endereço na uazapi

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-admin-provision/index.ts`

**Interfaces:**
- Consome: nada.
- Produz: ação `reconfigurar-webhook`, que recebe `{ instancia_id }` e devolve
  `{ ok: boolean, instance_name: string }`.

**Estado hoje, medido:** as 3 instâncias existentes estão com `webhook_secret` vazio. Duas
estão conectadas.

- [ ] **Passo 1: acrescentar a ação**

Dentro do `switch`/`if` de ações que já existe no arquivo:

```ts
    if (action === "reconfigurar-webhook") {
      const { instancia_id } = body as { instancia_id?: string };
      if (!instancia_id) return json({ error: "instancia_id é obrigatório" }, 400);

      const { data: inst } = await supabase
        .from("configuracoes_wapi")
        .select("id, instance_name, api_key, instance_url")
        .eq("id", instancia_id)
        .single();
      if (!inst) return json({ error: "Instância não encontrada" }, 404);

      // Segredo novo a cada chamada: reconfigurar é também como se rotaciona.
      const segredo = crypto.randomUUID().replace(/-/g, "");

      const webhookUrl =
        `${SUPABASE_URL}/functions/v1/whatsapp-webhook` +
        `?instance=${encodeURIComponent(inst.instance_name)}` +
        `&s=${segredo}`;

      const res = await fetch(`${inst.instance_url.replace(/\/$/, "")}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: inst.api_key },
        body: JSON.stringify({ url: webhookUrl, enabled: true, events: "All" }),
      });

      if (!res.ok) {
        const detalhe = await res.text().catch(() => "");
        // NÃO grava o segredo se a uazapi não aceitou o endereço: gravar aqui deixaria
        // o banco esperando um segredo que a uazapi nunca vai mandar — e a Tarefa 6
        // passaria a recusar tudo.
        return json({ error: "uazapi recusou o webhook", status: res.status, detail: detalhe }, 502);
      }

      const { error: upErr } = await supabase
        .from("configuracoes_wapi")
        .update({ webhook_secret: segredo })
        .eq("id", inst.id);
      if (upErr) return json({ error: "Falha ao salvar o segredo", detail: upErr.message }, 500);

      return json({ ok: true, instance_name: inst.instance_name });
    }
```

- [ ] **Passo 2: verificar se a uazapi aceita cabeçalho próprio** *(5 minutos)*

Segredo na URL funciona sempre, mas aparece em registro de URL. Se a uazapi aceitar
cabeçalho no cadastro do webhook, é melhor. Teste acrescentando `headers: { "x-webhook-secret": segredo }`
ao corpo do `POST /webhook` e veja se ela aceita e reenvia.

**Se aceitar:** use as duas formas (a Tarefa 5 já confere as duas).
**Se não aceitar:** siga só com a URL e **registre a limitação** em
`docs/modulos/whatsapp.md` §6, para ninguém reinvestigar isso do zero.

- [ ] **Passo 3: publicar a função e rodar para as 3 instâncias**

Depois, confirme:

```sql
select instance_name, status,
       (webhook_secret is not null and length(webhook_secret) > 0) as tem_segredo
from public.configuracoes_wapi order by created_at;
```

Esperado: **`tem_segredo = true` nas 3.**

- [ ] **Passo 4: pedir autorização e commitar**

```bash
git add supabase/functions/whatsapp-admin-provision/index.ts
git commit -m "feat(whatsapp): ação para reconfigurar o webhook com segredo"
```

---

## Tarefa 5: Modo observação — conta, mas aceita todo mundo

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-webhook/index.ts`

**Interfaces:**
- Consome: `sanitizaPayload` (Tarefa 1); `webhook_secret` preenchido (Tarefa 4).
- Produz: registros `_auth_check` em `webhook_debug`, lidos no Passo 3.

**Esta tarefa não recusa ninguém.** Ela só mede. É a rede que impede a Tarefa 6 de derrubar
a MD.

- [ ] **Passo 1: acrescentar a conferência, sem bloquear**

Em `whatsapp-webhook/index.ts`, logo **depois** de carregar o `config` (linha ~60, após o
`if (!config)`) e **antes** de rotear o evento:

```ts
    // --- Conferência de origem, em MODO OBSERVAÇÃO ---
    // Ainda NÃO recusa ninguém: só registra se o segredo veio. Ligar a recusa antes de
    // 100% dos eventos chegarem com segredo faria toda mensagem da empresa parar de
    // chegar, em silêncio — foi exatamente o que aconteceu em 0715119.
    // A Tarefa 6 troca isto por recusa, e só depois de este número fechar.
    const segredoRecebido =
      url.searchParams.get("s") ?? req.headers.get("x-webhook-secret") ?? null;
    const segredoEsperado = config.webhook_secret ?? null;
    const origemConfere =
      !!segredoEsperado && !!segredoRecebido &&
      iguaisEmTempoConstante(segredoRecebido, segredoEsperado);

    await supabase.from("webhook_debug").insert({
      payload: sanitizaPayload({
        _auth_check: true,
        instancia: instanceName,
        tem_segredo_configurado: !!segredoEsperado,
        veio_com_segredo: !!segredoRecebido,
        confere: origemConfere,
        via: url.searchParams.get("s") ? "url" : (req.headers.get("x-webhook-secret") ? "cabecalho" : "nenhuma"),
      }),
    });
```

E, no topo do arquivo, a comparação em tempo constante — **mesma implementação que o
`email-webhook` já usa**, copiada de propósito para os dois não divergirem:

```ts
/** Comparação de tempo constante: sair no primeiro byte diferente vaza o segredo. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Passo 2: publicar e conferir que NADA mudou para a MD**

```sql
select count(*) as mensagens_ultima_hora
from public.whatsapp_mensagens
where created_at > now() - interval '1 hour';
```

Compare com a mesma janela do dia anterior. **Tem que ser equivalente.** Se caiu, pare e
investigue — a conferência não deveria afetar nada nesta tarefa.

- [ ] **Passo 3: observar por 3 dias**

```sql
select
  payload->>'instancia'                    as instancia,
  count(*)                                 as eventos,
  count(*) filter (where (payload->>'confere')::boolean) as com_segredo_valido,
  round(100.0 * count(*) filter (where (payload->>'confere')::boolean) / count(*), 1) as percentual
from public.webhook_debug
where payload ? '_auth_check' and created_at > now() - interval '3 days'
group by 1 order by 1;
```

**Só avance para a Tarefa 6 quando `percentual` = 100,0 em TODAS as instâncias, por pelo
menos 3 dias seguidos.**

Se alguma instância ficar abaixo de 100%, **não avance.** Provavelmente o `POST /webhook`
da Tarefa 4 não pegou naquela instância — rode a ação de novo para ela e reinicie a
contagem.

- [ ] **Passo 4: pedir autorização e commitar**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(whatsapp): confere a origem do webhook em modo observação"
```

---

## Tarefa 6: Passar a recusar

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-webhook/index.ts`

**Interfaces:** consome o resultado do Passo 3 da Tarefa 5.

> 🔴 **Não comece esta tarefa sem os 3 dias a 100%.** Não há como saber, olhando a tela,
> que o WhatsApp parou de receber: a instância continua aparecendo conectada.

- [ ] **Passo 1: trocar observação por recusa**

Substitua o `insert` de `_auth_check` da Tarefa 5 por:

```ts
    if (!origemConfere) {
      // Registra a recusa: se algo legítimo começar a ser barrado, é aqui que aparece.
      await supabase.from("webhook_debug").insert({
        payload: sanitizaPayload({
          _auth_recusado: true,
          instancia: instanceName,
          tem_segredo_configurado: !!segredoEsperado,
          veio_com_segredo: !!segredoRecebido,
        }),
      });
      return new Response(JSON.stringify({ error: "origem não autenticada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
```

- [ ] **Passo 2: publicar e vigiar por 1 hora**

```sql
select
  (select count(*) from public.whatsapp_mensagens
     where created_at > now() - interval '1 hour') as mensagens_recebidas,
  (select count(*) from public.webhook_debug
     where payload ? '_auth_recusado' and created_at > now() - interval '1 hour') as recusadas;
```

**Aprovação: `mensagens_recebidas` equivalente à hora normal E `recusadas` = 0.**

**Se `recusadas` > 0 ou as mensagens sumirem:** volte a função para a versão da Tarefa 5
imediatamente. Reverter é mais barato que investigar com a MD sem WhatsApp.

- [ ] **Passo 3: pedir autorização e commitar**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "fix(whatsapp): webhook passa a recusar chamada sem segredo"
```

- [ ] **Passo 4: mover a dívida §16 para "Resolvidos"**

Em `docs/divida-tecnica.md`, com data e commit, conforme a regra de manutenção do
`docs/README.md`.

---

## Tarefa 7: Instância nova já nasce com segredo

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-provision/index.ts` (~linha 218)
- Modificar: `supabase/functions/whatsapp-admin-provision/index.ts` (~linha 129)

**Sem isto, a próxima empresa nasce sem proteção** e o problema volta pela porta dos fundos.

- [ ] **Passo 1: gerar o segredo antes de registrar o webhook**

Nos dois arquivos, onde hoje está:

```ts
      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?instance=${instanceName}`;
```

troque por:

```ts
      const webhookSecret = crypto.randomUUID().replace(/-/g, "");
      const webhookUrl =
        `${SUPABASE_URL}/functions/v1/whatsapp-webhook` +
        `?instance=${encodeURIComponent(instanceName)}&s=${webhookSecret}`;
```

- [ ] **Passo 2: gravar o segredo junto da instância**

No `insert` em `configuracoes_wapi` dos dois arquivos, acrescente ao objeto:

```ts
        webhook_secret: webhookSecret,
```

- [ ] **Passo 3: conferir que nenhum caminho ficou sem segredo**

```bash
grep -n 'whatsapp-webhook?instance=' supabase/functions/*/index.ts
```

Esperado: **toda ocorrência tem `&s=`.**

- [ ] **Passo 4: publicar, pedir autorização e commitar**

```bash
git add supabase/functions/whatsapp-provision/index.ts supabase/functions/whatsapp-admin-provision/index.ts
git commit -m "fix(whatsapp): instância nova nasce com segredo de webhook"
```

---

# FASE 4 — Tirar a senha do navegador

## Tarefa 8: A função de servidor `whatsapp-instancia`

**Arquivos:**
- Criar: `supabase/functions/whatsapp-instancia/index.ts`

**Interfaces:**
- Consome: nada das tarefas anteriores.
- Produz: função com `{ acao: "conectar" | "status" | "desconectar", instancia_id?: string }`,
  devolvendo:
  - `conectar` → `{ qr: string | null, alreadyConnected: boolean }`
  - `status` → `{ isConnected: boolean, dbStatus: "connected" | "disconnected" }`
  - `desconectar` → `{ ok: true }`

**Não exige `verify_jwt = false`** — ao contrário do webhook, esta função é chamada pelo
navegador com sessão. **Não a acrescente ao `config.toml`.**

- [ ] **Passo 1: criar a função**

O molde de autenticação é o de `whatsapp-send-reaction/index.ts` (o mais enxuto do
projeto): valida `Authorization`, resolve `empresa_id` a partir de `usuarios`, e só então
busca a instância. **A checagem de empresa não é decoração** — sem ela, um usuário
autenticado de qualquer empresa conectaria e desconectaria o WhatsApp de outra.

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * conectar / status / desconectar de uma instância uazapi.
 *
 * POR QUE ESTA FUNÇÃO EXISTE: até 2026-08, esses três fluxos eram chamados DIRETO do
 * navegador (use-whatsapp-inbox.ts e use-admin-whatsapp.ts), o que obrigava o
 * `api_key` da instância a viajar até o cliente. Qualquer funcionário da empresa lia a
 * senha do WhatsApp abrindo as ferramentas do navegador. Ver divida-tecnica.md §1.
 *
 * Com isto no servidor, o `api_key` nunca sai daqui.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão não identificada. Entre novamente no sistema." }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json(),
    ]);
    if (authError || !user) return json({ error: "Sua sessão expirou. Atualize a página e entre de novo." }, 401);

    const { acao, instancia_id } = body as { acao?: string; instancia_id?: string };
    if (!acao) return json({ error: "acao é obrigatória" }, 400);

    const { data: userData } = await supabase
      .from("usuarios").select("id, empresa_id").eq("user_id", user.id).single();
    if (!userData?.empresa_id) return json({ error: "Usuário sem empresa" }, 403);

    // A instância TEM que ser da empresa de quem pediu.
    let q = supabase
      .from("configuracoes_wapi")
      .select("id, instance_url, api_key, instance_name")
      .eq("empresa_id", userData.empresa_id);
    if (instancia_id) q = q.eq("id", instancia_id);

    const { data: config } = await q.limit(1).single();
    if (!config) return json({ error: "WhatsApp ainda não configurado para esta empresa" }, 404);

    const baseUrl = config.instance_url.replace(/\/$/, "");

    if (acao === "conectar") {
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({}),
      });
      const texto = await res.text().catch(() => "");
      if (!res.ok) return json({ error: `Erro ${res.status} ao gerar QR`, detail: texto }, 502);

      let dados: Record<string, any> = {};
      try { dados = JSON.parse(texto); } catch { /* ok */ }

      // Mesma cadeia de fallback que estava no frontend — a uazapi devolve o QR em
      // lugares diferentes conforme a versão. "" significa "não há QR", não "vazio".
      const qrCru: string | null =
        dados?.instance?.qrcode ??
        dados?.qrcode?.base64 ??
        (typeof dados?.qrcode === "string" ? dados.qrcode : null) ??
        dados?.base64 ?? null;

      const alreadyConnected: boolean =
        dados?.connected === true ||
        dados?.status?.connected === true ||
        dados?.status?.loggedIn === true ||
        dados?.instance?.status === "connected" ||
        (typeof dados?.response === "string" && dados.response.toLowerCase().includes("already connected"));

      // Devolve QR e situação — NUNCA `dados` cru: ele traz o token da instância.
      return json({ qr: qrCru && qrCru.length > 0 ? qrCru : null, alreadyConnected });
    }

    if (acao === "status") {
      const res = await fetch(`${baseUrl}/instance/status`, {
        method: "GET", headers: { token: config.api_key },
      });
      if (!res.ok) return json({ error: `Erro ${res.status} ao consultar status` }, 502);
      const dados = await res.json();
      const isConnected: boolean =
        (dados?.status?.connected === true && dados?.status?.loggedIn === true) ||
        dados?.connected === true;
      const dbStatus = isConnected ? "connected" : "disconnected";
      await supabase.from("configuracoes_wapi").update({ status: dbStatus }).eq("id", config.id);
      return json({ isConnected, dbStatus });
    }

    if (acao === "desconectar") {
      const res = await fetch(`${baseUrl}/instance/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const texto = await res.text().catch(() => "");
        return json({ error: `Erro ${res.status} ao desconectar`, detail: texto }, 502);
      }
      await supabase.from("configuracoes_wapi").update({ status: "disconnected" }).eq("id", config.id);
      return json({ ok: true });
    }

    return json({ error: `Ação desconhecida: ${acao}` }, 400);
  } catch (err) {
    console.error("[whatsapp-instancia] erro:", err);
    return json({ error: String(err) }, 500);
  }
});
```

- [ ] **Passo 2: publicar e testar as três ações** com um usuário real, antes de mexer na tela.

- [ ] **Passo 3: pedir autorização e commitar**

```bash
git add supabase/functions/whatsapp-instancia/index.ts
git commit -m "feat(whatsapp): conectar/status/desconectar passam a rodar no servidor"
```

---

## Tarefa 9: Os 6 pontos da tela param de falar com a uazapi

**Arquivos:**
- Modificar: `src/hooks/use-whatsapp-inbox.ts` (~1433 `useWaConnect`, ~1480 `useWaSyncStatus`, ~1511 `useWaDisconnect`)
- Modificar: `src/hooks/use-admin-whatsapp.ts` (~117, ~153, ~185)

**Interfaces:** consome a função da Tarefa 8.

- [ ] **Passo 1: trocar `useWaConnect`**

```ts
export function useWaConnect() {
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-instancia', {
        body: { acao: 'conectar', instancia_id: config.id },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao gerar o QR Code');
      if (!data?.qr) {
        console.log('[useWaConnect] sem QR na resposta', {
          instanceName: config.instance_name, alreadyConnected: data?.alreadyConnected,
        });
      }
      return { qr: data?.qr ?? null, alreadyConnected: data?.alreadyConnected === true };
    },
  });
}
```

> O retorno `data` do fluxo antigo **foi removido de propósito**: ele carregava a resposta
> crua da uazapi, com o token dentro. Se alguma tela usar `data`, ajuste-a — não devolva.

- [ ] **Passo 2: trocar `useWaSyncStatus`**

```ts
export function useWaSyncStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-instancia', {
        body: { acao: 'status', instancia_id: config.id },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao consultar o status');
      return { isConnected: data.isConnected, dbStatus: data.dbStatus as WaConfig['status'] };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa_config'] }); },
  });
}
```

> A gravação do `status` no banco saiu do navegador e agora acontece na função. Não
> duplique aqui.

- [ ] **Passo 3: trocar `useWaDisconnect`**

```ts
export function useWaDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const { error } = await supabase.functions.invoke('whatsapp-instancia', {
        body: { acao: 'desconectar', instancia_id: config.id },
      });
      if (error) throw await erroLegivelDaFunction(error, 'Erro ao desconectar');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_config'] });
      toast.success('WhatsApp desconectado');
    },
    onError: (err: any) => { toast.error(err?.message ?? 'Erro ao desconectar'); },
  });
}
```

- [ ] **Passo 4: repetir nos três de `use-admin-whatsapp.ts`**

⚠️ **Este arquivo NÃO importa `erroLegivelDaFunction`** (conferido: os imports dele param
na linha 4). Acrescente antes de mais nada:

```ts
import { erroLegivelDaFunction } from '@/lib/erro-edge-function';
```

Ele **já usa** `supabase.functions.invoke` (linha 14, para `whatsapp-admin-provision`), então
o formato da chamada é o mesmo que ele já pratica.

Feito isso, `useAdminConnect`, `useAdminSyncStatus` e `useAdminDisconnect` seguem
exatamente o mesmo formato dos passos 1 a 3, passando `instancia_id: config.id`.

- [ ] **Passo 5: provar que não sobrou nenhum**

```bash
grep -rn 'instance/connect\|instance/status\|instance/disconnect\|config.api_key' src/
```

Esperado: **nenhuma ocorrência** fora da declaração de tipo. Se sobrar uma, a senha
continua indo para o navegador por aquele caminho.

- [ ] **Passo 6: testar o fluxo de QR de verdade**

Rode `npm run dev`, abra a tela de WhatsApp, gere o QR, confira o status e desconecte.
**Com a aba de rede do navegador aberta:** nenhuma requisição pode sair para
`climb.uazapi.com`, e o token não pode aparecer em resposta nenhuma.

- [ ] **Passo 7: lint, testes, autorização e commit**

```bash
npm run lint 2>&1 | tail -3    # não pode passar de 498
npm run test                    # tem que continuar verde
git add src/hooks/use-whatsapp-inbox.ts src/hooks/use-admin-whatsapp.ts
git commit -m "fix(whatsapp): tela deixa de falar direto com a uazapi"
```

---

## Tarefa 10: Revogar a leitura da senha

**Arquivos:**
- Criar: `supabase/migrations/<ts>_wapi_api_key_fora_do_navegador.sql`

> 🔴 **Só depois da Tarefa 9 estar publicada e o fluxo de QR conferido funcionando.**
> Revogar antes quebra a tela de conexão.

- [ ] **Passo 1: conferir que ninguém mais lê a coluna**

Refaça o `grep` do Passo 5 da Tarefa 9. Se aparecer qualquer uso, **pare**.

- [ ] **Passo 2: escrever a migration**

> ⚠️ **`REVOKE SELECT (api_key)` sozinho NÃO funciona, e parece que funcionou.**
> Medido em 20/08/2026: `anon` e `authenticated` têm `SELECT` na **tabela inteira**, e no
> Postgres a permissão de tabela cobre todas as colunas — revogar uma coluna não a
> derruba. O jeito correto é tirar a permissão da tabela e devolver **coluna a coluna**,
> só as seguras.

```sql
-- api_key e webhook_secret saem do alcance do navegador
--
-- A senha da instância uazapi era legível pelo cliente autenticado, porque o fluxo de
-- QR falava direto com a uazapi a partir da tela. Qualquer funcionário da empresa lia
-- a senha do WhatsApp abrindo as ferramentas do navegador.
--
-- Desde a função whatsapp-instancia, esses fluxos rodam no servidor e o navegador não
-- precisa mais dessas colunas. As Edge Functions seguem lendo: usam service_role, que
-- não é afetada por nada disto.
--
-- O `webhook_secret` entra junto: também é segredo, e estava viajando para o cliente
-- pelo mesmo caminho. Conferido: o frontend só o DECLARA no tipo WaConfig
-- (use-whatsapp-inbox.ts:139) e nunca o usa.
--
-- POR QUE NÃO É "revoke select (api_key)": `anon` e `authenticated` têm SELECT na tabela
-- inteira, e permissão de tabela cobre toda coluna. Revogar só a coluna seria um conserto
-- que não conserta. Tira-se da tabela e devolve-se a lista segura.
--
-- INSERT e UPDATE não são tocados: a tela de Configurações continua podendo GRAVAR a
-- senha que o usuário digita. Ela só deixa de LER de volta.

revoke select on public.configuracoes_wapi from authenticated;
revoke select on public.configuracoes_wapi from anon;

grant select (
  id, empresa_id, instance_url, instance_name, status,
  created_at, updated_at, api_instance_name, provisionada, apelido
) on public.configuracoes_wapi to authenticated;

-- `anon` não recebe nada de volta: ler configuração de WhatsApp exige estar logado.
```

> **Se alguém acrescentar coluna nova a esta tabela**, ela nasce invisível para o
> navegador até entrar nesta lista. É o padrão seguro, mas registre isso em
> `docs/modulos/whatsapp.md` para o próximo não perder uma tarde.

- [ ] **Passo 3: aplicar, conferir o carimbo, renomear o arquivo**

- [ ] **Passo 4: provar**

```sql
select
  has_column_privilege('authenticated','public.configuracoes_wapi','api_key','SELECT')        as le_a_senha,
  has_column_privilege('authenticated','public.configuracoes_wapi','webhook_secret','SELECT') as le_o_segredo,
  has_column_privilege('authenticated','public.configuracoes_wapi','status','SELECT')         as le_o_status,
  has_table_privilege('authenticated','public.configuracoes_wapi','UPDATE')                   as ainda_grava;
```

Esperado: **`le_a_senha = false`, `le_o_segredo = false`, `le_o_status = true`,
`ainda_grava = true`.**

- [ ] **Passo 4-bis: o `select('*')` vira um perigo**

Qualquer consulta que peça `select('*')` nesta tabela passa a **falhar inteira**, não a
devolver menos colunas. Procure e troque pela lista explícita:

```bash
grep -rn "from('configuracoes_wapi')" src/
```

Atenção especial a `useWaConfig` e `useWaSaveConfig` em `src/hooks/use-whatsapp-inbox.ts`:
se o `upsert` terminar com `.select()`, ele tenta ler de volta o que acabou de gravar —
incluindo `api_key` — e passa a dar erro de permissão. Troque por `.select('id, status')`
ou remova o `.select()`.

- [ ] **Passo 5: testar a tela de novo** — conectar, status, desconectar e a tela de
Configurações. Nada pode ter quebrado.

- [ ] **Passo 6: pedir autorização e commitar**

```bash
git add supabase/migrations/<arquivo-renomeado>.sql
git commit -m "fix(whatsapp): senha da instância sai do alcance do navegador"
```

- [ ] **Passo 7: fechar a dívida §1**

Mova para "Resolvidos" em `docs/divida-tecnica.md`, marque a Fase 1 do `SPEC.md`, e
atualize `docs/modulos/whatsapp.md` — que ainda descreve o fluxo de QR como client-side.

---

## O que continua aberto depois de tudo isto

**Trocar a senha da MD.** Ela ficou pública de 08/06 a 20/08/2026. Fechar as portas não
desfaz quem já entrou. A troca exige acesso à conta da uazapi, que ainda não é da Repply
([dívida §2](../divida-tecnica.md#2-titularidade-dos-serviços)), e derruba o WhatsApp até
alguém reler o QR Code.

**Este plano deixa tudo pronto para essa troca ser inofensiva** — depois dele, a senha
nova não vaza em lugar nenhum. Antes dele, vazaria de novo em um dia.
