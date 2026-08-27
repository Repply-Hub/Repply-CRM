# Drive de catálogos por fabricante — desenho

> **Status: DESENHO APROVADO, nada implementado.** Decidido com o Lucas em 26/08/2026.
> Todos os números deste documento foram medidos no projeto `hukeirrmsoiowvvrhivx` na mesma
> data, por consulta de leitura. Onde houver estimativa, está dito.

---

## 1. A decisão de produto

Os sócios decidiram que **catálogo de produtos vira plano futuro**. Para o MVP, o que a
representação precisa não é cadastrar produto a produto — é ter o **PDF do catálogo da
fábrica à mão e conseguir mandá-lo para o cliente em um clique**.

Isso troca um módulo de cadastro por um de arquivo, e derruba por consequência a aba de itens
na criação de negócio.

### Por que a decisão é sólida, e não uma desistência

Medido em 26/08/2026:

| | |
|---|---|
| `tabela_precos` (o catálogo) | **0 linhas**, em todas as 8 empresas |
| `itens_pedido` | **1 linha**, para 1 negócio |
| negócios no total | **11.910** |
| itens criados DENTRO do CRM (após a importação) | **0** |
| `src/pages/Catalogo.tsx` | 468 linhas, **já órfã** — sem rota, sem import |
| balde `catalogo-produtos` | **0 arquivos** |

O módulo não está sendo removido em uso. Ele nunca entrou em uso: um item em 11.910 negócios,
nenhum criado dentro do sistema. A tela principal dele já era inalcançável antes desta
conversa.

---

## 2. Escopo, e o que fica de fora

**Dentro:**

1. Drive de arquivos por fabricante, com edição datada e envio por WhatsApp
2. Remoção do módulo de catálogo de produtos, com documento de retomada
3. Reorganização do passo 2 do Novo Negócio (e da tela de editar)

**Fora, de propósito:**

- Limite de frequência no `whatsapp-send` inteiro (ver §8.4 — vai para a dívida técnica)
- Qualquer limite comercial por plano (ver §9)
- Pré-visualização de formato que o `FilePreviewDialog` ainda não cobre

São **duas mudanças independentes** — a limpeza e o drive não dependem uma da outra e podem
ir ao ar separadas. A ordem sugerida está na §10.

---

## 3. Onde o drive vive

Substitui o cartão **"Catálogo de Produtos"** dentro da ficha da fábrica, em
`src/pages/Fabricantes.tsx`. O novo título é **"Catálogos, folders e materiais"**.

**Não há seção nova na barra lateral.** `fabricantes` já é uma seção existente e não
desligável, então o drive nasce disponível para todas as empresas sem nada a configurar em
`secao_presets`.

---

## 4. Os dados

### 4.1 `fabricante_arquivos`

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `empresa_id` | uuid not null | o inquilino; é o que faz "a empresa inteira vê" |
| `fabricante_id` | uuid not null | `on delete cascade` |
| `nome` | text not null | começa com o nome do arquivo, editável |
| `caminho` | text not null | o objeto no Storage |
| `capa_caminho` | text null | a miniatura da 1ª página, só para PDF (§6.2) |
| `tamanho` | bigint not null | |
| `mime` | text | |
| `edicao_ano` | int **not null** | |
| `edicao_mes` | int null | 1–12; nulo = "catálogo do ano" |
| `enviado_por` | uuid | 🔴 aponta para `usuarios(id)`, **não** para `auth.users` — ver §4.4 |
| `created_at` | timestamptz | |

**Ordenação padrão:** `edicao_ano desc, coalesce(edicao_mes, 0) desc, created_at desc`.
O `coalesce(…, 0)` é o que faz "set/2026" vir antes de "2026" — a edição do ano inteiro se
comporta como se fosse de janeiro, então a mensal mais recente ganha. A edição vigente fica
sempre no primeiro cartão.

**Restrição:** `edicao_mes between 1 and 12` quando não nulo. Sem isso, um mês 13 entra e a
etiqueta do cartão fica sem sentido.

### 4.2 `fabricante_arquivo_envios`

Registra cada envio por WhatsApp. **É a mesma tabela que faz as três travas da §8** — não é
auditoria por zelo, é o mecanismo.

