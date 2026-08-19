# Dívida técnica — inventário

O que está quebrado, mal resolvido ou pendente neste sistema, com **o custo real** e **a
ordem de conserto**. Escrito para que ninguém precise redescobrir cada item.

Levantado em 19/08/2026, ao assumir o projeto da agência que o construiu.

> **Este documento não é lista de desejos.** Cada item aqui já tem consequência medida ou
> observada. Melhoria que ainda é opinião não entra.

---

## Resumo

| # | Item | Gravidade | Bloqueia? |
|---|---|---|---|
| 1 | [Chave do WhatsApp legível](#1-a-chave-do-whatsapp-está-legível) | **Crítica** | Não, mas não deve esperar |
| 2 | [Titularidade dos serviços](#2-titularidade-dos-serviços) | **Crítica** | Sim — impede aplicar mudança de banco |
| 3 | [Importação: formatação de datas](#3-importação--formatação-de-datas) | **Alta** | Sim — trava a migração da MD |
| 4 | [Agendamentos nunca funcionaram](#4-os-agendamentos-nunca-funcionaram) | Alta | Não |
| 5 | [Cobertura de teste quase zero](#5-cobertura-de-teste-quase-zero) | Alta | Não |
| 6 | [Função `import-data` órfã](#6-função-import-data-órfã) | Média | Não |
| 7 | [Arquivos grandes demais](#7-arquivos-grandes-demais) | Média | Não |
| 8 | [Controle de seção é só cosmético](#8-controle-de-seção-é-só-cosmético) | Média | Sim — impede vender sem entregar o Portal |
| 9 | [Legado do Gmail](#9-legado-do-gmail) | Baixa | Não |
| 10 | [Resend preparado e nunca concluído](#10-resend-preparado-e-nunca-concluído) | Baixa | Não |
| 11 | [Apelidos de `vendedor`](#11-apelidos-de-vendedor) | Baixa | Não |
| 12 | [TypeScript configurado frouxo](#12-typescript-configurado-frouxo) | Baixa | Não |
| 13 | [Duas gerações de política em `clientes`](#13-duas-gerações-de-política-em-clientes) | **Alta** | Não |
| 14 | [Coluna `import_hash` sem migration](#14-coluna-import_hash-sem-migration) | Média | Não |
| 15 | [Código morto em `Negocios.tsx`](#15-código-morto-em-negociostsx) | Baixa | Não |
| 16 | [Webhook do WhatsApp aceita qualquer um](#16-o-webhook-do-whatsapp-aceita-qualquer-um) | **Crítica** | Não |
| 17 | [Instância fantasma na uazapi](#17-instância-fantasma-na-uazapi) | Média | Não |
| 18 | [O lint não passa](#18-o-lint-não-passa) | Média | Não |

---

## 1. A chave do WhatsApp está legível

**Gravidade: crítica. Em aberto.**

### O que é

As funções do WhatsApp gravam o pacote inteiro recebido da uazapi, cru, numa tabela de
diagnóstico chamada `webhook_debug`. A uazapi manda o **próprio token da instância dentro
do pacote**. Ninguém decidiu salvar a chave: decidiram salvar tudo, e a chave veio junto.

Medido em 05/08/2026:

- `public.webhook_debug` está com **RLS desabilitada** e tem cerca de **61 mil linhas**
- Cerca de **1.621 dessas linhas contêm o `api_key` da instância em texto puro** — o valor
  bate exatamente com `configuracoes_wapi.api_key`

### O que isso permite

O `api_key` é a senha do WhatsApp da empresa no servidor da uazapi. Quem o tiver **não
precisa entrar no Repply**: fala direto com a uazapi e consegue ler todas as conversas,
enviar mensagem se passando pela empresa e desconectar o número.

Com a RLS desabilitada, basta ter a **chave publicável do app** — que vai dentro do
JavaScript do site e é pública por natureza. Não é "a agência consegue"; é **qualquer
pessoa que abra o código do site**.

### Como aconteceu

A tabela **não foi criada por migration** — não existe `CREATE TABLE webhook_debug` em
nenhum dos 252 arquivos. Foi criada à mão pelo painel do Supabase e, por isso, nunca
passou por revisão de código. É o motivo pelo qual escapou de todos.

> **Registrado por honestidade.** A auditoria herdada
> ([`docs/arquitetura/integracoes-externas.md`](arquitetura/integracoes-externas.md))
> descreve isso como risco "mantido por decisão do dono do produto". O dono do produto
> confirmou em 19/08/2026 que **a decisão não foi dele**. Isso não é risco aceito; é
> dívida a pagar.

### A ordem do conserto — errar a ordem tranca todo mundo

1. **Apagar o token das linhas já existentes**
2. **Parar de gravá-lo** (limpar o payload antes de inserir, nas funções que gravam)
3. **Criar a política de acesso**
4. **Só então ligar a RLS**

Ligar a RLS antes de existir política bloqueia todo mundo, inclusive o diagnóstico.

### Não termina aí

O próprio site entrega o token ao navegador no fluxo de conectar por QR Code:
`src/hooks/use-whatsapp-inbox.ts` fala **direto com a uazapi** usando
`config.api_key`. Limpar a tabela fecha metade do buraco; a outra metade é tirar essa
conversa do navegador — passando o fluxo de conexão por uma função de borda.

### Quem grava em `webhook_debug` hoje

`whatsapp-webhook` · `whatsapp-send` · `whatsapp-send-reaction` · `whatsapp-delete-message`

---

## 2. Titularidade dos serviços

**Gravidade: crítica. Fora do código.**

Situação em 19/08/2026:

| Item | Situação |
|---|---|
| Domínio, Stripe, Nylas, arquivo de ambiente | ✅ Resolvidos |
| **Supabase** | ⚠️ Conta acessível, projeto ainda em organização de terceiro |
| **GitHub** | ⚠️ Temos envio, repositório em conta pessoal do desenvolvedor anterior |
| Vercel, uazapi, Google Cloud | ❌ Pendentes |
| Gemini / Lovable AI / Resend | ❔ Titular a confirmar |
| Lovable | ✅ Dispensado (último commit do robô em 19/06/2026) |

### Por que é o item mais grave da lista

Duas razões:

1. **Bloqueia trabalho.** Enquanto o projeto Supabase não for da Repply, toda mudança de
   banco pode ser **escrita mas não aplicada nem testada** — e é aí que vive a maior parte
   do trabalho neste sistema.
2. **É a alavanca real de risco.** Quem controla o projeto Supabase e o repositório tem a
   chave-mestra do banco inteiro, acesso muito maior do que qualquer falha do código
   concede. Concluir a transferência vale mais, em segurança, do que o item 1 desta lista.

### Ainda

Uma chave do Google Maps já circulou em texto puro no histórico do repositório e foi
rotacionada. **Toda credencial que passou pelo histórico deve ser tratada como
comprometida.**

---

## 3. Importação — formatação de datas

**Gravidade: alta. É a prioridade zero do projeto.**

A migração da base da MD Representações do Bitrix24 para o Repply está travada por um
problema de formatação de datas na importação de planilha, que a agência deixou sem
corrigir. Enquanto isso, a MD opera os dois sistemas em paralelo.

**Onde olhar:**

- `sanitizeFieldValue` em `src/components/import/MappingStep.tsx` — é o caminho real de
  conversão de data, determinístico, com a regra brasileira de desambiguação
  (dia primeiro em casos como `05/03/2024`)
- [`docs/modulos/importacao.md`](modulos/importacao.md) — estrutura completa do fluxo
- As linhas que falham vão para `linhas_ignoradas_importacao` e podem ser revistas em
  `/importacao/ignoradas` — é por lá que se reproduz o problema com dado real

**Critério de pronto:** uma exportação real do Bitrix importa sem nenhuma linha ignorada
por causa de data, e as contagens conferem com a origem.

---

## 4. Os agendamentos nunca funcionaram

**Gravidade: alta.**

Dois agendamentos existem no banco:

| Agendamento | Frequência | O que deveria fazer |
|---|---|---|
| `eventos-lembrete` | 5 minutos | Enviar lembrete de evento do calendário |
| `email-sync` | 15 minutos | Atualizar o espelho da caixa de e-mail |

**Nenhum dos dois jamais executou com sucesso.** Em 05/08/2026 havia **3.656 execuções
registradas, todas com falha**, desde a criação em 23/07.

**Consequência real:** lembrete de evento nunca foi enviado a ninguém, e a caixa de e-mail
só atualiza quando alguém clica em atualizar na tela.

### Como conferir

```sql
select j.jobname, d.status, count(*), max(d.start_time), max(d.return_message)
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
group by 1, 2;
```

### São três causas empilhadas — a de cima esconde as de baixo

**Causa 1 — `cron.use_background_workers = off`** → erro de tempo esgotado ao iniciar.
Com o parâmetro desligado, o `pg_cron` abre conexão em `cron.host` e não consegue
autenticar. É parâmetro de contexto `postmaster`: **exige reiniciar o banco**
(Dashboard → Settings → Database → Custom Postgres Config).

**Causa 2 — `app.settings.service_role_key` não definida** → HTTP 401. O comando monta um
cabeçalho de autorização vazio e a função de borda recusa. Nem está no cofre de segredos.

```sql
ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role>';
```

*(A chave fica em Dashboard → Settings → API. **Nunca commite.**)*

**Causa 3 — precedência de operador no comando** → `22P02 invalid input syntax for json`.
O `::` liga mais forte que o `||`, então só o `"}` final era convertido. **Já corrigido**
em `20260805123341_corrige_precedencia_jsonb_nos_crons.sql`; o padrão certo é envolver a
concatenação inteira em parênteses antes da conversão.

### Validar depois de resolver 1 e 2

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/email-sync',
  headers := ('{"Content-Type":"application/json","Authorization":"Bearer '
              || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
  body := '{"limit":50}'::jsonb);

-- alguns segundos depois:
select id, status_code, left(content, 200) from net._http_response order by id desc limit 1;
```

---

## 5. Cobertura de teste quase zero

**Gravidade: alta.**

**7 arquivos de teste para 78 mil linhas de código.**

```
src/components/import-pedidos/importPedidosUtils.test.ts
src/hooks/whatsapp-phone.test.ts
src/lib/erro-edge-function.test.ts
src/lib/lazy-com-retry.test.ts
src/lib/plano-gate.test.ts
src/lib/situacao-empresa.test.ts
src/test/example.test.ts
```

Agrava dois outros fatos:

- **A Vercel publica sozinha a cada envio para `main`** — não há etapa manual entre o
  commit e o cliente
- **O TypeScript está frouxo** (item 12) — o compilador também não segura o erro

É por isso que este projeto tem regra fixa de **branch + Pull Request, nunca envio direto
para `main`**.

### Por onde começar

Os testes que existem já apontam o caminho: são exatamente as regras que **quebraram em
produção** (número de telefone, portão de plano, situação da empresa, erro de versão).
Priorize na mesma lógica:

1. Conversão de data na importação — é a prioridade zero do produto
2. `has_permission` e as políticas de acesso
3. Normalização de status e resolução de entidade na importação

---

## 6. Função `import-data` órfã

**Gravidade: média.**

`supabase/functions/import-data/index.ts` (290 linhas) **não está integrada ao fluxo da
interface** — nada em `src/` a invoca. E ela converte datas **usando IA (Gemini)**, sem a
regra brasileira de desambiguação que o caminho real aplica.

Já está marcada como obsoleta dentro do próprio arquivo (commit `f58578e8`).

**Decisão pendente:** integrar alinhando a regra de data, ou remover. Enquanto ficar no
repositório sem uso, é uma armadilha para quem procurar "onde a importação converte data"
e achar ela primeiro.

---

## 7. Arquivos grandes demais

**Gravidade: média.**

| Arquivo | Linhas |
|---|---|
| `src/pages/WhatsAppInbox.tsx` | 7.838 |
| `src/pages/Negocios.tsx` | 2.698 |
| `src/pages/Emails.tsx` | 2.298 |
| `src/pages/Chat.tsx` | 2.282 |
| `src/pages/Clientes.tsx` | 1.960 |
| `supabase/functions/whatsapp-webhook/index.ts` | 1.091 |

O custo não é estético: arquivo desse tamanho **não cabe de uma vez na cabeça de quem
edita** — nem humano nem assistente — e mudanças pequenas viram risco grande porque o
estado é compartilhado por tudo dentro do arquivo.

**Como tratar:** não parta para uma refatoração grande de propósito. Ao encostar num
desses arquivos por outro motivo, **extraia o pedaço que você tocou** para um componente
ou hook próprio. Diminui de forma incremental, sem parar a operação.

---

## 8. Controle de seção é só cosmético

**Gravidade: média. Bloqueia venda.**

`sidebar_empresa_padrao` define o **layout do menu** de cada empresa. Isso esconde o item
da barra lateral — **e nada mais**. A rota continua acessível e os dados continuam
chegando para quem digitar o endereço.

**Por que bloqueia venda:** o Portal de Consultas é exclusividade da MD Representações. Sem
um controle real, vender para outra empresa significa entregar o Portal junto.

Ver [`SPEC.md` §9](../SPEC.md), Fase 2.

---

## 9. Legado do Gmail

**Gravidade: baixa.**

O e-mail migrou para o **Nylas** em agosto de 2026, mas o código do Gmail ficou:

- `src/hooks/useGmail.ts`
- `src/components/email/GmailSettings.tsx`
- Funções de borda `gmail-auth-url`, `gmail-callback`, `gmail-send`, `gmail-sync-inbox`,
  `gmail-debug`
- Tabela `gmail_tokens`
- A coluna `gmail_message_id`, que hoje guarda um identificador do Nylas

**Custo:** confunde quem lê. Documentos herdados descreviam o Gmail como se fosse o
provedor atual — e estavam errados há semanas.

**Antes de remover:** confirme que nenhuma caixa ainda está conectada pelo caminho antigo.

---

## 10. Resend preparado e nunca concluído

**Gravidade: baixa.**

As tabelas `user_integrations` (com `resend_api_key`, `resend_from_email`) e
`user_domains` (com `resend_domain_id`) existem, mas **não há função de borda de envio via
Resend**. É integração começada e abandonada.

**Decisão pendente:** concluir ou remover as tabelas.

---

## 11. Apelidos de `vendedor`

**Gravidade: baixa.**

A tabela `vendedores` virou `usuarios` em abril de 2026, mas os nomes antigos sobraram:

- `historico_contatos.vendedor_id`
- Funções `get_my_vendedor_id()`, `vendedor_in_my_empresa()`
- A visão `vw_indicadores_vendedor`
- `is_gestor()` (nome mantido, semântica ampliada — ver
  [permissões](arquitetura/permissoes-e-rls.md))

> ⚠️ **Não remova sem varrer todas as políticas de segurança.** Várias ainda chamam os
> apelidos. Remover uma função usada por política derruba o acesso da tabela inteira, e o
> sintoma aparece como "sumiu tudo".

---

## 12. TypeScript configurado frouxo

**Gravidade: baixa, mas é multiplicador dos outros itens.**

`strictNullChecks: false`, `noImplicitAny: false`, variáveis e parâmetros sem uso não
sinalizados.

**Consequência:** o compilador não avisa sobre valor nulo nem sobre tipo implícito — as
duas categorias de erro mais comuns em código que fala com banco. Somado à ausência de
teste (item 5), o erro chega em produção.

**Como tratar:** apertar de uma vez geraria centenas de erros e pararia o projeto. O
caminho é apertar por arquivo, à medida que os arquivos forem tocados por outro motivo.

---

## 13. Duas gerações de política em `clientes`

**Gravidade: alta. É segurança, não organização.**

Coexistem duas políticas de acesso multi-empresa na tabela `clientes`:

| Migration | Baseada em |
|---|---|
| `20260413223933_...` | `vendedor_in_my_empresa(vendedor_id)` |
| `20260504172116_...` | `empresa_id` direto |

**Não há evidência no código de que a antiga tenha sido desativada.**

### Por que importa

No Postgres, políticas `PERMISSIVE` se **somam**: o resultado efetivo é a **união** das
duas, não a interseção. Ou seja, o acesso final é **mais permissivo do que qualquer uma
das duas isoladamente** — quase certamente não é o que se pretendia ao escrever a segunda.

### Como conferir

```sql
select policyname, permissive, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'clientes';
```

Se aparecerem as duas gerações, decida qual fica e **remova a outra em migration própria**.
Enquanto isso não for feito, ninguém sabe de verdade quem enxerga a carteira de clientes de
quem.

Vale repetir a conferência nas outras tabelas que passaram pela mesma renomeação de
`vendedores` para `usuarios`.

---

## 14. Coluna `import_hash` sem migration

**Gravidade: média.**

`src/hooks/use-bulk-import.ts` lê e escreve `pedidos.import_hash` para evitar importar a
mesma linha duas vezes. Mas **nenhuma migration cria essa coluna**, e ela não aparece em
`src/integrations/supabase/types.ts`.

Duas explicações possíveis, e as duas são problema:

- A coluna existe no banco real, criada fora do fluxo de migration — então as migrations
  não reconstroem o banco de verdade, e um ambiente novo nasceria quebrado
- A coluna não existe — então **a deduplicação da importação não funciona em produção**, e
  reimportar o mesmo arquivo duplica negócios silenciosamente

**Confirme contra o banco real** antes de confiar na deduplicação. É especialmente
relevante porque a importação é a prioridade zero (item 3).

---

## 15. Código morto em `Negocios.tsx`

**Gravidade: baixa.**

`ImportDialog` / `ImportDataDialog` continuam importados e renderizados em
`src/pages/Negocios.tsx` sem nenhum botão que os acione. O equivalente já foi removido de
`Clientes.tsx` (commit `c899bdb`), mas não aqui.

Custa pouco remover e evita que alguém tente "consertar" um caminho de importação que
ninguém usa.

---

## 16. O webhook do WhatsApp aceita qualquer um

**Gravidade: crítica. Em aberto. Confirmado no código em 19/08/2026.**

### O que é

`supabase/functions/whatsapp-webhook/index.ts` é público por natureza — a uazapi precisa
alcançá-lo, e por isso está com `verify_jwt = false` em `supabase/config.toml`
(corretamente: a uazapi não envia sessão).

O problema é o que existe **no lugar** da sessão: **nada.**

- A instância é identificada por um parâmetro na URL: `?instance=<nome>`
- A coluna `configuracoes_wapi.webhook_secret` **existe, é lida na consulta, e nunca é
  conferida**
- Não há verificação de assinatura nem de HMAC sobre o corpo

### O que isso permite

Qualquer pessoa que descubra ou adivinhe o nome da instância pode, com uma requisição
simples:

- **Injetar mensagens** na caixa de entrada de WhatsApp da empresa, como se um cliente
  tivesse escrito
- **Mudar o status de conexão** da instância

O vendedor abre o sistema e vê uma conversa que nunca existiu. Não há como distinguir da
verdadeira.

### Compare com os outros webhooks do mesmo sistema

Os outros dois endpoints públicos **fazem** a verificação:

| Endpoint | Como prova que é quem diz ser |
|---|---|
| `stripe-webhook` | Assinatura em `stripe-signature`, conferida na função |
| `email-webhook` | HMAC em `x-nylas-signature`, conferido sobre o corpo cru |
| **`whatsapp-webhook`** | **Nada** |

Ou seja, o padrão correto já está implementado duas vezes no mesmo repositório. Falta
aplicá-lo aqui.

### O conserto

Validar o `webhook_secret` que já existe no schema — ou, melhor, HMAC do corpo, seguindo o
que `email-webhook` faz. Configure o segredo na uazapi ao provisionar a instância
(`whatsapp-provision` já configura a URL do webhook; é o mesmo ponto).

> Junto com o [item 1](#1-a-chave-do-whatsapp-está-legível), forma o par de falhas abertas
> no módulo de WhatsApp. **Os dois são fase 1 do roadmap.**

---

## 17. Instância fantasma na uazapi

**Gravidade: média.**

Dois problemas no provisionamento (`whatsapp-provision`):

1. **`deleteOrphanInstance()` engole qualquer erro** e segue em frente. Resultado possível:
   instância criada na uazapi, nunca associada nem removida corretamente no banco —
   consumindo vaga e licença na uazapi sem estar rastreada aqui.
2. **Condição de corrida na reutilização de instância:** entre conferir se a empresa já tem
   instância e inserir o vínculo não há transação nem trava. Dois usuários provisionando
   ao mesmo tempo colidem. O código trata o erro de duplicidade como sucesso — é rede de
   proteção, não correção.

**Conserto mínimo:** registrar a falha da limpeza em algum lugar auditável, em vez de
engolir em silêncio. Sem isso, ninguém descobre a instância fantasma até a conta da uazapi
não fechar.

---

## 18. O lint não passa

**Gravidade: média. Medido em 19/08/2026 no `main`.**

```
✖ 498 problems (458 errors, 40 warnings)
  5 errors and 1 warning potentially fixable with the `--fix` option.
```

### Por que importa mais do que parece

Um lint que já falha **deixa de ser sinal**. Quando o número é 458, ninguém percebe que
virou 459 — e o erro novo, que era exatamente o que a ferramenta existia para pegar,
passa. Somado à [ausência de teste](#5-cobertura-de-teste-quase-zero) e ao
[TypeScript frouxo](#12-typescript-configurado-frouxo), o projeto fica sem nenhuma rede
automática entre o commit e o cliente.

### O critério enquanto isso não for resolvido

**Não é "o lint passou". É "o número não subiu."** Rode antes, guarde o total, rode depois,
compare.

### Como sair disso

1. Rodar `npm run lint -- --fix` resolve 5 erros e 1 aviso de imediato
2. Classificar os 458 por regra — provavelmente poucas regras respondem pela maioria
3. Decidir, regra a regra: **corrigir** ou **desligar de propósito**, com o motivo escrito
   na configuração. Regra desligada conscientemente é honesta; regra ligada e violada 458
   vezes é ruído
4. Só depois disso faz sentido exigir lint limpo em Pull Request

---

*Ao resolver um item, mova-o para uma seção "Resolvidos" no fim deste documento, com a
data e o commit — o histórico do que já doeu é o que impede repetir.*

---

## Resolvidos

| Item | Quando | Como |
|---|---|---|
| **`fabricantes` e `tabela_precos` eram globais entre todas as empresas** — uma empresa via o catálogo e os preços cadastrados por outra | 19/08/2026 | `20260819124247_fabricantes_e_precos_por_empresa.sql` e `20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql` |
| **Precedência de operador no comando dos agendamentos**, que gerava `22P02 invalid input syntax for json` | 05/08/2026 | `20260805123341_corrige_precedencia_jsonb_nos_crons.sql`. *Não resolveu o item 4 — era só a terceira das três causas* |
| **Tabela `wapi_instancia_usuarios` sem migration** — criada à mão, ninguém conseguia recriar o banco do zero | 01/07/2026 | `20260701000000_wapi_instancia_usuarios_retroativa.sql`, com `CREATE TABLE IF NOT EXISTS` documentando o schema real |
| **`whatsapp-webhook` rejeitava 100% dos eventos com 401** — não estava em `config.toml`, então valia `verify_jwt = true` e o gateway barrava antes do código. Sintoma: instância `connected` na uazapi e `disconnected` no banco | commit `0715119` | `[functions.whatsapp-webhook] verify_jwt = false` |
| **Identificador de grupo do WhatsApp quebrado** por limpeza de não-dígitos, que apagava o hífen do formato antigo | 05/08/2026 | Silencioso por meses: a uazapi respondia sucesso e não entregava nada |
| **Nono dígito enfiado em telefone fixo**, que respondia por 100% das falhas de envio | — | `normalizeWhatsappPhone`, com testes fixando o contrato em `src/hooks/whatsapp-phone.test.ts` |
