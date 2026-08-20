# Plano de blindagem — as duas falhas abertas do WhatsApp

**Situação:** o módulo de WhatsApp tem duas falhas de segurança que se alimentam. A senha
da instância uazapi estava publicada numa tabela sem proteção, e o webhook que recebe as
mensagens não confere quem está chamando.

**Estado deste plano:** Fase 0 **executada** em 20/08/2026. Fases 1 a 4 **propostas, não
executadas**.

**Cobre as dívidas** [§1](../divida-tecnica.md#1-a-chave-do-whatsapp-está-legível) e
[§16](../divida-tecnica.md#16-o-webhook-do-whatsapp-aceita-qualquer-um).

**O passo a passo para executar** está em
[`plano-blindagem-whatsapp-execucao.md`](plano-blindagem-whatsapp-execucao.md) — 10
tarefas, com o código de cada uma. Este documento aqui é o *o quê* e o *porquê*.

> ⚠️ **A Fase 3 pode derrubar o WhatsApp da MD se for feita fora de ordem.** Ver §6.

---

## 1. O que está provado

Medido em produção em 20/08/2026, antes da Fase 0. Não é suposição herdada: a auditoria da
agência falava em ~1.621 linhas expostas, e o número real era quase o triplo.

| Fato | Medida | Como foi verificado |
|---|---|---|
| A tabela era legível por qualquer um | **HTTP 200**, `Content-Range: 0-0/71009` | Requisição real ao PostgREST com a chave publicável do site, sem sessão |
| Volume acumulado | 71.008 linhas · 74 MB | `count(*)` e `pg_total_relation_size` |
| Linhas com a senha da instância em texto puro | **4.725** | Comparação direta com `configuracoes_wapi.api_key` |
| Linhas com telefone de cliente | **53.847** (piso — só o formato cru) | Padrão `NNNNNNNNNNN@s.whatsapp.net`. O pacote também traz o telefone formatado, não contado aqui |
| Linhas expondo o **nome da instância** | **4.774** | Comparação com `configuracoes_wapi.instance_name` |
| Ritmo de crescimento | ~1.200 linhas/dia | 1.222 nas 24h anteriores |
| Classificação do próprio Supabase | Único achado **ERROR** entre 197 avisos | `rls_disabled_in_public` |
| A senha fica sempre no mesmo campo | `payload > token`, em 200 de 200 amostras | Varredura de caminho no JSON |
| As 3 instâncias estão sem segredo de webhook | 3 de 3 com `webhook_secret` vazio | Consulta em `configuracoes_wapi` |

### Por que as duas falhas se somam

A tabela pública entregava **as duas metades do ataque ao mesmo tempo**: a senha (4.725
linhas) e o nome da instância (4.774 linhas).

Com a senha, fala-se direto com a uazapi — lê conversa, envia se passando pela empresa,
desconecta o número. Com o nome da instância, injeta-se mensagem falsa na caixa de entrada
pelo webhook, que não confere ninguém.

Ou seja, a §16 nunca dependeu de alguém *adivinhar* o nome da instância. **O nome estava
publicado.**

---

## 2. Fase 0 — Trancar a porta ✅ EXECUTADA

**Aplicada em 20/08/2026 às 12h14.** Migration
`20260820121510_webhook_debug_fecha_acesso_publico.sql`.

`public.webhook_debug` passou a ter RLS ligada, zero políticas, e sem concessão de leitura
para `anon`/`authenticated` — o mesmo padrão que `email_webhook_eventos`, `stripe_eventos`,
`email_conta_grants` e `email_conexao_estados` já usavam.

Conferido **antes** de aplicar:

- nenhum código do app lê a tabela (só aparece em `types.ts`, que é gerado)
- nenhuma view ou função do banco a referencia
- nenhuma chave estrangeira aponta para ela
- as Edge Functions gravam com `service_role`, que passa por cima de RLS por definição

Conferido **depois** de aplicar:

| Verificação | Resultado |
|---|---|
| Leitura anônima | **HTTP 401** `permission denied` (era 200, com 71.009 linhas) |
| Gravação pelas funções continua | Linhas subiram de 71.008 para 71.084, última às 12h15 |
| Demais tabelas sensíveis | `clientes`, `pedidos`, `usuarios`, `empresas`, `configuracoes_wapi` e `whatsapp_conversas` devolvem lista vazia ao anônimo |

**O que a Fase 0 NÃO fez:** não apagou nada do que estava gravado, não impediu que a senha
continue sendo gravada, e não autenticou o webhook.

---

## 3. A ordem, e por que ela não é arbitrária

```
✅ FASE 0  Trancar a porta                (feita)
   FASE 1  Parar de gravar a senha
   FASE 2  Esvaziar + faxina de 30 dias
   FASE 3  Autenticar o webhook           ← único risco de derrubar a MD
   FASE 4  Tirar a senha do navegador
```

Trocar 1 por 2 é enxugar gelo: apagar 71 mil linhas e ver a senha voltar a ser gravada no
mesmo dia. **Parar de sangrar vem antes de limpar o chão.**

A Fase 4 vem por último porque é a única que mexe em tela. As três primeiras são invisíveis
para quem usa o sistema.

---

## 4. Fase 1 — Parar de gravar a senha

### O problema

Quatro Edge Functions gravam o pacote cru em `webhook_debug`:

`whatsapp-webhook` · `whatsapp-send` · `whatsapp-send-reaction` · `whatsapp-delete-message`

A uazapi manda o próprio token dentro do pacote. Ninguém decidiu salvar a senha: decidiram
salvar tudo, e a senha veio junto.

### O conserto

Uma função de limpeza **compartilhada** em `supabase/functions/_shared/` — onde o projeto
já guarda código comum de WhatsApp (`_shared/whatsapp.ts`). Consertar as quatro funções
separadamente garantiria que a quinta, criada daqui a um mês, nasceria furada de novo.

A limpeza tampa por **duas vias independentes**, de propósito:

1. **Por nome do campo** — qualquer chave chamada `token`, `apikey`, `api_key` ou
   `authorization`, em qualquer profundidade
2. **Por valor** — se o `api_key` da instância aparecer em qualquer outro campo, some
   também

A via 1 sozinha falha se a uazapi renomear o campo. A via 2 sozinha falha se a senha chegar
de uma instância que não está no banco. Juntas, cobrem as duas.

### Teste automatizado — aqui, e por quê

Esta é a peça que ganha teste, e é deliberado. É **lógica pura**: entra um pacote, sai um
pacote, sem banco e sem rede. E é o coração do conserto — se ela falhar em silêncio, todo o
resto do plano vira teatro.

Casos mínimos:

- senha no campo esperado
- senha aninhada em objeto interno
- campo com nome alternativo
- pacote sem senha nenhuma — não pode corromper o que já está limpo
- pacote malformado — não pode derrubar a função e custar uma mensagem

### Como saber que funcionou

Contar linhas novas contendo a senha após a publicação. **Tem que ser zero.**

---

## 5. Fase 2 — Esvaziar e instalar a faxina

### Apagar o acumulado — tudo, não só o que passa de 30 dias

**Apaga-se o acumulado inteiro**, e não apenas o que excede o prazo de guarda. O motivo é
que a regra de 30 dias vale para o que for gravado **depois da Fase 1** — ou seja, já
limpo. Tudo o que está lá hoje foi gravado antes, e carrega a senha e as fichas de contato.
Guardar os 30 dias mais recentes seria guardar ~36 mil linhas contaminadas.

Feito **em lotes**, não num `DELETE` único: a tabela tem 74 MB e o sistema está em uso
diário — um comando único pode travar o banco no meio do expediente.

### Prazo de guarda: 30 dias

Decidido pelo dono do produto em 20/08/2026. Sete dias cobriria o caso comum (quando o
WhatsApp trava, a MD reclama no mesmo dia), mas 30 dias permite investigar um problema
relatado semanas depois. Custo: mantém ~35 mil linhas guardadas em regime, em vez de ~8 mil.

### Como

Um atalho de busca por data — sem ele a faxina varre a tabela inteira todo dia — e uma
rotina diária que apaga o que passar de 30 dias. O projeto já roda rotinas agendadas
(`automacao-diaria`, `eventos-lembrete`): segue o mesmo caminho, não inventa um novo.

### Como saber que funcionou

A tabela estabiliza em torno de 35 mil linhas em vez de crescer sem fim, e o espaço em
disco para de subir.

---

## 6. Fase 3 — Autenticar o webhook ⚠️

### O problema

`whatsapp-webhook` é público por natureza — a uazapi precisa alcançá-lo, e por isso está
com `verify_jwt = false` (corretamente). O problema é o que existe **no lugar** da sessão:
nada.

A coluna `configuracoes_wapi.webhook_secret` existe, **é lida na consulta**
(`whatsapp-webhook/index.ts:51`) e nunca é comparada com coisa alguma.

O padrão correto já está implementado duas vezes neste repositório:

| Endpoint | Como prova quem é |
|---|---|
| `stripe-webhook` | Assinatura em `stripe-signature` |
| `email-webhook` | HMAC sobre o corpo cru, com comparação em tempo constante |
| **`whatsapp-webhook`** | **Nada** |

### O risco, e por que ele é concreto

**Ligar a conferência antes de a uazapi mandar o segredo faz 100% das mensagens pararem de
chegar — em silêncio.**

Isso **já aconteceu neste sistema**. A função não estava listada em `config.toml`, o
`verify_jwt = true` padrão valia, e o portão do Supabase rejeitava toda chamada da uazapi
antes de o código rodar. Sintoma: a instância aparecia conectada na uazapi e `disconnected`
no banco, e mensagem nenhuma entrava. Ninguém percebeu por dias. Corrigido em `0715119`.

**Este plano não repete esse acidente.**

### A forma do segredo

O endereço do webhook é **registrado por nós** na uazapi (`POST /webhook`), hoje como
`.../whatsapp-webhook?instance=<nome>`. Então o segredo pode viajar no próprio endereço
(`&s=<segredo>`) — funciona independentemente do que a uazapi suporte.

**A verificar na implementação (5 minutos):** se a uazapi aceitar cabeçalho próprio, usar
cabeçalho é melhor, porque o segredo deixa de aparecer em registro de URL. A função deve
aceitar **as duas formas** e comparar em tempo constante, como o `email-webhook` já faz. A
documentação da uazapi é renderizada por JavaScript e não abre por requisição direta —
confirmar pelo painel ou por chamada de teste.

### Rodagem em quatro etapas

| Etapa | O que faz | Impacto para a MD |
|---|---|---|
| 3a | Gera `webhook_secret` para as 3 instâncias e registra o novo endereço na uazapi | Nenhum |
| 3b | A função **conta** quantos eventos chegam com e sem segredo — **aceita todos** | Nenhum |
| 3c | Observa até 100% chegarem com segredo, por alguns dias | Nenhum |
| 3d | **Só então** passa a recusar quem não apresenta segredo | Nenhum, se 3c fechou |

**Se em 3c aparecer qualquer evento sem segredo, não avança.** Investiga. O passo 3d
acontece com evidência, não com otimismo.

### Também nesta fase

`whatsapp-provision` e `whatsapp-admin-provision` passam a gerar o segredo ao criar
instância nova — senão a próxima empresa nasce sem proteção e o problema volta pela porta
dos fundos.

---

## 7. Fase 4 — Tirar a senha do navegador

### O problema

A tela de conectar por QR Code fala **direto** com a uazapi, usando a senha da instância.
Ou seja, o navegador de qualquer funcionário da empresa recebe a senha — basta abrir as
ferramentas do Chrome para lê-la.

São exatamente **6 pontos**, em 2 arquivos:

| Arquivo | Linhas |
|---|---|
| `src/hooks/use-whatsapp-inbox.ts` | 1440 (conectar) · 1488 (status) · 1518 (desconectar) |
| `src/hooks/use-admin-whatsapp.ts` | 123 (conectar) · 161 (status) · 193 (desconectar) |

### O conserto

Uma Edge Function `whatsapp-instancia` com três ações — `conectar`, `status` e
`desconectar` — no mesmo formato do `whatsapp-admin-provision`, que já existe e já funciona
por ação. Os 6 pontos passam a chamar a função em vez da uazapi.

Depois que os 6 migrarem e o fluxo de QR estiver conferido funcionando, **revogar a leitura
da coluna `api_key`** para usuários logados. A senha deixa de estar escondida no navegador e
passa a estar inalcançável.

### Cuidado

A tela de Configurações permite digitar a senha manualmente. Ela continua podendo
**gravar**, mas deixa de **ler** — o campo passa a exibir mascarado, sem trazer o valor.

### Como saber que funcionou

Abrir o Chrome na tela de WhatsApp, conectar por QR Code, e **não achar a senha em lugar
nenhum** — nem no tráfego de rede, nem na resposta do banco.

---

## 8. Fora de escopo desta rodada: trocar a senha

A senha ficou publicamente legível de 08/06 a 20/08/2026 — **2 meses e 12 dias**.
Rigorosamente, deve ser tratada como comprometida e trocada.

**Por que não entra agora:**

1. Exige acesso à conta da uazapi, que **ainda não é da Repply**
   ([dívida §2](../divida-tecnica.md#2-titularidade-dos-serviços))
2. Derruba o WhatsApp da MD até alguém ler o QR Code de novo
3. **Só faz sentido depois das Fases 1 e 2** — trocar antes de parar de gravar publica a
   senha nova em um dia

**Recomendação:** tratar como o passo seguinte assim que a titularidade da uazapi sair, e
tratar a transferência em si como prioridade — hoje ela é o que impede fechar isto de
verdade.

---

## 9. Verificação — o número que precisa bater em cada fase

| Fase | Critério de aprovação |
|---|---|
| 0 ✅ | Leitura anônima devolve 401; gravação pelas funções continua |
| 1 | Linhas novas contendo a senha: **zero** |
| 2 | Tabela estabiliza em ~35 mil linhas; espaço em disco para de crescer |
| 3 | Eventos chegando com segredo: **100%** — **e** volume de mensagens recebidas inalterado |
| 4 | Senha ausente do navegador em inspeção manual do fluxo de QR |

O segundo critério da Fase 3 é o que importa. O primeiro pode dar 100% simplesmente porque
nada está chegando.

---

## 10. Riscos

| Risco | Como está tratado |
|---|---|
| Parar de receber mensagem ao ligar a conferência | Fase 3 em modo observação, com 3d só depois de 100% medido |
| Falha silenciosa igual à de `verify_jwt` | Critério de aprovação inclui volume de mensagens, não só percentual |
| A limpeza corromper o pacote e custar uma mensagem | Teste automatizado, incluindo pacote malformado; a limpeza nunca lança |
| Apagar 71 mil linhas travar o banco no expediente | Apagamento em lotes |
| Instância nova nascer sem proteção | Fase 3 altera também os dois fluxos de provisionamento |
| Quebrar o QR Code ao mover para o servidor | Fase 4 é a última; revogação da leitura só depois do fluxo conferido |
| Perder histórico de conversa da MD | Não se aplica: as conversas vivem em `whatsapp_conversas` (699) e `whatsapp_mensagens` (46.705). `webhook_debug` não tem ligação com nenhuma das duas |

---

## 11. Coordenação com o reparo de datas

O [reparo de datas](plano-reparo-datas.md) mexe em `pedidos`. Este plano mexe em
`webhook_debug`, `configuracoes_wapi` e nas funções de WhatsApp.

**Nenhuma tabela em comum, nenhum arquivo de código em comum.** Os dois podem correr em
paralelo.

O único ponto de encontro era [`divida-tecnica.md`](../divida-tecnica.md), que ambos
atualizam. Resolvido: o reparo de datas fechou a parte dele em `0b0839e1`.
