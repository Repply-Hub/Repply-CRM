# Plano B — A voz da tela e do e-mail

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa.

**Objetivo:** a tela "Hoje" e o e-mail das 7h param de dizer sempre "N coisas esperam você" e
passam a dizer o que está acontecendo naquele dia — numa escada de seis degraus, decidida por uma
função só que alimenta as duas pontas.

**Arquitetura:** uma função pura recebe os itens da pauta e devolve `{ manchete, apoio, assunto }`.
A tela e o e-mail rodam em mundos diferentes — a tela é Vite/React, o e-mail é uma função Deno que
**não importa de `src/`** —, então a função existe em **duas cópias**, e um teste só prende as duas
ao mesmo contrato. É o padrão que o projeto já usa para o telefone do WhatsApp (CLAUDE.md §7.1).

**Pilha:** TypeScript puro (sem dependência) · Vitest · Deno (função de borda).

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e commit (CLAUDE.md §5).
- **Linha de base:** `npx tsc --noEmit -p tsconfig.app.json` → **31** (o `-p` é obrigatório);
  `npm run test` → **1140+** verdes; `npm run build` compila; `eslint` sem erro novo.
- 🔴 **Dinheiro se formata com `formatarMoedaBRL`** de `src/lib/moeda.ts`, nunca à mão e nunca com
  `parseFloat` (CLAUDE.md §7.10). Na cópia Deno, use `Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'})`, que é o que a função de borda já faz (`BRL.format`).
- 🔴 **Data em texto não passa por `new Date(...)`** para ser formatada: `new Date("2026-09-15")`
  no horário de Brasília devolve 14/09 (CLAUDE.md §7.12).
- 🔴 **Publicar a função de borda é OUTRO gesto** (CLAUDE.md §16): `git push` publica o site, não
  a função. Este plano **não publica** nada — nem site, nem função. Quem publica é o controlador.
- **Git:** `git status --short` num comando separado; outra sessão usa esta pasta. Nunca
  `git add -A`. `git commit -m "<msg>" --only -- <caminhos>`. Termine com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Sem `git push`.

## O que existe hoje (medido em 09/09/2026 — não re-descubra)

| Onde | Arquivo e linha | O que diz |
|---|---|---|
| Manchete da tela | `src/pages/Hoje.tsx:186-194` | `N coisas esperam você` + `R$ X em jogo` |
| Estado vazio da tela | `src/pages/Hoje.tsx:170-182` | `Pauta zerada` + parágrafo |
| Manchete do e-mail | `supabase/functions/pauta-resumo-diario/index.ts:138` | `N coisas esperam você` |
| Valor do e-mail | mesmo arquivo, linha 140 | `R$ X em jogo` |
| Assunto do e-mail | mesmo arquivo, linhas 224-225 | `N coisas esperam você hoje` |

**Medição que decide a regra do degrau 3:** os 150 negócios abertos da MD estão parados entre
**0 e 7 dias**, média 6,4, **nenhum acima de 30** — resíduo da migração do Bitrix, que carimbou
todo mundo em 01/09/2026. Um limite fixo ("40 dias") nunca dispararia hoje e, semanas depois,
dispararia para todo mundo ao mesmo tempo. Por isso o degrau 3 é **relativo à própria fila**.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/voz-da-pauta.ts` **(novo)** | A escada de seis degraus. Função pura, sem import |
| `supabase/functions/_shared/voz-da-pauta.ts` **(novo)** | A cópia que o e-mail usa |
| `src/lib/voz-da-pauta.test.ts` **(novo)** | Os seis degraus **e** a prova de que as duas cópias concordam |
| `src/pages/Hoje.tsx` | Passa a mostrar a voz |
| `supabase/functions/pauta-resumo-diario/index.ts` | Passa a usar a voz na manchete e no assunto |

---

## Tarefa 1: a escada, com teste

**Arquivos:**
- Criar: `src/lib/voz-da-pauta.ts`
- Criar: `src/lib/voz-da-pauta.test.ts`

**Interfaces:**
- Produz:
  ```ts
  export type ItemParaVoz = {
    tipo: string;                 // 'compromisso' | 'negocio_parado'
    titulo: string;
    valor: number | null;
    dias_parado: number | null;
  };
  export type VozDaPauta = {
    manchete: string;             // a frase grande
    apoio: string | null;         // a linha de baixo, quando houver
    assunto: string;              // o assunto do e-mail
  };
  export function vozDaPauta(itens: ItemParaVoz[], diasParadoDaEmpresa: number): VozDaPauta;
  ```

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/voz-da-pauta.test.ts`. Um caso por degrau, mais as bordas que enganam:

```ts
import { describe, it, expect } from 'vitest';
import { vozDaPauta, type ItemParaVoz } from './voz-da-pauta';

const compromisso = (titulo: string): ItemParaVoz =>
  ({ tipo: 'compromisso', titulo, valor: null, dias_parado: null });
const negocio = (titulo: string, valor: number, dias: number): ItemParaVoz =>
  ({ tipo: 'negocio_parado', titulo, valor, dias_parado: dias });

describe('vozDaPauta', () => {
  it('degrau 1 — fila vazia', () => {
    expect(vozDaPauta([], 3).manchete).toBe('Nada parado. Seu dia está seu.');
  });

  it('degrau 2 — só compromissos', () => {
    const v = vozDaPauta([compromisso('Reunião'), compromisso('Visita')], 3);
    expect(v.manchete).toBe('2 compromissos hoje');
    expect(v.apoio).toBeNull();
  });

  it('degrau 2 — um compromisso só, no singular', () => {
    expect(vozDaPauta([compromisso('Reunião')], 3).manchete).toBe('1 compromisso hoje');
  });

  it('degrau 3 — um negócio destoa dos outros', () => {
    const v = vozDaPauta([
      negocio('Obra Exemplo', 180000, 40),
      negocio('Outro', 10000, 8),
    ], 3);
    expect(v.manchete).toBe('Um negócio seu está há 40 dias sem mexer');
    expect(v.apoio).toBe('R$ 180.000,00 · Obra Exemplo');
  });

  it('degrau 3 NÃO casa quando o primeiro não é o dobro do segundo', () => {
    const v = vozDaPauta([negocio('A', 100, 12), negocio('B', 50, 10)], 3);
    expect(v.manchete).toBe('R$ 150,00 parados em 2 negócios');
  });

  it('degrau 3 NÃO casa com um negócio só — não há segundo colocado', () => {
    const v = vozDaPauta([negocio('A', 100, 90)], 3);
    expect(v.manchete).toBe('R$ 100,00 parados em 1 negócio');
  });

  it('degrau 3 NÃO casa abaixo do ajuste da empresa', () => {
    // 4 é o dobro de 2, mas a empresa só considera parado a partir de 10 dias.
    const v = vozDaPauta([negocio('A', 100, 4), negocio('B', 50, 2)], 10);
    expect(v.manchete).toBe('R$ 150,00 parados em 2 negócios');
  });

  it('degrau 3 ignora compromissos ao eleger primeiro e segundo', () => {
    const v = vozDaPauta([
      compromisso('Reunião'),
      negocio('Obra Exemplo', 180000, 40),
      negocio('Outro', 10000, 8),
    ], 3);
    expect(v.manchete).toBe('Um negócio seu está há 40 dias sem mexer');
  });

  it('degrau 4 — compromissos e negócios', () => {
    const v = vozDaPauta([
      compromisso('Reunião'),
      negocio('A', 100, 5), negocio('B', 90, 5),
    ], 3);
    expect(v.manchete).toBe('1 compromisso e 2 negócios hoje');
  });

  it('degrau 5 — só negócios, com valor', () => {
    const v = vozDaPauta([negocio('A', 300000, 5), negocio('B', 182900, 5)], 3);
    expect(v.manchete).toBe('R$ 482.900,00 parados em 2 negócios');
  });

  it('degrau 6 — só negócios, sem valor somado', () => {
    const v = vozDaPauta([negocio('A', 0, 5), negocio('B', null, 5)], 3);
    expect(v.manchete).toBe('2 negócios parados');
  });

  it('o assunto do e-mail nunca vem vazio', () => {
    for (const itens of [[], [compromisso('R')], [negocio('A', 100, 5)]]) {
      expect(vozDaPauta(itens, 3).assunto.trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/lib/voz-da-pauta.test.ts
```
Esperado: FALHA — `Failed to resolve import "./voz-da-pauta"`.

- [ ] **Passo 3: escrever a escada**

Crie `src/lib/voz-da-pauta.ts`. **Sem import nenhum** — é o que permite a cópia Deno ser idêntica.

