# Plano — fechar os baldes de arquivo (Storage público)

> **Status: PLANO. Nada aqui foi aplicado.** Nenhuma migration foi criada, nenhum código foi
> alterado. Todos os números abaixo foram medidos no projeto `hukeirrmsoiowvvrhivx` em
> **24/08/2026**, por consulta de leitura ao banco e por requisição HTTP sem credencial.

---

## 1. Resumo em uma página

**O problema.** Os 7 baldes de arquivo do Storage estão abertos. Qualquer pessoa com o link
baixa o arquivo, sem senha, sem login, sem nada. Isso vale para os **14.997 anexos de negócio
(5,0 GB)**, para as **6.395 mídias de WhatsApp (2,3 GB)**, para os **215 arquivos do chat interno**
e — o que ninguém tinha notado — para as **110 imagens embutidas em e-mails recebidos** dos
clientes da MD.

Confirmado nesta data, por requisição HTTP crua, sem nenhuma credencial:

| Balde | Resposta | Tipo | Tamanho |
|---|---|---|---|
| `pedido-anexos` | `HTTP 200 OK` | `application/pdf` | 681.955 bytes |
| `whatsapp-media` | `HTTP 200 OK` | `image/jpeg` | 64.436 bytes |
| `chat-files` | `HTTP 200 OK` | `image/png` | 1.874.075 bytes |
| `avatars` | `HTTP 200 OK` | `image/jpeg` | 46.015 bytes |
| `email-assets` (imagem de e-mail recebido) | `HTTP 200 OK` | `image/png` | 15.624 bytes |

**Por que não é um interruptor.** Virar o balde privado hoje quebra o sistema em cinco frentes
ao mesmo tempo — 11.348 links gravados no banco, o envio de mídia pelo WhatsApp, a assinatura
de e-mail, o chat e a caixa de e-mail. E, pior: **virar o balde privado sozinho não fecha o
arquivo**, porque a regra de leitura do banco continua liberando para todo mundo (§5.5).

**O que dá para fazer hoje, sem risco:** limite de tamanho por balde (§7, Passo 0). Não fecha
nada e não mexe em tela nenhuma, mas tira o risco de alguém encher 5 GB de uma vez. Leva
minutos e é reversível em um comando.

**O item mais urgente do documento** é outro, e não é sem risco: a regra
`Temporary full access to chat files` permite a **qualquer** identidade, inclusive a anônima,
não só ler como **apagar** arquivo do chat interno (§5.5). Ela precisa ser **trocada**, não
apagada — é ela também que autoriza o app a subir arquivo no chat. É uma troca curta, mas
exige teste. Ver §7, Passo 0-bis.

**O resto é projeto:** 9 passos, cada um aplicável e reversível sozinho, na ordem da §7.
O passo mais caro (trocar cada tela para pedir link assinado) é o Passo 2, e é o único que
demanda trabalho de verdade em várias telas.

---

## 2. O que foi medido (24/08/2026)

### 2.1 Os baldes

| Balde | Público | Objetos | Volume | Limite de tamanho | Tipos permitidos |
|---|---|---:|---:|---|---|
| `pedido-anexos` | **sim** | 14.997 | 5.083 MB | **nenhum** | **nenhum** |
| `whatsapp-media` | **sim** | 6.395 | 2.280 MB | 16 MB | **nenhum** |
| `chat-files` | **sim** | 215 | 94 MB | **nenhum** | **nenhum** |
| `email-assets` | **sim** | 111 | 9.615 kB | **nenhum** | **nenhum** |
| `avatars` | **sim** | 24 | 6.156 kB | **nenhum** | **nenhum** |
| `branding` | **sim** | 0 | — | **nenhum** | **nenhum** |
| `catalogo-produtos` | **sim** | 0 | — | **nenhum** | **nenhum** |
| **Total** | | **21.742** | **~7,4 GB** | | |

### 2.2 Correções ao que estava no pedido

| No pedido | Medido hoje | Comentário |
|---|---|---|
| 14.997 anexos (5 GB) | **confere** (14.997 / 5.083 MB) | — |
| 6.394 mídias de WhatsApp (2,3 GB) | **6.395** / 2.280 MB | uma mídia nova entrou entre uma medição e outra |
| 215 arquivos do chat | **confere** | — |
| 5.175 em `pedidos.pdf_url` | **confere** | há ainda 4 `pdf_url` apontando para o CDN do Bitrix24, fora do Storage |
| 6.167 em `whatsapp_mensagens.media_url` | **6.173** | cresce sozinho: chega mídia nova o tempo todo. Há ainda 71 `media_url` externos (link do WhatsApp) |
| 11.342 endereços públicos gravados | **11.348** e subindo | soma das duas colunas acima |
| "os limites de tamanho hoje são nulos" | **6 dos 7** são nulos | `whatsapp-media` já tem 16 MB |
| "`grep createSignedUrl` não acha nada" | **confere** | zero ocorrências em `src/` e `supabase/`. A única ocorrência de "sign" é `crypto.subtle.sign` (HMAC do webhook de e-mail), coisa diferente |

### 2.3 Três coisas que o pedido não previa

1. **`email-assets` é 99% conteúdo privado, não 1% de marca.** Dos 111 objetos, **110 estão em
   `inline/{empresa_id}/{mensagem_id}/` — são imagens extraídas de e-mails RECEBIDOS** pela MD e
   republicadas em endereço público para aparecerem na tela da caixa de entrada
   (`supabase/functions/email-mensagem/index.ts:71-84`). O único objeto "de marca" é
   `assinaturas/{user_id}.png` (1 arquivo). **A logo `logo-email.png` nem existe** no balde
   hoje — `src/lib/assinatura-email.ts:12` monta uma URL para um arquivo ausente.
   → Conclusão: `email-assets` **não** precisa continuar público inteiro. Precisa ser **dividido**.

2. **Fechar o balde não fecha o arquivo** — ver §5.5. As regras de leitura estão escritas para
   `public` (toda e qualquer identidade, inclusive a anônima). São elas que precisam mudar.

3. **O caminho dos arquivos não separa empresa de forma confiável** — ver §5.6.

---

## 3. Onde os endereços públicos estão gravados no banco

