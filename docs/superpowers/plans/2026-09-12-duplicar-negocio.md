# Duplicar um negócio — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão **Duplicar** no painel do negócio que abre a janela de Novo Negócio já preenchida com a cópia — e não grava nada até a pessoa confirmar.

**Architecture:** Uma função pura, `montarCopiaDeNegocio` (`src/lib/copia-de-negocio.ts`), traduz um negócio existente no preenchimento da janela — é ela que decide o que a cópia leva, o que larga e em que etapa nasce, e é onde ficam os testes. O `<NovoNegocioDialog>` ganha uma propriedade `copiaDe` que só serve para nascer preenchido (inclusive com o anexo do original, pelo link). O caminho é uma URL, `/pedidos/novo?copiaDe=<id>` — o mesmo padrão dos atalhos que já existem (`?clienteId=`, `?status=`, `?funilId=`) —, então o botão do painel só navega, e não há dois modais abertos ao mesmo tempo.

**Tech Stack:** React 18 + TypeScript (frouxo) + Vite, React Router 6, TanStack Query, shadcn/Radix, Vitest + Testing Library (jsdom, **sem** `user-event` — use `fireEvent`).

**Desenho aprovado:** `docs/superpowers/specs/2026-09-12-duplicar-negocio-design.md`. Leia antes da primeira tarefa.

## Global Constraints

- Tudo em **PT-BR**: tela, comentário, nome de teste, mensagem de commit.
- 🔴 **Dado real não entra em teste nem comentário** (CLAUDE.md §6.9). Nos testes use identificadores inventados (`'cliente-1'`, `'obra-1'`, `'fab-1'`, `'user-1'`), "Empresa Exemplo Ltda", "Obra Exemplo" e valores redondos (180000).
- 🔴 **A cópia nunca nasce em etapa de fechamento.** É a regra que impede a mesma venda de contar duas vezes no Dashboard — o gatilho `fn_set_pedido_fechado_em` carimba a data de hoje em negócio que nasce em `fechamento` ou `perdido`.
- 🔴 **Nada é gravado até a pessoa clicar em Criar.** Nenhuma tarefa pode gravar negócio ao abrir a janela.
- Erro de gravação na tela: `mensagemDeErro` (`src/lib/mensagem-de-erro.ts`), nunca `e.message` cru.
- Modal: `<ConteudoDialogo>` e companhia (CLAUDE.md §7.11) — esta janela já usa.
- Tipos: `npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`**.
- 🔴 **Critério de tipos e lint é por arquivo** (outra sessão mexe no mesmo repositório). Antes da Tarefa 1, guarde a contagem de cada arquivo tocado:
  ```bash
  npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "src/components/pedidos/NovoNegocioDialog.tsx"
  npx eslint src/components/pedidos/NovoNegocioDialog.tsx
  ```
  Ao fim de cada tarefa, nenhum arquivo tocado pode ter mais erros do que tinha.
- Git — outra sessão trabalha na mesma pasta, e em 12/09/2026 ela estava **mexendo em Obras** (`src/pages/Obras.tsx`, `src/components/obras/NovaRotaVisitaDialog.tsx`):
  - `git status --short` num comando **separado**, antes de cada commit;
  - `git commit -F <arquivo-da-mensagem> --only -- <caminhos>`, nunca `git add -A`;
  - **nunca** `git push` — publicar é decisão do Lucas, depois do plano inteiro;
  - toda mensagem termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **Nenhuma gravação no banco de produção.** O servidor de desenvolvimento aponta para produção: o ensaio (Tarefa 5) para **antes** de clicar em Criar.
- Não mexa em arquivo fora da lista da tarefa. Achou outro problema? Anote no relatório.

## Decisões técnicas deste plano (tomadas ao escrever, com o porquê)

