# Bloco B — Histórico do negócio por blocos de atendimento

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam caixinha (`- [ ]`) para acompanhamento.

**Objetivo:** o histórico do negócio passa a mostrar **cada atendimento**, e não uma linha por conversa inteira — e passa a incluir e-mail, do cliente e de todos os contatos dele, dentro da janela do negócio.

**Arquitetura:** a regra de "onde um atendimento termina e o próximo começa" vira um módulo puro (`src/lib/blocos-de-atendimento.ts`), sem React e sem banco, testável sozinho. O WhatsApp corta no "fechou a conversa"; o e-mail corta no assunto, que o provedor já entrega amarrado (`nylas_thread_id`) e por isso é resolvido por uma função no banco. Um hook junta os dois e um componente desenha.

**Tecnologias:** React 18 + TypeScript, TanStack Query, Postgres/PostgREST, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-email-e-whatsapp-design.md`

## Restrições globais

- 🔴 **Nunca `git add -A`** (CLAUDE.md §13). Use `git commit --only -m "…" -- <caminhos>`.
- 🔴 **Antes de CADA commit:** `git fetch origin` e `git status --short`. As sessões não compartilham o mesmo ponteiro — outra pode ter enviado sem que o seu HEAD ande (CLAUDE.md §13). Arquivo que não é seu na fila: pare e avise.
- 🔴 **`git push` PUBLICA em produção** (CLAUDE.md §16).
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **A função nova do banco é `SECURITY INVOKER`** (o padrão). Um `SECURITY DEFINER` aqui vazaria a caixa de e-mail para quem não foi liberado nela — é a decisão 4 do dono do produto, e é a mesma razão pela qual `email_contagem_por_marcador` é invoker (ver o comentário na migration `20260806190000`).
- **Teto de 10 blocos** no painel, com "ver todas" — decisão do dono do produto. Existe porque há uma conversa na MD com **150 fechamentos**.
- Texto visível ao usuário em **pt-BR**, sem jargão.
- Verificação: `npm run test` (linha de base **1.140**), `npx tsc --noEmit -p tsconfig.app.json` (~31 erros pré-existentes), `npm run lint` (433), `npm run build`.

## O que foi medido

| fato | número |
|---|---|
| Fechamentos de conversa na MD | **4.168**, em 757 das 764 conversas |
| Média de fechamentos por conversa | 5,5 (pior caso **150**) |
| Desde quando o recurso de fechar existe | **20/07/2026** — antes disso não há nenhum |
| Clientes com e-mail cadastrado | 1.948 de 2.173 |
| Contatos com e-mail cadastrado | 902 de 1.096 |

⚠️ **Para testar:** a caixa da MD tem 3.577 mensagens, mas só **96 visíveis** — as demais estão escondidas por um gatilho temporário (`trg_email_esconde_antigo_md`) enquanto o cliente valida a seção. Teste o e-mail com a empresa **Repply** (conta de demonstração) ou depois que o gatilho for retirado.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `src/lib/blocos-de-atendimento.ts` (criar) | a regra do corte, pura |
| `src/lib/blocos-de-atendimento.test.ts` (criar) | testes da regra |
| `supabase/migrations/20260910120000_email_do_negocio.sql` (criar) | a função que casa e-mail com cliente e agrupa por assunto |
| `src/hooks/use-blocos-do-negocio.ts` (criar) | busca os dois lados e devolve a lista pronta |
| `src/components/pedidos/BlocosDeAtendimento.tsx` (criar) | desenha as linhas, com o teto de 10 |
| `src/components/pedidos/HistoricoDoNegocio.tsx` (modificar) | troca o resumo por conversa pelos blocos |
| `src/pages/WhatsAppInbox.tsx:8060` (modificar) | reabrir passa a gravar nota |

---

### Tarefa 1: a regra do corte

**Arquivos:**
- Criar: `src/lib/blocos-de-atendimento.ts`
- Teste: `src/lib/blocos-de-atendimento.test.ts`

**Interfaces:**
- Consome: nada.
- Produz:

```ts
export interface MensagemParaBloco {
  id: string;
  created_at: string;
  conteudo: string | null;
  is_nota_interna: boolean;
}
export interface BlocoDeAtendimento {
  primeiraMensagemId: string;
  inicioEm: string;
  fimEm: string;
  mensagens: number;
  atendentes: string[];
  fechado: boolean;
}
export function blocosDeAtendimento(mensagens: MensagemParaBloco[]): BlocoDeAtendimento[];
export function blocosNaJanela(blocos: BlocoDeAtendimento[], de: string, ate: string): BlocoDeAtendimento[];
```

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/blocos-de-atendimento.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { blocosDeAtendimento, blocosNaJanela } from './blocos-de-atendimento';

const msg = (id: string, created_at: string, conteudo = 'oi') => ({
  id, created_at, conteudo, is_nota_interna: false,
});
const nota = (id: string, created_at: string, conteudo: string) => ({
  id, created_at, conteudo, is_nota_interna: true,
});

describe('blocosDeAtendimento', () => {
  it('conversa sem fechamento nenhum é um bloco só', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      msg('m2', '2026-08-05T10:00:00Z'),
      msg('m3', '2026-08-20T10:00:00Z'),
    ]);
    expect(b).toHaveLength(1);
    expect(b[0].primeiraMensagemId).toBe('m1');
    expect(b[0].mensagens).toBe(3);
    expect(b[0].fechado).toBe(false);
  });

  it('o fechamento corta, e a mensagem seguinte abre o próximo', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      msg('m2', '2026-08-01T11:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Ana Souza fechou a conversa'),
      msg('m3', '2026-08-10T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
    expect(b[0].primeiraMensagemId).toBe('m1');
    expect(b[0].mensagens).toBe(2);
    expect(b[0].fechado).toBe(true);
    expect(b[0].fimEm).toBe('2026-08-01T12:00:00Z');
    expect(b[1].primeiraMensagemId).toBe('m3');
    expect(b[1].fechado).toBe(false);
  });

  it('reconhece o fechamento que também remove responsáveis', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z',
        'Bruno Reis fechou a conversa e removeu Bruno Reis dos responsáveis'),
      msg('m2', '2026-08-02T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
  });

  it('guarda quem assumiu o atendimento', () => {
    const b = blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Ana Souza assumiu esta conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Ana Souza fechou a conversa'),
    ]);
    expect(b[0].atendentes).toEqual(['Ana Souza']);
  });

  it('não repete o mesmo atendente', () => {
    const b = blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Ana Souza assumiu esta conversa'),
      nota('n1', '2026-08-01T09:30:00Z', 'Ana Souza assumiu esta conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
    ]);
    expect(b[0].atendentes).toEqual(['Ana Souza']);
  });

  it('dois fechamentos seguidos, sem mensagem no meio, não criam bloco vazio', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Ana Souza fechou a conversa'),
      nota('n2', '2026-08-01T13:00:00Z', 'Carla Nunes fechou a conversa'),
    ]);
    expect(b).toHaveLength(1);
  });

  it('nota nunca conta como mensagem', () => {
    const b = blocosDeAtendimento([
      nota('n0', '2026-08-01T09:00:00Z', 'Ana Souza assumiu esta conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
    ]);
    expect(b[0].mensagens).toBe(1);
    expect(b[0].primeiraMensagemId).toBe('m1');
  });

  it('ordena mesmo se vier fora de ordem', () => {
    const b = blocosDeAtendimento([
      msg('m2', '2026-08-10T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Ana Souza fechou a conversa'),
      msg('m1', '2026-08-01T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
    expect(b[0].primeiraMensagemId).toBe('m1');
  });

  it('lista vazia devolve lista vazia', () => {
    expect(blocosDeAtendimento([])).toEqual([]);
  });
});

describe('blocosNaJanela', () => {
  const blocos = blocosDeAtendimento([
    msg('m1', '2026-05-01T10:00:00Z'),
    nota('n1', '2026-05-02T10:00:00Z', 'Ana Souza fechou a conversa'),
    msg('m2', '2026-07-01T10:00:00Z'),
    nota('n2', '2026-07-02T10:00:00Z', 'Ana Souza fechou a conversa'),
    msg('m3', '2026-09-01T10:00:00Z'),
  ]);

  it('entra o bloco cujo INÍCIO cai na janela', () => {
    const r = blocosNaJanela(blocos, '2026-06-01T00:00:00Z', '2026-08-01T00:00:00Z');
    expect(r.map((b) => b.primeiraMensagemId)).toEqual(['m2']);
  });

  it('janela que cobre tudo devolve tudo', () => {
    const r = blocosNaJanela(blocos, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
    expect(r).toHaveLength(3);
  });

  it('janela sem nada devolve vazio', () => {
    expect(blocosNaJanela(blocos, '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z')).toEqual([]);
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
npx vitest run src/lib/blocos-de-atendimento.test.ts
```

