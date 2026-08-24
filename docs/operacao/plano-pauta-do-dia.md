# Pauta do dia ("Hoje") e e-mails da Repply

**Situação:** o sistema tem uma tela de notificações que quase não notifica, uma aba de
automação que não automatiza nada, e e-mails que saem do remetente de desenvolvimento do
Supabase.

**Estado:** desenho aprovado pelo dono do produto em 24/08/2026. **Nada implementado.**

**Este documento é o *o quê* e o *porquê*.** Ele é para o Lucas conferir e para outro dev
executar. Números de banco medidos em 24/08/2026 na produção; números de linha são do código
do mesmo dia e podem sair do lugar.

> A interface de referência é o redesenho que o Lucas montou
> (`Repply Hub v3.dc.html`, seção "Hoje"). Este documento diz o que dele é construível hoje,
> o que precisa de base antes, e onde o desenho precisou mudar porque o dado não existe.

---

## 1. O que está provado

### 1.1 A aba "Automação" das Configurações é decorativa

`src/pages/Configuracoes.tsx:833-861`. Três controles, nenhum ligado a nada:

| controle | código real | efeito |
|---|---|---|
| "Dias para alerta" | `useState('5')` (linha 759) | não é lido do banco nem salvo; volta a 5 a cada recarga |
| "Notificação por email" | `<Switch />` | sem `checked`, sem `onCheckedChange`. Nada |
| "Notificação no sistema" | `<Switch defaultChecked />` | idem. O `defaultChecked` só pinta |

A tabela que guardaria isso **existe e está vazia**: `configuracoes_automacao`, chave/valor por
empresa, criada em `20260706190000_configuracoes_automacao_multi_empresa.sql`. **0 linhas.**

### 1.2 A automação que alimentaria os alertas nunca rodou

`supabase/functions/automacao-diaria/index.ts` (158 linhas) monta alerta de follow-up atrasado
e de negócio parado. Ela **não está agendada**: não aparece em `cron.job` e não é chamada por
nenhuma migration nem pelo app.

A prova definitiva é a tabela de auditoria da própria função: **`automation_logs` tem 0
linhas.** Ela grava uma linha por execução. Nunca executou.

Os três agendamentos que de fato existem são outros:

| agendamento | frequência |
|---|---|
| `eventos-lembrete` | a cada 5 min |
| `email-sync` | a cada 15 min |
| `faxina-whatsapp-webhook-origem` | 3h40 diariamente |

### 1.3 Na prática, o sistema notifica uma coisa só

As 36 notificações que existem desde 05/08/2026 são **todas** do mesmo tipo: `evento_lembrete`.
Chegaram a 9 pessoas. Nenhuma de negócio parado, nenhuma de follow-up.

**33 das 36 estão não lidas.** Ressalva honesta sobre esse número: uma notificação só vira
"lida" por ação explícita — clicar nela, clicar no ✓, ou "Marcar todas". Abrir o painel não
marca nada. Então 92% quer dizer "ninguém clicou", **não** "ninguém viu".

### 1.4 O funil aberto tem 193 negócios, e o dinheiro está no meio

As 8 empresas têm o mesmo funil de 6 etapas (`kanban_colunas`, 48 linhas). Não existe coluna
marcando etapa final — `fechamento` e `perdido` são identificadas pelo apelido, convenção que o
resto do sistema já usa.

Etapas terminais somam 11.718 negócios (8.519 em fechamento, 3.199 em perdido). **O funil vivo
é 193** — 181 em Negociação e 12 em Orçamento Enviado, valendo R$ 14,4 milhões.

Por idade real (data de criação, que é confiável):

| idade | negócios | valor | leitura |
|---|---|---|---|
| até 30 dias | 69 | R$ 3.497.480 | no prazo normal |
| 1 a 3 meses | 59 | **R$ 5.609.611** | esfriando — o maior volume de dinheiro |
| 3 meses a 1 ano | 14 | **R$ 3.826.135** | **R$ 273 mil de média** — grandes e travados |
| mais de 1 ano | 51 | R$ 1.458.176 | R$ 28 mil de média — provavelmente mortos |

**Os 14 negócios travados há mais de três meses carregam R$ 3,8 milhões.** É o alvo mais óbvio
da pauta, e hoje nada no sistema aponta para eles.