1. **O caminho é uma URL (`/pedidos/novo?copiaDe=<id>`), não um modal dentro do painel.** O painel do negócio é um `<Sheet>` do Radix; abrir um `<Dialog>` por cima empilha dois modais, e este projeto desligou Esc e clique-fora — o beco sem saída do CLAUDE.md §7.11. A página `NovoPedido` já lê `clienteId`, `status` e `funilId` da URL: `copiaDe` entra no mesmo lugar, e o botão do painel só navega, como o "Editar" já faz.
2. **Quem monta a cópia é uma função pura.** É o que permite provar as regras do desenho (etapa, campos extras, observações) sem renderizar tela nenhuma.
3. **A etapa e o funil viajam pelas propriedades que a janela JÁ tem** (`status`, `funilId`). A propriedade nova, `copiaDe`, cuida só do que ainda não existia.
4. **A página espera os dados antes de montar a janela.** O preenchimento é estado inicial de `useState`, lido **uma vez**: se a janela nascer com a cópia vazia e os dados chegarem depois, ela fica vazia para sempre.
5. **`origem_lead` entra no select compartilhado dos negócios.** É o único campo da cópia que a consulta de hoje não traz. Uma coluna a mais é barata; uma segunda consulta só para ela seria mais cara e mais fácil de esquecer.
6. **O anexo viaja como link.** A cópia aponta para o mesmo arquivo, e a janela passa a aceitar "anexo que já existe" além de "arquivo novo".

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/copia-de-negocio.ts` (cria) | `montarCopiaDeNegocio` e os tipos `NegocioParaCopiar` / `CopiaDeNegocio` |
| `src/lib/copia-de-negocio.test.ts` (cria) | as regras do desenho, sem tela |
| `src/lib/select-de-negocios.ts` + `.test.ts` (mexe) | acrescenta `origem_lead` |
| `src/components/pedidos/NovoNegocioDialog.tsx` (mexe) | propriedade `copiaDe`: nasce preenchida, com aviso e anexo herdado |
| `src/pages/NovoPedido.tsx` (mexe) | lê `?copiaDe=`, carrega o original e monta a cópia |
| `src/components/pedidos/PainelDoNegocio.tsx` (mexe) | botão **Duplicar** no rodapé (chega nas 4 telas de uma vez) |
| `src/test/duplicar-negocio-por-um-caminho-so.test.ts` (cria) | varredura: um caminho só para duplicar |

---

### Task 1: A função que monta a cópia

**Files:**
- Create: `src/lib/copia-de-negocio.ts`
- Create: `src/lib/copia-de-negocio.test.ts`

**Interfaces:**
- Consumes: nada além de tipos próprios.
- Produces:
  ```ts
  export interface NegocioParaCopiar {
    nome: string | null;
    cliente_id: string; obra_id: string | null; fabricante_id: string; usuario_id: string;
    funil_id: string; marcador_id: string | null; origem_lead: string | null;
    endereco_entrega: string | null; valor_total: number | null; pdf_url: string | null;
    campos_extras: Record<string, unknown> | null;
  }
  export interface ResponsavelParaCopiar { usuarioId: string; principal: boolean }
  export interface CopiaDeNegocio {
    rotuloDoOriginal: string;
    clienteId: string; obraId: string; fabricanteId: string; vendedorId: string;
    participantes: string[]; funilId: string; status: string;
    marcadorId: string; origemLead: string; enderecoEntrega: string;
    valor: number | null; pdfUrl: string | null;
    nome: string; nomeAutomatico: boolean;
    camposExtras: Record<string, string>;
  }
  export const ETAPA_INICIAL_PADRAO = 'novo_lead';
  export function montarCopiaDeNegocio(entrada: {
    negocio: NegocioParaCopiar;
    responsaveis?: ResponsavelParaCopiar[];
    camposDaEmpresa?: string[];
    primeiraEtapa?: string | null;
    rotulo?: string;
  }): CopiaDeNegocio;
  ```

- [ ] **Step 1: Write the failing test** — crie `src/lib/copia-de-negocio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { montarCopiaDeNegocio, type NegocioParaCopiar } from './copia-de-negocio';

const ORIGINAL: NegocioParaCopiar = {
  nome: null,
  cliente_id: 'cliente-1',
  obra_id: 'obra-1',
  fabricante_id: 'fab-1',
  usuario_id: 'user-1',
  funil_id: 'funil-1',
  marcador_id: 'marcador-1',
  origem_lead: 'Indicação',
  endereco_entrega: 'Rua Exemplo, 100',
  valor_total: 180000,
  pdf_url: 'https://exemplo.supabase.co/storage/v1/object/public/pedido-anexos/empresa-1/abc/orcamento.pdf',
  // O que a base tem de verdade nos campos extras é rastro da importação do Bitrix.
  campos_extras: {
    'Negócio': 'Obra Exemplo',
    'Contato': 'Pessoa Exemplo',
    'Vendedor Original': 'Alguém',
    responsavel_corrigido: 'sim',
    _lote: '3',
    prioridade: 'alta', // este SIM: campo que a empresa criou
  },
};

