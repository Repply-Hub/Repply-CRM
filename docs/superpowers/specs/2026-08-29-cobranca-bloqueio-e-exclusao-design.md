# Cobrança, bloqueio e exclusão de empresa — desenho

> **Status: DESENHO APROVADO, nada implementado.** Decidido com o Lucas em 29/08/2026.
> Todos os números foram medidos no projeto `hukeirrmsoiowvvrhivx` na mesma data, por consulta
> de leitura. Onde houver estimativa, está dito.
>
> **Duas coisas JÁ FORAM feitas nesta conversa** e não fazem parte do que resta implementar:
> a migration `20260829120000_duas_funcoes_atravessavam_a_parede_entre_empresas.sql` (aplicada
> em produção) e a correção do rótulo em `src/lib/situacao-empresa.ts`. Ver §8.

---

## 1. O contexto que motivou o trabalho

O Lucas está entrando em fase de divulgação e captação. Hoje a cobrança existe pela metade:
há Stripe, checkout e webhook funcionando, mas nenhuma régua de inadimplência, nenhum aviso,
nenhuma tela de cobrança acessível e nenhuma forma de encerrar um cliente.

O pedido original era só "um botão de excluir empresa". O levantamento mostrou que a exclusão
depende de um bloqueio que funcione, e que o bloqueio de hoje cobre 5 tabelas de 66.

### Como o negócio funciona hoje (importa para o desenho)

Os primeiros clientes entram por **cortesia**, com pagamento negociado por fora. Eles chegam
ao checkout, não pagam, e a equipe libera pelo painel de admin. Isso **continua valendo** — a
régua automática desenhada aqui não os alcança.

---

## 2. O que foi medido

### 2.1 As 9 empresas, em 29/08/2026

| Origem | Quantas | Quais |
|---|---|---|
| `cortesia` | 4 | House Design, JHS, PR & Cocentino, Teste |
| `legacy` | 3 | **MD Representações**, MD, Climb |
| `stripe` ativo | 1 | TESTE (a única com assinatura real) |
| `stripe` inativo | 1 | Teste Empresa |

Volume concentrado na MD Representações: 13 usuários, 1.305 clientes, 11.910 negócios,
82 obras, 56.873 mensagens de WhatsApp.

### 2.2 🔴 O isolamento entre empresas NÃO é por `empresa_id`

Descoberta que manda no desenho da exclusão.

- `clientes.empresa_id` está **NULO nas 1.306 linhas**. A coluna existe, tem chave
  estrangeira, e nunca é preenchida.
- `pedidos` e `obras` **não têm** coluna de empresa.
- O vínculo real é `usuario_id → usuarios.empresa_id`.

A corrente é: `empresa ← usuário ← cliente ← obra ← negócio`.

**Consequência:** `delete from clientes where empresa_id = X` apaga **zero linhas e devolve
sucesso**. Qualquer rotina de limpeza que confie no nome da coluna erra em silêncio.

### 2.3 🔴 O elo de cima é `ON DELETE SET NULL`

`usuarios.empresa_id → empresas(id)` é **SET NULL** (constraint `vendedores_empresa_id_fkey`,
medida no catálogo; os arquivos de migration divergem entre si — não confie neles para esta
coluna).

Apagar a linha de `empresas` **não apaga a equipe**: zera o `empresa_id` de cada pessoa. E
como clientes e negócios só se ligam à empresa por `usuarios`, os 11.910 negócios continuam
no banco **sem que ninguém consiga dizer de quem eram**. Nem para apagar depois, nem para
devolver se foi engano.

**Por isso a apagada definitiva vai de baixo para cima**, e a empresa é a última a sair.

### 2.4 Hoje a exclusão é recusada — e isso é sorte, não proteção

