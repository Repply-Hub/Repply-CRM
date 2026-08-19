# Módulo de E-mail (Nylas)

Como o Repply CRM conecta, sincroniza, lê e envia e-mail.

> **Este documento substitui três anteriores** — `documentacao-email.md`,
> `integracao_email.md` e `docs/integracoes-gmail-maps.md` — que descreviam a **API do
> Gmail** como se fosse o provedor atual. O sistema migrou para o **Nylas** em agosto de
> 2026. Aqueles documentos foram removidos porque ensinavam errado.

---

## 1. Visão geral

**Provedor:** [Nylas v3](https://developer.nylas.com/). Uma única integração que fala com
Google, Microsoft, iCloud, Yahoo e IMAP genérico.

**A caixa pertence à empresa, não ao usuário.** `email_contas.empresa_id` é o dono. Isso é
diferente do modelo antigo do Gmail, em que cada pessoa conectava a própria conta.

```
Navegador                Edge Functions (Deno)            Nylas
   |                            |                           |
   |-- conectar --------------> email-conectar ----------->  |  gera URL de OAuth
   |<-- redireciona para o provedor -----------------------  |
   |                                                         |
   |-- volta do provedor -----> email-callback  <----------- |  troca code por grant
   |                            (sem sessão; valida `state`) |
   |                                                         |
   |-- abrir caixa ----------->  email-sync ---------------> |  busca mensagens
   |-- ler mensagem ---------->  email-mensagem -----------> |  busca o corpo
   |-- enviar ---------------->  email-enviar -------------> |  envia
   |                                                         |
   |                            email-webhook  <------------ |  avisa de novidade
```

### Por que REST puro, sem o SDK

A camada comum (`supabase/functions/_shared/nylas.ts`) fala com o Nylas por `fetch`, sem o
pacote oficial. Motivo registrado no código: a documentação do Nylas **não menciona Deno em
lugar nenhum**, e o pacote importa `node:fs` e `node:path`. Como toda a API é JSON com
`Authorization: Bearer`, o SDK não economizaria nada que compensasse depender de uma
compatibilidade não testada.

### A região é escolhida uma vez e não muda

`NYLAS_API_BASE` (`https://api.us.nylas.com` ou `api.eu`) fica em **segredo**, não no
código. A região é definida na criação da aplicação Nylas e **não pode ser trocada
depois** — chumbar a errada no código só apareceria na primeira chamada real.

---

## 2. Tabelas

| Tabela | O que guarda |
|---|---|
| `email_contas` | A caixa conectada: empresa dona, provedor, endereço, status, quem conectou |
| `email_conta_grants` | O `grant_id` do Nylas — **a credencial**. Tabela fechada, ver abaixo |
| `email_conta_usuarios` | Quem, além de quem responde pela empresa, enxerga aquela caixa |
| `email_conexao_estados` | Segredo de ida e volta do OAuth, de uso único, válido por 15 minutos |
| `email_pastas` | Pastas e marcadores espelhados do provedor |
| `email_mensagens` | **Recebidas e enviadas na mesma tabela** |
| `email_rascunhos` | Rascunho da composição, salvo automaticamente |
| `email_webhook_eventos` | Eventos recebidos do Nylas |

### `email_conta_grants` — a tabela mais protegida do sistema

```sql
ALTER TABLE public.email_conta_grants ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: RLS ligado sem policy é negação total.
REVOKE ALL ON public.email_conta_grants FROM anon, authenticated;
```

RLS ligada **sem nenhuma política** significa negação total, e o `REVOKE` tira o acesso
até de quem estiver autenticado. **Só as funções de borda, com a chave de serviço, leem
essa tabela.** A credencial da caixa nunca chega ao navegador.

> Compare com o WhatsApp, onde o token da instância chega ao navegador e está exposto numa
> tabela de diagnóstico ([`docs/divida-tecnica.md` §1](../divida-tecnica.md)). O e-mail é
> o exemplo de como deveria ter sido feito lá.

### `grant_id` é único de propósito

O Nylas cria **um grant por endereço de e-mail, por aplicação**. Se duas empresas tentarem
conectar a mesma caixa, ele devolve o **mesmo** `grant_id` e a restrição de unicidade
estoura — de propósito, para o callback recusar com mensagem clara em vez de,
silenciosamente, dar a uma empresa acesso à caixa da outra.

### `pasta_inbox_id` e `pasta_sent_id` ficam guardados

No Google, o filtro `in` da API do Nylas exige o **identificador** da pasta, não o nome.
Ele é resolvido uma vez na conexão e guardado, para a sincronização não gastar uma chamada
a `/folders` a cada execução.

---

## 3. Quem enxerga a caixa

`email_conta_usuarios` espelha o modelo de `wapi_instancia_usuarios`: um recurso da
empresa e uma lista de quem o usa.

> **Ausência de linha não significa "ninguém vê".** Quem responde pela empresa (papéis
> `gestor`, `empresa`, `admin`) sempre enxerga, porque são eles que conectam e
> administram. A lista serve para **liberar quem não é gestor** — o vendedor do
> atendimento, por exemplo.

A regra de acesso vive numa função só, usada pelas políticas das três tabelas, para não
poderem divergir com o tempo. Ela é **`SECURITY INVOKER` de propósito**: checa quem está
chamando, e rodar como dono deixaria de enxergar a RLS que a protege.

---

## 4. Funções de borda

| Função | Exige sessão? | Observação |
|---|---|---|
| `email-conectar` | **Sim** | Só `admin`, `empresa` e `gestor` conectam. Vendedor não liga nem desliga o e-mail corporativo do time |
| `email-callback` | Não | É o **navegador voltando do provedor**, sem sessão. A autenticidade vem do `state` de uso único |
| `email-sync` | Não (dois chamadores) | Atende o agendamento (com chave de serviço) **e** o navegador (com sessão). A distinção é feita dentro da função, que recusa quem não apresentar nenhuma das duas |
| `email-webhook` | Não | O Nylas chama sem sessão. A autenticidade vem do HMAC em `x-nylas-signature`, conferido sobre o corpo cru |
| `email-mensagem` | **Sim** | Busca o corpo de uma mensagem sob demanda |
| `email-enviar` | **Sim** | — |
| `email-marcar-lido` | **Sim** | — |
| `email-desconectar` | **Sim** | — |

> ⚠️ **Antes de acrescentar função à lista de `verify_jwt = false` em
> `supabase/config.toml`, leia os comentários que já estão lá.** Cada exceção tem um motivo
> escrito e um mecanismo de autenticidade próprio no lugar da sessão. Uma exceção sem
> substituto é um endpoint aberto.

---

## 5. Frontend

| Arquivo | Papel |
|---|---|
| `src/pages/Emails.tsx` | A tela (2.298 linhas) — lista, leitor, composição |
| `src/hooks/use-email-empresa.ts` | Conectar, sincronizar, enviar, carregar corpo (com cache por mensagem) |
| `src/hooks/use-email-pastas.ts` | Pastas, marcadores e contagem por pasta |
| `src/lib/assinatura-email.ts` | Assinatura, em modo texto ou imagem |
| `src/components/email/` | Componentes do módulo |

### Assinatura de e-mail

Configurada em **Configurações → Perfil**. Dois modos: **texto** (editor) ou **imagem**.
O logo do rodapé pode ser trocado ou removido.

Detalhe histórico registrado no código: assinaturas antigas foram gravadas como texto puro
com `\n` como quebra de linha; as novas chegam como HTML do editor. `assinatura-email.ts`
trata os dois formatos — **não simplifique isso** sem migrar as antigas.

---

## 6. Armadilhas conhecidas

### `.eq(coluna, null)` nunca casa

No PostgREST isso vira `coluna=eq.null`, e em SQL `NULL = NULL` não é verdadeiro. Para
tirar o acesso à caixa inteira é preciso `.is('pasta_id', null)`. Com `.eq`, o clique não
faz nada e o estado volta sozinho ao recarregar. Já aconteceu aqui.

### Resposta na mesma conversa

A resposta grava o mesmo `thread_id` da conversa original. Não gere identificador novo, ou
a conversa racha em duas na caixa do destinatário.

### O nome `gmail_message_id` mente

A coluna `gmail_message_id` em `email_mensagens` guarda hoje o **identificador do Nylas**
(`nylas_message_id`). O nome ficou da época do Gmail. Não confunda — e, se for renomear,
faça em migration própria, varrendo os usos.

---

## 7. O que está quebrado

> 🔴 **A sincronização automática nunca rodou.** O agendamento `email-sync` (a cada 15
> minutos) existe no banco, mas nunca executou com sucesso — em 05/08/2026 havia 3.656
> execuções, todas com falha, desde 23/07.
>
> **Consequência:** a caixa só atualiza quando alguém clica em atualizar na tela.
>
> Diagnóstico completo e conserto: [`docs/divida-tecnica.md` §4](../divida-tecnica.md).

O limite padrão de sincronização é de **50 mensagens** por execução (subiu de 20 em
agosto/2026).

---

## 8. Legado do Gmail — o que ainda está no repositório

Migrado, mas não removido:

- `src/hooks/useGmail.ts`
- `src/components/email/GmailSettings.tsx`
- Funções `gmail-auth-url`, `gmail-callback`, `gmail-send`, `gmail-sync-inbox`,
  `gmail-debug`
- Tabela `gmail_tokens`

`use-email-empresa.ts` espelha de propósito a assinatura de `useGmail`, para a troca ter
sido possível sem reescrever os componentes.

**Antes de remover:** confirme que nenhuma caixa ainda está conectada pelo caminho antigo.
Ver [`docs/divida-tecnica.md` §9](../divida-tecnica.md).

---

## 9. Segredos necessários

Nos segredos das Edge Functions, no painel do Supabase:

| Segredo | Para quê |
|---|---|
| `NYLAS_API_KEY` | Autenticação na API |
| `NYLAS_CLIENT_ID` | Identificador da aplicação, usado no OAuth |
| `NYLAS_API_BASE` | Região (`api.us` ou `api.eu`). **Não muda depois de criada a aplicação** |
| `NYLAS_WEBHOOK_SECRET` | Confere o HMAC do webhook |
| `APP_URL` | Para onde o callback devolve o navegador |