describe('montarCopiaDeNegocio — o que a cópia leva', () => {
  it('leva cliente, obra, fábrica, responsável principal, marcador, origem, endereço, valor e anexo', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, primeiraEtapa: 'novo_lead' });
    expect(copia.clienteId).toBe('cliente-1');
    expect(copia.obraId).toBe('obra-1');
    expect(copia.fabricanteId).toBe('fab-1');
    expect(copia.vendedorId).toBe('user-1');
    expect(copia.funilId).toBe('funil-1');
    expect(copia.marcadorId).toBe('marcador-1');
    expect(copia.origemLead).toBe('Indicação');
    expect(copia.enderecoEntrega).toBe('Rua Exemplo, 100');
    expect(copia.valor).toBe(180000);
    expect(copia.pdfUrl).toBe(ORIGINAL.pdf_url);
  });

  it('leva os outros responsáveis como participantes, sem repetir o principal', () => {
    const copia = montarCopiaDeNegocio({
      negocio: ORIGINAL,
      responsaveis: [
        { usuarioId: 'user-1', principal: true },
        { usuarioId: 'user-2', principal: false },
        { usuarioId: 'user-3', principal: false },
      ],
    });
    expect(copia.participantes).toEqual(['user-2', 'user-3']);
  });

  it('campo vazio do original não vira campo preenchido na cópia', () => {
    const copia = montarCopiaDeNegocio({
      negocio: { ...ORIGINAL, obra_id: null, marcador_id: null, origem_lead: null, endereco_entrega: null, valor_total: null, pdf_url: null },
    });
    expect(copia.obraId).toBe('');
    expect(copia.marcadorId).toBe('');
    expect(copia.origemLead).toBe('');
    expect(copia.enderecoEntrega).toBe('');
    expect(copia.valor).toBeNull();
    expect(copia.pdfUrl).toBeNull();
  });
});

describe('montarCopiaDeNegocio — o que a cópia NÃO leva', () => {
  it('🔴 nasce na primeira etapa do funil, mesmo copiando um negócio ganho', () => {
    // Sem isto, o gatilho do banco carimba a data de fechamento de hoje e a MESMA venda
    // aparece duas vezes no faturamento do mês.
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, primeiraEtapa: 'primeiro-contato' });
    expect(copia.status).toBe('primeiro-contato');
  });

  it('sem saber a primeira etapa, cai na etapa inicial padrão — nunca na do original', () => {
    expect(montarCopiaDeNegocio({ negocio: ORIGINAL }).status).toBe('novo_lead');
    expect(montarCopiaDeNegocio({ negocio: ORIGINAL, primeiraEtapa: null }).status).toBe('novo_lead');
  });

  it('não leva observações nem datas: a cópia não tem esses campos', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL });
    expect(Object.keys(copia)).not.toContain('observacoes');
    expect(Object.keys(copia)).not.toContain('dataPedido');
    expect(Object.keys(copia)).not.toContain('prazoResposta');
  });

  it('🔴 leva só o campo extra que a empresa criou — rastro de importação fica para trás', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, camposDaEmpresa: ['prioridade'] });
    expect(copia.camposExtras).toEqual({ prioridade: 'alta' });
  });

  it('sem campo criado pela empresa, os campos extras da cópia ficam vazios', () => {
    expect(montarCopiaDeNegocio({ negocio: ORIGINAL }).camposExtras).toEqual({});
  });

  it('campo criado pela empresa que o original não tem não vira chave vazia', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, camposDaEmpresa: ['prioridade', 'canal'] });
    expect(copia.camposExtras).toEqual({ prioridade: 'alta' });
  });
});