Esperado: FALHA com `Failed to resolve import "./blocos-de-atendimento"`.

- [ ] **Passo 3: escrever o módulo**

Crie `src/lib/blocos-de-atendimento.ts`:

```ts
/**
 * Onde um atendimento termina e o próximo começa, numa conversa de WhatsApp.
 *
 * 🔴 A REGRA É DO DONO DO PRODUTO, e não uma heurística: "abrir" e "fechar"
 * conversa é um conceito que o Repply criou, e a equipe usa de propósito. São
 * 4.168 fechamentos na MD, presentes em 757 das 764 conversas.
 *
 * O corte é o fechamento — e só ele. Nada de silêncio: um corte por tempo seria
 * inventado por nós, e a operação já produz um marco melhor.
 *
 * Duas consequências aceitas de olhos abertos:
 *
 * - Conversa SEM fechamento nenhum vira um bloco só, que é exatamente o que a
 *   tela mostrava antes desta mudança. Como o recurso de fechar só existe desde
 *   20/07/2026, todo o histórico anterior degrada sozinho — sem código de
 *   transição e sem tela vazia.
 * - A nota é texto livre, escrita em `WhatsAppInbox` ("Fulana fechou a conversa
 *   e removeu … dos responsáveis"). Casar por texto é frágil de propósito
 *   assumido: não existe campo estruturado hoje, e inventar um exigiria migrar
 *   4.168 linhas já escritas. Se um dia a frase mudar, os testes aqui quebram
 *   antes de o usuário perceber — que é o ponto de eles existirem.
 */

const FECHOU = /\bfechou a conversa\b/i;
const ASSUMIU = /^(.+?)\s+assumiu esta conversa\b/i;

export interface MensagemParaBloco {
  id: string;
  created_at: string;
  conteudo: string | null;
  is_nota_interna: boolean;
}

export interface BlocoDeAtendimento {
  /** A primeira mensagem de verdade do bloco — é para onde a linha aponta. */
  primeiraMensagemId: string;
  inicioEm: string;
  /** Fim: o fechamento, ou a última mensagem quando o bloco segue aberto. */
  fimEm: string;
  /** Quantas mensagens de verdade. Nota interna não conta. */
  mensagens: number;
  /** Quem assumiu o atendimento neste bloco, na ordem em que assumiu. */
  atendentes: string[];
  fechado: boolean;
}

interface EmMontagem {
  primeiraMensagemId: string | null;
  inicioEm: string | null;
  fimEm: string | null;
  mensagens: number;
  atendentes: string[];
  fechado: boolean;
}

function novo(): EmMontagem {
  return {
    primeiraMensagemId: null, inicioEm: null, fimEm: null,
    mensagens: 0, atendentes: [], fechado: false,
  };
}

/** Um bloco só existe se teve mensagem de verdade — fechamento sozinho não é atendimento. */
function fechar(atual: EmMontagem, saida: BlocoDeAtendimento[]) {
  if (!atual.primeiraMensagemId || !atual.inicioEm) return;
  saida.push({
    primeiraMensagemId: atual.primeiraMensagemId,
    inicioEm: atual.inicioEm,
    fimEm: atual.fimEm ?? atual.inicioEm,
    mensagens: atual.mensagens,
    atendentes: atual.atendentes,
    fechado: atual.fechado,
  });
}

export function blocosDeAtendimento(
  mensagens: MensagemParaBloco[],
): BlocoDeAtendimento[] {
  if (!mensagens?.length) return [];

  // A ordem cronológica é o eixo da regra inteira. O chamador pode entregar
  // fora de ordem (o realtime insere no começo da lista, por exemplo).
  const emOrdem = [...mensagens].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const blocos: BlocoDeAtendimento[] = [];
  let atual = novo();

  for (const m of emOrdem) {
    if (m.is_nota_interna) {
      const texto = m.conteudo ?? '';

      if (FECHOU.test(texto)) {
        // Fechamento sem mensagem nenhuma no bloco não cria bloco vazio:
        // `fechar` descarta, e o estado é reiniciado do mesmo jeito.
        atual.fechado = true;
        atual.fimEm = m.created_at;
        fechar(atual, blocos);
        atual = novo();
        continue;
      }

      const assumiu = texto.match(ASSUMIU);
      if (assumiu) {
        const nome = assumiu[1].trim();
        if (nome && !atual.atendentes.includes(nome)) atual.atendentes.push(nome);
      }
      // Qualquer outra nota (direcionou, adicionou, saiu) não move o corte.
      continue;
    }

    if (!atual.primeiraMensagemId) {
      atual.primeiraMensagemId = m.id;
      atual.inicioEm = m.created_at;
    }
    atual.mensagens += 1;
    atual.fimEm = m.created_at;
  }

  fechar(atual, blocos);
  return blocos;
}

/**
 * Os blocos que pertencem a um negócio.
 *
 * O critério é o INÍCIO do bloco, não a sobreposição: um atendimento que começou
 * antes do negócio existir não é daquele negócio, mesmo que tenha se arrastado
 * para dentro da janela.
 */
export function blocosNaJanela(
  blocos: BlocoDeAtendimento[],
  de: string,
  ate: string,
): BlocoDeAtendimento[] {
  return blocos.filter((b) => b.inicioEm >= de && b.inicioEm <= ate);
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/blocos-de-atendimento.test.ts
```