| coluna | nota |
|---|---|
| `id` | uuid pk |
| `arquivo_id` | `on delete cascade` |
| `empresa_id` | para contar por empresa sem juntar tabela |
| `contato_id` | quem recebeu. Aceita nulo **só** para o caso do contato ser excluído depois — não existe caminho de envio sem escolher contato (§7.1) |
| `telefone` | o número normalizado que foi usado de fato |
| `instancia_id` | 🔴 **de qual número saiu** — é a contagem que protege o ativo (§8.2) |
| `usuario_id` | quem mandou |
| `enviado_em` | timestamptz |

**Índices que as travas exigem** (sem eles a contagem vira varredura a cada clique):
`(instancia_id, enviado_em)`, `(usuario_id, enviado_em)`, `(arquivo_id, contato_id, enviado_em)`.

**De graça, vira funcionalidade:** o cartão pode mostrar "enviado para 12 clientes", e dá
para saber quem já recebeu a edição de setembro.

### 4.3 Regras de segurança (RLS)

| ação | quem |
|---|---|
| ver | qualquer pessoa da mesma empresa |
| anexar | qualquer pessoa da mesma empresa |
| editar nome/edição | qualquer pessoa da mesma empresa |
| **excluir** | **gestor OU quem tem "excluir" no módulo `fabricantes`** |

A regra de excluir copia o padrão que já existe em `pedidos`, aplicado em
`20260824143000_pedidos_rls_fase_zero.sql`:

```sql
is_gestor() OR has_permission(get_my_usuario_id(), 'fabricantes', 'excluir')
```

**Nenhum módulo de permissão novo.** O módulo `fabricantes` já existe em
`permissoes_usuario` com a coluna `pode_excluir` — medido: 10 pessoas da MD têm linha nele,
1 pode excluir.

🔴 A trava vale no banco, não na tela. O botão escondido é conveniência; quem protege é a RLS.

### 4.4 A armadilha do identificador

`enviado_por` aponta para **`usuarios(id)`**, então o código manda `profile.id`.

Isto é decidido aqui e não no código porque **mordeu duas vezes em 26/08/2026**: as colunas
"quem fez" deste banco se dividem entre `usuarios(id)` e `auth.users(id)`, e mandar o errado
faz a gravação inteira ser recusada pela chave estrangeira, em silêncio. Ver `CLAUDE.md` §4.5.
Confira com:

```sql
select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'fabricante_arquivos'::regclass;
```

---

## 5. O armazenamento

### 5.1 Balde privado desde o nascimento

Balde novo `fabricante-arquivos`, **privado**, caminho no formato
`{empresa_id}/{fabricante_id}/{uuid}-{nome}`. A primeira pasta é o que permite à política do
Storage recusar quem é de outra empresa.

🔴 **Isto é diferente de tudo que existe hoje.** Os 7 baldes atuais são abertos — medido em
24/08/2026, qualquer pessoa com o link baixa os 5,0 GB de anexos de negócio e as 110 imagens
de e-mail de clientes da MD, sem login. A outra sessão está migrando isso
(`docs/operacao/plano-baldes-privados.md`) e já entregou a ferramenta do link temporário em
`src/lib/arquivo-privado.ts`.

Nascer público seria criar o **oitavo balde aberto** justamente enquanto os sete fecham — com
catálogo de representada, que é material comercial de terceiro. Custo de nascer certo: zero,
porque a ferramenta já existe.

**A miniatura segue a mesma regra.** Ela mostra a capa do catálogo; não faz sentido fechar o
PDF e deixar a capa aberta.

### 5.2 Teto de 50 MB

O teto **não existe para racionar** — existe para o erro ser rápido. Sem ele, quem arrastar um
vídeo por engano espera vinte minutos por uma falha no meio do caminho.

Por que 50 e não 100:

- **O WhatsApp tem teto próprio para documento, na casa dos 100 MB.** Empatar com ele cria o
  pior cenário: o arquivo sobe, aparece no drive, e **só falha na hora de enviar** — na frente
  do cliente. Teto abaixo do limite da plataforma faz o erro acontecer no upload, onde é barato.
- Corroboração dentro do próprio sistema: o balde `whatsapp-media` está em **16 MB**, que é
  exatamente o limite do WhatsApp para imagem, vídeo e áudio. Quem configurou conhecia os
  limites.
- Acima de ~50 MB o upload pelo navegador começa a cair com internet fraca, e representante
  em obra tem internet fraca.
- Folga real: o **maior arquivo entre 14.997 anexos de negócio tem 10 MB**. 50 MB dá cinco vezes.

⚠️ **Confirmar o limite real da uazapi com um teste antes de liberar**, em vez de confiar na
documentação do WhatsApp. Se for mais restritivo, o teto do balde acompanha.

