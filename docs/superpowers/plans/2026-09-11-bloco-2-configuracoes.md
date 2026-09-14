# Bloco 2 — Configurações: data da assinatura, escolha de som e equilíbrio da tela

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Assinatura mostra desde quando a empresa assina (ou tem cortesia); cada pessoa escolhe o som das próprias notificações entre 10 opções, com botão de ouvir; a aba Perfil fica com as duas colunas equilibradas.

**Architecture:** Três partes independentes que só dividem a tela de Configurações. (1) Uma coluna nova `empresa_assinaturas.assinatura_iniciada_em`, preenchida pelo webhook do Stripe, lida por uma função pura (`inicioDaAssinatura`) que a aba usa. (2) Um catálogo puro de sons (`catalogo-de-sons.ts`), a escolha guardada no navegador (`use-som-escolhido.ts`), e `som.ts` tocando o arquivo escolhido; a interface sai de `Configuracoes.tsx` para `CardDeSom.tsx`. (3) A posição do cartão Personalizar passa a depender de a empresa ter o módulo de e-mail.

**Tech Stack:** React 18 + TS, Vitest + Testing Library, Supabase (migration via MCP `apply_migration`, função pela CLI), Python 3 + numpy + ffmpeg 8.1 (já instalados) para os sons.

**Spec:** `docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md`, Bloco 2.

## Global Constraints

- Outra sessão divide a pasta: **nunca** `git add -A`/`git add .`; commit com `git commit --only -m "…" -- <arquivos>` (arquivo novo: `git add -- <arquivo>` antes).
- `git push` publica em produção; migration e publicação de função **só com o "pode" do Lucas**, e a migration vai **antes** da função (Task 6).
- Migration aplicada sozinha via MCP `apply_migration` — nunca `supabase db push`.
- Publicar só os commits deste bloco (worktree, Task 6).
- Não imprimir nem transmitir `SUPABASE_SERVICE_ROLE_KEY` nem nenhum segredo.
- Linha de base que não pode piorar: `npm run test` ≥ o que o Bloco 1 deixou; `tsc` 36; lint 427; build ok.
- Textos exatos da tela: "Assinatura iniciada em", "Cortesia desde", "Quero mudar o som das minhas notificações", "Criados pela Repply", rótulos dos sons: Padrão, Toque suave, Plim, Cristal, Arpejo, Pop, Marimba, Sino, Gota, Bipe duplo.
- Chave do navegador para o som escolhido: `repply_som_notificacao`. Volume-alvo dos arquivos de opção: **−15 LUFS**.
- Pasta final dos sons: `public/sons/opcoes/`. Os originais do Lucas estão em `public/sons/opções secundárias/` (não versionados).

## Arquivos

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/20260911120000_assinatura_iniciada_em.sql` (novo) | coluna nova |
| `src/integrations/supabase/types.ts:1692-1734` | tipos da coluna, à mão |
| `supabase/functions/stripe-webhook/index.ts:226` | grava `sub.start_date` |
| `src/lib/inicio-da-assinatura.ts` (novo) + `.test.ts` | decide rótulo e data |
| `src/components/configuracoes/PagamentosTab.tsx` (+ teste existente) | mostra a linha |
| `scripts/gerar-sons-de-notificacao.py` (novo) | gera os 4 sons e nivela os 9 |
| `public/sons/opcoes/*.mp3` (novos, 9) | arquivos servidos |
| `src/lib/catalogo-de-sons.ts` (novo) + `.test.ts` | lista de sons e fallback |
| `src/hooks/use-som-escolhido.ts` (novo) + `.test.ts` | escolha no navegador |
| `src/lib/som.ts` (+ `som.test.ts`) | toca o arquivo escolhido; `ouvirAmostra` |
| `src/lib/aviso-de-mensagem-nova.ts` | passa o som escolhido |
| `src/components/configuracoes/CardDeSom.tsx` (novo) + `.test.tsx` | cartão com a lista recolhida |
| `src/pages/Configuracoes.tsx` | usa o cartão novo; equilíbrio das colunas |

---

### Task 1: Data de início da assinatura

**Files:**
- Create: `supabase/migrations/20260911120000_assinatura_iniciada_em.sql`
- Modify: `src/integrations/supabase/types.ts` (blocos `empresa_assinaturas` Row/Insert/Update)
- Modify: `supabase/functions/stripe-webhook/index.ts:226`
- Create: `src/lib/inicio-da-assinatura.ts`, `src/lib/inicio-da-assinatura.test.ts`
- Modify: `src/components/configuracoes/PagamentosTab.tsx`, `src/components/configuracoes/PagamentosTab.test.tsx`

**Interfaces:**
- Consumes: `extrairAssinatura`, `extrairEmpresa`, `situacaoDoMeuPlano` de `@/lib/plano-gate`; `SituacaoCS` de `@/lib/situacao-empresa`.
- Produces: `inicioDaAssinatura(e: EntradaDoInicio): InicioDaAssinatura | null`, com `InicioDaAssinatura = { rotulo: 'Assinatura iniciada em' | 'Cortesia desde'; em: string }`.

- [ ] **Step 1: Teste da regra (falha)**

Criar `src/lib/inicio-da-assinatura.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { inicioDaAssinatura } from './inicio-da-assinatura';

const INICIO = '2026-05-15T12:00:00.000Z';
const CRIADA = '2026-03-10T12:00:00.000Z';

describe('inicioDaAssinatura', () => {
  it('pagante usa a data de início que o provedor informou', () => {
    expect(
      inicioDaAssinatura({ situacao: 'pagante', assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA }),
    ).toEqual({ rotulo: 'Assinatura iniciada em', em: INICIO });
  });

  it('🔴 pagante sem a data do provedor não mostra nada — nunca inventa', () => {
    expect(
      inicioDaAssinatura({ situacao: 'pagante', assinaturaIniciadaEm: null, empresaCriadaEm: CRIADA }),
    ).toBeNull();
  });

  it('cortesia (inclui legacy) usa a data de criação da empresa', () => {
    expect(
      inicioDaAssinatura({ situacao: 'cortesia', assinaturaIniciadaEm: null, empresaCriadaEm: CRIADA }),
    ).toEqual({ rotulo: 'Cortesia desde', em: CRIADA });
  });

  it('cortesia ignora data de assinatura, mesmo que exista', () => {
    expect(
      inicioDaAssinatura({ situacao: 'cortesia', assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA })?.em,
    ).toBe(CRIADA);
  });

  it.each(['trial', 'trial_vencido', 'bloqueada', 'nunca_pagou'] as const)(
    '%s não mostra data de início',
    (situacao) => {
      expect(
        inicioDaAssinatura({ situacao, assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA }),
      ).toBeNull();
    },
  );

  it('data ilegível vale como ausente', () => {
    expect(
      inicioDaAssinatura({ situacao: 'pagante', assinaturaIniciadaEm: 'abc', empresaCriadaEm: CRIADA }),
    ).toBeNull();
    expect(
      inicioDaAssinatura({ situacao: 'cortesia', assinaturaIniciadaEm: null, empresaCriadaEm: 42 }),
    ).toBeNull();
  });

  it('situação desconhecida não mostra nada', () => {
    expect(
      inicioDaAssinatura({ situacao: null, assinaturaIniciadaEm: INICIO, empresaCriadaEm: CRIADA }),
    ).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/inicio-da-assinatura.test.ts`
Expected: FAIL — `Failed to resolve import "./inicio-da-assinatura"`.

- [ ] **Step 2: Implementar a regra**

Criar `src/lib/inicio-da-assinatura.ts`:

```ts
import type { SituacaoCS } from './situacao-empresa';

/**
 * Desde quando a empresa assina — ou, na cortesia, desde quando usa.
 *
 * 🔴 NÃO É `ativado_em`. Aquele campo é regravado pelo webhook a cada evento que
 * libera acesso (renovação inclusive) e, nas legacy, guarda a hora da migration que
 * as liberou. A data de início vem de `assinatura_iniciada_em`, que o webhook
 * preenche com o `start_date` que o próprio provedor informa.
 *
 * Decisão do dono do produto (11/09/2026): pagante → início no provedor; cortesia →
 * criação da empresa; o resto não mostra data. Sem a data, não mostra — nunca chuta.
 */
