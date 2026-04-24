Plano para corrigir a importação de Empresas/Contatos

O problema mais provável é que o preview mostra o objeto mapeado/sanitizado, mas ao confirmar a importação o app reconstrói o payload novamente e grava apenas um conjunto fixo de campos. Além disso, colunas criadas em “Opções > Nova Coluna” aparecem na lista como `custom_...`, enquanto a importação salva extras com o nome visível em `campos_extras`; isso pode fazer a coluna parecer vazia ou “trocada” depois de importar.

## O que será ajustado

1. Usar exatamente o mesmo payload do preview na confirmação
   - Ao clicar em “Pré-visualizar”, salvar os registros finais sanitizados em estado local.
   - Ao clicar em “Importar”, usar esse mesmo snapshot, em vez de chamar `getMappedRows()` novamente.
   - Isso garante que o que aparece no preview seja o que é enviado ao banco.

2. Corrigir o vínculo das colunas extras
   - Padronizar as chaves salvas em `campos_extras` para baterem com as colunas customizadas da lista.
   - Exemplo: se a coluna da tabela é `custom_criado_por_...`, o valor importado precisa ser salvo com essa chave ou a tabela precisa saber resolver pelo rótulo correspondente.
   - Ajustar a renderização da página `/clientes` para procurar o valor extra por:
     - id da coluna customizada;
     - rótulo da coluna;
     - rótulo renomeado pelo usuário;
     - fallback por normalização do nome.

3. Exibir no preview a correspondência real com a lista final
   - No preview, mostrar as colunas extras com o nome que será encontrado depois na tabela.
   - Evitar situação em que o preview mostra “Criado por”, mas a lista busca `custom_criado_por_123` e exibe vazio.

4. Reduzir transformação duplicada na confirmação
   - Manter a sanitização em `MappingStep.tsx` como fonte única.
   - `ImportClientesDialog.tsx` ficará responsável apenas por validar, deduplicar e gravar os registros já montados.

5. Testar o fluxo completo
   - Importar uma planilha de Empresas com campos padrão e extras.
   - Conferir que o preview e a tabela após importação exibem os mesmos valores nas mesmas colunas.
   - Verificar também Contatos para não quebrar o fluxo existente.

## Arquivos envolvidos

- `src/components/ImportClientesDialog.tsx`
- `src/components/import/MappingStep.tsx`, se precisar ajustar retorno/nomes dos extras
- `src/pages/Clientes.tsx`, para resolver corretamente valores de `campos_extras` nas colunas customizadas
- Possivelmente `src/hooks/use-table-settings.ts`, caso seja melhor centralizar a normalização de IDs de colunas extras

## Resultado esperado

Depois da correção, a importação terá este comportamento:

```text
Mapeamento escolhido pelo usuário
        ↓
Sanitização única dos dados
        ↓
Preview mostra o payload final
        ↓
Confirmar grava exatamente o mesmo payload
        ↓
Lista de clientes lê campos padrão e extras com as mesmas chaves
```

Assim, se a coluna estiver correta no preview, ela também chegará correta na tabela após confirmar a importação.