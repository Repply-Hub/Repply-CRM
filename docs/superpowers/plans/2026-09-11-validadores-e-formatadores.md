# Validadores e formatadores — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma consulta de CNPJ só, que diz o que aconteceu de verdade; um campo de CNPJ só (com CPF nos cadastros de cliente), que bloqueia fábrica inexistente e só avisa em cliente; e um campo de telefone que desenha um campo por número.

**Architecture:** Toda conversa com o BrasilAPI passa por `consultarCnpj` (`src/lib/cnpj.ts`), que devolve um de quatro casos. As regras puras — classificar o documento, decidir se pode salvar, a frase de cada caso — ficam no mesmo arquivo e são testadas sem tela. O `<CampoCnpj>` é o único componente que chama a consulta. Ele ganha `aceitaCpf`, `seNaoExistir` e `valorJaGravado`, e expõe `conferir()` pela `ref` para o formulário da fábrica esperar a consulta antes de salvar. Os telefones ganham funções puras em `src/lib/telefones-do-campo.ts` e o componente `<CampoTelefones>`, que recebe e devolve o texto do banco (lista separada por vírgula).

**Tech Stack:** React 18 + TypeScript (frouxo) + Vite, shadcn/Radix, Vitest + Testing Library (jsdom, **sem** `user-event` — use `fireEvent`), sonner.

**Desenho aprovado:** `docs/superpowers/specs/2026-09-11-validadores-e-formatadores-design.md`. Leia antes da primeira tarefa.

## Global Constraints

- Tudo em **PT-BR**: tela, comentário, nome de teste, mensagem de commit.
- 🔴 **Dado real não entra em teste nem comentário** (CLAUDE.md §6.9). Use só estes números inventados:
  - CNPJ válido: `11222333000181` (`11.222.333/0001-81`).
  - CNPJ válido que a Receita **não tem** (medido em 11/09/2026): `98765432000198`.
  - CNPJ com dígito errado: `11222333000182`.
  - CPF válido: `52998224725` e `11144477735`. CPF com dígito errado: `52998224724`.
  - Telefones: `84 9999x-xxxx`, `84 3222-1111`. Nome: "Empresa Exemplo Ltda".
- As frases da tela são as da §4.1 do desenho, **copiadas letra por letra**. Estão todas em `mensagemDoDocumento` (Tarefa 2), e as telas nunca escrevem a sua própria.
- Formato de telefone: `(84) 99999-8888` e `(84) 3222-1111`, **sem `+55`**. **Nunca** enfiar o nono dígito em número de 10 dígitos (CLAUDE.md §7.1).
- Telefone **não é reformatado a cada tecla** (CLAUDE.md §7.10, e o comentário de `ContatosDaFabrica.tsx`): o campo só **barra o 12º dígito** enquanto se digita, e **formata ao sair**.
- Os telefones já gravados **não são reescritos**. Abrir e fechar um cadastro não muda nada no banco; só o que a pessoa edita ganha formato.
- Erro de gravação na tela: `mensagemDeErro` (`src/lib/mensagem-de-erro.ts`), nunca `e.message` cru.
- Modal: `<ConteudoDialogo>` / `<CabecalhoDialogo>` / `<CorpoDialogo>` / `<RodapeDialogo>` de `@/components/shared/DialogoResponsivo`, nunca `<DialogContent>` cru (CLAUDE.md §7.11).
- Tipos: `npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`** (sem ele o comando não confere nada).
- 🔴 **Critério de tipos e lint é por arquivo**, porque outra sessão mexe no total global. Antes da Tarefa 1, guarde a contagem de cada arquivo que o plano toca:
  ```bash
  npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "src/pages/Fabricantes.tsx"
  npx eslint src/pages/Fabricantes.tsx
  ```
  Ao fim de cada tarefa, **nenhum arquivo tocado pode ter mais erros do que tinha**.
- Git — outra sessão trabalha **na mesma pasta**:
  - Rode `git status --short` num comando **separado**, antes de cada commit.
  - Commite só os seus arquivos: `git commit -F <arquivo-da-mensagem> --only -- <caminhos>`. O arquivo da mensagem fica fora do repositório.
  - **Nunca** `git add -A`.
  - **Nunca** `git push`: publicar é decisão do Lucas, depois do plano inteiro.
  - Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **Nenhuma gravação no banco de produção.** O servidor de desenvolvimento aponta para produção: o ensaio na tela (Tarefa 11) **para antes de salvar**.
- Não mexa em arquivo fora da lista da tarefa. Achou outro problema? Anote no relatório; não conserte.

## Decisões técnicas deste plano (tomadas ao escrever, com o porquê)

1. **Documento novo é gravado só com dígitos.**
   - É o formato da maioria da base: em clientes, 1.628 só com dígitos contra 59 com máscara.
   - As 11 fábricas estão com máscara. Para a lista não ficar com dois formatos, **a exibição** passa por `formatarDocumento`.
   - A busca por CNPJ nos seletores compara **dígito com dígito**. Hoje a busca da fábrica por dígitos nunca casa, porque todas estão com máscara.
2. **Documento gravado que ninguém mexeu não é reconferido** (`valorJaGravado`).
   - Medido em 11/09/2026: **325 clientes** têm documento com 5, 9, 10, 12 ou 13 dígitos. 242 têm 13, com cara de zero à esquerda comido pelo Excel.
   - Conferir sempre travaria a edição desses cadastros, até para trocar um telefone.
3. **HTTP 404 só é "não existe" se o corpo for o do BrasilAPI** (`"type":"not_found"`). Um 404 de outra origem (página de erro, rota mudada) é `servico_falhou`, porque só a Receita **confirmando** pode bloquear uma fábrica.
4. **Fábrica espera a consulta antes de salvar; cliente não.**
   - A fábrica chama `conferir()` pela `ref`.
   - O cliente nunca é bloqueado pela Receita, então a tela dele só usa a classificação local (`classificarDocumento`), que é instantânea. Esperar a Receita no botão "Próximo" seria atraso sem motivo.
5. **Apagar o CNPJ na edição grava vazio de verdade** (`null`).
   - Hoje as telas mandam `cnpj || undefined`, e `undefined` some do pedido: o banco mantinha o CNPJ antigo.
   - Sem isto, "cadastrar sem CNPJ" numa fábrica que já existe não apagaria nada.
6. **Colar ou digitar vírgula abre um campo por número.** É o caminho de quem cola "84 99999-8888, 84 3222-1111" de uma planilha.

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/cnpj.ts` (mexe) | `consultarCnpj`, CPF, `classificarDocumento`, `resultadoPermiteSalvar`, `mensagemDoDocumento`, `formatarDocumento`. Perde `fetchCnpjData` na Tarefa 6 |
| `src/lib/cnpj.test.ts` (mexe) | testes das funções acima, somados aos de `telefoneDaReceita` que já existem |
| `src/components/shared/CampoCnpj.tsx` (mexe) | o campo único de documento |
| `src/components/shared/CampoCnpj.test.tsx` (cria) | comportamento do campo e do `conferir()` |
| `src/test/uma-consulta-de-cnpj-so.test.ts` (cria) | varredura estrutural: impede a quarta consulta e prende a regra de cada tela |
| `src/pages/Fabricantes.tsx`, `src/components/pedidos/FabricanteSelector.tsx` (mexe) | fábricas: bloquear |
| `src/pages/Clientes.tsx`, `src/pages/ClienteDetalhe.tsx`, `src/components/shared/EmpresaSelector.tsx` (mexe) | clientes: CPF ou CNPJ, avisar |
| `src/lib/telefones-do-campo.ts` + `.test.ts` (cria) | separar, juntar, barrar o 12º dígito, formatar ao sair |
| `src/components/shared/CampoTelefones.tsx` + `.test.tsx` (cria) | um campo por número |
| `src/test/telefone-de-cadastro-usa-campo-telefones.test.ts` (cria) | varredura: os 13 campos de telefone usam o componente |
| 10 telas de cadastro de telefone (mexe) | troca do `<Input>` pelo `<CampoTelefones>` (Tarefas 9 e 10) |

---

### Task 1: `consultarCnpj` — a consulta que diz o que aconteceu

**Files:**
- Modify: `src/lib/cnpj.ts` (acrescentar abaixo de `fetchCnpjData`; **não apague** `fetchCnpjData` ainda — três telas o usam até as Tarefas 3 a 5)
- Test: `src/lib/cnpj.test.ts` (acrescentar no fim)

**Interfaces:**
- Produces:
  ```ts
  export const PRAZO_DA_CONSULTA_MS = 10_000;
  export type CasoDaConsulta = 'encontrado' | 'nao_existe' | 'servico_falhou' | 'demorou';
  export type ResultadoDaConsulta =
    | { caso: 'encontrado'; dados: CnpjData }
    | { caso: Exclude<CasoDaConsulta, 'encontrado'> };
  export function consultarCnpj(cnpj: string, prazoMs?: number): Promise<ResultadoDaConsulta>;
  ```

- [ ] **Step 1: Write the failing test** — acrescente ao fim de `src/lib/cnpj.test.ts`. Junte `beforeEach`, `afterEach` e `vi` ao import do `vitest` que já existe no topo, e `consultarCnpj` ao import de `./cnpj`:

```ts
function respostaDoServico(status: number, corpo: unknown, corpoQuebrado = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (corpoQuebrado) throw new SyntaxError('Unexpected token <');
      return corpo;
    },
  } as unknown as Response;
}

