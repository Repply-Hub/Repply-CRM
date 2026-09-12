# Bloco 3 — Agenda: aviso aos participantes e vários lembretes — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao criar um evento, uma chave (ligada por padrão) avisa os participantes por mensagem direta no chat e por e-mail — no convite, na mudança de data/hora, no cancelamento e em cada lembrete —, e cada evento passa a ter até 5 lembretes, começando com 1 dia e 1 hora antes.

**Architecture:** O banco anota o que aconteceu (gatilhos em `eventos` gravam na fila `evento_avisos`), e o robô que já existe (`eventos-lembrete`, a cada 5 min) passa a gerar os lembretes devidos e esvaziar a fila, com uma marca por canal (sininho, chat, e-mail). Um gatilho por comando chama o robô na hora, então o aviso sai em segundos. Textos e HTML ficam num módulo puro compartilhado (`_shared/aviso-de-evento.ts`), testado pelo Vitest. A tela ganha a chave, a lista de lembretes e a agenda passa a abrir num dia pelo endereço (`/calendario?data=AAAA-MM-DD`), para o botão do e-mail.

**Tech Stack:** Postgres (plpgsql, pg_net via `chamar_edge_function`), Deno Edge Function, Resend, React 18 + TS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md`, Bloco 3.

## Global Constraints

- **Dois ids por pessoa, e trocar um pelo outro não dá erro:** `eventos.user_id` e `eventos.criado_por` são o id de **login** (`usuarios.user_id` = `auth.users.id`); `chat_mensagens.usuario_id/recipient_id` e `notificacoes.usuario_id` são o id **interno** (`usuarios.id`). A fila guarda o interno.
- Outra sessão divide a pasta: **nunca** `git add -A`/`.`; commit com `git commit --only -m "…" -- <arquivos>`.
- Migration: ensaiada numa transação desfeita (`begin … rollback`), depois aplicada **sozinha** via MCP `apply_migration`, **só com o "pode" do Lucas**. Nunca `supabase db push`.
- Ordem obrigatória de publicação: **migration → função `eventos-lembrete` → site**. O site grava colunas que só existem depois da migration.
- Nenhum e-mail de teste para endereço que não seja de alguém da equipe do Lucas. Os 5 vendedores da demo são fantasmas (memória `empresa-repply-e-de-demonstracao`).
- Não imprimir `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` nem nenhum segredo; erro guardado nunca leva segredo.
- Fuso de todo texto: `America/Sao_Paulo`.
- Textos da mensagem direta (exatos, da spec 3.3):
  - `📅 Convite automático: <título> — <dia>, das <h1> às <h2>.[ Obra: <obra>.]`
  - `📅 Evento alterado: <título> — era <dia>, às <h>; agora é <dia>, às <h>.`
  - `📅 Evento cancelado: <título> — <dia>, às <h>.`
  - `📅 Evento cancelado para você: <título> — <dia>, às <h>.`
  - `🔔 Lembrete automático: <título> começa em <antecedência> (<dia>, às <h>).`
  - `<dia>` = "quarta, 16/09"; evento de dia inteiro diz "o dia todo" no lugar do horário.
- Linha de base que não pode piorar: testes ≥ o que os Blocos 1–2 deixaram; `tsc` 36; lint 427; build ok.

## Arquivos

| arquivo | responsabilidade |
|---|---|
| `supabase/functions/_shared/aviso-de-evento.ts` (novo) | textos, assunto, HTML, link — puro |
| `src/lib/aviso-de-evento.test.ts` (novo) | testes do módulo acima |
| `src/lib/lembretes-do-evento.ts` (novo) + `.test.ts` | normalizar lista, padrão, rótulo |
| `src/components/calendar/LembretesField.tsx` (novo) + `.test.tsx` | lista de lembretes na tela |
| `src/components/calendar/LembreteField.tsx` | apagado (substituído) |
| `src/lib/data-do-endereco.ts` (novo) + `.test.ts` | lê `?data=` |
| `src/components/calendar/types.ts` | `EventoForm` e `CalendarEvent` |
| `src/hooks/use-eventos.ts` | leitura, criação, edição, importação |
| `src/components/calendar/EventDialog.tsx` | a chave e a lista |
| `src/pages/Calendario.tsx` | ICS e `?data=` |
| `supabase/migrations/20260911130000_agenda_avisos_e_lembretes.sql` (novo) | colunas, fila, gatilhos, funções |
| `supabase/functions/eventos-lembrete/index.ts` | robô reescrito |
| `src/integrations/supabase/types.ts` | colunas novas de `eventos` |

---

### Task 1: Textos, assunto e HTML do aviso (módulo puro)

**Files:**
- Create: `supabase/functions/_shared/aviso-de-evento.ts`
- Create: `src/lib/aviso-de-evento.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usado pela Task 6):
  - `type TipoDeAviso = 'convite' | 'alteracao' | 'cancelamento' | 'retirado' | 'lembrete'`
  - `interface DadosDoEvento { titulo: string; descricao: string | null; inicio: string; fim: string; dia_inteiro: boolean; inicio_antes: string | null; fim_antes: string | null; obra: string | null; organizador: string | null; participantes: string[] }`
  - `interface AvisoDeEvento { tipo: TipoDeAviso; minutos: number | null; dados: DadosDoEvento }`
  - `textoDoChat(a): string`, `tituloDoSininho(a): string`, `mensagemDoSininho(a): string`, `assuntoDoEmail(a): string`, `htmlDoEmail(a, link: string): string`, `linkDaAgenda(appUrl: string, inicioIso: string): string`, `antecedencia(minutos: number): string`

- [ ] **Step 1: Escrever o teste (falha)**