| Coluna | Preenchidos | Endereço público do nosso Storage | Balde | Objeto existe? |
|---|---:|---:|---|---|
| `pedidos.pdf_url` | 5.179 | **5.175** | `pedido-anexos` | 5.175 de 5.175 |
| `whatsapp_mensagens.media_url` | 6.244 | **6.173** | `whatsapp-media` | 6.173 de 6.173 |
| `chat_mensagens.arquivo_url` | 207 | **207** | `chat-files` | — |
| `usuarios.avatar_url` | 13 | **13** | `avatars` | — |
| **Total em coluna de endereço** | | **11.568** | | |

E mais um lugar, que uma varredura por nome de coluna não acha: **`email_mensagens.corpo_html`**.
Não é uma coluna de endereço — é o HTML inteiro do e-mail, e o endereço público está **embutido
no meio do texto**. Medido: dos 126 corpos já buscados, **51 contêm um endereço
`/object/public/email-assets/`**. Isso importa muito para o Passo 4 — ver lá.

Colunas de arquivo que **não** guardam endereço do nosso Storage (checadas e descartadas):
`chat_grupos.foto_url` (0), `chat_geral_config.foto_url` (0), `empresas.logo_url` (0),
`empresas.banner_url` (0), `tabela_precos.imagem_url` (0), `licencas_natal.pdf_link` (5, links
externos da prefeitura), `licencas_idema.pdf_link` (0), `whatsapp_conversas.foto_perfil_url`
(631, link do próprio WhatsApp, expira sozinho), `whatsapp_contatos_fotos.foto_perfil_url`
(529, idem), `email_mensagens.anexos` (jsonb, metadado do Nylas, não guarda URL nossa).

**Nenhum dos 11.568 links está quebrado hoje.** Todos apontam para um objeto que existe.

---

## 4. Quem produz e quem consome endereço público

### 4.1 Produz (14 pontos, 11 arquivos)

Todos usam `getPublicUrl`. Não há nenhum outro jeito de montar endereço público no projeto —
a string `/object/public/` não é escrita à mão em lugar nenhum.

| Arquivo:linha | Balde | O que faz |
|---|---|---|
| `src/components/pedidos/NovoNegocioDialog.tsx:367` | `pedido-anexos` | anexo ao criar negócio → grava em `pedidos.pdf_url` |
| `src/pages/EditarPedido.tsx:332` | `pedido-anexos` | anexo ao editar negócio → grava em `pedidos.pdf_url` |
| `supabase/functions/resolve-pedido-anexo/index.ts:102` | `pedido-anexos` | importação Bitrix24 → grava em `pedidos.pdf_url` |
| `src/hooks/use-whatsapp-inbox.ts:660` | `whatsapp-media` | mídia que a MD envia (`uploadWaMedia`) |
| `supabase/functions/whatsapp-webhook/index.ts:185` | `whatsapp-media` | mídia que a MD recebe → grava em `whatsapp_mensagens.media_url` |
| `src/hooks/use-chat.ts:512` | `chat-files` | anexo de mensagem do chat interno |
| `src/hooks/use-chat.ts:211` e `:339` | `chat-files` | foto de grupo e foto do canal geral |
| `src/components/chat/CreateGroupDialog.tsx:106` | `chat-files` | foto ao criar grupo |
| `src/pages/Configuracoes.tsx:212` | `avatars` | foto de perfil |
| `src/lib/assinatura-email.ts:12` | `email-assets` | logo do rodapé de e-mail (**sai para fora**) |
| `src/lib/assinatura-email.ts:54` | `email-assets` | imagem de assinatura (**sai para fora**) |
| `supabase/functions/email-mensagem/index.ts:82` | `email-assets` | imagem embutida de e-mail recebido |
| `src/components/catalogo/ProductImageUpload.tsx:33` | `catalogo-produtos` | foto de produto (balde vazio hoje) |

### 4.2 Consome

| Onde | Arquivo:linha | Como usa |
|---|---|---|
| Lista de Negócios | `src/pages/Negocios.tsx:318`, `:376`, `:2211` | `<a href>` para abrir o anexo |
| **Exportação de Negócios** | `src/pages/Negocios.tsx:1173`, `:1636` | **grava o endereço dentro do Excel/CSV exportado** |
| Cartão do funil | `src/components/pedidos/kanban/KanbanCard.tsx:149` | link do anexo |
| Ficha do cliente | `src/pages/ClienteDetalhe.tsx:749` | link do anexo |
| Editar negócio | `src/pages/EditarPedido.tsx:789-802` | link do anexo |
| Prévia da importação | `src/components/pedidos/ImportPedidosDialog.tsx:845` | link do anexo |
| Caixa do WhatsApp | `src/pages/WhatsAppInbox.tsx:1686, 1710, 1728, 1741, 1812, 1822, 2581, 2598, 2605, 2635, 2676` | `<img>`, `<audio>`, `<video>`, download, abrir em nova aba |
| Chat interno | `src/pages/Chat.tsx:706, 712, 723, 729, 751, 770, 1905, 1910` | `<img>`, `<video>`, player de áudio, download, prévia |
| Foto de perfil | `AppLayout.tsx:65`, `AppSidebar.tsx:522`, `UserProfilePopover.tsx:72`, `UsuariosTab.tsx:436, 887, 1005` | `<img>` |
| Prévia da assinatura | `src/components/configuracoes/AssinaturaEmailEditor.tsx:290` | `<img>` |
| **E-mail que sai da MD** | `src/pages/Emails.tsx:788` | logo e assinatura embutidas no HTML enviado |
| **Envio de WhatsApp** | `supabase/functions/whatsapp-send/index.ts:302` | `file: media_url` — a operadora baixa |
| Download genérico | `src/lib/download-file.ts:12` | `fetch(url)` e, se falhar, `window.open(url)` |

---

## 5. As seis travas

### 5.1 11.348 endereços gravados no banco

Virar `pedido-anexos` e `whatsapp-media` privados quebra os 11.348 no mesmo segundo: toda tela
que hoje faz `<a href={pdf_url}>` ou `<img src={media_url}>` passa a mostrar erro.
**Tratada nos Passos 1, 2 e 6.**

### 5.2 O envio de WhatsApp entrega o link para a operadora