Esperado: **12 passando**.

- [ ] **Passo 5: conferir a regra contra a produção**

Antes de seguir, confirme que o casamento por texto pega os 4.168 fechamentos reais:

```sql
select count(*) filter (where conteudo ~* 'fechou a conversa')  as casam_fechou,
       count(*) filter (where conteudo ~* '^(.+?)\s+assumiu esta conversa') as casam_assumiu,
       count(*) as notas_totais
from whatsapp_mensagens
where is_nota_interna = true
  and empresa_id = '00000000-0000-4000-8000-000000000001';
```

Esperado: `casam_fechou` próximo de **4.168**. Se vier bem abaixo, existe uma variante de frase que o módulo não conhece — acrescente um teste com ela antes de mudar o código.

- [ ] **Passo 6: commitar**

```bash
git commit --only -m "feat(negocios): a regra do bloco de atendimento vira modulo testavel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/blocos-de-atendimento.ts src/lib/blocos-de-atendimento.test.ts
```

---

### Tarefa 2: reabrir conversa passa a deixar rastro

**Arquivos:**
- Modificar: `src/pages/WhatsAppInbox.tsx:8054-8078`

**Interfaces:** nenhuma.

**O que isto é, com precisão:** hoje o botão grava nota ao **fechar** e nada ao **reabrir** — o `addNota` está dentro de `if (novaArquivada)`. Na linha do tempo da conversa, reabrir não aparece.

