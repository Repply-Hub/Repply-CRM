# Anexos em Tarefas — desenho

**Data:** 2026-09-22
**Estado:** desenho aprovado no brainstorming, aguardando escrita do plano
**Molde:** espelha os **anexos de negócio** (`pedido_anexos`, migration
`20260917100000_pedido_anexos.sql`, hook `use-pedido-anexos.ts`) — a implementação que já está
no ar. O pedido do Lucas foi "assim como nos negócios".

---

## 1. Por que este trabalho existe

Uma tarefa hoje **não aceita anexo nenhum**. No trabalho real, uma tarefa carrega o material que
ela precisa: o PDF a conferir, a planilha de preços, o print, o documento em Word. O pedido:
**anexar arquivos ao criar e ao editar a tarefa, vários, como já se faz nos negócios.**

## 2. Decisões tomadas (com o dono do produto)

| Decisão | Escolha |
|---|---|
| **Tipos de arquivo** | Amplo de escritório: **PDF, imagens (JPG/PNG), Word, Excel, PowerPoint, texto/CSV e ZIP**. (Nos negócios é só PDF e imagem, porque é orçamento; tarefa é trabalho interno.) |
| **Tamanho** | **15 MB por arquivo** (o teto da casa, `MAX_FILE_SIZE_MB`). |
| **Quantidade** | **Sem limite.** |
| **Quem anexa/remove** | Quem **edita a tarefa**: o dono (`usuario_id`) ou um gestor. Participante que não é dono não anexa. |
| **No card do Kanban** | Um **clipe 📎 com a contagem** quando a tarefa tem anexo. |
| **Reutilização** | Reusa as peças compartilhadas já testadas (`LinkAnexoPrivado`, `useArquivoPrivado`, `file-validation`); espelha o hook `use-pedido-anexos` num `use-tarefa-anexos`. |

## 3. O desenho

### 3.1 Onde os anexos moram

Tabela nova `tarefa_anexos`, uma linha por arquivo — espelho exato de `pedido_anexos`:

| Coluna | O que guarda |
|---|---|
| `id` | identificador da linha |
| `tarefa_id` | a tarefa (`references public.tarefas(id) on delete cascade`) |
| `url` | endereço do arquivo no balde |
| `nome` | nome do arquivo como a pessoa vê |
| `tipo` | o MIME (`application/pdf`, `image/png`, `application/vnd.openxmlformats-...`, `application/zip`, …) |
| `tamanho_bytes` | para a tela mostrar "2,4 MB" |
| `criado_por` | `references public.usuarios(id) on delete set null` — mande `profile.id` |
| `created_at` | quando |

Índice em `tarefa_id`. Nasce por migration, com RLS ligada e políticas no mesmo arquivo.

**Sem cópia retroativa:** ao contrário dos negócios (que tinham `pedidos.pdf_url` para migrar),
a tarefa nunca teve anexo — a tabela nasce vazia.

### 3.2 As regras de acesso — por existência sobre a tarefa

Espelham a tarefa, escritas como **condição de existência** (nunca copiando as condições de
`tarefas` à mão — copiar cria duas verdades, e a segunda envelhece calada quando a regra da
tarefa mudar):

- **select:** `exists (select 1 from tarefas t where t.id = tarefa_id)`. Quem enxerga a tarefa
  (a RLS de `tarefas_select` já corta por empresa/visibilidade) enxerga os anexos dela.
- **insert e delete:** `exists (select 1 from tarefas t where t.id = tarefa_id and (t.usuario_id
  = get_my_usuario_id() or (is_gestor() and usuario_in_my_empresa(t.usuario_id))))`. É a mesma
  régua de **editar a tarefa** (`tarefas_update`): dono ou gestor.

> Espelha o molde: o `pedido_anexos` também **não** tem trava de plano própria — a régua de
> existência sobre o pai é a única. Mantemos igual (não divergir do molde), anotado aqui para não
> parecer esquecimento.

### 3.3 O arquivo no balde

Balde novo `tarefa-anexos`, espelhando `pedido-anexos`. O arquivo nasce **dentro da pasta da
empresa**: `{empresa_id}/{uuid}/{nome sanitizado}` — a primeira pasta é o dono, é ela que a regra
de leitura vai usar quando o balde fechar (plano dos baldes privados, que corre por fora). Quem
abre o anexo é o `LinkAnexoPrivado` de sempre (assina o endereço quando dá).

### 3.4 Na tarefa (criar e editar) — `TarefaFormDialog`

Uma seção de anexos, **do mais novo no topo**:

- cada linha traz o ícone (por tipo) ou a **miniatura** (imagem), o nome, o tamanho e um **×**;
- clicar no nome abre o arquivo, pelo caminho assinado de sempre (`LinkAnexoPrivado`);
- abaixo da lista, o botão **"Adicionar anexo"** — o que entra sobe, o botão desce;
- arquivo acima de 15 MB, ou de tipo fora da lista, é **recusado antes de subir**, com a frase
  dizendo o que aconteceu (`file-validation` com a lista de tipos de tarefa);
- enquanto sobe, a linha aparece com indicação de envio; se falhar, ela some e a tela avisa.