`supabase/functions/whatsapp-send/index.ts:302` manda `file: media_url` no corpo do POST para
`/send/media` da uazapi. Quem baixa o arquivo é o servidor da operadora, que não tem — e não
pode ter — credencial do nosso Supabase. Se o balde fechar antes disso ser resolvido,
**todo envio de imagem, áudio, vídeo e documento pelo CRM para de funcionar**, e falha do jeito
mais chato: a operadora responde 200 e a mensagem não chega em ninguém.
**Tratada no Passo 3.**

### 5.3 A imagem da assinatura de e-mail precisa continuar pública

`src/lib/assinatura-email.ts:12` e `:54` montam endereços públicos que vão embutidos no HTML de
um e-mail que sai da caixa da empresa (`src/pages/Emails.tsx:788`). Quem busca essa imagem é o
programa de e-mail **de quem recebe** — Outlook, Gmail, Zimbra. Nenhum deles pode receber
credencial nossa, e link assinado com validade curta apareceria quebrado quando o cliente
abrisse a mensagem uma semana depois.
→ Esses dois caminhos (`logo-email.png` e `assinaturas/{user_id}.png`) ficam públicos **para
sempre**, por decisão consciente. **Tratada no Passo 4.**

### 5.4 Não existe trilha de link assinado no projeto

`createSignedUrl` não aparece nenhuma vez em `src/` nem em `supabase/`. Não há função utilitária,
não há hook, não há cache, não há tratamento de expiração. **A trilha inteira precisa ser
construída antes de qualquer balde fechar.** **Tratada nos Passos 1 e 2.**

### 5.5 🔴 Virar o balde privado NÃO fecha o arquivo sozinho

Esta é a trava que não estava no pedido e é a mais perigosa, porque leva a declarar vitória
sem ter fechado nada.

O Supabase tem **duas portas** para o mesmo arquivo:

- a porta pública, `/storage/v1/object/public/{balde}/{caminho}` — que o `public = false` fecha;
- a porta com identidade, `/storage/v1/object/{balde}/{caminho}` — que **não** olha o
  `public`; olha as regras de leitura da tabela `storage.objects`.

E as regras de leitura de hoje estão escritas assim (medido):

| Regra | Vale para | Condição |
|---|---|---|
| `Qualquer um pode ver anexos de pedidos` | **toda identidade, inclusive a anônima** | `bucket_id = 'pedido-anexos'` |
| `public_read_whatsapp_media` | **toda identidade, inclusive a anônima** | `bucket_id = 'whatsapp-media'` |
| `Public read access for chat files` | **toda identidade, inclusive a anônima** | `bucket_id = 'chat-files'` |
| `Temporary full access to chat files` | **toda identidade** — e é **ALL**, não só leitura | `bucket_id = 'chat-files'` |
| `Public Access` | **toda identidade** | `bucket_id = 'email-assets'` |
| `Avatars are publicly accessible` | **toda identidade** | `bucket_id = 'avatars'` |
| `Logos são acessíveis publicamente` | **toda identidade** | `bucket_id = 'branding'` |
| `catalogo_produtos_public_read` | **toda identidade** | `bucket_id = 'catalogo-produtos'` |

A identidade anônima do projeto viaja na chave pública que vai **dentro do arquivo do site**
(`VITE_SUPABASE_PUBLISHABLE_KEY`) — ou seja, qualquer visitante tem essa chave. Com ela e uma
dessas regras, a porta com identidade continua entregando o arquivo depois de o balde virar
privado.

Repare também na regra `Temporary full access to chat files`: ela é **ALL** — ler, gravar,
substituir e **apagar** — e vale para toda identidade, inclusive a anônima. Nada na camada de
regras impede alguém de fora, com a chave pública que está dentro do site, de **apagar** os
arquivos do chat interno. (Confirmar com um teste antes de dar como certo: falta checar a
permissão de tabela por baixo. Mas a regra, que é a parte que este projeto controla, permite.)
Isso é pior que o vazamento e não depende de o balde ser público — o nome dela já diz
"temporary".

⚠️ **E ela não pode ser simplesmente apagada.** Medido: `chat-files` **não tem nenhuma outra
regra de escrita**. É essa mesma regra frouxa que autoriza o app a subir foto de grupo e anexo
de mensagem (`use-chat.ts:205, 333, 506`, `CreateGroupDialog.tsx:103`). Apagá-la derruba o
envio de arquivo no chat. Ela tem de ser **substituída** por regras de escrita restritas a
`authenticated` e à pasta do próprio usuário — nos moldes do que `avatars` já faz.

→ **Passo 6, e é o passo que realmente fecha.** O `public = false` (Passo 7) só tira a porta
que não pede identidade nenhuma.

### 5.6 O caminho dos arquivos não separa empresa de forma confiável

Para a regra nova dizer "só quem é da empresa X vê o arquivo da empresa X", ela precisa
descobrir a empresa a partir do caminho. Medido:

| Balde | Padrão do caminho | Bate | Não bate |
|---|---|---:|---:|
| `pedido-anexos` | `{empresa_id}/arquivo` (vem da importação) | 14.957 | **40** — 22 em pasta de UUID sorteado (`NovoNegocioDialog.tsx:357` e `EditarPedido.tsx:324` usam `crypto.randomUUID()`, não a empresa) e 18 soltos na raiz do balde |
| `whatsapp-media` | `incoming/{empresa_id}/...` (recebidas) | 5.493 | 1 com empresa que não existe mais |
| `whatsapp-media` | `{conversa_id}/...` (enviadas) | 850 | 51 com conversa que não existe mais |
| `chat-files` | `{user_id}/...` | 215 | 0 |
| `avatars` | `{user_id}/...` | 24 | 0 |

Dois detalhes que mudam o desenho da regra:

- **`pedidos` não tem `empresa_id`.** A empresa de um negócio sai por `pedidos.usuario_id →
  usuarios.empresa_id`. Então a regra de `pedido-anexos` tem de ser por **caminho**
  (`{empresa_id}/`), não por consulta ao negócio.
- Os **92 arquivos fora do padrão** (40 + 1 + 51) ficariam invisíveis para todo mundo no dia
  em que a regra por empresa entrar. Precisam ser movidos antes (**Passo 5**) ou aceitos como
  perda consciente.

---

## 6. A decisão de arquitetura: link assinado, não porteiro

Duas saídas foram consideradas.