### 5.3 O custo, para não virar surpresa

Medido: **7,6 GB em ~22 mil arquivos**, contra 100 GB inclusos no plano Pro do Supabase — cerca
de 8%. Espaço não é o problema.

O custo que **esta funcionalidade cria** é outro: cada envio faz o servidor da uazapi baixar o
arquivo inteiro. Um catálogo de 50 MB para 100 clientes são **5 GB saindo**. Não é impeditivo;
é o número que muda a conversa se alguém propuser "mandar para a base toda".

---

## 6. A tela

### 6.1 Grade de cartões, não lista

Retângulos de bordas arredondadas lado a lado, em grade que se ajusta à largura. **Não é
lista** — foi pedido explicitamente.

Cada cartão traz:

- a **miniatura** da primeira página (PDF) ou o ícone do formato
- o nome
- a **etiqueta da edição**: `set/2026` ou `2026`
- tamanho e quem anexou

Quatro ações: **ver**, **baixar**, **enviar no WhatsApp**, **excluir** (esta só para quem pode).

Todos os cartões têm a mesma altura, com ou sem miniatura — grade irregular é o que faz a tela
parecer quebrada.

### 6.2 A miniatura da primeira página

**Gerada no navegador, no momento de anexar** — não a cada exibição. Gerar na hora de mostrar
obrigaria a baixar até 50 MB para desenhar um quadrado, toda vez que alguém abrisse a fábrica.
Gerada no upload, o cartão carrega uma imagem de dezenas de KB.

- Biblioteca nova: `pdfjs-dist`, **carregada sob demanda** só quando há um PDF para anexar.
  Não pesa em quem só navega.
- **Falhar não trava o anexo.** PDF protegido ou arquivo estranho cai no ícone do formato, e o
  upload segue.
- Só PDF. Planilha e Word não têm "primeira página" visual sem abrir um editor inteiro.

### 6.3 Pré-visualização

Reaproveita **`src/components/chat/FilePreviewDialog.tsx`**, que já resolve PDF (iframe),
planilha (converte para tabela com `xlsx`, já dependência do projeto), Word, e tem estado
honesto para o que não dá para mostrar.

Não construir outro. Dois visualizadores divergem, e o do chat é o que a equipe já conhece.

### 6.4 Anexar

Escolhe o arquivo → confirma o nome (vem preenchido) → **ano** (vem o ano atual) → **mês**
(opcional). Sem escolher tipo de arquivo: qualquer formato entra.

---

## 7. O envio por WhatsApp

### 7.1 O caminho

1. Botão no cartão abre busca pelos **contatos do CRM** (nome, empresa, telefone)
2. Escolhido o contato, o sistema gera um **link temporário** do arquivo
3. Chama `whatsapp-send` com `tipo: 'documento'`, `media_url` = o link, `nome_arquivo` = o nome
4. O servidor da uazapi **baixa pela URL** (`file: media_url`) e entrega

O link temporário vale 1 hora e é usado em segundos — **o balde privado não atrapalha o envio.**

### 7.2 O que já existe e só é reaproveitado

- **Sai do WhatsApp do próprio representante.** `whatsapp-send` resolve a instância por
  `wapi_instancia_usuarios` a partir de quem está logado.
- **Cai na conversa daquele contato**, então fica no histórico.
- **Recusa explicada** para quem não tem WhatsApp vinculado ou está desconectado.

### 7.3 A armadilha do telefone

🔴 O número passa por **`normalizeWhatsappPhone`**. Enfiar o nono dígito à força já respondeu
por **100% das falhas de envio** deste sistema, e cliente com telefone fixo que tem WhatsApp
existe de verdade na base da MD. Ver `CLAUDE.md` §7.1.

---

## 8. As travas contra banimento

### 8.1 O risco

A conexão é por **API não oficial**. Número que dispara muito arquivo em pouco tempo é
derrubado — e perder o número é perder operação, não funcionalidade.

O botão de um clique é justamente o gesto que se repete rápido, por má-fé ou por dúvida.

### 8.2 Dois tetos, porque quem é banido é o número

🔴 **Medido em 26/08/2026, e foi isto que corrigiu o desenho:**

```
MD Representações  ->  número 1: 13 pessoas ligadas   (conectado)
                       número 2: 12 pessoas ligadas   (conectado)
JHS                ->  1 número, 1 pessoa
```