Isto **não** é pré-requisito do módulo da Tarefa 1: o algoritmo abre bloco novo na primeira mensagem depois do fechamento, com ou sem nota de reabertura. É um conserto de completude da linha do tempo, aprovado pelo dono do produto junto com este bloco — e é pequeno.

- [ ] **Passo 1: gravar a nota nos dois sentidos**

Substitua o `if (novaArquivada) { … }` das linhas 8060-8077 por:

```tsx
                        const autor = profile?.nome ?? "Alguém";
                        if (novaArquivada) {
                          // Fechar remove todos os responsáveis (gatilho no
                          // banco); registra quem estava no atendimento.
                          const responsaveisAtuais = conversaAtiva.responsaveis ?? [];
                          const texto =
                            responsaveisAtuais.length > 0
                              ? `${autor} fechou a conversa e removeu ${responsaveisAtuais
                                  .map((r) => r.nome)
                                  .join(", ")} dos responsáveis`
                              : `${autor} fechou a conversa`;
                          addNota.mutate({ conversaId: conversaAtiva.id, texto });
                        } else {
                          // Sem esta nota, reabrir não aparecia em lugar nenhum:
                          // a linha do tempo pulava do fechamento direto para a
                          // mensagem seguinte, sem dizer que alguém reabriu.
                          addNota.mutate({
                            conversaId: conversaAtiva.id,
                            texto: `${autor} reabriu a conversa`,
                          });
                        }
```

- [ ] **Passo 2: garantir que a nota nova não confunde o módulo de blocos**

"reabriu a conversa" **não** casa com `/\bfechou a conversa\b/i` nem com `assumiu esta conversa`. Acrescente um teste em `src/lib/blocos-de-atendimento.test.ts` que fixa isso:

```ts
  it('a nota de reabertura não corta nem vira atendente', () => {
    const b = blocosDeAtendimento([
      msg('m1', '2026-08-01T10:00:00Z'),
      nota('n1', '2026-08-01T12:00:00Z', 'Ana Souza fechou a conversa'),
      nota('n2', '2026-08-02T09:00:00Z', 'Ana Souza reabriu a conversa'),
      msg('m2', '2026-08-02T10:00:00Z'),
    ]);
    expect(b).toHaveLength(2);
    expect(b[1].primeiraMensagemId).toBe('m2');
    expect(b[1].atendentes).toEqual([]);
  });
```

- [ ] **Passo 3: rodar, conferir no navegador e commitar**

```bash
npx vitest run src/lib/blocos-de-atendimento.test.ts
```

Esperado: **13 passando**.

No navegador: feche uma conversa e reabra; as duas notas devem aparecer na linha do tempo.

```bash
git commit --only -m "fix(whatsapp): reabrir conversa passa a deixar rastro na linha do tempo

O addNota estava dentro do if de fechar: reabrir nao aparecia em lugar nenhum.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/pages/WhatsAppInbox.tsx src/lib/blocos-de-atendimento.test.ts
```

---

### Tarefa 3: a função que acha o e-mail do negócio

**Arquivos:**
- Criar: `supabase/migrations/20260910120000_email_do_negocio.sql`

**Interfaces:**
- Produz a RPC `email_do_negocio(p_cliente_id uuid, p_de timestamptz, p_ate timestamptz)`, que devolve uma linha por assunto:

```
thread_id text, assunto text, primeira_em timestamptz, ultima_em timestamptz,
mensagens bigint, primeira_mensagem_id uuid, com_quem text
```

**Por que no banco e não no navegador:** o casamento é por endereço, e os endereços estão em duas tabelas (`clientes.email` e `contatos.email`) enquanto os destinatários vivem dentro de `jsonb`. Montar isso como filtro de URL exigiria uma condição `or=` com um `cs.[{"email":…}]` por endereço — ilegível e frágil no escape. E o agrupamento por assunto ficaria no cliente, obrigando a trazer todas as mensagens só para contá-las.

- [ ] **Passo 1: escrever a migration**

Crie `supabase/migrations/20260910120000_email_do_negocio.sql`:

