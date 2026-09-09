# Bloco C — WhatsApp: som, rascunho, nome e grupo

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam caixinha (`- [ ]`) para acompanhamento.

**Objetivo:** dar som às notificações, separar o rascunho por conversa, impedir que o nome do usuário quebre o negrito no WhatsApp e parar de renomear grupos com o nome de quem enviou.

**Arquitetura:** três módulos puros novos em `src/lib/` (som, rascunhos, e a limpeza de nome que vive no módulo compartilhado das Edge Functions), cada um com teste próprio; a tela e o webhook só passam a chamá-los. Nenhuma tabela nova. A preferência de som e os rascunhos vivem no `localStorage`, seguindo o padrão que o projeto já usa em `use-table-settings.ts`.

**Tecnologias:** React 18 + TypeScript, Vitest (`npm run test`), Supabase Edge Functions (Deno), Tailwind + shadcn.

**Spec:** `docs/superpowers/specs/2026-09-09-email-e-whatsapp-design.md`

## Restrições globais

- 🔴 **Nunca `git add -A`** (CLAUDE.md §13). Outra sessão trabalha nesta mesma pasta. Liste os arquivos um a um e use `git commit --only -m "…" -- <caminhos>`.
- 🔴 **Antes de CADA commit:** `git fetch origin` e `git status --short`. As sessões não compartilham o mesmo ponteiro — outra pode ter enviado sem que o seu HEAD ande (CLAUDE.md §13). Arquivo que não é seu na fila: pare e avise.
- 🔴 **`git push` PUBLICA em produção** (CLAUDE.md §16). Não publique sem o dono do produto pedir.
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Os testes ficam sob `src/**` — é o único lugar que o `vitest.config.ts` inclui (`include: ["src/**/*.{test,spec}.{ts,tsx}"]`). Módulo de Edge Function pode ser importado por caminho relativo: `supabase/functions/_shared/whatsapp.ts` não tem nenhum `import`, e a importação a partir de `src/lib/` foi verificada e funciona.
- Verificação antes de cada commit: `npm run test` (linha de base: **1.140 passando**) e `npx tsc --noEmit -p tsconfig.app.json` (linha de base: **~31 erros pré-existentes** — não aumente esse número).
- Texto visível ao usuário em **pt-BR**, sem jargão.
- O `strict` do TypeScript está desligado de propósito. Não ligue.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `public/sons/notificacao.mp3` (criar) | som de chegada — movido de `sounds/som de notificações.mp3` |
| `public/sons/envio.mp3` (criar) | som de envio — movido de `sounds/som ao enviar mensagem.mp3` |
| `src/lib/som.ts` (criar) | decide **se** toca (puro) e toca (impuro). Único lugar que conhece `Audio` |
| `src/lib/som.test.ts` (criar) | testes da decisão pura |
| `src/hooks/use-som-ligado.ts` (criar) | a preferência liga/desliga da pessoa |
| `src/lib/rascunhos-do-whatsapp.ts` (criar) | ler/gravar/apagar rascunho por conversa |
| `src/lib/rascunhos-do-whatsapp.test.ts` (criar) | testes do módulo de rascunho |
| `supabase/functions/_shared/whatsapp.ts` (modificar) | ganha `nomeParaNegrito` |
| `src/lib/nome-no-whatsapp.test.ts` (criar) | testes de `nomeParaNegrito` |
| `supabase/functions/whatsapp-send/index.ts:24-27` (modificar) | usa `nomeParaNegrito` |
| `supabase/functions/whatsapp-webhook/index.ts:689` (modificar) | para de renomear grupo com o nome de quem enviou |
| `supabase/functions/whatsapp-webhook/index.ts` (modificar) | reconhece `[Undecryptable]` |
| `src/lib/mensagem-indecifravel.ts` (criar) | reconhece o marcador; usado pela tela |
| `src/lib/mensagem-indecifravel.test.ts` (criar) | testes |
| `src/pages/WhatsAppInbox.tsx` (modificar) | rascunho por conversa, selo, ordenação, frase da indecifrável |
| `src/hooks/use-whatsapp-inbox.ts:1455` (modificar) | toca o som na chegada |
| `src/hooks/use-notificacoes.ts` (modificar) | toca o som no chat interno e nas notificações |
| `scripts/corrigir-nome-do-grupo-crispim-20260909.sql` (criar) | conserto do dado em produção |

---

### Tarefa 1: o módulo de som

**Arquivos:**
- Criar: `public/sons/notificacao.mp3`, `public/sons/envio.mp3` (movidos de `sounds/`)
- Criar: `src/lib/som.ts`
- Teste: `src/lib/som.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `devoTocarNotificacao(estado: EstadoDoSom): boolean`, `tocarNotificacao(ctx: ContextoDaNotificacao): void`, `tocarEnvio(ligado: boolean): void`, `destravarSom(): void`, `definirConversaEmFoco(id: string | null): void`.

- [ ] **Passo 1: mover os arquivos de som**

Os dois `.mp3` estão em `sounds/` na raiz, que o site **não serve** — o Vite serve `public/`. Nome com espaço e acento vira URL escapada; renomeie.

```bash
mkdir -p public/sons
git mv "sounds/som de notificações.mp3" public/sons/notificacao.mp3 2>/dev/null || mv "sounds/som de notificações.mp3" public/sons/notificacao.mp3
git mv "sounds/som ao enviar mensagem.mp3" public/sons/envio.mp3 2>/dev/null || mv "sounds/som ao enviar mensagem.mp3" public/sons/envio.mp3
rmdir sounds 2>/dev/null || true
ls -la public/sons/
```

Esperado: `envio.mp3` (~34 KB) e `notificacao.mp3` (~58 KB). A pasta `sounds/` some.

- [ ] **Passo 2: escrever o teste que falha**

Crie `src/lib/som.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { devoTocarNotificacao } from './som';