export type RotuloDoInicio = 'Assinatura iniciada em' | 'Cortesia desde';

export interface InicioDaAssinatura {
  rotulo: RotuloDoInicio;
  /** ISO, como veio do banco. Quem desenha formata. */
  em: string;
}

export interface EntradaDoInicio {
  situacao: SituacaoCS | null;
  assinaturaIniciadaEm: unknown;
  empresaCriadaEm: unknown;
}

function isoValido(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || !bruto.trim()) return null;
  return Number.isNaN(new Date(bruto).getTime()) ? null : bruto;
}

export function inicioDaAssinatura(e: EntradaDoInicio): InicioDaAssinatura | null {
  if (e.situacao === 'pagante') {
    const em = isoValido(e.assinaturaIniciadaEm);
    return em ? { rotulo: 'Assinatura iniciada em', em } : null;
  }
  if (e.situacao === 'cortesia') {
    const em = isoValido(e.empresaCriadaEm);
    return em ? { rotulo: 'Cortesia desde', em } : null;
  }
  return null;
}
```

Run: `npx vitest run src/lib/inicio-da-assinatura.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 3: Teste da tela (falha)**

Em `src/components/configuracoes/PagamentosTab.test.tsx`, trocar a função `comAssinatura` (linhas 63-72) por:

```tsx
function comAssinatura(assinatura: Record<string, unknown> | null, empresaCriadaEm?: string) {
  useAuthFalso.mockReturnValue({
    profile: {
      id: 'usuario-1',
      role: 'gestor',
      empresas: {
        id: 'empresa-1',
        nome: 'Construtora Meridiano',
        created_at: empresaCriadaEm,
        empresa_assinaturas: assinatura,
      },
    },
    session: { user: { id: 'auth-1' } },
  });
}
```

e acrescentar, antes do `});` final do `describe`:

```tsx
  it('cortesia mostra desde quando, pela criação da empresa', () => {
    comAssinatura({ plan_status: 'active', origem: 'cortesia' }, '2026-03-10T12:00:00.000Z');
    render(<PagamentosTab />);
    expect(screen.getByText(/cortesia desde/i)).toBeTruthy();
    expect(screen.getByText(/10 de março de 2026/i)).toBeTruthy();
  });

  it('pagante mostra o início da assinatura no provedor', () => {
    comAssinatura({ ...PAGANTE, assinatura_iniciada_em: '2026-05-15T12:00:00.000Z' });
    render(<PagamentosTab />);
    expect(screen.getByText(/assinatura iniciada em/i)).toBeTruthy();
    expect(screen.getByText(/maio de 2026/i)).toBeTruthy();
  });

  it('🔴 pagante sem a data do provedor não ganha linha de início', () => {
    comAssinatura(PAGANTE);
    render(<PagamentosTab />);
    expect(screen.queryByText(/assinatura iniciada em/i)).toBeNull();
  });

  it('teste não mostra data de início', () => {
    comAssinatura({ plan_status: 'trialing', origem: 'trial', current_period_end: AMANHA }, '2026-03-10T12:00:00.000Z');
    render(<PagamentosTab />);
    expect(screen.queryByText(/desde|iniciada em/i)).toBeNull();
  });
```

Run: `npx vitest run src/components/configuracoes/PagamentosTab.test.tsx`
Expected: FAIL nos dois primeiros testes novos (texto não encontrado); os outros passam.

- [ ] **Step 4: Mostrar a linha na aba**

Em `src/components/configuracoes/PagamentosTab.tsx`:

Linha 9 — trocar o import por:
```tsx
import { extrairAssinatura, extrairEmpresa, situacaoDoMeuPlano } from '@/lib/plano-gate';
import { inicioDaAssinatura } from '@/lib/inicio-da-assinatura';
```

Logo depois de `const renovaEm = porExtenso(assinatura?.current_period_end);` (linha 100), acrescentar:
```tsx
  const inicio = inicioDaAssinatura({
    situacao,
    assinaturaIniciadaEm: assinatura?.assinatura_iniciada_em,
    empresaCriadaEm: extrairEmpresa(profile)?.created_at,
  });
  const inicioPorExtenso = inicio ? porExtenso(inicio.em) : null;
```