### 1.5 🔴 Três colunas de data estão envenenadas, e uma quarta não significa o que o nome diz

Esta seção existe porque o desenho original da pauta ("parado há 12 dias na etapa Enviado")
foi escrito sobre uma coluna errada, e a correção mudou a regra inteira.

| coluna | estado | serve? |
|---|---|---|
| `pedidos.fechado_em` | todas as 11.715 linhas carimbadas em 18–19/08 (a importação) | ❌ já era conhecido |
| `pedidos.updated_at` | todos os 11.911 entre 18 e 21/08 | ❌ |
| `pedidos_historico_status.created_at` | todas as 18.319 linhas entre 18 e 21/08 | ⚠️ ver abaixo |
| `pedidos.prazo_resposta` | preenchida, mas **não é prazo de resposta** | ❌ ver abaixo |

**`prazo_resposta` é o nome da coluna, não o significado.** O sistema inteiro a trata como
**Data de Fechamento**:

```
src/components/pedidos/NovoNegocioDialog.tsx:773   <Label>Data de Fechamento</Label>
src/components/import-pedidos/importPedidosUtils.ts:17   { key: 'prazo_resposta', label: 'Fechamento' }
src/components/import/MappingStep.tsx:79   "Data prevista de fechamento do negócio."
```

E os dados confirmam que ninguém a mantém. Dos 193 negócios abertos, **32 têm data de
fechamento ANTERIOR à data de criação** — lixo puro. O campo é opcional no cadastro, e só 4
negócios em 11.911 nasceram dentro do CRM.

> **Não use `prazo_resposta` como prazo de nada.** É a data de fechamento, é a mesma coluna que
> o Dashboard usa para as métricas de dinheiro (ver `docs/modulos/dashboard.md`), e para negócio
> ABERTO ela é uma previsão herdada da planilha que ninguém atualiza.

**A boa notícia sobre o histórico de etapa:** o gatilho `trg_pedidos_historico_status` está
**ativo**. O envenenamento é só do passado — a importação. Toda mudança de etapa **daqui para
frente** é gravada com data de verdade.

**Consequência para o desenho:** "parado há N dias na etapa X" funciona de verdade a partir de
agora. Para os 193 legados o relógio começou na importação (18–21/08), e essa distorção se
corrige sozinha conforme as pessoas mexerem nos negócios. Enquanto isso, a **idade real** vem
de `data_pedido`, que é confiável e retroativa.

---

## 2. As decisões tomadas

Todas do dono do produto, em 24/08/2026:

1. **O que entra na v1:** orçamento parado e compromisso/prazo do dia. Ficam de fora "cliente
   falou e ninguém respondeu" (WhatsApp/e-mail) e "mexeram num negócio meu".
2. **Canal:** a tela "Hoje" mais o sino que já existe. Sem e-mail por evento.
3. **Priorização:** teto diário, os mais valiosos primeiro.
4. **Quantidade:** varia dentro de uma banda, para a tela não virar paisagem.
5. **O ✓:** adia o item; ele volta depois. **E fica registrado no Histórico de Movimentação do
   negócio** — não é bilhete privado.
6. **Remetente de e-mail:** próprio da Repply, com DNS.
7. **A aba Automação:** vira o painel de ajuste da pauta, salvando de verdade.

---

## 3. A tela "Hoje"

### 3.1 O que ela é

Uma **fila de trabalho**, não um mural de avisos. A diferença decide se ela sobrevive:
notificação conta o que *aconteceu*; pauta diz o que *fazer agora*, em ordem, com o valor em
jogo do lado e um verbo no botão.

A regra que sustenta tudo: **a pauta precisa poder zerar hoje.** Foi não poder zerar que matou
as notificações.

Manchete, lista ordenada, e cada item com selo, valor, a frase do porquê, um botão de ação e o
✓ de adiar. Estado vazio comemora em vez de ficar em branco.

### 3.2 Onde ela mora

Item novo na barra lateral, no topo. **Não muda a tela que abre depois do login** — trocar a
porta de entrada de 26 pessoas é decisão à parte, não efeito colateral desta entrega.

Nasce registrada no sistema de seções por empresa (`secoes_por_empresa` / `useSecaoLigada`),
então cada empresa liga ou desliga como já faz com Portal e Obras.

