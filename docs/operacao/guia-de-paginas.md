# Guia de páginas — Repply CRM

Para que serve cada tela do sistema e como usá-la no dia a dia. Linguagem de negócio, sem termo técnico.

> Serve também de material de apoio ao colocar uma empresa nova para usar o sistema.

---

## 🏠 Pipeline de Vendas (Página Inicial)

É o seu **quadro de vendas**. Aqui você acompanha todos os pedidos organizados por etapa — desde o primeiro contato até o fechamento. Arraste os cards entre as colunas para atualizar o andamento de cada negociação. Use os filtros para encontrar pedidos por vendedor, fabricante ou cliente.

**Quando usar:** sempre que quiser ter uma visão geral de como estão suas negociações.

---

## 👥 Clientes

Cadastre e gerencie todas as empresas e contatos com quem você trabalha. Você pode buscar, filtrar por tipo (construtora, loja, pessoa física), importar uma planilha de clientes ou exportar a lista completa.

**Quando usar:** para cadastrar um novo cliente, consultar dados de contato ou verificar o histórico de um cliente.

---

## 📋 Negócios (Pedidos & Orçamentos)

Lista todos os seus pedidos e orçamentos em formato de tabela. Permite criar novos pedidos, editar existentes, importar de planilhas e aplicar filtros avançados por status, fabricante ou período.

**Quando usar:** para registrar um novo orçamento, acompanhar valores ou localizar um pedido específico.

---

## 🏗️ Obras

Registre as obras vinculadas aos seus clientes. Cada obra pode ter endereço de entrega, CNPJ da SPE e status (ativa, concluída ou parada).

**Quando usar:** para cadastrar uma nova obra, consultar o endereço de entrega ou verificar quais obras estão ativas.

---

## 🏭 Fabricantes

Gerencie os fabricantes que você representa. Cadastre dados de contato, CNPJ e acompanhe a data da última atualização de tabela de preços.

**Quando usar:** para adicionar um novo fabricante, atualizar informações ou consultar contatos.

---

## 🔍 Portal de Consultas

Ferramenta de **prospecção**. Consulte licenças de construção emitidas por órgãos governamentais (IDEMA, Natal, Extremoz) para identificar novas obras e potenciais clientes na sua região.

**Quando usar:** para encontrar novas oportunidades de negócio a partir de licenças públicas de construção.

---

## 📊 Dashboard

Painel com **indicadores de desempenho** do seu time comercial: faturamento mensal, taxa de conversão, ticket médio, velocidade de resposta dos fabricantes e rendimento por fábrica. Filtre por período para analisar tendências.

**Quando usar:** para avaliar resultados, preparar reuniões ou identificar pontos de melhoria nas vendas.

---

## 📅 Calendário

Sua **agenda visual**. Mostra prazos de pedidos, datas de follow-up e eventos personalizados. Você pode criar eventos, visualizar por mês, semana ou dia, e nunca perder um prazo importante.

**Quando usar:** para organizar sua rotina, agendar visitas ou acompanhar prazos de entrega.

---

## ✅ Tarefas

Gerencie as **atividades da equipe**. Crie tarefas com responsável, prazo, projeto e marcadores. Acompanhe o que está pendente, em andamento ou concluído.

**Quando usar:** para delegar atividades, acompanhar entregas ou organizar demandas internas.

---

## 💬 Chat

Canal de **comunicação interna** em tempo real entre os membros da equipe. Crie grupos por projeto ou tema e troque mensagens sem sair do sistema.

**Quando usar:** para alinhar com colegas, discutir negociações ou compartilhar informações rapidamente.

---

## ⚙️ Configurações

Área de **administração da equipe**. Gerencie funcionários, defina permissões por módulo (quem pode ver, criar, editar ou excluir) e controle os códigos de acesso para novos membros.

**Quando usar:** para adicionar ou remover funcionários, ajustar permissões ou gerar códigos de convite.

---

## 🔐 Login / Cadastro

Tela de acesso ao sistema. Faça login com e-mail e senha, ou cadastre-se usando um código de acesso fornecido pela sua empresa.

**Quando usar:** para entrar no sistema ou criar sua conta pela primeira vez.


---

## 📥 Linhas Ignoradas na Importação

Esta página permite que você revise e ajuste dados que não puderam ser importados automaticamente no sistema. Quando uma importação de planilha falha devido a erros de validação ou campos obrigatórios ausentes, as linhas problemáticas são armazenadas aqui para análise posterior.

### Funcionalidades Principais

#### 1. Resumo de Pendências
No topo da página, você encontrará um contador indicando quantas linhas pendentes de revisão existem. Isso ajuda a manter o controle sobre o que ainda precisa ser processado manualmente.

#### 2. Tabela de Registros
A tabela exibe as seguintes informações para cada linha ignorada:
- **Data**: O momento em que a tentativa de importação ocorreu.
- **Tipo**: A categoria dos dados (ex: Clientes, Produtos, etc.).
- **Motivo**: Uma descrição do porquê a linha não foi importada (ex: "Campo obrigatório ausente", "Formato inválido").
- **Resumo dos Dados**: Uma prévia dos dados originais que estavam na planilha.

#### 3. Ações Disponíveis
Para cada registro, você pode realizar as seguintes ações:
- **Ver Detalhes (Ícone de Olho)**: Abre um painel com todos os campos da linha original para que você possa copiar os dados necessários.
- **Remover (Ícone de Lixeira)**: Exclui permanentemente o registro da lista de ignorados.
- **Limpar Tudo**: Remove todos os registros de uma só vez (útil após processar as pendências).

### Como Resolver Problemas de Importação

Se uma linha aparecer nesta lista, siga estes passos:

1. **Analise o Motivo**: Verifique a coluna "Motivo" para entender o que deu errado.
2. **Visualize os Detalhes**: Clique no ícone de visualização para ver os dados completos da linha.
3. **Ação Manual**: Atualmente, a recomendação é copiar os dados exibidos nos detalhes e inseri-los manualmente através do botão "Novo" na página correspondente ao tipo de dado (ex: ir para a página de Clientes e adicionar o cliente manualmente).
4. **Limpeza**: Após adicionar os dados manualmente, remova a linha da lista para manter sua área de trabalho organizada.

---
*Nota: Certifique-se de que sua planilha segue o modelo padrão exigido pelo sistema para minimizar o número de linhas ignoradas em futuras importações.*