```ts
/**
 * O que a tela "Hoje" e o e-mail das 7h dizem, conforme o dia.
 *
 * Por que não uma frase fixa: esta frase chega TODO DIA ÚTIL. O que impressiona na segunda é
 * papel de parede na terceira semana. O impacto vem da concretude — números que mudam sozinhos —
 * e não do adjetivo, que também brigaria com o tom do produto (CLAUDE.md §8: sóbrio e técnico,
 * sem linguagem de varejo).
 *
 * Uma função só, duas pontas: a tela e o e-mail leem daqui. Se cada um montasse a própria frase,
 * eles divergiriam — é como o projeto já se machucou antes (CLAUDE.md §7.14).
 *
 * 🔴 ESTE ARQUIVO TEM UMA CÓPIA em `supabase/functions/_shared/voz-da-pauta.ts`, porque a função
 * de borda roda em Deno e não importa de `src/`. As duas são presas ao mesmo contrato por
 * `src/lib/voz-da-pauta.test.ts`. Mudou aqui, mude lá.
 */
export type ItemParaVoz = {
  tipo: string;
  titulo: string;
  valor: number | null;
  dias_parado: number | null;
};

export type VozDaPauta = {
  manchete: string;
  apoio: string | null;
  assunto: string;
};

const dinheiro = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export function vozDaPauta(itens: ItemParaVoz[], diasParadoDaEmpresa: number): VozDaPauta {
  const negocios = itens.filter((i) => i.tipo !== 'compromisso');
  const compromissos = itens.length - negocios.length;
  const valor = negocios.reduce((s, i) => s + (Number(i.valor) || 0), 0);

  // Degrau 1 — o vazio COMEMORA. É o dia em que a pessoa terminou, e é o que faz ela abrir a
  // tela amanhã.
  if (itens.length === 0) {
    return {
      manchete: 'Nada parado. Seu dia está seu.',
      apoio: null,
      assunto: 'Seu dia está livre',
    };
  }

  // Degrau 2
  if (negocios.length === 0) {
    const frase = `${plural(compromissos, 'compromisso', 'compromissos')} hoje`;
    return { manchete: frase, apoio: null, assunto: frase };
  }

  // Degrau 3 — um negócio destoa. A régua é RELATIVA à própria fila, não um número fixo:
  // medido em 09/09/2026, os 150 negócios abertos da MD estão parados entre 0 e 7 dias e nenhum
  // acima de 30 (a migração do Bitrix carimbou todos em 01/09). Um limite fixo nunca dispararia
  // hoje e, semanas depois, dispararia para todo mundo de uma vez.
  //
  // "Primeiro" e "segundo" são entre os NEGÓCIOS — compromisso não tem dias parado. Com um
  // negócio só não há segundo colocado, e o degrau não casa.
  const porParado = [...negocios].sort(
    (a, b) => (Number(b.dias_parado) || 0) - (Number(a.dias_parado) || 0),
  );
  const primeiro = Number(porParado[0]?.dias_parado) || 0;
  const segundo = Number(porParado[1]?.dias_parado) || 0;
  if (porParado.length >= 2 && primeiro >= diasParadoDaEmpresa && primeiro >= segundo * 2) {
    const alvo = porParado[0];
    const valorDoAlvo = Number(alvo.valor) || 0;
    return {
      manchete: `Um negócio seu está há ${primeiro} dias sem mexer`,
      apoio: valorDoAlvo > 0 ? `${dinheiro(valorDoAlvo)} · ${alvo.titulo}` : alvo.titulo,
      assunto: `Um negócio seu está há ${primeiro} dias sem mexer`,
    };
  }

  // Degrau 4
  if (compromissos > 0) {
    const frase = `${plural(compromissos, 'compromisso', 'compromissos')} e ${plural(negocios.length, 'negócio', 'negócios')} hoje`;
    return { manchete: frase, apoio: null, assunto: frase };
  }

  // Degrau 5
  if (valor > 0) {
    const frase = `${dinheiro(valor)} parados em ${plural(negocios.length, 'negócio', 'negócios')}`;
    return { manchete: frase, apoio: null, assunto: `${dinheiro(valor)} esperando você hoje` };
  }

  // Degrau 6 — negócio sem valor preenchido existe nesta base e não pode virar "R$ 0,00 parados".
  const frase = `${plural(negocios.length, 'negócio', 'negócios')} parados`;
  return { manchete: frase, apoio: null, assunto: `${frase} hoje` };
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/lib/voz-da-pauta.test.ts
```
Esperado: **12 passed**.