Criar `src/lib/aviso-de-evento.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  antecedencia,
  assuntoDoEmail,
  htmlDoEmail,
  linkDaAgenda,
  mensagemDoSininho,
  textoDoChat,
  tituloDoSininho,
  type AvisoDeEvento,
  type DadosDoEvento,
} from '../../supabase/functions/_shared/aviso-de-evento';

// 16/09/2026 é quarta-feira; 17h UTC = 14h em São Paulo.
const BASE: DadosDoEvento = {
  titulo: 'Reunião com a Construtora Alfa',
  descricao: null,
  inicio: '2026-09-16T17:00:00.000Z',
  fim: '2026-09-16T18:00:00.000Z',
  dia_inteiro: false,
  inicio_antes: null,
  fim_antes: null,
  obra: null,
  organizador: 'Carlos Lima',
  participantes: ['Carlos Lima', 'Ana Souza'],
};
const aviso = (over: Partial<AvisoDeEvento> & { dados?: Partial<DadosDoEvento> } = {}): AvisoDeEvento => ({
  tipo: over.tipo ?? 'convite',
  minutos: over.minutos ?? null,
  dados: { ...BASE, ...(over.dados ?? {}) },
});

describe('textoDoChat', () => {
  it('convite traz o dia, a faixa de horário e a obra quando há', () => {
    expect(textoDoChat(aviso({ dados: { obra: 'Residencial Mar Azul' } }))).toBe(
      '📅 Convite automático: Reunião com a Construtora Alfa — quarta, 16/09, das 14:00 às 15:00. Obra: Residencial Mar Azul.',
    );
  });

  it('convite sem obra não fala de obra', () => {
    expect(textoDoChat(aviso())).toBe(
      '📅 Convite automático: Reunião com a Construtora Alfa — quarta, 16/09, das 14:00 às 15:00.',
    );
  });

  it('mudança mostra o antes e o agora', () => {
    expect(
      textoDoChat(aviso({
        tipo: 'alteracao',
        dados: { inicio: '2026-09-17T13:00:00.000Z', fim: '2026-09-17T14:00:00.000Z', inicio_antes: '2026-09-16T17:00:00.000Z' },
      })),
    ).toBe('📅 Evento alterado: Reunião com a Construtora Alfa — era quarta, 16/09, às 14:00; agora é quinta, 17/09, às 10:00.');
  });

  it('cancelamento e retirada', () => {
    expect(textoDoChat(aviso({ tipo: 'cancelamento' }))).toBe(
      '📅 Evento cancelado: Reunião com a Construtora Alfa — quarta, 16/09, às 14:00.',
    );
    expect(textoDoChat(aviso({ tipo: 'retirado' }))).toBe(
      '📅 Evento cancelado para você: Reunião com a Construtora Alfa — quarta, 16/09, às 14:00.',
    );
  });

  it('lembrete diz quanto falta', () => {
    expect(textoDoChat(aviso({ tipo: 'lembrete', minutos: 60 }))).toBe(
      '🔔 Lembrete automático: Reunião com a Construtora Alfa começa em 1 hora (quarta, 16/09, às 14:00).',
    );
  });

  it('evento de dia inteiro diz "o dia todo"', () => {
    expect(textoDoChat(aviso({ dados: { dia_inteiro: true, inicio: '2026-09-16T03:00:00.000Z' } }))).toBe(
      '📅 Convite automático: Reunião com a Construtora Alfa — quarta, 16/09, o dia todo.',
    );
  });
});

describe('antecedencia', () => {
  it.each([
    [15, '15 minutos'], [1, '1 minuto'], [60, '1 hora'], [120, '2 horas'],
    [1440, '1 dia'], [2880, '2 dias'], [90, '90 minutos'],
  ])('%i → %s', (min, texto) => expect(antecedencia(min)).toBe(texto));
});

describe('sininho e assunto', () => {
  it('títulos do sininho', () => {
    expect(tituloDoSininho(aviso())).toBe('📅 Convite: Reunião com a Construtora Alfa');
    expect(tituloDoSininho(aviso({ tipo: 'lembrete', minutos: 60 }))).toBe('🔔 Lembrete: Reunião com a Construtora Alfa');
  });

  it('mensagem do sininho do lembrete', () => {
    expect(mensagemDoSininho(aviso({ tipo: 'lembrete', minutos: 1440 }))).toBe('Começa quarta, 16/09, às 14:00 (em 1 dia).');
  });

  it('assunto do e-mail usa o dia curto', () => {
    expect(assuntoDoEmail(aviso())).toBe('Convite: Reunião com a Construtora Alfa — qua 16/09, 14:00');
    expect(assuntoDoEmail(aviso({ tipo: 'lembrete', minutos: 60 }))).toBe('Lembrete: Reunião com a Construtora Alfa — em 1 hora');
  });
});

describe('htmlDoEmail', () => {
  it('🔴 escapa o que vem de fora — título com "<" não quebra nem injeta HTML', () => {
    const html = htmlDoEmail(aviso({ dados: { titulo: 'A <b>&</b> B' } }), 'https://x/calendario?data=2026-09-16');
    expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
    expect(html).not.toContain('<b>&</b>');
  });

  it('traz o botão para a agenda e os participantes', () => {
    const html = htmlDoEmail(aviso(), 'https://crm.repplyhub.com.br/calendario?data=2026-09-16');
    expect(html).toContain('href="https://crm.repplyhub.com.br/calendario?data=2026-09-16"');
    expect(html).toContain('Abrir na agenda');
    expect(html).toContain('Ana Souza');
  });

  it('não diz "Bom dia" — o e-mail sai a qualquer hora', () => {
    expect(htmlDoEmail(aviso(), 'https://x')).not.toMatch(/bom dia/i);
  });
});

describe('linkDaAgenda', () => {
  it('usa o dia em São Paulo, não em UTC', () => {
    // 01h UTC do dia 17 ainda é dia 16 em São Paulo.
    expect(linkDaAgenda('https://crm.repplyhub.com.br', '2026-09-17T01:00:00.000Z')).toBe(
      'https://crm.repplyhub.com.br/calendario?data=2026-09-16',
    );
  });
});
```

Run: `npx vitest run src/lib/aviso-de-evento.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar**

Criar `supabase/functions/_shared/aviso-de-evento.ts`:

```ts
/**
 * O que a agenda diz a um participante — no chat, no sininho e no e-mail.
 *
 * Puro de propósito (sem import, sem rede): roda no robô `eventos-lembrete` (Deno) e é
 * testado pelo Vitest (`src/lib/aviso-de-evento.test.ts`), o mesmo arquivo nos dois.
 *
 * 🔴 O FUSO É FIXO EM SÃO PAULO. O servidor roda em UTC; sem o fuso, o compromisso das
 * 21h aparece como 00h do dia seguinte.
 */

export type TipoDeAviso = 'convite' | 'alteracao' | 'cancelamento' | 'retirado' | 'lembrete';

export interface DadosDoEvento {
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  inicio_antes: string | null;
  fim_antes: string | null;
  obra: string | null;
  organizador: string | null;
  participantes: string[];
}

export interface AvisoDeEvento {
  tipo: TipoDeAviso;
  minutos: number | null;
  dados: DadosDoEvento;
}

const FUSO = 'America/Sao_Paulo';

function diaDaSemana(iso: string, estilo: 'long' | 'short'): string {
  const bruto = new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: estilo });
  // "quarta-feira" → "quarta"; "qua." → "qua"
  return bruto.replace('-feira', '').replace('.', '');
}

