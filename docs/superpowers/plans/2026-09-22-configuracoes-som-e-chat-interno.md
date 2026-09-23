# Configurações (som) e Chat interno — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar 4 melhorias — som padrão "Toque suave", visualizador de mídia embutido no chat interno, "marcar como não lida" por clique direito, e o espaço pessoal "Anotações".

**Architecture:** Frontend React/Vite + Supabase. Três das quatro são só tela; a de "marcar como não lida" acrescenta uma tabela por-pessoa (`chat_conversa_nao_lida`) com RLS. O chat interno mora em `src/pages/Chat.tsx` (~2500 linhas), `src/hooks/use-chat.ts` e `src/hooks/use-notificacoes.ts`. Reaproveitamos o que já existe (`FilePreviewDialog`, `enderecoDe`, `chaveDoAlvo`) e extraímos a lógica pura para `src/lib/` com teste, no padrão do projeto.

**Tech Stack:** React 18, TypeScript (frouxo), Vite, shadcn/Radix, TanStack Query, Supabase (Postgres + RLS + Storage), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-configuracoes-som-e-chat-interno-design.md`

## Global Constraints

- **PT-BR** em interface, comentário, mensagem de erro e commit (CLAUDE §5).
- **Escopo:** as 3 tarefas de chat são para o **chat interno** (`chat_*`), nunca o WhatsApp.
- **Verificação antes de "feito"** (CLAUDE §9), rodada no worktree `_chat-config`:
  `npx tsc --noEmit -p tsconfig.app.json` (nº de erros herdados não sobe — base ~35),
  `npm run test` (passa; nº de testes não cai), `npm run build` (compila),
  `npm run lint` (nº de problemas não sobe).
- **Tabela nova nasce por migration** com RLS e política no mesmo arquivo (§6.2); **migration escrita ≠ aplicada** (§6) — aplicar em produção **espera o "pode" do Lucas** (Task 4 aplica; as demais são só tela).
- **`.delete()`/`.update()` conferem contagem** e `count === 0` é recusa **quando a ação é do usuário** (§4.6); a limpeza automática da marca ao abrir a conversa **não** é recusa quando não havia marca.
- **`usuarios.id` ≠ `usuarios.user_id`** (§4.5): a coluna nova referencia `usuarios(id)` e guardamos `get_my_usuario_id()`.
- **Dado real nunca entra em teste/código** (§6.9): use nomes inventados.
- **Git:** `git fetch` antes de commitar; nunca `git add -A`; listar arquivos um a um; publicar só os próprios commits (§13).

---

## Task 1: Som "Toque suave" como padrão

**Files:**
- Modify: `src/lib/catalogo-de-sons.ts:20-33`
- Test: `src/lib/catalogo-de-sons.test.ts:6-15`
- Test: `src/hooks/use-som-escolhido.test.ts:7-30`

**Interfaces:**
- Produces: `SOM_PADRAO` passa a valer `'toque-suave'`; `CATALOGO_DE_SONS[0]` passa a ser o "Toque suave"; o id `'padrao'` continua existindo com rótulo `'Alerta'`. Nenhuma assinatura muda.

- [ ] **Step 1: Atualizar os testes do catálogo (falham contra o código atual)**

Em `src/lib/catalogo-de-sons.test.ts`, trocar o `it` das linhas 7-9 e o das 11-15:

```ts
  it('o primeiro é o padrão de hoje', () => {
    expect(CATALOGO_DE_SONS[0]).toMatchObject({ id: SOM_PADRAO, rotulo: 'Toque suave', arquivo: '/sons/opcoes/toque-suave.mp3' });
  });

  it('tem os 10 sons, na ordem da tela', () => {
    expect(CATALOGO_DE_SONS.map((s) => s.rotulo)).toEqual([
      'Toque suave', 'Alerta', 'Plim', 'Cristal', 'Arpejo', 'Pop', 'Marimba', 'Sino', 'Gota', 'Bipe duplo',
    ]);
  });
```

- [ ] **Step 2: Atualizar os testes do som escolhido (falham contra o código atual)**

Em `src/hooks/use-som-escolhido.test.ts`, trocar `'padrao'` por `'toque-suave'` nas três asserções de padrão:

```ts
  it('sem escolha, é o padrão', () => {
    expect(somEscolhido()).toBe('toque-suave');
    expect(renderHook(() => useSomEscolhido()).result.current.id).toBe('toque-suave');
  });
```
```ts
  it('valor estranho no navegador vale como padrão', () => {
    localStorage.setItem('repply_som_notificacao', 'som-apagado');
    expect(somEscolhido()).toBe('toque-suave');
  });

  it('escolher um id desconhecido grava o padrão, nunca lixo', () => {
    const { result } = renderHook(() => useSomEscolhido());
    act(() => result.current.escolher('inventado'));
    expect(localStorage.getItem('repply_som_notificacao')).toBe('toque-suave');
  });
