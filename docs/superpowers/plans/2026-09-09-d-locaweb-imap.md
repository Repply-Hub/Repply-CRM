# Bloco D — Conectar caixa de hospedagem própria (Locaweb da JHS)

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam caixinha (`- [ ]`) para acompanhamento.

**Objetivo:** permitir que uma empresa com e-mail em hospedagem comum (Locaweb, cPanel, UOL Host) conecte a caixa ao Repply, informando servidor e senha.

**Arquitetura:** o fluxo hospedado de OAuth continua sendo o caminho de Gmail e Outlook. Caixa por servidor próprio ganha um caminho paralelo: um formulário no CRM, uma Edge Function nova (`email-conectar-imap`) que fala com a autenticação direta da Nylas, e daí em diante **exatamente o mesmo código** que o callback do OAuth já usa para gravar conta, grant, pastas e acesso — sincronização, envio e marcadores não sabem a diferença.

**Tecnologias:** Supabase Edge Functions (Deno), Nylas v3, React + shadcn.

**Spec:** `docs/superpowers/specs/2026-09-09-email-e-whatsapp-design.md`

## Restrições globais

- 🔴 **Nunca `git add -A`** (CLAUDE.md §13). Use `git commit --only -m "…" -- <caminhos>`.
- 🔴 **Antes de CADA commit:** `git fetch origin` e `git status --short`. As sessões não compartilham o mesmo ponteiro — outra pode ter enviado sem que o seu HEAD ande (CLAUDE.md §13). Arquivo que não é seu na fila: pare e avise.
- 🔴 **`git push` PUBLICA em produção** (CLAUDE.md §16).
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **A senha da caixa NUNCA é gravada no nosso banco, nunca vai para log e nunca entra em mensagem de erro.** Ela atravessa a Edge Function e vai para a Nylas. Isso não é preferência: é o que foi prometido ao dono do produto ao aprovar este caminho.
- Só `admin`, `empresa` e `gestor` conectam caixa — a mesma lista de `PAPEIS_QUE_CONECTAM` em `email-conectar/index.ts:13`.
- Continua valendo **uma caixa por empresa** (a checagem existe em dois lugares hoje: `email-conectar/index.ts:78` e `email-callback/index.ts:122`).
- Texto visível ao usuário em **pt-BR**, sem jargão.

## O que já se sabe, medido em 09/09/2026

A JHS (`empresa_id = 9ad7723e-a9ba-4608-b961-72b9bdeabcbe`) tentou **quatro vezes**:

| hora | provedor | resultado |
|---|---|---|
| 12:29:33 | imap | `email-conectar` respondeu 200, URL gerada |
| 12:30:50 | microsoft | idem |
| 12:31:10 | google | idem |
| 12:31:43 | imap | idem |

**Nenhuma** gerou uma única linha de `email-callback` no log, e não existe linha em `email_contas` para a empresa. Ou seja: as quatro pessoas foram para a tela da Nylas e **não voltaram**. O defeito não está no nosso retorno nem na gravação — está em mandar uma caixa de hospedagem comum para um fluxo hospedado de OAuth.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `docs/superpowers/notas/2026-09-10-nylas-imap.md` (criar) | o que a Nylas respondeu na Tarefa 1 — a prova, não a suposição |
| `supabase/functions/_shared/nylas.ts` (modificar) | ganha `conectarPorSenha()` e a extração de `gravarConexao()` |
| `supabase/functions/email-conectar-imap/index.ts` (criar) | recebe o formulário, chama a Nylas, grava |
| `supabase/functions/email-callback/index.ts` (modificar) | passa a usar `gravarConexao()` — mesmo código, um dono só |
| `src/components/email/ConectarPorSenhaDialog.tsx` (criar) | o formulário |
| `src/components/email/ConectarEmailCard.tsx:27` (modificar) | o botão de IMAP abre o formulário em vez do fluxo hospedado |
| `src/lib/servidores-conhecidos.ts` (criar) | preenche servidor/porta pelo domínio do e-mail |
| `src/lib/servidores-conhecidos.test.ts` (criar) | testes |