**Link assinado** (`createSignedUrl`): o app pede ao Supabase um endereço temporário, com
assinatura embutida, válido por alguns minutos ou horas. Funciona em `<img src>`, em `<audio>`,
em `<a href>` — é um endereço comum.

**Porteiro** (uma função no servidor que confere quem é e devolve o arquivo): endereço estável,
que poderia ficar gravado no banco para sempre.

**Recomendação: link assinado.** O porteiro morre num detalhe: uma tag `<img src="...">` do
navegador **não manda cabeçalho de autorização**. Para o porteiro saber quem está pedindo, o
token teria que ir na própria URL — que é exatamente um link assinado, só que feito à mão, sem
CDN e com todos os 7,4 GB passando por dentro da função (com custo, com latência e com o
trabalho extra de suportar busca em áudio e vídeo). Não compensa.

### 6.1 Consequência para os 11.348 endereços gravados: não converter nada

O endereço gravado já contém, dentro dele, o balde e o caminho do arquivo:

```
https://hukeirrmsoiowvvrhivx.supabase.co/storage/v1/object/public/pedido-anexos/{empresa}/{arquivo}.pdf
                                                                 └── balde ──┘└──── caminho ─────┘
```

Ou seja: **dá para extrair o caminho na hora de mostrar, com uma função de texto, sem tocar em
uma linha do banco.** Medido: os 5.175 + 6.173 endereços seguem todos exatamente esse formato,
e os 11.348 caminhos extraídos batem 1-para-1 com objetos que existem — zero quebrados.

Isso responde à exigência de reversibilidade da forma mais forte possível: **não há o que
reverter, porque não há escrita.** Reverter o passo é tirar o código.

**Caminho A — recomendado. Nada é gravado.**
`pedidos.pdf_url` e `whatsapp_mensagens.media_url` continuam exatamente como estão. Na hora de
mostrar, `caminhoDoArquivo(url)` extrai o caminho e o app pede o link assinado.
As gravações novas continuam usando `getPublicUrl` — que, mesmo com o balde privado, continua
devolvendo a string no mesmo formato (é só montagem de texto, não faz requisição). Assim linha
velha e linha nova têm a mesma cara e um único resolvedor entende as duas.
- Reverter: reverter o deploy do front. Banco intocado.
- Preço: fica no banco uma coluna chamada "url" cujo conteúdo não abre no navegador. Precisa
  de comentário na coluna dizendo isso, senão vira armadilha para quem chegar depois.

**Caminho B — se preferirem o caminho gravado de verdade.**
Coluna nova, **aditiva**: `pedidos.pdf_path`, `whatsapp_mensagens.media_path`. Backfill
derivado das colunas atuais. Escrita dupla por um tempo. Leitura prefere a coluna nova e cai
na antiga se estiver vazia.
- Reverter: `alter table pedidos drop column pdf_path;` — **nenhum dado se perde**, porque a
  coluna nova é derivada da antiga e a antiga nunca foi tocada.
- Preço: uma migration a mais, escrita dupla em 5 pontos de gravação e um período em que as
  duas colunas coexistem.

> A conversa que precisa acontecer com o Lucas antes do Passo 2: **hoje, o Excel exportado da
> tela de Negócios (`Negocios.tsx:1636`) leva dentro dele o link do anexo, e esse link funciona
> para qualquer pessoa que receber a planilha.** Com link assinado, ele passa a expirar. As
> opções são (a) exportar um link para a tela do negócio dentro do CRM, em vez do arquivo —
> quem abrir precisa estar logado; (b) exportar sem link; (c) link assinado com validade longa,
> o que é o mesmo problema de hoje com data de fim. **Recomendação: (a).**
> Pelo mesmo motivo, avisar a equipe: **qualquer link de anexo que alguém já colou num e-mail
> para cliente vai parar de abrir** no dia do Passo 7.

---

## 7. Os passos

Regra geral: **um passo por vez, com o cliente usando o sistema entre um e outro.** Cada passo
diz o que verificar, como reverter e o que quebra se for aplicado fora de ordem.

### Passo 0 — HOJE, sem risco: limite de tamanho

**O que faz.** Põe teto de tamanho em cada balde. **Não fecha nada e não muda nenhuma tela.**
Só impede que alguém — de fora ou de dentro — encha o balde com um arquivo gigante.

Tetos sugeridos, com folga sobre o maior arquivo que existe hoje em cada balde:

| Balde | Maior arquivo hoje | Teto sugerido |
|---|---:|---:|
| `pedido-anexos` | 10.002 kB | **25 MB** |
| `chat-files` | 11 MB | **25 MB** |
| `whatsapp-media` | 16 MB | **manter 16 MB** |
| `email-assets` | 1.119 kB | **10 MB** |
| `avatars` | 1.015 kB | **5 MB** |
| `branding` | vazio | **5 MB** |
| `catalogo-produtos` | vazio | **10 MB** |

**Verificar:** subir um anexo normal pela tela de negócios continua funcionando.
**Reverter:** voltar o valor para `null` no mesmo comando.
**Fora de ordem:** não existe — pode ser feito a qualquer momento, inclusive antes de tudo.

> 🔴 **Não fazer allowlist de tipo de arquivo agora.** Medido: `email-assets` grava o tipo com
> o nome do arquivo grudado (`image/png; name="image001.png"` — 110 dos 111 objetos são assim),
> e `whatsapp-media` tem tipos que nenhuma lista razoável preveria (`application/was`,
> `application/wps-office.xlsx`, `image/vnd.dwg`, `application/octet-stream`). Uma allowlist
> hoje **recusaria arquivo legítimo de cliente**, silenciosamente, no meio de uma conversa.
> Lista de tipo só faz sentido em `avatars`, `branding` e `catalogo-produtos`, onde o conjunto
> é fechado (imagem) — e mesmo ali o ganho é pequeno.

### Passo 0-bis — Fechar o buraco de escrita do chat (urgente, mas com teste)

**O que faz.** Troca a regra `Temporary full access to chat files` — hoje **ALL para qualquer
identidade, inclusive a anônima** — por regras de escrita restritas a `authenticated` e à pasta
do próprio usuário, no mesmo feitio que `avatars` já usa. A regra de leitura fica como está;
este passo **não fecha nada**, só tira o poder de gravar, substituir e apagar de quem está
fora.