O **mesmo componente serve criar e editar** — nos negócios eram dois trechos copiados que
divergiram; aqui já nasce um só.

**Ao CRIAR:** a tarefa ainda não tem `id` quando a pessoa escolhe os arquivos. Os arquivos sobem
para o balde na hora, e as linhas de `tarefa_anexos` são gravadas **depois** que a tarefa é
criada e devolve o `id` (o hook recebe o `tarefa_id` no momento do salvamento). Se a criação da
tarefa falhar, os arquivos já enviados ficam órfãos no balde — aceitável (é o mesmo que hoje já
acontece com anexo de negócio, e o balde não é apagado por gesto de tela).

### 3.5 No quadro (Kanban) — `TarefaKanbanCard`

O card ganha um **clipe 📎 com a contagem** quando a contagem de anexos é maior que zero. A
contagem vem junto da tarefa (na consulta que já monta o card), para não fazer uma consulta por
card.

## 4. O que este trabalho NÃO faz (YAGNI)

| | Por quê |
|---|---|
| Não apaga arquivo do balde | Tirar o anexo tira a linha; o arquivo fica — é o que permite desfazer engano (igual aos negócios) |
| Não muda quem edita a tarefa | Segue dono ou gestor; participante que não é dono não anexa |
| Não exporta/importa anexo por planilha | Tarefa não vem de planilha (diferente do negócio) |
| Não cria galeria, visualizador nem edição de imagem | O arquivo abre no aparelho, como hoje |
| Não fecha o balde nem mexe na assinatura de endereço | É o plano dos baldes privados, que corre por fora |
| Não muda o teto de 15 MB nem põe limite de quantidade | É a regra da casa |

## 5. Como se prova que funcionou

**Testes automatizados:**

- a validação: arquivo acima de 15 MB e arquivo de tipo fora da lista (ex.: `.exe`) não sobem, e a
  frase diz o motivo; um `.xlsx` e um `.pdf` passam;
- a ordem: o anexo acrescentado por último aparece em primeiro;
- a contagem do card: 0 anexos → sem clipe; 3 anexos → clipe "3";
- (se a lógica de "quais tipos aceita" virar função pura, testá-la isolada — evitar decidir tipo
  solto dentro do componente).

**Ensaio na tela** (num ambiente de teste; o passo que grava é feito numa tarefa de teste e
desfeito):

1. Criar uma tarefa nova já com dois anexos (um PDF e uma planilha): os dois entram, o mais novo
   em cima, com miniatura na imagem se for imagem. 🔴 grava — usar tarefa de teste.
2. Abrir uma tarefa existente e acrescentar um anexo: entra em cima; recarregar e ele continua lá.
3. Tentar subir um arquivo de 20 MB e um `.exe`: os dois recusados, com a frase, sem nada subir.
4. Tirar um anexo: a linha some; o arquivo continua no balde (não é gesto de exclusão de arquivo).
5. No quadro, a tarefa com 3 anexos mostra o clipe com "3".
6. Como **vendedor que não é dono** da tarefa: vê os anexos, mas **não** consegue adicionar nem
   remover (a régua de edição da tarefa barra no banco, sem erro fantasma — conferir a contagem).

## 6. Estrutura do código

- **Migration** `..._tarefa_anexos.sql`: tabela + índice + RLS (as três políticas por existência) +
  criação do balde `tarefa-anexos`.
- **Hook** `src/hooks/use-tarefa-anexos.ts`: espelha `use-pedido-anexos.ts` — listar anexos de uma
  tarefa, subir arquivo (para `{empresa_id}/{uuid}/{nome}`) + inserir linha, remover linha
  (conferindo a contagem de linhas afetadas — a recusa da RLS volta sem erro, CLAUDE.md §4.6).
- **Componente** de lista de anexos: se o dos negócios já for fácil de generalizar (recebe a lista
  e os callbacks de subir/remover, sem saber se é pedido ou tarefa), **reusa um só**; senão,
  espelha um `AnexosDaTarefa` focado. Decidido no plano, ao ler o componente real.
- **`TarefaFormDialog.tsx`**: encaixa a seção de anexos; grava as linhas com o `tarefa_id` no
  salvamento (criar: depois do insert da tarefa; editar: com o `id` já em mãos).
- **`TarefaKanbanCard.tsx`** + a consulta que alimenta o card: traz a contagem de anexos e mostra o
  clipe.
- **`types.ts`**: acrescenta o bloco de `tarefa_anexos` à mão.

## 7. Fora de escopo

- Cópia retroativa (tarefa nunca teve anexo).
- Trava de plano própria na tabela de anexos (o molde não tem; não divergir).
- Enviar anexo de tarefa por WhatsApp/e-mail; galeria; edição de imagem.

## 8. Próximo passo

Escrever o plano de implementação (skill `writing-plans`), quebrando em: (1) migration (tabela +
RLS + balde) + tipos; (2) hook `use-tarefa-anexos` com teste; (3) seção de anexos no
`TarefaFormDialog` (criar + editar); (4) clipe de contagem no card; (5) testes e verificação.