```

- [ ] **Step 3: Rodar os testes e ver falhar**

Run: `npx vitest run src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.test.ts`
Expected: FAIL (o código ainda tem 'Padrão' no índice 0 e `SOM_PADRAO === 'padrao'`).

- [ ] **Step 4: Reordenar o catálogo e renomear**

Em `src/lib/catalogo-de-sons.ts`, substituir o bloco das linhas 20-33 por:

```ts
export const SOM_PADRAO = 'toque-suave';

export const CATALOGO_DE_SONS: readonly SomDeNotificacao[] = [
  { id: SOM_PADRAO, rotulo: 'Toque suave', arquivo: '/sons/opcoes/toque-suave.mp3', grupo: 'padrao' },
  { id: 'padrao', rotulo: 'Alerta', arquivo: '/sons/notificacao.mp3', grupo: 'opcoes' },
  { id: 'plim', rotulo: 'Plim', arquivo: '/sons/opcoes/plim.mp3', grupo: 'opcoes' },
  { id: 'cristal', rotulo: 'Cristal', arquivo: '/sons/opcoes/cristal.mp3', grupo: 'opcoes' },
  { id: 'arpejo', rotulo: 'Arpejo', arquivo: '/sons/opcoes/arpejo.mp3', grupo: 'opcoes' },
  { id: 'pop', rotulo: 'Pop', arquivo: '/sons/opcoes/pop.mp3', grupo: 'opcoes' },
  { id: 'marimba', rotulo: 'Marimba', arquivo: '/sons/opcoes/marimba.mp3', grupo: 'repply' },
  { id: 'sino', rotulo: 'Sino', arquivo: '/sons/opcoes/sino.mp3', grupo: 'repply' },
  { id: 'gota', rotulo: 'Gota', arquivo: '/sons/opcoes/gota.mp3', grupo: 'repply' },
  { id: 'bipe-duplo', rotulo: 'Bipe duplo', arquivo: '/sons/opcoes/bipe-duplo.mp3', grupo: 'repply' },
];
```

Nada mais muda: `somDoCatalogo` já cai em `CATALOGO_DE_SONS[0]` (agora "Toque suave"), `use-som-escolhido.ts` já usa `SOM_PADRAO` como rede de segurança, e `CardDeSom` desenha `principais` (grupo ≠ `repply`) na ordem do array — ou seja, "Toque suave" em cima, "Alerta" logo abaixo.

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `npx vitest run src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalogo-de-sons.ts src/lib/catalogo-de-sons.test.ts src/hooks/use-som-escolhido.test.ts
git commit -m "feat(config): Toque suave vira o som padrao; o antigo Padrao vira Alerta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Componente `VisualizadorDeMidia` (imagem com zoom + vídeo)

**Files:**
- Create: `src/components/chat/VisualizadorDeMidia.tsx`
- Test: `src/components/chat/VisualizadorDeMidia.test.tsx`

**Interfaces:**
- Produces: `VisualizadorDeMidia({ midia, onClose })` e o tipo `MidiaParaVer = { url: string; tipo: 'imagem' | 'video'; nome?: string }`. Modal (shadcn `Dialog`) que mostra imagem com zoom por botões/arraste ou vídeo com controles, e um botão "Baixar". Fecha via `onClose`.

- [ ] **Step 1: Escrever o teste do componente (falha — arquivo não existe)**

Criar `src/components/chat/VisualizadorDeMidia.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualizadorDeMidia } from './VisualizadorDeMidia';

describe('VisualizadorDeMidia', () => {
  it('mostra a imagem quando o tipo é imagem', () => {
    render(<VisualizadorDeMidia midia={{ url: 'blob:x', tipo: 'imagem', nome: 'foto.png' }} onClose={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'foto.png' })).toBeInTheDocument();
  });

  it('mostra o player de vídeo quando o tipo é vídeo', () => {
    const { container } = render(<VisualizadorDeMidia midia={{ url: 'blob:y', tipo: 'video', nome: 'clipe.mp4' }} onClose={vi.fn()} />);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('não renderiza nada sem mídia', () => {
    const { container } = render(<VisualizadorDeMidia midia={null} onClose={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/chat/VisualizadorDeMidia.test.tsx`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Escrever o componente**