8 chaves estrangeiras para `empresas` são `NO ACTION`: `clientes`, `configuracoes_automacao`,
`configuracoes_campos`, `fabricantes`, `historico_alteracoes`, `marcadores`,
`marcadores_obras`, `permissao_presets`. Gatilhos de criação garantem que toda empresa nasce
com linha em pelo menos quatro delas.

Confirmado por simulação em transação desfeita: o `delete from empresas` foi recusado até
para uma empresa vazia.

A política `empresas_delete USING is_admin()` **já existe** — o banco já autoriza o admin a
apagar. O que segura é a chave estrangeira, não uma decisão.

> ⚠️ **Não "conserte" isso trocando as 8 para CASCADE.** É exatamente o que destrava o cenário
> de 2.3.

### 2.5 O alcance do bloqueio atual

`empresa_plano_ativo()` é citada em **9 políticas**, cobrindo **5 tabelas**, só em
INSERT/UPDATE:

- INSERT: `clientes`, `contatos`, `obra_contatos`, `obras`, `pedidos`
- UPDATE: `clientes`, `contatos`, `obras`, `pedidos`

São 81 tabelas no schema, **66 aceitam escrita**. Faltam **61**.

**DELETE está livre nas 5.** A migration `20260803140402_gate_plano_escrita.sql:19-22`
documenta que foi de propósito: *"impedir alguém de apagar os próprios dados não protege
receita nenhuma"*. **Esta decisão foi invertida pelo Lucas em 29/08/2026** — a migration nova
deve dizer isso, senão o próximo a ler os dois arquivos não sabe qual vale.

### 2.6 O custo do bloqueio é irrelevante

`empresa_plano_ativo()` não recebe coluna como argumento, então o Postgres a resolve como
**One-Time Filter: 1,7 ms uma vez por comando**, mesmo varrendo 60.188 linhas.

A armadilha do `CLAUDE.md` §7.9 (função de RLS cobrada por linha) **não se aplica**. Estender
para as 81 tabelas é barato.

### 2.7 Serviços externos e arquivos

| Item | Situação | Risco na exclusão |
|---|---|---|
| Stripe | `empresa_assinaturas` é a **única** fonte do `stripe_subscription_id`, e é CASCADE | apaga junto → **continua cobrando** sem como cancelar |
| Cancelamento no Stripe | **não existe no código** — só leitura | tem de ser escrito |
| Nylas (e-mail) | `email_contas` CASCADE, sem revogar | custo mensal + **continuamos com acesso à caixa de um ex-cliente** |
| uazapi (WhatsApp) | `configuracoes_wapi` CASCADE, o token some junto | instância viva, sem como apagar depois |
| Storage | 7 baldes, 23.120 objetos, ~8,2 GB | **SQL é proibido de apagar arquivo** (gatilho); só a API |

**Rede de segurança do Stripe:** todo Customer e Subscription levam
`metadata.empresa_id`. Guardar o UUID antes de apagar permite achar a assinatura depois.

### 2.8 Infra de aviso que já existe

- **E-mail:** Resend, em `supabase/functions/pauta-resumo-diario/`, com layout de marca
  testado em Gmail/Outlook. Comprovadamente funcionando.
- **Aviso na tela:** tabela `notificacoes` + sino, em tempo real. É **por usuário** (não tem
  `empresa_id`), então avisar uma empresa é uma linha por pessoa — irrelevante com 27 pessoas.
- **Faixa no topo:** **não existe**, precisa ser criada. Um ponto cobre 23 das 30 telas.
- **Tela de bloqueio:** `/assinar` está pronta, com dois caminhos (gestor vê preço; funcionário
  vê "peça ao gestor").
- **Agendador:** `pg_cron` com 7 rotinas e o padrão `public.chamar_edge_function(...)` pronto.

### 2.9 🔴 CORRIGIDO EM 30/08/2026: `VITE_PAYWALL_ATIVO` estava LIGADO

**A primeira versão deste documento afirmava o contrário, e estava errada.** A correção fica
registrada porque o erro é fácil de repetir.