### 3.3 A banda de 3 a 7, e por que não é sorteio

O tamanho da pauta varia — mas **quem decide é o que está lá**, não um sorteio. A pauta mostra
tudo que passou do corte, respeitando piso 3 e teto 7. Dia pesado abre com 7; dia leve com 3;
dia limpo abre zerada.

**Por que não sortear:** número que muda sem motivo ensina que o número não significa nada — e
aí a tela vira paisagem do mesmo jeito, só que mais confusa. Variando pelo conteúdo, cada
variação quer dizer alguma coisa.

**Por que 3 e 7:** abaixo de 3 a tela não justifica existir; acima de 7 ninguém termina antes do
café. E a banda cabe sem rolagem — o item que exige rolar é o item que ninguém faz.

Piso e teto ficam ajustáveis na aba Automação.

---

## 4. A regra da pauta

### 4.1 Orçamento parado

Entra o negócio que satisfaz **todas** as condições:

- está numa etapa **aberta** — qualquer coluna do funil da empresa cujo apelido não seja
  `fechamento` nem `perdido` (lido de `kanban_colunas`, não cravado no código);
- **eu sou o responsável** (`usuario_id = get_my_usuario_id()`);
- a última mudança de etapa foi há **mais de N dias** (`pedidos_historico_status`, tipo
  `status`, `max(created_at)`);
- **não está adiado** — sem linha válida em `pauta_adiamentos`.

Ordena por `valor_total` decrescente. Corta na banda.

**O card mostra a idade real, não a da etapa:**

> *"Em Negociação desde 31/10/2022 · R$ 47.900"*

A idade vem de `data_pedido`. É o número que não mente, e é o que faz o vendedor entender por
que aquele item está ali.

### 4.2 Compromisso e prazo do dia

Leitura direta, sem invenção:

- eventos da agenda de hoje (`eventos` — 234 linhas, é o módulo mais usado do sistema);
- tarefas com `prazo_final` hoje (`tarefas` — apenas 3 linhas hoje; quase ninguém usa, e a pauta
  não vai mudar isso sozinha).

### 4.3 A pauta é sempre a sua

Só negócios em que **você** é o responsável — inclusive para gestor. "O que eu faço hoje" não se
responde com o trabalho dos outros; o panorama da equipe já é o Dashboard.

### 4.4 O que sobra

O que não coube vira um link discreto — *"ver os outros 170"* — que leva para Negócios com o
filtro já aplicado. A pauta nunca esconde o tamanho do problema; ela só não começa por ele.

---

## 5. O adiamento

### 5.1 Por que precisa existir

A pauta **não é uma lista guardada** — é calculada na hora, toda vez que a tela abre. A pergunta
é sempre a mesma: *"quais negócios meus estão abertos e parados há mais de N dias?"*

Se o ✓ não gravar nada, amanhã a mesma pergunta devolve o mesmo negócio. O ✓ não teria efeito
nenhum além de sumir com o item até recarregar a página.

### 5.2 A tabela

```sql
create table public.pauta_adiamentos (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios(id),
  empresa_id    uuid not null references public.empresas(id),
  tipo          text not null check (tipo in ('negocio','compromisso')),
  referencia_id uuid not null,           -- pedidos.id ou eventos.id
  adiado_ate    date not null,
  created_at    timestamptz not null default now()
);
```

RLS: cada pessoa só lê e escreve as próprias linhas. Índice por
`(usuario_id, tipo, adiado_ate)` — é como a pauta consulta.

**O adiamento não toca no negócio.** Não move etapa, não mexe em data, não altera valor.
Empurrar o `prazo_resposta` seria mais barato e faria a coluna mudar de significado — de "data
de fechamento" para "quando eu vou cobrar" — e todo relatório que a lê passaria a mentir. É o
mesmo tipo de estrago do `fechado_em`.

**Padrão: 3 dias.**

### 5.3 🔴 O registro no Histórico de Movimentação, e a trava que ele encontra

**Decisão do dono do produto:** o adiamento aparece no Histórico de Movimentação do negócio
(`pedidos_historico_status`, o painel de `EditarPedido.tsx:1072`), sincronizado com a tabela
acima. Deixa de ser bilhete privado e vira registro — quem abre o negócio vê que alguém adiou,
quando e por quanto tempo.