describe('devoTocarNotificacao', () => {
  const base = {
    ligado: true,
    abaVisivel: false,
    conversaEmFoco: null as string | null,
    conversaDaMensagem: null as string | null,
    ultimoToqueEm: 0,
    agora: 100_000,
  };

  it('toca quando a aba está em segundo plano', () => {
    expect(devoTocarNotificacao(base)).toBe(true);
  });

  it('não toca quando a pessoa desligou o som', () => {
    expect(devoTocarNotificacao({ ...base, ligado: false })).toBe(false);
  });

  it('não toca na conversa que já está aberta na frente da pessoa', () => {
    expect(devoTocarNotificacao({
      ...base, abaVisivel: true, conversaEmFoco: 'c1', conversaDaMensagem: 'c1',
    })).toBe(false);
  });

  it('toca quando a aba está visível mas a mensagem é de outra conversa', () => {
    expect(devoTocarNotificacao({
      ...base, abaVisivel: true, conversaEmFoco: 'c1', conversaDaMensagem: 'c2',
    })).toBe(true);
  });

  it('toca com a aba visível quando a notificação não é de conversa nenhuma', () => {
    expect(devoTocarNotificacao({
      ...base, abaVisivel: true, conversaEmFoco: 'c1', conversaDaMensagem: null,
    })).toBe(true);
  });

  it('segura o segundo toque dentro de dois segundos', () => {
    expect(devoTocarNotificacao({ ...base, ultimoToqueEm: 99_000 })).toBe(false);
  });

  it('libera o toque depois de dois segundos', () => {
    expect(devoTocarNotificacao({ ...base, ultimoToqueEm: 97_500 })).toBe(true);
  });
});
```

- [ ] **Passo 3: rodar o teste e confirmar que falha**

```bash
npx vitest run src/lib/som.test.ts
```

Esperado: FALHA com `Failed to resolve import "./som"`.

- [ ] **Passo 4: escrever o módulo**

Crie `src/lib/som.ts`:

```ts
/**
 * O som das notificações e do envio — o único lugar do sistema que conhece `Audio`.
 *
 * Três armadilhas moram aqui, e é por elas que isto é um módulo e não duas linhas
 * soltas na tela:
 *
 * 1. 🔴 O NAVEGADOR RECUSA TOCAR antes do primeiro gesto da pessoa na página, e a
 *    recusa vem como Promise rejeitada — não como exceção. Sem `catch`, cada
 *    notificação antes do primeiro clique vira "Unhandled promise rejection" no
 *    console e esconde erro de verdade. `destravarSom` resolve isso de uma vez.
 * 2. Uma instância de `Audio` POR SOM. Criar uma a cada mensagem deixa dezenas de
 *    objetos pendurados numa rajada de chegadas.
 * 3. Rajada não pode virar sobreposição. Vinte mensagens juntas tocam uma vez.
 *
 * A decisão de tocar (`devoTocarNotificacao`) é pura de propósito: é a parte que
 * tem regra de produto e merece teste; tocar de fato não tem o que testar.
 */

/** Dois toques de notificação nunca saem a menos disto um do outro. */
const INTERVALO_MINIMO_MS = 2_000;

export interface EstadoDoSom {
  /** A preferência da pessoa. */
  ligado: boolean;
  /** A aba do navegador está à vista? */
  abaVisivel: boolean;
  /** Conversa aberta na tela agora, se houver. */
  conversaEmFoco: string | null;
  /** Conversa que gerou a notificação — nulo quando não é de conversa. */
  conversaDaMensagem: string | null;
  /** Quando o último som de notificação saiu (ms). */
  ultimoToqueEm: number;
  /** Agora (ms). */
  agora: number;
}

/**
 * O som avisa do que a pessoa NÃO está vendo. Se ela já está com a conversa
 * aberta na frente, a mensagem chega na tela dela — tocar seria barulho.
 */
export function devoTocarNotificacao(e: EstadoDoSom): boolean {
  if (!e.ligado) return false;
  if (e.agora - e.ultimoToqueEm < INTERVALO_MINIMO_MS) return false;
  if (!e.abaVisivel) return true;
  // Aba à vista: só cala quando a notificação é exatamente da conversa aberta.
  if (e.conversaDaMensagem && e.conversaDaMensagem === e.conversaEmFoco) return false;
  return true;
}

let destravado = false;
let conversaEmFoco: string | null = null;
let ultimoToqueEm = 0;
const cache = new Map<string, HTMLAudioElement>();

function audio(arquivo: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  let a = cache.get(arquivo);
  if (!a) {
    a = new Audio(arquivo);
    a.preload = 'auto';
    cache.set(arquivo, a);
  }
  return a;
}

function tocar(arquivo: string) {
  const a = audio(arquivo);
  if (!a) return;
  try {
    a.currentTime = 0;
    // A recusa por política de reprodução automática cai aqui, em silêncio.
    void a.play().catch(() => {});
  } catch {
    /* navegador sem suporte — o sistema funciona sem som */
  }
}

/**
 * Registra o primeiro gesto da pessoa para liberar o áudio.
 * Chamado uma vez, no arranque do app. Remove-se sozinho.
 */
export function destravarSom(): void {
  if (destravado || typeof window === 'undefined') return;
  const liberar = () => {
    destravado = true;
    window.removeEventListener('pointerdown', liberar);
    window.removeEventListener('keydown', liberar);
  };
  window.addEventListener('pointerdown', liberar, { once: true });
  window.addEventListener('keydown', liberar, { once: true });
}

/** A tela do WhatsApp avisa qual conversa está aberta; nulo ao sair dela. */
export function definirConversaEmFoco(id: string | null): void {
  conversaEmFoco = id;
}

export interface ContextoDaNotificacao {
  ligado: boolean;
  /** Conversa que gerou a notificação, quando houver. */
  conversaId?: string | null;
}

export function tocarNotificacao(ctx: ContextoDaNotificacao): void {
  const agora = Date.now();
  const deve = devoTocarNotificacao({
    ligado: ctx.ligado,
    abaVisivel: typeof document !== 'undefined' && document.visibilityState === 'visible',
    conversaEmFoco,
    conversaDaMensagem: ctx.conversaId ?? null,
    ultimoToqueEm,
    agora,
  });
  if (!deve) return;
  ultimoToqueEm = agora;
  tocar('/sons/notificacao.mp3');
}