A variável **não existe em lugar nenhum do repositório** — nem no `.env`, nem no
`.env.example` preenchido, nem no `vercel.json`. Ela mora no painel da Vercel. Quem levanta o
estado lendo o repositório conclui "desligado", e o repositório simplesmente não sabe.

O que resolve a dúvida é olhar o que está no ar. O valor é fixado no momento da compilação,
então ele aparece literalmente dentro do arquivo publicado:

```sh
js=$(curl -s https://crm.repplyhub.com.br/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "https://crm.repplyhub.com.br$js" | grep -oE '\["true","1","sim"\]\.includes\([^)]*\)'
# -> ["true","1","sim"].includes("true".trim()      ou seja: LIGADO
```

**A consequência era maior que o erro de fato.** Com o desvio ligado, empresa bloqueada não
ficava em somente-leitura: era **expulsa** para `/assinar`, sem ver nada e sem caminho de
volta a não ser sair da conta. Isso é o degrau da SUSPENSÃO (dia 30) disparando no dia 15 —
pulava o estágio intermediário, que é justamente o que faz o cliente pagar.

Ninguém percebeu porque a única empresa nesse estado é a "Teste Empresa", com 1 usuário.

**Decisão do Lucas em 30/08/2026:** vale o desenho. O desvio automático foi desligado
(`src/App.tsx`), a faixa `<FaixaDeCobranca>` passou a explicar o bloqueio, e a tela `/assinar`
continua de pé como destino do botão da faixa. A suspensão da etapa 4 volta a usar aquele
ponto, com um predicado próprio.

**Também é valor de compilação**, o que significa: não há interruptor instantâneo, e mudá-lo
custa uma publicação. Se um dia for preciso ligar e desligar sem publicar, o projeto já tem o
padrão pronto — `use-secoes.ts` lê a resposta do banco pela mesma função que a regra de
segurança usa, justamente para tela e banco não divergirem.

### 2.10 Exportação não tem como ser bloqueada

Confirmado: a API REST devolve CSV nativamente (`Accept: text/csv` → 200). Com o token de um
usuário da empresa bloqueada dá para baixar tudo **sem abrir o CRM**. Some-se o Ctrl+P e os
6 baldes públicos.

Isso valida a decisão do Lucas de deixar exportação liberada: além de ser a prática de mercado
e a mais segura na LGPD, é a **única cumprível**.

### 2.11 Achado fora de escopo, registrado

**6 dos 7 baldes de arquivo são públicos.** Um agente baixou, sem nenhuma credencial, um PDF
de orçamento (682 KB) e uma imagem de WhatsApp de cliente. As políticas de leitura por empresa
já existem e estão **inertes** até o balde fechar.

Não faz parte deste desenho. Precisa de decisão própria do Lucas.

---

## 3. Decisões de produto tomadas

Todas do Lucas, em 29/08/2026.

| # | Decisão |
|---|---|
| 1 | A régua automática vale **só para quem paga pelo Stripe**. Cortesia e legacy ficam fora, no controle manual da equipe. |
| 2 | Bloqueado = **só ver**. Não cria, não edita, não apaga, não usa WhatsApp/e-mail/chat/tarefas/agenda. |
| 3 | **Exportar continua liberado** (ver 2.10). |
| 4 | Aos 90 dias o sistema **avisa e a equipe confirma** a exclusão. Não apaga sozinho. |
| 5 | O botão de excluir segura os dados por **60 dias**, reversível. |
| 6 | Restaurar devolve ao **estado exato de antes**, não a um estado fixo. |
| 7 | No dia do clique, **só a cobrança do Stripe** é desfeita. E-mail, WhatsApp e arquivos ficam até o dia 60. |
| 8 | O teste de 7 dias tem **régua própria**, separada da escada de inadimplência. |
| 9 | E-mails vão para **todos os gestores**, com cadência definida (§4.3). |
| 10 | A aba Pagamentos é visível **só para dono e gestores**. |
| 11 | Cancelar **pergunta o motivo** antes de mandar ao Stripe. |
| 12 | A preferência de assinar remetente do WhatsApp **continua global**, só o admin muda. |