Vale aproveitar a mesma migration para as outras três regras de escrita frouxas, medidas hoje:

| Regra | Hoje permite | Deveria permitir |
|---|---|---|
| `Usuários autenticados podem excluir seus próprios anexos` | qualquer usuário logado apaga anexo de **qualquer empresa** (o nome mente: não há dono na condição) | só a pasta da própria empresa |
| `Usuários autenticados podem fazer upload de anexos` | qualquer usuário logado grava em **qualquer pasta** do balde | só a pasta da própria empresa |
| `auth_delete_whatsapp_media` | qualquer usuário logado apaga mídia de **qualquer empresa** | só a da própria empresa |
| `Auth Delete` / `Auth Update` (`email-assets`) | qualquer usuário logado apaga/substitui a assinatura de **qualquer outro** | só o próprio arquivo |

**Verificar:** subir um arquivo no chat, criar um grupo com foto, subir um anexo num negócio,
subir foto de assinatura. Os quatro têm de continuar funcionando.
**Reverter:** as regras antigas voltam num comando.
**Fora de ordem:** independente de tudo. Pode ir antes do Passo 0.
🔴 **O que NÃO fazer:** apagar `Temporary full access to chat files` sem pôr as regras de
escrita no lugar. É ela que autoriza o app a subir arquivo no chat — sem substituta, o envio de
arquivo no chat para de funcionar.

### Passo 1 — Construir a trilha do link assinado (sem fechar nada)

**O que faz.** Cria `src/lib/arquivo-privado.ts` com três coisas: `caminhoDoArquivo(url)`
(extrai balde + caminho de um endereço gravado), `urlAssinada(balde, caminho, segundos)` e uma
versão em lote para listas (a caixa do WhatsApp desenha 50 mídias de uma vez; 50 requisições
separadas seria lento). Mais um hook de React Query que guarda o link assinado em cache com
validade menor que a do link, e refaz quando expira.

**Enquanto os baldes ainda são públicos, o resolvedor cai de volta no endereço original se não
conseguir assinar** — então este passo, sozinho, não muda nada na tela.

**Verificar:** teste unitário de `caminhoDoArquivo` com os quatro formatos que existem no banco.
**Reverter:** reverter o deploy. Ninguém consumia ainda.
**Fora de ordem:** se vier depois do Passo 6 ou 7, as telas já estarão quebradas.

### Passo 2 — Trocar os consumidores, um módulo por vez (baldes ainda públicos)

**O que faz.** Cada tela da §4.2 passa a pedir o link assinado em vez de usar o endereço
gravado direto. Ordem sugerida, do menor risco ao maior:

1. **Chat interno** (`Chat.tsx`, 8 pontos) — 215 arquivos, público interno, se quebrar ninguém
   perde negócio.
2. **Anexos de negócio** (`Negocios.tsx`, `ClienteDetalhe.tsx`, `EditarPedido.tsx`,
   `KanbanCard.tsx`, `ImportPedidosDialog.tsx`) — inclui a decisão sobre a exportação (§6.1).
3. **Caixa do WhatsApp** (`WhatsAppInbox.tsx`, 11 pontos) — o mais delicado: imagem, áudio,
   vídeo, documento, galeria e download, tudo na mesma tela.
4. **Fotos de perfil** — só se `avatars` for fechar; ver §8.

**Verificar, módulo a módulo:** abrir a tela e conferir que **tudo que aparecia antes continua
aparecendo**. Como os baldes ainda estão públicos, um erro aqui é invisível — por isso o
resolvedor precisa registrar no console quando cai no endereço público, e essa contagem tem de
chegar a zero antes do Passo 7.

**Reverter:** por módulo, revertendo o deploy correspondente.
**Fora de ordem:** depende do Passo 1. Se vier depois do 6/7, o cliente vê as telas quebradas
durante o conserto.

#### 2.1 — Chat interno: FEITO em 26/08/2026

Foram **29 pontos**, não 8: a contagem original olhou só os arquivos de mensagem e não incluiu
as 17 fotos (avatar de pessoa, foto de grupo, foto do Chat Geral) espalhadas pela tela.

Em vez de 29 alterações à mão, duas peças:

· **`<ImagemPrivada>`** (`src/components/shared/ImagemPrivada.tsx`) — uma `<img>` que pede o
  link sozinha. Serve para os 17 pontos de foto aqui e para as próximas telas. Uma consulta por
  endereço DISTINTO, não por tag: o mesmo avatar repetido em vinte lugares vira um pedido só.
· **`useArquivosPrivados` sobre a lista de mensagens** — os 12 pontos que precisam do endereço
  como VALOR (link de download, `<video>`, tocador de áudio, visualizador de documento) leem de
  um `enderecoDe(...)` único, assinado em lote. Um pedido por balde, não um por anexo.

Medido antes de subir: **211 de 211** endereços de `chat-files` gravados no banco encontram um
objeto real (zero órfãos); tipo em 35 (a linha de base); lint em 2 avisos, o mesmo de antes;
223 testes passando.

🔴 **Falta a conferência que só o uso real dá.** Os baldes continuam abertos, então uma falha
de assinatura aqui é INVISÍVEL — a imagem aparece do mesmo jeito, pelo endereço antigo. Por
isso o contador foi exposto no console do navegador: **F12 → `quedasDeArquivo.ver()`**. Precisa
devolver vazio depois de alguém usar o chat de verdade.

#### 2.2 — Anexos de negócio: FEITO em 26/08/2026

**Três coisas que a §4.2 deste plano dizia errado**, corrigidas por leitura do código:

| O plano dizia | O código diz |
|---|---|
| `KanbanCard.tsx:149` — link do anexo | **Não há link.** O cartão só escreve "Anexo disponível". Nada a mudar |
| `Negocios.tsx:1173` — exportação | **Não é exportação.** É a validação de campo obrigatório ao arrastar entre etapas; só testa se está preenchido |
| Exportação: recomendado exportar link da tela do CRM | **Isso quebraria a planilha.** Ver abaixo |