/**
 * O som de envio é exceção deliberada: toca sempre que a pessoa manda, porque é
 * resposta ao clique dela — não um aviso sobre algo que ela não viu.
 */
export function tocarEnvio(ligado: boolean): void {
  if (!ligado) return;
  tocar('/sons/envio.mp3');
}
```

- [ ] **Passo 5: rodar o teste e confirmar que passa**

```bash
npx vitest run src/lib/som.test.ts
```

Esperado: **7 passando**.

- [ ] **Passo 6: commitar**

```bash
git add public/sons/notificacao.mp3 public/sons/envio.mp3 src/lib/som.ts src/lib/som.test.ts
git commit --only -m "feat(som): modulo de som com destrava de autoplay e teto de repeticao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- public/sons/notificacao.mp3 public/sons/envio.mp3 src/lib/som.ts src/lib/som.test.ts
```

---

### Tarefa 2: ligar o som, com liga/desliga

**Arquivos:**
- Criar: `src/hooks/use-som-ligado.ts`
- Modificar: `src/hooks/use-whatsapp-inbox.ts` (dentro do bloco de toast, a partir da linha 1460)
- Modificar: `src/hooks/use-notificacoes.ts` (dentro do toast do chat interno, a partir da linha 170)
- Modificar: `src/pages/WhatsAppInbox.tsx` (foco da conversa e som ao enviar)
- Modificar: `src/App.tsx` (chamar `destravarSom` uma vez)

**Interfaces:**
- Consome: `tocarNotificacao`, `tocarEnvio`, `destravarSom`, `definirConversaEmFoco` da Tarefa 1.
- Produz: `useSomLigado(): { ligado: boolean; definir(v: boolean): void }` e `somLigado(): boolean` (leitura direta, para uso fora de componente).

- [ ] **Passo 1: escrever o hook da preferência**

Crie `src/hooks/use-som-ligado.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

/**
 * Se a pessoa quer ouvir os avisos. Vive no navegador dela, como as outras
 * preferências pessoais do sistema (ver use-table-settings). Ligado por padrão:
 * quem não quer, desliga; quem nunca reparou que existe, é avisado.
 */
const CHAVE = 'repply_som_ligado';

/** Leitura crua, para quem precisa do valor fora de um componente. */
export function somLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'false';
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima restrita): som ligado.
    return true;
  }
}

export function useSomLigado() {
  const [ligado, setLigado] = useState(somLigado);

  // Duas abas abertas: desligar numa desliga na outra.
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) setLigado(somLigado());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  const definir = useCallback((v: boolean) => {
    try {
      localStorage.setItem(CHAVE, String(v));
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
    setLigado(v);
  }, []);

  return { ligado, definir };
}
```

- [ ] **Passo 2: destravar o som no arranque**

Em `src/App.tsx`, junto dos outros efeitos de arranque do app, acrescente a importação e a chamada:

```ts
import { destravarSom } from '@/lib/som';
```

```ts
  // O navegador só libera áudio depois do primeiro gesto da pessoa. Registrar
  // cedo garante que o primeiro aviso já saia com som, em vez de o primeiro ser
  // engolido silenciosamente.
  useEffect(() => {
    destravarSom();
  }, []);
