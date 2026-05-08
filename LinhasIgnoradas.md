# Linhas Ignoradas na Importação

Esta página permite que você revise e ajuste dados que não puderam ser importados automaticamente no sistema. Quando uma importação de planilha falha devido a erros de validação ou campos obrigatórios ausentes, as linhas problemáticas são armazenadas aqui para análise posterior.

## Funcionalidades Principais

### 1. Resumo de Pendências
No topo da página, você encontrará um contador indicando quantas linhas pendentes de revisão existem. Isso ajuda a manter o controle sobre o que ainda precisa ser processado manualmente.

### 2. Tabela de Registros
A tabela exibe as seguintes informações para cada linha ignorada:
- **Data**: O momento em que a tentativa de importação ocorreu.
- **Tipo**: A categoria dos dados (ex: Clientes, Produtos, etc.).
- **Motivo**: Uma descrição do porquê a linha não foi importada (ex: "Campo obrigatório ausente", "Formato inválido").
- **Resumo dos Dados**: Uma prévia dos dados originais que estavam na planilha.

### 3. Ações Disponíveis
Para cada registro, você pode realizar as seguintes ações:
- **Ver Detalhes (Ícone de Olho)**: Abre um painel com todos os campos da linha original para que você possa copiar os dados necessários.
- **Remover (Ícone de Lixeira)**: Exclui permanentemente o registro da lista de ignorados.
- **Limpar Tudo**: Remove todos os registros de uma só vez (útil após processar as pendências).

## Como Resolver Problemas de Importação

Se uma linha aparecer nesta lista, siga estes passos:

1. **Analise o Motivo**: Verifique a coluna "Motivo" para entender o que deu errado.
2. **Visualize os Detalhes**: Clique no ícone de visualização para ver os dados completos da linha.
3. **Ação Manual**: Atualmente, a recomendação é copiar os dados exibidos nos detalhes e inseri-los manualmente através do botão "Novo" na página correspondente ao tipo de dado (ex: ir para a página de Clientes e adicionar o cliente manualmente).
4. **Limpeza**: Após adicionar os dados manualmente, remova a linha da lista para manter sua área de trabalho organizada.

---
*Nota: Certifique-se de que sua planilha segue o modelo padrão exigido pelo sistema para minimizar o número de linhas ignoradas em futuras importações.*