---

### Tarefa 1: provar o contrato da Nylas — **portão do bloco**

**Arquivos:**
- Criar: `docs/superpowers/notas/2026-09-10-nylas-imap.md`

**Interfaces:**
- Consome: nada.
- Produz: o formato exato da chamada, que as Tarefas 2 a 5 usam.

🔴 **Nada mais deste plano começa antes desta tarefa terminar.** O que está provado é que o caminho atual não funciona; **não** está provado qual é o caminho certo. Se esta tarefa derrubar a hipótese, o plano volta para a mesa do dono do produto antes de qualquer código.

- [ ] **Passo 1: ler a documentação da Nylas sobre autenticação direta**

Procure, na documentação v3 da Nylas, a criação de grant sem OAuth — o termo usado é *custom authentication* / *native authentication*. Responda por escrito, com a fonte:

1. Qual é o endpoint exato (esperado: `POST /v3/connect/custom`).
2. Qual é o corpo — em especial o nome do bloco de configurações e de cada campo (servidor de entrada, porta, servidor de saída, porta, usuário, senha).
3. Se o provedor `imap` precisa estar habilitado como *connector* na aplicação Nylas antes de aceitar grant. **Este é o ponto mais provável de bloqueio**, e é administrativo, não de código.
4. O que a resposta devolve — precisamos de `grant_id` e do endereço de e-mail, que é o que `email-callback` usa hoje (`dadosTroca.grant_id`, `dadosTroca.email`).
5. Que erros ela devolve para senha errada, servidor errado e porta errada.

- [ ] **Passo 2: testar de verdade contra a Nylas**

Não confie só na documentação. Faça uma chamada real, usando o segredo que as functions já usam.

```bash
# O segredo vive nas variáveis da Edge Function. Puxe o valor com:
npx supabase secrets list --project-ref hukeirrmsoiowvvrhivx
```

🔴 **Nunca imprima o valor do segredo na conversa nem em log.**

Rode a chamada com uma caixa de teste sua, **não** com a da JHS — a senha deles não deve passar pelas suas mãos em momento nenhum. Registre o código de retorno e o corpo da resposta.

- [ ] **Passo 3: escrever a nota**

Crie `docs/superpowers/notas/2026-09-10-nylas-imap.md` com: o endpoint, o corpo exato, se o connector precisou ser habilitado, o que voltou no sucesso e nos três erros, e a data do teste. É esta nota que as tarefas seguintes citam.

- [ ] **Passo 4: decidir**

- **Funcionou** → siga para a Tarefa 2.
- **Precisa habilitar o connector no painel da Nylas** → é ação do dono do produto na conta dele. Peça, e só depois siga.
- **Não existe caminho** → **pare**. Leve ao dono do produto: a opção que sobra é a JHS migrar para Google Workspace ou Microsoft 365, que era a segunda alternativa que ele já tinha visto ao aprovar este bloco.

- [ ] **Passo 5: commitar a nota**

```bash
git commit --only -m "docs(email): o que a Nylas respondeu sobre conectar caixa por servidor e senha

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- docs/superpowers/notas/2026-09-10-nylas-imap.md
```

---

### Tarefa 2: um dono só para "gravar a conexão"

**Arquivos:**
- Modificar: `supabase/functions/_shared/nylas.ts`
- Modificar: `supabase/functions/email-callback/index.ts:108-240`

**Interfaces:**
- Consome: `buscarPastas`, `pastasDeSistema`, `gravarPastas`, `chamarNylas` — já existem em `_shared/nylas.ts`.
- Produz:

```ts
export type ResultadoDaConexao =
  | { ok: true; contaId: string; pastas: number }
  | { ok: false; motivo: string };

export async function gravarConexao(
  supabase: SupabaseClient,
  dados: {
    empresaId: string;
    usuarioId: string | null;
    grantId: string;
    email: string;
    provedor: string;
  },
): Promise<ResultadoDaConexao>
```