function diaEMes(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

function mesmoDia(a: string, b: string): boolean {
  return diaEMes(a) === diaEMes(b);
}

/** "quarta, 16/09" */
function dia(iso: string): string {
  return `${diaDaSemana(iso, 'long')}, ${diaEMes(iso)}`;
}

/** "quarta, 16/09, às 14:00" — ou "quarta, 16/09, o dia todo". */
function pontual(iso: string, diaInteiro: boolean): string {
  return diaInteiro ? `${dia(iso)}, o dia todo` : `${dia(iso)}, às ${hora(iso)}`;
}

/** "quarta, 16/09, das 14:00 às 15:00" — cai para `pontual` se termina noutro dia. */
function faixa(d: DadosDoEvento): string {
  if (d.dia_inteiro) return `${dia(d.inicio)}, o dia todo`;
  if (!mesmoDia(d.inicio, d.fim)) return pontual(d.inicio, false);
  return `${dia(d.inicio)}, das ${hora(d.inicio)} às ${hora(d.fim)}`;
}

export function antecedencia(minutos: number): string {
  if (minutos % 1440 === 0) {
    const n = minutos / 1440;
    return n === 1 ? '1 dia' : `${n} dias`;
  }
  if (minutos % 60 === 0) {
    const n = minutos / 60;
    return n === 1 ? '1 hora' : `${n} horas`;
  }
  return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
}

export function textoDoChat(a: AvisoDeEvento): string {
  const d = a.dados;
  switch (a.tipo) {
    case 'convite':
      return `📅 Convite automático: ${d.titulo} — ${faixa(d)}.${d.obra ? ` Obra: ${d.obra}.` : ''}`;
    case 'alteracao':
      return `📅 Evento alterado: ${d.titulo} — era ${pontual(d.inicio_antes ?? d.inicio, d.dia_inteiro)}; agora é ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'cancelamento':
      return `📅 Evento cancelado: ${d.titulo} — ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'retirado':
      return `📅 Evento cancelado para você: ${d.titulo} — ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'lembrete':
      return `🔔 Lembrete automático: ${d.titulo} começa em ${antecedencia(a.minutos ?? 0)} (${pontual(d.inicio, d.dia_inteiro)}).`;
  }
}

export function tituloDoSininho(a: AvisoDeEvento): string {
  const t = a.dados.titulo;
  switch (a.tipo) {
    case 'convite': return `📅 Convite: ${t}`;
    case 'alteracao': return `📅 Evento alterado: ${t}`;
    case 'cancelamento': return `📅 Evento cancelado: ${t}`;
    case 'retirado': return `📅 Evento cancelado para você: ${t}`;
    case 'lembrete': return `🔔 Lembrete: ${t}`;
  }
}

export function mensagemDoSininho(a: AvisoDeEvento): string {
  const d = a.dados;
  switch (a.tipo) {
    case 'convite':
      return `${faixa(d)}.${d.organizador ? ` Organizado por ${d.organizador}.` : ''}`;
    case 'alteracao':
      return `Era ${pontual(d.inicio_antes ?? d.inicio, d.dia_inteiro)}; agora é ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'cancelamento':
    case 'retirado':
      return `${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'lembrete':
      return `Começa ${pontual(d.inicio, d.dia_inteiro)} (em ${antecedencia(a.minutos ?? 0)}).`;
  }
}

export function assuntoDoEmail(a: AvisoDeEvento): string {
  const d = a.dados;
  const curto = `${diaDaSemana(d.inicio, 'short')} ${diaEMes(d.inicio)}${d.dia_inteiro ? '' : `, ${hora(d.inicio)}`}`;
  switch (a.tipo) {
    case 'convite': return `Convite: ${d.titulo} — ${curto}`;
    case 'alteracao': return `Evento alterado: ${d.titulo} — agora ${curto}`;
    case 'cancelamento': return `Evento cancelado: ${d.titulo} — ${curto}`;
    case 'retirado': return `Evento cancelado para você: ${d.titulo} — ${curto}`;
    case 'lembrete': return `Lembrete: ${d.titulo} — em ${antecedencia(a.minutos ?? 0)}`;
  }
}

/** "https://crm…/calendario?data=2026-09-16", com o dia contado em São Paulo. */
export function linkDaAgenda(appUrl: string, inicioIso: string): string {
  const diaSP = new Date(inicioIso).toLocaleDateString('en-CA', { timeZone: FUSO }); // AAAA-MM-DD
  return `${appUrl.replace(/\/$/, '')}/calendario?data=${diaSP}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MANCHETE: Record<TipoDeAviso, string> = {
  convite: 'Você foi incluído num evento',
  alteracao: 'Um evento mudou de horário',
  cancelamento: 'Um evento foi cancelado',
  retirado: 'Você não está mais neste evento',
  lembrete: 'Seu evento está chegando',
};

function linha(rotulo: string, valorHtml: string): string {
  return `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top">${esc(rotulo)}</td><td style="padding:4px 0;color:#111827;font-size:14px">${valorHtml}</td></tr>`;
}

export function htmlDoEmail(a: AvisoDeEvento, link: string): string {
  const d = a.dados;
  const quandoAgora = esc(a.tipo === 'convite' ? faixa(d) : pontual(d.inicio, d.dia_inteiro));
  const quando = a.tipo === 'alteracao' && d.inicio_antes
    ? `<span style="text-decoration:line-through;color:#9ca3af">${esc(pontual(d.inicio_antes, d.dia_inteiro))}</span><br>${quandoAgora}`
    : quandoAgora;
  const detalhe = a.tipo === 'lembrete' ? `Começa em ${esc(antecedencia(a.minutos ?? 0))}.` : '';

  const linhas = [
    linha('Quando', quando),
    d.obra ? linha('Obra', esc(d.obra)) : '',
    d.descricao ? linha('Descrição', esc(d.descricao).replace(/\n/g, '<br>')) : '',
    d.organizador ? linha('Organizado por', esc(d.organizador)) : '',
    d.participantes.length ? linha('Participantes', esc(d.participantes.join(', '))) : '',
  ].join('');

  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#f97316;padding:16px 24px;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:.3px">Agenda · Repply CRM</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;color:#6b7280;font-size:13px">${esc(MANCHETE[a.tipo])}</p>
<h1 style="margin:0 0 12px;color:#111827;font-size:20px;line-height:1.3">${esc(d.titulo)}</h1>
${detalhe ? `<p style="margin:0 0 12px;color:#111827;font-size:14px">${detalhe}</p>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
${a.tipo === 'cancelamento' || a.tipo === 'retirado' ? '' : `<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 18px;border-radius:8px">Abrir na agenda</a></p>`}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">Aviso automático da agenda. Quem criou o evento escolheu avisar os participantes.</td></tr>
</table></td></tr></table></body></html>`;
}
```

Note: o teste "traz o botão" usa `tipo: 'convite'`, que mostra o botão; cancelamento e retirada não mostram botão (não há o que abrir).

Run: `npx vitest run src/lib/aviso-de-evento.test.ts`
Expected: PASS. Se o nome do dia da semana vier diferente (ICU do Node), conferir com `node -e "console.log(new Date('2026-09-16T17:00:00Z').toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long'}))"` — deve imprimir `quarta-feira`.

- [ ] **Step 3: Commit**

```bash
git add -- supabase/functions/_shared/aviso-de-evento.ts src/lib/aviso-de-evento.test.ts
git commit --only -m "feat(agenda): textos e e-mail do aviso aos participantes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/functions/_shared/aviso-de-evento.ts src/lib/aviso-de-evento.test.ts
```

---

### Task 2: A lista de lembretes

**Files:**
- Create: `src/lib/lembretes-do-evento.ts`, `src/lib/lembretes-do-evento.test.ts`
- Create: `src/components/calendar/LembretesField.tsx`, `src/components/calendar/LembretesField.test.tsx`

**Interfaces:**
- Produces: `LEMBRETES_PADRAO: readonly number[] = [1440, 60]`, `LIMITE_DE_LEMBRETES = 5`, `OPCOES_DE_LEMBRETE: readonly number[]`, `normalizarLembretes(lista: readonly number[]): number[]`, `rotuloDoLembrete(minutos: number): string`; componente `LembretesField({ value, onChange, disabled? }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean })`.

- [ ] **Step 1: Teste das regras (falha)**

Criar `src/lib/lembretes-do-evento.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LEMBRETES_PADRAO, normalizarLembretes, rotuloDoLembrete } from './lembretes-do-evento';

describe('lembretes do evento', () => {
  it('o padrão é 1 dia e 1 hora antes — decisão do dono do produto', () => {
    expect([...LEMBRETES_PADRAO]).toEqual([1440, 60]);
  });

  it('ordena do mais cedo para o mais tarde e tira repetido', () => {
    expect(normalizarLembretes([60, 1440, 60, 15])).toEqual([1440, 60, 15]);
  });

  it('descarta zero, negativo e fração', () => {
    expect(normalizarLembretes([0, -5, 12.5, 30])).toEqual([30]);
  });

  it('para em 5', () => {
    expect(normalizarLembretes([1, 2, 3, 4, 5, 6])).toEqual([6, 5, 4, 3, 2]);
  });

  it.each([
    [1440, '1 dia antes'], [2880, '2 dias antes'], [60, '1 hora antes'],
    [120, '2 horas antes'], [15, '15 minutos antes'], [1, '1 minuto antes'], [90, '90 minutos antes'],
  ])('%i → %s', (min, rotulo) => expect(rotuloDoLembrete(min)).toBe(rotulo));
});
```

Run: `npx vitest run src/lib/lembretes-do-evento.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar as regras**

Criar `src/lib/lembretes-do-evento.ts`:

```ts
/**
 * Os lembretes de um evento: quantos minutos antes do início avisar.
 *
 * Decisão do dono do produto (11/09/2026): evento novo já vem com 1 dia e 1 hora antes;
 * até 5 por evento. A lista é gravada normalizada (ordenada, sem repetição) para o robô
 * de lembretes nunca mandar o mesmo aviso duas vezes.
 */
export const LEMBRETES_PADRAO: readonly number[] = [1440, 60];
export const LIMITE_DE_LEMBRETES = 5;
export const OPCOES_DE_LEMBRETE: readonly number[] = [15, 30, 60, 120, 1440, 2880];

export function normalizarLembretes(lista: readonly number[]): number[] {
  const validos = lista.filter((m) => Number.isInteger(m) && m > 0);
  return [...new Set(validos)].sort((a, b) => b - a).slice(0, LIMITE_DE_LEMBRETES);
}

export function rotuloDoLembrete(minutos: number): string {
  if (minutos % 1440 === 0) {
    const n = minutos / 1440;
    return `${n} ${n === 1 ? 'dia' : 'dias'} antes`;
  }
  if (minutos % 60 === 0) {
    const n = minutos / 60;
    return `${n} ${n === 1 ? 'hora' : 'horas'} antes`;
  }
  return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} antes`;
}
```

Run: `npx vitest run src/lib/lembretes-do-evento.test.ts`
Expected: PASS.

- [ ] **Step 3: Teste do campo (falha)**

Criar `src/components/calendar/LembretesField.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LembretesField } from './LembretesField';

afterEach(cleanup);

describe('LembretesField', () => {
  it('mostra cada lembrete como etiqueta removível', () => {
    render(<LembretesField value={[1440, 60]} onChange={() => {}} />);
    expect(screen.getByText('1 dia antes')).toBeTruthy();
    expect(screen.getByText('1 hora antes')).toBeTruthy();
  });

  it('remover tira só aquele', () => {
    const onChange = vi.fn();
    render(<LembretesField value={[1440, 60]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover 1 hora antes' }));
    expect(onChange).toHaveBeenCalledWith([1440]);
  });

  it('adicionar uma opção pronta entra na lista, na ordem', () => {
    const onChange = vi.fn();
    render(<LembretesField value={[1440]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith([1440, 15]);
  });

  it('personalizado: 3 horas vira 180 minutos', () => {
    const onChange = vi.fn();
    render(<LembretesField value={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Adicionar lembrete'), { target: { value: 'personalizado' } });
    fireEvent.change(screen.getByLabelText('Quanto tempo antes'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'horas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(onChange).toHaveBeenCalledWith([180]);
  });

  it('com 5 lembretes, some a opção de adicionar', () => {
    render(<LembretesField value={[2880, 1440, 120, 60, 15]} onChange={() => {}} />);
    expect(screen.queryByLabelText('Adicionar lembrete')).toBeNull();
  });

  it('sem nenhum, diz que não há lembrete', () => {
    render(<LembretesField value={[]} onChange={() => {}} />);
    expect(screen.getByText('Sem lembrete')).toBeTruthy();
  });
});
```

Run: `npx vitest run src/components/calendar/LembretesField.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar o campo**

Criar `src/components/calendar/LembretesField.tsx`:

```tsx
import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  LIMITE_DE_LEMBRETES,
  OPCOES_DE_LEMBRETE,
  normalizarLembretes,
  rotuloDoLembrete,
} from '@/lib/lembretes-do-evento';

type Unidade = 'minutos' | 'horas' | 'dias';
const EM_MINUTOS: Record<Unidade, number> = { minutos: 1, horas: 60, dias: 1440 };

// Seletor nativo de propósito: abre o seletor do próprio celular, e é o mais
// fácil de usar com o dedo numa lista curta.
const SELECT =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
  value: number[];
  onChange: (lembretes: number[]) => void;
  disabled?: boolean;
}

export function LembretesField({ value, onChange, disabled }: Props) {
  const [personalizando, setPersonalizando] = useState(false);
  const [quanto, setQuanto] = useState('30');
  const [unidade, setUnidade] = useState<Unidade>('minutos');

  const acrescentar = (minutos: number) => onChange(normalizarLembretes([...value, minutos]));
  const disponiveis = OPCOES_DE_LEMBRETE.filter((m) => !value.includes(m));
  const podeAcrescentar = !disabled && value.length < LIMITE_DE_LEMBRETES;

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
        Lembretes para os participantes
      </Label>

      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && <span className="text-sm text-muted-foreground">Sem lembrete</span>}
        {value.map((m) => (
          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
            {rotuloDoLembrete(m)}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remover ${rotuloDoLembrete(m)}`}
                onClick={() => onChange(value.filter((x) => x !== m))}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {podeAcrescentar && !personalizando && (
        <select
          aria-label="Adicionar lembrete"
          className={SELECT}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'personalizado') setPersonalizando(true);
            else if (v) acrescentar(Number(v));
          }}
        >
          <option value="">+ Adicionar lembrete</option>
          {disponiveis.map((m) => (
            <option key={m} value={m}>{rotuloDoLembrete(m)}</option>
          ))}
          <option value="personalizado">Personalizado…</option>
        </select>
      )}

      {podeAcrescentar && personalizando && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Quanto tempo antes"
            type="number"
            min={1}
            value={quanto}
            onChange={(e) => setQuanto(e.target.value)}
            className="h-9 w-20"
          />
          <select
            aria-label="Unidade"
            className={SELECT}
            value={unidade}
            onChange={(e) => setUnidade(e.target.value as Unidade)}
          >
            <option value="minutos">minutos</option>
            <option value="horas">horas</option>
            <option value="dias">dias</option>
          </select>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const minutos = Number(quanto) * EM_MINUTOS[unidade];
              if (Number.isInteger(minutos) && minutos > 0) acrescentar(minutos);
              setPersonalizando(false);
            }}
          >
            Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPersonalizando(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
```

Run: `npx vitest run src/components/calendar/LembretesField.test.tsx src/lib/lembretes-do-evento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/lembretes-do-evento.ts src/lib/lembretes-do-evento.test.ts src/components/calendar/LembretesField.tsx src/components/calendar/LembretesField.test.tsx
git commit --only -m "feat(agenda): um evento pode ter ate 5 lembretes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/lembretes-do-evento.ts src/lib/lembretes-do-evento.test.ts src/components/calendar/LembretesField.tsx src/components/calendar/LembretesField.test.tsx
```

---

### Task 3: A agenda abre no dia do endereço

**Files:**
- Create: `src/lib/data-do-endereco.ts`, `src/lib/data-do-endereco.test.ts`
- Modify: `src/pages/Calendario.tsx:1` (imports) e depois da linha 124 (efeito)

**Interfaces:**
- Produces: `dataDoEndereco(valor: string | null | undefined): Date | null`.

- [ ] **Step 1: Teste (falha)**

Criar `src/lib/data-do-endereco.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dataDoEndereco } from './data-do-endereco';

describe('dataDoEndereco', () => {
  it('lê AAAA-MM-DD como dia local', () => {
    const d = dataDoEndereco('2026-09-16')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 16]);
  });

  it('recusa data que não existe', () => {
    expect(dataDoEndereco('2026-02-30')).toBeNull();
  });

  it('recusa formato errado e vazio', () => {
    expect(dataDoEndereco('16/09/2026')).toBeNull();
    expect(dataDoEndereco('')).toBeNull();
    expect(dataDoEndereco(null)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/data-do-endereco.test.ts` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar**

Criar `src/lib/data-do-endereco.ts`:

```ts
/**
 * O dia que vem no endereço da agenda (`/calendario?data=2026-09-16`) — é para onde
 * o botão "Abrir na agenda" do e-mail leva. Dia LOCAL (não UTC): "16" é 16 aqui.
 */
export function dataDoEndereco(valor: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? '');
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(ano, mes, dia);
  return d.getFullYear() === ano && d.getMonth() === mes && d.getDate() === dia ? d : null;
}
```

Run: `npx vitest run src/lib/data-do-endereco.test.ts` → PASS.

- [ ] **Step 3: Ligar na tela**

Em `src/pages/Calendario.tsx`:
- linha 1: `import { useState, useRef, useMemo, useEffect } from "react";`
- depois da linha 1: `import { useSearchParams } from "react-router-dom";`
- junto dos imports de `@/lib`: `import { dataDoEndereco } from '@/lib/data-do-endereco';`
- logo depois de `const [month, setMonth] = useState(new Date());` (linha 124):

```tsx
  // Vindo do e-mail da agenda ("Abrir na agenda"): abre no dia do evento e limpa o
  // endereço, para um F5 depois não voltar ao mesmo dia sem a pessoa pedir.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const alvo = dataDoEndereco(searchParams.get('data'));
    if (!alvo) return;
    setCurrentDate(alvo);
    setMonth(alvo);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('data');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);
```

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → ≤ 36.

- [ ] **Step 4: Commit**

```bash
git add -- src/lib/data-do-endereco.ts src/lib/data-do-endereco.test.ts
git commit --only -m "feat(agenda): o endereco /calendario?data= abre a agenda naquele dia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/data-do-endereco.ts src/lib/data-do-endereco.test.ts src/pages/Calendario.tsx
```

---

### Task 4: A tela — chave de aviso e lista de lembretes

**Files:**
- Modify: `src/components/calendar/types.ts:17` e `:37`
- Modify: `src/hooks/use-eventos.ts` (EventoRow `:11-29`, mapeamento `:169`, `useCreateEvento :282`, `useBulkCreateEventos :672`, `useUpdateEvento :718-776`)
- Modify: `src/components/calendar/EventDialog.tsx` (`:95`, `:164`, `:536-540`)
- Modify: `src/pages/Calendario.tsx:105`
- Delete: `src/components/calendar/LembreteField.tsx`
- Modify: `src/integrations/supabase/types.ts` (bloco `eventos`, `:1800-1876`)

**Interfaces:**
- Consumes: `LembretesField`, `LEMBRETES_PADRAO`, `normalizarLembretes` (Task 2).
- Produces: `EventoForm.lembretes: number[]`, `EventoForm.avisarParticipantes?: boolean`, `CalendarEvent.lembretes?: number[]`, `CalendarEvent.avisarParticipantes?: boolean`; colunas gravadas `lembretes_minutos`, `avisar_participantes` (a migration da Task 5 as cria).

- [ ] **Step 1: Tipos da tela**

Em `src/components/calendar/types.ts`:
- linha 17: trocar `  lembreteMinutos?: number | null;` por
```ts
  lembretes?: number[];
  avisarParticipantes?: boolean;
```
- linha 37: trocar `  lembreteMinutos: number | null; // antecedência em minutos p/ notificar os participantes` por
```ts
  lembretes: number[]; // minutos antes do início, até 5 — ver lembretes-do-evento
  avisarParticipantes?: boolean; // chat + e-mail no convite, mudança, cancelamento e lembretes
```

Em `src/integrations/supabase/types.ts`, no bloco `eventos`, acrescentar em ordem alfabética:
- Row: `avisar_participantes: boolean`, `lembretes_minutos: number[]`, `lembretes_valem_desde: string | null`
- Insert e Update: as mesmas com `?:`.

- [ ] **Step 2: Leitura e gravação**

Em `src/hooks/use-eventos.ts`:
- `EventoRow` (depois de `lembrete_minutos: number | null;`, linha 21):
```ts
  lembretes_minutos: number[] | null;
  avisar_participantes: boolean | null;
```
- mapeamento (linha 169): trocar `lembreteMinutos: e.lembrete_minutos,` por
```ts
          lembretes: e.lembretes_minutos ?? [],
          avisarParticipantes: e.avisar_participantes ?? false,
```
- `useCreateEvento` (linha 282): trocar `lembrete_minutos: form.lembreteMinutos,` por
```ts
        lembretes_minutos: normalizarLembretes(form.lembretes ?? []),
        avisar_participantes: form.avisarParticipantes ?? false,
```
- `useBulkCreateEventos` (linha 672): trocar `lembrete_minutos: form.lembreteMinutos,` por `lembretes_minutos: normalizarLembretes(form.lembretes ?? []),`
- `useUpdateEvento`, no objeto `campos` (linha 726): trocar `lembrete_minutos: form.lembreteMinutos,` por
```ts
        lembretes_minutos: normalizarLembretes(form.lembretes ?? []),
        avisar_participantes: form.avisarParticipantes ?? false,
```
- `useUpdateEvento`, ramo do organizador (linhas 753-764): **mover o bloco `remover` para ANTES do `update` do grupo**. Motivo: quem é retirado recebia primeiro "evento alterado" (a linha dele ainda era atualizada) e depois "cancelado para você". A ordem fica: buscar existentes → apagar os retirados → atualizar o grupo → inserir os novos.
- import no topo: `import { normalizarLembretes } from '@/lib/lembretes-do-evento';`

- [ ] **Step 3: O formulário**

Em `src/components/calendar/EventDialog.tsx`:
- import: trocar `import { LembreteField } from './LembreteField';` por
```tsx
import { LembretesField } from './LembretesField';
import { LEMBRETES_PADRAO } from '@/lib/lembretes-do-evento';
```
e, se ainda não houver, `import { Switch } from '@/components/ui/switch';`
- `defaultForm` (linha 95): trocar `lembreteMinutos: null,` por
```tsx
    lembretes: [...LEMBRETES_PADRAO],
    avisarParticipantes: true,
```
- preenchimento na edição (linha 164): trocar `lembreteMinutos: editingEvent.lembreteMinutos ?? null,` por
```tsx
        lembretes: editingEvent.lembretes ?? [],
        avisarParticipantes: editingEvent.avisarParticipantes ?? false,
```
- trocar o bloco `{/* Lembrete */}` + `<LembreteField … />` (linhas 536-540) por:

```tsx
          {/* Aviso aos participantes — só em evento comum. Rota de visita não avisa ninguém
              (decisão de 11/09/2026). Só quem organizou muda: a chave vale para o grupo inteiro. */}
          {!isVisita && (
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="avisar-participantes" className="text-sm">
                  Avisar participantes por chat e e-mail
                </Label>
                <p className="text-xs text-muted-foreground">
                  No convite, na mudança de horário, no cancelamento e em cada lembrete.
                </p>
              </div>
              <Switch
                id="avisar-participantes"
                checked={form.avisarParticipantes ?? false}
                onCheckedChange={(v) => set('avisarParticipantes', v)}
                disabled={somenteLeitura || !podeGerenciarParticipantes}
              />
            </div>
          )}

          <LembretesField
            value={form.lembretes}
            onChange={(v) => set('lembretes', v)}
            disabled={somenteLeitura}
          />
```

- [ ] **Step 4: Importação ICS e sobras**

Em `src/pages/Calendario.tsx:105`, trocar `lembreteMinutos: null,` por `lembretes: [],`.

Apagar `src/components/calendar/LembreteField.tsx` (substituído, sem outro uso):
```bash
git rm -q src/components/calendar/LembreteField.tsx
```

Run (Grep): `lembreteMinutos|LembreteField\b` em `src/`.
Expected: nenhuma ocorrência.

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → ≤ 36.
Run: `npm run test` → tudo passando.

- [ ] **Step 5: Commit**

```bash
git commit --only -m "feat(agenda): chave 'avisar participantes' e lista de lembretes no formulario

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/calendar/types.ts src/hooks/use-eventos.ts src/components/calendar/EventDialog.tsx src/pages/Calendario.tsx src/components/calendar/LembreteField.tsx src/integrations/supabase/types.ts
```

Mesmo cuidado com `types.ts` do Bloco 2: conferir `git diff` antes; se houver mudança de outra sessão, tirar da lista e separar à mão.

---

### Task 5: O banco — colunas, fila, gatilhos e funções

**Files:**
- Create: `supabase/migrations/20260911130000_agenda_avisos_e_lembretes.sql`

**Interfaces:**
- Consumes: `public.chamar_edge_function(text, jsonb, integer, boolean)`, `public.empresa_tem_secao_de(uuid, text)` (existentes).
- Produces (usados pela Task 6): tabela `evento_avisos` (colunas abaixo), `gerar_lembretes_devidos() returns integer`, `reservar_avisos_de_evento(p_limite integer) returns setof evento_avisos`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260911130000_agenda_avisos_e_lembretes.sql`:

```sql
-- Agenda: aviso aos participantes (mensagem direta + e-mail) e vários lembretes por evento.
-- Spec: docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md, Bloco 3.
--
-- COMO FUNCIONA
--   O banco ANOTA o que aconteceu (convite, mudança, cancelamento, retirada) na fila
--   `evento_avisos`, venha a mudança de qual tela vier. O robô `eventos-lembrete` gera os
--   lembretes devidos na mesma fila e a esvazia. Um gatilho por comando chama o robô na
--   hora; o agendamento de 5 min é a rede de segurança.
--
-- 🔴 IDS: eventos.user_id / criado_por são o id de LOGIN (auth.users). A fila guarda o id
--    INTERNO (usuarios.id), que é o que chat e sininho usam.
--
-- NADA É APAGADO. `lembrete_minutos` e `lembrete_enviado` continuam existindo; saem num
-- passo futuro, depois deste bloco estável.

-- 1. Colunas novas -----------------------------------------------------------------
alter table public.eventos
  add column if not exists avisar_participantes boolean not null default false,
  add column if not exists lembretes_minutos integer[] not null default '{}',
  add column if not exists lembretes_valem_desde timestamptz;

-- O preenchimento abaixo não pode mexer em `updated_at` nem disparar gatilho antigo:
-- é cópia de estrutura, não edição de evento.
alter table public.eventos disable trigger user;

update public.eventos
   set lembretes_minutos = array[lembrete_minutos]
 where lembrete_minutos is not null
   and lembretes_minutos = '{}';

-- Eventos que já existem: só valem lembretes cujo momento ainda vai chegar. Os que já
-- passaram, o robô antigo mandou.
update public.eventos
   set lembretes_valem_desde = now()
 where lembretes_valem_desde is null;

alter table public.eventos enable trigger user;

-- 2. Lembretes já enviados ---------------------------------------------------------
create table if not exists public.evento_lembretes_enviados (
  evento_id  uuid        not null references public.eventos(id) on delete cascade,
  minutos    integer     not null,
  enviado_em timestamptz not null default now(),
  primary key (evento_id, minutos)
);
alter table public.evento_lembretes_enviados enable row level security;
-- Sem política: só o servidor e as funções do sistema leem e gravam.

-- O que o robô antigo já mandou não sai de novo.
insert into public.evento_lembretes_enviados (evento_id, minutos)
select id, lembrete_minutos
  from public.eventos
 where lembrete_enviado and lembrete_minutos is not null
on conflict do nothing;

-- 3. A fila -----------------------------------------------------------------------
create table if not exists public.evento_avisos (
  id                uuid        primary key default gen_random_uuid(),
  empresa_id        uuid        not null references public.empresas(id) on delete cascade,
  grupo_id          uuid        not null,
  evento_id         uuid,          -- nulo no cancelamento: a linha do evento já não existe
  destinatario_id   uuid        not null references public.usuarios(id) on delete cascade,
  remetente_id      uuid        references public.usuarios(id) on delete set null,
  tipo              text        not null check (tipo in ('convite','alteracao','cancelamento','retirado','lembrete')),
  minutos           integer,
  avisar            boolean     not null,
  dados             jsonb       not null,
  criado_em         timestamptz not null default now(),
  sininho_em        timestamptz,
  chat_em           timestamptz,
  email_em          timestamptz,
  concluido_em      timestamptz,
  tentativas        integer     not null default 0,
  ultimo_erro       text,
  processando_desde timestamptz
);
create index if not exists evento_avisos_pendentes
  on public.evento_avisos (criado_em) where concluido_em is null;
alter table public.evento_avisos enable row level security;
-- Sem política: só o servidor lê e grava.

-- 4. Anotar um aviso a partir de uma linha de evento -------------------------------
create or replace function public.anotar_aviso_de_evento(
  p_evento       public.eventos,
  p_tipo         text,
  p_minutos      integer,
  p_inicio_antes timestamptz,
  p_fim_antes    timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dest  public.usuarios;
  v_rem   public.usuarios;
  v_obra  text;
  v_nomes text[];
begin
  select * into v_dest from usuarios where user_id = p_evento.user_id and deleted_at is null;
  if v_dest.id is null or v_dest.empresa_id is null then return; end if;

  -- Empresa com o Calendário desligado: nada sai (mesma regra do robô de hoje).
  if not empresa_tem_secao_de(v_dest.empresa_id, 'calendario') then return; end if;

  select * into v_rem from usuarios where user_id = p_evento.criado_por;
  if p_evento.obra_id is not null then
    select nome_obra into v_obra from obras where id = p_evento.obra_id;
  end if;
  select coalesce(array_agg(coalesce(u.nome, u.email) order by u.nome), '{}')
    into v_nomes
    from eventos e
    join usuarios u on u.user_id = e.user_id
   where e.grupo_id = p_evento.grupo_id;

  insert into evento_avisos (
    empresa_id, grupo_id, evento_id, destinatario_id, remetente_id,
    tipo, minutos, avisar, dados
  ) values (
    v_dest.empresa_id,
    p_evento.grupo_id,
    case when p_tipo in ('cancelamento', 'retirado') then null else p_evento.id end,
    v_dest.id,
    v_rem.id,
    p_tipo,
    p_minutos,
    p_evento.avisar_participantes,
    jsonb_build_object(
      'titulo',        p_evento.titulo,
      'descricao',     p_evento.descricao,
      'inicio',        p_evento.inicio,
      'fim',           p_evento.fim,
      'dia_inteiro',   p_evento.dia_inteiro,
      'inicio_antes',  p_inicio_antes,
      'fim_antes',     p_fim_antes,
      'obra',          v_obra,
      'organizador',   coalesce(v_rem.nome, v_rem.email),
      'participantes', to_jsonb(v_nomes)
    )
  );
end;
$$;
revoke all on function public.anotar_aviso_de_evento(public.eventos, text, integer, timestamptz, timestamptz)
  from public, anon, authenticated;

-- 5. Antes de gravar: ponte com a aba antiga e carimbo dos lembretes ----------------
create or replace function public.eventos_prepara_lembretes()
returns trigger
language plpgsql
security definer   -- apaga em evento_lembretes_enviados, que não tem política
set search_path = public
as $$
begin
  -- Ponte: uma aba aberta antes da publicação ainda grava só `lembrete_minutos`.
  if new.lembretes_minutos = '{}' and new.lembrete_minutos is not null
     and (tg_op = 'INSERT' or new.lembrete_minutos is distinct from old.lembrete_minutos) then
    new.lembretes_minutos := array[new.lembrete_minutos];
  end if;

  if tg_op = 'INSERT' then
    new.lembretes_valem_desde := now();
  elsif new.inicio is distinct from old.inicio then
    -- Horário mudou: lembretes voltam a valer para o horário novo, e só daqui para frente.
    new.lembretes_valem_desde := now();
    delete from evento_lembretes_enviados where evento_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists eventos_prepara_lembretes on public.eventos;
create trigger eventos_prepara_lembretes
  before insert or update on public.eventos
  for each row execute function public.eventos_prepara_lembretes();

-- 6. Depois de gravar: anota o aviso ------------------------------------------------
create or replace function public.eventos_anota_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quem  uuid := auth.uid();
  v_resta boolean;
begin
  -- Sem sessão = o próprio sistema (limpeza, exclusão de conta): nunca avisa.
  if v_quem is null then return null; end if;

  if tg_op = 'INSERT' then
    -- Convite: evento novo ou participante incluído depois. Quem grava a própria linha
    -- (o organizador) não se convida.
    if new.avisar_participantes and new.user_id <> v_quem and new.inicio > now() then
      perform anotar_aviso_de_evento(new, 'convite', null, null, null);
    end if;

  elsif tg_op = 'UPDATE' then
    -- Mudança de data/hora feita por outra pessoa (o organizador). Título e descrição não avisam.
    if new.avisar_participantes and new.user_id <> v_quem
       and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
       and greatest(new.inicio, old.inicio) > now() then
      perform anotar_aviso_de_evento(new, 'alteracao', null, old.inicio, old.fim);
    end if;

  elsif tg_op = 'DELETE' then
    -- Participante que sai (apaga a própria linha) não avisa ninguém.
    if old.avisar_participantes and old.user_id <> v_quem and old.inicio > now() then
      -- Gatilho AFTER ROW roda no fim do comando: se o grupo inteiro foi apagado, não resta
      -- ninguém = cancelamento; se ainda resta alguém, esta pessoa foi retirada.
      select exists (select 1 from eventos where grupo_id = old.grupo_id) into v_resta;
      perform anotar_aviso_de_evento(
        old, case when v_resta then 'retirado' else 'cancelamento' end, null, null, null);
    end if;
  end if;
  return null;
exception when others then
  -- 🔴 Aviso é consequência: NUNCA pode impedir salvar ou apagar o evento.
  raise warning '[agenda] aviso não anotado: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists eventos_anota_aviso on public.eventos;
create trigger eventos_anota_aviso
  after insert or update or delete on public.eventos
  for each row execute function public.eventos_anota_aviso();

-- 7. Chama o robô na hora (uma vez por comando) -------------------------------------
create or replace function public.eventos_chama_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from evento_avisos
              where concluido_em is null and criado_em > now() - interval '1 minute') then
    -- pg_net envia depois do commit, então o robô já enxerga o que foi anotado.
    perform chamar_edge_function('eventos-lembrete', '{}'::jsonb, 60000, false);
  end if;
  return null;
exception when others then
  raise warning '[agenda] envio não chamado (o agendamento de 5 min cobre): %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists eventos_chama_envio on public.eventos;
create trigger eventos_chama_envio
  after insert or update or delete on public.eventos
  for each statement execute function public.eventos_chama_envio();

-- 8. Lembretes devidos → fila (idempotente) ------------------------------------------
create or replace function public.gerar_lembretes_devidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select e as ev, m.minutos
      from eventos e
      cross join lateral unnest(e.lembretes_minutos) as m(minutos)
      join usuarios u on u.user_id = e.user_id and u.deleted_at is null
     where e.lembretes_minutos <> '{}'
       and e.inicio > now()
       and e.inicio - make_interval(mins => m.minutos) <= now()
       and e.inicio - make_interval(mins => m.minutos) >= coalesce(e.lembretes_valem_desde, e.created_at)
       -- Calendário desligado: pula SEM marcar, para religar não perder o lembrete.
       and empresa_tem_secao_de(u.empresa_id, 'calendario')
       and not exists (select 1 from evento_lembretes_enviados x
                        where x.evento_id = e.id and x.minutos = m.minutos)
  loop
    insert into evento_lembretes_enviados (evento_id, minutos)
    values ((r.ev).id, r.minutos)
    on conflict do nothing;
    if found then
      perform anotar_aviso_de_evento(r.ev, 'lembrete', r.minutos, null, null);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.gerar_lembretes_devidos() from public, anon, authenticated;
grant execute on function public.gerar_lembretes_devidos() to service_role;

-- 9. O robô reserva itens sem repetir ------------------------------------------------
create or replace function public.reservar_avisos_de_evento(p_limite integer default 50)
returns setof public.evento_avisos
language sql
security definer
set search_path = public
as $$
  update evento_avisos a
     set processando_desde = now(),
         tentativas        = a.tentativas + 1
   where a.id in (
     select id from evento_avisos
      where concluido_em is null
        and tentativas < 5
        and (processando_desde is null or processando_desde < now() - interval '10 minutes')
      order by criado_em
      limit p_limite
      for update skip locked
   )
  returning a.*;
$$;
revoke all on function public.reservar_avisos_de_evento(integer) from public, anon, authenticated;
grant execute on function public.reservar_avisos_de_evento(integer) to service_role;
```

- [ ] **Step 2: Ensaiar sem gravar**

Primeiro, achar as duas contas que entram na demo (a do teste e a outra):

```sql
select id, user_id, nome, email from usuarios
 where empresa_id = '<EMPRESA_DEMO>' and user_id is not null and deleted_at is null;
```

Depois, via MCP `execute_sql`, rodar numa transação **desfeita**: `begin;` + o conteúdo inteiro da migration + o bloco abaixo + `rollback;`. Trocar `<EMPRESA_DEMO>` pelo id da empresa de demonstração, `<AUTH_TESTE>` pelo `user_id` da conta de teste e `<AUTH_OUTRO>` pelo da outra conta. Os valores saem da consulta acima e da memória do projeto (`empresa-repply-e-de-demonstracao`), e **nunca** entram neste arquivo (CLAUDE.md §6.9).

```sql
select set_config('request.jwt.claims', json_build_object('sub', '<AUTH_TESTE>', 'role', 'authenticated')::text, true);

-- convite: organizador = teste, participantes = teste + outro, daqui a 3 dias
insert into eventos (user_id, grupo_id, criado_por, titulo, inicio, fim, tipo_calendario, cor,
                     avisar_participantes, lembretes_minutos)
select uid, '11111111-1111-4111-8111-111111111111', '<AUTH_TESTE>', 'Ensaio do aviso',
       now() + interval '3 days', now() + interval '3 days 1 hour', 'empresa', '#3b82f6', true, '{1440,60}'
  from unnest(array['<AUTH_TESTE>'::uuid, '<AUTH_OUTRO>'::uuid]) as uid;

-- mudança de horário pelo organizador
update eventos set inicio = inicio + interval '1 day', fim = fim + interval '1 day'
 where grupo_id = '11111111-1111-4111-8111-111111111111';

-- cancelamento pelo organizador
delete from eventos where grupo_id = '11111111-1111-4111-8111-111111111111';

select tipo, avisar, dados->>'titulo' as titulo,
       (select nome from usuarios where id = destinatario_id) as para
  from evento_avisos where grupo_id = '11111111-1111-4111-8111-111111111111'
 order by criado_em;
```

Expected: 3 linhas, **todas para a outra conta** (nunca para quem fez): `convite`, `alteracao`, `cancelamento`. Nenhum erro. Terminar com `rollback;` e conferir que nada ficou:

```sql
select count(*) from information_schema.tables where table_name = 'evento_avisos';
```
Expected: `0`.

- [ ] **Step 3: Commit (só o arquivo; aplicar é na Task 7)**

```bash
git add -- supabase/migrations/20260911130000_agenda_avisos_e_lembretes.sql
git commit --only -m "feat(agenda): fila de avisos, varios lembretes e gatilhos no banco

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/migrations/20260911130000_agenda_avisos_e_lembretes.sql
```

---

### Task 6: O robô — gera lembretes e esvazia a fila

**Files:**
- Modify (reescrita): `supabase/functions/eventos-lembrete/index.ts`

**Interfaces:**
- Consumes: Task 1 (textos), Task 5 (`gerar_lembretes_devidos`, `reservar_avisos_de_evento`, `evento_avisos`), `empresa_tem_secao_de`.
- Produces: resposta JSON `{ lembretes_gerados, avisos, concluidos, erros }`.

- [ ] **Step 1: Reescrever**

Substituir todo o conteúdo de `supabase/functions/eventos-lembrete/index.ts` por:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assuntoDoEmail,
  htmlDoEmail,
  linkDaAgenda,
  mensagemDoSininho,
  textoDoChat,
  tituloDoSininho,
  type AvisoDeEvento,
  type DadosDoEvento,
  type TipoDeAviso,
} from "../_shared/aviso-de-evento.ts";

/**
 * O robô da agenda. Roda a cada 5 min (cron) e também é chamado na hora pelo banco
 * (gatilho `eventos_chama_envio`) sempre que um aviso é anotado.
 *
 * 1. Gera na fila os lembretes que ficaram devidos (`gerar_lembretes_devidos`, idempotente).
 * 2. Reserva até 50 itens da fila sem repetir (`reservar_avisos_de_evento`, SKIP LOCKED).
 * 3. Para cada item, cumpre os canais que faltam — sininho sempre; mensagem direta e e-mail
 *    quando quem criou ligou "avisar participantes". Cada canal tem sua marca: se o e-mail
 *    falhar e o chat não, a próxima tentativa manda só o e-mail. Desiste em 5 tentativas.
 *
 * 🔴 Nenhum erro guardado leva segredo. O corpo da resposta do Resend é cortado em 300.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinhaDoAviso {
  id: string;
  empresa_id: string;
  destinatario_id: string;
  remetente_id: string | null;
  tipo: TipoDeAviso;
  minutos: number | null;
  avisar: boolean;
  dados: DadosDoEvento;
  sininho_em: string | null;
  chat_em: string | null;
  email_em: string | null;
}

const NOME_CANONICO = "RESEND_API_KEY";
function lerChaveDoResend(): string | undefined {
  const exato = Deno.env.get(NOME_CANONICO);
  if (exato) return exato;
  const outraCaixa = Object.keys(Deno.env.toObject()).find((n) => n.toUpperCase() === NOME_CANONICO);
  return outraCaixa ? Deno.env.get(outraCaixa) : undefined;
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const resultado = { lembretes_gerados: 0, avisos: 0, concluidos: 0, erros: [] as string[] };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: gerados, error: eGerar } = await supabase.rpc("gerar_lembretes_devidos");
    if (eGerar) resultado.erros.push(`gerar_lembretes_devidos: ${eGerar.message}`);
    else resultado.lembretes_gerados = (gerados as number) ?? 0;

    const { data: reservados, error: eReservar } = await supabase.rpc("reservar_avisos_de_evento", {
      p_limite: 50,
    });
    if (eReservar) {
      resultado.erros.push(`reservar_avisos_de_evento: ${eReservar.message}`);
      return json(resultado, 500);
    }
    const lista = (reservados ?? []) as LinhaDoAviso[];
    if (lista.length === 0) return json(resultado);

    const ids = [...new Set(lista.flatMap((a) => [a.destinatario_id, a.remetente_id]).filter(Boolean))] as string[];
    const { data: pessoas } = await supabase.from("usuarios").select("id, email").in("id", ids);
    const emailPorId = new Map((pessoas ?? []).map((p) => [p.id as string, p.email as string | null]));

    // Chat desligado na empresa: a mensagem direta não sai; sininho e e-mail, sim.
    const chatPorEmpresa = new Map<string, boolean>();
    for (const empresaId of new Set(lista.map((a) => a.empresa_id))) {
      const { data, error } = await supabase.rpc("empresa_tem_secao_de", {
        p_empresa_id: empresaId,
        p_secao: "chat",
      });
      chatPorEmpresa.set(empresaId, error ? true : data === true);
    }

    const apiKey = lerChaveDoResend();
    const remetente = Deno.env.get("EMAIL_REMETENTE") ?? "Repply <nao-responda@repplyhub.com.br>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://crm.repplyhub.com.br";

    for (const a of lista) {
      resultado.avisos++;
      const aviso: AvisoDeEvento = { tipo: a.tipo, minutos: a.minutos, dados: a.dados };
      const marcas: Record<string, string> = {};
      const erros: string[] = [];
      const agora = () => new Date().toISOString();

      if (!a.sininho_em) {
        const { error } = await supabase.from("notificacoes").insert({
          usuario_id: a.destinatario_id,
          tipo: `evento_${a.tipo}`,
          titulo: tituloDoSininho(aviso),
          mensagem: mensagemDoSininho(aviso),
        });
        if (error) erros.push(`sininho: ${error.message}`);
        else marcas.sininho_em = agora();
      }

      const querChat =
        a.avisar && !!a.remetente_id && a.remetente_id !== a.destinatario_id &&
        chatPorEmpresa.get(a.empresa_id) !== false;
      if (querChat && !a.chat_em) {
        const { error } = await supabase.from("chat_mensagens").insert({
          conteudo: textoDoChat(aviso),
          usuario_id: a.remetente_id,
          empresa_id: a.empresa_id,
          recipient_id: a.destinatario_id,
        });
        if (error) erros.push(`chat: ${error.message}`);
        else marcas.chat_em = agora();
      }

      const email = emailPorId.get(a.destinatario_id);
      const querEmail = a.avisar && !!email;
      if (querEmail && !a.email_em) {
        if (!apiKey) {
          erros.push("email: chave do Resend ausente");
        } else {
          try {
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: remetente,
                to: [email],
                subject: assuntoDoEmail(aviso),
                html: htmlDoEmail(aviso, linkDaAgenda(appUrl, a.dados.inicio)),
              }),
            });
            if (!resp.ok) throw new Error(`Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
            marcas.email_em = agora();
          } catch (e) {
            erros.push(`email: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      const faltaSininho = !a.sininho_em && !marcas.sininho_em;
      const faltaChat = querChat && !a.chat_em && !marcas.chat_em;
      const faltaEmail = querEmail && !a.email_em && !marcas.email_em;
      const concluido = !faltaSininho && !faltaChat && !faltaEmail;
      const ultimoErro = erros.length ? erros.join(" | ").slice(0, 500) : null;

      const { error: eMarcar } = await supabase
        .from("evento_avisos")
        .update({
          ...marcas,
          processando_desde: null,
          ultimo_erro: ultimoErro,
          concluido_em: concluido ? agora() : null,
        })
        .eq("id", a.id);
      if (eMarcar) erros.push(`marcar: ${eMarcar.message}`);

      if (concluido) resultado.concluidos++;
      if (ultimoErro) resultado.erros.push(`${a.id}: ${ultimoErro}`);
    }

    return json(resultado);
  } catch (error) {
    resultado.erros.push(error instanceof Error ? error.message : String(error));
    return json(resultado, 500);
  }
});
```

- [ ] **Step 2: Conferir que compila em Deno**

Run: `npx supabase functions deploy eventos-lembrete --project-ref hukeirrmsoiowvvrhivx --dry-run 2>&1 | tail -5` — se a CLI não tiver `--dry-run`, rodar `deno check supabase/functions/eventos-lembrete/index.ts` (se o `deno` estiver instalado). Se nenhum dos dois existir, a conferência fica para a publicação (Task 7 Step 5), que falha antes de trocar a versão no ar.
Expected: sem erro de tipo.

- [ ] **Step 3: Commit**

```bash
git commit --only -m "feat(agenda): o robo de lembretes passa a mandar convite, mudanca, cancelamento e lembrete por sininho, chat e e-mail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/functions/eventos-lembrete/index.ts
```

---

### Task 7: Verificação final e publicação

- [ ] **Step 1: Suíte completa**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
npm run build
```
Expected: todos os testes passando (novos: 20 de `aviso-de-evento`, 11 de `lembretes-do-evento`, 6 do campo, 3 de `data-do-endereco`); `tsc` ≤ 36; lint ≤ 427; build ok.

- [ ] **Step 2: Conferir o limite do Resend com o Lucas**

Estimativa para mostrar a ele: cerca de 120 e-mails de lembrete por mês em eventos solo com a chave ligada, mais convites e lembretes de eventos com várias pessoas, mais os resumos diários que já saem. Pedir que ele confira o plano do Resend. Seguir só depois da resposta.

- [ ] **Step 3: Pedir o "pode" — banco, robô e site**

Mostrar em linguagem de consequência:
- **Banco:**
  - três colunas novas em eventos;
  - duas tabelas novas (a fila de avisos e os lembretes já enviados);
  - três gatilhos.
  - Nada é apagado.
  - Os eventos que já existem ficam com o aviso desligado, e o lembrete único deles vira o primeiro da lista.
- **Robô:** passa a mandar convite, mudança, cancelamento e lembrete. Com o aviso desligado, continua só no sininho, como hoje.
- **Ordem:** banco, robô e site, **em seguida um do outro**. Entre o banco e o robô, o robô antigo ainda roda e poderia mandar de novo um lembrete já enviado.

- [ ] **Step 4: Aplicar a migration (depois do "pode")**

MCP `apply_migration`, `project_id: hukeirrmsoiowvvrhivx`, `name: agenda_avisos_e_lembretes`, conteúdo exato do arquivo da Task 5. Conferir:

```sql
select count(*) filter (where lembretes_minutos <> '{}') as com_lembrete,
       count(*) filter (where avisar_participantes) as com_aviso_ligado
  from eventos;
select tgname from pg_trigger
 where tgrelid = 'public.eventos'::regclass
   and tgname in ('eventos_prepara_lembretes','eventos_anota_aviso','eventos_chama_envio');
```
Expected: `com_lembrete` igual ao número de eventos com `lembrete_minutos` antes da migration; `com_aviso_ligado` = 0; os 3 gatilhos listados.

- [ ] **Step 5: Publicar o robô (logo em seguida)**

```bash
npx supabase functions deploy eventos-lembrete --project-ref hukeirrmsoiowvvrhivx
```
Expected: "Deployed Functions … eventos-lembrete". `verify_jwt = false` preservado por `supabase/config.toml:12-13`.

- [ ] **Step 6: Publicar o site (só os commits deste bloco)**

Mesmo caminho dos blocos anteriores: `git cherry -v origin/main HEAD` → `git worktree add ../_publicar-agenda origin/main` → `git cherry-pick <hashes das Tasks 1–6>` → `git diff --stat HEAD <HEAD testado> -- <arquivos deste bloco>` vazio → `git push origin HEAD:main` → `git worktree remove --force ../_publicar-agenda`. Conferir `gh api repos/Repply-Hub/Repply-CRM/commits/<hash>/status --jq .state` = `success`.

- [ ] **Step 7: Teste de ponta a ponta (com o Lucas)**

Perguntar ao Lucas qual das duas contas da demo tem e-mail que ele consegue ler. No navegador do app, logado com a conta de teste, em `/calendario`:
1. Criar "Teste de aviso" para daqui a 2 horas, com a outra conta como participante, chave ligada, lembretes padrão.
   - A outra conta recebe em até 1 minuto: a mensagem direta "📅 Convite automático: …", o registro no sininho e o e-mail.
   - O lembrete de 1 dia não sai, porque o horário dele já passou antes da criação.
2. Mudar o horário para daqui a 3 horas → chegam "📅 Evento alterado: …" e o e-mail.
3. Excluir → chegam "📅 Evento cancelado: …" e o e-mail.

Conferir a fila:
```sql
select tipo, sininho_em is not null as sininho, chat_em is not null as chat, email_em is not null as email, ultimo_erro
  from evento_avisos order by criado_em desc limit 5;
```
Expected: 3 linhas com `sininho`, `chat` e `email` verdadeiros, e `ultimo_erro` nulo.
