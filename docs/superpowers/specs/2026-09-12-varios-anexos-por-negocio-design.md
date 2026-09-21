# Vários anexos por negócio

> Desenho validado com o dono do produto em 12/09/2026. É o **pacote 5** do lote de pedidos de
> 11/09/2026 (ver a memória `pacotes-de-correcoes-11-09-2026`). É o maior dos cinco: mexe no
> banco, na ficha do negócio, na lista, na planilha de exportação e na importação.

## 1. Por que este trabalho existe

O pedido do Lucas: **um negócio precisa aceitar mais de um anexo**. Hoje aceita um só, e a
interface que ele descreveu diz o resto: *"o anexo adicionado sobe e o botão de adicionar desce
para baixo dele"* — a tela tem de deixar claro, sem explicação, que cabe mais de um.

No trabalho real, um orçamento não vem sozinho: vai o PDF da cotação, depois a versão revisada,
depois a foto da obra ou o print da conversa em que o cliente aprovou.

## 2. O que existe hoje (medido em 12/09/2026 — não re-descubra)

- **O anexo é uma coluna só:** `pedidos.pdf_url`, texto. Um negócio, um arquivo.
- **5.438 negócios têm anexo.** 5.434 apontam para o balde do sistema (`pedido-anexos`) e **4**
  ainda apontam para o CDN do Bitrix, de onde a importação não conseguiu baixar.
- **O arquivo nasce dentro da pasta da empresa:** `{empresa_id}/{uuid}/{nome sanitizado}`. A
  primeira pasta é o dono — é ela que a regra de leitura vai usar quando o balde fechar
  (`docs/operacao/plano-baldes-privados.md`). Quem envia é `NovoNegocioDialog` e `EditarPedido`,
  os dois com o mesmo trecho copiado.
- **Tirar o anexo hoje só apaga o link** (`pdf_url = null`): o arquivo continua no balde. Nenhum
  gesto de tela apaga arquivo.
- **O teto de tamanho da casa é 15 MB** (`MAX_FILE_SIZE_MB`, em `src/lib/file-validation.ts`, que
  também confere extensão e tipo). O campo de anexo do negócio hoje aceita só `.pdf`.
- **Quem abre o anexo é o `LinkAnexoPrivado`**: ele conserta endereços herdados do Bitrix com
  pontos trocados por vírgula e assina o endereço quando dá (`useArquivoPrivado`).
- **Na lista de negócios**, a coluna "Anexo" (id interno `pdf_url`, rótulo renomeado) é de
  **presença**: mostra o link quando existe e ordena por ter/não ter.
- **Na planilha exportada**, a coluna "Anexo" leva o endereço **cru, nunca assinado** — porque os
  cabeçalhos da exportação são os mesmos que a importação reconhece, e link assinado morre em uma
  hora. A coluna **Código/ID** (o identificador do negócio) é o que permite exportar, editar e
  reimportar sem duplicar.
- **Na importação**, "Anexo" vira `pedidos.pdf_url`; endereço do Bitrix é **baixado e guardado**
  no balde (`resolveEspelhoPdfUrls`, em `use-bulk-import.ts`), e o que não é do Bitrix passa
  intacto.
- **As regras de acesso de `pedidos`:** vê quem é da mesma empresa
  (`usuarios_da_minha_empresa`); muda quem é dono do negócio, gestor, ou tem a permissão
  `pedidos.editar` — e, por regra restritiva, só com a empresa em dia.

## 3. Decisões do dono do produto (12/09/2026 — não reabrir)

1. **Pode anexar PDF e imagem** (JPG, PNG). Não é "qualquer arquivo".
2. **Os 5.438 anexos de hoje passam para a lista nova**, por uma mudança no banco que copia todos
   de uma vez. A coluna antiga **não é apagada** — é a rota de volta.
3. **Na lista de negócios**, a coluna Anexo mostra o **primeiro anexo com "+N" ao lado**.
4. **Tira o anexo quem pode editar o negócio** — a mesma régua do resto da ficha.
5. **Na planilha:** a exportação leva **todos** os links, separados por vírgula; a importação usa
   a coluna **só ao criar** negócio novo (aceitando vários). **Negócio que já existe nunca perde
   nem troca anexo por reimportação.**
6. **Na ficha:** o anexo recém-adicionado entra **em cima** e o botão de adicionar fica
   **embaixo** da lista.

### Decisões do desenho, apresentadas e aprovadas

7. **Uma tabela nova** guarda os anexos, uma linha por arquivo, com as mesmas regras de acesso do
   negócio a que ela pertence.
8. **Continua sem apagar arquivo do balde.** Tirar um anexo tira a linha; o arquivo fica. É o que
   já acontece hoje, e é o que permite desfazer um engano.
9. **15 MB por arquivo**, o teto que já vale no sistema. **Sem teto de quantidade.**

## 4. O desenho

### 4.1 Onde os anexos passam a morar

Tabela `pedido_anexos`, uma linha por arquivo:

| Coluna | O que guarda |
|---|---|
| `id` | identificador da linha |
| `pedido_id` | o negócio |
| `url` | o endereço do arquivo no balde |
| `nome` | o nome do arquivo como a pessoa vê |
| `tipo` | `application/pdf`, `image/jpeg`, `image/png` |
| `tamanho_bytes` | para a tela mostrar "2,4 MB" |
| `criado_por` | quem anexou |
| `created_at` | quando |