**O que foi trocado (5 pontos, 4 arquivos):** os quatro links viraram `<LinkAnexoPrivado>`
(coluna "Anexo" e o alias legado `pdf_url` da lista de Negócios, a lista dentro da ficha do
cliente, e a prévia da importação), e os dois botões "Ver PDF" assinam NO CLIQUE — ali vale a
pena, porque o visualizador abre dentro do app e só se paga pelo anexo que alguém abre.

O reparo de endereço corrompido do Bitrix roda ANTES da assinatura. A ordem importa: extrair
caminho de um endereço quebrado não acharia arquivo nenhum.

##### 🔴 A exportação NÃO assina, e isso é decisão, não esquecimento

Os cabeçalhos da planilha exportada são os mesmos que o assistente de importação reconhece —
de propósito, para deixar exportar, ajustar no Excel e reimportar. E a importação **grava de
volta em `pedidos.pdf_url` o que encontrar na coluna** (`resolve-pedido-pdf.ts`: endereço que
não é do Bitrix passa intacto).

Logo, exportar link assinado **plantaria no banco, de forma permanente, endereços que morrem
em uma hora** — e ninguém veria, porque a importação não reclama. A recomendação (a) do §6.1
(exportar link para a tela do CRM) tem o mesmo defeito por outro caminho: a reimportação
gravaria o endereço de uma PÁGINA como se fosse o anexo.

**Decisão: a exportação continua levando o valor gravado, cru.** A ida e volta segue
funcionando. A consequência, que precisa ser avisada à equipe antes do Passo 7: **quem receber
a planilha deixa de conseguir abrir o PDF.** Hoje qualquer pessoa com a planilha na mão baixa
o orçamento sem estar logada — o fim disso é o objetivo do projeto, não um efeito colateral.

**Medido antes de subir:** 5.179 negócios com anexo — 5.175 no nosso armazenamento, **todos os
5.175 encontram um objeto real, zero órfãos**; 4 externos (CDN do Bitrix) que passam intactos.
258 testes passando; tipo em 35 e lint sem subir em nenhum dos 4 arquivos.

#### 2.3 — Caixa do WhatsApp: FEITO em 26/08/2026

**13 pontos, não 11.** Dois blocos, cada um com sua estratégia:

· **`MessageContent`** (a bolha da conversa) recebe o resolvedor por propriedade e calcula
  `midiaUrl` UMA vez no topo. A mesma mídia é usada em até três lugares no mesmo ramo — a
  tag, o clique que amplia e o que abre em outra aba —, e é aí que uma passaria despercebida.
  As CONDIÇÕES (`msg.tipo === "imagem" && msg.media_url`) continuam olhando o valor gravado:
  perguntam "existe mídia?", e a resposta não pode depender de a assinatura ter chegado.
· **`LeadSheet`** (a galeria da ficha) assina o próprio lote, porque busca as próprias
  mensagens com `useWaMensagens`, separado da conversa aberta.

O componente principal assina em lote a conversa aberta e passa adiante: um pedido por balde,
não um por mídia — a conversa desenha 50 mensagens de uma vez.

**Varredura completa do arquivo (8.842 linhas), não só busca por `media_url`:** as outras 12
tags de mídia são o QR do painel (data URI), prévia local do que está sendo enviado (`blob:`),
o ampliador (que já recebe o endereço assinado) e 8 avatares — que são o balde `avatars`,
módulo 4. **A foto de perfil do contato do WhatsApp NÃO é nossa:** as 650 apontam para
`whatsapp.net`, zero no nosso armazenamento. Passa intacta, e o fechamento não a afeta.

**Medido:** 6.988 mensagens com mídia — 6.916 no nosso armazenamento, **todas as 6.916
encontram objeto real, zero órfãos**; 72 externas. 258 testes; tipo em 35; lint 5 → 5.

##### 🔴 Uma coisa para resolver ANTES do Passo 7, não agora

O resolvedor devolve o endereço de HOJE enquanto a assinatura não chega, e só então troca.
Hoje isso é o certo: a mídia aparece na hora e a troca é imperceptível.

**Depois que o balde fechar, essa primeira renderização passa a apontar para um endereço
morto** — imagem quebrada por uma fração de segundo antes de o link assinado chegar. Não
quebra nada, mas pisca. No Passo 6/7, trocar `enderecoDe` para devolver `null` enquanto
carrega (e a tela mostrar um vazio calmo) resolve. Fazer isso ANTES seria trocar uma tela que
funciona por uma que pisca sem motivo.

### Passo 3 — WhatsApp: assinar o link antes de entregar à operadora

**O que faz.** Em `supabase/functions/whatsapp-send/index.ts`, antes de montar o corpo do POST
(hoje `file: media_url`, linha 302), reconhecer que o endereço é do nosso Storage, extrair o
caminho e gerar um link assinado **de validade curta** (sugestão: 10 minutos — a operadora
baixa em segundos). A função já roda com credencial de serviço, então consegue assinar.

**Verificar:** enviar, pela tela, uma imagem, um áudio, um vídeo e um PDF, e confirmar que
chegaram no celular do destinatário. Este teste é obrigatório e não pode ser pulado — falha
aqui é muda (a operadora responde 200 e a mensagem não chega).
**Reverter:** reverter o deploy da função. Com o balde ainda público, volta a funcionar como
antes.
**Fora de ordem:** 🔴 **se `whatsapp-media` fechar (Passo 7) antes deste passo, todo envio de
mídia pelo CRM para de funcionar.**

> Fica registrado: mesmo assinado, o link entregue à operadora é um endereço sem senha durante
> os minutos de validade. Isso é inerente — a operadora precisa baixar o arquivo. O ganho é que
> o endereço morre em minutos, em vez de valer para sempre.

### Passo 4 — Dividir `email-assets`

**O que faz.** Separa o que precisa ser público do que não precisa:

- Balde novo **`email-inline`, privado desde o nascimento**, para as imagens embutidas de
  e-mails recebidos. `email-mensagem/index.ts:71-84` passa a gravar lá; a caixa de e-mail passa
  a assinar o link na hora de mostrar. Ninguém de fora precisa dessas imagens: elas só aparecem
  dentro do CRM.
- `email-assets` fica **público**, com **só dois caminhos**: `logo-email.png` e
  `assinaturas/{user_id}.png` — os que viajam dentro de e-mail para fora (§5.3).