Logo depois de `<p className="max-w-[65ch] text-sm text-muted-foreground">{explica}</p>` (linha 133), acrescentar:
```tsx
          {inicio && inicioPorExtenso && (
            <p className="text-sm">
              <span className="text-muted-foreground">{inicio.rotulo} </span>
              <span className="font-medium">{inicioPorExtenso}</span>
            </p>
          )}
```

Run: `npx vitest run src/components/configuracoes/PagamentosTab.test.tsx src/lib/inicio-da-assinatura.test.ts`
Expected: PASS em todos.

- [ ] **Step 5: Migration, tipos e webhook**

Criar `supabase/migrations/20260911120000_assinatura_iniciada_em.sql`:

```sql
-- Desde quando a assinatura ATUAL existe, segundo o provedor de pagamento.
--
-- POR QUE NÃO `ativado_em`: o stripe-webhook grava now() nele a cada evento que libera
-- acesso — renovação inclusive —, então com o tempo ele vira "o último evento", não
-- "o início". Nas legacy ele guarda a hora da migration que as liberou.
--
-- O nome não diz "stripe" de propósito: quando o provedor mudar, o novo preenche o
-- mesmo campo e a tela não muda.
--
-- Sem preenchimento retroativo: hoje só uma empresa, de teste, passa pelo Stripe, e ela
-- recebe o valor no próximo evento. Até lá a tela não mostra a linha — nunca chuta.
ALTER TABLE public.empresa_assinaturas
  ADD COLUMN IF NOT EXISTS assinatura_iniciada_em timestamptz;

COMMENT ON COLUMN public.empresa_assinaturas.assinatura_iniciada_em IS
  'Inicio da assinatura atual segundo o provedor (Stripe: subscription.start_date). Nulo em cortesia/legacy e ate o primeiro evento do provedor.';
```

Em `src/integrations/supabase/types.ts`, no bloco `empresa_assinaturas`, acrescentar logo depois de cada linha `ativado_em`:
- em `Row` (após a linha 1694): `          assinatura_iniciada_em: string | null`
- em `Insert` (após a linha 1708): `          assinatura_iniciada_em?: string | null`
- em `Update` (após a linha 1722): `          assinatura_iniciada_em?: string | null`

Em `supabase/functions/stripe-webhook/index.ts`, logo depois da linha 226 (`if (liberado) patch.ativado_em = new Date().toISOString();`), acrescentar:

```ts
  // O início que o PRÓPRIO Stripe informa. Fixo dentro de uma assinatura; uma nova
  // (depois de um cancelamento) traz a data dela. Gravado a cada evento que o tiver —
  // regravar o mesmo valor é inofensivo, e é o que conserta uma linha que ficou nula.
  if (typeof sub.start_date === "number") {
    patch.assinatura_iniciada_em = new Date(sub.start_date * 1000).toISOString();
  }
```

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: ≤ 36 (a função Deno não entra no `tsconfig.app.json`; a tela, sim).

- [ ] **Step 6: Commit**

```bash
git add -- src/lib/inicio-da-assinatura.ts src/lib/inicio-da-assinatura.test.ts supabase/migrations/20260911120000_assinatura_iniciada_em.sql
git commit --only -m "feat(assinatura): a aba mostra desde quando a empresa assina ou tem cortesia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/inicio-da-assinatura.ts src/lib/inicio-da-assinatura.test.ts supabase/migrations/20260911120000_assinatura_iniciada_em.sql src/integrations/supabase/types.ts supabase/functions/stripe-webhook/index.ts src/components/configuracoes/PagamentosTab.tsx src/components/configuracoes/PagamentosTab.test.tsx
```

⚠️ `types.ts` pode ter mudanças de outra sessão. Antes do commit, rodar `git diff -- src/integrations/supabase/types.ts` e conferir que só aparecem as 3 linhas deste passo. Se houver mais, **não** commitar `types.ts` neste passo: tirar o arquivo da lista do `git commit --only`, commitar o resto e avisar. A separação das 3 linhas é feita à mão depois: gravar `git diff -U0` num patch, apagar os trechos que não são deste passo e aplicar com `git apply --cached --unidiff-zero`. O ambiente não aceita `git add -p`, que é interativo.

---

### Task 2: Os arquivos de som

**Files:**
- Create: `scripts/gerar-sons-de-notificacao.py`
- Create: `public/sons/opcoes/{toque-suave,plim,cristal,arpejo,pop,marimba,sino,gota,bipe-duplo}.mp3`

**Interfaces:**
- Consumes: os 5 arquivos do Lucas em `public/sons/opções secundárias/`.
- Produces: 9 arquivos em `public/sons/opcoes/`, todos a −15 LUFS ± 1, mono, 44,1 kHz, 128 kbps. A Task 3 aponta para eles pelos nomes acima.

- [ ] **Step 1: Guardar cópia dos originais**

```bash
mkdir -p ../_sons-originais
cp "public/sons/opções secundárias/"*.mp3 ../_sons-originais/
ls ../_sons-originais | wc -l
```
Expected: `5`.

- [ ] **Step 2: Escrever o gerador**

Criar `scripts/gerar-sons-de-notificacao.py`:

```python
"""
Gera os sons de notificação criados pela Repply e nivela o volume de TODAS as
opções pelo som padrão (≈ −15 LUFS), para que trocar de som não mude o volume.

Uso (na raiz do repositório):
  python scripts/gerar-sons-de-notificacao.py "public/sons/opções secundárias"

Saída: public/sons/opcoes/*.mp3 — mono, 44,1 kHz, 128 kbps.

Os 4 sons "da Repply" são sintetizados aqui, por soma de senoides: não há
arquivo de terceiro, então não há direito autoral a verificar. Os outros 5 são
os arquivos que o dono do produto escolheu (Pixabay), só renomeados e nivelados.
"""
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "public", "sons", "opcoes")
ALVO_LUFS = -15.0
SR = 44100

DO_LUCAS = {
    "dragon-studio-new-notification-3-398649.mp3": "toque-suave.mp3",
    "dragon-studio-notification-sound-effect-372475.mp3": "plim.mp3",
    "universfield-new-notification-051-494246.mp3": "cristal.mp3",
    "universfield-new-notification-059-494262.mp3": "arpejo.mp3",
    "universfield-new-notification-062-494544.mp3": "pop.mp3",
}


def nota(freq, dur, parciais, queda, ataque=0.004):
    """Uma nota: soma de parciais (razão, amplitude, fator de queda), com ataque curto."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for razao, amp, fator in parciais:
        s += amp * np.sin(2 * np.pi * freq * razao * t) * np.exp(-t / (queda * fator))
    return s * np.minimum(1.0, t / ataque)


def colar(partes, inicios, total):
    """Posiciona cada sinal no seu instante, numa faixa de `total` segundos."""
    out = np.zeros(int(total * SR))
    for sinal, ini in zip(partes, inicios):
        i = int(ini * SR)
        fim = min(len(out), i + len(sinal))
        out[i:fim] += sinal[: fim - i]
    return out


def marimba():
    p = [(1.0, 1.0, 1.0), (3.9, 0.35, 0.35), (9.2, 0.08, 0.15)]
    return colar([nota(784, 0.5, p, 0.14), nota(659, 0.6, p, 0.16)], [0.0, 0.13], 0.8)


def sino():
    p = [(0.56, 0.5, 1.6), (0.92, 0.6, 1.2), (1.19, 0.9, 1.0), (1.71, 0.4, 0.7),
         (2.0, 0.35, 0.6), (2.74, 0.25, 0.4), (3.0, 0.2, 0.35), (4.07, 0.1, 0.25)]
    return nota(1320, 1.8, p, 0.6, ataque=0.002)


def gota():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 500 + 900 * np.exp(-t / 0.05)  # desce de ~1400 Hz para ~500 Hz
    fase = 2 * np.pi * np.cumsum(f) / SR
    envelope = np.minimum(1.0, t / 0.003) * np.exp(-t / 0.09)
    return colar([np.sin(fase) * envelope], [0.0], 0.6)


def bipe_duplo():
    def bipe():
        dur = 0.09
        n = int(dur * SR)
        t = np.arange(n) / SR
        s = np.sin(2 * np.pi * 1046 * t) + 0.15 * np.sin(2 * np.pi * 2092 * t)
        borda = np.clip(np.minimum(t / 0.01, (dur - t) / 0.01), 0.0, 1.0)
        return s * borda
    return colar([bipe(), bipe()], [0.0, 0.16], 0.6)


GERADOS = {"marimba.mp3": marimba, "sino.mp3": sino, "gota.mp3": gota, "bipe-duplo.mp3": bipe_duplo}


def lufs(caminho):
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", caminho, "-af", "ebur128", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    achados = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    if not achados:
        raise RuntimeError(f"não consegui medir o volume de {caminho}")
    return float(achados[-1])


def gerar_wav(sinal, caminho):
    sinal = (sinal / np.max(np.abs(sinal)) * 0.8).astype(np.float32)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", caminho],
        input=sinal.tobytes(), check=True,
    )


def gravar_mp3(origem, destino, ganho_db):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", origem,
         "-af", f"volume={ganho_db:.2f}dB,alimiter=limit=0.95",
         "-ac", "1", "-ar", str(SR), "-codec:a", "libmp3lame", "-b:a", "128k", destino],
        check=True,
    )


def main():
    if len(sys.argv) != 2:
        sys.exit('uso: python scripts/gerar-sons-de-notificacao.py "<pasta com os arquivos do Lucas>"')
    origem = sys.argv[1]
    os.makedirs(DESTINO, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        fontes = {}
        for antigo, novo in DO_LUCAS.items():
            caminho = os.path.join(origem, antigo)
            if not os.path.exists(caminho):
                sys.exit(f"faltou {caminho}")
            fontes[novo] = caminho
        for novo, fabrica in GERADOS.items():
            wav = os.path.join(tmp, novo.replace(".mp3", ".wav"))
            gerar_wav(fabrica(), wav)
            fontes[novo] = wav
        for novo, caminho in fontes.items():
            destino = os.path.join(DESTINO, novo)
            gravar_mp3(caminho, destino, ALVO_LUFS - lufs(caminho))
            print(f"{novo:18s} {lufs(destino):6.1f} LUFS")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Rodar o gerador**

Run: `PYTHONIOENCODING=utf-8 python scripts/gerar-sons-de-notificacao.py "public/sons/opções secundárias"`
Expected: 9 linhas, cada uma entre −16,0 e −14,0 LUFS. Se alguma sair fora, rodar de novo apontando para `public/sons/opcoes` só aquele arquivo (a segunda passada corrige o erro do limitador).

- [ ] **Step 4: Remover a pasta antiga**

A cópia está em `../_sons-originais`, fora do repositório (Step 1), e os 5 já existem em `public/sons/opcoes/` com nome novo.
```bash
ls public/sons/opcoes | wc -l
rm -r "public/sons/opções secundárias"
```
Expected: `9` antes do `rm`.

- [ ] **Step 5: Commit**

```bash
git add -- scripts/gerar-sons-de-notificacao.py public/sons/opcoes
git commit --only -m "feat(som): nove opcoes de som de notificacao, com o mesmo volume do padrao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- scripts/gerar-sons-de-notificacao.py public/sons/opcoes
```

---

### Task 3: Catálogo, escolha no navegador e o som tocando o escolhido

**Files:**
- Create: `src/lib/catalogo-de-sons.ts`, `src/lib/catalogo-de-sons.test.ts`
- Create: `src/hooks/use-som-escolhido.ts`, `src/hooks/use-som-escolhido.test.ts`
- Modify: `src/lib/som.ts`, `src/lib/som.test.ts`, `src/lib/aviso-de-mensagem-nova.ts:4,56`

**Interfaces:**
- Consumes: arquivos da Task 2.
- Produces:
  - `SOM_PADRAO = 'padrao'`; `CATALOGO_DE_SONS: readonly SomDeNotificacao[]`; `somDoCatalogo(id: string | null | undefined): SomDeNotificacao`; `interface SomDeNotificacao { id: string; rotulo: string; arquivo: string; grupo: 'padrao' | 'opcoes' | 'repply' }`.
  - `somEscolhido(): string`; `useSomEscolhido(): { id: string; escolher: (id: string) => void }`.
  - `ouvirAmostra(id: string): void`; `ContextoDaNotificacao.somId?: string | null`.

- [ ] **Step 1: Teste do catálogo (falha)**

Criar `src/lib/catalogo-de-sons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO_DE_SONS, SOM_PADRAO, somDoCatalogo } from './catalogo-de-sons';