```sql
-- Os e-mails que pertencem a um negócio, agrupados por assunto.
--
-- 🔴 SECURITY INVOKER (o padrão) DE PROPÓSITO. A RLS de email_mensagens continua
-- valendo dentro da função, então quem não foi liberado na caixa não recebe
-- linha nenhuma — nem a existência da troca. É a decisão do dono do produto de
-- 09/09/2026, e a mesma razão pela qual email_contagem_por_marcador é invoker:
-- um SECURITY DEFINER aqui abriria por uma porta lateral exatamente o que a
-- seção de E-mails fecha pela porta da frente.
--
-- O bloco é o ASSUNTO (nylas_thread_id), e não um corte de tempo: no e-mail
-- "aberta e fechada" é literalmente a thread, que o provedor já entrega
-- amarrada. Mensagem sem thread (raro) vira um bloco de uma linha só, via
-- coalesce com o id da própria mensagem.
--
-- O endereço casa em três lugares — remetente, destinatários e cópia. O exemplo
-- do dono do produto pede os dois lados: a construtora E o contato dela.
CREATE OR REPLACE FUNCTION public.email_do_negocio(
  p_cliente_id uuid,
  p_de         timestamptz,
  p_ate        timestamptz
)
RETURNS TABLE (
  thread_id            text,
  assunto              text,
  primeira_em          timestamptz,
  ultima_em            timestamptz,
  mensagens            bigint,
  primeira_mensagem_id uuid,
  com_quem             text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH enderecos AS (
    SELECT lower(trim(c.email)) AS email
      FROM public.clientes c
     WHERE c.id = p_cliente_id
       AND coalesce(trim(c.email), '') <> ''
    UNION
    SELECT lower(trim(ct.email))
      FROM public.contatos ct
     WHERE ct.cliente_id = p_cliente_id
       AND coalesce(trim(ct.email), '') <> ''
  ),
  msgs AS (
    SELECT m.id, m.data_mensagem, m.assunto, m.nylas_thread_id,
           m.nylas_message_id, m.remetente_email, m.remetente_nome
      FROM public.email_mensagens m
     WHERE m.excluido = false
       AND m.data_mensagem >= p_de
       AND m.data_mensagem <= p_ate
       AND (
            lower(m.remetente_email) IN (SELECT email FROM enderecos)
         OR EXISTS (
              SELECT 1
                FROM jsonb_array_elements(coalesce(m.destinatarios, '[]'::jsonb)) d
               WHERE lower(d->>'email') IN (SELECT email FROM enderecos)
            )
         OR EXISTS (
              SELECT 1
                FROM jsonb_array_elements(coalesce(m.cc, '[]'::jsonb)) d
               WHERE lower(d->>'email') IN (SELECT email FROM enderecos)
            )
       )
  )
  SELECT coalesce(nylas_thread_id, nylas_message_id)                    AS thread_id,
         (array_agg(assunto ORDER BY data_mensagem))[1]                 AS assunto,
         min(data_mensagem)                                             AS primeira_em,
         max(data_mensagem)                                             AS ultima_em,
         count(*)                                                       AS mensagens,
         (array_agg(id ORDER BY data_mensagem))[1]                      AS primeira_mensagem_id,
         (array_agg(coalesce(remetente_nome, remetente_email)
                    ORDER BY data_mensagem))[1]                         AS com_quem
    FROM msgs
   GROUP BY coalesce(nylas_thread_id, nylas_message_id)
   ORDER BY min(data_mensagem) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.email_do_negocio(uuid, timestamptz, timestamptz) TO authenticated;
```

- [ ] **Passo 2: aplicar**

🔴 É DDL em produção. Criar função é aditivo (não altera nem apaga nada), mas avise o dono do produto antes.

```bash
npx supabase db push --project-ref hukeirrmsoiowvvrhivx
```

- [ ] **Passo 3: conferir contra dados de verdade**

```sql
-- Um cliente que tenha e-mail e contatos com e-mail.
select id, nome, email from clientes
where coalesce(trim(email),'') <> ''
  and exists (select 1 from contatos ct where ct.cliente_id = clientes.id
              and coalesce(trim(ct.email),'') <> '')
limit 5;
```

Depois, com um dos ids:

```sql
select * from email_do_negocio('<id>', '2024-01-01'::timestamptz, now());
```

Esperado: uma linha por assunto, `mensagens >= 1`, `primeira_em <= ultima_em`, e nenhum duplicado de `thread_id`.

⚠️ Rodando como `service_role` (é o caso do editor do Supabase) a RLS não se aplica, então isto mede o **casamento**, não a visibilidade. A visibilidade é conferida no navegador, na Tarefa 5.

- [ ] **Passo 4: commitar**

```bash
git commit --only -m "feat(negocios): funcao que acha os e-mails do negocio, agrupados por assunto

Casa o endereco do cliente e o de todos os contatos dele contra remetente,
destinatarios e copia. SECURITY INVOKER: quem nao tem acesso a caixa nao recebe
linha nenhuma.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/migrations/20260910120000_email_do_negocio.sql
```

---

### Tarefa 4: o hook que junta os dois lados

**Arquivos:**
- Criar: `src/hooks/use-blocos-do-negocio.ts`

**Interfaces:**
- Consome: `blocosDeAtendimento`, `blocosNaJanela` (Tarefa 1); a RPC `email_do_negocio` (Tarefa 3); `useContatosDoCliente` (já existe em `@/hooks/use-obra-contatos`).
- Produz:

```ts
export interface LinhaDoHistorico {
  chave: string;
  canal: 'whatsapp' | 'email';
  titulo: string;
  inicioEm: string;
  fimEm: string;
  mensagens: number;
  detalhe: string;
  /** Para onde levar ao clicar. */
  destino: { tipo: 'whatsapp'; conversaId: string; mensagemId: string }
         | { tipo: 'email'; mensagemId: string };
}
export function useBlocosDoNegocio(p: {
  clienteId?: string | null;
  empresaNome?: string | null;
  criadoEm?: string | null;
  fechadoEm?: string | null;
}): { linhas: LinhaDoHistorico[]; carregando: boolean };
```

- [ ] **Passo 1: escrever o hook**

Crie `src/hooks/use-blocos-do-negocio.ts`:

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useContatosDoCliente } from '@/hooks/use-obra-contatos';
import { useSecaoLigada } from '@/hooks/use-secoes';
import {
  blocosDeAtendimento, blocosNaJanela, type MensagemParaBloco,
} from '@/lib/blocos-de-atendimento';

export interface LinhaDoHistorico {
  chave: string;
  canal: 'whatsapp' | 'email';
  titulo: string;
  inicioEm: string;
  fimEm: string;
  mensagens: number;
  detalhe: string;
  destino:
    | { tipo: 'whatsapp'; conversaId: string; mensagemId: string }
    | { tipo: 'email'; mensagemId: string };
}

/**
 * O histórico de um negócio: cada atendimento de WhatsApp e cada assunto de
 * e-mail que COMEÇOU dentro da janela do negócio.
 *
 * A janela vai da criação até o fechamento; negócio em aberto vai até agora.
 * O critério é o INÍCIO do bloco — um atendimento que começou antes de o
 * negócio existir não é dele, mesmo que tenha se arrastado para dentro.
 */
export function useBlocosDoNegocio({
  clienteId, empresaNome, criadoEm, fechadoEm,
}: {
  clienteId?: string | null;
  empresaNome?: string | null;
  criadoEm?: string | null;
  fechadoEm?: string | null;
}) {
  const { ligada: temWhatsapp } = useSecaoLigada('whatsapp');
  const { ligada: temEmail } = useSecaoLigada('email');
  const { data: contatos = [] } = useContatosDoCliente(clienteId, empresaNome);

  const de = criadoEm ?? null;
  const ate = fechadoEm ?? new Date().toISOString();

  // --- WhatsApp -----------------------------------------------------------
  const telefones = useMemo(
    () => contatos.map((c) => c.telefone).filter(Boolean) as string[],
    [contatos],
  );

  const wa = useQuery({
    queryKey: ['blocos_wa_do_negocio', clienteId, de, ate, telefones],
    queryFn: async () => {
      const { data: conversas } = await supabase
        .from('whatsapp_conversas')
        .select('id, nome_contato, telefone')
        .in('telefone', telefones);

      const ids = (conversas ?? []).map((c) => c.id);
      if (ids.length === 0) return [] as LinhaDoHistorico[];

      // A nota interna VEM JUNTO de propósito: é ela que marca o corte.
      const { data: mensagens } = await supabase
        .from('whatsapp_mensagens')
        .select('id, conversa_id, created_at, conteudo, is_nota_interna')
        .in('conversa_id', ids)
        .order('created_at', { ascending: true });

      const porConversa = new Map<string, MensagemParaBloco[]>();
      for (const m of mensagens ?? []) {
        const lista = porConversa.get(m.conversa_id) ?? [];
        lista.push(m as MensagemParaBloco);
        porConversa.set(m.conversa_id, lista);
      }

      const linhas: LinhaDoHistorico[] = [];
      for (const conv of conversas ?? []) {
        const blocos = blocosNaJanela(
          blocosDeAtendimento(porConversa.get(conv.id) ?? []),
          de!, ate,
        );
        for (const b of blocos) {
          linhas.push({
            chave: `wa-${conv.id}-${b.primeiraMensagemId}`,
            canal: 'whatsapp',
            titulo: conv.nome_contato ?? conv.telefone,
            inicioEm: b.inicioEm,
            fimEm: b.fimEm,
            mensagens: b.mensagens,
            detalhe: b.atendentes.length
              ? `${b.mensagens} mensagens · ${b.atendentes.join(', ')}`
              : `${b.mensagens} mensagens`,
            destino: { tipo: 'whatsapp', conversaId: conv.id, mensagemId: b.primeiraMensagemId },
          });
        }
      }
      return linhas;
    },
    enabled: !!clienteId && !!de && temWhatsapp !== false && telefones.length > 0,
    staleTime: 60_000,
  });

  // --- E-mail -------------------------------------------------------------
  // A RLS decide sozinha: quem não tem acesso à caixa recebe zero linhas.
  const email = useQuery({
    queryKey: ['blocos_email_do_negocio', clienteId, de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('email_do_negocio', {
        p_cliente_id: clienteId!,
        p_de: de!,
        p_ate: ate,
      });
      if (error) {
        console.warn('[negocio] não consegui ler os e-mails:', error.message);
        return [] as LinhaDoHistorico[];
      }
      return (data ?? []).map((r: {
        thread_id: string; assunto: string | null;
        primeira_em: string; ultima_em: string;
        mensagens: number; primeira_mensagem_id: string; com_quem: string | null;
      }): LinhaDoHistorico => ({
        chave: `email-${r.thread_id}`,
        canal: 'email',
        titulo: r.assunto || '(sem assunto)',
        inicioEm: r.primeira_em,
        fimEm: r.ultima_em,
        mensagens: Number(r.mensagens),
        detalhe: r.com_quem
          ? `${r.mensagens} mensagens · ${r.com_quem}`
          : `${r.mensagens} mensagens`,
        destino: { tipo: 'email', mensagemId: r.primeira_mensagem_id },
      }));
    },
    enabled: !!clienteId && !!de && temEmail !== false,
    staleTime: 60_000,
  });

  const linhas = useMemo(() => {
    return [...(wa.data ?? []), ...(email.data ?? [])].sort((a, b) =>
      b.inicioEm.localeCompare(a.inicioEm),
    );
  }, [wa.data, email.data]);

  return { linhas, carregando: wa.isLoading || email.isLoading };
}
```

- [ ] **Passo 2: conferir o nome da seção de e-mail**

`useSecaoLigada('email')` precisa da chave que o projeto usa. Confirme:

```bash
grep -rn "useSecaoLigada(" src/ | grep -i mail
```

Se a chave for outra (por exemplo `'emails'`), use a que aparecer. Se a seção de e-mail não for controlável, remova o `temEmail` e o `enabled` correspondente.

- [ ] **Passo 3: verificar e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
npm run test 2>&1 | tail -5
```