- 🔴 **Os 110 objetos que já estão em `inline/` não podem simplesmente mudar de lugar.** O
  endereço deles está **embutido no HTML gravado** em `email_mensagens.corpo_html` — medido:
  **51 corpos**. E esse corpo é cache definitivo: `email-mensagem/index.ts:194` só refaz a
  substituição se o HTML ainda tiver `cid:`, e depois da primeira abertura ele não tem mais.
  Ou seja: mover o arquivo **apaga a imagem daqueles 51 e-mails para sempre**, sem chance de
  reconstrução automática.
  → O jeito seguro é **deixar os 110 velhos onde estão** e mandar só os **novos** para o balde
  privado. Os 51 corpos antigos continuam funcionando; o balde `email-assets` fica com um
  resíduo público que encolhe sozinho conforme os e-mails antigos perdem valor. Se um dia se
  quiser zerar o resíduo, aí sim: mover os arquivos **e** reescrever os 51 `corpo_html` na
  mesma transação, guardando o texto anterior antes para poder voltar.

**Verificar:** abrir um e-mail recebido antigo com imagem embutida (os 51) e um recebido depois
da mudança; mandar um e-mail de teste para uma caixa de fora (Gmail) e confirmar que logo e
assinatura aparecem.
**Reverter:** reverter o deploy da função. Nenhum arquivo foi movido, nenhum corpo reescrito —
por isso a versão recomendada deste passo não tem o que desfazer no banco.
**Fora de ordem:** independente dos demais. Pode rodar em paralelo.

### Passo 5 — Normalizar o caminho de `pedido-anexos`

**O que faz.** Duas partes:

1. **Código:** `NovoNegocioDialog.tsx:357` e `EditarPedido.tsx:324` passam a gravar em
   `{empresa_id}/{uuid}/{nome}` em vez de `{uuid}/{nome}`. A partir daí, todo arquivo novo
   nasce dentro da pasta da empresa.
2. **Dados:** mover os 40 arquivos fora do padrão (22 em pasta de UUID + 18 na raiz) para a
   pasta da empresa correta, e atualizar o `pdf_url` das linhas que apontam para eles.

**Verificar:** subir anexo novo e conferir a pasta; conferir que os 40 arquivos movidos ainda
abrem pela tela.
**Reverter:** os arquivos movidos podem voltar; a lista dos 40 caminhos, antes e depois,
precisa ser gravada em arquivo antes de mover — é isso que torna o passo reversível.
**Fora de ordem:** 🔴 **se o Passo 6 vier antes, esses 40 arquivos ficam invisíveis para
todo mundo** (a regra nova não consegue dizer de que empresa eles são).

Mesma coisa, em menor escala, para `whatsapp-media`: 1 mídia recebida de uma empresa que não
existe mais e 51 enviadas em conversas que não existem mais. Aqui a decisão pode ser diferente
— são 52 arquivos órfãos, e deixá-los inacessíveis pode ser aceitável. **Decisão do Lucas.**

### Passo 6 — 🔴 Trocar as regras de leitura (é este passo que fecha de verdade)

**O que faz.** Substitui, balde a balde, a regra "toda identidade pode ler" por "só quem é da
empresa dona do arquivo pode ler". **Com o balde ainda público** — de propósito: se a regra
nova estiver errada, o endereço público antigo ainda funciona e ninguém fica sem trabalhar
enquanto se corrige.

Feitio das regras novas (rascunho, ainda **não** escrito como migration):

| Balde | Regra de leitura |
|---|---|
| `pedido-anexos` | primeira pasta do caminho = `get_my_empresa_id()` |
| `whatsapp-media` | `incoming/{empresa}` → segunda pasta = `get_my_empresa_id()`; `{conversa}/...` → a conversa pertence à minha empresa |
| `chat-files` | primeira pasta = um `usuarios.user_id` da minha empresa |
| `email-inline` | primeira pasta = `get_my_empresa_id()` |
| `avatars` | manter aberta (ver §8) |
| `email-assets` | manter aberta, só nos dois caminhos de marca |

As regras de **escrita** já terão sido tratadas no Passo 0-bis. Se por algum motivo não tiverem,
é aqui que entram — não dá para fechar a leitura e deixar aberta a permissão de apagar.

**Verificar, com dois usuários de empresas diferentes:** cada um vê os próprios arquivos e
**não** vê os do outro. Sem esse teste cruzado o passo não está verificado.
**Reverter:** as regras antigas voltam num comando. Enquanto o balde for público, reverter
devolve o comportamento exato de hoje.
**Fora de ordem:** depende do Passo 5 (senão 92 arquivos somem) e do Passo 2 (o link assinado
passa a respeitar a regra nova; se as telas ainda usam o endereço público direto, o teste
cruzado dá falso positivo — parece que fechou e não fechou).

### Passo 7 — Virar o balde privado, um por vez

**O que faz.** `public = false` em `storage.buckets`, um balde por vez, com dias de intervalo.

Ordem sugerida, do ensaio ao risco real:

1. **`catalogo-produtos`** — vazio. É o ensaio geral do procedimento inteiro, com risco zero.
2. **`chat-files`** — 215 arquivos, uso interno.
3. **`email-inline`** — já nasce privado (Passo 4); nada a virar.
4. **`pedido-anexos`** — 14.997 arquivos, 5 GB. O maior ganho.
5. **`whatsapp-media`** — 6.395 arquivos. Por último, porque é o que depende do Passo 3.

**Verificar, para cada um:** repetir a requisição HTTP sem credencial da §1 e esperar erro em
vez de 200; **e** repetir pela porta com identidade, usando a chave pública do site, e esperar
erro também. As duas portas, senão não fechou (§5.5).

⚠️ **Esperar 1 hora antes de declarar fechado.** Os arquivos foram enviados com cache de 3.600
segundos, então uma cópia pode continuar sendo servida pela borda da CDN por até uma hora
depois da virada. Um 200 nos primeiros minutos não significa que falhou.

**Reverter:** `public = true` no mesmo balde. Volta na hora.
**Fora de ordem:** depende de 2, 3, 5 e 6. É o último.

### Passo 8 — Limpeza (semanas depois, sem pressa)