- [ ] **Passo 5: a cópia Deno, presa pelo mesmo teste**

Copie o arquivo para `supabase/functions/_shared/voz-da-pauta.ts`, **sem mudar uma vírgula** — ele
não tem import, então roda igual nos dois mundos.

Acrescente ao fim de `src/lib/voz-da-pauta.test.ts` o bloco que prende as duas:

```ts
import { vozDaPauta as vozDoEmail } from '../../supabase/functions/_shared/voz-da-pauta';

describe('as duas cópias dizem a mesma coisa', () => {
  // A função de borda roda em Deno e não importa de `src/`, então a regra existe duas vezes.
  // Se divergirem, a tela e o e-mail contam histórias diferentes do mesmo dia — que é
  // exatamente o tipo de erro que ninguém percebe olhando uma tela só.
  const casos: ItemParaVoz[][] = [
    [],
    [compromisso('Reunião')],
    [negocio('A', 180000, 40), negocio('B', 10000, 8)],
    [compromisso('R'), negocio('A', 100, 5), negocio('B', 90, 5)],
    [negocio('A', 300000, 5), negocio('B', 182900, 5)],
    [negocio('A', 0, 5)],
  ];
  it.each(casos.map((c, i) => [i, c] as const))('caso %i', (_i, itens) => {
    expect(vozDoEmail(itens, 3)).toEqual(vozDaPauta(itens, 3));
  });
});
```

⚠️ Se o Vitest recusar o import de fora de `src/`, confira `vitest.config.ts` / `vite.config.ts`:
o `include` de testes e o `server.fs.allow` podem precisar da pasta `supabase`. **Não mova o
arquivo para dentro de `src/` para contornar** — a função de borda precisa dele onde está.

- [ ] **Passo 6: rodar tudo e commitar**

```bash
npx vitest run src/lib/voz-da-pauta.test.ts
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
git status --short
git add src/lib/voz-da-pauta.ts src/lib/voz-da-pauta.test.ts supabase/functions/_shared/voz-da-pauta.ts
git commit -m "feat(pauta): a voz da tela e do e-mail vira uma escada de seis degraus

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 2: a tela fala

**Arquivos:**
- Modificar: `src/pages/Hoje.tsx` (linhas 170-182 e 186-194)

**Interfaces:**
- Consome: `vozDaPauta(itens, diasParadoDaEmpresa)` (Tarefa 1).

- [ ] **Passo 1: de onde vem `diasParadoDaEmpresa`**

É o ajuste `pauta_dias_parado` de `configuracoes_automacao` — o mesmo que a fila usa, padrão **3**
quando a empresa nunca salvou (a MD nunca salvou). Procure em `src/hooks/` o hook que já lê a
configuração de automação; se **não** houver um que devolva esse número no navegador, **use 3
como constante e deixe um comentário dizendo que é o mesmo padrão do banco** — buscar
configuração só para escolher uma frase é consulta a mais numa tela que já faz duas.

- [ ] **Passo 2: substituir a manchete**

Troque o `h2` das linhas 186-189 e o parágrafo do valor (190-194) por:

```tsx
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-card-foreground sm:text-[34px]">
                {voz.manchete}
                <span className="text-primary">.</span>
              </h2>
              {voz.apoio && (
                <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
                  {voz.apoio}
                </p>
              )}
```

- [ ] **Passo 3: o estado vazio usa o degrau 1**

O bloco das linhas 170-182 já é o degrau 1 com outras palavras. Troque o `h2` "Pauta zerada" por
`{voz.manchete}` e **mantenha** o sol, o círculo e o parágrafo explicativo — o comentário de lá
diz que *"o vazio COMEMORA"*, e é uma decisão de produto, não enfeite.

- [ ] **Passo 4: provar no navegador**

Com `preview_start`. Não peça ao Lucas para conferir à mão. Como não dá para forjar os seis
estados com dados reais, prove os que existem e **cite o teste** para o resto:

1. Entrar com um usuário que tem negócios na fila → a manchete traz o valor somado.
2. Entrar com um usuário de fila vazia → *"Nada parado. Seu dia está seu."*
3. `read_console_messages` → sem erro.

- [ ] **Passo 5: verificar e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
git status --short
git commit -m "feat(hoje): a tela diz o que esta acontecendo, em vez de contar coisas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/pages/Hoje.tsx
```