describe('montarCopiaDeNegocio — o nome', () => {
  it('original sem nome próprio: a cópia continua no nome automático', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL });
    expect(copia.nomeAutomatico).toBe(true);
    expect(copia.nome).toBe('');
  });

  it('original com nome próprio: a cópia vem com o mesmo nome, editável', () => {
    const copia = montarCopiaDeNegocio({ negocio: { ...ORIGINAL, nome: 'Torre A — fachada' } });
    expect(copia.nomeAutomatico).toBe(false);
    expect(copia.nome).toBe('Torre A — fachada');
  });

  it('o rótulo do original é o que a janela mostra no aviso "Cópia de"', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, rotulo: 'Empresa Exemplo Ltda | Fábrica Exemplo' });
    expect(copia.rotuloDoOriginal).toBe('Empresa Exemplo Ltda | Fábrica Exemplo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copia-de-negocio.test.ts`
Expected: FAIL — `Failed to resolve import "./copia-de-negocio"`.

- [ ] **Step 3: Write the implementation** — crie `src/lib/copia-de-negocio.ts`:

```ts
/**
 * O que uma cópia de negócio leva do original — e o que ela deixa para trás.
 *
 * Vive separado da tela de propósito: são as regras do desenho de 12/09/2026, e elas se provam
 * sem renderizar nada.
 *
 * 🔴 A CÓPIA NUNCA NASCE NA ETAPA DO ORIGINAL. Um negócio que nasce em `fechamento` ou `perdido`
 * recebe do gatilho `fn_set_pedido_fechado_em` a data de fechamento de hoje — copiar um negócio
 * ganho mantendo a etapa somaria a MESMA venda duas vezes no faturamento do mês, e ninguém
 * perceberia olhando a tela.
 */

export interface NegocioParaCopiar {
  nome: string | null;
  cliente_id: string;
  obra_id: string | null;
  fabricante_id: string;
  usuario_id: string;
  funil_id: string;
  marcador_id: string | null;
  origem_lead: string | null;
  endereco_entrega: string | null;
  valor_total: number | null;
  pdf_url: string | null;
  campos_extras: Record<string, unknown> | null;
}

export interface ResponsavelParaCopiar {
  usuarioId: string;
  principal: boolean;
}

/** O preenchimento da janela de Novo Negócio. Repare no que NÃO existe aqui: observações e datas. */
export interface CopiaDeNegocio {
  /** Como o negócio original se chama na tela — o aviso "Cópia de …". */
  rotuloDoOriginal: string;
  clienteId: string;
  obraId: string;
  fabricanteId: string;
  vendedorId: string;
  participantes: string[];
  funilId: string;
  status: string;
  marcadorId: string;
  origemLead: string;
  enderecoEntrega: string;
  valor: number | null;
  /** O MESMO arquivo do original, pelo link. Não há cópia de arquivo no armazenamento. */
  pdfUrl: string | null;
  nome: string;
  nomeAutomatico: boolean;
  camposExtras: Record<string, string>;
}

/** A etapa de quando não se sabe qual é a primeira do funil. Nunca a etapa do original. */
export const ETAPA_INICIAL_PADRAO = 'novo_lead';

export function montarCopiaDeNegocio({
  negocio,
  responsaveis = [],
  camposDaEmpresa = [],
  primeiraEtapa,
  rotulo,
}: {
  negocio: NegocioParaCopiar;
  responsaveis?: ResponsavelParaCopiar[];
  /** As chaves dos campos que a EMPRESA criou (`configuracoes_campos.origem = 'customizado'`). */
  camposDaEmpresa?: string[];
  primeiraEtapa?: string | null;
  rotulo?: string;
}): CopiaDeNegocio {
  // 🔴 Só o que a empresa criou. O resto de `campos_extras` é rastro da importação do Bitrix
  // ("Negócio", "Contato", "Vendedor Original", "responsavel_corrigido", "_lote", "_demo"): ele
  // conta de onde aquele negócio veio, e a cópia não veio de lá.
  const camposExtras: Record<string, string> = {};
  for (const chave of camposDaEmpresa) {
    const valor = negocio.campos_extras?.[chave];
    if (valor !== undefined && valor !== null && valor !== '') camposExtras[chave] = String(valor);
  }

  return {
    rotuloDoOriginal: rotulo ?? negocio.nome ?? '',
    clienteId: negocio.cliente_id ?? '',
    obraId: negocio.obra_id ?? '',
    fabricanteId: negocio.fabricante_id ?? '',
    vendedorId: negocio.usuario_id ?? '',
    // O principal fica fora: ele é o `vendedorId`, e a gravação o cria por gatilho. Mandá-lo
    // junto violaria a chave primária de `pedido_responsaveis` (ver `useCreatePedidoCompleto`).
    participantes: responsaveis
      .filter((r) => !r.principal && r.usuarioId && r.usuarioId !== negocio.usuario_id)
      .map((r) => r.usuarioId),
    funilId: negocio.funil_id ?? '',
    status: primeiraEtapa || ETAPA_INICIAL_PADRAO,
    marcadorId: negocio.marcador_id ?? '',
    origemLead: negocio.origem_lead ?? '',
    enderecoEntrega: negocio.endereco_entrega ?? '',
    valor: negocio.valor_total ?? null,
    pdfUrl: negocio.pdf_url || null,
    nome: negocio.nome ?? '',
    nomeAutomatico: !negocio.nome,
    camposExtras,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/copia-de-negocio.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Tipos e lint** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "copia-de-negocio"` (Expected: `0`) e `npx eslint src/lib/copia-de-negocio.ts src/lib/copia-de-negocio.test.ts` (Expected: sem problemas).

- [ ] **Step 6: Commit** — `git status --short` num comando separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/lib/copia-de-negocio.ts src/lib/copia-de-negocio.test.ts
```
Mensagem: `feat(negocios): regras da cópia de um negócio — etapa nova, sem observações e sem rastro de importação`

---

### Task 2: A janela de Novo Negócio nasce preenchida

**Files:**
- Modify: `src/components/pedidos/NovoNegocioDialog.tsx`

**Interfaces:**
- Consumes: `CopiaDeNegocio` (Tarefa 1); `filenameFromUrl` (`src/lib/download-file.ts`, assinatura `filenameFromUrl(url: string, fallback?: string): string`).
- Produces: `NovoNegocioDialogProps` com `copiaDe?: CopiaDeNegocio`.
- 🔴 **A etapa e o funil da cópia NÃO entram por aqui.** Eles viajam pelas propriedades `status` e `funilId`, que já existem — quem chama passa as três (Tarefa 3). A propriedade `copiaDe` cuida só do que não tinha caminho.

- [ ] **Step 1: A propriedade nova.** Em `NovoNegocioDialogProps`, acrescente antes de `onCreated`:

```ts
  /**
   * Cópia de um negócio existente: a janela abre preenchida e NADA é gravado até a pessoa
   * confirmar. A etapa e o funil vêm por `status` e `funilId`.
   */
  copiaDe?: CopiaDeNegocio;
```
E o import: `import type { CopiaDeNegocio } from '@/lib/copia-de-negocio';`

Passe adiante nos dois lugares: na desestruturação de `NovoNegocioDialog({ open, onOpenChange, clienteId, status, funilId, onCreated })` acrescente `copiaDe`, e no `<NovoNegocioFormContent ... copiaDe={copiaDe} />`. Em `NovoNegocioFormContent`, acrescente `copiaDe` à desestruturação das propriedades.

- [ ] **Step 2: O estado inicial.** Troque cada `useState` abaixo (todos em `NovoNegocioFormContent`):

```ts
  const [clienteId, setClienteId] = useState(clienteIdProp ?? '');
  const [obraId, setObraId] = useState('');
  const [fabricanteId, setFabricanteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
```
por:
```ts
  // 🔴 O preenchimento da cópia é ESTADO INICIAL, lido uma vez. Quem chama precisa ter a cópia
  // pronta antes de montar a janela — ver `NovoPedido.tsx`.
  const [clienteId, setClienteId] = useState(copiaDe?.clienteId || clienteIdProp || '');
  const [obraId, setObraId] = useState(copiaDe?.obraId ?? '');
  const [fabricanteId, setFabricanteId] = useState(copiaDe?.fabricanteId ?? '');
  const [vendedorId, setVendedorId] = useState(copiaDe?.vendedorId ?? '');
```

E os demais, um a um:
- `const [participantes, setParticipantes] = useState<string[]>([]);` → `useState<string[]>(copiaDe?.participantes ?? [])`
- `const [origemLead, setOrigemLead] = useState('');` → `useState(copiaDe?.origemLead ?? '')`
- `const [enderecoEntrega, setEnderecoEntrega] = useState('');` → `useState(copiaDe?.enderecoEntrega ?? '')`
- `const [status, setStatus] = useState(statusProp ?? 'novo_lead');` → `useState(statusProp ?? copiaDe?.status ?? 'novo_lead')`
- `const [marcadorId, setMarcadorId] = useState('');` → `useState(copiaDe?.marcadorId ?? '')`
- `const [nome, setNome] = useState('');` → `useState(copiaDe?.nome ?? '')`
- `const [nomeAutomatico, setNomeAutomatico] = useState(true);` → `useState(copiaDe ? copiaDe.nomeAutomatico : true)`
- `const [camposExtras, setCamposExtras] = useState<Record<string, string>>({});` → `useState<Record<string, string>>(copiaDe?.camposExtras ?? {})`
- `const [valorManual, setValorManual] = useState<number | null>(null);` → `useState<number | null>(copiaDe?.valor ?? null)`

E acrescente, logo abaixo de `const [pdfFile, setPdfFile] = useState<File | null>(null);`:
```ts
  // O anexo do original, pelo LINK: a cópia aponta para o mesmo arquivo, sem duplicar nada no
  // armazenamento. Tirar o anexo aqui mexe só nesta cópia — nenhum gesto de tela apaga arquivo.
  const [pdfUrlHerdado, setPdfUrlHerdado] = useState<string | null>(copiaDe?.pdfUrl ?? null);
```

**Não mexa** no efeito `if (myVendedorId && !vendedorId) setVendedorId(myVendedorId)`: com a cópia o responsável já vem preenchido, então ele não age — que é o comportamento certo (decisão 5 do desenho).

- [ ] **Step 3: O anexo herdado conta como anexo.** Troque:

```ts
      anexo_pdf: pdfFile ? 'ok' : undefined,
```
por:
```ts
      // O anexo herdado da cópia vale como anexo para a exigência de campo obrigatório: ele já
      // é um PDF de verdade, só que enviado antes.
      anexo_pdf: pdfFile || pdfUrlHerdado ? 'ok' : undefined,
```

E, no `handleSubmit`, troque `    let pdfUrl = '';` por:
```ts
    // Começa no anexo herdado da cópia; um arquivo novo, se houver, toma o lugar dele abaixo.
    let pdfUrl = pdfUrlHerdado ?? '';
```

- [ ] **Step 4: O aviso "Cópia de".** Logo depois da abertura do `<CorpoDialogo` (procure a tag no JSX), acrescente:

```tsx
          {copiaDe && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="text-xs text-foreground">
                Cópia de <span className="font-semibold">{copiaDe.rotuloDoOriginal}</span>. Nada é
                gravado até você criar o negócio.
              </p>
            </div>
          )}
```

- [ ] **Step 5: O anexo herdado na tela.** No bloco do anexo, troque a condição da moldura e o miolo. Troque:

```tsx
                <div className={cn(
                  "relative border-2 border-dashed rounded-lg p-4 transition-colors",
                  pdfFile ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30"
                )}>
```
por:
```tsx
                <div className={cn(
                  "relative border-2 border-dashed rounded-lg p-4 transition-colors",
                  pdfFile || pdfUrlHerdado ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30"
                )}>
```

E, dentro do `<div className="flex items-center justify-center gap-3">`, troque o `) : (` que separa "tem arquivo" de "clique ou arraste" por um caso a mais — o trecho fica assim:

```tsx
                    {pdfFile ? (
                      <>
                        <FileText className="h-6 w-6 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : pdfUrlHerdado ? (
                      /* O anexo veio do negócio copiado: é o MESMO arquivo, e por isso não tem
                         tamanho para mostrar (ele não passou por aqui). Tirar daqui não mexe no
                         original — nenhum gesto de tela apaga arquivo do armazenamento. */
                      <>
                        <FileText className="h-6 w-6 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{filenameFromUrl(pdfUrlHerdado, 'anexo.pdf')}</p>
                          <p className="text-xs text-muted-foreground">Anexo do negócio copiado</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setPdfUrlHerdado(null); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
```
(o resto — `<Upload …>` e os dois parágrafos — fica como está.)

E acrescente o import: `import { filenameFromUrl } from '@/lib/download-file';`

- [ ] **Step 6: Tipos, lint e suíte**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "NovoNegocioDialog.tsx"`, `npx eslint src/components/pedidos/NovoNegocioDialog.tsx` e `npm run test`
Expected: contagens iguais ou menores que a linha de base; nenhum teste que passava antes passou a falhar.

- [ ] **Step 7: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/components/pedidos/NovoNegocioDialog.tsx
```
Mensagem: `feat(negocios): janela de novo negócio aceita nascer preenchida por uma cópia`

---

### Task 3: `/pedidos/novo?copiaDe=<id>` monta a cópia

**Files:**
- Modify: `src/lib/select-de-negocios.ts`
- Modify: `src/lib/select-de-negocios.test.ts`
- Modify: `src/pages/NovoPedido.tsx`

**Interfaces:**
- Consumes: `montarCopiaDeNegocio` (Tarefa 1); a propriedade `copiaDe` (Tarefa 2); `usePedidoPorId` (`@/hooks/use-pedidos`), `useResponsaveisDoNegocio` (`@/hooks/use-responsaveis-do-negocio`, devolve `{ usuarioId, nome, avatarUrl, principal }[]`), `useConfiguracoesCampos('pedidos', empresaId)` (`@/hooks/use-configuracoes-campos`), `useKanbanColunas(empresaId, funilId)` (`@/hooks/use-kanban-colunas`, já ordenado por `ordem`), `useAuth`, `getNomeNegocio` (`@/lib/nome-negocio`).
- Produces: a URL `/pedidos/novo?copiaDe=<id>`, que a Tarefa 4 usa.

- [ ] **Step 1: Write the failing test** — em `src/lib/select-de-negocios.test.ts`, acrescente dentro do `describe`:

```ts
  // A cópia de um negócio (docs/superpowers/specs/2026-09-12-duplicar-negocio-design.md) leva a
  // origem do lead. Era o único campo dela que este select não trazia — e a falta seria
  // silenciosa: a cópia abriria com a origem em branco e ninguém saberia dizer por quê.
  it('traz a origem do lead, que a cópia do negócio leva', () => {
    expect(montarSelectDeNegocios()).toContain('origem_lead');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/select-de-negocios.test.ts`
Expected: FAIL — o select não tem `origem_lead`.

- [ ] **Step 3: Acrescente o campo.** Em `src/lib/select-de-negocios.ts`, troque:

```ts
  cliente_id, fabricante_id, usuario_id, obra_id, funil_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
```
por:
```ts
  cliente_id, fabricante_id, usuario_id, obra_id, funil_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id, origem_lead,
```

Run: `npx vitest run src/lib/select-de-negocios.test.ts` — Expected: PASS.

- [ ] **Step 4: A página monta a cópia.** Substitua o conteúdo de `src/pages/NovoPedido.tsx` por:

```tsx
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { NovoNegocioDialog } from '@/components/pedidos/NovoNegocioDialog';
import { usePedidoPorId } from '@/hooks/use-pedidos';
import { useResponsaveisDoNegocio } from '@/hooks/use-responsaveis-do-negocio';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useAuth } from '@/hooks/use-auth';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { montarCopiaDeNegocio, type NegocioParaCopiar } from '@/lib/copia-de-negocio';

const NovoPedido = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;

  /** Duplicar um negócio é esta tela com um endereço a mais — ver o desenho de 12/09/2026. */
  const copiaDeId = searchParams.get('copiaDe');

  const { data: original, isLoading: carregandoOriginal } = usePedidoPorId(copiaDeId, !!copiaDeId);
  const { data: responsaveis } = useResponsaveisDoNegocio(copiaDeId);
  const { data: camposConfig } = useConfiguracoesCampos('pedidos', empresaId);
  // As etapas do funil DO NEGÓCIO copiado, já em ordem: a primeira é onde a cópia nasce.
  const { data: colunas } = useKanbanColunas(empresaId, original?.funil_id);

  const copia = useMemo(() => {
    if (!copiaDeId || !original) return undefined;
    return montarCopiaDeNegocio({
      negocio: original as unknown as NegocioParaCopiar,
      responsaveis: (responsaveis ?? []).map((r) => ({ usuarioId: r.usuarioId, principal: r.principal })),
      camposDaEmpresa: (camposConfig ?? []).filter((c) => c.origem === 'customizado').map((c) => c.campo_key),
      primeiraEtapa: colunas?.[0]?.slug,
      rotulo: getNomeNegocio(original as never),
    });
  }, [copiaDeId, original, responsaveis, camposConfig, colunas]);

  // 🔴 A JANELA SÓ MONTA COM A CÓPIA PRONTA. O preenchimento dela é estado inicial, lido uma
  // vez: montar antes e preencher depois deixaria a janela vazia para sempre.
  const esperandoACopia = !!copiaDeId && (carregandoOriginal || (!!original && !colunas));

  if (esperandoACopia) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/app')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">
            {copia ? 'Duplicar Negócio' : 'Novo Negócio'}
          </h1>
        </div>
      }
    >
      <NovoNegocioDialog
        open
        onOpenChange={(open) => { if (!open) navigate('/app'); }}
        copiaDe={copia}
        clienteId={copia?.clienteId || searchParams.get('clienteId') || undefined}
        status={copia?.status || searchParams.get('status') || undefined}
        funilId={copia?.funilId || searchParams.get('funilId') || undefined}
        onCreated={() => navigate('/app')}
      />
    </AppLayout>
  );
};

export default NovoPedido;
```

- [ ] **Step 5: Confira o nome do gancho de campos.** Rode `grep -n "export function useConfiguracoesCampos" -A 3 src/hooks/use-configuracoes-campos.ts` e confirme a ordem dos argumentos (`entidade`, `empresaId`) e que cada campo tem `origem` e `campo_key`. Se divergir, ajuste a chamada — não o gancho.

- [ ] **Step 6: Tipos, lint e suíte**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "NovoPedido.tsx|select-de-negocios" | wc -l`, `npx eslint src/pages/NovoPedido.tsx src/lib/select-de-negocios.ts src/lib/select-de-negocios.test.ts` e `npm run test`
Expected: nada subiu; suíte passando.

- [ ] **Step 7: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/lib/select-de-negocios.ts src/lib/select-de-negocios.test.ts src/pages/NovoPedido.tsx
```
Mensagem: `feat(negocios): endereço /pedidos/novo?copiaDe= abre a janela preenchida com a cópia`

---

### Task 4: O botão Duplicar no painel do negócio

**Files:**
- Create: `src/test/duplicar-negocio-por-um-caminho-so.test.ts`
- Modify: `src/components/pedidos/PainelDoNegocio.tsx`

**Interfaces:**
- Consumes: a URL da Tarefa 3.
- O painel é o mesmo em quatro telas (`Negocios`, `Hoje`, `PainelDeNegocios`, `VendasDaObra`): o botão nasce nas quatro de uma vez.

- [ ] **Step 1: Write the failing test** — crie `src/test/duplicar-negocio-por-um-caminho-so.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Duplicar negócio tem UM caminho só: o botão do painel navega para `/pedidos/novo?copiaDe=`, e
 * quem traduz o negócio em preenchimento é `montarCopiaDeNegocio`.
 *
 * 🔴 O que isto impede é a segunda rotina de cópia — uma tela montando "à mão" o negócio novo,
 * com as regras de etapa e de campos extras repetidas e divergentes. É o mesmo desenho das
 * varreduras de planilha e de CNPJ: teste de comportamento não pega cópia nova, porque cada
 * cópia passa nos próprios testes.
 */

const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) achados.push(caminho);
  }
  return achados;
}
// `sep`, e não uma barra escrita à mão: no Windows o caminho vem com contrabarra.
const relativo = (caminho: string) => relative(RAIZ, caminho).split(sep).join('/');