Criar `src/components/chat/VisualizadorDeMidia.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { downloadFile } from '@/lib/download-file';

export interface MidiaParaVer {
  url: string;
  tipo: 'imagem' | 'video';
  nome?: string;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.5;

/**
 * Mini-visualização embutida de imagem e vídeo do chat interno (como no WhatsApp):
 * a imagem abre com zoom (botões e arraste), o vídeo toca com controles — em vez de
 * abrir em nova aba. Documento (PDF/Word/Excel) continua no `FilePreviewDialog`.
 */
export function VisualizadorDeMidia({ midia, onClose }: { midia: MidiaParaVer | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const arrastando = useRef<{ x: number; y: number } | null>(null);

  // Zera zoom e deslocamento a cada mídia nova aberta.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [midia?.url]);

  if (!midia) return null;

  const aplicarZoom = (delta: number) =>
    setZoom((z) => {
      const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
      if (novo === 1) setPan({ x: 0, y: 0 });
      return novo;
    });

  const aoPressionar = (e: React.MouseEvent) => {
    if (zoom === 1) return;
    arrastando.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const aoMover = (e: React.MouseEvent) => {
    if (!arrastando.current) return;
    setPan({ x: e.clientX - arrastando.current.x, y: e.clientY - arrastando.current.y });
  };
  const soltar = () => { arrastando.current = null; };

  return (
    <Dialog open={!!midia} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-end gap-1 p-2 border-b border-border bg-muted/30">
          {midia.tipo === 'imagem' && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Diminuir zoom" onClick={() => aplicarZoom(-ZOOM_STEP)}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Aumentar zoom" onClick={() => aplicarZoom(ZOOM_STEP)}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Voltar ao tamanho normal" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 mr-8" onClick={() => downloadFile(midia.url, midia.nome || 'arquivo')}>
            <Download className="h-3.5 w-3.5" /> Baixar
          </Button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-black/90">
          {midia.tipo === 'imagem' ? (
            <img
              src={midia.url}
              alt={midia.nome || 'imagem'}
              draggable={false}
              onMouseDown={aoPressionar}
              onMouseMove={aoMover}
              onMouseUp={soltar}
              onMouseLeave={soltar}
              onDoubleClick={() => (zoom === 1 ? aplicarZoom(1) : (setZoom(1), setPan({ x: 0, y: 0 })))}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'default' }}
              className="max-h-[80vh] max-w-full object-contain select-none transition-transform"
            />
          ) : (
            <video src={midia.url} controls autoPlay className="max-h-[80vh] max-w-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/chat/VisualizadorDeMidia.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/VisualizadorDeMidia.tsx src/components/chat/VisualizadorDeMidia.test.tsx
git commit -m "feat(chat): componente de visualizacao embutida de imagem e video

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Ligar o visualizador no chat interno

**Files:**
- Modify: `src/pages/Chat.tsx` (import; estado; `renderImagens` 807-822; `renderVideos` 824-842; balão 2101-2147; render do modal perto do `FilePreviewDialog`)

**Interfaces:**
- Consumes: `VisualizadorDeMidia`, `MidiaParaVer` (Task 2); `enderecoDe`, `setPreviewFile`, `isPreviewable` (já existem).

- [ ] **Step 1: Importar o componente e criar o estado**

Adicionar ao bloco de imports (perto da linha 38, junto do `FilePreviewDialog`):

```tsx
import { VisualizadorDeMidia, type MidiaParaVer } from '@/components/chat/VisualizadorDeMidia';
```

Adicionar o estado logo após `const [previewFile, setPreviewFile] = useState<FilePreviewTarget | null>(null);` (linha 721):

```tsx
  const [midiaAberta, setMidiaAberta] = useState<MidiaParaVer | null>(null);
