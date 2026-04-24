# Resumo das Importações do Projeto

Este documento resume as tecnologias, fluxos e componentes utilizados para a funcionalidade de importação de dados (Clientes, Contatos, Catálogo e Pedidos) via planilhas no sistema.

## 🛠️ Tecnologias e Bibliotecas Utilizadas

- **[SheetJS (xlsx)](https://sheetjs.com/)**: Biblioteca principal para leitura de arquivos `.xlsx`, `.xls` e `.csv` diretamente no navegador.
- **Supabase**: Utilizado para persistência dos dados e execução de funções remotas (RPC).
- **TanStack Query (React Query)**: Gerencia o estado e a invalidação do cache após as importações.
- **Lucide React**: Biblioteca de ícones para a interface.
- **Sonner**: Sistema de notificações (toasts) para feedback ao usuário.

## 📂 Estrutura de Arquivos Relacionados

- `src/components/ImportClientesDialog.tsx`: Componente principal para importação de clientes e contatos.
- `src/components/catalogo/ImportCatalogoDialog.tsx`: Diálogo para importação de itens do catálogo.
- `src/components/ImportPedidosDialog.tsx`: Diálogo para importação de pedidos.
- `src/components/import/MappingStep.tsx`: Componente compartilhado para mapeamento de colunas da planilha para campos do sistema.
- `src/components/import-pedidos/`: Utilitários e testes específicos para a lógica de importação de pedidos.
- `src/lib/file-validation.ts`: Validações de formato e tamanho de arquivo.

## 🚀 Fluxo de Importação

1.  **Seleção do Arquivo**: O usuário faz upload ou arrasta um arquivo (`.xlsx`, `.xls` ou `.csv`).
2.  **Processamento Inicial**: O arquivo é lido como `ArrayBuffer` e convertido em JSON via `XLSX.utils.sheet_to_json`.
3.  **Mapeamento de Colunas**:
    -   **Detecção Automática**: O sistema tenta adivinhar quais colunas da planilha correspondem aos campos do sistema usando expressões regulares (RegEx).
    -   **Ajuste Manual**: O usuário pode corrigir o mapeamento ou adicionar "campos extras" que serão armazenados em uma coluna do tipo JSONB (`campos_extras`).
4.  **Preview**: Exibição dos dados mapeados antes da execução final.
5.  **Execução (Batch Process)**:
    -   Os dados são enviados em lotes (ex: 500 registros por vez) para o Supabase para garantir performance.
    -   Utiliza-se `upsert` (no caso de empresas com CNPJ) para evitar duplicidade ou `insert` simples.
6.  **Finalização**: Notificação de sucesso e atualização das listas no sistema.

## 🔍 Regras de Negócio e Tratamentos

-   **Deduplicação**: No caso de empresas, o sistema verifica duplicatas de CNPJ no mesmo lote de importação.
-   **Normalização**: Textos são limpos (trim) e padronizados para evitar erros de comparação.
-   **Campos Extras**: Permite que colunas não previstas originalmente sejam salvas sem perda de informação.
-   **Permissões**: A importação respeita as regras de RLS do Supabase, garantindo que o usuário só importe dados vinculados ao seu perfil.