describe('consultarCnpj — o que a Receita respondeu', () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    fetchFalso.mockReset();
    vi.stubGlobal('fetch', fetchFalso);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 é encontrado, com os dados — e a consulta vai só com os dígitos', async () => {
    fetchFalso.mockResolvedValue(respostaDoServico(200, { razao_social: 'Empresa Exemplo Ltda' }));
    const r = await consultarCnpj('11.222.333/0001-81');
    expect(r.caso).toBe('encontrado');
    expect(r.caso === 'encontrado' && r.dados.razao_social).toBe('Empresa Exemplo Ltda');
    expect(fetchFalso.mock.calls[0][0]).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
  });

  it('404 com o corpo do BrasilAPI é nao_existe', async () => {
    fetchFalso.mockResolvedValue(
      respostaDoServico(404, { type: 'not_found', name: 'NotFoundError', message: 'CNPJ não encontrado.' }),
    );
    await expect(consultarCnpj('98765432000198')).resolves.toEqual({ caso: 'nao_existe' });
  });

  it('404 sem o corpo do BrasilAPI é servico_falhou — só a Receita confirmando bloqueia fábrica', async () => {
    fetchFalso.mockResolvedValue(respostaDoServico(404, null, true));
    await expect(consultarCnpj('98765432000198')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it.each([403, 429, 500, 502, 503])('%i é servico_falhou', async (status) => {
    fetchFalso.mockResolvedValue(respostaDoServico(status, { message: 'erro' }));
    await expect(consultarCnpj('11222333000181')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it('erro de rede é servico_falhou', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(consultarCnpj('11222333000181')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it('200 com corpo quebrado é servico_falhou', async () => {
    fetchFalso.mockResolvedValue(respostaDoServico(200, null, true));
    await expect(consultarCnpj('11222333000181')).resolves.toEqual({ caso: 'servico_falhou' });
  });

  it('passou do prazo é demorou — nunca "não existe"', async () => {
    fetchFalso.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_ok, rejeitar) => {
          init.signal!.addEventListener('abort', () =>
            rejeitar(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    await expect(consultarCnpj('11222333000181', 20)).resolves.toEqual({ caso: 'demorou' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cnpj.test.ts`
Expected: FAIL — `consultarCnpj` não é exportado (`is not a function`). Os testes de `telefoneDaReceita` continuam passando.

- [ ] **Step 3: Write minimal implementation** — em `src/lib/cnpj.ts`, logo abaixo do fechamento de `fetchCnpjData`:

```ts
/** Prazo da consulta. Passou disso, o caso é `demorou` — nunca "não existe". */
export const PRAZO_DA_CONSULTA_MS = 10_000;

export type CasoDaConsulta = 'encontrado' | 'nao_existe' | 'servico_falhou' | 'demorou';

export type ResultadoDaConsulta =
  | { caso: 'encontrado'; dados: CnpjData }
  | { caso: Exclude<CasoDaConsulta, 'encontrado'> };

/**
 * A ÚNICA porta do sistema para o BrasilAPI de CNPJ — `src/test/uma-consulta-de-cnpj-so.test.ts`
 * falha se nascer outra.
 *
 * 🔴 Devolve O QUE ACONTECEU, em quatro casos, e nunca lança. A versão anterior
 * (`fetchCnpjData`) transformava qualquer resposta que não fosse 200 em "CNPJ não encontrado":
 * recusa do Cloudflare (403), excesso de consultas (429) e servidor fora (5xx) saíam com a mesma
 * frase de empresa inexistente. Com a fábrica passando a BLOQUEAR CNPJ inexistente, essa mistura
 * barraria cadastro legítimo por culpa de um serviço de fora.
 *
 * Só é `nao_existe` o 404 com o corpo do próprio BrasilAPI (`"type":"not_found"`, medido em
 * 11/09/2026). Um 404 sem esse corpo veio de outro lugar, e conta como falha do serviço.
 */
export async function consultarCnpj(
  cnpj: string,
  prazoMs = PRAZO_DA_CONSULTA_MS,
): Promise<ResultadoDaConsulta> {
  const digitos = unmaskCnpj(cnpj);
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), prazoMs);

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, {
      signal: controle.signal,
    });
    if (res.ok) return { caso: 'encontrado', dados: (await res.json()) as CnpjData };
    if (res.status === 404) {
      const corpo = await res.json().catch(() => null);
      return corpo?.type === 'not_found' ? { caso: 'nao_existe' } : { caso: 'servico_falhou' };
    }
    return { caso: 'servico_falhou' };
  } catch {
    return controle.signal.aborted ? { caso: 'demorou' } : { caso: 'servico_falhou' };
  } finally {
    clearTimeout(relogio);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cnpj.test.ts`
Expected: PASS — todos, inclusive os 4 de `telefoneDaReceita`.

- [ ] **Step 5: Tipos e lint do arquivo** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "src/lib/cnpj"` e `npx eslint src/lib/cnpj.ts src/lib/cnpj.test.ts`. Expected: contagens iguais ou menores que a linha de base.

- [ ] **Step 6: Commit**

```bash
git status --short
```
(comando separado; confira que só os seus arquivos aparecem como seus)
```bash
git commit -F <arquivo-da-mensagem> --only -- src/lib/cnpj.ts src/lib/cnpj.test.ts
```
Mensagem: `feat(cnpj): consulta à Receita que separa não existe, serviço fora e demora`

---

### Task 2: CPF, classificação do documento e a frase de cada caso

**Files:**
- Modify: `src/lib/cnpj.ts` (acrescentar no fim do arquivo)
- Test: `src/lib/cnpj.test.ts` (acrescentar no fim)

**Interfaces:**
- Consumes: `CasoDaConsulta` (Tarefa 1); `maskCnpj`, `unmaskCnpj`, `isValidCnpjDigits` (já existem).
- Produces:
  ```ts
  export function isValidCpfDigits(cpf: string): boolean;
  export function maskCpf(value: string): string;
  export function maskCpfOuCnpj(value: string): string;
  export function formatarDocumento(valor: string | null | undefined): string;
  export type ClasseDoDocumento = 'vazio' | 'inalterado' | 'incompleto' | 'invalido' | 'cpf' | 'cnpj';
  export type ResultadoDoDocumento = Exclude<ClasseDoDocumento, 'cnpj'> | CasoDaConsulta;
  export type SeNaoExistir = 'bloquear' | 'avisar';
  export function classificarDocumento(
    valor: string | null | undefined,
    opcoes?: { aceitaCpf?: boolean; valorJaGravado?: string | null },
  ): ClasseDoDocumento;
  export function resultadoPermiteSalvar(resultado: ResultadoDoDocumento, seNaoExistir: SeNaoExistir): boolean;
  export function mensagemDoDocumento(
    resultado: ResultadoDoDocumento,
    opcoes: { seNaoExistir: SeNaoExistir; aceitaCpf?: boolean },
  ): { tom: 'erro' | 'aviso'; texto: string } | null;
  ```

- [ ] **Step 1: Write the failing test** — acrescente ao fim de `src/lib/cnpj.test.ts`, e junte os nomes novos ao import de `./cnpj`:

```ts
describe('isValidCpfDigits', () => {
  it('aceita CPF com dígitos verificadores certos, com ou sem máscara', () => {
    expect(isValidCpfDigits('52998224725')).toBe(true);
    expect(isValidCpfDigits('529.982.247-25')).toBe(true);
    expect(isValidCpfDigits('11144477735')).toBe(true);
  });
  it('recusa dígito verificador errado', () => {
    expect(isValidCpfDigits('52998224724')).toBe(false);
  });
  it('recusa todos os dígitos iguais — passam na conta e não existem', () => {
    expect(isValidCpfDigits('11111111111')).toBe(false);
    expect(isValidCpfDigits('00000000000')).toBe(false);
  });
  it('recusa tamanho diferente de 11', () => {
    expect(isValidCpfDigits('5299822472')).toBe(false);
    expect(isValidCpfDigits('529982247250')).toBe(false);
  });
});

describe('maskCpfOuCnpj — a máscara acompanha o número de dígitos', () => {
  it('até 11 dígitos desenha CPF', () => {
    expect(maskCpfOuCnpj('52998224725')).toBe('529.982.247-25');
    expect(maskCpfOuCnpj('5299')).toBe('529.9');
  });
  it('de 12 em diante desenha CNPJ, e para no 14º', () => {
    expect(maskCpfOuCnpj('529.982.247-251')).toBe('52.998.224/7251');
    expect(maskCpfOuCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskCpfOuCnpj('112223330001819')).toBe('11.222.333/0001-81');
  });
});

describe('formatarDocumento — só para MOSTRAR', () => {
  it('14 dígitos ganha máscara de CNPJ, 11 de CPF', () => {
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
  });
  it('já mascarado continua igual', () => {
    expect(formatarDocumento('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });
  it('fora do formato volta como veio — mostrar número inventado seria pior', () => {
    expect(formatarDocumento('1122233300018')).toBe('1122233300018');
    expect(formatarDocumento('')).toBe('');
    expect(formatarDocumento(null)).toBe('');
  });
});

describe('classificarDocumento', () => {
  it('vazio é vazio', () => {
    expect(classificarDocumento('')).toBe('vazio');
    expect(classificarDocumento('   ')).toBe('vazio');
    expect(classificarDocumento(null)).toBe('vazio');
  });
  it('14 dígitos certos é cnpj, em qualquer campo', () => {
    expect(classificarDocumento('11.222.333/0001-81')).toBe('cnpj');
    expect(classificarDocumento('11222333000181', { aceitaCpf: true })).toBe('cnpj');
  });
  it('14 dígitos com verificador errado é invalido', () => {
    expect(classificarDocumento('11222333000182')).toBe('invalido');
  });
  it('11 dígitos só é CPF onde o campo aceita CPF', () => {
    expect(classificarDocumento('52998224725', { aceitaCpf: true })).toBe('cpf');
    expect(classificarDocumento('52998224725')).toBe('incompleto');
  });
  it('CPF com verificador errado é invalido', () => {
    expect(classificarDocumento('52998224724', { aceitaCpf: true })).toBe('invalido');
  });
  it('12 ou 13 dígitos não é nem CPF nem CNPJ', () => {
    expect(classificarDocumento('529982247251', { aceitaCpf: true })).toBe('incompleto');
    expect(classificarDocumento('1122233300018', { aceitaCpf: true })).toBe('incompleto');
  });
  it('documento gravado que ninguém mexeu é inalterado, mesmo fora do formato', () => {
    expect(
      classificarDocumento('11.222.333/0001-8', { aceitaCpf: true, valorJaGravado: '1122233300018' }),
    ).toBe('inalterado');
    expect(classificarDocumento('11.222.333/0001-81', { valorJaGravado: '11222333000181' })).toBe('inalterado');
  });
  it('mexeu no documento gravado, volta a conferir', () => {
    expect(
      classificarDocumento('11222333000182', { aceitaCpf: true, valorJaGravado: '1122233300018' }),
    ).toBe('invalido');
  });
});

describe('resultadoPermiteSalvar', () => {
  it('fábrica não salva com CNPJ que a Receita confirma não existir', () => {
    expect(resultadoPermiteSalvar('nao_existe', 'bloquear')).toBe(false);
  });
  it('cliente salva mesmo assim', () => {
    expect(resultadoPermiteSalvar('nao_existe', 'avisar')).toBe(true);
  });
  it.each(['servico_falhou', 'demorou'] as const)('%s nunca trava — a culpa é do serviço', (r) => {
    expect(resultadoPermiteSalvar(r, 'bloquear')).toBe(true);
    expect(resultadoPermiteSalvar(r, 'avisar')).toBe(true);
  });
  it.each(['invalido', 'incompleto'] as const)('%s trava em qualquer tela — é número digitado errado', (r) => {
    expect(resultadoPermiteSalvar(r, 'bloquear')).toBe(false);
    expect(resultadoPermiteSalvar(r, 'avisar')).toBe(false);
  });
  it.each(['vazio', 'inalterado', 'cpf', 'encontrado'] as const)('%s libera', (r) => {
    expect(resultadoPermiteSalvar(r, 'bloquear')).toBe(true);
  });
});

describe('mensagemDoDocumento — as frases da §4.1 do desenho', () => {
  it('fábrica: não existe é erro, com a saída de cadastrar sem CNPJ', () => {
    expect(mensagemDoDocumento('nao_existe', { seNaoExistir: 'bloquear' })).toEqual({
      tom: 'erro',
      texto: 'A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ.',
    });
  });
  it('cliente: não existe é aviso', () => {
    expect(mensagemDoDocumento('nao_existe', { seNaoExistir: 'avisar' })).toEqual({
      tom: 'aviso',
      texto:
        'A Receita ainda não tem este CNPJ. Empresa aberta há pouco tempo pode levar semanas para aparecer — o cadastro segue com o número.',
    });
  });
  it('serviço fora e demora são aviso nas duas regras', () => {
    expect(mensagemDoDocumento('servico_falhou', { seNaoExistir: 'bloquear' })).toEqual({
      tom: 'aviso',
      texto: 'Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência.',
    });
    expect(mensagemDoDocumento('demorou', { seNaoExistir: 'avisar' })).toEqual({
      tom: 'aviso',
      texto: 'A consulta à Receita demorou demais. O cadastro segue com o CNPJ, sem a conferência.',
    });
  });
  it('campo que aceita CPF explica os dois tamanhos', () => {
    expect(mensagemDoDocumento('incompleto', { seNaoExistir: 'avisar', aceitaCpf: true })?.texto).toBe(
      'CPF tem 11 dígitos e CNPJ tem 14.',
    );
    expect(mensagemDoDocumento('incompleto', { seNaoExistir: 'bloquear' })?.texto).toBe('O CNPJ tem 14 dígitos.');
  });
  it.each(['encontrado', 'cpf', 'vazio', 'inalterado'] as const)('%s: nada a dizer', (r) => {
    expect(mensagemDoDocumento(r, { seNaoExistir: 'avisar' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cnpj.test.ts`
Expected: FAIL — `isValidCpfDigits` (e os demais) não são exportados.

- [ ] **Step 3: Write minimal implementation** — no fim de `src/lib/cnpj.ts`:

```ts
// ─── CPF e o campo que aceita os dois ──────────────────────────────────

/**
 * Dígito verificador do CPF. Todos os dígitos iguais (`111.111.111-11`) PASSAM na conta e não
 * existem — por isso a recusa por regra, igual à do CNPJ.
 */
export function isValidCpfDigits(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += parseInt(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === parseInt(d[9]) && digito(10) === parseInt(d[10]);
}

// Máscara: 000.000.000-00
export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Máscara do campo que aceita os dois: até 11 dígitos desenha CPF; de 12 em diante, CNPJ. */
export function maskCpfOuCnpj(value: string): string {
  const digitos = value.replace(/\D/g, '');
  return digitos.length <= 11 ? maskCpf(digitos) : maskCnpj(digitos);
}

/**
 * Para MOSTRAR um documento gravado. O banco tem os dois formatos (só dígitos e com máscara), e
 * o que está fora do formato volta como veio: inventar máscara em número incompleto mostraria um
 * documento que não existe.
 */
export function formatarDocumento(valor: string | null | undefined): string {
  const bruto = (valor ?? '').trim();
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length === 14) return maskCnpj(digitos);
  if (digitos.length === 11) return maskCpf(digitos);
  return bruto;
}

export type ClasseDoDocumento = 'vazio' | 'inalterado' | 'incompleto' | 'invalido' | 'cpf' | 'cnpj';
/** O que o campo sabe depois de conferir: `cnpj` vira um dos casos da consulta à Receita. */
export type ResultadoDoDocumento = Exclude<ClasseDoDocumento, 'cnpj'> | CasoDaConsulta;
export type SeNaoExistir = 'bloquear' | 'avisar';

/**
 * O que o número digitado é, sem consultar ninguém.
 *
 * 🔴 CPF ou CNPJ é decidido pelo NÚMERO DE DÍGITOS, nunca pelo tipo do cliente (decisão do dono do
 * produto, 11/09/2026). É o que faz o campo valer para os tipos que as empresas ainda vão criar.
 *
 * `valorJaGravado`: enquanto o campo tiver o mesmo número do banco, ele é `inalterado` e não se
 * confere nada. Medido em 11/09/2026: 325 clientes têm documento com 5, 9, 10, 12 ou 13 dígitos;
 * conferir sempre travaria a edição deles até para trocar o telefone.
 */
export function classificarDocumento(
  valor: string | null | undefined,
  opcoes: { aceitaCpf?: boolean; valorJaGravado?: string | null } = {},
): ClasseDoDocumento {
  const digitos = unmaskCnpj(valor ?? '');
  if (!digitos) return 'vazio';
  if (opcoes.valorJaGravado && digitos === unmaskCnpj(opcoes.valorJaGravado)) return 'inalterado';
  if (digitos.length === 14) return isValidCnpjDigits(digitos) ? 'cnpj' : 'invalido';
  if (opcoes.aceitaCpf && digitos.length === 11) return isValidCpfDigits(digitos) ? 'cpf' : 'invalido';
  return 'incompleto';
}

/**
 * Pode salvar? Número digitado errado trava em qualquer tela. A Receita dizendo que não existe só
 * trava fábrica. Serviço fora ou lento NUNCA trava — seria barrar cadastro legítimo por culpa de
 * um serviço de fora. Campo vazio libera: a obrigatoriedade é regra de cada formulário.
 */
export function resultadoPermiteSalvar(resultado: ResultadoDoDocumento, seNaoExistir: SeNaoExistir): boolean {
  if (resultado === 'invalido' || resultado === 'incompleto') return false;
  if (resultado === 'nao_existe') return seNaoExistir === 'avisar';
  return true;
}

/** A frase de cada caso — as da §4.1 do desenho de 11/09/2026. Tela nenhuma escreve a sua. */
export function mensagemDoDocumento(
  resultado: ResultadoDoDocumento,
  opcoes: { seNaoExistir: SeNaoExistir; aceitaCpf?: boolean },
): { tom: 'erro' | 'aviso'; texto: string } | null {
  switch (resultado) {
    case 'invalido':
      return {
        tom: 'erro',
        texto: opcoes.aceitaCpf ? 'CPF ou CNPJ inválido — confira os dígitos.' : 'CNPJ inválido — confira os dígitos.',
      };
    case 'incompleto':
      return { tom: 'erro', texto: opcoes.aceitaCpf ? 'CPF tem 11 dígitos e CNPJ tem 14.' : 'O CNPJ tem 14 dígitos.' };
    case 'nao_existe':
      return opcoes.seNaoExistir === 'bloquear'
        ? { tom: 'erro', texto: 'A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ.' }
        : {
            tom: 'aviso',
            texto:
              'A Receita ainda não tem este CNPJ. Empresa aberta há pouco tempo pode levar semanas para aparecer — o cadastro segue com o número.',
          };
    case 'servico_falhou':
      return { tom: 'aviso', texto: 'Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência.' };
    case 'demorou':
      return { tom: 'aviso', texto: 'A consulta à Receita demorou demais. O cadastro segue com o CNPJ, sem a conferência.' };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cnpj.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos e lint** — os mesmos dois comandos da Tarefa 1. Expected: nada subiu.

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/lib/cnpj.ts src/lib/cnpj.test.ts`.
Mensagem: `feat(cnpj): validador de CPF e a regra de cada documento, com as frases da tela`

---

### Task 3: `<CampoCnpj>` vira o campo único

**Files:**
- Modify: `src/components/shared/CampoCnpj.tsx` (reescrita inteira — conteúdo abaixo)
- Create: `src/components/shared/CampoCnpj.test.tsx`

**Interfaces:**
- Consumes: `consultarCnpj`, `classificarDocumento`, `mensagemDoDocumento`, `maskCnpj`, `maskCpfOuCnpj`, `unmaskCnpj`, os tipos `CnpjData`, `ResultadoDoDocumento`, `SeNaoExistir` (Tarefas 1 e 2).
- Produces:
  ```ts
  export interface CampoCnpjProps {
    value: string;                     // COM máscara; tirar a máscara é na hora de salvar
    onChange: (comMascara: string) => void;
    onDadosEncontrados?: (dados: CnpjData) => void;
    onResultado?: (resultado: ResultadoDoDocumento) => void;
    aceitaCpf?: boolean;               // padrão false
    seNaoExistir?: SeNaoExistir;       // padrão 'avisar'
    valorJaGravado?: string | null;
    label?: string;                    // padrão 'CPF ou CNPJ' com aceitaCpf, senão 'CNPJ'
    obrigatorio?: boolean; erro?: string; descricao?: string;
    disabled?: boolean; autoFocus?: boolean; id?: string;
  }
  export interface CampoCnpjHandle { conferir: () => Promise<ResultadoDoDocumento> }
  export const CampoCnpj: React.ForwardRefExoticComponent<CampoCnpjProps & React.RefAttributes<CampoCnpjHandle>>;
  ```
- As 5 chamadas que já existem (Obras ×2, `EditarPedido`, `NovoNegocioDialog`, a nova obra da `ClienteDetalhe`) **não mudam uma linha**: tudo que é novo é opcional, e o padrão `seNaoExistir='avisar'` é a regra de Obras da §4.2.

- [ ] **Step 1: Write the failing test** — crie `src/components/shared/CampoCnpj.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CnpjData, ResultadoDaConsulta, SeNaoExistir } from '@/lib/cnpj';

const { consultarCnpjFalso } = vi.hoisted(() => ({
  consultarCnpjFalso: vi.fn<(cnpj: string) => Promise<ResultadoDaConsulta>>(),
}));

// Só a consulta é falsa: a classificação, a máscara e as frases são as de verdade.
vi.mock('@/lib/cnpj', async (original) => ({
  ...(await original<typeof import('@/lib/cnpj')>()),
  consultarCnpj: (cnpj: string) => consultarCnpjFalso(cnpj),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { CampoCnpj, type CampoCnpjHandle } from './CampoCnpj';
import { resultadoPermiteSalvar } from '@/lib/cnpj';

/** Um formulário mínimo com a mesma regra das telas: confere ao salvar e respeita a resposta. */
function Formulario({
  seNaoExistir = 'avisar',
  aceitaCpf = false,
  valorJaGravado,
  inicial = '',
  onSalvar = vi.fn(),
  onDados,
}: {
  seNaoExistir?: SeNaoExistir;
  aceitaCpf?: boolean;
  valorJaGravado?: string;
  inicial?: string;
  onSalvar?: (valor: string) => void;
  onDados?: (d: CnpjData) => void;
}) {
  const [valor, setValor] = useState(inicial);
  const ref = useRef<CampoCnpjHandle>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await ref.current!.conferir();
        if (resultadoPermiteSalvar(r, seNaoExistir)) onSalvar(valor);
      }}
    >
      <CampoCnpj
        ref={ref}
        id="documento"
        value={valor}
        onChange={setValor}
        seNaoExistir={seNaoExistir}
        aceitaCpf={aceitaCpf}
        valorJaGravado={valorJaGravado}
        onDadosEncontrados={onDados}
      />
      <button type="submit">Salvar</button>
    </form>
  );
}

const campo = () => screen.getByRole('textbox');
const digitar = (texto: string) => {
  fireEvent.change(campo(), { target: { value: texto } });
  return campo();
};
const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

describe('CampoCnpj', () => {
  beforeEach(() => consultarCnpjFalso.mockReset());

  it('🔴 fábrica: CNPJ que a Receita diz não existir não salva, e oferece cadastrar sem CNPJ', async () => {
    consultarCnpjFalso.mockResolvedValue({ caso: 'nao_existe' });
    const onSalvar = vi.fn();
    render(<Formulario seNaoExistir="bloquear" onSalvar={onSalvar} />);
    digitar('98765432000198');
    salvar();
    expect(
      await screen.findByText('A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar sem CNPJ' }));
    expect(campo()).toHaveValue('');
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(''));
  });

  it('fábrica: serviço fora do ar não trava — salva e avisa', async () => {
    consultarCnpjFalso.mockResolvedValue({ caso: 'servico_falhou' });
    const onSalvar = vi.fn();
    render(<Formulario seNaoExistir="bloquear" onSalvar={onSalvar} />);
    digitar('11222333000181');
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith('11.222.333/0001-81'));
    expect(
      screen.getByText('Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência.'),
    ).toBeInTheDocument();
  });

  it('cliente: CNPJ que a Receita não tem avisa e salva', async () => {
    consultarCnpjFalso.mockResolvedValue({ caso: 'nao_existe' });
    const onSalvar = vi.fn();
    render(<Formulario onSalvar={onSalvar} />);
    digitar('98765432000198');
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(screen.getByText(/A Receita ainda não tem este CNPJ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastrar sem CNPJ' })).toBeNull();
  });

  it('sair do campo e logo depois salvar consulta a Receita UMA vez só', async () => {
    consultarCnpjFalso.mockResolvedValue({
      caso: 'encontrado',
      dados: { razao_social: 'Empresa Exemplo Ltda' } as CnpjData,
    });
    const onSalvar = vi.fn();
    const onDados = vi.fn();
    render(<Formulario onSalvar={onSalvar} onDados={onDados} />);
    fireEvent.blur(digitar('11222333000181'));
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(consultarCnpjFalso).toHaveBeenCalledTimes(1);
    expect(onDados).toHaveBeenCalledTimes(1);
    expect(onDados).toHaveBeenCalledWith(expect.objectContaining({ razao_social: 'Empresa Exemplo Ltda' }));
  });

  it('aceita CPF: a máscara acompanha os dígitos, e CPF válido não consulta ninguém', async () => {
    const onSalvar = vi.fn();
    render(<Formulario aceitaCpf onSalvar={onSalvar} />);
    expect(screen.getByText('CPF ou CNPJ')).toBeInTheDocument();
    expect(digitar('52998224725')).toHaveValue('529.982.247-25');
    fireEvent.blur(campo());
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith('529.982.247-25'));
    expect(consultarCnpjFalso).not.toHaveBeenCalled();
  });

  it('aceita CPF: 12 dígitos não é nem um nem outro, e não salva', async () => {
    const onSalvar = vi.fn();
    render(<Formulario aceitaCpf onSalvar={onSalvar} />);
    fireEvent.blur(digitar('529982247251'));
    expect(await screen.findByText('CPF tem 11 dígitos e CNPJ tem 14.')).toBeInTheDocument();
    salvar();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('documento gravado que ninguém mexeu não é conferido nem trava', async () => {
    const onSalvar = vi.fn();
    render(<Formulario aceitaCpf valorJaGravado="1122233300018" inicial="11.222.333/0001-8" onSalvar={onSalvar} />);
    fireEvent.blur(campo());
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(consultarCnpjFalso).not.toHaveBeenCalled();
    expect(screen.queryByText('CPF tem 11 dígitos e CNPJ tem 14.')).toBeNull();
  });

  it('resposta que chega depois de o campo sair da tela é descartada', async () => {
    let responder!: (r: ResultadoDaConsulta) => void;
    consultarCnpjFalso.mockReturnValue(new Promise((ok) => (responder = ok)));
    const onDados = vi.fn();
    const { unmount } = render(<Formulario onDados={onDados} />);
    fireEvent.blur(digitar('11222333000181'));
    unmount();
    responder({ caso: 'encontrado', dados: { razao_social: 'Empresa Exemplo Ltda' } as CnpjData });
    await new Promise((r) => setTimeout(r, 0));
    expect(onDados).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/CampoCnpj.test.tsx`
Expected: FAIL — o componente de hoje não aceita `ref` (`conferir` indefinido) e não conhece `aceitaCpf` nem `seNaoExistir`.

- [ ] **Step 3: Write the implementation** — substitua o conteúdo inteiro de `src/components/shared/CampoCnpj.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  maskCnpj,
  maskCpfOuCnpj,
  unmaskCnpj,
  consultarCnpj,
  classificarDocumento,
  mensagemDoDocumento,
  type CnpjData,
  type ResultadoDoDocumento,
  type SeNaoExistir,
} from '@/lib/cnpj';
import { toast } from 'sonner';

export interface CampoCnpjProps {
  /** O valor COM máscara. Quem chama guarda a máscara; tirar os pontos é na hora de salvar. */
  value: string;
  onChange: (comMascara: string) => void;
  /**
   * Chamado quando a consulta acha a empresa. Cada tela decide o que fazer com os dados — o
   * componente NÃO preenche nada sozinho, porque o que preencher muda de tela para tela.
   */
  onDadosEncontrados?: (dados: CnpjData) => void;
  /** Avisado a cada conferência que termina (ao sair do campo ou pelo `conferir`). */
  onResultado?: (resultado: ResultadoDoDocumento) => void;
  /** Modo "CPF ou CNPJ" dos cadastros de cliente: decide pelos dígitos, nunca pelo tipo. */
  aceitaCpf?: boolean;
  /** Quando a Receita CONFIRMA que o CNPJ não existe: fábrica bloqueia, o resto avisa. */
  seNaoExistir?: SeNaoExistir;
  /** O documento como está no banco. Enquanto o campo tiver o mesmo número, nada é conferido. */
  valorJaGravado?: string | null;
  label?: string;
  obrigatorio?: boolean;
  /** Mensagem de erro vinda da validação do formulário; tem prioridade sobre a do campo. */
  erro?: string;
  /** Frase de ajuda abaixo do campo, quando não há nada a avisar. */
  descricao?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export interface CampoCnpjHandle {
  /**
   * Confere o valor atual e devolve o resultado. Reaproveita a conferência do mesmo número — e,
   * se a consulta daquele número ainda está rodando (a pessoa saiu do campo e clicou em Salvar),
   * espera por ELA em vez de disparar outra.
   */
  conferir: () => Promise<ResultadoDoDocumento>;
}

/**
 * O campo de documento do sistema: máscara, dígito verificador e consulta à Receita.
 *
 * 🔴 É O ÚNICO LUGAR QUE CHAMA `consultarCnpj` (`src/test/uma-consulta-de-cnpj-so.test.ts`).
 * Até 11/09/2026 havia três consultas independentes — esta, a de Clientes e a de Fabricantes —,
 * cada uma com a sua frase fixa de "não encontrado". É o cenário do conserto no arquivo errado
 * (CLAUDE.md §7.14): consertar uma não consertava as outras.
 *
 * A regra de cada tela entra por propriedade, nunca por cópia:
 * - `aceitaCpf` — cadastros de cliente. 11 dígitos é CPF (só dígito verificador: CPF não tem
 *   consulta pública), 14 é CNPJ (dígito e Receita).
 * - `seNaoExistir` — fábrica bloqueia CNPJ que a Receita confirma não existir; cliente e obra
 *   avisam e seguem. Serviço fora ou lento nunca bloqueia ninguém.
 * - `valorJaGravado` — cadastro antigo não trava por causa de documento que ninguém mexeu.
 *
 * A consulta dispara ao SAIR do campo, não a cada tecla: menos consultas repetidas ao BrasilAPI,
 * que não tem chave e recusa quem pergunta demais.
 *
 * Duas guardas contra resposta atrasada (o prazo é de 10 s): se o campo saiu da tela, o resultado
 * é descartado; se a pessoa mudou o número enquanto a Receita respondia, o resultado do número
 * velho não é mostrado nem preenche nada.
 */
export const CampoCnpj = forwardRef<CampoCnpjHandle, CampoCnpjProps>(function CampoCnpj(
  {
    value,
    onChange,
    onDadosEncontrados,
    onResultado,
    aceitaCpf = false,
    seNaoExistir = 'avisar',
    valorJaGravado,
    label,
    obrigatorio = false,
    erro,
    descricao,
    disabled,
    autoFocus,
    id,
  },
  ref,
) {
  const [resultado, setResultado] = useState<ResultadoDoDocumento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const montadoRef = useRef(true);
  // Refs com o valor e os retornos MAIS RECENTES: a consulta termina renders depois de começar.
  const valorRef = useRef(value);
  valorRef.current = value;
  const onDadosRef = useRef(onDadosEncontrados);
  onDadosRef.current = onDadosEncontrados;
  const onResultadoRef = useRef(onResultado);
  onResultadoRef.current = onResultado;
  const ultimaRef = useRef<{ digitos: string; resultado: ResultadoDoDocumento } | null>(null);
  const emAndamentoRef = useRef<{ digitos: string; promessa: Promise<ResultadoDoDocumento> } | null>(null);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  /** Mostra o resultado, se o campo ainda está na tela e ainda tem o mesmo número. */
  function mostrar(digitos: string, final: ResultadoDoDocumento): boolean {
    if (!montadoRef.current) return false;
    if (unmaskCnpj(valorRef.current) !== digitos) return false;
    setResultado(final);
    onResultadoRef.current?.(final);
    return true;
  }

  async function executar(digitos: string): Promise<ResultadoDoDocumento> {
    const classe = classificarDocumento(digitos, { aceitaCpf, valorJaGravado });
    let final: ResultadoDoDocumento;
    let dados: CnpjData | null = null;
    if (classe === 'cnpj') {
      if (montadoRef.current) setCarregando(true);
      const consulta = await consultarCnpj(digitos);
      final = consulta.caso;
      if (consulta.caso === 'encontrado') dados = consulta.dados;
      if (montadoRef.current) setCarregando(false);
    } else {
      final = classe;
    }
    ultimaRef.current = { digitos, resultado: final };
    if (mostrar(digitos, final) && dados) {
      onDadosRef.current?.(dados);
      toast.success('CNPJ encontrado na Receita Federal');
    }
    return final;
  }

  function conferir(): Promise<ResultadoDoDocumento> {
    const digitos = unmaskCnpj(valorRef.current);
    const ultima = ultimaRef.current;
    if (ultima && ultima.digitos === digitos) {
      mostrar(digitos, ultima.resultado);
      return Promise.resolve(ultima.resultado);
    }
    const andamento = emAndamentoRef.current;
    if (andamento && andamento.digitos === digitos) return andamento.promessa;
    const promessa = executar(digitos);
    emAndamentoRef.current = { digitos, promessa };
    return promessa;
  }

  useImperativeHandle(ref, () => ({ conferir }));

  const mensagem = resultado ? mensagemDoDocumento(resultado, { seNaoExistir, aceitaCpf }) : null;
  const bloqueado = resultado === 'nao_existe' && seNaoExistir === 'bloquear';
  const conferido = resultado === 'encontrado' || resultado === 'cpf';
  const borda =
    erro || mensagem?.tom === 'erro'
      ? 'border-destructive'
      : mensagem?.tom === 'aviso'
        ? 'border-amber-500'
        : conferido
          ? 'border-green-500'
          : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label ?? (aceitaCpf ? 'CPF ou CNPJ' : 'CNPJ')}
        {obrigatorio && ' *'}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          inputMode="numeric"
          placeholder={aceitaCpf ? '000.000.000-00 ou 00.000.000/0000-00' : '00.000.000/0000-00'}
          onChange={(e) => {
            onChange(aceitaCpf ? maskCpfOuCnpj(e.target.value) : maskCnpj(e.target.value));
            setResultado(null);
          }}
          onBlur={() => {
            void conferir();
          }}
          className={borda}
        />
        {carregando && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!carregando && conferido && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
      </div>
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : mensagem ? (
        <div className="space-y-1">
          <p
            role={mensagem.tom === 'erro' ? 'alert' : 'status'}
            className={mensagem.tom === 'erro' ? 'text-xs text-destructive' : 'text-xs text-amber-600 dark:text-amber-400'}
          >
            {mensagem.texto}
          </p>
          {bloqueado && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => {
                onChange('');
                setResultado(null);
              }}
            >
              Cadastrar sem CNPJ
            </Button>
          )}
        </div>
      ) : descricao ? (
        <p className="text-xs text-muted-foreground">{descricao}</p>
      ) : null}
    </div>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/CampoCnpj.test.tsx`
Expected: PASS — 8 testes.

- [ ] **Step 5: As telas de Obras continuam compilando e passando**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "CampoCnpj|Obras.tsx|EditarPedido.tsx|NovoNegocioDialog.tsx|ClienteDetalhe.tsx" | wc -l` e `npx eslint src/components/shared/CampoCnpj.tsx src/components/shared/CampoCnpj.test.tsx`
Expected: contagens iguais ou menores que a linha de base. Depois rode a suíte inteira, `npm run test`: nenhum teste novo falhando.

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/components/shared/CampoCnpj.tsx src/components/shared/CampoCnpj.test.tsx`.
Mensagem: `feat(cnpj): campo único de documento — CPF, regra de bloquear ou avisar e conferência ao salvar`

---

### Task 4: As duas portas de criar fábrica — bloquear

**Files:**
- Create: `src/test/uma-consulta-de-cnpj-so.test.ts`
- Modify: `src/pages/Fabricantes.tsx` (componente `FabricanteForm` e a lista)
- Modify: `src/components/pedidos/FabricanteSelector.tsx`

**Interfaces:**
- Consumes: `CampoCnpj`, `CampoCnpjHandle` (Tarefa 3); `unmaskCnpj`, `formatarDocumento`, `resultadoPermiteSalvar`, `telefoneDaReceita`, `CnpjData` (`src/lib/cnpj.ts`); `mensagemDeErro` (`src/lib/mensagem-de-erro.ts`, assinatura `mensagemDeErro(e: unknown, padrao?: string): string`).
- Produces: o arquivo `src/test/uma-consulta-de-cnpj-so.test.ts`, com as constantes `RAIZ`, `ler` e `usosDoCampoCnpj`. As Tarefas 5 e 6 acrescentam testes nele.

- [ ] **Step 1: Write the failing test** — crie `src/test/uma-consulta-de-cnpj-so.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Uma consulta de CNPJ só — e a regra de cada tela presa no lugar.
 *
 * 🔴 Até 11/09/2026 havia TRÊS consultas à Receita independentes (Clientes, Fabricantes e o
 * `<CampoCnpj>`), cada uma com a sua frase fixa de "não encontrado". Serviço fora do ar e empresa
 * inexistente apareciam iguais, e consertar uma não consertava as outras — o mesmo desenho do
 * conserto de datas que voltou por estar num arquivo que tela nenhuma chamava (CLAUDE.md §7.14).
 *
 * Teste de comportamento não pega isso: cada cópia passa nos próprios testes. Só a varredura do
 * código percebe a quarta nascendo, ou uma tela de fábrica perdendo a regra de bloquear.
 */

const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');
/**
 * Cada `<CampoCnpj ... />` do arquivo, com as propriedades. O `\s` depois do nome é de propósito:
 * comentário que cita "o <CampoCnpj>" não é uso, e com `\b` ele casaria até o próximo `/>`.
 */
const usosDoCampoCnpj = (codigo: string) => codigo.match(/<CampoCnpj\s[\s\S]*?\/>/g) ?? [];

describe('uma consulta de CNPJ só', () => {
  it('🔴 as duas portas de criar fábrica bloqueiam CNPJ que a Receita diz não existir', () => {
    for (const arquivo of ['pages/Fabricantes.tsx', 'components/pedidos/FabricanteSelector.tsx']) {
      const codigo = ler(arquivo);
      const usos = usosDoCampoCnpj(codigo);
      expect(usos, arquivo).toHaveLength(1);
      expect(usos[0], arquivo).toContain('seNaoExistir="bloquear"');
      // Sem a ref, o Salvar não espera a consulta: quem digita e clica direto escapa da regra.
      expect(usos[0], arquivo).toMatch(/\bref=\{/);
      expect(codigo, arquivo).toContain('.conferir()');
      expect(codigo, arquivo).not.toMatch(/fetchCnpjData\s*\(/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/uma-consulta-de-cnpj-so.test.ts`
Expected: FAIL — `pages/Fabricantes.tsx` tem 0 usos de `<CampoCnpj`.

- [ ] **Step 3: `Fabricantes.tsx` — os imports.** Troque:

```ts
import {
  maskCnpj,
  unmaskCnpj,
  isValidCnpjDigits,
  fetchCnpjData,
  telefoneDaReceita,
} from "@/lib/cnpj";
```
por:
```ts
import {
  unmaskCnpj,
  telefoneDaReceita,
  formatarDocumento,
  resultadoPermiteSalvar,
  type CnpjData,
} from "@/lib/cnpj";
import { CampoCnpj, type CampoCnpjHandle } from "@/components/shared/CampoCnpj";
```

- [ ] **Step 4: `Fabricantes.tsx` — o estado do `FabricanteForm`.** Troque:

```ts
  const [cnpj, setCnpj] = useState(editData?.cnpj ?? "");
  const [cnpjStatus, setCnpjStatus] = useState<
    "idle" | "loading" | "valid" | "invalid"
  >("idle");
```
por:
```ts
  const [cnpj, setCnpj] = useState(formatarDocumento(editData?.cnpj));
  // Enquanto o Salvar espera a Receita (até 10 s), o botão fica travado: dois cliques criariam
  // a fábrica duas vezes.
  const [conferindo, setConferindo] = useState(false);
  const campoCnpjRef = useRef<CampoCnpjHandle>(null);
```

Apague a linha `  const sessionRef = useRef(0);` (logo abaixo de `contatosPendentes`). A guarda contra resposta atrasada agora mora no `<CampoCnpj>`.

No `reset`, troque:
```ts
    sessionRef.current += 1;
    setCnpj("");
    setCnpjStatus("idle");
    setNome("");
```
por:
```ts
    setCnpj("");
    setNome("");
```

No `useEffect` que roda quando `open` muda, troque:
```ts
      sessionRef.current += 1;
      setCnpj(editData?.cnpj ?? "");
      setCnpjStatus("idle");
```
por:
```ts
      setCnpj(formatarDocumento(editData?.cnpj));
```

- [ ] **Step 5: `Fabricantes.tsx` — a consulta sai, fica o preenchimento.** Troque a função `handleCnpjBlur` inteira (de `  const handleCnpjBlur = async () => {` até o `  };` que a fecha, logo antes de `  const handleSubmit`) por:

```ts
  // A consulta à Receita mora no <CampoCnpj>, o único lugar do sistema que fala com ela
  // (src/test/uma-consulta-de-cnpj-so.test.ts). Aqui fica só o que ESTA tela faz com os dados.
  // Função de atualização, e não o valor da hora: a resposta chega até 10 s depois, e a pessoa
  // pode ter digitado o nome nesse meio-tempo.
  const preencherComDadosDaReceita = (data: CnpjData) => {
    if (data.razao_social) setNome((atual) => atual || data.razao_social);
    // A Receita manda o telefone só em dígitos, com o DDD grudado ("2121660000") — ver
    // `telefoneDaReceita` em src/lib/cnpj.ts.
    const telefoneReceita = telefoneDaReceita(data);
    if (telefoneReceita) setTelefone((atual) => atual || telefoneReceita);
  };
```

- [ ] **Step 6: `Fabricantes.tsx` — o Salvar espera a conferência.** No `handleSubmit`, troque:

```ts
    e.preventDefault();
    if (
      unmaskCnpj(cnpj).length === 14 &&
      !isValidCnpjDigits(unmaskCnpj(cnpj))
    ) {
      toast.error("CNPJ inválido");
      return;
    }
    try {
      if (editData) {
        await updateFabricante.mutateAsync({
          id: editData.id,
          nome,
          cnpj: cnpj || undefined,
```
por:
```ts
    e.preventDefault();
    // 🔴 A regra da fábrica (decisão do dono do produto, 11/09/2026): CNPJ que a Receita CONFIRMA
    // não existir não entra. Quem digita e clica em Salvar sem sair do campo não escapa — a
    // consulta roda agora e o salvamento espera por ela. Serviço fora do ar não trava.
    setConferindo(true);
    const conferencia = await campoCnpjRef.current?.conferir();
    setConferindo(false);
    if (conferencia && !resultadoPermiteSalvar(conferencia, "bloquear")) return;
    const cnpjDigitos = unmaskCnpj(cnpj);
    try {
      if (editData) {
        await updateFabricante.mutateAsync({
          id: editData.id,
          nome,
          // `null`, e não `undefined`: `undefined` some do pedido e o banco guardaria o CNPJ
          // antigo — "cadastrar sem CNPJ" numa fábrica que já existe não apagaria nada.
          cnpj: cnpjDigitos || null,
```

E, no cadastro novo logo abaixo, troque:
```ts
        const novoId = await createFabricante.mutateAsync({
          nome,
          cnpj: cnpj || undefined,
```
por:
```ts
        const novoId = await createFabricante.mutateAsync({
          nome,
          cnpj: cnpjDigitos || undefined,
```

- [ ] **Step 7: `Fabricantes.tsx` — o campo e o botão.** Troque o bloco do CNPJ no formulário — o `<div>` que começa em `            <Label>CNPJ</Label>` e termina no `</div>` que fecha o `<div className="relative">`, logo antes do `<div>` do `Nome` — ou seja, este trecho:

```tsx
          <div>
            <Label>CNPJ</Label>
            <div className="relative">
              <Input
                value={cnpj}
                onChange={(e) => {
                  setCnpj(maskCnpj(e.target.value));
                  setCnpjStatus("idle");
                }}
                onBlur={handleCnpjBlur}
                placeholder="00.000.000/0000-00"
                className={
                  cnpjStatus === "invalid"
                    ? "border-destructive"
                    : cnpjStatus === "valid"
                      ? "border-green-500"
                      : ""
                }
              />
              {cnpjStatus === "loading" && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {cnpjStatus === "valid" && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
```
por:
```tsx
          <CampoCnpj
            ref={campoCnpjRef}
            value={cnpj}
            onChange={setCnpj}
            onDadosEncontrados={preencherComDadosDaReceita}
            seNaoExistir="bloquear"
            valorJaGravado={editData?.cnpj}
          />
```

E o botão de enviar, troque:
```tsx
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
```
por:
```tsx
          <Button type="submit" className="w-full" disabled={isPending || conferindo}>
            {conferindo ? "Conferindo o CNPJ..." : isPending ? "Salvando..." : "Salvar"}
```

- [ ] **Step 8: `Fabricantes.tsx` — a lista mostra o CNPJ com máscara.** As fábricas novas passam a ser gravadas só com dígitos. Nas **duas** linhas da lista que mostram `{fab.cnpj}` (cada uma dentro de um `{fab.cnpj && (`), troque `{fab.cnpj}` por `{formatarDocumento(fab.cnpj)}`. A condição `fab.cnpj &&` fica como está.

- [ ] **Step 9: `Fabricantes.tsx` — imports que sobraram.** Rode `npx eslint src/pages/Fabricantes.tsx`. Se `Loader2` ou `CheckCircle2` aparecerem como sem uso, tire-os do import de `lucide-react`. Tire **só** o que o lint apontar.

- [ ] **Step 10: `FabricanteSelector.tsx` — imports e estado.**
  - Troque `import { useState, useMemo } from 'react';` por `import { useState, useMemo, useRef } from 'react';`.
  - Troque:
    ```ts
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogFooter,
    } from '@/components/ui/dialog';
    ```
    por:
    ```ts
    import { Dialog, DialogTitle } from '@/components/ui/dialog';
    import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
    import { CampoCnpj, type CampoCnpjHandle } from '@/components/shared/CampoCnpj';
    import { unmaskCnpj, formatarDocumento, resultadoPermiteSalvar } from '@/lib/cnpj';
    import { mensagemDeErro } from '@/lib/mensagem-de-erro';
    ```
  - Logo abaixo de `  const createFabricante = useCreateFabricanteCompleto();`, acrescente:
    ```ts
    const campoCnpjRef = useRef<CampoCnpjHandle>(null);
    const [conferindo, setConferindo] = useState(false);
    ```

- [ ] **Step 11: `FabricanteSelector.tsx` — a busca casa dígito com dígito.** Troque:

```ts
    // Sem acento e sem caixa: "acos" acha "Aços". O CNPJ casa pelos dígitos crus.
    return fabricantes.filter((f) =>
      correspondeBusca(f.nome, searchTerm) ||
      f.cnpj?.includes(searchTerm.trim())
    );
```
por:
```ts
    // Sem acento e sem caixa: "acos" acha "Aços". O CNPJ casa DÍGITO COM DÍGITO, dos dois lados:
    // as fábricas antigas guardam com máscara e as novas só com dígitos, e comparar o texto cru
    // não achava nenhuma das antigas. Só entra na conta quando a busca é um número — senão
    // "Tigre 2" traria toda fábrica com um 2 no CNPJ.
    const buscaEhNumero = /^[\d.\/\-\s]+$/.test(searchTerm.trim());
    const digitosDaBusca = searchTerm.replace(/\D/g, '');
    return fabricantes.filter((f) =>
      correspondeBusca(f.nome, searchTerm) ||
      (buscaEhNumero && digitosDaBusca.length > 0 && (f.cnpj ?? '').replace(/\D/g, '').includes(digitosDaBusca))
    );
```

- [ ] **Step 12: `FabricanteSelector.tsx` — o cadastro confere antes de gravar.** Troque a função `handleCreate` inteira por:

```ts
  const handleCreate = async () => {
    if (!newFab.nome) {
      toast.error('O nome do fabricante é obrigatório');
      return;
    }

    // Mesma regra da tela de Fabricantes: CNPJ que a Receita CONFIRMA não existir não entra, e o
    // cadastro espera a consulta de quem digitou e clicou direto. Serviço fora do ar não trava.
    setConferindo(true);
    const conferencia = await campoCnpjRef.current?.conferir();
    setConferindo(false);
    if (conferencia && !resultadoPermiteSalvar(conferencia, 'bloquear')) return;

    try {
      const result = await createFabricante.mutateAsync({
        nome: newFab.nome,
        cnpj: unmaskCnpj(newFab.cnpj) || undefined,
      });
      toast.success('Fabricante cadastrado com sucesso!');
      setDialogOpen(false);
      if (result?.id) {
        onValueChange(result.id);
      }
      setNewFab({ nome: '', cnpj: '' });
    } catch (error) {
      toast.error('Erro ao cadastrar fabricante: ' + mensagemDeErro(error));
    }
  };
```

- [ ] **Step 13: `FabricanteSelector.tsx` — a lista e o modal.** Na lista, troque:
```tsx
                        <span className="text-[10px] text-muted-foreground">{fab.cnpj}</span>
```
por:
```tsx
                        <span className="text-[10px] text-muted-foreground">{formatarDocumento(fab.cnpj)}</span>
```

E troque o modal inteiro — de `      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>` até o `      </Dialog>` que o fecha — por:

```tsx
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <ConteudoDialogo className="sm:max-w-[425px]">
          <CabecalhoDialogo>
            <DialogTitle>Cadastrar Novo Fabricante</DialogTitle>
          </CabecalhoDialogo>
          <CorpoDialogo className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fab-name">Nome do Fabricante *</Label>
              <Input
                id="fab-name"
                value={newFab.nome}
                onChange={(e) => setNewFab({ ...newFab, nome: e.target.value })}
                placeholder="Ex: Tigre, Deca"
              />
            </div>
            <CampoCnpj
              ref={campoCnpjRef}
              id="fab-cnpj"
              value={newFab.cnpj}
              onChange={(v) => setNewFab((f) => ({ ...f, cnpj: v }))}
              onDadosEncontrados={(dados) =>
                setNewFab((f) => ({ ...f, nome: f.nome || dados.razao_social || '' }))
              }
              seNaoExistir="bloquear"
            />
          </CorpoDialogo>
          <RodapeDialogo>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createFabricante.isPending || conferindo}>
              {conferindo ? 'Conferindo o CNPJ...' : createFabricante.isPending ? 'Salvando...' : 'Cadastrar e Selecionar'}
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run src/test/uma-consulta-de-cnpj-so.test.ts src/components/shared/CampoCnpj.test.tsx`
Expected: PASS. Depois `npm run test`: nenhum teste que passava antes passou a falhar.

- [ ] **Step 15: Tipos e lint dos três arquivos** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Fabricantes.tsx|FabricanteSelector.tsx" | wc -l` e `npx eslint src/pages/Fabricantes.tsx src/components/pedidos/FabricanteSelector.tsx src/test/uma-consulta-de-cnpj-so.test.ts`. Expected: nada subiu em relação à linha de base.

- [ ] **Step 16: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/test/uma-consulta-de-cnpj-so.test.ts src/pages/Fabricantes.tsx src/components/pedidos/FabricanteSelector.tsx`.
Mensagem: `feat(fabricantes): fábrica com CNPJ que a Receita não tem não é criada — serviço fora só avisa`

---

### Task 5: As três portas de cadastrar cliente — CPF ou CNPJ, e só avisar

**Files:**
- Modify: `src/test/uma-consulta-de-cnpj-so.test.ts` (acrescentar um teste)
- Modify: `src/pages/Clientes.tsx` (assistente "Nova empresa")
- Modify: `src/pages/ClienteDetalhe.tsx` (editar cliente, e o cartão que mostra o documento)
- Modify: `src/components/shared/EmpresaSelector.tsx` (atalho de empresa no Novo Negócio)

**Interfaces:**
- Consumes: `CampoCnpj` (Tarefa 3); `unmaskCnpj`, `classificarDocumento`, `resultadoPermiteSalvar`, `mensagemDoDocumento`, `formatarDocumento`, `telefoneDaReceita`, `CnpjData` (`src/lib/cnpj.ts`); `RAIZ`, `ler`, `usosDoCampoCnpj` (Tarefa 4).
- Produces: nada que outra tarefa use. Depois desta tarefa, **nenhuma tela chama `fetchCnpjData`** — é o que libera a Tarefa 6.

A regra das três telas: **cliente nunca é bloqueado pela Receita**, e a tela não espera a consulta. O que trava é número digitado errado: `invalido` ou `incompleto`, pela classificação local e instantânea.

- [ ] **Step 1: Write the failing test** — acrescente dentro do `describe` de `src/test/uma-consulta-de-cnpj-so.test.ts`:

```ts
  it('as três portas de cadastrar cliente aceitam CPF e nunca bloqueiam pela Receita', () => {
    for (const arquivo of ['pages/Clientes.tsx', 'pages/ClienteDetalhe.tsx', 'components/shared/EmpresaSelector.tsx']) {
      const codigo = ler(arquivo);
      // `ClienteDetalhe` tem um segundo <CampoCnpj>, o da SPE da obra nova — esse é só CNPJ.
      const usosComCpf = usosDoCampoCnpj(codigo).filter((u) => /\baceitaCpf\b/.test(u));
      expect(usosComCpf, arquivo).toHaveLength(1);
      expect(usosComCpf[0], arquivo).not.toContain('bloquear');
      expect(codigo, arquivo).not.toMatch(/fetchCnpjData\s*\(/);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/uma-consulta-de-cnpj-so.test.ts`
Expected: FAIL — `pages/Clientes.tsx` não tem nenhum `<CampoCnpj aceitaCpf`.

- [ ] **Step 3: `Clientes.tsx` — imports e estado.**
  - Troque `import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData, telefoneDaReceita } from '@/lib/cnpj';` por:
    ```ts
    import {
      unmaskCnpj,
      telefoneDaReceita,
      classificarDocumento,
      resultadoPermiteSalvar,
      mensagemDoDocumento,
      type CnpjData,
    } from '@/lib/cnpj';
    import { CampoCnpj } from '@/components/shared/CampoCnpj';
    ```
  - Apague a linha `  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');`.
  - No `resetForm`, troque `setTelefone(''); setEmail(''); setCnpjStatus('idle'); setNomeContato(''); setCargo('');` por `setTelefone(''); setEmail(''); setNomeContato(''); setCargo('');`.

- [ ] **Step 4: `Clientes.tsx` — a consulta sai, fica o preenchimento.** Troque as duas funções `handleCnpjChange` e `handleCnpjLookup` inteiras — de `  const handleCnpjChange = (value: string) => {` até o `  };` que fecha `handleCnpjLookup`, logo antes de `  const resetForm` — por:

```ts
  // A consulta à Receita mora no <CampoCnpj>, o único lugar do sistema que fala com ela
  // (src/test/uma-consulta-de-cnpj-so.test.ts). Esta tela tinha a sua própria cópia, que dizia
  // "CNPJ não encontrado na Receita Federal" para QUALQUER falha — inclusive serviço fora do ar.
  // Era essa frase que fazia parecer que o CNPJ só funcionava para construtora (11/09/2026).
  // Funções de atualização, e não o valor da hora: a resposta chega até 10 s depois.
  const preencherComDadosDaReceita = (data: CnpjData) => {
    if (data.razao_social) {
      setEmpresa(atual => atual || data.razao_social);
      setRazaoSocial(atual => atual || data.razao_social);
    }
    setEndereco(prev => prev.logradouro ? prev : ({
      ...prev,
      logradouro: data.logradouro || prev.logradouro,
      numero: data.numero || prev.numero,
      bairro: data.bairro || prev.bairro,
      cidade: data.municipio || prev.cidade,
      uf: data.uf || prev.uf,
      cep: data.cep || prev.cep,
    }));
    // A Receita manda o telefone só em dígitos, com o DDD grudado — ver `telefoneDaReceita`.
    const telefoneReceita = telefoneDaReceita(data);
    if (telefoneReceita) setTelefone(atual => atual || telefoneReceita);
  };
```

- [ ] **Step 5: `Clientes.tsx` — a validação do passo 1.** Em `validateEmpresaStep`, troque:

```ts
      const cnpjObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'cnpj')?.obrigatorio ?? true;
      // Se o CNPJ não for obrigatório e o campo estiver vazio, pula a validação de
      // formato; se foi preenchido (mesmo sem ser obrigatório), o formato ainda é validado.
      if (cnpjObrigatorio || cnpj.trim()) {
        if (unmaskCnpj(cnpj).length !== 14) {
          toast.error('Informe um CNPJ válido.');
          return false;
        }
        if (!isValidCnpjDigits(unmaskCnpj(cnpj))) {
          toast.error('CNPJ inválido');
          return false;
        }
      }
```
por:
```ts
      const cnpjObrigatorio = camposConfigClientes?.find(c => c.campo_key === 'cnpj')?.obrigatorio ?? true;
      // CPF ou CNPJ, decidido pelos dígitos e nunca pelo tipo (decisão de 11/09/2026): é o que faz
      // o campo valer para os tipos que as empresas ainda vão criar, e o que deixa pessoa física
      // com CPF passar. A Receita não trava cliente — só número digitado errado trava.
      const documento = classificarDocumento(cnpj, { aceitaCpf: true });
      if (documento === 'vazio') {
        if (cnpjObrigatorio) {
          toast.error('Informe o CPF ou CNPJ.');
          return false;
        }
      } else if (!resultadoPermiteSalvar(documento, 'avisar')) {
        toast.error(mensagemDoDocumento(documento, { seNaoExistir: 'avisar', aceitaCpf: true })!.texto);
        return false;
      }
```

- [ ] **Step 6: `Clientes.tsx` — grava só os dígitos.** Troque `        cnpj: cnpj || undefined,` por `        cnpj: unmaskCnpj(cnpj) || undefined,` (há uma ocorrência só, na gravação da empresa nova).

- [ ] **Step 7: `Clientes.tsx` — o campo.** Troque o bloco do CNPJ do passo 1 do assistente — o `<div>` que começa em `<Label>CNPJ{empresaObrigatorio('cnpj', true) && ' *'}</Label>` e termina no `</div>` depois da frase "Ao sair do campo, o CNPJ será validado..." —, ou seja:

```tsx
                        <div>
                          <Label>CNPJ{empresaObrigatorio('cnpj', true) && ' *'}</Label>
                          <div className="relative">
                            <Input
                              value={cnpj}
                              onChange={(e) => handleCnpjChange(e.target.value)}
                              placeholder="00.000.000/0000-00"
                              className={cnpjStatus === 'invalid' ? 'border-destructive' : cnpjStatus === 'valid' ? 'border-green-500' : ''}
                              required={empresaObrigatorio('cnpj', true)}
                            />
                            {cnpjStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                            {cnpjStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">Ao sair do campo, o CNPJ será validado e os dados preenchidos automaticamente</p>
                        </div>
```
por:
```tsx
                        <CampoCnpj
                          aceitaCpf
                          value={cnpj}
                          onChange={setCnpj}
                          onDadosEncontrados={preencherComDadosDaReceita}
                          obrigatorio={empresaObrigatorio('cnpj', true)}
                          descricao="Ao sair do campo, o CNPJ é conferido na Receita e os dados são preenchidos. CPF confere só os dígitos."
                        />
```

Depois rode `npx eslint src/pages/Clientes.tsx`. Se `Loader2` ou `CheckCircle2` aparecerem como sem uso, tire-os do import de `lucide-react` — só o que o lint apontar.

- [ ] **Step 8: `ClienteDetalhe.tsx` — imports.** Troque `import type { CnpjData } from '@/lib/cnpj';` por:

```ts
import {
  unmaskCnpj,
  formatarDocumento,
  classificarDocumento,
  resultadoPermiteSalvar,
  mensagemDoDocumento,
  type CnpjData,
} from '@/lib/cnpj';
```

- [ ] **Step 9: `ClienteDetalhe.tsx` — abrir, conferir e gravar a edição.**
  - No `openEdit`, troque `      cnpj: cliente.cnpj ?? '',` por `      cnpj: formatarDocumento(cliente.cnpj),`.
  - No `handleEditSubmit`, logo antes de `    const enderecoStr = enderecoToString(editEndereco);`, acrescente:

```ts
    // 🔴 Só confere o documento se a pessoa MEXEU nele. Medido em 11/09/2026: 325 clientes têm
    // documento com 5, 9, 10, 12 ou 13 dígitos (a maioria com cara de zero à esquerda comido pelo
    // Excel na importação). Conferir sempre travaria a edição deles até para trocar o telefone.
    const documentoMudou = editData.cnpj !== formatarDocumento(cliente.cnpj);
    if (documentoMudou) {
      const documento = classificarDocumento(editData.cnpj, { aceitaCpf: true, valorJaGravado: cliente.cnpj });
      if (!resultadoPermiteSalvar(documento, 'avisar')) {
        toast.error(mensagemDoDocumento(documento, { seNaoExistir: 'avisar', aceitaCpf: true })!.texto);
        return;
      }
    }
```

  - Na chamada de `updateCliente.mutateAsync`, troque `        cnpj: editData.cnpj || undefined,` por:

```ts
        // `undefined` = ninguém mexeu, o banco fica exatamente como estava (inclusive o formato
        // antigo). `null` = a pessoa apagou de propósito: `undefined` sumiria do pedido e o
        // documento antigo continuaria gravado.
        cnpj: documentoMudou ? (unmaskCnpj(editData.cnpj) || null) : undefined,
```

- [ ] **Step 10: `ClienteDetalhe.tsx` — o campo da edição e o cartão.** Troque:

```tsx
              <div>
                <Label>{ehPessoaFisica(editData.tipo) ? 'CPF' : 'CNPJ'}</Label>
                <Input value={editData.cnpj} onChange={e => setEditData(d => ({ ...d, cnpj: e.target.value }))} placeholder={ehPessoaFisica(editData.tipo) ? '000.000.000-00' : '00.000.000/0000-00'} />
              </div>
```
por:
```tsx
              <CampoCnpj
                aceitaCpf
                value={editData.cnpj}
                onChange={v => setEditData(d => ({ ...d, cnpj: v }))}
                valorJaGravado={cliente.cnpj}
                onDadosEncontrados={dados => setEditData(d => ({ ...d, razao_social: d.razao_social || dados.razao_social || '' }))}
              />
```

E no cartão que mostra o documento, troque:
```tsx
                   <p className="text-sm font-medium text-foreground break-all">{cliente.cnpj}</p>
```
por:
```tsx
                   <p className="text-sm font-medium text-foreground break-all">{formatarDocumento(cliente.cnpj)}</p>
```
(`ehPessoaFisica` continua sendo usado no cartão — não tire do import.)

- [ ] **Step 11: `EmpresaSelector.tsx` — imports.**
  - Troque `import { maskCnpj, unmaskCnpj, isValidCnpjDigits } from '@/lib/cnpj';` por:
    ```ts
    import {
      unmaskCnpj,
      classificarDocumento,
      resultadoPermiteSalvar,
      mensagemDoDocumento,
      formatarDocumento,
      telefoneDaReceita,
    } from '@/lib/cnpj';
    import { CampoCnpj } from '@/components/shared/CampoCnpj';
    ```
  - Troque:
    ```ts
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogFooter,
    } from '@/components/ui/dialog';
    ```
    por:
    ```ts
    import { Dialog, DialogTitle } from '@/components/ui/dialog';
    import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
    ```

- [ ] **Step 12: `EmpresaSelector.tsx` — busca e validação.**
  - Troque:
    ```ts
        return clientes.filter((c) =>
          correspondeBusca(c.empresa, searchTerm) ||
          correspondeBusca(c.razao_social, searchTerm) ||
          c.cnpj?.includes(searchTerm.trim())
        );
    ```
    por:
    ```ts
        // Documento casa DÍGITO COM DÍGITO: a lista mostra com máscara, e quem copia da tela cola
        // com pontos. Só entra na conta quando a busca é um número.
        const buscaEhNumero = /^[\d.\/\-\s]+$/.test(searchTerm.trim());
        const digitosDaBusca = searchTerm.replace(/\D/g, '');
        return clientes.filter((c) =>
          correspondeBusca(c.empresa, searchTerm) ||
          correspondeBusca(c.razao_social, searchTerm) ||
          (buscaEhNumero && digitosDaBusca.length > 0 && (c.cnpj ?? '').replace(/\D/g, '').includes(digitosDaBusca))
        );
    ```
  - No `handleCreate`, troque:
    ```ts
        if (unmaskCnpj(newEmpresa.cnpj).length !== 14) {
          toast.error('Informe um CNPJ válido');
          return;
        }
        if (!isValidCnpjDigits(unmaskCnpj(newEmpresa.cnpj))) {
          toast.error('CNPJ inválido');
          return;
        }
    ```
    por:
    ```ts
        // CPF ou CNPJ pelos dígitos: este atalho exigia 14 dígitos até de pessoa física.
        const documento = classificarDocumento(newEmpresa.cnpj, { aceitaCpf: true });
        if (documento === 'vazio') {
          toast.error('Informe o CPF ou CNPJ');
          return;
        }
        if (!resultadoPermiteSalvar(documento, 'avisar')) {
          toast.error(mensagemDoDocumento(documento, { seNaoExistir: 'avisar', aceitaCpf: true })!.texto);
          return;
        }
    ```
  - Na lista, troque `<span className="text-[10px] text-muted-foreground">{cliente.cnpj}</span>` por `<span className="text-[10px] text-muted-foreground">{formatarDocumento(cliente.cnpj)}</span>`.

- [ ] **Step 13: `EmpresaSelector.tsx` — o modal.** Troque `        <DialogContent className="sm:max-w-[425px]">` por `        <ConteudoDialogo className="sm:max-w-[425px]">` e o `        </DialogContent>` correspondente por `        </ConteudoDialogo>`. Troque `<DialogHeader>`/`</DialogHeader>` por `<CabecalhoDialogo>`/`</CabecalhoDialogo>`. Troque `          <div className="grid gap-4 py-4">` (o miolo do formulário) por `          <CorpoDialogo className="grid gap-4 py-4">`, e o `</div>` que o fecha — logo antes de `<DialogFooter>` — por `</CorpoDialogo>`. Troque `<DialogFooter>`/`</DialogFooter>` por `<RodapeDialogo>`/`</RodapeDialogo>`.

  E troque o bloco do CNPJ:
```tsx
            <div className="grid gap-2">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                value={newEmpresa.cnpj}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, cnpj: maskCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
            </div>
```
por:
```tsx
            <CampoCnpj
              id="cnpj"
              aceitaCpf
              obrigatorio
              value={newEmpresa.cnpj}
              onChange={(v) => setNewEmpresa((e) => ({ ...e, cnpj: v }))}
              onDadosEncontrados={(dados) =>
                setNewEmpresa((e) => ({
                  ...e,
                  empresa: e.empresa || dados.razao_social || '',
                  telefone: e.telefone || telefoneDaReceita(dados),
                }))
              }
            />
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run src/test/uma-consulta-de-cnpj-so.test.ts src/components/shared/CampoCnpj.test.tsx src/lib/cnpj.test.ts`
Expected: PASS. Depois `npm run test`: nenhum teste que passava antes passou a falhar.

- [ ] **Step 15: Tipos e lint dos arquivos** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Clientes.tsx|ClienteDetalhe.tsx|EmpresaSelector.tsx" | wc -l` e `npx eslint src/pages/Clientes.tsx src/pages/ClienteDetalhe.tsx src/components/shared/EmpresaSelector.tsx src/test/uma-consulta-de-cnpj-so.test.ts`. Expected: nada subiu. Confira também que nenhuma tela chama mais a porta antiga: `grep -rn "fetchCnpjData" src --include=*.tsx` deve voltar vazio.

- [ ] **Step 16: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/test/uma-consulta-de-cnpj-so.test.ts src/pages/Clientes.tsx src/pages/ClienteDetalhe.tsx src/components/shared/EmpresaSelector.tsx`.
Mensagem: `feat(clientes): CPF ou CNPJ pelos dígitos em qualquer tipo, e a Receita só avisa`

---

### Task 6: A trava estrutural — e a porta antiga some

**Files:**
- Modify: `src/test/uma-consulta-de-cnpj-so.test.ts` (acrescentar três testes)
- Modify: `src/lib/cnpj.ts` (apagar `FETCH_TIMEOUT_MS` e `fetchCnpjData`)

**Interfaces:**
- Consumes: `RAIZ`, `ler` (Tarefa 4). Depende de a Tarefa 5 ter tirado o último `fetchCnpjData(` das telas.
- Produces: `src/lib/cnpj.ts` sem `fetchCnpjData`. A partir daqui, `consultarCnpj` é a única porta.

- [ ] **Step 1: Write the failing test** — no topo de `src/test/uma-consulta-de-cnpj-so.test.ts`, troque os imports:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```
por:
```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
```

Logo abaixo de `usosDoCampoCnpj`, acrescente:
```ts
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
```

E, dentro do `describe`, acrescente:
```ts
  // 20 s: estes dois leem o projeto inteiro do disco, e com outra sessão disputando a máquina
  // estouravam os 5 s padrão (mesmo motivo de `uma-leitura-de-planilha-so.test.ts`).
  it('🔴 só src/lib/cnpj.ts fala com o BrasilAPI de CNPJ', { timeout: 20_000 }, () => {
    const infratores = arquivosDeCodigo(RAIZ)
      .filter((c) => /brasilapi\.com\.br\/api\/cnpj/.test(readFileSync(c, 'utf8')))
      .map(relativo)
      .filter((r) => r !== 'lib/cnpj.ts');
    expect(infratores).toEqual([]);
  });

  it('🔴 só o <CampoCnpj> chama consultarCnpj — tela nenhuma monta a sua consulta', { timeout: 20_000 }, () => {
    const podem = new Set(['lib/cnpj.ts', 'components/shared/CampoCnpj.tsx']);
    const infratores = arquivosDeCodigo(RAIZ)
      .filter((c) => /\bconsultarCnpj\s*\(/.test(readFileSync(c, 'utf8')))
      .map(relativo)
      .filter((r) => !podem.has(r));
    expect(infratores).toEqual([]);
  });

  it('a porta antiga, fetchCnpjData, não existe mais', async () => {
    const modulo = await import('@/lib/cnpj');
    expect('fetchCnpjData' in modulo).toBe(false);
  });
```

(A consulta de CEP, em `src/lib/cep.ts`, também chama o BrasilAPI, mas em `/api/cep/` — a expressão procura só `/api/cnpj`, de propósito.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/uma-consulta-de-cnpj-so.test.ts`
Expected: FAIL só em "a porta antiga, fetchCnpjData, não existe mais". As duas varreduras **passam de primeira**: elas são trava contra o futuro, não conserto.

- [ ] **Step 3: Prove que as varreduras sabem falhar.** Crie à mão `src/lib/tmp-prova.ts` com uma linha: `export const x = () => fetch('https://brasilapi.com.br/api/cnpj/v1/1');`. Rode o mesmo comando: a primeira varredura tem de FALHAR, apontando `lib/tmp-prova.ts`. **Apague `src/lib/tmp-prova.ts`** e confira com `git status --short` que ele sumiu.

- [ ] **Step 4: Apague a porta antiga.** Em `src/lib/cnpj.ts`, apague este trecho inteiro:

```ts
const FETCH_TIMEOUT_MS = 10_000;

// Fetch from BrasilAPI (free, no key)
export async function fetchCnpjData(cnpj: string): Promise<CnpjData> {
  const digits = cnpj.replace(/\D/g, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('CNPJ não encontrado na base da Receita Federal');
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Consulta de CNPJ expirou. Verifique sua conexão e tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/uma-consulta-de-cnpj-so.test.ts src/lib/cnpj.test.ts`
Expected: PASS. Depois `npm run test` e `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "fetchCnpjData"` — Expected: `0` (ninguém mais chamava).

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/test/uma-consulta-de-cnpj-so.test.ts src/lib/cnpj.ts`.
Mensagem: `test(cnpj): trava contra a quarta consulta à Receita, e a porta antiga sai`

---

### Task 7: As funções de telefone — separar, juntar, barrar o 12º dígito, formatar ao sair

**Files:**
- Create: `src/lib/telefones-do-campo.ts`
- Create: `src/lib/telefones-do-campo.test.ts`

**Interfaces:**
- Consumes: `telefoneParaCadastro` (`src/lib/contato-da-conversa.ts` — número estrangeiro passa inteiro, tira o `55` só quando é código de país, formata 10 e 11 dígitos, devolve intacto o que não reconhece).
- Produces:
  ```ts
  export const SEPARADOR_DE_TELEFONES: RegExp;          // /[,;/]/ — sem a flag g
  export function separarTelefones(bruto: string | null | undefined): string[];
  export function juntarTelefones(partes: string[]): string;   // junta com ", "
  export function ehTelefoneLivre(parte: string): boolean;
  export function limitarTelefoneDigitado(novo: string, anterior?: string): string;
  export function formatarTelefoneGuardado(parte: string): string;
  ```

- [ ] **Step 1: Write the failing test** — crie `src/lib/telefones-do-campo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  separarTelefones,
  juntarTelefones,
  ehTelefoneLivre,
  limitarTelefoneDigitado,
  formatarTelefoneGuardado,
} from './telefones-do-campo';

/**
 * Os formatos de campo com VÁRIOS números que existem na base (medido em 11/09/2026: 148
 * cadastros, sempre separados por vírgula) — com dígitos inventados (CLAUDE.md §6.9).
 */
const FORMATOS_REAIS = [
  '5584999998888, 558432221111',
  '558432221111, 84999998888',
  '5584999998888, 84999997777, 558432221111',
  '(84) 3222-1111, (84) 99999-8888',
];

/** O número nacional de cada pedaço — o que NÃO pode mudar na ida e volta. */
const nacionais = (campo: string) =>
  separarTelefones(campo).map((p) => {
    const d = p.replace(/\D/g, '');
    return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  });

describe('separarTelefones / juntarTelefones — ida e volta sem perder número', () => {
  it.each(FORMATOS_REAIS)('%s abre em campos separados e volta igual', (bruto) => {
    const partes = separarTelefones(bruto);
    expect(partes).toHaveLength(bruto.split(',').length);
    expect(juntarTelefones(partes)).toBe(bruto);
  });

  it.each(FORMATOS_REAIS)('%s, formatado campo a campo, mantém cada número', (bruto) => {
    const formatado = juntarTelefones(separarTelefones(bruto).map(formatarTelefoneGuardado));
    expect(nacionais(formatado)).toEqual(nacionais(bruto));
  });

  it('separa também por ponto e vírgula e barra — o mesmo separador do reconhecimento do WhatsApp', () => {
    expect(separarTelefones('84999998888; 8432221111 / 84999997777')).toEqual([
      '84999998888',
      '8432221111',
      '84999997777',
    ]);
  });

  it('NÃO parte no hífen — o identificador de grupo antigo do WhatsApp tem hífen', () => {
    expect(separarTelefones('558499999888-1587654321')).toEqual(['558499999888-1587654321']);
  });

  it('campo vazio é lista vazia, e lista de vazios grava vazio', () => {
    expect(separarTelefones('')).toEqual([]);
    expect(separarTelefones(null)).toEqual([]);
    expect(juntarTelefones(['', '  '])).toBe('');
  });
});

describe('formatarTelefoneGuardado — o que o campo mostra ao abrir e ao sair', () => {
  it('celular de 11 dígitos, e com o 55 grudado, vira (DD) NNNNN-NNNN', () => {
    expect(formatarTelefoneGuardado('84999998888')).toBe('(84) 99999-8888');
    expect(formatarTelefoneGuardado('5584999998888')).toBe('(84) 99999-8888');
    expect(formatarTelefoneGuardado('+55 84 99999-8888')).toBe('(84) 99999-8888');
  });

  it('fixo de 10 dígitos, e com o 55 grudado, vira (DD) NNNN-NNNN — sem nono dígito', () => {
    expect(formatarTelefoneGuardado('8432221111')).toBe('(84) 3222-1111');
    expect(formatarTelefoneGuardado('558432221111')).toBe('(84) 3222-1111');
  });

  it.each([
    '+1 415 555 0123',
    '120363012345678901@g.us',
    '558499999888-1587654321',
    '0800 123 4567',
    '(84) 3222-1111 ramal 20',
    '1234',
    '849999',
  ])('%s passa intacto — não é telefone brasileiro completo', (parte) => {
    expect(formatarTelefoneGuardado(parte)).toBe(parte);
  });
});

describe('ehTelefoneLivre — o que a regra brasileira não pode tocar', () => {
  it.each(['+1 415 555 0123', '120363012345678901@g.us', '558499999888-1587654321', '0800 123 4567', 'ramal 20'])(
    '%s é livre',
    (parte) => expect(ehTelefoneLivre(parte)).toBe(true),
  );
  it.each(['84999998888', '(84) 3222-1111', '+55 84 99999-8888', ''])('%s não é livre', (parte) =>
    expect(ehTelefoneLivre(parte)).toBe(false),
  );
});

describe('limitarTelefoneDigitado — enquanto a pessoa digita', () => {
  it('aceita o que se digita como está — formatar é ao sair (CLAUDE.md §7.10)', () => {
    expect(limitarTelefoneDigitado('8499999', '849999')).toBe('8499999');
    expect(limitarTelefoneDigitado('(84) 99999-888', '(84) 99999-88')).toBe('(84) 99999-888');
  });

  it('🔴 o 12º dígito não entra — o campo é de UM número', () => {
    expect(limitarTelefoneDigitado('849999988881', '84999998888')).toBe('84999998888');
    expect(limitarTelefoneDigitado('(84) 99999-88881', '(84) 99999-8888')).toBe('(84) 99999-8888');
  });

  it('número colado com o 55 do país entra inteiro — o 55 não conta como dígito do número', () => {
    expect(limitarTelefoneDigitado('+55 84 99999-8888', '')).toBe('+55 84 99999-8888');
    expect(limitarTelefoneDigitado('5584999998888', '')).toBe('5584999998888');
  });

  it.each(['+1 415 555 0123', '120363012345678901@g.us', '0800 123 4567', 'ramal 20'])(
    '%s passa sem limite',
    (texto) => expect(limitarTelefoneDigitado(texto, '')).toBe(texto),
  );

  it('o que já estava fora do formato não é cortado quando a pessoa edita', () => {
    expect(limitarTelefoneDigitado('84 3222 1111 2010', '84 3222 1111 201')).toBe('84 3222 1111 2010');
  });

  it('apagar tudo deixa vazio', () => {
    expect(limitarTelefoneDigitado('', '(8')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/telefones-do-campo.test.ts`
Expected: FAIL — `Failed to resolve import "./telefones-do-campo"`.

- [ ] **Step 3: Write the implementation** — crie `src/lib/telefones-do-campo.ts`:

```ts
import { telefoneParaCadastro } from './contato-da-conversa';

/**
 * Funções do campo de telefone de cadastro (`<CampoTelefones>`): um campo por número, com a
 * lista separada por vírgula no banco — nenhuma mudança de estrutura (decisão de 11/09/2026).
 *
 * 🔴 148 cadastros guardam mais de um número no mesmo campo (medido em 11/09/2026). Máscara de UM
 * número aplicada ao campo inteiro apaga o segundo: é o que `formatarTelefone` (src/lib/telefone.ts)
 * fazia na ficha do contato, porque ela corta tudo depois do 11º dígito. Aqui cada número tem o
 * seu campo, e nada aplica máscara à lista.
 */

/**
 * O MESMO separador de `chavesDeTelefone` (src/lib/contato-da-conversa.ts), que reconhece de
 * quem é uma conversa de WhatsApp. O hífen fica de fora de propósito: o identificador de grupo
 * antigo tem hífen. Sem a flag `g`, então `.test()` não guarda estado entre chamadas.
 */
export const SEPARADOR_DE_TELEFONES = /[,;/]/;

export function separarTelefones(bruto: string | null | undefined): string[] {
  return (bruto ?? '')
    .split(SEPARADOR_DE_TELEFONES)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Junta com ", " — o separador dos 148 cadastros de hoje. Campo vazio não vira vírgula solta. */
export function juntarTelefones(partes: string[]): string {
  return partes
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
}

/** Os dígitos do número nacional: o `55` da frente só sai quando sobra número depois dele. */
function digitosNacionais(texto: string): string {
  const d = texto.replace(/\D/g, '');
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

/**
 * O que a regra do telefone brasileiro NÃO pode tocar — nem para limitar, nem para formatar:
 * - número estrangeiro (começa com `+` e não é `+55`);
 * - identificador de grupo do WhatsApp: o novo tem `@`, o antigo é dígito-hífen-dígito comprido
 *   (CLAUDE.md §7.2 — limpar os não-dígitos dele monta um destino que não existe);
 * - texto com letra ou símbolo ("ramal 20");
 * - número que começa com zero (0800, 0300): DDD nunca começa com zero.
 */
export function ehTelefoneLivre(parte: string): boolean {
  const texto = parte.trim();
  if (!texto) return false;
  if (texto.startsWith('+') && !texto.replace(/\D/g, '').startsWith('55')) return true;
  if (texto.includes('@') || /\d{8,}-\d{6,}/.test(texto)) return true;
  if (/[^\d\s()+\-.]/.test(texto)) return true;
  return texto.replace(/\D/g, '').startsWith('0');
}

/**
 * Enquanto a pessoa digita: o texto fica COMO ELA ESCREVEU, e só o 12º dígito do número não
 * entra. Reformatar a cada tecla joga o cursor para o fim e faz a pessoa redigitar — onde o erro
 * nasce (CLAUDE.md §7.10). A formatação é ao sair do campo (`formatarTelefoneGuardado`).
 *
 * O que já estava fora do formato — um número antigo com ramal grudado, por exemplo — não é
 * cortado quando a pessoa o edita: cortar apagaria dígitos que ela nem tocou.
 */
export function limitarTelefoneDigitado(novo: string, anterior = ''): string {
  if (ehTelefoneLivre(novo) || ehTelefoneLivre(anterior)) return novo;
  if (digitosNacionais(anterior).length > 11) return novo;
  return digitosNacionais(novo).length > 11 ? anterior : novo;
}

/**
 * O número como o campo mostra: ao abrir o cadastro e ao sair do campo. `(84) 99999-8888` ou
 * `(84) 3222-1111`, sem `+55` — o formato de todo número já mascarado na base. Nunca enfia o nono
 * dígito em fixo (CLAUDE.md §7.1). O que não é telefone brasileiro completo volta como veio.
 */
export function formatarTelefoneGuardado(parte: string): string {
  return ehTelefoneLivre(parte) ? parte.trim() : telefoneParaCadastro(parte);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/telefones-do-campo.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos e lint** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "telefones-do-campo"` (Expected: `0`) e `npx eslint src/lib/telefones-do-campo.ts src/lib/telefones-do-campo.test.ts` (Expected: sem problemas).

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/lib/telefones-do-campo.ts src/lib/telefones-do-campo.test.ts`.
Mensagem: `feat(telefone): separar e juntar vários números sem perder nenhum, limite de um número por campo`

---

### Task 8: `<CampoTelefones>` — um campo por número

**Files:**
- Create: `src/components/shared/CampoTelefones.tsx`
- Create: `src/components/shared/CampoTelefones.test.tsx`

**Interfaces:**
- Consumes: `SEPARADOR_DE_TELEFONES`, `separarTelefones`, `juntarTelefones`, `limitarTelefoneDigitado`, `formatarTelefoneGuardado` (Tarefa 7).
- Produces:
  ```ts
  export interface CampoTelefonesProps {
    value: string | null | undefined;          // o texto do banco: lista separada por vírgula
    onChange: (valorParaOBanco: string) => void;
    id?: string;                               // vai no PRIMEIRO campo (para o <Label htmlFor>)
    obrigatorio?: boolean;                     // `required` no primeiro campo
    placeholder?: string;                      // do primeiro campo; padrão '(00) 00000-0000'
    disabled?: boolean;
    className?: string;                        // classe de cada campo (ex.: 'h-8 text-sm')
  }
  export function CampoTelefones(props: CampoTelefonesProps): JSX.Element;
  ```
- Contrato com quem usa: o componente **só chama `onChange` quando a pessoa mexe**. Abrir o cadastro e salvar sem tocar no telefone grava exatamente o que já estava lá (decisão 7 do desenho).

- [ ] **Step 1: Write the failing test** — crie `src/components/shared/CampoTelefones.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampoTelefones } from './CampoTelefones';

/** O formulário de quem usa: guarda o texto do banco e mostra o que seria gravado. */
function Formulario({ inicial = '', onValor = vi.fn() }: { inicial?: string; onValor?: (v: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <CampoTelefones
        value={valor}
        onChange={(v) => {
          setValor(v);
          onValor(v);
        }}
      />
      <output data-testid="banco">{valor}</output>
    </>
  );
}

const campos = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const banco = () => screen.getByTestId('banco').textContent;

describe('CampoTelefones', () => {
  it('cadastro com dois números abre dois campos, cada um formatado', () => {
    render(<Formulario inicial="5584999998888, 558432221111" />);
    expect(campos().map((c) => c.value)).toEqual(['(84) 99999-8888', '(84) 3222-1111']);
  });

  it('🔴 abrir e não mexer não reescreve o que está no banco', () => {
    const onValor = vi.fn();
    render(<Formulario inicial="5584999998888, 558432221111" onValor={onValor} />);
    expect(onValor).not.toHaveBeenCalled();
    expect(banco()).toBe('5584999998888, 558432221111');
  });

  it('"+ outro telefone" abre um campo vazio que não some, e o número entra com vírgula', () => {
    render(<Formulario inicial="84999998888" />);
    fireEvent.click(screen.getByRole('button', { name: '+ outro telefone' }));
    expect(campos()).toHaveLength(2);
    fireEvent.change(campos()[1], { target: { value: '8432221111' } });
    fireEvent.blur(campos()[1]);
    expect(campos()[1].value).toBe('(84) 3222-1111');
    expect(banco()).toBe('(84) 99999-8888, (84) 3222-1111');
  });

  it('digita como a pessoa escreve, e formata só ao sair', () => {
    render(<Formulario />);
    fireEvent.change(campos()[0], { target: { value: '8499999' } });
    expect(campos()[0].value).toBe('8499999');
    fireEvent.change(campos()[0], { target: { value: '84999998888' } });
    fireEvent.blur(campos()[0]);
    expect(campos()[0].value).toBe('(84) 99999-8888');
  });

  it('🔴 o 12º dígito não entra', () => {
    render(<Formulario inicial="84999998888" />);
    fireEvent.change(campos()[0], { target: { value: '(84) 99999-88881' } });
    expect(campos()[0].value).toBe('(84) 99999-8888');
  });

  it('o × tira só aquele número; o primeiro campo não tem ×', () => {
    render(<Formulario inicial="84999998888, 8432221111, 84999997777" />);
    expect(screen.queryByRole('button', { name: 'Tirar o telefone 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar o telefone 2' }));
    expect(banco()).toBe('(84) 99999-8888, (84) 99999-7777');
  });

  it('colar dois números num campo abre um campo para cada', () => {
    render(<Formulario />);
    fireEvent.change(campos()[0], { target: { value: '84999998888, 8432221111' } });
    expect(campos().map((c) => c.value)).toEqual(['(84) 99999-8888', '(84) 3222-1111']);
    expect(banco()).toBe('(84) 99999-8888, (84) 3222-1111');
  });

  it('digitar a vírgula abre o próximo campo, sem gravar vírgula solta', () => {
    render(<Formulario inicial="84999998888" />);
    fireEvent.change(campos()[0], { target: { value: '(84) 99999-8888,' } });
    expect(campos()).toHaveLength(2);
    // Um campo vazio a mais não muda nada para o banco — e vírgula solta nunca chega lá.
    expect(banco()).not.toContain(',');
  });

  it('mudança de fora redesenha os campos (formulário limpo, consulta de CNPJ que preenche)', () => {
    const { rerender } = render(<CampoTelefones value="84999998888, 8432221111" onChange={vi.fn()} />);
    expect(campos()).toHaveLength(2);
    rerender(<CampoTelefones value="" onChange={vi.fn()} />);
    expect(campos()).toHaveLength(1);
    expect(campos()[0].value).toBe('');
    rerender(<CampoTelefones value="2121660000" onChange={vi.fn()} />);
    expect(campos()[0].value).toBe('(21) 2166-0000');
  });

  it('estrangeiro e identificador de grupo passam intactos', () => {
    render(<Formulario inicial="+1 415 555 0123, 120363012345678901@g.us" />);
    expect(campos().map((c) => c.value)).toEqual(['+1 415 555 0123', '120363012345678901@g.us']);
  });

  it('obrigatório e id valem para o primeiro campo', () => {
    render(<CampoTelefones value="" onChange={vi.fn()} obrigatorio id="telefone" />);
    expect(campos()[0]).toBeRequired();
    expect(campos()[0]).toHaveAttribute('id', 'telefone');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/CampoTelefones.test.tsx`
Expected: FAIL — `Failed to resolve import "./CampoTelefones"`.

- [ ] **Step 3: Write the implementation** — crie `src/components/shared/CampoTelefones.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SEPARADOR_DE_TELEFONES,
  separarTelefones,
  juntarTelefones,
  limitarTelefoneDigitado,
  formatarTelefoneGuardado,
} from '@/lib/telefones-do-campo';

export interface CampoTelefonesProps {
  /** O texto como está no banco: a lista separada por vírgula. */
  value: string | null | undefined;
  /** Devolve o texto para o banco, já juntado com ", ". Só é chamado quando a pessoa mexe. */
  onChange: (valorParaOBanco: string) => void;
  /** Vai no PRIMEIRO campo: é para ele que um `<Label htmlFor>` de fora aponta. */
  id?: string;
  obrigatorio?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Classe de cada campo, para as telas de campo compacto (`h-8 text-sm`). */
  className?: string;
}

function partesDoValor(valor: string | null | undefined): string[] {
  const partes = separarTelefones(valor).map(formatarTelefoneGuardado);
  return partes.length > 0 ? partes : [''];
}

/**
 * Telefone de cadastro: um campo por número, "+ outro telefone" abaixo, e um × em cada campo extra.
 *
 * Quem usa não precisa saber que ele se divide: recebe e devolve o texto do banco, a mesma lista
 * separada por vírgula de sempre. 148 cadastros têm mais de um número no mesmo campo, e a máscara
 * de um número só, aplicada à lista inteira, apagava o segundo (medido em 11/09/2026).
 *
 * Enquanto se digita, o texto fica como a pessoa escreveu e só o 12º dígito é barrado; a
 * formatação é ao SAIR do campo (CLAUDE.md §7.10). Número estrangeiro, identificador de grupo do
 * WhatsApp e texto que não é telefone passam intactos.
 */
export function CampoTelefones({
  value,
  onChange,
  id,
  obrigatorio,
  placeholder = '(00) 00000-0000',
  disabled,
  className,
}: CampoTelefonesProps) {
  const [partes, setPartes] = useState<string[]>(() => partesDoValor(value));
  const ultimoEmitidoRef = useRef<string | null>(null);
  const camposRef = useRef<(HTMLInputElement | null)[]>([]);
  const [focar, setFocar] = useState<number | null>(null);

  // Mudança que veio de FORA (o formulário limpou, a consulta de CNPJ preencheu o telefone):
  // redesenha os campos. A que nasceu aqui dentro volta igual ao que foi emitido e é ignorada —
  // senão o campo vazio recém-aberto por "+ outro telefone" sumiria na hora.
  useEffect(() => {
    if ((value ?? '') === ultimoEmitidoRef.current) return;
    setPartes(partesDoValor(value));
  }, [value]);

  useEffect(() => {
    if (focar === null) return;
    camposRef.current[focar]?.focus();
    setFocar(null);
  }, [focar, partes.length]);

  function atualizar(novas: string[]) {
    setPartes(novas);
    const valor = juntarTelefones(novas);
    if (valor === juntarTelefones(partes)) return; // nada mudou para o banco
    ultimoEmitidoRef.current = valor;
    onChange(valor);
  }

  function aoDigitar(indice: number, texto: string) {
    // Colou vários números, ou digitou a vírgula: cada número ganha o seu campo.
    if (SEPARADOR_DE_TELEFONES.test(texto)) {
      const pedacos = texto.split(SEPARADOR_DE_TELEFONES).map((p) => p.trim());
      const cheios = pedacos.filter(Boolean).map(formatarTelefoneGuardado);
      if (cheios.length === 0) return;
      const abreOProximo = pedacos[pedacos.length - 1] === '';
      const novas = [...partes];
      novas.splice(indice, 1, ...cheios, ...(abreOProximo ? [''] : []));
      if (abreOProximo) setFocar(indice + cheios.length);
      atualizar(novas);
      return;
    }
    const novas = [...partes];
    novas[indice] = limitarTelefoneDigitado(texto, partes[indice]);
    atualizar(novas);
  }

  function aoSair(indice: number) {
    const formatado = formatarTelefoneGuardado(partes[indice]);
    if (formatado === partes[indice]) return;
    const novas = [...partes];
    novas[indice] = formatado;
    atualizar(novas);
  }

  function adicionar() {
    setFocar(partes.length);
    setPartes([...partes, '']);
  }

  function remover(indice: number) {
    const novas = partes.filter((_, i) => i !== indice);
    atualizar(novas.length > 0 ? novas : ['']);
  }

  return (
    <div className="space-y-2">
      {partes.map((parte, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            ref={(el) => {
              camposRef.current[i] = el;
            }}
            id={i === 0 ? id : undefined}
            value={parte}
            onChange={(e) => aoDigitar(i, e.target.value)}
            onBlur={() => aoSair(i)}
            inputMode="tel"
            placeholder={i === 0 ? placeholder : 'Outro telefone'}
            required={i === 0 && obrigatorio}
            disabled={disabled}
            aria-label={i === 0 ? undefined : `Telefone ${i + 1}`}
            className={cn('flex-1', className)}
          />
          {i > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => remover(i)}
              disabled={disabled}
              aria-label={`Tirar o telefone ${i + 1}`}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={adicionar}
        disabled={disabled}
      >
        + outro telefone
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/CampoTelefones.test.tsx`
Expected: PASS — 11 testes.

- [ ] **Step 5: Tipos e lint** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "CampoTelefones"` (Expected: `0`) e `npx eslint src/components/shared/CampoTelefones.tsx src/components/shared/CampoTelefones.test.tsx` (Expected: sem problemas).

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/components/shared/CampoTelefones.tsx src/components/shared/CampoTelefones.test.tsx`.
Mensagem: `feat(telefone): campo de telefones com um campo por número e "+ outro telefone"`

---

### Task 9: Os 10 campos de telefone fora do WhatsApp

**Files:**
- Create: `src/test/telefone-de-cadastro-usa-campo-telefones.test.ts`
- Modify: `src/pages/Clientes.tsx` (3 campos)
- Modify: `src/pages/ClienteDetalhe.tsx` (2 campos)
- Modify: `src/pages/ContatoDetalhe.tsx` (1 campo)
- Modify: `src/pages/Fabricantes.tsx` (1 campo)
- Modify: `src/components/fabricantes/ContatosDaFabrica.tsx` (1 campo)
- Modify: `src/components/shared/EmpresaSelector.tsx` (1 campo)
- Modify: `src/components/obras/SeletorContatosObra.tsx` (1 campo)

**Interfaces:**
- Consumes: `CampoTelefones` (Tarefa 8), importado de `@/components/shared/CampoTelefones`.
- Produces: o arquivo `src/test/telefone-de-cadastro-usa-campo-telefones.test.ts` com a tabela `CAMPOS_DE_TELEFONE`. A Tarefa 10 acrescenta três linhas nela.

Em cada arquivo, acrescente `import { CampoTelefones } from '@/components/shared/CampoTelefones';` junto dos outros imports de `@/components/shared/` (use aspas duplas nos arquivos que usam aspas duplas: `ContatoDetalhe.tsx` e `Fabricantes.tsx`). Depois de trocar, rode `npx eslint <arquivo>`: se `Input` ou `telefoneParaCadastro` ficarem sem uso, tire do import — **só** o que o lint apontar.

- [ ] **Step 1: Write the failing test** — crie `src/test/telefone-de-cadastro-usa-campo-telefones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Todo campo de telefone de CADASTRO usa o <CampoTelefones>.
 *
 * 🔴 148 cadastros têm dois números no mesmo campo (medido em 11/09/2026). Um `<Input>` de
 * telefone com máscara de um número só — o que a ficha do contato tinha, com `formatarTelefone` —
 * apaga o segundo número na primeira edição, sem aviso. Esta varredura impede que um campo novo
 * nasça assim, e que um dos 13 de hoje volte a ser `<Input>`.
 *
 * Fica de fora a lista de conversas do WhatsApp: lá o número é identificador da conversa, não
 * cadastro (desenho de 11/09/2026, §5).
 */

const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');

/** Quantos campos de telefone de cadastro cada arquivo tem. */
const CAMPOS_DE_TELEFONE: Record<string, number> = {
  'pages/Clientes.tsx': 3,
  'pages/ClienteDetalhe.tsx': 2,
  'pages/ContatoDetalhe.tsx': 1,
  'pages/Fabricantes.tsx': 1,
  'components/fabricantes/ContatosDaFabrica.tsx': 1,
  'components/shared/EmpresaSelector.tsx': 1,
  'components/obras/SeletorContatosObra.tsx': 1,
};

/** Um `<Input ... />` cujo `value` é um telefone — o que não pode sobrar. */
const INPUT_DE_TELEFONE = /<Input\b(?:(?!\/>)[\s\S])*?value=\{[^}]*elefone[^}]*\}/;

describe('telefone de cadastro usa o CampoTelefones', () => {
  it.each(Object.entries(CAMPOS_DE_TELEFONE))('%s', (arquivo, quantos) => {
    const codigo = ler(arquivo);
    // `\s` e não `\b`: comentário que cita "o <CampoTelefones>" não é uso.
    expect(codigo.match(/<CampoTelefones\s/g) ?? []).toHaveLength(quantos);
    expect(codigo).not.toMatch(INPUT_DE_TELEFONE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/telefone-de-cadastro-usa-campo-telefones.test.ts`
Expected: FAIL nos 7 arquivos — 0 usos de `<CampoTelefones`.

- [ ] **Step 3: `Clientes.tsx` — os três campos.**

Telefone da empresa, no passo 2 do assistente. Troque:
```tsx
<div><Label>Telefone{empresaObrigatorio('telefone', true) && ' *'}</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000, (00) 00000-0000" required={empresaObrigatorio('telefone', true)} /></div>
```
por:
```tsx
<div><Label>Telefone{empresaObrigatorio('telefone', true) && ' *'}</Label><CampoTelefones value={telefone} onChange={setTelefone} obrigatorio={empresaObrigatorio('telefone', true)} /></div>
```

Telefone do contato novo, no passo 4 do assistente. Troque:
```tsx
<Input value={contatoTelefone} onChange={e => setContatoTelefone(e.target.value)} placeholder={`Telefone do contato${contatoObrigatorio('telefone', true) ? ' *' : ''}`} required={contatoObrigatorio('telefone', true)} />
```
por:
```tsx
<CampoTelefones value={contatoTelefone} onChange={setContatoTelefone} placeholder={`Telefone do contato${contatoObrigatorio('telefone', true) ? ' *' : ''}`} obrigatorio={contatoObrigatorio('telefone', true)} />
```

Telefone do formulário de contato novo (o ramo que não é empresa). Troque:
```tsx
<div><Label>Telefone{contatoObrigatorio('telefone', true) && ' *'}</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000, (00) 00000-0000" required={contatoObrigatorio('telefone', true)} /></div>
```
por:
```tsx
<div><Label>Telefone{contatoObrigatorio('telefone', true) && ' *'}</Label><CampoTelefones value={telefone} onChange={setTelefone} obrigatorio={contatoObrigatorio('telefone', true)} /></div>
```

- [ ] **Step 4: `ClienteDetalhe.tsx` — os dois campos.**

Editar cliente. Troque:
```tsx
                  <Input value={editData.telefone} onChange={e => setEditData(d => ({ ...d, telefone: e.target.value }))} />
```
por:
```tsx
                  <CampoTelefones value={editData.telefone} onChange={v => setEditData(d => ({ ...d, telefone: v }))} />
```

Contato novo dentro da empresa. Troque:
```tsx
                      <Input
                        value={novoContato.telefone}
                        onChange={e => setNovoContato(c => ({ ...c, telefone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        required
                      />
```
por:
```tsx
                      <CampoTelefones
                        value={novoContato.telefone}
                        onChange={v => setNovoContato(c => ({ ...c, telefone: v }))}
                        obrigatorio
                      />
```

- [ ] **Step 5: `ContatoDetalhe.tsx` — o campo que apagava o segundo número.** Troque:

```tsx
                <Input
                  inputMode="tel"
                  placeholder="+55 (99) 99999-9999"
                  value={formatarTelefone(editData.telefone)}
                  onChange={(e) =>
                    setEditData((d) => ({
                      ...d,
                      telefone: formatarTelefone(e.target.value),
                    }))
                  }
                />
```
por:
```tsx
                {/* 🔴 Era `formatarTelefone`, que escreve `+55` e CORTA tudo depois do 11º dígito:
                    abrir e salvar a ficha de quem tem dois números apagava o segundo. */}
                <CampoTelefones
                  value={editData.telefone}
                  onChange={(v) => setEditData((d) => ({ ...d, telefone: v }))}
                />
```

E apague a linha `import { formatarTelefone } from "@/lib/telefone";` — era o único uso neste arquivo. (A função continua existindo em `src/lib/telefone.ts`: o WhatsApp a usa.)

- [ ] **Step 6: `Fabricantes.tsx` — telefone da fábrica.** Troque:

```tsx
            {/* Mesmo formatador dos contatos, ao SAIR do campo. Aqui o número é o da
                FÁBRICA — a mesa da empresa, que a consulta de CNPJ preenche —, não a
                linha de uma pessoa. */}
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              onBlur={(e) => setTelefone(telefoneParaCadastro(e.target.value))}
              placeholder="(00) 0000-0000"
            />
```
por:
```tsx
            {/* O número da FÁBRICA — a mesa da empresa, que a consulta de CNPJ preenche —, não a
                linha de uma pessoa. Formata ao sair do campo, como todo telefone de cadastro. */}
            <CampoTelefones value={telefone} onChange={setTelefone} placeholder="(00) 0000-0000" />
```

- [ ] **Step 7: `ContatosDaFabrica.tsx` — contato da fábrica.** Troque o comentário e o campo:

```tsx
              {/* 🔴 Formata AO SAIR do campo, não a cada tecla. Reformatar enquanto a
                  pessoa digita move o cursor no meio do número e faz ela redigitar — é
                  onde o erro nasce (CLAUDE.md §7.10: brigar com quem está digitando é pior
                  que a diferença).

                  `telefoneParaCadastro` é o formatador que já existe na casa, e ele carrega
                  três armadilhas resolvidas: não força o nono dígito (enfiá-lo em número de
                  10 dígitos quebra os FIXOS que têm WhatsApp, e isso já respondeu por 100%
                  das falhas de envio deste sistema), deixa número estrangeiro passar
                  inteiro, e não confunde o DDD 55 do Rio Grande do Sul com código de país. */}
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                onBlur={(e) => setForm({ ...form, telefone: telefoneParaCadastro(e.target.value) })}
                placeholder="(00) 00000-0000"
                className="h-8 text-sm"
              />
```
por:
```tsx
              {/* 🔴 Formata AO SAIR do campo, não a cada tecla (CLAUDE.md §7.10) — e o
                  <CampoTelefones> faz isso com `telefoneParaCadastro`, o formatador da casa:
                  não força o nono dígito (enfiá-lo em número de 10 dígitos quebra os FIXOS que
                  têm WhatsApp), deixa número estrangeiro passar inteiro e não confunde o DDD 55
                  do Rio Grande do Sul com código de país. */}
              <CampoTelefones
                value={form.telefone}
                onChange={(v) => setForm({ ...form, telefone: v })}
                className="h-8 text-sm"
              />
```

- [ ] **Step 8: `EmpresaSelector.tsx` — atalho de empresa.** Troque:

```tsx
              <Input
                id="telefone"
                value={newEmpresa.telefone}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
```
por:
```tsx
              <CampoTelefones
                id="telefone"
                value={newEmpresa.telefone}
                onChange={(v) => setNewEmpresa((e) => ({ ...e, telefone: v }))}
              />
```

- [ ] **Step 9: `SeletorContatosObra.tsx` — contato novo da obra.** Troque:

```tsx
              <Input
                value={novo.telefone}
                onChange={(e) => setNovo((n) => ({ ...n, telefone: e.target.value }))}
                className="h-8 text-sm"
              />
```
por:
```tsx
              <CampoTelefones
                value={novo.telefone}
                onChange={(v) => setNovo((n) => ({ ...n, telefone: v }))}
                className="h-8 text-sm"
              />
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run src/test/telefone-de-cadastro-usa-campo-telefones.test.ts src/components/shared/CampoTelefones.test.tsx`
Expected: PASS. Depois `npm run test`: nenhum teste que passava antes passou a falhar.

Se a varredura apontar um `<Input>` de telefone que **não** está nesta tarefa, **pare e avise**: é um campo que o levantamento de 11/09/2026 não viu. Não troque por conta própria nem afrouxe a expressão do teste.

- [ ] **Step 11: Tipos e lint dos 7 arquivos** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Clientes.tsx|ClienteDetalhe.tsx|ContatoDetalhe.tsx|Fabricantes.tsx|ContatosDaFabrica.tsx|EmpresaSelector.tsx|SeletorContatosObra.tsx" | wc -l` e `npx eslint` nos 7 arquivos e no teste novo. Expected: nada subiu em relação à linha de base.

- [ ] **Step 12: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only --` seguido dos 8 caminhos: o teste novo e os 7 arquivos da lista acima.
Mensagem: `feat(telefone): um campo por número em todo telefone de cadastro — a ficha do contato parava de apagar o segundo número`

---

### Task 10: As três janelas do WhatsApp

Ficam por último de propósito (desenho §4.3): são arquivos da frente do WhatsApp. Se aquela frente voltar a mexer neles antes desta tarefa, **pare e avise** — esta tarefa se separa sem atrapalhar o resto.

**Files:**
- Modify: `src/test/telefone-de-cadastro-usa-campo-telefones.test.ts` (três linhas na tabela)
- Modify: `src/components/whatsapp/CriarContatoDaConversaDialog.tsx`
- Modify: `src/components/whatsapp/SalvarContatoRecebidoDialog.tsx`
- Modify: `src/components/whatsapp/VincularEAtualizarContato.tsx`

**Interfaces:**
- Consumes: `CampoTelefones` (Tarefa 8); `CAMPOS_DE_TELEFONE` (Tarefa 9).
- O que **não** muda: nas três janelas o telefone chega preenchido com o número da conversa (`sugestao.telefone`, `dados.telefone`, `telefoneComONumeroDoChat`), e é gravado como está no estado. Como o `<CampoTelefones>` só chama `onChange` quando a pessoa mexe, **quem não toca no telefone grava exatamente o que gravava antes**. Identificador de grupo (`@g.us` ou dígito-hífen-dígito) passa intacto — provado na Tarefa 8.

- [ ] **Step 1: Write the failing test** — na tabela `CAMPOS_DE_TELEFONE` de `src/test/telefone-de-cadastro-usa-campo-telefones.test.ts`, acrescente as três linhas:

```ts
  'components/whatsapp/CriarContatoDaConversaDialog.tsx': 1,
  'components/whatsapp/SalvarContatoRecebidoDialog.tsx': 1,
  'components/whatsapp/VincularEAtualizarContato.tsx': 1,
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/telefone-de-cadastro-usa-campo-telefones.test.ts`
Expected: FAIL nas três linhas novas.

- [ ] **Step 3: As três trocas.** Em cada arquivo, acrescente `import { CampoTelefones } from '@/components/shared/CampoTelefones';` (aspas duplas em `SalvarContatoRecebidoDialog.tsx`, que usa aspas duplas).

`CriarContatoDaConversaDialog.tsx` — troque:
```tsx
                  <Input
                    id="contato-telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                  />
```
por:
```tsx
                  <CampoTelefones id="contato-telefone" value={telefone} onChange={setTelefone} />
```

`SalvarContatoRecebidoDialog.tsx` — troque:
```tsx
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
```
por:
```tsx
            <CampoTelefones value={telefone} onChange={setTelefone} />
```

`VincularEAtualizarContato.tsx` — troque:
```tsx
            <Input
              id="vinc-telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
```
por:
```tsx
            {/* O número da conversa vem somado aos da ficha (`telefoneComONumeroDoChat`), com
                ", " — o mesmo separador do campo. Cada número aparece no seu campo. */}
            <CampoTelefones id="vinc-telefone" value={telefone} onChange={setTelefone} />
```

Rode `npx eslint` nos três: se `Input` ficar sem uso em algum, tire do import — só o que o lint apontar.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/telefone-de-cadastro-usa-campo-telefones.test.ts` e, se existirem, os testes dos três componentes: `npx vitest run src/components/whatsapp`
Expected: PASS.

- [ ] **Step 5: Tipos e lint dos três** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "CriarContatoDaConversaDialog|SalvarContatoRecebidoDialog|VincularEAtualizarContato" | wc -l` e `npx eslint` nos três. Expected: nada subiu.

- [ ] **Step 6: Commit** — `git status --short` separado, depois `git commit -F <arquivo-da-mensagem> --only -- src/test/telefone-de-cadastro-usa-campo-telefones.test.ts src/components/whatsapp/CriarContatoDaConversaDialog.tsx src/components/whatsapp/SalvarContatoRecebidoDialog.tsx src/components/whatsapp/VincularEAtualizarContato.tsx`.
Mensagem: `feat(whatsapp): contato criado ou vinculado pela conversa ganha um campo por número`

---

### Task 11: Verificação completa e ensaio na tela

**Files:** nenhum arquivo novo. Esta tarefa só confere.

- [ ] **Step 1: Suíte, tipos, lint e build**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```
Expected:
- testes: todos passando, com os novos somados ao total anterior;
- tipos e lint: **por arquivo**, nenhum dos arquivos tocados passou da linha de base (a conta global pode ter mudado por causa da outra sessão — não é critério);
- build: compila.

- [ ] **Step 2: Ensaio na tela** — servidor de desenvolvimento (`npm run dev`, porta 8080), pelo painel do navegador. 🔴 **O servidor aponta para o banco de produção: nenhum ensaio clica no botão final de salvar, salvo onde dito.**
  1. **Fabricantes → Cadastrar**, CNPJ `98765432000198`, nome "Fábrica Exemplo", clicar em Salvar sem sair do campo. Esperado: o botão mostra "Conferindo o CNPJ...", depois aparece "A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ." com o link **Cadastrar sem CNPJ**, e **nada é gravado** — confira que a lista de fábricas não ganhou linha. Clicar no link apaga o campo. **Não salve depois disso**: feche o modal.
  2. **Novo Negócio → Fabricante → "Novo fabricante"**, mesmo CNPJ: a mesma recusa. Feche sem salvar.
  3. **Clientes → Nova empresa**, tipo **loja**, CNPJ `98765432000198`, sair do campo. Esperado: o aviso "A Receita ainda não tem este CNPJ. Empresa aberta há pouco tempo pode levar semanas para aparecer — o cadastro segue com o número." em âmbar, e o botão **Próximo** continua avançando. Pare no passo 2; não salve.
  4. **Clientes → Nova empresa**, tipo **pessoa física**, CPF `529.982.247-25`. Esperado: o rótulo diz "CPF ou CNPJ", a máscara é de CPF, aparece o sinal verde, e o **Próximo** avança. Não salve.
  5. **Clientes → Nova empresa**, CNPJ `11.222.333/0001-8` (13 dígitos), sair do campo. Esperado: "CPF tem 11 dígitos e CNPJ tem 14." e o **Próximo** não avança.
  6. **Abrir um cliente que tem dois números no telefone → Editar.** Esperado: dois campos de telefone, cada um formatado, e "+ outro telefone" abaixo. Feche **sem salvar**.
  7. **Abrir um cliente com documento fora do formato** (13 dígitos) **→ Editar**, sair do campo de documento sem mexer. Esperado: nenhuma mensagem de erro no campo. Feche sem salvar.
  8. **Obras → Nova obra**, CNPJ da SPE `98765432000198`. Esperado: o aviso âmbar (Obras só avisa) e o formulário continua salvável. Feche sem salvar.
  9. Console do navegador: sem erro novo em nenhum dos passos.

  Para os passos 6 e 7, ache os cadastros medindo no banco com consulta de **leitura**, e relate na conversa só o **nome da tela e o que se viu** — nunca copie nome, telefone ou documento de cliente para arquivo (CLAUDE.md §6.9).

- [ ] **Step 3: Relatório** — liste para o Lucas, em linguagem de tela: o que cada ensaio mostrou, com captura dos passos 1, 3 e 6; o total de testes; e a contagem por arquivo de tipos e lint contra a linha de base. **Não publique.** Publicar é decisão do Lucas, pelo procedimento da área separada (memória `dois-chats-mesma-pasta-git`): só os commits deste plano.

---

## Fora deste plano — anotado para o Lucas decidir

| O quê | Por que não entra aqui |
|---|---|
| **Os 325 clientes com documento fora do formato** (242 com 13 dígitos, 67 com 10 — cara de zero à esquerda comido pelo Excel na importação) | Consertar é **escrita em dado de produção**: pede medir, mostrar a lista, ensaiar e ter rota de volta, com o "pode" do Lucas. O plano só garante que eles continuam editáveis |
| Apagar o telefone inteiro na edição não apaga no banco (`telefone || undefined`) | Defeito antigo, igual ao do CNPJ; o plano consertou só o do CNPJ, porque "cadastrar sem CNPJ" dependia dele. Merece tarefa própria, telefone por telefone de tela |
| Reescrever os 3.759 telefones gravados no formato novo | Decisão 7 do desenho: ganham o formato quando alguém edita |
| A variável `isConstrutora` morta no `NovoNegocioDialog` | Não tem efeito nenhum (desenho §5) |
| Segundo provedor de CNPJ para quando o BrasilAPI cair | Com serviço fora não travando nada, não é necessário agora (desenho §5) |