A tabela já é uma linha do tempo genérica: tem `tipo`, `campo`, `valor_anterior_txt`,
`valor_novo_txt`. Hoje usa dois tipos: `status` e `campo`.

**Duas travas, medidas, que mudam a implementação:**

1. **Existe uma restrição que só aceita os dois tipos atuais:**

   ```sql
   CHECK ((tipo = 'status' AND status_novo IS NOT NULL)
       OR (tipo = 'campo'  AND campo       IS NOT NULL))
   ```

   Um `tipo = 'adiamento'` é recusado pelo banco. Precisa de migration nova que derrube e
   recrie a restrição incluindo o terceiro caso. **Não edite a migration antiga** (`CLAUDE.md`
   §6.3).

2. **A tabela não tem política de INSERT.** Só existe política de SELECT. Hoje ninguém escreve
   nela direto — só o gatilho, que é `SECURITY DEFINER` e por isso passa por cima da RLS. Um
   insert vindo do navegador **é recusado**.

**Portanto o ✓ passa por uma função de servidor**, não por duas chamadas do navegador:

```
pauta_adiar(p_tipo, p_referencia_id, p_dias)   -- SECURITY DEFINER
  1. confere que o negócio é meu e é da minha empresa
  2. grava em pauta_adiamentos
  3. grava a linha no pedidos_historico_status (tipo 'adiamento')
```

As três coisas na mesma transação. **Se forem duas chamadas separadas do navegador, uma pode
acontecer e a outra não** — e aí o item some da pauta sem registro nenhum, ou fica registrado
um adiamento que não adiou nada. É o tipo de divergência que só aparece meses depois, quando
alguém pergunta "por que esse negócio sumiu da minha lista?".

A política de SELECT do histórico já libera qualquer pessoa da empresa, então o vendedor vê o
próprio adiamento e o gestor também. Nenhuma mudança de permissão é necessária.

> **Não confundir com `historico_alteracoes`**, que é outra tabela, para auditoria, e cuja
> política de SELECT é **só de gestor**. Se o adiamento fosse para lá, quem adiou não
> conseguiria ver o próprio registro.

### 5.4 Os dois botões, e a diferença entre eles

| botão | o que faz |
|---|---|
| **"Montar follow-up"** (laranja) | abre o negócio para resolver de verdade |
| **✓** | "hoje não" — some por 3 dias, com registro no histórico |

Resolver de verdade — mudar a etapa, marcar como perdido — tira o item da pauta sem precisar do
✓, porque a condição "está numa etapa aberta" deixa de valer.

---

## 6. A aba Automação vira de verdade

Quatro controles que gravam em `configuracoes_automacao` (a tabela que já existe, por empresa, e
está vazia):

| controle | chave | padrão |
|---|---|---|
| Dias sem mudar de etapa para entrar na pauta | `pauta_dias_parado` | 3 |
| Mínimo de itens por dia | `pauta_min_itens` | 3 |
| Máximo de itens por dia | `pauta_max_itens` | 7 |
| Resumo diário por e-mail às 7h | `pauta_resumo_email` | desligado |

**Some da tela o que não existe.** "Obra fria" e "tabela de preço vencendo", que estão no
desenho, ficam de fora: são **0 obras cadastradas**, **nenhuma tabela de visita existe**, **0
tabelas de preço** e o campo de validade não existe. Voltam quando Obras e Catálogo tiverem
dados — colocá-las agora seria repor exatamente o defeito que esta entrega conserta.

**Cada controle salva e tem efeito.** É o critério de pronto desta seção: mexer no número e ver
a pauta mudar.

---

## 7. O lado do e-mail

### 7.1 O que o sistema manda hoje

Três disparos, todos do Supabase Auth:

| fluxo | onde nasce |
|---|---|
| Confirmar cadastro | `use-auth.tsx:360,365,373` (três variantes de `signUp`) |
| Redefinir senha | `EsqueciSenha.tsx:21` |
| Trocar e-mail | `Configuracoes.tsx:224` |

Os modelos **não estão no código** — o `supabase/config.toml` não tem seção de template. São os
padrões do painel, em inglês, sem marca.

