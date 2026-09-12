# Duplicar um negócio

> Desenho validado com o dono do produto em 12/09/2026. É o **pacote 3** do lote de pedidos de
> 11/09/2026 (ver a memória `pacotes-de-correcoes-11-09-2026`).

## 1. Por que este trabalho existe

O Lucas pediu: **duplicar um negócio**. Hoje não existe — quem precisa de um negócio parecido com
outro monta tudo de novo, à mão, e erra ou desiste.

Perguntado sobre o motivo de duplicar, a resposta foi **"varia muito"**: não há um padrão único
(outra fábrica, outra obra, nova rodada do mesmo cliente). Isso decide o desenho inteiro: a cópia
vem **igual ao original** e a pessoa troca o que precisar **antes** de o negócio existir.

## 2. O que existe hoje (medido em 12/09/2026 — não re-descubra)

- **12.491 negócios.** Só **229** nasceram dentro do CRM, todos no último mês; o resto veio da
  importação do Bitrix.
- **Itens não existem mais.** `itens_pedido` tem **zero** linha ligada aos negócios de hoje: o
  catálogo de produtos saiu em 26/08/2026. **A cópia não tem item para levar.**
- **Anexo:** 5.433 negócios têm PDF (`pedidos.pdf_url`, uma coluna só — é o que o pacote 5 vai
  transformar em vários).
- **Responsáveis:** 4.682 negócios têm **mais de um** (`pedido_responsaveis`). O principal é
  criado por gatilho do banco (`trg_semeia_responsavel`) a partir de `pedidos.usuario_id`; os
  outros são gravados pela tela, e **gravar responsável exige a permissão de EDITAR** — por isso
  `useCreatePedidoCompleto` já avisa, sem derrubar a criação, quando essa gravação é recusada.
- **Campos extras dos negócios são rastro de importação, não campo de empresa.** Nenhuma das 10
  empresas criou campo próprio para negócio (`configuracoes_campos`, entidade `pedidos`, só tem
  campos `padrao`). O que está em `pedidos.campos_extras` é: `Negócio` e `Contato` (colunas da
  planilha do Bitrix), `Vendedor Original` e `responsavel_corrigido` (da correção de
  responsáveis), `marcador`, `migracao_obra`, e marcas de lote e demonstração. **A coluna
  "Contato" da tela de Negócios lê `campos_extras['Contato']`** (`PainelDeNegocios.tsx`,
  `Negocios.tsx`, `pedido-to-order.ts`).
- **Cinco gatilhos rodam quando um negócio nasce.** Os que importam aqui:
  - `fn_set_pedido_fechado_em`: negócio que nasce em `fechamento` ou `perdido` recebe
    `fechado_em = agora` e, sem data preenchida, **a data de fechamento de hoje**;
  - `fn_log_pedido_historico_status`: grava a primeira etapa no histórico;
  - `fn_semeia_responsavel_do_pedido`: cria a linha do responsável principal.
- **O painel do negócio é o mesmo em quatro telas** (`Negocios`, `Hoje`, a lista
  `PainelDeNegocios` e `VendasDaObra`). O rodapé dele tem Editar e Fechar à esquerda e Excluir à
  direita.
- **A janela de Novo Negócio só aceita o cliente pré-escolhido** (`NovoNegocioDialogProps`:
  `clienteId`, `status`, `funilId`, `onCreated`). O anexo dela só aceita **arquivo novo**
  (`pdfFile`), com envio para o balde `pedido-anexos`.
- **Criar negócio não tem trava de permissão na tela.** Só `editar` e `excluir` são conferidos
  (`useMinhaPermissao('pedidos', …)`).
- **Tirar o anexo de um negócio só apaga o link:** `pdf_url = null`, e o arquivo continua no
  balde (`EditarPedido.tsx`). Nenhum gesto de tela apaga arquivo do armazenamento.

## 3. Decisões do dono do produto (12/09/2026 — não reabrir)

1. **A cópia vem igual e a pessoa troca o que precisar.** Não há motivo dominante para duplicar.
2. **A cópia nasce na primeira etapa do funil**, sem data de fechamento. É o que impede que
   duplicar um negócio ganho crie **outra venda ganha** — com a data de hoje, pelo gatilho — e
   dobre o faturamento do mês no Dashboard.
3. **Observações não vão junto.** É o texto daquela negociação.
4. **Valor, anexo e os outros responsáveis vão junto.**
5. **A cópia fica com o mesmo responsável principal do original.** Um gestor que duplica não
   puxa o negócio para si sem querer; dá para trocar antes de salvar.
6. **Caminho A:** duplicar **abre a janela de Novo Negócio já preenchida**. Nada é gravado até a
   pessoa clicar em Criar.

### Decisões do desenho, apresentadas e aprovadas

7. **Campo extra só vai se a empresa o tiver criado** (`origem = 'customizado'`). O rastro da
   importação — `Negócio`, `Contato`, `Vendedor Original`, `responsavel_corrigido`, `_lote`,
   `_demo` — **não é copiado**: ele conta de onde aquele negócio veio, e a cópia não veio de lá.
   Consequência visível e aceita: a coluna "Contato" da lista aparece vazia na cópia até alguém
   preencher.