```bash
git commit --only -m "feat(negocios): hook que junta os blocos de whatsapp e os assuntos de e-mail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/hooks/use-blocos-do-negocio.ts
```

---

### Tarefa 5: as linhas na tela

**Arquivos:**
- Criar: `src/components/pedidos/BlocosDeAtendimento.tsx`
- Modificar: `src/components/pedidos/HistoricoDoNegocio.tsx`

**Interfaces:**
- Consome: `useBlocosDoNegocio` (Tarefa 4).
- Produz: `<BlocosDeAtendimento clienteId empresaNome criadoEm fechadoEm />`.

- [ ] **Passo 1: o componente**

Crie `src/components/pedidos/BlocosDeAtendimento.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBlocosDoNegocio } from '@/hooks/use-blocos-do-negocio';

/**
 * O teto existe por um caso real: há uma conversa na MD com 150 fechamentos.
 * Sem ele, um extremo empurra comentários, visitas e ligações para fora da tela.
 */
const MOSTRAR_NO_MAXIMO = 10;

function periodo(inicio: string, fim: string): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  const a = f(inicio);
  const b = f(fim);
  return a === b ? a : `${a} a ${b}`;
}

export function BlocosDeAtendimento(props: {
  clienteId?: string | null;
  empresaNome?: string | null;
  criadoEm?: string | null;
  fechadoEm?: string | null;
}) {
  const navigate = useNavigate();
  const [verTodas, setVerTodas] = useState(false);
  const { linhas, carregando } = useBlocosDoNegocio(props);

  // Silêncio quando não houve nada: este bloco é sobre o que ACONTECEU, e
  // "não conversamos" não é um acontecimento.
  if (carregando || linhas.length === 0) return null;

  const visiveis = verTodas ? linhas : linhas.slice(0, MOSTRAR_NO_MAXIMO);
  const restantes = linhas.length - visiveis.length;

  return (
    <div className="space-y-1.5">
      {visiveis.map((l) => {
        const Icone = l.canal === 'email' ? Mail : MessageSquare;
        return (
          <button
            key={l.chave}
            type="button"
            onClick={() =>
              l.destino.tipo === 'whatsapp'
                ? navigate(
                    `/whatsapp?conversaId=${encodeURIComponent(l.destino.conversaId)}` +
                      `&mensagemId=${encodeURIComponent(l.destino.mensagemId)}`,
                  )
                : navigate(`/emails?mensagemId=${encodeURIComponent(l.destino.mensagemId)}`)
            }
            className="flex w-full gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60"
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icone className="h-3 w-3 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-card-foreground">{l.titulo}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {periodo(l.inicioEm, l.fimEm)} · {l.detalhe}
              </p>
            </div>
          </button>
        );
      })}

      {restantes > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-xs text-muted-foreground"
          onClick={() => setVerTodas(true)}
        >
          Ver todas ({restantes} a mais)
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: trocar no histórico**

Em `src/components/pedidos/HistoricoDoNegocio.tsx`:

1. Acrescente `criadoEm` e `fechadoEm` às props (o painel do negócio já tem o pedido em mãos; passe `pedido.created_at` e `pedido.fechado_em`).
2. Remova o bloco `{temWhatsapp !== false && contatos.length > 0 && (…<ResumoDaConversa …/>…)}` e o componente `ResumoDaConversa` inteiro, junto com as importações que ficarem órfãs (`useConversaDoContato`, `useContagemDeMensagens`, `useSecaoLigada`, `useContatosDoCliente`).
3. Ponha no lugar:

```tsx
      <BlocosDeAtendimento
        clienteId={clienteId}
        empresaNome={empresaNome}
        criadoEm={criadoEm}
        fechadoEm={fechadoEm}
      />