E há uma integração de e-mail própria (Resend) preparada no banco, com aba de Domínio na tela:
**`user_integrations` tem 0 linhas, `user_domains` tem 0 linhas**, e não existe função de
servidor que envie por ali. Mesmo padrão da aba Automação — construído pela metade e
abandonado. **Fica de fora desta entrega.**

### 7.2 Remetente próprio

Hoje tudo sai do remetente padrão do Supabase, que é feito para desenvolvimento: limite baixo de
envios por hora e alta chance de cair em spam. Com 8 empresas e 26 pessoas, isso basta para
alguém não conseguir entrar no primeiro dia e ninguém entender por quê.

Passa a sair de `nao-responda@repplyhub.com.br`.

### 7.3 Os modelos

Quatro arquivos em `supabase/templates/`, versionados no repositório como fonte da verdade:

```
confirmar-cadastro.html
redefinir-senha.html
trocar-email.html
resumo-diario.html
```

**Por que no repositório e não só no painel:** modelo de e-mail vira código — passa por commit,
dá para ver o que mudou e dá para voltar atrás. Sem isso, alguém mexe no painel e não há
registro de quem, quando, nem como era antes.

**Por que a cópia é manual:** o `config.toml` do Supabase aceita apontar para arquivos de
template, mas isso exige rodar `supabase config push`, comando que **este projeto nunca usou** —
as mudanças de banco são aplicadas à mão. Adotá-lo agora sobrescreveria configuração de produção
sem ninguém perceber. Então: arquivo no repositório manda, cópia para o painel na publicação, e
o commit é o registro.

Identidade visual conforme `CLAUDE.md` §8 — laranja `#FF5A1F`, General Sans nos títulos,
Satoshi no corpo. Sem superlativo, sem linguagem de varejo.

### 7.4 O resumo diário

Um agendamento às 7h chama **a mesma função de banco que a tela usa** e transforma a pauta em
e-mail, para quem tiver `pauta_resumo_email` ligado.

**Uma regra só, dois consumidores.** Se a tela disser "5 orçamentos parados" e o e-mail disser
7, ninguém confia em nenhum dos dois — e é o tipo de divergência que leva meses para alguém
notar. Chamando a mesma função, é impossível divergirem.

---

## 8. O que NÃO entra

| item | por quê |
|---|---|
| Rastreio de abertura de PDF | não existe nada disso no sistema; a única tabela de "visualizações" é do WhatsApp |
| "Obra fria — 30 dias sem visita" | 0 obras cadastradas e nenhuma tabela de visita existe |
| "Tabela de preço vencendo" | 0 tabelas de preço, e o campo de validade não existe |
| "Mexeram num negócio meu" | é notícia, não tarefa — pertence ao sino, não à pauta |
| "Cliente falou e ninguém respondeu" | o dado existe, mas ficou fora da v1 por decisão |
| Terminar a integração Resend | 0 empresas configuraram; resolve um problema que ainda não existe |
| Trocar a tela inicial pós-login | decisão à parte, com efeito sobre 26 pessoas |

---

## 9. Ordem de execução

Cada fase é commitável e reversível sozinha.

| # | fase | por que nesta ordem |
|---|---|---|
| 1 | Migration: `pauta_adiamentos`, restrição do histórico, chaves de configuração | o resto depende do banco existir |
| 2 | A função de banco que monta a pauta (`SECURITY DEFINER`) | é o coração; dá para conferir por consulta antes de existir tela |
| 3 | `pauta_adiar` (RPC), com adiamento + histórico na mesma transação | precisa existir antes do ✓ aparecer |
| 4 | A tela "Hoje" + item na barra lateral + registro na seção | primeira coisa que o Lucas vê funcionando |
| 5 | A aba Automação de verdade | depois que a pauta existe, ajustar faz sentido |
| 6 | Remetente próprio (DNS + painel) — **passo do Lucas** | independente das outras; pode andar em paralelo |
| 7 | Os três modelos de e-mail de autenticação | depois do remetente, senão testa no lugar errado |
| 8 | Resumo diário: modelo + agendamento | por último; é o único que depende de tudo |

**As fases 6 e 7 são as únicas que dependem de ação fora do código.**

---

## 10. Riscos