**As regras de acesso espelham as do negócio**, e não se repetem à mão: quem enxerga o negócio
enxerga os anexos dele; quem pode mudar o negócio pode acrescentar e tirar anexo. Isso é escrito
como uma condição de existência sobre `pedidos`, para que qualquer mudança futura nas regras do
negócio continue valendo aqui sem ninguém lembrar de atualizar dois lugares.

**A cópia dos 5.438:** a mesma mudança no banco insere uma linha em `pedido_anexos` para cada
negócio com `pdf_url` preenchido, com o nome saindo do próprio endereço. `pedidos.pdf_url` fica
como está — congelada, sem ninguém escrevendo nela a partir daí.

### 4.2 Na ficha do negócio

Lista de anexos, do mais novo para o mais antigo:

- cada linha traz o ícone (PDF) ou a **miniatura** (imagem), o nome do arquivo, o tamanho e um
  **×**;
- clicar no nome abre o arquivo, pelo mesmo caminho assinado de hoje;
- abaixo da lista, o botão **Adicionar anexo** — é o desenho que o Lucas pediu: o que entra sobe,
  e o botão desce;
- arquivo acima de 15 MB, ou de tipo que não é PDF nem imagem, é **recusado antes de subir**, com
  a frase dizendo o que aconteceu;
- enquanto sobe, a linha aparece com indicação de envio; se falhar, ela some e a tela avisa.

O mesmo componente serve o cadastro (Novo Negócio) e a edição — hoje são dois trechos copiados,
e é assim que eles divergem.

### 4.3 Na lista de negócios

A coluna "Anexo" passa a mostrar **o primeiro anexo, com "+N" ao lado** quando houver mais.
Clicar no nome abre o arquivo; clicar no "+N" abre o negócio. A ordenação continua por presença
(tem anexo / não tem), como hoje.

### 4.4 Na planilha

- **Exportação:** a coluna "Anexo" leva **todos** os endereços, separados por vírgula, crus (sem
  assinatura) — pelo mesmo motivo de hoje: link assinado morre em uma hora e a importação o
  gravaria de volta.
- **Importação:** a coluna "Anexo" continua sendo reconhecida. Ela vale **somente para negócio
  novo**: cada endereço da lista vira um anexo, e endereço do Bitrix continua sendo baixado e
  guardado. Para negócio que já existe (reencontro pelo **Código/ID**), a coluna é **ignorada**, e
  a prévia diz isso em números: "N linhas já existem — os anexos delas não serão alterados".

Essa é a regra que impede a pior falha possível deste pacote: reimportar uma planilha antiga e
apagar, em silêncio, os anexos que alguém acrescentou pela tela.

### 4.5 O que acontece com o anexo antigo

`pedidos.pdf_url` deixa de ser lida pelas telas depois da cópia, e deixa de ser escrita por
qualquer caminho. Ela permanece no banco como histórico e rota de volta. Apagá-la é decisão de
outro dia, quando os anexos novos tiverem rodado por tempo suficiente.

## 5. O que este trabalho NÃO faz

| | Por quê |
|---|---|
| Não apaga arquivo do balde | Decisão 8: tirar o anexo tira a linha, o arquivo fica — é o que permite desfazer engano |
| Não fecha o balde nem mexe na assinatura dos endereços | É o plano dos baldes privados, que corre por fora |
| Não muda o teto de 15 MB por arquivo | É a regra da casa, e ninguém pediu outra |
| Não põe limite de quantidade | Decisão 9 |
| Não cria galeria, visualizador nem edição de imagem | Anexo se abre no aplicativo do aparelho, como hoje |
| Não mexe no envio de anexo por WhatsApp ou e-mail | Ninguém pediu; o catálogo tem caminho próprio |
| Não apaga `pedidos.pdf_url` | Decisão 2: é a rota de volta |

## 6. Como se prova que funcionou

**Testes automatizados:**

- a cópia dos anexos antigos: para cada negócio com `pdf_url`, uma linha na lista nova, com o
  nome tirado do endereço — e **nenhum** negócio com anexo fica sem linha (a conta bate: 5.438);
- a ordem da lista: o anexo acrescentado por último aparece em primeiro;
- a recusa: arquivo acima de 15 MB e arquivo de tipo não aceito não sobem, e a frase diz o motivo;
- a coluna da lista: com 1 anexo mostra o nome; com 3, mostra o primeiro e "+2"; com nenhum, o
  traço;
- a planilha: a exportação junta os endereços com vírgula, crus; a importação, para linha com
  Código/ID que já existe, **não** toca nos anexos; para linha nova, cria um anexo por endereço.

**Ensaio na tela** (sem gravar em produção — o ensaio para antes de salvar, com a exceção dita):

1. Abrir um negócio que já tem anexo, **depois da cópia aplicada**: o anexo antigo aparece na
   lista nova, com o nome certo, e abre.
2. Acrescentar um segundo anexo (PDF) e uma imagem: os dois entram em cima, com miniatura na
   imagem. 🔴 Este passo **grava** — faça num negócio de teste e apague os anexos ao terminar.
3. Tentar subir um arquivo de 20 MB e um arquivo `.docx`: os dois são recusados, com a frase
   certa, sem nada subir.
4. Na lista de negócios, o negócio com 3 anexos mostra o primeiro e "+2".
5. Exportar uma seleção pequena e conferir, na planilha, que a coluna Anexo traz os endereços
   separados por vírgula.
6. Passar essa mesma planilha pela prévia da importação: ela diz que as linhas já existem e que
   os anexos não serão alterados. **Pare na prévia, sem importar.**