---

## 4. Parte 1 — a escada de cobrança

### 4.1 Quem entra

Só empresa com assinatura real no Stripe (`stripe_subscription_id IS NOT NULL`). Hoje: 1.

Cortesia, legacy e "cadastrou e não pagou" **não entram**.

### 4.2 Os degraus

| Dia | Degrau | Efeito | O cliente vê |
|---|---|---|---|
| 0 | cartão falhou | nenhum | nada (Stripe retenta sozinho) |
| 1–14 | tolerância | nenhum | faixa amarela + e-mail |
| 15 | somente leitura | trava de escrita (§6) | faixa vermelha + e-mail |
| 30 | suspensão | `/assinar` cobrindo a tela, fundo desfocado | tela + e-mail |
| 90 | fim do prazo | aparece no painel de admin para a equipe confirmar | continua na tela de suspensão |

A tela do dia 30 diz: houve 30 dias de avisos · o acesso acabou · **os dados não foram
perdidos** · restam 60 dias para resolver.

Qualquer ação da equipe (cortesia, liberar prazo, desbloquear) **para a escada e zera o
relógio**.

### 4.2.1 🔴 Os três relógios são independentes — e nenhum se soma ao outro

Escrito porque a primeira versão deste documento deixava a dúvida, e ela decide quando dado de
cliente some para sempre.

| Relógio | Começa quando | Dura | No fim |
|---|---|---|---|
| **Inadimplência** | o pagamento falha | 90 dias | equipe confirma → **apagada definitiva** |
| **Teste de 7 dias** | o teste vence | 60 dias | equipe confirma → **apagada definitiva** |
| **Botão de excluir** | alguém clica | 60 dias | equipe confirma → **apagada definitiva** |

**A confirmação do dia 90 NÃO inicia mais 60 dias.** Os 60 dias de retenção já estão dentro
dos 90 (dia 30 suspende, dia 90 encerra) — é exatamente o que a tela de suspensão promete ao
cliente. Somar outro prazo faria a tela mentir para menos, o que é o erro seguro, mas
manteria dado de ex-cliente por 150 dias sem que ninguém tivesse decidido isso.

O prazo de 60 dias do botão de excluir existe para o caso em que **não houve escada nenhuma**
— você encerrando uma cortesia, uma empresa de teste ou um cliente que saiu no combinado.

### 4.3 Cadência dos e-mails

**8 e-mails em 90 dias**, nunca dois seguidos:

| Degrau | Dias |
|---|---|
| tolerância | 1, 10 |
| somente leitura | 15, 23 |
| suspensão | 30, 45, 60, 83 |

O dia 83 é uma semana antes do prazo final — última chance de reagir.

**Idempotência é obrigatória.** Cada aviso fica registrado por (empresa, degrau, data). A
rotina roda todo dia e confere antes de mandar. Sem isso, um cron diário manda o mesmo e-mail
90 vezes — é o erro clássico desse tipo de rotina.

### 4.4 Régua do teste de 7 dias (separada)

| Momento | O que acontece |
|---|---|
| dia 7 | **Quadro modal**: o teste acabou · dados guardados por 60 dias · assine para não perdê-los. Com **X** para fechar. |
| fechou o X | Entra em somente leitura, com **faixa azul** no topo: "modo leitura — seu teste acabou · dados salvos por 60 dias · assine para voltar a usar" |
| dia 67 | Aparece no painel de admin para a equipe confirmar a exclusão |
| cortesia a qualquer momento | Para tudo, vira cortesia normal |

### 4.5 A faixa no topo — quatro versões

