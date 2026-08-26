# Catálogo de produtos — removido em 26/08/2026, e como retomar

> Este documento existe para uma pessoa só: quem, daqui a meses, for decidir se vale
> ressuscitar o cadastro de produtos. Ele guarda o que o módulo fazia, **de onde recuperar cada
> arquivo**, e — o mais importante para a decisão — **os números que mostram que ele nunca foi
> usado**.

---

## 1. A informação que decide

**O módulo nunca teve dado real, em nenhuma empresa.** Medido em produção em 26/08/2026, antes
da remoção:

| | |
|---|---|
| `tabela_precos` (o catálogo em si) | **0 linhas**, nas 8 empresas |
| `itens_pedido` (itens dentro do negócio) | **1 linha**, para 1 negócio |
| negócios no total | **11.910** |
| itens criados DENTRO do CRM (após a importação de 21/08) | **0** |
| balde `catalogo-produtos` (imagem de produto) | **0 arquivos** |
| linhas de catálogo pendentes de reimportação | **0** |
| `src/pages/Catalogo.tsx` | **já órfã** — sem rota e sem import, inalcançável |

Um item em 11.910 negócios, e nenhum criado dentro do sistema. A tela principal do módulo já
não era alcançável por ninguém antes desta remoção.

🔴 **Se um dia alguém propuser trazer o módulo de volta, comece por aqui.** A pergunta não é
"quanto custa reconstruir" — o código está guardado e volta em um comando. A pergunta é o que
mudou desde 2026 para que desta vez alguém fosse usá-lo.

## 2. Por que saiu

Decisão dos sócios da Repply em 26/08/2026: **catálogo de produtos vira plano futuro**. Para o
MVP, o que a representação precisa não é cadastrar produto a produto — é ter o **PDF do
catálogo da fábrica à mão e conseguir mandá-lo ao cliente em um clique**.

O drive de catálogos por fabricante ocupa o lugar dele na tela da fábrica. Desenho completo em
[`../superpowers/specs/2026-08-26-drive-de-catalogos-design.md`](../superpowers/specs/2026-08-26-drive-de-catalogos-design.md).

## 3. O que o módulo fazia

- **Cadastro de produto por fabricante** em `tabela_precos`: descrição, referência, categoria,
  unidade, preço unitário, imagem e campos extras, com marca de vigência.
- **Tabela na ficha do fabricante**, com filtro por categoria, colunas configuráveis,
  redimensionáveis e salváveis em preset, seleção em massa e exclusão em massa.
- **Dois importadores por planilha**: um por fabricante (`ImportCatalogoDialog`) e um global
  (`GlobalImportCatalogoDialog`), que resolvia o fabricante pelo nome.
- **Reprocessamento de linha recusada** em `LinhasIgnoradas.tsx` (`retryCatalogo`), para a
  planilha que caiu por fabricante inexistente ou preço inválido.
- **Escolha de produto ao montar o negócio**: o componente `ItemDescricaoField` sugeria itens do
  catálogo da fábrica enquanto a pessoa digitava, e preenchia preço e unidade ao escolher.

⚠️ **Um detalhe que enganava:** na ficha do fabricante havia um botão com o título *"Importar
fabricantes"* que, na verdade, abria o importador de **produtos** (`GlobalImportCatalogoDialog`,
que terminava com "X produtos importados com sucesso"). Ele saiu junto. **Não existe hoje, e não
existia antes, importação em massa de fabricantes** — se alguém pedir isso, é funcionalidade
nova, não um retorno.

## 4. De onde recuperar

Tudo está no git. O último commit que **contém** os arquivos é **`69ba4be0`**.

```bash
git show 69ba4be0:src/pages/Catalogo.tsx > src/pages/Catalogo.tsx
git checkout 69ba4be0 -- src/components/catalogo/
git show 69ba4be0:src/hooks/use-fabricantes.ts > src/hooks/use-fabricantes.ts
git show 69ba4be0:src/pages/Fabricantes.tsx > src/pages/Fabricantes.tsx
```

Para ver tudo que a remoção tocou, de uma vez:

```bash
git log --oneline --all -S 'tabela_precos' -- src/
```

O que foi removido, por arquivo:

| arquivo | o que era |
|---|---|
| `src/pages/Catalogo.tsx` | 468 linhas, a tela global do catálogo — **já órfã** |
| `src/components/catalogo/ProductForm.tsx` | formulário de produto |
| `src/components/catalogo/ProductImageUpload.tsx` | imagem do produto |
| `src/components/catalogo/ImportCatalogoDialog.tsx` | importador por fabricante |
| `src/components/catalogo/GlobalImportCatalogoDialog.tsx` | importador global |
| `src/hooks/use-fabricantes.ts` | 10 ganchos (`useTabelaPrecos`, `useCreatePreco`, `useCategorias`…) |
| `src/hooks/use-novo-pedido.ts` | uma **segunda** cópia de `useTabelaPrecos` |
| `src/pages/Fabricantes.tsx` | o cartão "Catálogo de Produtos" e tudo em volta |
| `src/pages/LinhasIgnoradas.tsx` | `retryCatalogo` e o tipo `catalogo_geral` |
| `src/components/pedidos/NovoNegocioDialog.tsx` | passo 2, itens, `ItemDescricaoField` |
| `src/pages/EditarPedido.tsx` | o mesmo, do lado da edição |
| `src/integrations/supabase/types.ts` | a entrada `tabela_precos` |

No banco, pela migration `20260826180000_limpeza_catalogo_produtos.sql`:
`tabela_precos` apagada, e as linhas de `configuracoes_campos` da etapa "Itens do Negócio"
removidas ou renomeadas.

## 5. 🔴 O que ficou para trás, de propósito

### `itens_pedido` continua existindo, com 1 linha

A tabela **não foi apagada**. Ela guarda o registro de um negócio real, e destruí-lo apagaria a
única prova de que aquele item existiu. Ela apenas deixou de receber linha nova: nem a criação
nem a edição de negócio escrevem mais nela.

Para achar o negócio em questão:

```sql
select p.id, p.nome, c.empresa as cliente, i.descricao_material, i.quantidade, i.preco_unitario
from itens_pedido i join pedidos p on p.id = i.pedido_id join clientes c on c.id = p.cliente_id;
```

### ⚠️ O gatilho `trg_recalcular_valor_total` continua armado

Existe em `itens_pedido` um gatilho `AFTER INSERT OR DELETE OR UPDATE` que reescreve
`pedidos.valor_total` com a **soma dos itens daquele negócio**.

Enquanto ninguém escrever em `itens_pedido`, ele nunca dispara. **Mas ele não foi removido**, e
quem voltar a escrever ali reata uma armadilha que o código antigo driblava com cuidado:

- gravar o valor **antes** de mexer nos itens fazia o gatilho apagá-lo em seguida;
- apagar todos os itens de um negócio zerava o `valor_total` dele.

O código antigo lidava com isso gravando o valor **por último**, num `update` separado. Esse
malabarismo saiu junto com os itens (ver `src/hooks/use-edit-pedido.ts`), e o valor voltou a ser
gravado junto com o resto — o que só é seguro **porque nada escreve mais em `itens_pedido`**.

🔴 **Quem for ressuscitar o módulo precisa restaurar essa ordem, ou remover o gatilho e passar a
calcular o valor no código.** Ignorar isso zera o valor de negócio em produção, em silêncio.

### O balde `catalogo-produtos`

Tem 0 arquivos e sai **pelo painel do Supabase**, à mão. O Supabase recusa apagar balde por SQL
(`42501: Direct deletion from storage tables is not allowed`) — é proteção contra objeto órfão.

## 6. O que ocupou o lugar

A ficha do fabricante mostra hoje um aviso de que os catálogos chegam ali. Ele **não é enfeite**:
sem ele, o gestor abre uma fábrica, encontra um espaço vazio onde antes havia conteúdo, e a
primeira leitura é "quebrou" — não "ainda não chegou".

O drive de catálogos entra nesse lugar. Ver o desenho citado na §2.