```

- [ ] **Step 2: `renderImagens` — abrir no visualizador em vez de nova aba**

Substituir o `<a>…</a>` de `renderImagens` (linhas 810-819) por:

```tsx
        <button
          key={m.id}
          type="button"
          onClick={() => setMidiaAberta({ url: enderecoDe(m.arquivo_url)!, tipo: 'imagem', nome: m.arquivo_nome ?? 'imagem' })}
          className="aspect-square rounded-md overflow-hidden border border-border hover:opacity-80 transition-opacity"
          title={format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
        >
          <img src={enderecoDe(m.arquivo_url)!} alt={m.arquivo_nome ?? 'imagem'} className="h-full w-full object-cover" />
        </button>
```

- [ ] **Step 3: `renderVideos` — abrir no visualizador em vez de nova aba**

Substituir o `<a>…</a>` de `renderVideos` (linhas 827-839) por:

```tsx
        <button
          key={m.id}
          type="button"
          onClick={() => setMidiaAberta({ url: enderecoDe(m.arquivo_url)!, tipo: 'video', nome: m.arquivo_nome ?? 'vídeo' })}
          className="relative aspect-square rounded-md overflow-hidden border border-border bg-black/5 hover:opacity-80 transition-opacity"
          title={format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
        >
          <video src={enderecoDe(m.arquivo_url)!} className="h-full w-full object-cover" muted />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play className="h-5 w-5 text-white fill-white" />
          </span>
        </button>
```

- [ ] **Step 4: Balão — imagem abre no visualizador; vídeo toca embutido**

No balão (linhas 2105-2146), trocar o ramo da imagem (`<a target="_blank">`, 2106-2113) por um botão que abre o visualizador, e **acrescentar um ramo de vídeo** antes do `isPreviewable`. Substituir o trecho das linhas 2105-2146 por:

```tsx
                                    ) : msg.arquivo_tipo?.startsWith('image/') ? (
                                      <div className="relative group/img">
                                        <button
                                          type="button"
                                          onClick={() => setMidiaAberta({ url: enderecoDe(msg.arquivo_url)!, tipo: 'imagem', nome: msg.arquivo_nome || 'imagem' })}
                                          className="block"
                                        >
                                          <img
                                            src={enderecoDe(msg.arquivo_url)!}
                                            alt={msg.arquivo_nome || 'imagem'}
                                            className="max-w-[240px] max-h-[200px] rounded-lg object-cover"
                                          />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadFile(enderecoDe(msg.arquivo_url)!, msg.arquivo_nome || 'imagem')}
                                          className="absolute top-2 right-2 p-1.5 bg-background/80 hover:bg-background rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"
                                          title="Baixar imagem"
                                        >
                                          <Download className="h-3.5 w-3.5 text-foreground" />
                                        </button>
                                      </div>
                                    ) : msg.arquivo_tipo?.startsWith('video/') ? (
                                      <video
                                        src={enderecoDe(msg.arquivo_url)!}
                                        controls
                                        className="max-w-[240px] max-h-[200px] rounded-lg"
                                      />
                                    ) : isPreviewable(msg.arquivo_nome || 'arquivo', msg.arquivo_tipo) ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewFile({ url: enderecoDe(msg.arquivo_url)!, nome: msg.arquivo_nome || 'Arquivo', mime: msg.arquivo_tipo })}
                                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors w-full text-left ${
                                          isMe ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-background/50 hover:bg-background/80'
                                        }`}
                                      >
                                        <FileText className="h-5 w-5 shrink-0" />
                                        <span className="text-xs truncate max-w-[180px]">{msg.arquivo_nome || 'Arquivo'}</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => downloadFile(enderecoDe(msg.arquivo_url)!, msg.arquivo_nome || 'Arquivo')}
                                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors w-full text-left ${
                                          isMe ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-background/50 hover:bg-background/80'
                                        }`}
                                      >
                                        <FileText className="h-5 w-5 shrink-0" />
                                        <span className="text-xs truncate max-w-[180px]">{msg.arquivo_nome || 'Arquivo'}</span>
                                        <Download className="h-4 w-4 shrink-0 ml-auto" />
                                      </button>
                                    )}
```

- [ ] **Step 5: Renderizar o modal**

Logo após o `<FilePreviewDialog ... />` (perto da linha 2516), acrescentar:

```tsx
      <VisualizadorDeMidia midia={midiaAberta} onClose={() => setMidiaAberta(null)} />
```

- [ ] **Step 6: Verificar (esta tarefa é de tela; a prova é a pré-visualização, CLAUDE §9)**

```bash
npx tsc --noEmit -p tsconfig.app.json   # nº de erros não sobe
npm run build                            # compila
```
Depois, com o servidor de desenvolvimento (`preview_start`), abrir o Chat interno e conferir: imagem no balão e no painel lateral abre o visualizador (com zoom), vídeo toca embutido, PDF/Word/Excel seguem no modal de arquivo, e nada mais abre em nova aba (exceto link de texto). Tirar um print como evidência.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): imagem abre com zoom e video toca embutido, sem abrir nova aba

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Estrutura do banco — tabela `chat_conversa_nao_lida`

> 🔴 **Aplicar em produção espera o "pode" do Lucas** (§6/§13). Esta tarefa **escreve e commita** a migration e atualiza os tipos; a aplicação (`apply_migration`) é um passo à parte, com medição, ensaio (transação que termina em `RAISE`) e confirmação, como manda o rito.

**Files:**
- Create: `supabase/migrations/20260922200000_chat_conversa_nao_lida.sql`
- Modify: `src/integrations/supabase/types.ts` (acrescentar a tabela à mão, §6.8)

**Interfaces:**
- Produces: tabela `chat_conversa_nao_lida(usuario_id, empresa_id, alvo, criado_em)`, PK `(usuario_id, alvo)`, RLS por-pessoa. `alvo` é a mesma chave de `chaveDoAlvo` (`'geral' | 'grupo_<id>' | 'dm_<id>'`).

- [ ] **Step 1: Conferir que o prefixo de versão não colide (memória: duas sessões já colidiram)**

Run: `ls supabase/migrations/ | grep 20260922` e `git log origin/main --oneline -- supabase/migrations | head`
Expected: nenhuma migration com `20260922200000`. Se houver, subir o número.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260922200000_chat_conversa_nao_lida.sql`:

```sql
-- "Marcar conversa como não lida" no chat interno, privado por pessoa.
--
-- O não-lido do chat interno é um booleano por mensagem (chat_mensagens.lida), que vira
-- true assim que QUALQUER UM lê — então reverter lida=false num grupo reapareceria como
-- não-lida para TODOS. Esta tabela guarda a marcação de UMA pessoa para UMA conversa, sem
-- tocar nas mensagens: fica privada e acompanha a pessoa em qualquer aparelho.
--
-- `alvo` é a chave da conversa, a mesma de chaveDoAlvo/useUnreadChatByTarget:
--   'geral' | 'grupo_<uuid>' | 'dm_<uuid do outro>'.

CREATE TABLE public.chat_conversa_nao_lida (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  alvo TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, alvo)
);

ALTER TABLE public.chat_conversa_nao_lida ENABLE ROW LEVEL SECURITY;

-- Cada pessoa só enxerga, cria e apaga as PRÓPRIAS marcações. is_admin() mantém suporte.
CREATE POLICY chat_conversa_nao_lida_select ON public.chat_conversa_nao_lida FOR SELECT TO authenticated
  USING (is_admin() OR usuario_id = get_my_usuario_id());

CREATE POLICY chat_conversa_nao_lida_insert ON public.chat_conversa_nao_lida FOR INSERT TO authenticated
  WITH CHECK (usuario_id = get_my_usuario_id() AND empresa_id = get_my_empresa_id());

CREATE POLICY chat_conversa_nao_lida_delete ON public.chat_conversa_nao_lida FOR DELETE TO authenticated
  USING (usuario_id = get_my_usuario_id());

-- Tempo real: marcar num aparelho reflete no outro na hora (como chat_mensagens_leituras).
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversa_nao_lida;
```

- [ ] **Step 3: Atualizar os tipos à mão (§6.8 — não há banco local)**

Em `src/integrations/supabase/types.ts`, dentro de `Tables`, acrescentar (em ordem alfabética, junto das outras `chat_*`):

```ts
      chat_conversa_nao_lida: {
        Row: {
          usuario_id: string
          empresa_id: string
          alvo: string
          criado_em: string
        }
        Insert: {
          usuario_id: string
          empresa_id: string
          alvo: string
          criado_em?: string
        }
        Update: {
          usuario_id?: string
          empresa_id?: string
          alvo?: string
          criado_em?: string
        }
        Relationships: []
      }
```

- [ ] **Step 4: Conferir tipos e build**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: nº de erros não sobe.

- [ ] **Step 5: Commit (só o arquivo; aplicação vem depois, com o "pode")**

```bash
git add supabase/migrations/20260922200000_chat_conversa_nao_lida.sql src/integrations/supabase/types.ts
git commit -m "feat(chat): estrutura da marca 'nao lida' por pessoa (migration + tipos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: (Passo gated) Aplicar em produção — só depois do "pode" do Lucas**

Medir (a tabela não existe → confirmar), ensaiar num único `execute_sql` que cria a tabela dentro de uma transação terminando em `RAISE EXCEPTION` para desfazer, apresentar, receber o "pode", então `apply_migration` com o conteúdo do arquivo, e conferir que a tabela e as 3 políticas existem. **Não** faça este passo sem a autorização.

---

## Task 5: Lógica pura + hooks da marca "não lida"

**Files:**
- Create: `src/lib/bolinha-nao-lida.ts`
- Test: `src/lib/bolinha-nao-lida.test.ts`
- Create: `src/hooks/use-chat-nao-lida.ts`

**Interfaces:**
- Produces:
  - `estadoDaBolinha(quantidade: number, marcadoNaoLido: boolean): 'numero' | 'ponto' | 'nada'`
  - `useChatMarcadosNaoLidos(): { data: Set<string> }` — chaves de `chaveDoAlvo` que EU marquei.
  - `useMarcarConversaNaoLida(): { mutate: (alvo: string) => void }`
  - `useDesmarcarConversaNaoLida(): { mutate: (alvo: string) => void }`

- [ ] **Step 1: Teste da lógica pura (falha — arquivo não existe)**

Criar `src/lib/bolinha-nao-lida.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { estadoDaBolinha } from './bolinha-nao-lida';

describe('estadoDaBolinha', () => {
  it('há mensagem nova: mostra o número', () => {
    expect(estadoDaBolinha(3, false)).toBe('numero');
    expect(estadoDaBolinha(3, true)).toBe('numero'); // número vence a marca
  });
  it('sem mensagem nova, mas marcada à mão: mostra a bolinha', () => {
    expect(estadoDaBolinha(0, true)).toBe('ponto');
  });
  it('nada a mostrar', () => {
    expect(estadoDaBolinha(0, false)).toBe('nada');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/bolinha-nao-lida.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Escrever a lógica pura**

Criar `src/lib/bolinha-nao-lida.ts`:

```ts
/**
 * O que o selo de não-lida da conversa mostra: o número de mensagens novas quando há
 * mensagem nova de verdade; uma bolinha sem número quando a conversa só está marcada
 * "não lida" à mão (sem mensagem nova); nada quando está tudo lido.
 */
export type EstadoDaBolinha = 'numero' | 'ponto' | 'nada';

export function estadoDaBolinha(quantidade: number, marcadoNaoLido: boolean): EstadoDaBolinha {
  if (quantidade > 0) return 'numero';
  if (marcadoNaoLido) return 'ponto';
  return 'nada';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/bolinha-nao-lida.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever os hooks**

Criar `src/hooks/use-chat-nao-lida.ts`:

```ts
import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const CHAVE = ['chat_marcados_nao_lidos'];

/** As conversas que EU marquei como não lidas (chaves de chaveDoAlvo). */
export function useChatMarcadosNaoLidos() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: [...CHAVE, user?.id],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('chat_conversa_nao_lida').select('alvo');
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.alvo as string));
    },
    enabled: !!user,
  });

  // Marcar/limpar num aparelho reflete no outro (a tabela está no supabase_realtime).
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat-marca-rt-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversa_nao_lida' }, () => {
        qc.invalidateQueries({ queryKey: CHAVE });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, user?.id]);

  return query;
}