1. 🟡 tolerância — "pagamento pendente, resolva até dd/mm"
2. 🔴 somente leitura (pagamento)
3. 🔵 somente leitura (teste acabou) — com o prazo dos 60 dias
4. ⚪ conta encerrada — durante os 60 dias do botão de excluir

### 4.6 O que dispara

Uma rotina diária às 8h, no padrão `chamar_edge_function` que já existe.

---

## 5. Parte 2 — a seção de Pagamentos

Aba nova em Configurações, ao lado de Perfil / Vendedores / WhatsApp / Automação / Campos /
Empresas. Visível só para dono e gestores — que é o que a função `stripe-portal` já exige por
baixo.

### 5.1 O ambiente multi-planos JÁ EXISTE

A tabela `planos` tem: `slug`, `nome`, `descricao`, `preco_centavos`, `moeda`, `intervalo`,
`stripe_price_id`, `beneficios` (JSONB), `selo`, `visivel`, `ordem`.

E `stripe-checkout` já aceita `{ plano: "slug" }`, com padrão `"lancamento"`.

Hoje há **1 plano**: "Plano de Lançamento", R$ 2.997,00/**ano**, 5 benefícios, selo "Condição
de lançamento".

**Criar o segundo plano é inserir uma linha.** A tela deve desenhar N planos a partir da
tabela, ordenados por `ordem`, filtrando `visivel`.

### 5.2 O que a tela mostra, por situação

| Situação | Conteúdo |
|---|---|
| cortesia / legacy | "Acesso por cortesia — sem cobrança". **Sem botão de cancelar** (não há o que cancelar) |
| em teste | dias restantes + data + `[Assinar agora]` |
| pagante | plano, preço, data de renovação + `[Ver faturas]` `[Trocar cartão]` `[Trocar de plano]` `[Cancelar]` |
| não pagou / bloqueada | os planos disponíveis, com `[Assinar]` em destaque |

### 5.3 Divisão com o Stripe

| Nosso | Do Stripe (portal hospedado) |
|---|---|
| plano atual, preço, renovação | histórico de faturas e recibos |
| comparação de planos e escolha | troca de cartão |
| situação (cortesia/teste/bloqueado) | efetivar o cancelamento |

Fatura, recibo e cartão são mecânica de dinheiro que o Stripe já resolve em pt-BR, sempre em
dia, sem a gente tocar em número de cartão. Refazer significaria manter uma cópia sincronizada
de algo que não é nosso.

`stripe-portal` já faz isso e funciona — só não há como chegar nele hoje.

### 5.4 Cancelamento

Tela nossa perguntando o motivo (lista curta + campo livre), gravada para análise, e só então
o portal do Stripe. O acesso continua até o fim do período pago — comportamento padrão do
Stripe, não precisa de código.

---

## 6. Parte 3 — o cerco do bloqueio

### 6.1 O que trava e o que não trava

**Trava:** criar, editar, apagar, WhatsApp, e-mail, chat, tarefas, agenda, anexar arquivo.

**Continua liberado:**

| O quê | Por quê |
|---|---|
| ver e exportar | decisão 3 |
| **pagar e arrumar o cadastro da empresa** (`usuarios`, `empresas`, `empresa_assinaturas`) | travar impede o cliente de te pagar |
| **marcar como lido** (`chat_mensagens_leituras`, `whatsapp_conversa_visualizacoes`, `notificacoes_leituras`) | é leitura disfarçada de escrita |
| **preferência de tela** (`sidebar_preferences`, `notificacoes`) | não protege receita, só irrita |
| entrar e sair | óbvio |

### 6.2 Como vira regra automática — três camadas

**O que NÃO dá:** default-deny puro no Postgres. `GRANT` é por papel e todo cliente entra como
`authenticated` — revogar bloqueia todo mundo ou ninguém. E `CREATE EVENT TRIGGER` exige
superusuário, que o papel `postgres` deste projeto não tem (`rolsuper = false`).

**O que dá:**

1. **Função geradora + rotina diária.** Uma função percorre `pg_tables` e cria a política
   restritiva que faltar, para toda tabela do inquilino que não esteja na lista de exceções
   (§6.1). Agendada no `pg_cron`. Tabela criada hoje está trancada amanhã.
2. **Teste que quebra o build.** No molde de `src/test/comentario-vazado-no-jsx.test.ts`: lê
   as migrations, e falha apontando arquivo e linha quando uma tabela nova não tem o gate.
3. **Checklist oficial.** `docs/arquitetura/permissoes-e-rls.md:204-213` hoje **não cita** o
   gate. Passa a citar.

> A camada 1 é a que funciona sozinha; a 2 é a que avisa cedo; a 3 é a que ensina.
> **Prova de que lista humana não basta:** o gate foi copiado para `obra_contatos` em
> 27/08/2026 e saiu pela metade — só INSERT.

### 6.3 As três portas que a RLS nunca alcança

| Porta | Quantas | Como fechar |
|---|---|---|
| Funções `SECURITY DEFINER` que escrevem | 8 alcançáveis pelo app | `IF NOT empresa_plano_ativo() THEN RAISE EXCEPTION` no corpo |
| Funções de servidor (`service_role`) | ~40, só 1 com gate | checagem explícita antes de gravar |
| Storage | 23 políticas, nenhuma restritiva | política restritiva de escrita nos baldes |

As 8 funções: `criar_funil`, `delete_obras_bulk`, `delete_current_user`,
`liberar_envio_de_catalogo`, `reservar_envio_de_catalogo`, `restaurar_usuario_por_email`,
`set_whatsapp_assinar_remetente_global`, `wa_iniciar_conversa`.

> `delete_current_user` é exceção: apagar a própria conta deve continuar funcionando
> bloqueado (LGPD).

---

## 7. Parte 4 — exclusão de empresa

### 7.1 O fluxo

| Quando | O que acontece |
|---|---|
| **dia 0** | Confirma digitando o **nome da empresa** · cancela a assinatura no Stripe **na hora** · guarda o `empresa_id` e os identificadores externos · marca como excluída · ninguém entra mais · **nada é apagado** |
| **dias 1–60** | Painel mostra "Excluída — apaga em X dias" + `[Restaurar]`. Restaurar devolve ao **estado exato de antes** (§7.2) |
| **dia 60** | Aparece no painel para a equipe **confirmar** a apagada definitiva |
| **na confirmação** | §7.3 |

### 7.2 Restaurar devolve ao estado anterior, não a um estado fixo

O botão será usado em empresas de três origens. Se restaurar sempre voltasse para "suspensa
por falta de pagamento", restaurar uma **cortesia** a colocaria numa parede falando de um
problema de pagamento que nunca existiu.

Por isso o registro da exclusão guarda `plan_status`, `origem` e `current_period_end`
anteriores. Uma regra, três casos certos.

Ressalva: no caso da escada, restaurar **não resolve o pagamento** — a empresa volta suspensa
e ainda precisa de cortesia ou prazo. São dois gestos, e é bom que sejam.

### 7.3 A ordem da apagada definitiva

🔴 **De baixo para cima. A empresa é a ÚLTIMA a sair** (motivo em §2.3).

1. Ler e guardar os identificadores externos (já não há assinatura — cancelada no dia 0).
2. **Revogar externos:** Nylas (`DELETE /v3/grants/{id}`) e uazapi (reaproveitar a ação
   `delete` de `whatsapp-admin-provision`, que já aceita admin — **mas conferir o retorno**,
   hoje ela engole o erro).
3. **Apagar arquivos** pelos 7 baldes via Storage API com `service_role`. SQL não serve.
4. **Apagar dados**, de baixo para cima: itens → negócios → obras → contatos → clientes →
   as 6 tabelas com `empresa_id` sem chave estrangeira (`funis`, `kanban_colunas`,
   `tarefas_kanban_colunas`, `sidebar_empresa_padrao`, `sidebar_empresa_padrao_historico`,
   `whatsapp_webhook_origem`) → as 8 tabelas `NO ACTION` → os logins → **a empresa**.
5. Registrar o que foi apagado, com contagens.

> Tem de ser um programa que roda no servidor, **não uma migration**: storage exige a API, e
> Stripe/Nylas/uazapi exigem chamadas HTTP.

### 7.4 O que os usuários veem nos 60 dias

Mensagem **neutra**, diferente da de cobrança:
*"Esta conta foi encerrada. Fale com o suporte."*

Sem inventar problema de pagamento, e sem dizer "seus dados serão apagados em 60 dias" — essa
é informação nossa, não deles.

---

## 8. Já feito nesta conversa (fora do que resta implementar)

### 8.1 Migration aplicada em produção

`supabase/migrations/20260829120000_duas_funcoes_atravessavam_a_parede_entre_empresas.sql`

Duas funções `SECURITY DEFINER` atravessavam a parede entre empresas. 15 pessoas em 9 empresas
passavam na checagem das duas.

- `delete_obras_bulk` apagava obra de **qualquer** empresa (sem filtro de inquilino). Agora usa
  o mesmo filtro da política `obras_delete`. Efeito colateral desejado: o admin global também
  deixa de apagar obra de cliente, alinhando com
  `20260804195019_admin_geral_sem_acesso_ao_conteudo_dos_clientes.sql`.
- `set_whatsapp_assinar_remetente_global` fazia `UPDATE empresas SET ...` **sem WHERE**, e
  aceitava `is_gestor()`. O alcance global é proposital; a permissão é que estava errada. Agora
  só `is_admin()`.

### 8.2 Rótulo corrigido

`src/lib/situacao-empresa.ts` usava "tem cadastro no Stripe" como sinal de "já pagou". O
cadastro nasce ao **abrir o checkout**, antes de qualquer cobrança.

Caso real: "Teste Empresa" aparecia como **"Pagamento parado"** sem nunca ter pago. Agora usa
`tem_assinatura_stripe`, que a RPC `admin_empresas_cs` **já devolvia desde 04/08/2026**.

Isso é pré-requisito da escada: sem ele, quem nunca foi cliente entraria na régua de
inadimplência e acabaria marcado para exclusão.

---

## 9. Ordem de implementação sugerida

| # | Etapa | Por quê nesta ordem |
|---|---|---|
| 1 | Fechar o cerco do bloqueio (§6) | é a base de tudo; sem ele "somente leitura" não existe |
| 2 | Faixa no topo + desligar o desvio automático (§4.5, §2.9) | sem isso o bloqueio é mudo — e expulsa em vez de deixar ver |
| 3 | Seção de Pagamentos (§5) | dá ao cliente como resolver antes de a régua apertar |
| 4 | Escada + rotina diária + e-mails (§4) | depende de 1, 2 e 3 |
| 5 | Botão de excluir com 60 dias (§7.1, §7.2) | reversível, seguro de entregar |
| 6 | Apagada definitiva (§7.3) | a única irreversível; por último, com tudo testado |

---

## 10. O que este desenho NÃO cobre

- **Os 6 baldes públicos** (§2.11). Decisão própria do Lucas.
- **Os dois buracos do bloqueio antigo** que ficaram registrados: bloqueado continuar usando
  WhatsApp/e-mail é resolvido aqui; o resto do alcance é o que §6 cobre.
- **Recuperação de assinatura** (retenção, desconto, pausa). Só o motivo é coletado (§5.4).
- **Vários planos de fato.** A estrutura fica pronta (§5.1), mas criar o segundo plano é
  decisão comercial.
- **Migração das 3 empresas `legacy`** para cortesia ou para assinatura. Elas ficam fora da
  régua por decisão 1; se um dia entrarem, é gesto manual.