describe('duplicar negócio por um caminho só', () => {
  it('🔴 o painel do negócio duplica navegando para /pedidos/novo?copiaDe=', () => {
    const codigo = ler('components/pedidos/PainelDoNegocio.tsx');
    expect(codigo).toContain('Duplicar');
    expect(codigo).toMatch(/\/pedidos\/novo\?copiaDe=/);
  });

  it('🔴 só a tela de novo negócio monta a cópia', { timeout: 20_000 }, () => {
    const podem = new Set(['lib/copia-de-negocio.ts', 'pages/NovoPedido.tsx']);
    const infratores = arquivosDeCodigo(RAIZ)
      .filter((c) => /montarCopiaDeNegocio\s*\(/.test(readFileSync(c, 'utf8')))
      .map(relativo)
      .filter((r) => !podem.has(r));
    expect(infratores).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/duplicar-negocio-por-um-caminho-so.test.ts`
Expected: FAIL no primeiro teste — o painel não tem botão Duplicar.

- [ ] **Step 3: O botão.** Em `src/components/pedidos/PainelDoNegocio.tsx`, no `RodapeDoPainel`, troque:

```tsx
                <Button disabled={!negocio} onClick={() => navigate(`/pedidos/${pedidoId}/editar`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
```
por:
```tsx
                <Button disabled={!negocio} onClick={() => navigate(`/pedidos/${pedidoId}/editar`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
                {/* Duplicar é CRIAR: abre a tela de negócio novo preenchida com a cópia, e nada
                    é gravado até a pessoa confirmar lá. Por isso é uma navegação, e não um
                    diálogo por cima deste painel — dois modais do Radix empilhados brigam pelo
                    foco, e este projeto desligou Esc e clique-fora (CLAUDE.md §7.11). */}
                <Button variant="outline" disabled={!negocio} onClick={() => navigate(`/pedidos/novo?copiaDe=${pedidoId}`)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicar
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
```

E acrescente `Copy` ao import de `lucide-react` do arquivo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/duplicar-negocio-por-um-caminho-so.test.ts` e `npm run test`
Expected: PASS; nenhum teste que passava antes passou a falhar.

- [ ] **Step 5: Tipos e lint** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "PainelDoNegocio.tsx"` e `npx eslint src/components/pedidos/PainelDoNegocio.tsx src/test/duplicar-negocio-por-um-caminho-so.test.ts`. Expected: nada subiu.

- [ ] **Step 6: Commit** — `git status --short` separado, depois:
```bash
git commit -F <arquivo-da-mensagem> --only -- src/test/duplicar-negocio-por-um-caminho-so.test.ts src/components/pedidos/PainelDoNegocio.tsx
```
Mensagem: `feat(negocios): botão Duplicar no painel do negócio`

---

### Task 5: Verificação e ensaio na tela

**Files:** nenhum arquivo novo. Esta tarefa só confere.

- [ ] **Step 1: Suíte, tipos, lint e build**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```
Expected: testes passando com os novos somados; tipos e lint **por arquivo** sem subir; build compila.

- [ ] **Step 2: Ensaio na tela** — `npm run dev`, porta 8080. 🔴 **O servidor aponta para o banco de produção: o ensaio para ANTES de clicar em Criar Negócio.**
  1. Abrir um negócio que tenha anexo, mais de um responsável e valor; clicar em **Duplicar**. Esperado: a tela "Duplicar Negócio" abre com o aviso "Cópia de …", com cliente, obra, fábrica, responsáveis, marcador, origem, endereço e valor preenchidos.
  2. No passo 2, conferir que o anexo aparece com o nome do arquivo e a frase "Anexo do negócio copiado", e que **Observações está vazio**.
  3. Conferir a **Fase do Negócio**: a primeira etapa do funil daquele negócio, não a etapa do original.
  4. Voltar sem criar e conferir, na tela de Negócios, que o total do cabeçalho **não mudou**.
  5. Abrir um negócio **ganho** (etapa de fechamento) e duplicar: a fase tem de abrir na primeira etapa. É o passo que prova que a venda não conta duas vezes.
  6. Duplicar um negócio **sem anexo**: o passo 2 mostra "Clique ou arraste o PDF aqui", sem anexo inventado.
  7. Tirar o anexo na cópia (lixeira) e voltar ao negócio original: o anexo do original continua lá.
  8. Console do navegador: sem erro novo.

  Escolha os negócios do ensaio com consulta de **leitura** no banco e relate na conversa só o que se viu na tela — nunca copie nome de cliente ou de obra para arquivo (CLAUDE.md §6.9).

- [ ] **Step 3: Relatório** — para o Lucas, em linguagem de tela: o que cada ensaio mostrou, com captura dos passos 1, 3 e 5; o total de testes; e a contagem por arquivo de tipos e lint contra a linha de base. **Não publique** — publicar é decisão do Lucas.

---

## Fora deste plano — anotado para o Lucas decidir

| O quê | Por quê |
|---|---|
| Duplicar vários negócios de uma vez | Ninguém pediu, e o gesto é caro de desfazer |
| Registrar de onde a cópia veio | Decisão 9 do desenho: o espaço de comentários é da equipe |
| Copiar tarefas ou histórico do original | São o que aconteceu com o original |
| O anexo virar vários por negócio | É o pacote 5, e a cópia já leva "as referências", não os arquivos |
