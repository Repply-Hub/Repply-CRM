# Modelos de e-mail

Estes arquivos são a **fonte da verdade** dos e-mails que o sistema manda. Ficam aqui, no
repositório, para passarem por commit: modelo de e-mail é código, e alguém precisa poder ver
o que mudou e voltar atrás.

## Onde cada um vai

| arquivo | onde colar | variável que ele usa |
|---|---|---|
| `confirmar-cadastro.html` | painel do Supabase → Authentication → Emails → **Confirm signup** | `{{ .ConfirmationURL }}` |
| `redefinir-senha.html` | idem → **Reset password** | `{{ .ConfirmationURL }}` |
| `trocar-email.html` | idem → **Change email address** | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| ~~`resumo-diario.html`~~ | **saiu daqui** em 25/08/2026 — ver a seção seguinte | — |

## Por que a cópia é manual

O `config.toml` do Supabase aceita apontar para arquivos de template, mas isso exige rodar
`supabase config push` — comando que **este projeto nunca usou**. Adotá-lo agora sobrescreveria
configuração de produção feita pelo painel, sem ninguém perceber.

Então: o arquivo aqui manda, a cópia para o painel é manual, e o commit é o registro de quem
mudou o quê. Se um dia o projeto adotar `config push`, este README é o lugar de riscar esta
seção.

## O resumo diário mora dentro da função, não aqui

Quando a função de servidor do resumo passou a existir, o HTML dela veio para dentro:

```
supabase/functions/pauta-resumo-diario/modelo.ts
```

**Uma cópia, não duas.** Manter o `.html` aqui E o mesmo HTML lá seria contrariar o que está
escrito no fim deste arquivo — separados, um dia divergem no estilo, e o e-mail que a equipe
recebe deixa de ser o que alguém revisou. Os três de autenticação continuam aqui porque quem
os consome é o **painel** do Supabase, não código nosso.

O `modelo.ts` é um módulo TypeScript com o HTML dentro de um `String.raw` — continua editável
como HTML, e vai junto no empacotamento da função.

## As duas famílias de variável NÃO se misturam

**`{{ .Algo }}`** (com ponto, espaços dentro das chaves) é do Supabase Auth. Ele substitui na
hora do envio. A lista completa do que existe está na
[documentação de templates](https://supabase.com/docs/guides/auth/auth-email-templates), e
**variável inexistente sai como texto cru no e-mail** — sem erro nenhum.

**`{{PAUTA_ALGO}}`** (maiúsculas, sem ponto, sem espaço) é nossa, só do resumo diário, e é a
própria função de servidor que substitui. O Supabase nunca vê aquele arquivo.

Marcadores do resumo diário:

| marcador | vira |
|---|---|
| `{{PAUTA_NOME}}` | primeiro nome de quem recebe |
| `{{PAUTA_MANCHETE}}` | "5 coisas esperam você" |
| `{{PAUTA_VALOR}}` | "R$ 2.104.300 em jogo" |
| `{{PAUTA_ITENS}}` | os blocos de item, montados em laço |
| `{{PAUTA_LINK}}` | endereço da tela "Hoje" |

## Duas coisas que e-mail não perdoa

**Fonte da marca não funciona.** General Sans e Satoshi vêm de servidor externo, e Gmail,
Outlook e Apple Mail removem isso. Todos os arquivos usam pilha de fonte de sistema — o
laranja, o espaçamento e o tom continuam sendo os da Repply; a letra é a que o aparelho tem.

**Estilo tem que ser inline.** Bloco `<style>` no topo é descartado por vários clientes, e
`<div>` com flex quebra no Outlook. Por isso os arquivos são feitos de `<table>` com `style=`
em cada elemento — feio de ler, e é o único jeito que chega igual nos dois lados.