Teto só por pessoa não protege nada: 13 pessoas × 10/hora = **130 envios de um único número
numa hora**.

| trava | valor | protege de |
|---|---|---|
| por **pessoa** | 10/hora, 40/dia | abuso individual |
| por **número** (`instancia_id`) | 40/hora, 150/dia | **o banimento** |
| mesmo arquivo + mesmo contato | 10 minutos | clique duplo e "será que foi?" |

O teto por número calibrado com o uso real: 13 representantes × 5 catálogos/dia ≈ 65/dia em
dois números ≈ 33 por número. 150 dá mais de quatro vezes de folga.

🔴 **A contagem é feita e recusada no servidor.** Desabilitar o botão resolve o acidente e não
resolve nada para quem abre o console. Regra nº 1 do `CLAUDE.md`: esconder botão não protege.

### 8.3 As mensagens

A causa é do WhatsApp e é dita como tal — **sem afirmar número que não é dele**. Escrever
"o limite do WhatsApp é 40 por hora" seria falso, e o primeiro representante que pesquisasse
descobriria, passando a desconfiar de todos os outros avisos. Todas dizem **quando libera**:
aviso sem horário é o que faz a pessoa continuar clicando.

**Teto do número, por hora:**
> O WhatsApp derruba números que disparam muitos arquivos em sequência. Para o número da
> empresa não cair, o envio de catálogos pausa depois de 40 numa hora — este já foi atingido.
> Libera às 15h20.

**Teto do número, por dia:**
> O WhatsApp derruba números que disparam muitos arquivos em sequência. O número da empresa já
> enviou 150 catálogos hoje e o envio pausa até amanhã.

**Teto da pessoa:**
> O WhatsApp derruba números que disparam muitos arquivos em sequência, então cada pessoa envia
> até 10 catálogos por hora. Você já enviou 10 — libera às 15h20.

**Mesmo catálogo, mesmo contato** — este **não é bloqueio, é confirmação**:
> Já enviado. O João recebeu este catálogo há 3 minutos, às 15h02.
> Para evitar problemas de spam para o seu número de WhatsApp, dá para mandar de novo às 15h12.

Duas exigências de tela para o último caso, que valem mais que a redação:

- 🔴 **Não é erro vermelho.** Vermelho faz a pessoa achar que quebrou — e quem acha que quebrou
  tenta de novo, que é o comportamento que a trava existe para evitar. Vai em tom neutro.
- **Tem botão "Ver na conversa".** Se a dúvida é "será que foi?", levar a pessoa até a mensagem
  resolve o problema dela. Mandá-la esperar dez minutos com a mesma dúvida, não.

Quando o teto do **número** estoura, a mensagem diz que é da empresa, não da pessoa. Quem mandou
dois e leva um "não" acha que é defeito e insiste.

### 8.4 O que continua descoberto

**A caixa de entrada do WhatsApp não tem limite nenhum** — medido: zero contagem em
`whatsapp-send`, para texto ou mídia. Qualquer pessoa com acesso pode disparar em volume pelo
número da empresa hoje, independentemente desta entrega.

Não é corrigido aqui: `whatsapp-send` é o caminho crítico do atendimento, e um representante
numa conversa rápida manda muitas mensagens de forma legítima — a trava quebraria o atendimento
para proteger o catálogo.

**Vai para `docs/divida-tecnica.md`** com o número medido: *um número, treze pessoas, zero
contagem*. Se virar prioridade, o mecanismo desta especificação é o mesmo que serviria.

---

## 9. Limites comerciais: fora de escopo, e por quê

Registrado porque a pergunta foi feita e a resposta é uma decisão, não um esquecimento.

**Limite técnico** protege o sistema de um acidente. **Limite comercial** define o que o plano
vende. São coisas diferentes e só a primeira está nesta entrega.

Existe **um plano só** — "Plano de Lançamento", R$ 2.997, "usuários ilimitados, todos os
módulos". Limite de cadastro só diferencia planos quando há um plano mais barato para
diferenciar; com um plano só, é uma porta sem cerca.

Quando houver planos, medir **o que custa**, não o que é fácil de contar:

| costuma-se limitar | custa? |
|---|---|
| número de cadastros | quase nada — os 11.910 negócios não pesam |
| espaço em arquivo | sim, e é medível |
| **dados saindo** | **sim, e é o que mais cresce sem ninguém ver** |
| número de usuários | não em servidor; custa em suporte |

---

## 10. A limpeza

### 10.1 Novo Negócio e Editar Negócio