async function meuUsuario() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: me } = await supabase.from('usuarios').select('id, empresa_id').eq('user_id', userData.user.id).single();
  return me ?? null;
}

export function useMarcarConversaNaoLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alvo: string) => {
      const me = await meuUsuario();
      if (!me) return;
      const { error } = await supabase
        .from('chat_conversa_nao_lida')
        .upsert({ usuario_id: me.id, empresa_id: me.empresa_id, alvo }, { onConflict: 'usuario_id,alvo', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useDesmarcarConversaNaoLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alvo: string) => {
      const me = await meuUsuario();
      if (!me) return;
      // count===0 aqui NÃO é recusa: abrir uma conversa que não estava marcada limpa "nada",
      // e isso é o normal. A regra de §4.6 vale para exclusão pedida pela pessoa, não para
      // esta limpeza automática. Por isso não lançamos erro em count 0.
      const { error } = await supabase
        .from('chat_conversa_nao_lida')
        .delete()
        .eq('usuario_id', me.id)
        .eq('alvo', alvo);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
```

- [ ] **Step 6: Conferir tipos**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: nº de erros não sobe.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bolinha-nao-lida.ts src/lib/bolinha-nao-lida.test.ts src/hooks/use-chat-nao-lida.ts
git commit -m "feat(chat): logica e hooks da marca 'nao lida' por pessoa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Ligar "marcar como não lida" no chat (clique direito + bolinha)

**Files:**
- Modify: `src/pages/Chat.tsx` (imports; hooks; props/JSX do `MembersList`; limpeza ao abrir)

**Interfaces:**
- Consumes: `useChatMarcadosNaoLidos`, `useMarcarConversaNaoLida`, `useDesmarcarConversaNaoLida` (Task 5); `estadoDaBolinha` (Task 5); `chaveDoAlvo` (`@/lib/alvo-do-chat`); `ContextMenu*` (`@/components/ui/context-menu`).

- [ ] **Step 1: Imports e hooks no `Chat.tsx`**

Adicionar aos imports:

```tsx
import { chaveDoAlvo } from '@/lib/alvo-do-chat';
import { estadoDaBolinha } from '@/lib/bolinha-nao-lida';
import { useChatMarcadosNaoLidos, useMarcarConversaNaoLida, useDesmarcarConversaNaoLida } from '@/hooks/use-chat-nao-lida';
```
(`chaveDoAlvo` já é importado indiretamente? conferir a linha 8; se já houver `import { alvoInicialDaUrl, chaveDoAlvo } from '@/lib/alvo-do-chat'`, não duplicar.)

Perto de `const { data: unreadCounts = {} } = useUnreadChatByTarget();` (linha 777), acrescentar:

```tsx
  const { data: marcadosNaoLidos = new Set<string>() } = useChatMarcadosNaoLidos();
  const marcarNaoLida = useMarcarConversaNaoLida();
  const desmarcarNaoLida = useDesmarcarConversaNaoLida();
```

- [ ] **Step 2: Limpar a marca ao abrir a conversa**

No efeito que roda ao trocar de alvo (linhas 1066-1071), acrescentar a limpeza da marca:

```tsx
  useEffect(() => {
    // Focus input when changing chat target
    inputRef.current?.focus();
    // Also mark as read when switching chat
    markAsRead.mutate({ grupoId: activeGrupoId, recipientId: activeRecipientId });
    // Abrir a conversa também tira a marca "não lida" manual (se houver).
    desmarcarNaoLida.mutate(chaveDoAlvo(target));
  }, [target]);
```

- [ ] **Step 3: Passar as novas props ao `MembersList`**

Na chamada do `<MembersList ... />` (linhas 1457-1472), acrescentar após `unreadCounts={unreadCounts}`:

```tsx
          marcadosNaoLidos={marcadosNaoLidos}
          onMarcarNaoLida={(t) => marcarNaoLida.mutate(chaveDoAlvo(t))}
          onMarcarLida={(t) => {
            markAsRead.mutate({ grupoId: t.type === 'grupo' ? t.grupoId : null, recipientId: t.type === 'dm' ? t.recipientId : null });
            desmarcarNaoLida.mutate(chaveDoAlvo(t));
          }}
```

- [ ] **Step 4: Estender a assinatura do `MembersList`**

No tipo das props de `MembersList` (linhas 117-135), acrescentar:

```tsx
  marcadosNaoLidos: Set<string>;
  onMarcarNaoLida: (t: ChatTarget) => void;
  onMarcarLida: (t: ChatTarget) => void;
```
E na desestruturação (linhas 102-116, dentro de `function MembersList({ ... })`), acrescentar `marcadosNaoLidos, onMarcarNaoLida, onMarcarLida,`.

Importar o menu de contexto no topo do arquivo (uma vez):

```tsx
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
```

- [ ] **Step 5: Um ajudante de selo dentro do `MembersList`**

Logo após a desestruturação das props (antes do `const [memberSearch...]`, linha 136), acrescentar:

```tsx
  // O selo de não-lida: número quando há mensagem nova; bolinha quando só há marca
  // manual; nada quando está tudo lido. `grande` = lista expandida, `pequeno` = trilho.
  const seloNaoLido = (chave: string, tamanho: 'grande' | 'pequeno') => {
    const estado = estadoDaBolinha(unreadCounts[chave] ?? 0, marcadosNaoLidos.has(chave));
    if (estado === 'nada') return null;
    if (estado === 'ponto') {
      return tamanho === 'grande'
        ? <span aria-label="Não lida" className="h-2.5 w-2.5 rounded-full bg-destructive" />
        : <span aria-label="Não lida" className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-1 ring-background" />;
    }
    const n = unreadCounts[chave];
    return tamanho === 'grande'
      ? <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{n}</span>
      : <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-destructive-foreground ring-1 ring-background">{n}</span>;
  };
```

- [ ] **Step 6: Trocar os selos existentes pelo ajudante (6 pontos)**

Na lista **expandida**, trocar o `<span ...>{unreadCounts[...]}</span>` por `{seloNaoLido(chave, 'grande')}`:
- Geral (linhas 292-296) → `{seloNaoLido('geral', 'grande')}`
- Grupo (linhas 334-338) → `{seloNaoLido(`grupo_${g.id}`, 'grande')}`
- Membro (linhas 399-403) → `{seloNaoLido(`dm_${m.id}`, 'grande')}`

No trilho **recolhido**, trocar o bloco `{unreadCounts[...] > 0 && (<span ...>...)}` por `{seloNaoLido(chave, 'pequeno')}`:
- Geral (linhas 164-168) → `{seloNaoLido('geral', 'pequeno')}`
- Grupo (linhas 191-195) → `{seloNaoLido(`grupo_${g.id}`, 'pequeno')}`
- Membro (linhas 223-227) → `{seloNaoLido(`dm_${m.id}`, 'pequeno')}`

(Os selos de menção "@" — linhas 169-171, 196-198, 289-291, 331-333 — ficam como estão.)

- [ ] **Step 7: Menu de clique direito na lista expandida (Geral, grupo, membro)**

Envolver cada `<button>` de conversa da lista expandida num `ContextMenu`. Padrão (exemplo para o Geral, botão das linhas 269-298):

```tsx
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button onClick={() => onSelect({ type: 'geral' })} className={cn(/* ...igual... */)}>
                    {/* ...conteúdo igual... */}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {estadoDaBolinha(unreadCounts['geral'] ?? 0, marcadosNaoLidos.has('geral')) === 'nada' ? (
                    <ContextMenuItem onClick={() => onMarcarNaoLida({ type: 'geral' })}>Marcar como não lida</ContextMenuItem>
                  ) : (
                    <ContextMenuItem onClick={() => onMarcarLida({ type: 'geral' })}>Marcar como lida</ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
```

Fazer o mesmo para o grupo (alvo `{ type: 'grupo', grupoId: g.id }`, chave `grupo_${g.id}`) e para o membro (alvo `{ type: 'dm', memberId: m.id, recipientId: m.id }`, chave `dm_${m.id}`). O trilho recolhido não recebe o menu nesta entrega (só o selo); é acréscimo simples para depois, se pedirem.

- [ ] **Step 8: Verificar (tela + RLS)**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm run lint            # nº de problemas não sobe
```
Com o banco já aplicado (Task 4, passo 6) e **logado como vendedor comum** (não gestor): clicar com o direito numa conversa → "Marcar como não lida"; a conversa mostra a bolinha; abrir a conversa tira a bolinha; conferir que a marca é só sua (outra conta não vê). Print como evidência.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): marcar conversa como nao lida no clique direito, com bolinha por pessoa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Anotações (espaço pessoal — conversa de você com você)

**Files:**
- Modify: `src/pages/Chat.tsx` (cabeçalho da conversa 1410-1419; entrada fixa no `MembersList`; excluir você da lista normal; limpar código morto do "(você)")

**Interfaces:**
- Consumes: `myVendedor` (id de `usuarios`), `target`, `handleSelectTarget`. Alvo das Anotações: `{ type: 'dm', memberId: myVendedor, recipientId: myVendedor }`.

- [ ] **Step 1: Importar o ícone de marcador**

No import de `lucide-react` (linhas 25-29), acrescentar `Bookmark`.

- [ ] **Step 2: Cabeçalho mostra "Anotações" na conversa consigo**

Em `Chat.tsx:1412-1419`, o cálculo de `chatHeaderName`/`chatHeaderSub`. Trocar por:

```tsx
  let chatHeaderName = geralNome;
  let chatHeaderSub = `${members.length} membros`;
  if (target.type === 'dm' && target.memberId === myVendedor) {
    chatHeaderName = 'Anotações';
    chatHeaderSub = 'Só você';
  } else if (target.type === 'grupo' && activeGrupo) {
    chatHeaderName = activeGrupo.nome;
    chatHeaderSub = 'Grupo';
  } else if (target.type === 'dm' && selectedMemberData) {
    chatHeaderName = selectedMemberData.nome;
    chatHeaderSub = selectedMemberData.role;
  }
```

(O avatar do cabeçalho no ramo `dm` usa `getInitials(chatHeaderName)` → "AN"; suficiente. Opcional: trocar por `<Bookmark />` quando `target.memberId === myVendedor`.)

- [ ] **Step 3: Entrada fixa "Anotações" no topo da lista expandida**

Em `MembersList`, logo dentro de `{!searching && (<>` (antes do botão do Geral, linha 268), acrescentar a entrada — visível só quando `myId` já é conhecido:

```tsx
              {/* Anotações: conversa de você com você — espaço pessoal, só você vê. */}
              {myId && (
                <button
                  onClick={() => onSelect({ type: 'dm', memberId: myId, recipientId: myId })}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors w-full text-left',
                    target.type === 'dm' && target.memberId === myId ? 'bg-primary/10' : 'hover:bg-muted/50'
                  )}
                >
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                      <Bookmark className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">Anotações</p>
                    <p className="text-[10px] text-muted-foreground">Recados e arquivos para você</p>
                  </div>
                </button>
              )}
```

- [ ] **Step 4: Entrada "Anotações" no trilho recolhido, e tirar você da lista de membros do trilho**

No trilho recolhido (linhas 142-236), acrescentar a entrada de Anotações logo antes do botão do Geral (linha 149), e trocar `members.map((m) => {` (linha 202) por `members.filter((m) => m.id !== myId).map((m) => {` para não listar você duas vezes.

Entrada do trilho (antes de `<div className="relative">` do Geral):

```tsx
        {myId && (
          <button
            onClick={() => onSelect({ type: 'dm', memberId: myId, recipientId: myId })}
            className={cn('p-1 rounded-lg transition-colors', target.type === 'dm' && target.memberId === myId ? 'bg-primary/10' : 'hover:bg-muted/50')}
            title="Anotações"
          >
            <Avatar className="h-7 w-7 border border-border">
              <AvatarFallback className="bg-primary/15 text-primary text-[8px]">
                <Bookmark className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
          </button>
        )}
```

- [ ] **Step 5: Limpar o código morto do "(você)"**

Na lista expandida de membros (linhas 362-406), a lista já é `members.filter(m => m.id !== myId)`, então `isMe` é sempre falso. Remover `const isMe = m.id === myId;` (linha 363) e o `{isMe && <span ...>(você)</span>}` (dentro da linha 393), deixando só `{m.nome}`.

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
Na pré-visualização, logado: "Anotações" aparece fixo no topo (lista e trilho), abre uma conversa vazia com cabeçalho "Anotações / Só você", enviar texto/arquivo/imagem funciona e some ao recarregar? (deve **persistir**), não notifica, e você não aparece mais na lista de Membros. Conferir também que outra conta não vê suas anotações. Print como evidência.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): espaco pessoal 'Anotacoes' (conversa de voce com voce) no topo da lista

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** Feature 1 → Task 1; Feature 2 → Tasks 2-3; Feature 3 → Tasks 4-6; Feature 4 → Task 7. Todas cobertas.
- **Sem placeholder:** todo passo de código traz o código real; os pontos de tela têm âncora de linha e o trecho a substituir.
- **Consistência de tipos:** `MidiaParaVer` (Task 2) é consumido em Task 3; `estadoDaBolinha` (Task 5) em Task 6; `chaveDoAlvo`/`alvo` batem entre migration (Task 4), hooks (Task 5) e tela (Task 6); o alvo das Anotações (`dm` com `memberId = myVendedor`) é o mesmo no cabeçalho e na entrada da lista (Task 7).
- **Ordem:** 1 → 2 → 3 → 5 → 6 → 7 são só tela e publicáveis; a Task 4 (banco) tem passo de aplicação **gated** no "pode". As tarefas de chat que dependem do banco (6) só funcionam de verdade após o passo 6 da Task 4.

## Verificação final (antes de publicar — CLAUDE §9)

`npm run test` (passa; nº não cai) · `npx tsc --noEmit -p tsconfig.app.json` (não sobe) · `npm run build` · `npm run lint` (não sobe). RLS testada como vendedor comum. Banco (Task 4) confirmado aplicado antes de publicar a Task 6.