8. **A cópia aponta para o mesmo arquivo de anexo do original.** Não há cópia de arquivo no
   armazenamento.
9. **A cópia não ganha marca de "veio de outro negócio".** O espaço de comentários é da equipe, e
   recado automático ali vira ruído.

## 4. O desenho

### 4.1 O gesto

Botão **Duplicar** no rodapé do painel do negócio, ao lado de Editar — assim ele nasce nas quatro
telas de uma vez. Segue a mesma régua do botão "Novo Negócio" (que hoje não tem trava própria) e
fica desabilitado enquanto o negócio ainda está carregando, como o Editar já faz.

Ao clicar: o painel fecha e a janela de **Novo Negócio** abre preenchida, com o aviso
**"Cópia de «nome do negócio»"** no topo. O botão de confirmar continua sendo o de criar negócio.
Fechar a janela sem confirmar **não grava nada**.

### 4.2 O que a cópia leva

| Vem preenchido | De onde |
|---|---|
| Cliente, obra, fábrica | as mesmas do original |
| Responsável principal | o mesmo do original (decisão 5) |
| Outros responsáveis | os mesmos; se a gravação for recusada por permissão, vale o aviso que já existe |
| Marcador, origem do lead, endereço de entrega | os mesmos |
| Valor de negociação | o mesmo |
| Anexo | **o mesmo arquivo**, pelo link (decisão 8) |
| Nome | a mesma regra do original: automático continua automático; nome próprio vem igual e é editável |
| Funil | o mesmo do original |

### 4.3 O que nasce diferente

| Campo | Na cópia | Por quê |
|---|---|---|
| Etapa | **primeira etapa do funil** do original (a de menor `ordem` em `kanban_colunas`) | decisão 2 |
| Data de criação | hoje | é um negócio novo |
| Data de fechamento | vazia | ela é carimbada quando fechar |
| Observações | vazias | decisão 3 |
| Campos extras | só os `customizado` da empresa | decisão 7 |
| Histórico, comentários, tarefas, mensagens, notificações | não vão | são a vida do original |

### 4.4 O anexo, sem cópia de arquivo

A janela de Novo Negócio passa a aceitar **um anexo que já existe** (o link do original), além do
arquivo novo que ela já aceita. Na tela isso aparece como o nome do arquivo com a opção de tirar
ou trocar; trocar envia arquivo novo, como hoje.

Tirar ou trocar o anexo **na cópia** mexe só no link dela. Como nenhum gesto de tela apaga arquivo
do balde, o original nunca fica sem o PDF. Quando o pacote 5 trouxer vários anexos por negócio, a
cópia leva todos pelo mesmo caminho — ela copia **referências**, não arquivos.

## 5. O que este trabalho NÃO faz

| | Por quê |
|---|---|
| Não copia histórico, comentários, tarefas, mensagens nem notificações | São o que aconteceu com o original |
| Não copia item de pedido | Não existe item ligado a negócio desde 26/08/2026 |
| Não duplica arquivo no armazenamento | A cópia aponta para o mesmo arquivo (decisão 8) |
| Não registra de onde a cópia veio | Decisão 9. Se virar necessidade, é pedido próprio |
| Não cria permissão nova | Duplicar é criar, e criar não tem trava hoje |
| Não duplica em massa (vários de uma vez) | Ninguém pediu, e o gesto é caro de desfazer |

## 6. Como se prova que funcionou

**Testes automatizados** (a função pura que monta a cópia, testada sem tela):

- a cópia leva cliente, obra, fábrica, responsáveis, marcador, origem, endereço, valor, anexo e a
  regra de nome do original;
- a cópia **não** leva observações, nem campo extra de importação (`Negócio`, `Contato`,
  `Vendedor Original`, `responsavel_corrigido`, `_lote`, `_demo`), e leva campo `customizado`;
- duplicar um negócio em `fechamento` devolve a **primeira etapa** e **sem data de fechamento** —
  é o teste que impede a venda contada duas vezes;
- a data de criação da cópia é hoje, no fuso local (`hojeLocal`, CLAUDE.md §7.12);
- a cópia de um negócio sem anexo não inventa anexo.

**Testes de tela:**

- o botão Duplicar abre a janela preenchida e **não grava nada**; fechar sem confirmar não cria
  negócio;
- a janela mostra o anexo herdado pelo nome do arquivo, e tirar o anexo na cópia não muda o
  original.

**Ensaio na tela** (sem gravar em produção — o ensaio para antes de Criar):

1. Abrir um negócio com anexo, dois responsáveis e valor; clicar em Duplicar. A janela abre com
   tudo isso preenchido, etapa na primeira do funil, data de fechamento vazia e observações
   vazias.
2. Fechar sem confirmar e conferir que a contagem de negócios do cabeçalho não mudou.
3. Abrir um negócio **ganho** e duplicar: a janela abre na primeira etapa, não em Fechamento.
