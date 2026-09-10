# O que a Nylas responde sobre conectar caixa de servidor próprio (IMAP)

**Data:** 10/09/2026
**Por que existe:** é a Tarefa 1 do plano `2026-09-09-d-locaweb-imap.md`, que é portão —
nada daquele bloco começa antes desta nota.
**Fonte:** documentação v3 da Nylas (links no fim).

---

## 🔴 A hipótese do desenho ESTAVA ERRADA

O documento de desenho (`2026-09-09-email-e-whatsapp-design.md`, bloco D) afirmava:

> "E o `provider=imap` no `/v3/connect/auth` não é o caminho que a Nylas usa para IMAP —
> caixa comum por servidor e senha se conecta pela autenticação direta, com as
> configurações explícitas."

**Isso é falso.** A autenticação hospedada da Nylas **suporta IMAP**, e `provider=imap`
no `GET /v3/connect/auth` — exatamente o que `email-conectar/index.ts:120-131` já monta —
manda a pessoa direto para o formulário de IMAP.

O que ela vê nesse formulário:

- endereço de e-mail e senha da caixa;
- um "Additional settings" que se expande para servidor e porta de **entrada** (IMAP) e de
  **saída** (SMTP), para quando a hospedagem não segue o padrão.

Ou seja: **o formulário que o plano mandava construir já existe, hospedado pela Nylas.**

### A consequência é grande, e é boa

Construir o formulário no CRM significava a senha da caixa atravessar o nosso servidor —
foi justamente o que o dono do produto teve de aprovar em 09/09/2026, mudando a promessa
da tela.

Pelo caminho hospedado, **a senha nunca passa por nós**. A frase "O CRM não guarda sua
senha" continua verdadeira, sem ressalva e sem caminho especial. As Tarefas 3, 4 e 5 do
plano (o módulo de servidores conhecidos, a Edge Function `email-conectar-imap` e o
diálogo `ConectarPorSenhaDialog`) deixam de ter motivo.

---

## O que realmente falta: o CONECTOR

A documentação é explícita:

> "You can't create grants without at least one connector."

Um **conector** é a configuração de como a Nylas fala com cada provedor, e existe **um por
provedor**. Os de Google e Microsoft guardam as credenciais do aplicativo OAuth — é por
isso que Gmail funciona hoje (a MD e a Repply estão conectadas por ele).

**IMAP precisa do conector dele**, criado à parte:

- no painel da Nylas, em **Connectors**; ou
- por `POST /v3/connectors` com `provider: "imap"`.

Diferente de Google e Microsoft, IMAP não tem aplicativo OAuth, então não há credencial de
provedor para informar na criação.

### Por que isto explica a JHS

Medido em 09/09/2026: a JHS tentou quatro vezes (12:29 imap, 12:30 microsoft, 12:31
google, 12:31 imap). Nas quatro o `email-conectar` respondeu 200 e devolveu a URL, e
**nenhuma** gerou linha de `email-callback` no log — ninguém voltou do provedor.

- **Google e Microsoft** recusaram porque `comercial@jhsrepresentacoesltda.com.br` não é
  conta deles. Esperado.
- **IMAP** é o caso que deveria ter funcionado. Se o conector de IMAP não existe na
  aplicação, a página hospedada não tem como criar o grant — e a pessoa fica parada lá,
  que é exatamente o rastro que os logs mostram.

**Isto ainda é hipótese, não medição.** Confirmar exige ver a lista de conectores da
aplicação Nylas, e a chave da API vive só nos segredos das Edge Functions
(`NYLAS_API_KEY`) — não há como consultá-la do ambiente de desenvolvimento. Quem confirma
é o dono do produto, no painel.

---

## O contrato da autenticação direta, se um dia for preciso

Fica registrado porque o levantamento foi feito, mas **não é o caminho escolhido**.

`POST https://api.us.nylas.com/v3/connect/custom`, com
`Authorization: Bearer <NYLAS_API_KEY>` e `Content-Type: application/json`.

Corpo: `provider: "imap"` e um bloco `settings` com

| campo | obrigatório |
|---|---|
| `imap_username` | sim |
| `imap_password` | sim |
| `imap_host` | sim |
| `imap_port` | sim (993 é o usual) |
| `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password` | **opcionais** por padrão |

Resposta de sucesso, dentro de `data`: `id` (que é o grant id), `email`, `provider`,
`grant_status`, `scope`, `created_at`, `updated_at`.

E este endpoint **também** depende do conector de IMAP existir. Ele não é um atalho para
o problema de hoje.

A documentação **não** especifica os erros devolvidos para senha errada, servidor errado
ou porta errada — o plano assumia que especificava. Se algum dia este caminho for
construído, os erros precisam ser descobertos por teste, não por leitura.

---

## O que o plano do bloco D passa a ser

1. **Confirmar** com o dono do produto se existe conector de IMAP na aplicação Nylas.
2. **Se não existir:** criar (painel → Connectors, ou `POST /v3/connectors`) e pedir à JHS
   que tente de novo. Possivelmente **zero linha de código**.
3. **Se existir:** a hipótese cai, e o bloco volta para a mesa — o próximo passo seria
   capturar o erro real da página hospedada, o que exige alguém da JHS repetindo a
   tentativa e relatando o que a tela diz.
4. **Em qualquer dos casos, uma melhoria que se sustenta sozinha:** hoje o retorno de erro
   é um código na URL (`?conexao=erro&motivo=troca_falhou`) que ninguém entende, e a
   tentativa que **não volta** do provedor não deixa rastro nenhum do nosso lado. Foi por
   isso que este diagnóstico levou um dia. Vale registrar a tentativa e mostrar à pessoa
   o que aconteceu.

---

## Fontes

- [Creating grants with IMAP authentication](https://developer.nylas.com/docs/v3/auth/imap/)
- [Creating grants with Bring Your Own Authentication](https://developer.nylas.com/docs/v3/auth/custom/)
- [Authenticating with Nylas](https://developer.nylas.com/docs/v3/auth/)
- [Create a connector — API Reference](https://developer.nylas.com/docs/reference/api/connectors-integrations/create_connector/)
- [How to connect an IMAP account for Hosted Authentication](https://support.nylas.com/hc/en-us/articles/25865031879197-How-to-connect-an-IMAP-account-for-Hosted-Authentication) — o conteúdo desta veio da busca; a página recusa leitura automática (HTTP 403)