**O funil pode estar mentindo.** 51 negócios abertos com mais de um ano, R$ 28 mil de média —
provavelmente orçamento morto que ninguém arquivou. Se for, a pauta vai insistir em fantasma.
Não dá para saber sem a MD olhar. **Medir depois de duas semanas:** item adiado três vezes
seguidas provavelmente está morto, e aí a tela pode oferecer "marcar como perdido" direto.

**A largada com todos os legados no mesmo relógio.** Os 193 abertos tiveram a última mudança de
etapa registrada na importação (18–21/08). Com corte de 3 dias, **todos entram na pauta ao mesmo
tempo** na primeira semana. A banda de 3 a 7 segura a tela, mas o link "ver os outros 186" vai
ser grande no começo. É honesto — eles estão parados mesmo — e melhora sozinho.

**Consulta sob regra de segurança — mas confira o índice ANTES de culpar a RLS.**

> ⚠️ **Correção de 24/08/2026, mesma tarde.** A primeira versão deste documento dizia que a
> lentidão da lista de negócios (2.118 ms) era a armadilha do `CLAUDE.md` §7.9 — a política de
> RLS cobrada por linha — e que o conserto era `SECURITY DEFINER`. **Estava errado**, e outra
> sessão derrubou por medição: faltava índice em `pedidos.created_at`, que é a ordenação
> padrão da lista. Sem ele o banco varria as 11.911 linhas para entregar 10 — e a política era
> cobrada 11.911 vezes como CONSEQUÊNCIA, não como causa.
>
> Com `idx_pedidos_created_at_id` criado e a política reescrita, medido nesta base:
> **2.118 ms → 18,6 ms**, e de 34.957 blocos lidos para 234.

A lição para quem for construir a pauta: a consulta ordena e corta poucas linhas, então
**garanta que a ordenação bate com um índice existente** antes de partir para `SECURITY
DEFINER`. Medir antes e depois, e escrever o número, continua valendo — foi medição que
derrubou o diagnóstico errado.

**DNS não é reversível em minutos.** Errar SPF ou DKIM pode fazer e-mail parar de chegar,
inclusive os que hoje chegam. Fazer com o site no ar, conferindo entrega antes de trocar o
remetente dos três fluxos.

**Adiamento sem registro, ou registro sem adiamento.** Resolvido por construção — as duas
escritas na mesma função de servidor (§5.3). Se alguém "simplificar" isso para duas chamadas do
navegador, o defeito volta.

---

## 11. Como saberemos que funcionou

**A linha de base, medida em 24/08/2026:** 36 notificações em 3 semanas, todas do mesmo tipo,
92% sem ninguém clicar, **zero** avisos de negócio parado — porque a automação nunca rodou.

**A pergunta que responde de verdade:** dos negócios abertos e parados, **quantos saíram desse
estado em 30 dias?** Se a pauta funcionar, esse número sobe e o valor parado cai. Se ninguém
mexer, a tela é bonita e inútil — e é melhor saber por medida do que por opinião.

Números para conferir em 30 dias, todos disponíveis por consulta:

| medida | hoje |
|---|---|
| negócios abertos parados | 193 |
| valor parado | R$ 14,4 mi |
| negócios abertos há mais de 3 meses | 65 |
| adiamentos registrados | — |
| itens que saíram da pauta por mudança de etapa | — |

---

## 12. O que precisa do Lucas

1. **Os três registros de DNS** no provedor do `repplyhub.com.br` — SPF, DKIM e DMARC. Os
   valores exatos vêm prontos, para copiar e colar.
2. **A configuração de SMTP no painel do Supabase** (Authentication → SMTP Settings), apontando
   o remetente para `nao-responda@repplyhub.com.br`.
3. **Colar os quatro HTMLs** nos modelos do painel do Supabase — o mesmo procedimento que já deu
   certo no Repply Imob.
4. **Autorização por commit**, como sempre (`CLAUDE.md` §13).

Nenhum desses quatro é acessível pelo código; os três primeiros são painel e DNS.

---

## 13. Coordenação

Há outra sessão de trabalho na mesma pasta. **Os arquivos desta entrega não se cruzam com os
dela** (Obras, Catálogo, Admin), com uma exceção: `src/pages/Configuracoes.tsx`, que é onde a
aba Automação vive. Conferir `git status` antes de cada commit e nunca usar `git add -A`.