**Por que primeiro:** as ~130 linhas que gravam conta, grant, pastas e acesso vivem hoje dentro do `email-callback`. Copiá-las para a function nova criaria duas cópias de uma lógica cheia de armadilhas já documentadas em comentário (o `upsert` que sobrescrevia a caixa da empresa, o `23505` do grant que significa "caixa de outra empresa", o índice parcial que impede `upsert` no acesso). Duas cópias divergem.

- [ ] **Passo 1: extrair a função**

Mova para `supabase/functions/_shared/nylas.ts`, como `gravarConexao`, o trecho de `email-callback/index.ts` que hoje vai da checagem "uma caixa por empresa" (linha 122) até o `insert` em `email_conta_usuarios` (linha ~232). **Preserve todos os comentários** — eles descrevem defeitos reais já corrigidos.

Cada `return voltar({ conexao: "erro", motivo: "X" })` vira `return { ok: false, motivo: "X" }`. O sucesso vira `return { ok: true, contaId: conta.id, pastas: quantas }`.

- [ ] **Passo 2: o callback passa a chamar**

Em `email-callback/index.ts`, substitua o trecho extraído por:

```ts
    const r = await gravarConexao(supabase, {
      empresaId: estado.empresa_id,
      usuarioId: estado.usuario_id,
      grantId,
      email: emailConta,
      provedor,
    });
    if (!r.ok) return voltar({ conexao: "erro", motivo: r.motivo });
    console.log(
      `[email-callback] conectado empresa=${estado.empresa_id} provedor=${provedor} pastas=${r.pastas}`,
    );
```

- [ ] **Passo 3: conferir que nada mudou de comportamento**

Esta tarefa é refatoração pura: **nenhum comportamento novo**. Releia o diff e confirme que cada `motivo` devolvido tem o mesmo nome de antes (`empresa_ja_tem_caixa`, `caixa_em_uso`, `gravacao_falhou`) — a tela lê esses códigos.

```bash
git diff supabase/functions/email-callback/index.ts | grep -E "^\-" | grep motivo
git diff supabase/functions/_shared/nylas.ts | grep -E "^\+" | grep motivo
```

Esperado: os mesmos três nomes dos dois lados.

- [ ] **Passo 4: publicar e testar que o Gmail continua conectando**

🔴 Peça ao dono do produto antes de publicar.

```bash
npx supabase functions deploy email-callback --project-ref hukeirrmsoiowvvrhivx
```

Teste reconectando a caixa da empresa **Repply** (é a conta de demonstração — é nela que se testa). Confirme que a conexão volta e que as pastas aparecem.

- [ ] **Passo 5: commitar**

```bash
git commit --only -m "refactor(email): gravar a conexao vira funcao compartilhada

Conta, grant, pastas e acesso viviam dentro do email-callback. A conexao por
servidor e senha precisa exatamente do mesmo trecho — e ele tem armadilhas
demais (o upsert que sobrescrevia a caixa, o 23505 do grant, o indice parcial
do acesso) para virar copia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/functions/_shared/nylas.ts supabase/functions/email-callback/index.ts
```

---

### Tarefa 3: os servidores conhecidos

**Arquivos:**
- Criar: `src/lib/servidores-conhecidos.ts`
- Teste: `src/lib/servidores-conhecidos.test.ts`

**Interfaces:**
- Produz: `sugerirServidores(email: string): SugestaoDeServidor | null` com

```ts
export interface SugestaoDeServidor {
  entradaServidor: string;
  entradaPorta: number;
  saidaServidor: string;
  saidaPorta: number;
}
```

**Por quê:** o gestor da JHS não sabe o que é "servidor IMAP". Pedir quatro campos técnicos a quem não os conhece é o mesmo que não oferecer o recurso. Preencher pelo domínio resolve o caso comum e deixa os campos editáveis para o resto.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/servidores-conhecidos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sugerirServidores } from './servidores-conhecidos';