---

## Tarefa 3: o e-mail fala

**Arquivos:**
- Modificar: `supabase/functions/pauta-resumo-diario/index.ts` (linhas ~134-141 e ~224-225)

**Interfaces:**
- Consome: `vozDaPauta` de `../_shared/voz-da-pauta.ts` (Tarefa 1).

- [ ] **Passo 1: a manchete e o valor**

Importe a cópia e troque as duas substituições:

```ts
import { vozDaPauta } from "../_shared/voz-da-pauta.ts";
// …
  const voz = vozDaPauta(itens, 3);
  return MODELO_RESUMO
    .replaceAll("{{PAUTA_NOME}}", esc(nome.trim().split(/\s+/)[0] ?? ""))
    .replaceAll("{{PAUTA_MANCHETE}}", esc(voz.manchete))
    .replaceAll("{{PAUTA_VALOR}}", esc(voz.apoio ?? ""))
    .replaceAll("{{PAUTA_ITENS}}", montarItens(itens))
    .replaceAll("{{PAUTA_LINK}}", link);
```

⚠️ **O import em Deno leva a extensão `.ts`** — sem ela a função nem sobe. E `esc()` continua
obrigatório: a manchete carrega nome de negócio, que vem do banco e pode ter `<` ou `&`.

⚠️ **`{{PAUTA_VALOR}}` some quando `apoio` é nulo.** Confira no modelo HTML que a linha vazia não
deixa um espaço em branco esquisito — se deixar, envolva-a numa condição no modelo.

- [ ] **Passo 2: o assunto**

Troque as linhas 224-225 por `const assunto = vozDaPauta(itens, 3).assunto;`.

- [ ] **Passo 3: provar sem mandar e-mail para ninguém**

🔴 **Não dispare o envio real.** Rode a montagem do corpo com dados de mentira e confira o texto
— por exemplo com `deno eval` ou um teste que importe `montarCorpo`. Se a função não expuser
`montarCorpo`, prove pela cópia compartilhada: `vozDaPauta` é a mesma nas duas pontas e já está
testada na Tarefa 1; diga isso no relatório em vez de inventar uma prova que não existe.

- [ ] **Passo 4: commitar — e AVISAR que falta publicar**

```bash
git status --short
git commit -m "feat(pauta): o e-mail das 7h passa a dizer o que esta acontecendo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/functions/pauta-resumo-diario/index.ts
```

🔴 **Commitar NÃO publica a função** (CLAUDE.md §16). O site sobe pelo `git push`; a função de
borda é outro gesto, do controlador:

```
npx supabase functions deploy pauta-resumo-diario --project-ref hukeirrmsoiowvvrhivx
```

Escreva no relatório, em destaque, que a função **está commitada e NÃO publicada**, e que o
e-mail das 7h só muda depois desse comando. Código e produção divergindo em silêncio já aconteceu
neste projeto: o resumo diário rodou cinco versões publicadas enquanto o repositório tinha só a
primeira.

---

## Tarefa 4: o e-mail de quem não tem negócio próprio vira o pulso da equipe

**Decisão do dono do produto em 09/09/2026**, tomada com a medição na mesa.

**O problema, medido em produção.** Depois que a fila voltou a ser pessoal (Plano C, Tarefa 1),
quem tem a chave `pauta_de_todos` **e nenhum negócio próprio** fica com a pauta vazia — e
`pauta-resumo-diario` **pula** quem tem pauta vazia, registrando `status: ok`. O e-mail some em
silêncio.

Em `automation_logs`: a execução de 09/09/2026 mandou **10 e-mails com 3 pautas vazias**; a de
07/09, antes de a pauta ampliada entrar, mandou **7 com 6 vazias**. Depois do Plano C a conta
volta para 7/6 — e **três gestoras da MD param de receber**, uma delas a Carla, que é a
principal usuária do cliente-âncora.

**A decisão:** em vez de sumir, o e-mail **muda de assunto**. Quem tem a chave e está sem negócio
próprio recebe o **pulso da equipe**:

```
ASSUNTO:  145 negócios da equipe pedem atenção

  Bom dia, Carla

  R$ 7.402.422 parados
  em 145 negócios da equipe

  • Obra Exemplo | Fabricante Exemplo
    Ana Souza · R$ 180.000 · parado há 40 dias
  • Jampa Ocean Palace | Deca
    Pricila Azevedo · R$ 198.000 · parado há 32 dias

  [Ver a tabela do time]
```

**Arquivos:**
- Modificar: `supabase/functions/pauta-resumo-diario/index.ts`

**Interfaces:**
- Consome: `negocios_em_risco(...)` (Plano C, Tarefa 2) e `ve_pauta_de_todos(uuid)`.

- [ ] **Passo 1: decidir quem recebe qual e-mail, no servidor**

A regra tem **duas** condições, e as duas importam: a pessoa tem a chave **e** a pauta dela veio
vazia. Quem tem a chave e **tem** negócio próprio continua recebendo a fila pessoal — não troque
o e-mail de quem já tinha um útil.

Leia a chave com `ve_pauta_de_todos(p_usuario_id)`, que já existe no banco desde 08/09/2026 e é a
**mesma** leitura que a tela usa. Não escreva uma terceira.

- [ ] **Passo 2: montar o corpo do pulso**

Os itens vêm de `negocios_em_risco`, limitados aos **5 maiores** — e-mail não é tabela. Cada linha
traz nome do negócio, **nome do dono**, valor e dias parado.

🔴 **`esc()` em tudo que vem do banco**, como o arquivo já faz: nome de negócio e de cliente podem
ter `<` ou `&`.

🔴 A função de borda roda em **Deno** e chama o banco com `service_role`, que **pula a RLS**. Então
o recorte por empresa e por permissão tem que ser explícito na chamada — `negocios_em_risco` usa
`eu_vejo_pauta_de_todos()`, que depende de `auth.uid()` e **não funciona** com `service_role`.
**Confira isso antes de escrever** e, se for o caso, peça ao Plano C uma variante que receba o
identificador da pessoa, como `pauta_do_dia_de` faz. **Não improvise um filtro por empresa no
Deno** — é o tipo de corte que envelhece errado.

- [ ] **Passo 3: o link**

O botão leva à tela "Hoje", onde a tabela do time está. Use o mesmo endereço que o e-mail já usa.

- [ ] **Passo 4: provar sem mandar e-mail para ninguém**

Monte o corpo com dados de mentira e confira o texto. 🔴 **Não dispare o envio real** — há gente
de verdade do outro lado.

Confira também o caso de borda: quem tem a chave, pauta vazia **e** a equipe sem nada em risco.
O e-mail não pode dizer "0 negócios da equipe pedem atenção" — nesse dia ele volta a ser o
degrau 1 da escada ("Nada parado. Seu dia está seu."), ou não sai. **Decida e escreva o porquê.**

- [ ] **Passo 5: commitar — e AVISAR que falta publicar**

🔴 Commitar **não** publica a função (CLAUDE.md §16). O site sobe pelo `git push`; a função de
borda é outro gesto, do controlador:

```
npx supabase functions deploy pauta-resumo-diario --project-ref hukeirrmsoiowvvrhivx
```

Escreva no relatório, em destaque, que a função está **commitada e NÃO publicada**.

---

## Como se prova que o plano B funcionou

| | Prova |
|---|---|
| Os seis degraus | `src/lib/voz-da-pauta.test.ts` passa, com um caso por degrau e as bordas |
| As duas cópias concordam | O bloco "as duas cópias dizem a mesma coisa" passa nos seis casos |
| O degrau 3 é relativo | Os três casos negativos passam: sem segundo colocado, abaixo do dobro, abaixo do ajuste da empresa |
| A tela fala | Fila com negócios mostra o valor somado; fila vazia mostra o degrau 1 e mantém o sol |
| O e-mail fala | Assunto e manchete saem da mesma função |
| O gestor sem negócio próprio volta a receber | Com a chave e a pauta vazia, o corpo montado é o pulso da equipe, com os 5 maiores e o nome de cada dono — e quem tem a chave **e** negócio próprio continua recebendo a fila pessoal |
| Nada quebrou | tsc **31**, testes verdes, build limpo |

## O que este plano NÃO faz

- Não muda a lista de itens do e-mail nem o modelo HTML — só a manchete, a linha de apoio e o
  assunto.
- Não publica: nem o site (`git push`), nem a função de borda.
- Não mexe na fila, na tabela nem na tarefa automática — são os planos C e D.