describe('catálogo de sons', () => {
  it('o primeiro é o padrão de hoje', () => {
    expect(CATALOGO_DE_SONS[0]).toMatchObject({ id: SOM_PADRAO, rotulo: 'Padrão', arquivo: '/sons/notificacao.mp3' });
  });

  it('tem os 10 sons, na ordem da tela', () => {
    expect(CATALOGO_DE_SONS.map((s) => s.rotulo)).toEqual([
      'Padrão', 'Toque suave', 'Plim', 'Cristal', 'Arpejo', 'Pop', 'Marimba', 'Sino', 'Gota', 'Bipe duplo',
    ]);
  });

  it('ids não se repetem', () => {
    const ids = CATALOGO_DE_SONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('🔴 nenhum endereço tem acento ou espaço — quebram em servidor e cache', () => {
    for (const s of CATALOGO_DE_SONS) expect(s.arquivo).toMatch(/^\/sons\/[a-z0-9/-]+\.mp3$/);
  });

  it('🔴 todo arquivo do catálogo existe em public/ — senão a opção fica muda', () => {
    for (const s of CATALOGO_DE_SONS) expect(existsSync(join('public', s.arquivo))).toBe(true);
  });

  it('id desconhecido (som retirado no futuro) cai no padrão', () => {
    expect(somDoCatalogo('som-que-nao-existe').id).toBe(SOM_PADRAO);
    expect(somDoCatalogo(null).id).toBe(SOM_PADRAO);
    expect(somDoCatalogo(undefined).id).toBe(SOM_PADRAO);
  });

  it('id conhecido devolve o próprio som', () => {
    expect(somDoCatalogo('sino').arquivo).toBe('/sons/opcoes/sino.mp3');
  });
});
```

Run: `npx vitest run src/lib/catalogo-de-sons.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar o catálogo**

Criar `src/lib/catalogo-de-sons.ts`:

```ts
/**
 * Os sons que a pessoa pode escolher para as próprias notificações.
 *
 * Puro de propósito: é a lista que a tela desenha e que `som.ts` consulta, e um id
 * que sumir da lista (som retirado no futuro) precisa cair no padrão sem erro — é a
 * regra que o teste trava.
 *
 * Rótulos: vieram da análise do áudio (notas, altura, duração) — ninguém da equipe
 * precisa decorar nome de arquivo. Trocar um rótulo é mexer só aqui.
 */
export type GrupoDoSom = 'padrao' | 'opcoes' | 'repply';

export interface SomDeNotificacao {
  id: string;
  rotulo: string;
  arquivo: string;
  grupo: GrupoDoSom;
}

export const SOM_PADRAO = 'padrao';

export const CATALOGO_DE_SONS: readonly SomDeNotificacao[] = [
  { id: SOM_PADRAO, rotulo: 'Padrão', arquivo: '/sons/notificacao.mp3', grupo: 'padrao' },
  { id: 'toque-suave', rotulo: 'Toque suave', arquivo: '/sons/opcoes/toque-suave.mp3', grupo: 'opcoes' },
  { id: 'plim', rotulo: 'Plim', arquivo: '/sons/opcoes/plim.mp3', grupo: 'opcoes' },
  { id: 'cristal', rotulo: 'Cristal', arquivo: '/sons/opcoes/cristal.mp3', grupo: 'opcoes' },
  { id: 'arpejo', rotulo: 'Arpejo', arquivo: '/sons/opcoes/arpejo.mp3', grupo: 'opcoes' },
  { id: 'pop', rotulo: 'Pop', arquivo: '/sons/opcoes/pop.mp3', grupo: 'opcoes' },
  { id: 'marimba', rotulo: 'Marimba', arquivo: '/sons/opcoes/marimba.mp3', grupo: 'repply' },
  { id: 'sino', rotulo: 'Sino', arquivo: '/sons/opcoes/sino.mp3', grupo: 'repply' },
  { id: 'gota', rotulo: 'Gota', arquivo: '/sons/opcoes/gota.mp3', grupo: 'repply' },
  { id: 'bipe-duplo', rotulo: 'Bipe duplo', arquivo: '/sons/opcoes/bipe-duplo.mp3', grupo: 'repply' },
];

export function somDoCatalogo(id: string | null | undefined): SomDeNotificacao {
  return CATALOGO_DE_SONS.find((s) => s.id === id) ?? CATALOGO_DE_SONS[0];
}
```

Run: `npx vitest run src/lib/catalogo-de-sons.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 3: Teste da escolha no navegador (falha)**

Criar `src/hooks/use-som-escolhido.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { somEscolhido, useSomEscolhido } from './use-som-escolhido';

beforeEach(() => localStorage.clear());

describe('som escolhido', () => {
  it('sem escolha, é o padrão', () => {
    expect(somEscolhido()).toBe('padrao');
    expect(renderHook(() => useSomEscolhido()).result.current.id).toBe('padrao');
  });

  it('escolher grava no navegador e muda na hora', () => {
    const { result } = renderHook(() => useSomEscolhido());
    act(() => result.current.escolher('sino'));
    expect(result.current.id).toBe('sino');
    expect(localStorage.getItem('repply_som_notificacao')).toBe('sino');
    expect(somEscolhido()).toBe('sino');
  });

  it('valor estranho no navegador vale como padrão', () => {
    localStorage.setItem('repply_som_notificacao', 'som-apagado');
    expect(somEscolhido()).toBe('padrao');
  });

  it('escolher um id desconhecido grava o padrão, nunca lixo', () => {
    const { result } = renderHook(() => useSomEscolhido());
    act(() => result.current.escolher('inventado'));
    expect(localStorage.getItem('repply_som_notificacao')).toBe('padrao');
  });
});
```

Run: `npx vitest run src/hooks/use-som-escolhido.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar a escolha**

Criar `src/hooks/use-som-escolhido.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { SOM_PADRAO, somDoCatalogo } from '@/lib/catalogo-de-sons';

/**
 * Qual som a pessoa quer ouvir nas notificações. Vive no navegador dela, como o
 * liga/desliga (use-som-ligado): é preferência de PESSOA — decisão do dono do produto,
 * "individual e não a nível de todos da empresa".
 */
const CHAVE = 'repply_som_notificacao';

/** Leitura crua, para quem precisa do valor fora de um componente. */
export function somEscolhido(): string {
  try {
    return somDoCatalogo(localStorage.getItem(CHAVE)).id;
  } catch {
    return SOM_PADRAO;
  }
}

export function useSomEscolhido() {
  const [id, setId] = useState(somEscolhido);

  // Duas abas abertas: trocar numa troca na outra.
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) setId(somEscolhido());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  const escolher = useCallback((novo: string) => {
    const valido = somDoCatalogo(novo).id;
    try {
      localStorage.setItem(CHAVE, valido);
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
    setId(valido);
  }, []);

  return { id, escolher };
}
```

Run: `npx vitest run src/hooks/use-som-escolhido.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Teste do som tocando o escolhido (falha)**

Em `src/lib/som.test.ts`, trocar as linhas 1-2 por:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { devoTocarNotificacao, ouvirAmostra, tocarNotificacao } from './som';
```

e acrescentar ao fim do arquivo:

```ts
describe('qual arquivo toca', () => {
  const criados: string[] = [];
  beforeEach(() => {
    criados.length = 0;
    vi.stubGlobal(
      'Audio',
      class {
        preload = '';
        currentTime = 0;
        constructor(src: string) { criados.push(src); }
        play() { return Promise.resolve(); }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a amostra toca o som pedido', () => {
    ouvirAmostra('marimba');
    expect(criados).toContain('/sons/opcoes/marimba.mp3');
  });

  it('a amostra de um id desconhecido toca o padrão', () => {
    ouvirAmostra('nao-existe');
    expect(criados).toContain('/sons/notificacao.mp3');
  });

  it('a notificação toca o som escolhido', () => {
    tocarNotificacao({ ligado: true, somId: 'gota' });
    expect(criados).toContain('/sons/opcoes/gota.mp3');
  });
});
```

Run: `npx vitest run src/lib/som.test.ts`
Expected: FAIL — `ouvirAmostra` não é exportado.

- [ ] **Step 6: `som.ts` toca o escolhido**

Em `src/lib/som.ts`:

No topo, depois do bloco de comentário (antes de `const INTERVALO_MINIMO_MS`), acrescentar:
```ts
import { somDoCatalogo } from './catalogo-de-sons';
```

Trocar a interface `ContextoDaNotificacao` (linhas 98-102) por:
```ts
export interface ContextoDaNotificacao {
  ligado: boolean;
  /** Conversa que gerou a notificação, quando houver. */
  conversaId?: string | null;
  /** O som escolhido pela pessoa. Ausente ou desconhecido = padrão. */
  somId?: string | null;
}
```

Em `tocarNotificacao`, trocar `tocar('/sons/notificacao.mp3');` por:
```ts
  tocar(somDoCatalogo(ctx.somId).arquivo);
```

Acrescentar, depois de `tocarNotificacao`:
```ts
/**
 * O ▶ da tela de Configurações. Toca mesmo com o som desligado e ignora o intervalo
 * mínimo: é um gesto explícito da pessoa, não um aviso — e não conta como toque de
 * notificação (não mexe em `ultimoToqueEm`).
 */
export function ouvirAmostra(id: string): void {
  tocar(somDoCatalogo(id).arquivo);
}
```

Em `src/lib/aviso-de-mensagem-nova.ts`, depois da linha 4, acrescentar:
```ts
import { somEscolhido } from '@/hooks/use-som-escolhido';
```
e trocar a linha 56 por:
```ts
  tocarNotificacao({ ligado: somLigado(), conversaId, somId: somEscolhido() });
```

Run: `npx vitest run src/lib/som.test.ts src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.test.ts`
Expected: PASS em todos (7 antigos + 3 novos em `som.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/catalogo-de-sons.ts src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.ts src/hooks/use-som-escolhido.test.ts
git commit --only -m "feat(som): a notificacao toca o som que a pessoa escolheu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/catalogo-de-sons.ts src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.ts src/hooks/use-som-escolhido.test.ts src/lib/som.ts src/lib/som.test.ts src/lib/aviso-de-mensagem-nova.ts
```

---

### Task 4: O cartão de som com a lista recolhida

**Files:**
- Create: `src/components/configuracoes/CardDeSom.tsx`, `src/components/configuracoes/CardDeSom.test.tsx`
- Modify: `src/pages/Configuracoes.tsx` (remove a função local `CardDeSom`, linhas 136-173, e imports que ficarem sem uso)

**Interfaces:**
- Consumes: `useSomLigado` (existente), `useSomEscolhido`, `CATALOGO_DE_SONS`, `ouvirAmostra` (Task 3).
- Produces: `export function CardDeSom(): JSX.Element`.

- [ ] **Step 1: Teste do cartão (falha)**

Criar `src/components/configuracoes/CardDeSom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const ouvirAmostraFalso = vi.fn();
vi.mock('@/lib/som', () => ({ ouvirAmostra: (id: string) => ouvirAmostraFalso(id) }));

import { CardDeSom } from './CardDeSom';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  ouvirAmostraFalso.mockReset();
});

describe('CardDeSom', () => {
  it('🔴 a lista de sons começa fechada — a troca não fica toda aparente', () => {
    render(<CardDeSom />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: /quero mudar o som das minhas notificações/i })).toBeTruthy();
  });

  it('abrir mostra os 10 sons, com o padrão marcado', () => {
    render(<CardDeSom />);
    fireEvent.click(screen.getByRole('button', { name: /quero mudar o som/i }));
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect((screen.getByRole('radio', { name: 'Padrão' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Criados pela Repply')).toBeTruthy();
  });

  it('escolher grava na hora e toca o som uma vez', () => {
    render(<CardDeSom />);
    fireEvent.click(screen.getByRole('button', { name: /quero mudar o som/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sino' }));
    expect(localStorage.getItem('repply_som_notificacao')).toBe('sino');
    expect(ouvirAmostraFalso).toHaveBeenCalledWith('sino');
  });

  it('o ▶ só toca, sem trocar a escolha', () => {
    render(<CardDeSom />);
    fireEvent.click(screen.getByRole('button', { name: /quero mudar o som/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir Pop' }));
    expect(ouvirAmostraFalso).toHaveBeenCalledWith('pop');
    expect(localStorage.getItem('repply_som_notificacao')).toBeNull();
  });

  it('o liga/desliga continua lá', () => {
    render(<CardDeSom />);
    expect(screen.getByRole('switch', { name: /tocar som nas notificações/i })).toBeTruthy();
  });
});
```

Run: `npx vitest run src/components/configuracoes/CardDeSom.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar o cartão**

Criar `src/components/configuracoes/CardDeSom.tsx`:

```tsx
import { useState } from 'react';
import { ChevronDown, Play, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useSomLigado } from '@/hooks/use-som-ligado';
import { useSomEscolhido } from '@/hooks/use-som-escolhido';
import { CATALOGO_DE_SONS, type SomDeNotificacao } from '@/lib/catalogo-de-sons';
import { ouvirAmostra } from '@/lib/som';

/**
 * Liga, desliga e escolhe o som dos avisos.
 *
 * Fica no Perfil, e não em Empresa, porque é preferência de PESSOA: numa sala com
 * cinco atendentes, quem senta ao lado do telefone quer o som e quem está em reunião
 * não. Vive no navegador dela (use-som-ligado, use-som-escolhido).
 *
 * A lista começa FECHADA — pedido do dono do produto: "essa interface de trocar o som
 * não deve estar toda aparente".
 */
export function CardDeSom() {
  const { ligado, definir } = useSomLigado();
  const { id, escolher } = useSomEscolhido();
  const [trocando, setTrocando] = useState(false);

  const principais = CATALOGO_DE_SONS.filter((s) => s.grupo !== 'repply');
  const daRepply = CATALOGO_DE_SONS.filter((s) => s.grupo === 'repply');

  const linha = (s: SomDeNotificacao) => (
    <div
      key={s.id}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-2 py-1',
        id === s.id && 'bg-primary/10',
      )}
    >
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
        <input
          type="radio"
          name="som-de-notificacao"
          value={s.id}
          checked={id === s.id}
          onChange={() => {
            escolher(s.id);
            ouvirAmostra(s.id);
          }}
          className="h-3.5 w-3.5 accent-primary"
        />
        {s.rotulo}
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={`Ouvir ${s.rotulo}`}
        onClick={() => ouvirAmostra(s.id)}
      >
        <Play className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" /> Aviso sonoro
        </CardTitle>
        <CardDescription>Vale só para você, neste computador</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Tocar som nas notificações</p>
            <p className="text-xs text-muted-foreground">
              Avisa quando chega mensagem de WhatsApp, e-mail ou chat interno
              enquanto você está em outra tela. Não toca na conversa que você já
              está lendo.
            </p>
          </div>
          <Switch checked={ligado} onCheckedChange={definir} aria-label="Tocar som nas notificações" />
        </div>

        <button
          type="button"
          onClick={() => setTrocando((v) => !v)}
          aria-expanded={trocando}
          className="mt-4 flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', trocando && 'rotate-180')} />
          Quero mudar o som das minhas notificações
        </button>

        {trocando && (
          <div role="radiogroup" aria-label="Som das notificações" className="mt-2 space-y-0.5">
            {principais.map(linha)}
            <p className="px-2 pt-2 text-[11px] text-muted-foreground">Criados pela Repply</p>
            {daRepply.map(linha)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

Run: `npx vitest run src/components/configuracoes/CardDeSom.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 3: Trocar o cartão antigo pelo novo em Configurações**

Em `src/pages/Configuracoes.tsx`:
1. Apagar a função local `CardDeSom` inteira, com o comentário acima dela (linhas 136-173).
2. Acrescentar o import: `import { CardDeSom } from '@/components/configuracoes/CardDeSom';`
3. Conferir com Grep em `src/pages/Configuracoes.tsx`: `\bSwitch\b`, `Volume2` e `useSomLigado`. Hoje só a função apagada usa os três (linhas 145, 150, 164). Se não sobrar uso, remover `import { Switch } from '@/components/ui/switch';` (linha 10), `Volume2` do import do `lucide-react` (linha 13) e `import { useSomLigado } from '@/hooks/use-som-ligado';` (linha 14).

Run: `npx vitest run src/components/configuracoes && npx eslint src/pages/Configuracoes.tsx src/components/configuracoes/CardDeSom.tsx`
Expected: testes PASS; o eslint não aponta import sem uso nesses dois arquivos.

- [ ] **Step 4: Commit**

```bash
git add -- src/components/configuracoes/CardDeSom.tsx src/components/configuracoes/CardDeSom.test.tsx
git commit --only -m "feat(som): 'quero mudar o som das minhas notificacoes', com ouvir antes de escolher

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/configuracoes/CardDeSom.tsx src/components/configuracoes/CardDeSom.test.tsx src/pages/Configuracoes.tsx
```

---

### Task 5: Equilíbrio da aba Perfil

**Files:**
- Modify: `src/pages/Configuracoes.tsx` (a leitura de `useSecaoLigada('emails')` perto da linha 183 e o JSX do grid, ~linhas 378-565 antes da Task 4)

**Interfaces:**
- Consumes: `useSecaoLigada('emails')`, que devolve `{ ligada: boolean | undefined; carregando: boolean }` (quando dá erro, `ligada: true`).
- Produces: nada novo.

- [ ] **Step 1: Ler também o "carregando"**

Trocar `const { ligada: temEmails } = useSecaoLigada('emails');` por:

```tsx
  const { ligada: temEmails, carregando: carregandoSecoes } = useSecaoLigada('emails');
  // O cartão Personalizar muda de coluna conforme a empresa tenha o módulo de e-mail:
  // com ele, o editor de assinatura deixa Informações Pessoais alto, e Personalizar
  // vai para a direita equilibrar. Enquanto a resposta não chega, o cartão espera —
  // aparecer num lado e pular para o outro é pior que demorar um instante.
  const personalizarNaDireita = temEmails === true;
```

- [ ] **Step 2: Reposicionar os cartões**

No JSX do grid, a coluna esquerda termina hoje em `<CardDeSom />` seguido de `<CustomizeTab />`. Trocar o `<CustomizeTab />` da coluna esquerda por:

```tsx
        {!carregandoSecoes && !personalizarNaDireita && <CustomizeTab />}
```

Na coluna direita, logo depois da abertura `<div className="space-y-6">` e antes do `<Card>` de Conta e Segurança, acrescentar:

```tsx
        {!carregandoSecoes && personalizarNaDireita && <CustomizeTab />}
```

Manter o comentário sobre o GmailSettings onde está.

- [ ] **Step 3: Medir as duas colunas no navegador**

`preview_start` `{ name: "repply-crm" }`; se pedir login, pedir ao Lucas. Abrir `/configuracoes` (aba Perfil), `resize_window` `{ width: 1280, height: 900 }`, com o Aviso sonoro fechado. Rodar no `javascript_tool`:

```js
const grid = [...document.querySelectorAll('div.grid')].find(g => g.className.includes('lg:grid-cols-2'));
const [esq, dir] = [...grid.children].map(c => Math.round(c.getBoundingClientRect().height));
const blocoDoRotulo = (texto) => [...document.querySelectorAll('label')]
  .find(l => l.textContent.trim().startsWith(texto))?.parentElement;
const altura = (el) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
const personalizar = [...document.querySelectorAll('h3, div')].find(e => e.textContent.trim() === 'Personalizar')?.closest('.rounded-lg, .rounded-xl, [class*="card"]');
({
  esq, dir, diferenca: esq - dir,
  editorDeAssinatura: altura(blocoDoRotulo('Assinatura de E-mail')),
  preVisualizacao: altura(blocoDoRotulo('Como fica no rodapé')),
  personalizar: altura(personalizar),
})
```

Expected: `|diferenca| ≤ 150` no caso com o módulo de e-mail (a empresa da conta de teste tem). O caso **sem** o módulo é estimado com os números devolvidos:
- esquerda ≈ `esq − editorDeAssinatura − preVisualizacao + personalizar`;
- direita ≈ `dir − personalizar`.

A diferença estimada também deve ficar ≤ 150. Se algum caso passar de 150, **parar e mostrar os números ao Lucas antes de mudar a distribuição**.

Capturar a tela (`computer` screenshot) para o relato.

- [ ] **Step 4: Rodar a suíte e commitar**

Run: `npm run test`
Expected: tudo passando.

```bash
git commit --only -m "fix(configuracoes): as duas colunas do Perfil ficam equilibradas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/pages/Configuracoes.tsx
```

---

### Task 6: Verificação final e publicação

**Files:** nenhum novo.

**Interfaces:**
- Consumes: commits das Tasks 1–5.
- Produces: bloco no ar.

- [ ] **Step 1: Suíte completa contra a linha de base**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
npm run build
```
Expected:
- Testes: linha de base + 33 novos, 0 falhando. Os 33 são: 10 de `inicio-da-assinatura`, 4 de `PagamentosTab`, 7 do catálogo, 4 da escolha, 3 de `som` e 5 do `CardDeSom`.
- `tsc` ≤ 36; lint ≤ 427; build ok.

- [ ] **Step 2: Pedir o "pode" ao Lucas — migration e função**

Mostrar a ele, em linguagem de consequência:
- **Banco:** uma coluna nova e vazia em `empresa_assinaturas`. Nenhum dado é mudado nem apagado.
- **Função `stripe-webhook`:** passa a gravar a data de início que o Stripe informa. Hoje só uma empresa, de teste, passa por ela.
- **Ordem obrigatória:** banco primeiro. Se a função for antes, o Stripe manda um evento, a gravação recusa a coluna inexistente e o evento falha.

Só seguir com um "pode" explícito.

- [ ] **Step 3: Aplicar a migration (depois do "pode")**

MCP `apply_migration` com `project_id: hukeirrmsoiowvvrhivx`, `name: assinatura_iniciada_em` e o conteúdo exato do arquivo da Task 1 Step 5. Conferir:

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'empresa_assinaturas' and column_name = 'assinatura_iniciada_em';
```
Expected: 1 linha, `timestamp with time zone`.

- [ ] **Step 4: Publicar a função (depois da migration)**

```bash
npx supabase functions deploy stripe-webhook --project-ref hukeirrmsoiowvvrhivx
```
Expected: "Deployed Functions … stripe-webhook". O `verify_jwt = false` vem de `supabase/config.toml:34-35` e é preservado.

- [ ] **Step 5: Publicar o site, só com os commits deste bloco**

```bash
git cherry -v origin/main HEAD
git fetch origin
git worktree add ../_publicar-config origin/main
cd ../_publicar-config
git cherry-pick <hashes das Tasks 1–5, na ordem>
git diff --stat HEAD <HEAD testado da pasta principal> -- src/lib/inicio-da-assinatura.ts src/lib/inicio-da-assinatura.test.ts supabase/migrations/20260911120000_assinatura_iniciada_em.sql src/integrations/supabase/types.ts supabase/functions/stripe-webhook/index.ts src/components/configuracoes/PagamentosTab.tsx src/components/configuracoes/PagamentosTab.test.tsx scripts/gerar-sons-de-notificacao.py public/sons/opcoes src/lib/catalogo-de-sons.ts src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.ts src/hooks/use-som-escolhido.test.ts src/lib/som.ts src/lib/som.test.ts src/lib/aviso-de-mensagem-nova.ts src/components/configuracoes/CardDeSom.tsx src/components/configuracoes/CardDeSom.test.tsx src/pages/Configuracoes.tsx
```
Expected: `git diff --stat` vazio. Se `types.ts` ou `Configuracoes.tsx` mostrarem diferença, é mudança de outra sessão que está em `origin/main` e não na pasta, ou o contrário: **parar e entender antes de publicar**.

```bash
git push origin HEAD:main
cd -
git worktree remove --force ../_publicar-config
```

- [ ] **Step 6: Conferir no ar**

```bash
gh api repos/Repply-Hub/Repply-CRM/commits/<último hash publicado>/status --jq .state
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://crm.repplyhub.com.br/sons/opcoes/sino.mp3
```
Expected: `success`; `200 audio/mpeg`.

Procurar o texto novo no pacote que está no ar. O pedaço que contém Configurações é carregado sob demanda, então a busca desce dois níveis:

```bash
curl -s https://crm.repplyhub.com.br/ | grep -o 'assets/[^"]*\.js' | sort -u > /tmp/n1.txt
for f in $(cat /tmp/n1.txt); do curl -s "https://crm.repplyhub.com.br/$f" | grep -o 'assets/[A-Za-z0-9_-]*\.js' ; done | sort -u > /tmp/n2.txt
for f in $(cat /tmp/n1.txt /tmp/n2.txt | sort -u); do curl -s "https://crm.repplyhub.com.br/$f" | grep -l "Quero mudar o som das minhas notifica" >/dev/null && echo "achado em $f"; done
```
Expected: ao menos uma linha `achado em assets/…`.