describe('sugerirServidores', () => {
  it('conhece a Locaweb pelo padrão de domínio próprio', () => {
    expect(sugerirServidores('comercial@jhsrepresentacoesltda.com.br')).toEqual({
      entradaServidor: 'imap.jhsrepresentacoesltda.com.br',
      entradaPorta: 993,
      saidaServidor: 'smtp.jhsrepresentacoesltda.com.br',
      saidaPorta: 587,
    });
  });

  it('usa o domínio, não o nome da caixa', () => {
    const s = sugerirServidores('qualquer.coisa@exemplo.com.br');
    expect(s?.entradaServidor).toBe('imap.exemplo.com.br');
  });

  it('devolve nada para endereço inválido', () => {
    expect(sugerirServidores('sem arroba')).toBeNull();
    expect(sugerirServidores('')).toBeNull();
    expect(sugerirServidores('@só.dominio')).toBeNull();
  });

  it('não sugere nada para Gmail e Outlook — esses têm caminho próprio', () => {
    expect(sugerirServidores('alguem@gmail.com')).toBeNull();
    expect(sugerirServidores('alguem@outlook.com')).toBeNull();
    expect(sugerirServidores('alguem@hotmail.com')).toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
npx vitest run src/lib/servidores-conhecidos.test.ts
```

Esperado: FALHA com `Failed to resolve import "./servidores-conhecidos"`.

- [ ] **Passo 3: escrever o módulo**

Crie `src/lib/servidores-conhecidos.ts`:

```ts
/**
 * Chuta servidor e porta a partir do domínio do e-mail.
 *
 * Quem conecta uma caixa de hospedagem é o gestor da empresa, não quem
 * administra o servidor — pedir quatro campos técnicos a quem não os conhece é
 * o mesmo que não oferecer o recurso. O padrão `imap.<domínio>` /
 * `smtp.<domínio>` cobre Locaweb, cPanel e a maioria das hospedagens
 * brasileiras; os campos ficam editáveis para o resto.
 *
 * Portas: 993 é IMAP com TLS, 587 é SMTP com STARTTLS. São o padrão de qualquer
 * hospedagem atual.
 */

export interface SugestaoDeServidor {
  entradaServidor: string;
  entradaPorta: number;
  saidaServidor: string;
  saidaPorta: number;
}

/** Domínios que têm caminho próprio no CRM — sugerir servidor aqui seria errado. */
const TEM_CAMINHO_PROPRIO = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
]);

export function sugerirServidores(email: string): SugestaoDeServidor | null {
  const partes = (email ?? '').trim().toLowerCase().split('@');
  if (partes.length !== 2) return null;
  const [caixa, dominio] = partes;
  if (!caixa || !dominio || !dominio.includes('.')) return null;
  if (TEM_CAMINHO_PROPRIO.has(dominio)) return null;

  return {
    entradaServidor: `imap.${dominio}`,
    entradaPorta: 993,
    saidaServidor: `smtp.${dominio}`,
    saidaPorta: 587,
  };
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/servidores-conhecidos.test.ts
```

Esperado: **4 passando**.

- [ ] **Passo 5: commitar**

```bash
git commit --only -m "feat(email): sugere servidor e porta pelo dominio do endereco

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/servidores-conhecidos.ts src/lib/servidores-conhecidos.test.ts
```

---

### Tarefa 4: a Edge Function que conecta por senha

**Arquivos:**
- Criar: `supabase/functions/email-conectar-imap/index.ts`
- Modificar: `supabase/functions/_shared/nylas.ts` (acrescenta `conectarPorSenha`)

**Interfaces:**
- Consome: `gravarConexao` (Tarefa 2), `chamarNylas` e `nylasBase` (já existem).
- Produz: a rota `POST /email-conectar-imap`, corpo `{ email, senha, entrada_servidor, entrada_porta, saida_servidor, saida_porta, usuario }`, resposta `{ ok: true }` ou `{ error: "<frase em português>" }`.

- [ ] **Passo 1: a chamada à Nylas**

Acrescente a `_shared/nylas.ts`, usando **o formato provado na Tarefa 1** (se divergir do rascunho abaixo, vale a nota, não este texto):

```ts
/**
 * Cria um grant para caixa de servidor próprio, sem OAuth.
 *
 * 🔴 A SENHA passa por aqui e não pode parar em lugar nenhum: não é gravada,
 * não vai para console.log e não entra na mensagem de erro devolvida à tela.
 * O que fica guardado é só o `grant_id`, igual ao caminho do Gmail.
 */
export async function conectarPorSenha(dados: {
  email: string;
  senha: string;
  entradaServidor: string;
  entradaPorta: number;
  saidaServidor: string;
  saidaPorta: number;
  usuario: string;
}): Promise<{ ok: true; grantId: string; email: string } | { ok: false; motivo: string }> {
  const resposta = await chamarNylas("/v3/connect/custom", {
    method: "POST",
    timeoutMs: 30_000,
    body: JSON.stringify({
      provider: "imap",
      settings: {
        imap_host: dados.entradaServidor,
        imap_port: dados.entradaPorta,
        imap_username: dados.usuario || dados.email,
        imap_password: dados.senha,
        smtp_host: dados.saidaServidor,
        smtp_port: dados.saidaPorta,
        smtp_username: dados.usuario || dados.email,
        smtp_password: dados.senha,
      },
    }),
  });

  const texto = await resposta.text();
  if (!resposta.ok) {
    // 🔴 O corpo do erro pode ecoar o que foi enviado. Loga só o status.
    console.error("[nylas] conexão por senha recusada:", resposta.status);
    return { ok: false, motivo: traduzirErroDeConexao(resposta.status, texto) };
  }

  const dadosResposta = JSON.parse(texto)?.data ?? {};
  if (!dadosResposta.grant_id) {
    return { ok: false, motivo: "O provedor não devolveu a conexão. Tente de novo." };
  }
  return { ok: true, grantId: dadosResposta.grant_id, email: dadosResposta.email ?? dados.email };
}

/**
 * O erro cru da Nylas não ajuda quem está com o formulário na frente. Estas são
 * as três coisas que a pessoa realmente erra.
 */
function traduzirErroDeConexao(status: number, corpo: string): string {
  const c = corpo.toLowerCase();
  if (status === 401 || c.includes("authentication") || c.includes("credential")) {
    return "Usuário ou senha recusados pelo servidor. Confira com quem cuida do e-mail da empresa.";
  }
  if (c.includes("host") || c.includes("resolve") || c.includes("dns")) {
    return "Não encontrei o servidor informado. Confira o endereço de entrada e de saída.";
  }
  if (c.includes("timeout") || c.includes("connection") || c.includes("port")) {
    return "O servidor não respondeu nessa porta. Confira as portas (normalmente 993 e 587).";
  }
  return "Não consegui conectar a caixa. Confira os dados com quem cuida do e-mail da empresa.";
}
```

- [ ] **Passo 2: a function**

Crie `supabase/functions/email-conectar-imap/index.ts`. Copie o cabeçalho de autenticação de `email-conectar/index.ts:17-92` — identidade pelo JWT (**nunca** pelo corpo), papel na lista `PAPEIS_QUE_CONECTAM`, e a recusa de uma segunda caixa por empresa. Depois:

```ts
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");
    const entradaServidor = String(body?.entrada_servidor ?? "").trim();
    const saidaServidor = String(body?.saida_servidor ?? "").trim();
    const entradaPorta = Number(body?.entrada_porta ?? 993);
    const saidaPorta = Number(body?.saida_porta ?? 587);
    const usuario = String(body?.usuario ?? "").trim();

    if (!email || !senha || !entradaServidor || !saidaServidor) {
      return json({ error: "Preencha o endereço, a senha e os dois servidores." }, 400);
    }
    if (!Number.isFinite(entradaPorta) || !Number.isFinite(saidaPorta)) {
      return json({ error: "As portas precisam ser números." }, 400);
    }

    const conexao = await conectarPorSenha({
      email, senha, entradaServidor, entradaPorta, saidaServidor, saidaPorta, usuario,
    });
    if (!conexao.ok) return json({ error: conexao.motivo }, 400);

    const gravado = await gravarConexao(supabase, {
      empresaId: caller.empresa_id,
      usuarioId: caller.id,
      grantId: conexao.grantId,
      email: conexao.email,
      provedor: "imap",
    });
    if (!gravado.ok) {
      return json({ error: mensagemDoMotivo(gravado.motivo) }, 400);
    }

    // 🔴 Nada de `senha` neste log, nem no de erro acima.
    console.log(`[email-conectar-imap] conectado empresa=${caller.empresa_id} pastas=${gravado.pastas}`);
    return json({ ok: true });
```

com

```ts
function mensagemDoMotivo(motivo: string): string {
  if (motivo === "empresa_ja_tem_caixa") return "Esta empresa já tem uma caixa conectada. Desconecte a atual primeiro.";
  if (motivo === "caixa_em_uso") return "Esta caixa já está conectada a outra empresa.";
  return "Conectei ao servidor, mas não consegui salvar. Tente de novo.";
}
```

- [ ] **Passo 3: revisar o vazamento de senha antes de publicar**

```bash
grep -n "senha" supabase/functions/email-conectar-imap/index.ts supabase/functions/_shared/nylas.ts
```

Confira, uma a uma, que **nenhuma** ocorrência está dentro de `console.log`, `console.error`, `json({...})` ou de um `insert`/`update`. Esta é a promessa feita ao dono do produto — trate a revisão como parte da tarefa, não como zelo extra.

- [ ] **Passo 4: publicar e testar com uma caixa sua**

🔴 Peça ao dono do produto antes.

```bash
npx supabase functions deploy email-conectar-imap --project-ref hukeirrmsoiowvvrhivx
```

- [ ] **Passo 5: commitar**

```bash
git commit --only -m "feat(email): conectar caixa de servidor proprio por senha

A JHS tentou quatro vezes em 09/09 nos tres provedores e nao voltou de nenhuma:
caixa de hospedagem comum nao passa pelo fluxo hospedado de OAuth. Este caminho
fala direto com a autenticacao da Nylas. A senha atravessa e nao fica.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/functions/email-conectar-imap/index.ts supabase/functions/_shared/nylas.ts
```

---

### Tarefa 5: o formulário

**Arquivos:**
- Criar: `src/components/email/ConectarPorSenhaDialog.tsx`
- Modificar: `src/components/email/ConectarEmailCard.tsx` (linha 27 e o rodapé da linha 208)

**Interfaces:**
- Consome: `sugerirServidores` (Tarefa 3), a rota `email-conectar-imap` (Tarefa 4).
- Produz: nada para outras tarefas.

- [ ] **Passo 1: o diálogo**

Crie `src/components/email/ConectarPorSenhaDialog.tsx`. Campos, nesta ordem: **Endereço de e-mail**, **Senha**, e um bloco recolhido "Configurações do servidor" com servidor/porta de entrada, servidor/porta de saída e "Usuário (se for diferente do e-mail)".

Ao sair do campo de e-mail, preencha o bloco do servidor com `sugerirServidores(email)`. Deixe tudo editável.

O envio chama:

```ts
const { data, error } = await supabase.functions.invoke('email-conectar-imap', {
  body: {
    email, senha,
    entrada_servidor: entradaServidor, entrada_porta: Number(entradaPorta),
    saida_servidor: saidaServidor, saida_porta: Number(saidaPorta),
    usuario,
  },
});
```

Em erro, mostre a frase que veio (`erroLegivelDaFunction`, já usado no projeto). Em sucesso, feche e invalide `['email_conta']`.

🔴 O campo de senha é `type="password"` e `autoComplete="off"`. Não guarde a senha em estado depois do envio: limpe no `finally`.

- [ ] **Passo 2: o aviso, no lugar certo**

Dentro do diálogo, acima do botão de conectar:

```tsx
        <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          Caixa em servidor próprio não tem o "autorizar" do Gmail: o servidor
          exige a senha para deixar o Repply ler e enviar. Ela é entregue ao
          nosso serviço de integração de e-mail e <strong>não fica guardada no
          Repply</strong>. Se preferir não usar senha, o caminho é migrar a caixa
          para o Google Workspace ou o Microsoft 365.
        </p>
```

- [ ] **Passo 3: trocar o destino do botão**

Em `ConectarEmailCard.tsx`, o item `{ id: 'imap', descricao: 'Locaweb, UOL Host, cPanel e outros por servidor e senha' }` (linha 27) hoje chama `conectar('imap')`, que leva ao fluxo hospedado — **o caminho que não funciona**. Faça-o abrir o `ConectarPorSenhaDialog`.

- [ ] **Passo 4: corrigir a promessa do rodapé**

A linha 208 diz hoje, para todos os caminhos:

```tsx
        Você será levado ao provedor para autorizar. O CRM não guarda sua senha.
```

Troque por um texto que só valha onde é verdade:

```tsx
        No Gmail e no Outlook você é levado ao provedor para autorizar, e o CRM
        não vê sua senha. Em caixa de servidor próprio, a senha é necessária —
        explicamos o que acontece com ela na próxima tela.
```

- [ ] **Passo 5: verificar**

```bash
npm run test 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

- [ ] **Passo 6: conferir no navegador**

Abra a tela de conectar com um usuário gestor, escolha o caminho de servidor próprio, digite um endereço e confirme que servidor e portas se preenchem sozinhos. Teste com senha errada de propósito e confirme que aparece a frase em português, e **não** um erro cru.

- [ ] **Passo 7: commitar**

```bash
git commit --only -m "feat(email): formulario para conectar caixa de servidor proprio

Preenche servidor e porta pelo dominio, e diz com todas as letras o que
acontece com a senha — a tela prometia 'o CRM nao guarda sua senha' para todos
os caminhos, inclusive o que precisa dela.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/email/ConectarPorSenhaDialog.tsx src/components/email/ConectarEmailCard.tsx
```

---

### Tarefa 6: conectar a caixa da JHS

- [ ] **Passo 1: avisar o dono do produto que está pronto**

Diga o que a pessoa da JHS vai precisar ter em mãos: o endereço, a senha da caixa, e — se a hospedagem não seguir o padrão `imap.dominio` — os servidores, que quem cuida do site deles sabe informar.

- [ ] **Passo 2: acompanhar a tentativa pelo log**

```bash
npx supabase functions logs email-conectar-imap --project-ref hukeirrmsoiowvvrhivx
```

🔴 A senha deles não passa por você em momento nenhum. Quem digita é a JHS.

- [ ] **Passo 3: confirmar que sincronizou**

```sql
select e.nome, c.email, c.provedor, c.status, c.ultima_sync_em,
       (select count(*) from email_mensagens m where m.conta_id = c.id) as mensagens
from email_contas c join empresas e on e.id = c.empresa_id
where e.id = '9ad7723e-a9ba-4608-b961-72b9bdeabcbe';
```

Esperado: uma linha, `status = 'conectada'`, e mensagens acima de zero depois da primeira sincronização.

---

## Verificação final do bloco

- [ ] A nota da Tarefa 1 existe e diz o que a Nylas respondeu de fato
- [ ] `grep -n "senha"` nas duas functions: nenhuma ocorrência em log, resposta ou gravação
- [ ] Reconectar a caixa da empresa Repply pelo Gmail continua funcionando (a Tarefa 2 mexeu nesse caminho)
- [ ] `npm run test`, `tsc`, `npm run lint` e `npm run build` sem piorar as linhas de base
- [ ] A caixa da JHS conectada e sincronizando
