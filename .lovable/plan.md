O objetivo é adicionar um campo de "valor de negociação" na criação de um novo negócio (pedido). Este valor deve ser automaticamente preenchido com a soma dos itens do pedido, mas permitir edição manual caso o usuário não queira cadastrar itens individuais.

### Alterações propostas

#### 1. Backend (Database & Hooks)
- O campo `valor_total` já existe na tabela `pedidos`.
- Atualizar o hook `useCreatePedidoCompleto` em `src/hooks/use-novo-pedido.ts` para receber e persistir esse valor enviado pelo frontend.

#### 2. Frontend (UI)
- Modificar `src/pages/NovoPedido.tsx`:
    - Adicionar um novo estado `valorNegociado` para controlar o valor manual.
    - Adicionar um estado `isValorManual` (boolean) para rastrear se o usuário editou o valor manualmente.
    - No Passo 2 (Itens do Pedido):
        - Substituir ou complementar a exibição do "Valor Total" calculado por um campo de entrada (Input) de "Valor de Negociação".
        - Implementar lógica: se `isValorManual` for falso, o campo reflete a soma dos itens. Se o usuário digitar no campo, `isValorManual` torna-se verdadeiro e o valor passa a ser o digitado.
        - Adicionar um botão de "reset" (ícone ou link) para voltar a usar o cálculo automático dos itens se desejado.
    - Atualizar a função `handleSubmit` para enviar o `valorNegociado` (ou a soma dos itens) para o backend.

### Considerações Técnicas
- O campo de valor manual será formatado como moeda para melhor experiência do usuário.
- Mesmo sem itens adicionados, o usuário poderá definir o valor do negócio diretamente nesse novo campo.