```

- [ ] **Passo 3: tocar na chegada de mensagem de WhatsApp**

Em `src/hooks/use-whatsapp-inbox.ts`, importe no topo:

```ts
import { tocarNotificacao } from '@/lib/som';
import { somLigado } from '@/hooks/use-som-ligado';
```

E logo **antes** da chamada `toast(...)` que começa na linha 1460 (dentro do `if (currentCount > prevCount) {`), acrescente:

```ts
            // O som decide sozinho se cala: já sabe qual conversa está aberta
            // na frente da pessoa (ver definirConversaEmFoco em WhatsAppInbox).
            tocarNotificacao({ ligado: somLigado(), conversaId: row.id });
```

- [ ] **Passo 4: tocar no chat interno e nas notificações**

Em `src/hooks/use-notificacoes.ts`, importe o mesmo par e acrescente a chamada imediatamente antes do `toast(` da linha 170 (o do chat interno):

```ts
        tocarNotificacao({ ligado: somLigado() });
```

- [ ] **Passo 5: avisar qual conversa está em foco, e tocar ao enviar**

Em `src/pages/WhatsAppInbox.tsx`, importe:

```ts
import { definirConversaEmFoco, tocarEnvio } from '@/lib/som';
import { somLigado } from '@/hooks/use-som-ligado';
```

Logo após a declaração de `conversaAtiva` (linha 4242), acrescente:

```ts
  // O módulo de som precisa saber o que a pessoa está vendo para não avisar
  // sobre a conversa que já está aberta na frente dela.
  useEffect(() => {
    definirConversaEmFoco(conversaAtivaId);
    return () => definirConversaEmFoco(null);
  }, [conversaAtivaId]);
```

E na função que envia a mensagem, logo depois do `setTexto("")` que limpa a caixa (linha 6303), acrescente:

```ts
      tocarEnvio(somLigado());
```

- [ ] **Passo 6: oferecer o liga/desliga**

Na tela de configurações do perfil da pessoa, acrescente a chave. Localize a aba de perfil com:

```bash
grep -rn "Meu perfil\|PerfilTab\|MinhaContaTab" src/pages/Configuracoes.tsx src/components/configuracoes/ | head
```

Acrescente ao componente encontrado, usando o `Switch` do shadcn já usado no projeto:

```tsx
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Som nas notificações</p>
            <p className="text-xs text-muted-foreground">
              Toca um aviso quando chega mensagem de WhatsApp, e-mail ou chat
              interno enquanto você está em outra tela.
            </p>
          </div>
          <Switch checked={ligado} onCheckedChange={definir} />
        </div>
```

com `const { ligado, definir } = useSomLigado();` no corpo do componente.

- [ ] **Passo 7: verificar**

```bash
npm run test 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
```

Esperado: testes **1.147 passando** (1.140 da linha de base + 7 novos); `tsc` sem aumentar os ~31 erros pré-existentes.

- [ ] **Passo 8: conferir no navegador**

Suba o preview, abra a seção de WhatsApp, mande uma mensagem e confirme que o som de envio sai. Depois troque de aba do navegador e peça para alguém mandar uma mensagem — confirme o som de chegada. Confirme que, com a conversa aberta na frente, a chegada **não** toca.

- [ ] **Passo 9: commitar**

```bash
git commit --only -m "feat(som): avisos sonoros de chegada e de envio, com liga/desliga por pessoa

Toca so o que a pessoa nao esta vendo: aba em segundo plano, ou conversa
diferente da que esta aberta. O de envio toca sempre, porque e resposta ao
clique dela.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/hooks/use-som-ligado.ts src/App.tsx src/hooks/use-whatsapp-inbox.ts src/hooks/use-notificacoes.ts src/pages/WhatsAppInbox.tsx
```

*(acrescente ao final da lista o arquivo da aba de perfil que você modificou no Passo 6)*

---

### Tarefa 3: o módulo de rascunhos

**Arquivos:**
- Criar: `src/lib/rascunhos-do-whatsapp.ts`
- Teste: `src/lib/rascunhos-do-whatsapp.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `lerRascunhos(usuarioId): Record<string,string>`, `gravarRascunho(usuarioId, conversaId, texto): Record<string,string>`, `limparRascunho(usuarioId, conversaId): Record<string,string>`, `podarRascunhos(usuarioId, idsVivos): Record<string,string>`.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/rascunhos-do-whatsapp.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  lerRascunhos, gravarRascunho, limparRascunho, podarRascunhos,
} from './rascunhos-do-whatsapp';

beforeEach(() => localStorage.clear());

describe('rascunhos do whatsapp', () => {
  it('começa vazio', () => {
    expect(lerRascunhos('u1')).toEqual({});
  });

  it('guarda e devolve por conversa', () => {
    gravarRascunho('u1', 'c1', 'oi');
    gravarRascunho('u1', 'c2', 'tudo bem?');
    expect(lerRascunhos('u1')).toEqual({ c1: 'oi', c2: 'tudo bem?' });
  });

  it('não mistura duas pessoas no mesmo computador', () => {
    gravarRascunho('u1', 'c1', 'da Silvia');
    gravarRascunho('u2', 'c1', 'do Daniel');
    expect(lerRascunhos('u1')).toEqual({ c1: 'da Silvia' });
    expect(lerRascunhos('u2')).toEqual({ c1: 'do Daniel' });
  });

  it('texto vazio apaga o rascunho em vez de guardar string vazia', () => {
    gravarRascunho('u1', 'c1', 'oi');
    gravarRascunho('u1', 'c1', '   ');
    expect(lerRascunhos('u1')).toEqual({});
  });

  it('limpar remove só aquela conversa', () => {
    gravarRascunho('u1', 'c1', 'a');
    gravarRascunho('u1', 'c2', 'b');
    expect(limparRascunho('u1', 'c1')).toEqual({ c2: 'b' });
  });

  it('podar descarta rascunho de conversa que não existe mais', () => {
    gravarRascunho('u1', 'c1', 'a');
    gravarRascunho('u1', 'sumiu', 'b');
    expect(podarRascunhos('u1', ['c1'])).toEqual({ c1: 'a' });
  });

  it('podar não faz nada quando a lista de conversas ainda não chegou', () => {
    gravarRascunho('u1', 'c1', 'a');
    expect(podarRascunhos('u1', [])).toEqual({ c1: 'a' });
  });

  it('aguenta lixo gravado no armazenamento', () => {
    localStorage.setItem('repply_wa_rascunhos_u1', 'isto não é json');
    expect(lerRascunhos('u1')).toEqual({});
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
npx vitest run src/lib/rascunhos-do-whatsapp.test.ts
```

Esperado: FALHA com `Failed to resolve import "./rascunhos-do-whatsapp"`.

- [ ] **Passo 3: escrever o módulo**

Crie `src/lib/rascunhos-do-whatsapp.ts`:

```ts
/**
 * O que a pessoa escreveu e ainda não mandou, POR CONVERSA.
 *
 * 🔴 O defeito que isto conserta: `WhatsAppInbox` tinha um `useState("")` só para
 * a tela inteira. Começar a escrever numa conversa e trocar de chat levava o
 * texto junto — e a pessoa mandava para a pessoa errada.
 *
 * Vive no navegador daquela pessoa, e não no banco, por decisão do dono do
 * produto (09/09/2026): é o comportamento do WhatsApp Web, não custa tabela nova
 * e um texto meio escrito não passa a existir no servidor.
 *
 * A chave inclui o id do usuário porque duas pessoas dividem computador — sem
 * isso, o rascunho de uma apareceria para a outra.
 */

type Rascunhos = Record<string, string>;

function chave(usuarioId: string): string {
  return `repply_wa_rascunhos_${usuarioId}`;
}

function gravar(usuarioId: string, r: Rascunhos): Rascunhos {
  try {
    localStorage.setItem(chave(usuarioId), JSON.stringify(r));
  } catch {
    /* sem armazenamento: o rascunho vale só enquanto a aba estiver aberta */
  }
  return r;
}

export function lerRascunhos(usuarioId: string): Rascunhos {
  try {
    const cru = localStorage.getItem(chave(usuarioId));
    if (!cru) return {};
    const lido = JSON.parse(cru);
    // Lixo gravado por uma versão antiga não pode derrubar a tela inteira.
    if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return {};
    const limpo: Rascunhos = {};
    for (const [k, v] of Object.entries(lido)) {
      if (typeof v === 'string' && v.trim()) limpo[k] = v;
    }
    return limpo;
  } catch {
    return {};
  }
}

export function gravarRascunho(usuarioId: string, conversaId: string, texto: string): Rascunhos {
  const atual = lerRascunhos(usuarioId);
  // Só espaço não é rascunho: seria um selo vermelho eterno sem nada escrito.
  if (!texto.trim()) return limparRascunho(usuarioId, conversaId);
  return gravar(usuarioId, { ...atual, [conversaId]: texto });
}

export function limparRascunho(usuarioId: string, conversaId: string): Rascunhos {
  const { [conversaId]: _fora, ...resto } = lerRascunhos(usuarioId);
  return gravar(usuarioId, resto);
}

/**
 * Descarta rascunho de conversa que não existe mais. Sem isto o mapa cresce para
 * sempre. Lista vazia NÃO poda: significa "a lista ainda não chegou", e podar
 * ali apagaria tudo enquanto a tela carrega.
 */
export function podarRascunhos(usuarioId: string, idsVivos: string[]): Rascunhos {
  const atual = lerRascunhos(usuarioId);
  if (idsVivos.length === 0) return atual;
  const vivos = new Set(idsVivos);
  const podado: Rascunhos = {};
  for (const [id, texto] of Object.entries(atual)) {
    if (vivos.has(id)) podado[id] = texto;
  }
  return gravar(usuarioId, podado);
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/rascunhos-do-whatsapp.test.ts
```

Esperado: **8 passando**.

- [ ] **Passo 5: commitar**

```bash
git commit --only -m "feat(whatsapp): modulo de rascunho por conversa

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/rascunhos-do-whatsapp.ts src/lib/rascunhos-do-whatsapp.test.ts
```

---

### Tarefa 4: o rascunho na tela

**Arquivos:**
- Modificar: `src/pages/WhatsAppInbox.tsx` (linhas 4779, 5764, 6379, 6303, 6513)

**Interfaces:**
- Consome: `lerRascunhos`, `gravarRascunho`, `limparRascunho`, `podarRascunhos` da Tarefa 3.
- Produz: nada para outras tarefas.

- [ ] **Passo 1: trocar o estado único por um mapa**

Em `src/pages/WhatsAppInbox.tsx`, importe:

```ts
import {
  lerRascunhos, gravarRascunho, limparRascunho, podarRascunhos,
} from '@/lib/rascunhos-do-whatsapp';
```

Substitua a linha 4779:

```ts
  const [texto, setTexto] = useState("");
```

por:

```ts
  // 🔴 Era um `useState("")` só para a tela inteira: escrever numa conversa e
  // trocar de chat levava o texto junto. Agora o que está na caixa é sempre o
  // rascunho DAQUELA conversa.
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const texto = conversaAtivaId ? (rascunhos[conversaAtivaId] ?? "") : "";
  const setTexto = useCallback((valor: string) => {
    if (!conversaAtivaId || !profile?.id) return;
    setRascunhos(gravarRascunho(profile.id, conversaAtivaId, valor));
  }, [conversaAtivaId, profile?.id]);
```

> `setTexto` mantém o mesmo nome e a mesma forma de chamada de antes, então os quatro pontos que já chamavam (`5495`, `5501`, `6259`, `6303`, `6379`, `6408`) continuam funcionando sem alteração — exceto o de envio, no Passo 3.

- [ ] **Passo 2: carregar e podar**

Logo depois do bloco acima:

```ts
  // Carrega uma vez por pessoa; depois disso o estado é a fonte.
  useEffect(() => {
    if (profile?.id) setRascunhos(lerRascunhos(profile.id));
  }, [profile?.id]);

  // Rascunho de conversa que não existe mais não pode ficar segurando um selo
  // na lista para sempre.
  useEffect(() => {
    if (!profile?.id || conversas.length === 0) return;
    setRascunhos(podarRascunhos(profile.id, conversas.map((c) => c.id)));
  }, [profile?.id, conversas.length]);
```

- [ ] **Passo 3: apagar o rascunho ao enviar**

Na função de envio, o `setTexto("")` da linha 6303 já apaga (texto vazio limpa o rascunho, ver o teste "texto vazio apaga"). Para não depender disso, troque-o por:

```ts
      if (conversaAtivaId && profile?.id) {
        setRascunhos(limparRascunho(profile.id, conversaAtivaId));
      }
```

- [ ] **Passo 4: o selo na lista**

Na linha 6513, troque:

```tsx
              <UltimaMensagemPreview mensagem={conv.ultima_mensagem} />
```

por:

```tsx
              {rascunhos[conv.id] ? (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-destructive">rascunho:</span>
                  <span className="truncate">{rascunhos[conv.id]}</span>
                </span>
              ) : (
                <UltimaMensagemPreview mensagem={conv.ultima_mensagem} />
              )}
```

- [ ] **Passo 5: a conversa com rascunho sobe**

Na linha 5764, depois de `conversasFiltradas` ser calculada, ordene:

```ts
  // Conversa com rascunho vai para o topo e fica lá até a mensagem sair ou ser
  // apagada — é a pendência mais concreta que a pessoa tem na tela.
  const conversasOrdenadas = useMemo(() => {
    return [...conversasFiltradas].sort((a, b) => {
      const ra = rascunhos[a.id] ? 1 : 0;
      const rb = rascunhos[b.id] ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return 0; // empate mantém a ordem que veio do hook (mais recente primeiro)
    });
  }, [conversasFiltradas, rascunhos]);
```

E troque o uso de `conversasFiltradas` **apenas na renderização da lista** por `conversasOrdenadas`. Não troque nos contadores, no "selecionar todas" nem nos filtros — eles falam de conjunto, não de ordem.

Localize o ponto exato com:

```bash
grep -n "conversasFiltradas.map\|conversas: conversasFiltradas" src/pages/WhatsAppInbox.tsx
```

- [ ] **Passo 6: verificar**

```bash
npm run test 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
```

- [ ] **Passo 7: conferir no navegador**

Escreva numa conversa sem enviar, troque para outra: a caixa da segunda tem de estar **vazia**. Volte: o texto tem de estar lá. A primeira conversa tem de estar no topo com **rascunho:** em vermelho. Envie: o selo some e a conversa volta para a ordem normal.

- [ ] **Passo 8: commitar**

```bash
git commit --only -m "fix(whatsapp): o rascunho passa a ser de cada conversa, nao da tela

Escrever numa conversa e trocar de chat levava o texto junto — a caixa era um
useState so para a tela inteira. Agora cada conversa guarda o seu, com selo em
vermelho na lista e a conversa no topo ate enviar ou apagar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/pages/WhatsAppInbox.tsx
```

---

### Tarefa 5: o nome no negrito

**Arquivos:**
- Modificar: `supabase/functions/_shared/whatsapp.ts`
- Modificar: `supabase/functions/whatsapp-send/index.ts:24-27`
- Teste: `src/lib/nome-no-whatsapp.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `nomeParaNegrito(nome: string | null | undefined): string` em `supabase/functions/_shared/whatsapp.ts` — devolve `""` quando não sobra nada utilizável.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/nome-no-whatsapp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nomeParaNegrito } from '../../supabase/functions/_shared/whatsapp';

/**
 * O caso que motivou: na JHS, a Silvia cadastrou o próprio nome como "Silvia "
 * (com espaço sobrando). O WhatsApp NÃO aplica negrito quando há espaço colado
 * ao asterisco, então o cliente recebia `*Silvia *` com os asteriscos crus.
 */
describe('nomeParaNegrito', () => {
  it('tira espaço sobrando das pontas', () => {
    expect(nomeParaNegrito('Silvia ')).toBe('Silvia');
    expect(nomeParaNegrito('  Silvia')).toBe('Silvia');
  });

  it('colapsa espaço repetido no meio', () => {
    expect(nomeParaNegrito('Ana  Paula')).toBe('Ana Paula');
  });

  it('tira quebra de linha e tabulação', () => {
    expect(nomeParaNegrito('Ana\nPaula')).toBe('Ana Paula');
    expect(nomeParaNegrito('Ana\tPaula')).toBe('Ana Paula');
  });

  it('neutraliza os caracteres que o WhatsApp usa como formatação', () => {
    expect(nomeParaNegrito('Ana *Paula*')).toBe('Ana Paula');
    expect(nomeParaNegrito('Ana_Paula')).toBe('AnaPaula');
    expect(nomeParaNegrito('~Ana~')).toBe('Ana');
    expect(nomeParaNegrito('Ana `Paula`')).toBe('Ana Paula');
  });

  it('devolve vazio quando não sobra nada', () => {
    expect(nomeParaNegrito('   ')).toBe('');
    expect(nomeParaNegrito('***')).toBe('');
    expect(nomeParaNegrito(null)).toBe('');
    expect(nomeParaNegrito(undefined)).toBe('');
  });

  it('preserva acento e nome composto', () => {
    expect(nomeParaNegrito('José Artur Oliveira')).toBe('José Artur Oliveira');
    expect(nomeParaNegrito('Margley Pontes')).toBe('Margley Pontes');
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
npx vitest run src/lib/nome-no-whatsapp.test.ts
```

Esperado: FALHA — `nomeParaNegrito` não existe no módulo.

- [ ] **Passo 3: escrever a função**

Acrescente ao fim de `supabase/functions/_shared/whatsapp.ts`:

```ts
/**
 * Prepara um nome para ir dentro de `*negrito*` no WhatsApp.
 *
 * 🔴 O defeito: o WhatsApp só aplica negrito quando o asterisco encosta em
 * caractere visível. Um nome cadastrado como "Silvia " (com espaço sobrando)
 * virava `*Silvia *`, e o cliente recebia os asteriscos crus no lugar do
 * negrito. Erro de cadastro do cliente não pode vazar para quem recebe.
 *
 * Também tira `*`, `_`, `~` e crase: são a própria linguagem de formatação do
 * WhatsApp, e um nome como "Ana *Paula*" fecharia o negrito no meio.
 *
 * Devolve string vazia quando não sobra nada — aí quem chama manda a mensagem
 * sem prefixo, em vez de mandar `**`.
 */
export function nomeParaNegrito(nome: string | null | undefined): string {
  return (nome ?? "")
    // Marcas de formatação do WhatsApp saem antes de qualquer coisa.
    .replace(/[*_~`]/g, "")
    // Qualquer espaço em branco (inclusive quebra de linha e tabulação) vira um
    // espaço só.
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/nome-no-whatsapp.test.ts
```

Esperado: **6 passando**.

- [ ] **Passo 5: usar no envio**

Em `supabase/functions/whatsapp-send/index.ts`, acrescente `nomeParaNegrito` à importação já existente da linha 3:

```ts
import { normalizeWhatsappPhone, varianteDoNumero, nomeParaNegrito } from "../_shared/whatsapp.ts";
```

E substitua a função das linhas 24-27:

```ts
function withRemetente(nome: string | null, mensagem: string): string {
  if (!nome) return mensagem;
  const header = `*${nome}*`;
  return mensagem ? `${header}\n${mensagem}` : header;
}
```

por:

```ts
function withRemetente(nome: string | null, mensagem: string): string {
  // O nome vem do cadastro e pode ter espaço sobrando ou marca de formatação —
  // ver nomeParaNegrito. Nome que não sobrevive à limpeza sai sem prefixo.
  const limpo = nomeParaNegrito(nome);
  if (!limpo) return mensagem;
  const header = `*${limpo}*`;
  return mensagem ? `${header}\n${mensagem}` : header;
}
```

- [ ] **Passo 6: verificar e commitar**

```bash
npm run test 2>&1 | tail -5
git commit --only -m "fix(whatsapp): o nome no negrito para de vazar erro de cadastro

Nome com espaco sobrando ('Silvia ') virava '*Silvia *' e o WhatsApp nao
aplicava negrito — o cliente recebia os asteriscos crus. A limpeza tambem
neutraliza *, _, ~ e crase, que sao a propria formatacao do WhatsApp.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/functions/_shared/whatsapp.ts supabase/functions/whatsapp-send/index.ts src/lib/nome-no-whatsapp.test.ts
```

- [ ] **Passo 7: publicar a function**

🔴 Edge Function só passa a valer depois de publicada. Peça ao dono do produto antes.

```bash
npx supabase functions deploy whatsapp-send --project-ref hukeirrmsoiowvvrhivx
```

---

### Tarefa 6: o nome do grupo

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-webhook/index.ts:689-693`

**Interfaces:**
- Consome: nada.
- Produz: nada.

- [ ] **Passo 1: entender o defeito antes de mexer**

Leia `supabase/functions/whatsapp-webhook/index.ts:676-693`. Hoje:

```ts
  const groupName: string = payload.chat?.wa_name ?? payload.chat?.name ?? "";
  …
  const pushName: string = isGroup
    ? groupName || msg.senderName || ""
    : …
```

Quando o provedor manda o pacote sem o nome do grupo, `groupName` fica vazio e cai em `msg.senderName` — o participante que enviou. E a linha 1122 reescreve `nome_contato` a cada mensagem, então o grupo passa a se chamar como a pessoa. Foi assim que o grupo `120363397034366398` virou "Crispim Santana".

- [ ] **Passo 2: corrigir**

Substitua as linhas 689-693 por:

```ts
  const pushName: string = isGroup
    // 🔴 NUNCA `|| msg.senderName` aqui. Em grupo, senderName é o PARTICIPANTE
    // que enviou, e quando a uazapi manda o pacote degradado (acontece: nas 19
    // mensagens indecifráveis do histórico, `sender_pn` vem nulo em todas)
    // `groupName` chega vazio — o grupo era renomeado com o nome do cliente.
    // Vazio aqui significa "mantenha o nome que já está" (ver linha ~1122);
    // quem enviou já é gravado separado em `remetente_nome`, que é onde serve.
    ? groupName
    : sentByOtherChannel
      ? (contactSavedName || payload.chat?.name || payload.chat?.wa_name || "")
      : (contactSavedName || payload.chat?.name || msg.senderName || payload.chat?.wa_name || "");
```

- [ ] **Passo 3: conferir que o fallback preserva o nome**

Leia as linhas 1120-1126. Devem estar assim:

```ts
    nomeContatoResolvido = existente.nome_contato_editado_manualmente
      ? existente.nome_contato
      : (pushName || existente.nome_contato);
```

`pushName` vazio cai em `existente.nome_contato` — o nome atual é preservado. Nada a mudar aqui; só confirme.

- [ ] **Passo 4: commitar**

```bash
git commit --only -m "fix(whatsapp): grupo para de ser renomeado com o nome de quem enviou

Quando a uazapi manda o pacote sem o nome do grupo, o webhook caia em
msg.senderName — e como nome_contato e reescrito a cada mensagem, o grupo
passava a se chamar como o participante. Um grupo da MD esta assim agora.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/functions/whatsapp-webhook/index.ts
```

- [ ] **Passo 5: publicar**

🔴 Peça ao dono do produto antes.

```bash
npx supabase functions deploy whatsapp-webhook --project-ref hukeirrmsoiowvvrhivx
```

---

### Tarefa 7: a mensagem indecifrável

**Arquivos:**
- Criar: `src/lib/mensagem-indecifravel.ts`
- Teste: `src/lib/mensagem-indecifravel.test.ts`
- Modificar: `src/pages/WhatsAppInbox.tsx`

**Interfaces:**
- Consome: nada.
- Produz: `ehIndecifravel(conteudo: string | null | undefined): boolean` e `FRASE_INDECIFRAVEL: string`.

**Contexto:** o texto `[Undecryptable] [text] Não foi possível descriptografar a mensagem…` vem **pronto da uazapi**. Quem não conseguiu abrir a mensagem foi o WhatsApp conectado, não o Repply — não há nada para descriptografar do nosso lado e nenhuma chamada que recupere o conteúdo depois. São 19 em 75.952 (0,025%). O que se faz é mostrar isso com dignidade.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/mensagem-indecifravel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ehIndecifravel } from './mensagem-indecifravel';

describe('ehIndecifravel', () => {
  it('reconhece as formas que a uazapi já mandou', () => {
    // As quatro variantes observadas em produção em 09/09/2026.
    expect(ehIndecifravel('[Undecryptable] [text] Não foi possível descriptografar a mensagem. Abra o WhatsApp no seu celular para visualizá-la.')).toBe(true);
    expect(ehIndecifravel('[Undecryptable] [reaction] Não foi possível descriptografar a mensagem.')).toBe(true);
    expect(ehIndecifravel('[Undecryptable] [media] [image] Não foi possível descriptografar a mensagem.')).toBe(true);
    expect(ehIndecifravel('[Undecryptable] [media] [view_once] Não foi possível descriptografar a mensagem.')).toBe(true);
  });

  it('não confunde com mensagem comum', () => {
    expect(ehIndecifravel('Bom dia, tem o orçamento do Quartzolit?')).toBe(false);
    expect(ehIndecifravel('[Imagem]')).toBe(false);
    expect(ehIndecifravel('')).toBe(false);
    expect(ehIndecifravel(null)).toBe(false);
    expect(ehIndecifravel(undefined)).toBe(false);
  });

  it('não depende de maiúscula', () => {
    expect(ehIndecifravel('[undecryptable] [text] qualquer coisa')).toBe(true);
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
npx vitest run src/lib/mensagem-indecifravel.test.ts
```

Esperado: FALHA com `Failed to resolve import "./mensagem-indecifravel"`.

- [ ] **Passo 3: escrever o módulo**

Crie `src/lib/mensagem-indecifravel.ts`:

```ts
/**
 * A mensagem que o WhatsApp conectado não conseguiu abrir.
 *
 * O texto `[Undecryptable] …` vem PRONTO da uazapi — não é nossa tradução e não
 * é defeito nosso: quem falhou em decifrar foi a sessão do WhatsApp, e não
 * existe chamada que recupere o conteúdo depois. Acontece quando o provedor
 * entrega o pacote pela metade; nas 19 ocorrências do histórico da MD (de
 * 75.952 mensagens), `remetente_telefone` veio nulo em todas.
 *
 * O que dá para fazer é não jogar o texto cru do provedor na cara de quem
 * atende — e é só isso que este módulo existe para fazer.
 */

const MARCADOR = '[undecryptable]';

export const FRASE_INDECIFRAVEL =
  'Esta mensagem não pôde ser lida aqui — abra o WhatsApp no celular para vê-la.';

export function ehIndecifravel(conteudo: string | null | undefined): boolean {
  return (conteudo ?? '').toLowerCase().includes(MARCADOR);
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/mensagem-indecifravel.test.ts
```

Esperado: **3 passando**.

- [ ] **Passo 5: usar na bolha da mensagem e na prévia da lista**

Em `src/pages/WhatsAppInbox.tsx`, importe:

```ts
import { ehIndecifravel, FRASE_INDECIFRAVEL } from '@/lib/mensagem-indecifravel';
```

Na função `UltimaMensagemPreview` (linha 1519), acrescente como primeira condição:

```tsx
  if (ehIndecifravel(mensagem)) {
    return <span className="italic text-muted-foreground">Mensagem não lida aqui</span>;
  }
```

E onde o corpo da mensagem é renderizado na bolha, mostre `FRASE_INDECIFRAVEL` em itálico e cor esmaecida no lugar do conteúdo. Localize o ponto com:

```bash
grep -n "msg.conteudo" src/pages/WhatsAppInbox.tsx | head
```

- [ ] **Passo 6: verificar e commitar**

```bash
npm run test 2>&1 | tail -5
```

```bash
git commit --only -m "fix(whatsapp): mensagem indecifravel deixa de mostrar o texto cru do provedor

O '[Undecryptable] …' vem pronto da uazapi: quem falhou em decifrar foi a
sessao do WhatsApp, e nao ha como recuperar o conteudo. Sao 19 em 75.952. A
conversa passa a dizer isso em portugues em vez de despejar o marcador.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/mensagem-indecifravel.ts src/lib/mensagem-indecifravel.test.ts src/pages/WhatsAppInbox.tsx
```

---

### Tarefa 8: consertar o grupo que já ficou torto

**Arquivos:**
- Criar: `scripts/corrigir-nome-do-grupo-crispim-20260909.sql`

🔴 **Escrita em produção.** Regra da casa: medir, mostrar a lista ao dono do produto, entregar a rota de saída **antes** da escrita, e conferir depois. Quem executa é o dono do produto, no Supabase — **não rode você**.

- [ ] **Passo 1: medir quantos grupos estão com nome de pessoa**

```sql
select c.id, c.telefone, c.nome_contato, c.nome_contato_editado_manualmente,
       count(m.id) as mensagens,
       count(distinct m.remetente_nome) as participantes_distintos
from whatsapp_conversas c
left join whatsapp_mensagens m on m.conversa_id = c.id
where c.is_group = true
  and c.empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
  and exists (
    select 1 from whatsapp_mensagens m2
    where m2.conversa_id = c.id and m2.remetente_nome = c.nome_contato
  )
group by c.id, c.telefone, c.nome_contato, c.nome_contato_editado_manualmente;
```

Um grupo cujo `nome_contato` é igual ao `remetente_nome` de alguma mensagem é forte candidato a ter sido renomeado pelo defeito. Conhecido em 09/09/2026: `120363397034366398`, "Crispim Santana".

- [ ] **Passo 2: descobrir o nome de verdade**

O nome certo **não está no banco** — foi sobrescrito. Peça ao dono do produto o nome real do grupo, olhando o WhatsApp. Não invente.

- [ ] **Passo 3: escrever o script com cópia e desfazer**

Crie `scripts/corrigir-nome-do-grupo-crispim-20260909.sql` com esta estrutura, substituindo `<NOME REAL>` pelo que o dono do produto informar:

```sql
-- Conserta o nome de grupo que o webhook sobrescreveu com o nome de quem enviou.
--
-- COMO DESFAZER (rode isto se algo sair errado):
--   update whatsapp_conversas c
--      set nome_contato = b.nome_antes
--     from backup_nome_grupo_20260909 b
--    where c.id = b.id;
--
-- Depois de conferir que ficou certo, a tabela de cópia pode ser removida:
--   drop table backup_nome_grupo_20260909;

begin;

-- PASSO 0 — trava de empresa. Aborta se não for a MD.
do $$
begin
  if not exists (
    select 1 from empresas
    where id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
      and nome = 'MD Representações'
  ) then
    raise exception 'Empresa errada — script abortado.';
  end if;
end $$;

-- PASSO 1 — cópia do valor de antes.
create table backup_nome_grupo_20260909 as
select id, nome_contato as nome_antes, now() as copiado_em
from whatsapp_conversas
where id = (
  select id from whatsapp_conversas
  where telefone = '120363397034366398'
    and empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
);

alter table backup_nome_grupo_20260909 enable row level security;

-- PASSO 2 — aborta se não achou exatamente uma linha.
do $$
declare n int;
begin
  select count(*) into n from backup_nome_grupo_20260909;
  if n <> 1 then
    raise exception 'Esperava 1 grupo, achei %. Script abortado.', n;
  end if;
end $$;

-- PASSO 3 — a correção, condicionada ao valor de antes.
update whatsapp_conversas c
   set nome_contato = '<NOME REAL>',
       -- Marca como editado à mão para o webhook nunca mais sobrescrever este
       -- nome, mesmo que volte a chegar pacote degradado.
       nome_contato_editado_manualmente = true
  from backup_nome_grupo_20260909 b
 where c.id = b.id
   and c.nome_contato = b.nome_antes;

-- PASSO 4 — conferência.
select c.telefone, b.nome_antes, c.nome_contato as nome_agora,
       c.nome_contato_editado_manualmente
from whatsapp_conversas c join backup_nome_grupo_20260909 b on b.id = c.id;

commit;
```

- [ ] **Passo 4: entregar ao dono do produto**

Mande o arquivo e diga em uma frase o que ele faz, o que a conferência final deve mostrar, e como desfazer. **Não execute.**

- [ ] **Passo 5: commitar o script**

```bash
git commit --only -m "chore(whatsapp): script para corrigir o nome do grupo sobrescrito pelo webhook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- scripts/corrigir-nome-do-grupo-crispim-20260909.sql
```

---

## Verificação final do bloco

- [ ] `npm run test` — todos passando, acima da linha de base de 1.140
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — sem aumentar os ~31 erros pré-existentes
- [ ] `npm run lint` — sem aumentar a linha de base de 433
- [ ] `npm run build` — sucesso
- [ ] No navegador: som de envio, som de chegada fora do foco, silêncio na conversa aberta, rascunho separado por chat com selo vermelho e conversa no topo
- [ ] As duas Edge Functions (`whatsapp-send`, `whatsapp-webhook`) publicadas **com o aval do dono do produto**
