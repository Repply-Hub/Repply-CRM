## Problema identificado
O preview da importação está correto, e os logs confirmam que o payload enviado ao backend também está correto. O problema acontece depois, em dois pontos do fluxo:

1. A importação de empresas usa `upsert(..., { onConflict: 'cnpj' })`.
   - Quando já existe um registro com o mesmo CNPJ, a linha nova atualiza o registro anterior.
   - Se a mesma empresa aparece mais de uma vez no arquivo, ou já existe no banco, campos nativos como `empresa`, `telefone`, `email`, `endereco`, `classificacao` e `data_criacao` podem ser substituídos por outra combinação de valores.
   - Isso explica a sensação de que “o preview estava certo, mas depois ficou inconsistente”.

2. A listagem em `/clientes` tenta descobrir valores usando aliases de coluna e rótulos renomeados.
   - Isso funciona para exibição flexível, mas mistura duas responsabilidades: campo nativo do schema vs campo extra importado.
   - Se a coluna visível na lista foi renomeada para algo como “Telefone de Trabalho”, “Segmento de atuação” ou “Criado por”, a tela pode procurar no lugar errado e mostrar `—`, mesmo com o dado salvo.

Os logs de rede reforçam isso:
- O `POST /rest/v1/clientes` contém dados corretos no corpo da requisição.
- Exemplo real enviado: `empresa`, `telefone`, `data_criacao` e `campos_extras: { "Criado por": ... }` estavam corretos.
- Portanto, a inconsistência não está no preview nem no mapeamento inicial; ela está na persistência via `upsert` e na resolução das colunas na listagem.

## O que vou implementar
1. Separar explicitamente o que é campo nativo do schema e o que é campo extra.
   - Campos do schema sempre serão lidos e exibidos pelo `id` real do banco (`empresa`, `tipo`, `cnpj`, `email`, `telefone`, `classificacao`, `data_criacao`, `endereco`).
   - Campos extras continuarão em `campos_extras`, sem competir com os campos nativos.

2. Corrigir a confirmação da importação para não “embaralhar” dados em updates por CNPJ.
   - Revisar a estratégia atual de `upsert` por `cnpj`.
   - Aplicar merge previsível antes do envio final, preservando os dados mais completos por campo.
   - Garantir que o mesmo conjunto exibido no preview seja exatamente o conjunto persistido para cada CNPJ.

3. Ajustar a listagem de clientes para não depender de aliases ambíguos na leitura dos campos nativos.
   - Renomear colunas na UI não deve alterar a origem do dado.
   - Exemplo: a coluna exibida como “Telefone de Trabalho” deve continuar lendo `cliente.telefone`, e não tentar buscar em `campos_extras` ou em aliases frouxos.

4. Tratar corretamente o campo “Criado por”.
   - Se ele não faz parte do schema nativo, continuará sendo salvo em `campos_extras['Criado por']`.
   - A lista passará a exibi-lo de forma consistente quando essa coluna estiver habilitada.

5. Adicionar logs temporários de diagnóstico no fluxo de confirmação.
   - Vou registrar o snapshot do preview, o batch final montado para persistência e o resultado retornado após a operação.
   - Isso ajuda a validar que preview, payload final e leitura da lista ficaram sincronizados.

## Arquivos a ajustar
- `src/components/ImportClientesDialog.tsx`
  - endurecer a montagem final do batch
  - revisar merge por CNPJ
  - alinhar preview e persistência 1:1
  - incluir logs temporários de conferência

- `src/pages/Clientes.tsx`
  - separar leitura de campos nativos e extras
  - remover dependência ambígua de aliases para colunas nativas
  - garantir exibição correta de “Criado por” e demais extras

- `src/hooks/use-clientes.ts`
  - revisar se a consulta precisa de algum ajuste para facilitar a leitura consistente dos campos

## Detalhes técnicos
- O request observado já envia payload correto ao backend, por exemplo:
  - `empresa: "Engecomp Soluções LTDA"`
  - `telefone: "5584999020764"`
  - `data_criacao: "2026-04-08"`
  - `campos_extras: { "Criado por": "Érika Marques" }`
- Isso indica que o sanitizador e o preview estão funcionando.
- O ponto crítico é o `upsert` com `onConflict: 'cnpj'`, porque ele pode atualizar registros existentes e produzir resultado final diferente do que o usuário acabou de revisar.
- Também há fragilidade na função que resolve o valor da coluna na tabela, porque hoje ela tenta inferir a origem do dado a partir de aliases e rótulos renomeados.

## Resultado esperado após a correção
- O usuário verá no preview exatamente o mesmo conteúdo que será persistido.
- Campos nativos como Empresa, Tipo, CNPJ, Email, Telefone, Classificação, Criado e Endereço aparecerão corretamente após confirmar.
- “Criado por” deixará de ser ignorado e aparecerá de forma consistente como campo extra.
- Renomear títulos de coluna na lista não afetará mais a origem real do dado.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>
<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>