Tirar do resolvedor a queda para o endereço público (o "se não conseguir assinar, usa o
endereço velho") — enquanto ela existir, um erro futuro volta a servir arquivo aberto sem
ninguém perceber. Se tiverem escolhido o Caminho B da §6.1, é aqui que a coluna antiga pode ser
aposentada. E, se um dia se quiser zerar o resíduo público de `email-assets`, é aqui que os 110
objetos velhos saem — junto com a reescrita dos 51 `corpo_html`, na mesma transação.

**Reverter:** reverter o deploy.
**Fora de ordem:** se vier antes do Passo 2 terminar, qualquer tela ainda não convertida
quebra na hora.

---

## 8. Decisão balde a balde

| Balde | Decisão | Por quê |
|---|---|---|
| `pedido-anexos` | **fechar** | 5 GB de orçamento, PDF de cotação, espelho de pedido, nome e valor de cliente. É o ativo comercial da MD, aberto a quem tiver o link |
| `whatsapp-media` | **fechar** | 2,3 GB de conversa com cliente: foto de obra, áudio, projeto em DWG, planilha de preço |
| `chat-files` | **fechar** | conversa interna da equipe, com planilha e PDF; e hoje é o único balde onde dá para **apagar** arquivo de fora (§5.5) |
| `email-assets` → parte `inline/` | **fechar daqui para frente** (balde novo `email-inline`, privado; as 110 velhas ficam onde estão) | são imagens de e-mails **recebidos** de clientes, hoje abertas ao mundo. Ninguém de fora precisa vê-las — mas mover as velhas apagaria a imagem de 51 e-mails já lidos (Passo 4) |
| `email-assets` → logo e assinatura | **manter público** | quem busca é o programa de e-mail de quem recebe (§5.3). São 2 caminhos, não o balde inteiro |
| `avatars` | **manter público** (rever depois) | 24 fotos de perfil da equipe, sem valor comercial. Fechar custa mexer em 6 telas e o hook de perfil, para proteger foto de crachá. Vale fazer, mas depois de tudo que importa |
| `branding` | **manter público** | vazio hoje; a finalidade (logo da empresa) tende a ser pública. Decidir quando for usado |
| `catalogo-produtos` | **fechar** | vazio hoje — fechar agora custa nada e evita nascer aberto. Serve de ensaio do Passo 7. Reavaliar se o catálogo virar vitrine para cliente |

---

## 9. O que quebra em cada ordem errada

| Se aplicar… | …antes de… | O que acontece |
|---|---|---|
| Passo 7 (`public = false`) | Passo 2 | Toda tela com anexo, mídia de WhatsApp e arquivo de chat quebra na hora, para todos os usuários |
| Passo 7 em `whatsapp-media` | Passo 3 | **Todo envio de mídia pelo WhatsApp para de funcionar, e falha em silêncio** — a operadora responde 200 e a mensagem não chega |
| Passo 6 (regras novas) | Passo 5 | 92 arquivos (40 de anexo + 52 de WhatsApp) ficam invisíveis para todo mundo, inclusive para o dono |
| Passo 6 | Passo 2 | O teste cruzado entre duas empresas dá falso positivo: as telas ainda usam o endereço público, que ignora a regra nova |
| Passo 2 | Passo 1 | Não há o que chamar; nada compila |
| Passo 8 (tirar a queda para o público) | Passo 2 completo | Toda tela ainda não convertida quebra na hora |
| Mover os 110 objetos de `inline/` | reescrever os 51 `corpo_html` | A imagem some de 51 e-mails já lidos **para sempre** — o corpo é cache definitivo e não se reconstrói (Passo 4) |
| Apagar `Temporary full access to chat files` | pôr as regras de escrita no lugar | Ninguém consegue mais anexar arquivo nem pôr foto em grupo no chat interno (Passo 0-bis) |
| Fechar `email-assets` inteiro | — | Logo e assinatura somem do e-mail **na caixa do cliente** — e a MD só descobre quando alguém reclamar |

---

## 10. O que este plano NÃO resolve

- **Os 9.822 anexos órfãos** (14.997 objetos, apenas 5.175 referenciados por algum negócio) e
  as 222 mídias de WhatsApp órfãs. É outra frente — ver `docs/modulos/anexos.md`, que mediu
  5.587 órfãos em 10/08 e hoje são 9.822. Fechar o balde não apaga nada; só tira o balde da rua.
- **`logo-email.png` é um caminho único para TODAS as empresas.** `Configuracoes.tsx:303` grava
  na raiz do balde, sem empresa no caminho: a logo de uma empresa sobrescreve a da outra.
  Hoje o arquivo nem existe, então o problema está latente, não ativo. É um bug de multi-empresa,
  não de vazamento — mas o Passo 4 é a hora natural de consertar.
- **A chave do WhatsApp legível em `webhook_debug`** — outra frente, já registrada em
  `docs/arquitetura/integracoes-externas.md`.
- **O link assinado entregue à operadora do WhatsApp** continua sendo um endereço sem senha
  durante a validade. Inerente ao envio de mídia; mitigado por validade curta.
- **Quem já baixou, já baixou.** Fechar o balde protege daqui para frente. Não há como saber
  quem baixou o quê no período em que esteve aberto — não há registro de acesso a arquivo
  público.

---

## 11. Como isto foi verificado

Tudo em leitura. Nenhuma escrita, nenhuma migration, nenhum `git`, nenhum `npm`.

- Baldes, regras de leitura, tamanhos e caminhos: `SELECT` em `storage.buckets`,
  `storage.objects`, `pg_policy`.
- Endereços gravados: `SELECT` com `count(*) filter` em `pedidos`, `whatsapp_mensagens`,
  `chat_mensagens`, `usuarios` e mais 9 colunas de arquivo, todas listadas na §3; e busca por
  `/object/public/` **dentro do texto** de `email_mensagens.corpo_html`, que é o único lugar
  onde o endereço não está numa coluna de endereço.
- Cruzamento endereço ↔ arquivo: `LEFT JOIN` entre o caminho extraído do endereço e
  `storage.objects.name`.
- Produtores e consumidores: `grep` por `getPublicUrl`, `.storage`, `object/public`,
  `createSignedUrl`, `media_url`, `pdf_url`, `arquivo_url`, `avatar_url` em `src/`,
  `supabase/` e `scripts/`.
- Acesso público: `curl -I` sem nenhuma credencial contra um objeto de cada balde. Resultados
  na §1.