O assistente **continua com dois passos**. O passo 2 deixa de ser "Itens do Negócio" e vira
**"Valor e orçamento"**: o valor de negociação (que já estava lá) mais o anexo do PDF, que vem
do passo 1.

> **Atualizado após o commit `897cb937` (26/08/2026, outra sessão).** O assistente foi
> padronizado e as etapas agora são **dados**, não marcação — `CabecalhoAssistente` recebe
> `etapas={[{ id, label }]}` de `src/components/shared/DialogoResponsivo.tsx`. Renomear o passo
> passou a ser uma linha. O mesmo componente serve os outros modais de criação, então **não
> mexer nele** para atender só o Novo Negócio.

**Sai a chave "modo manual".** Ela existia só para escolher entre somar os itens e digitar o
valor; sem itens, o valor é sempre digitado.

Os dois passos ficam porque a aba **Campos** das Configurações deixa cada empresa escolher em
que passo cada campo vive — as 8 empresas têm linhas gravadas com `etapa`. Colapsar em uma tela
mataria essa configuração.

**A mesma mudança vale para `src/pages/EditarPedido.tsx`.** Fazer só na criação deixaria duas
verdades sobre o mesmo negócio.

Limpeza de configuração: as linhas de `configuracoes_campos` com `etapa = 'Itens do Negócio'` e
`campo_key = 'itens'` saem (8 linhas, uma por empresa). As de `valor_manual` **ficam** e passam
para a etapa renomeada. As de `proximo_contato` já estavam órfãs antes desta mudança — o campo
saiu da tela e a linha ficou; saem junto.

### 10.2 O que é removido do catálogo de produtos

| o que | estado medido |
|---|---|
| `tabela_precos` | 0 linhas |
| `src/pages/Catalogo.tsx` | 468 linhas, já órfã |
| `src/components/catalogo/` | 4 componentes |
| o cartão em `Fabricantes.tsx` | dá lugar ao drive |
| balde `catalogo-produtos` | 0 arquivos |
| ganchos de `use-fabricantes.ts` que só serviam ao catálogo | |

**Apagar, não desligar.** O git guarda. Este projeto tem histórico ruim com código desligado:
a própria `Catalogo.tsx` está órfã há tempos, `automacao-diaria` nunca rodou e apodreceu com 5
defeitos, e a aba Automação passou meses decorativa.

### 10.3 🔴 `itens_pedido` NÃO é apagada

Ela tem **1 linha, de um negócio real**. É pouco, não é zero.

A tela sai; a tabela fica órfã e documentada. Custa nada mantê-la, e evita apagar o único
registro que alguém um dia pode perguntar por quê.

**Pendente de confirmação do Lucas.** Se ele preferir apagar, mostrar antes qual negócio é.

### 10.4 O documento de retomada

Arquivo em `docs/` registrando: o que o módulo fazia, **o commit exato de onde recuperar cada
arquivo**, e — o mais importante para quem for decidir se vale ressuscitar — que **ele nunca
teve dado real em produção**.

---

## 11. Ordem de entrega

1. **A limpeza** (§10). Pequena, reversível, e libera o lugar do drive.
2. **O drive sem envio** (§4 a §6): anexar, ver, baixar, excluir.
3. **O envio por WhatsApp com as travas** (§7, §8).

Se o envio der problema, o drive já está no ar sendo útil — e dá para validar o layout dos
cartões com a equipe antes da parte mais delicada.

---

## 12. Verificação

Além da rotina do `CLAUDE.md` §9 (build, testes, `tsc -p tsconfig.app.json`, lint sem subir):

| o quê | como |
|---|---|
| a RLS recusa outra empresa | simular perfil de outra empresa e tentar ler/anexar |
| a RLS recusa exclusão sem permissão | simular vendedor sem `pode_excluir` em `fabricantes` |
| o balde é privado de verdade | requisição HTTP crua ao objeto, **sem credencial** — tem que negar |
| o teto de 50 MB | tentar 51 MB e conferir a recusa |
| o limite da uazapi | enviar um arquivo grande de verdade, uma vez |
| as três travas | contar no banco, não na tela — testar chamando o servidor direto |
| a miniatura falhando | anexar PDF protegido e conferir que o upload conclui |
| telefone fixo com WhatsApp | um caso real da base da MD |

🔴 As travas precisam de teste **pelo servidor**, não pela tela. Testar só pela interface prova
que o botão está desabilitado, não que a regra existe.