```

4. Atualize o texto de vazio, que hoje fala só de anotação manual:

```tsx
        <p className="text-sm text-muted-foreground">
          Nenhuma conversa, e-mail, visita ou ligação neste negócio.
        </p>
```

  — e só mostre esse texto quando **não houver nada dos dois lados**, não apenas quando `registros` estiver vazio.

- [ ] **Passo 3: ajustar quem chama**

```bash
grep -rn "<HistoricoDoNegocio" src/
```

Passe `criadoEm` e `fechadoEm` em cada ponto encontrado.

- [ ] **Passo 4: verificar**

```bash
npm run test 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
npm run lint 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

- [ ] **Passo 5: conferir no navegador**

1. Abrir um negócio de um cliente com conversa de WhatsApp: aparecem **várias** linhas, uma por atendimento, e não uma só.
2. Clicar numa linha leva à conversa **na mensagem que abriu aquele bloco**.
3. Um negócio de cliente sem conversa nenhuma não mostra o bloco.
4. Entrar com um usuário **sem acesso à caixa de e-mail** e confirmar que **nenhuma linha de e-mail** aparece — esta é a decisão 4, e é o teste que a prova.
5. Entrar com um gestor e confirmar que as linhas de e-mail aparecem.

⚠️ Para o item 5, use a empresa **Repply**: a caixa da MD está com o gatilho temporário escondendo quase tudo.

- [ ] **Passo 6: commitar**

```bash
git commit --only -m "feat(negocios): o historico passa a mostrar cada atendimento, e inclui e-mail

Uma linha por conversa inteira virava um resumo que nao dizia quando cada
atendimento aconteceu. Agora o corte e o fechamento da conversa, que a equipe
ja marca de proposito (4.168 vezes na MD), e o e-mail entra agrupado por
assunto — do cliente e de todos os contatos dele.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/pedidos/BlocosDeAtendimento.tsx src/components/pedidos/HistoricoDoNegocio.tsx
```

---

### Tarefa 6: abrir na mensagem certa

**Arquivos:**
- Modificar: `src/pages/WhatsAppInbox.tsx`
- Modificar: `src/pages/Emails.tsx`

**Interfaces:** consome os parâmetros `mensagemId` da Tarefa 5.

**Por que separado:** a Tarefa 5 já entrega valor sem isto — a linha leva à conversa certa, só não posicionada. Esta tarefa é o acabamento, e pode ser rejeitada sozinha.

- [ ] **Passo 1: o WhatsApp posiciona na mensagem**

`WhatsAppInbox` já sabe rolar até uma mensagem e destacá-la: a função `irParaMensagem(id)` (perto da linha 4787). Falta ler o parâmetro da URL. Junto do efeito que já trata `conversaId`, acrescente:

```ts
  // Vindo do histórico do negócio: além da conversa, a mensagem que abriu
  // aquele atendimento. Espera as mensagens chegarem — rolar antes de a lista
  // existir não acha o elemento.
  useEffect(() => {
    const alvo = searchParams.get('mensagemId');
    if (!alvo || !mensagens?.length) return;
    if (!mensagens.some((m) => m.id === alvo)) return;
    irParaMensagem(alvo);
    // Consome o parâmetro: sem isto, qualquer re-render rola de novo e prende
    // a pessoa naquela mensagem.
    const p = new URLSearchParams(searchParams);
    p.delete('mensagemId');
    setSearchParams(p, { replace: true });
  }, [searchParams, mensagens]);
```

- [ ] **Passo 2: o e-mail abre a mensagem**

Em `Emails.tsx`, acrescente um efeito que lê `mensagemId` e abre o leitor naquela mensagem, usando o mesmo caminho que o clique na lista já usa. Localize-o com:

```bash
grep -n "setEmailSelecionado\|LeitorEmail\|abrirEmail" src/pages/Emails.tsx | head
```

Se a mensagem não estiver na página atual da lista, busque-a pelo id antes de abrir — o histórico pode apontar para um e-mail de meses atrás.

- [ ] **Passo 3: conferir no navegador e commitar**

Clique numa linha de WhatsApp do histórico: a conversa abre **rolada até** a mensagem, com o destaque. Clique numa de e-mail: a mensagem abre.

```bash
git commit --only -m "feat(negocios): a linha do historico abre na mensagem que comecou o atendimento

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/pages/WhatsAppInbox.tsx src/pages/Emails.tsx
```

---

## Verificação final do bloco

- [ ] `npm run test` acima de 1.140, com os 13 novos de `blocos-de-atendimento`
- [ ] `tsc`, `lint` e `build` sem piorar as linhas de base
- [ ] A conferência do Passo 5 da Tarefa 1 bateu perto de 4.168
- [ ] Os cinco pontos do Passo 5 da Tarefa 5 — em especial o **item 4**, que é a prova da regra de acesso
- [ ] Um negócio antigo (anterior a 20/07/2026, sem nenhum fechamento) mostra **uma** linha por conversa, como antes — a degradação prevista
