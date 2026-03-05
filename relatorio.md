# Relatório do Projeto — MD Representações (CRM)

---

## 1. Descrição Detalhada das Funcionalidades Existentes

### 1.1 Autenticação e Controle de Acesso

- **Descrição:** Sistema de login com e-mail e senha via Lovable Cloud. Dois perfis: **Vendedor** e **Gestor**.
- **Acesso:** Rota `/login`. Todas as demais rotas são protegidas e redirecionam para login se não autenticado.
- **Detalhes:**
  - Gestores têm acesso total (CRUD em todas as entidades).
  - Vendedores visualizam apenas seus próprios clientes e pedidos.
  - Funções de banco `get_my_vendedor_id()` e `is_gestor()` controlam o acesso via RLS.
- **Limitações:** Não há recuperação de senha implementada na UI. Não há cadastro público (signup).

---

### 1.2 Pipeline de Vendas (Kanban)

- **Descrição:** Visualização de pedidos em formato Kanban com 5 etapas:
  1. Novo Lead
  2. Elaboração de Orçamento
  3. Orçamento Enviado
  4. Negociação
  5. Fechamento
- **Acesso:** Página inicial (`/`).
- **Funcionalidades:**
  - Drag-and-drop entre colunas para atualizar o status do pedido.
  - Exibição de valor total do pipeline e contagem de pedidos.
  - Cards com nome do cliente, obra, fabricante, valor e dias no estágio.
  - Alertas visuais para cards parados por muitos dias.
- **Limitações:** Não há filtros por vendedor ou fabricante diretamente no Kanban.

---

### 1.3 Gestão de Clientes

- **Descrição:** Cadastro e gerenciamento de clientes com distinção por tipo: Construtora, Loja ou Pessoa Física.
- **Acesso:** Rota `/clientes` (listagem) e `/clientes/:id` (detalhe).
- **Funcionalidades:**
  - Listagem com filtros por categoria (tipo de cliente).
  - Campos: Nome Fantasia (empresa), Razão Social, CNPJ/CPF, e-mail, telefone, endereço.
  - Validação de CNPJ via BrasilAPI com preenchimento automático de Razão Social.
  - Validação de CEP via ViaCEP com preenchimento automático de endereço.
  - Perfil do cliente com Razão Social como título principal.
  - Campos vazios exibem "Não informado".
  - Card de endereço minimizável.
  - Botão de exclusão ao final da página (somente gestores).
- **Limitações:** Não há importação em massa de clientes. Sem histórico de alterações.

---

### 1.4 Gestão de Obras

- **Descrição:** Cadastro de obras vinculadas a clientes (especialmente construtoras).
- **Acesso:** Dentro do perfil do cliente (`/clientes/:id`).
- **Funcionalidades:**
  - Campos: nome da obra, endereço de entrega, CNPJ da SPE, status.
  - Status possíveis: em andamento, concluída, parada.
- **Limitações:** Não há página dedicada para listagem geral de obras.

---

### 1.5 Gestão de Pedidos

- **Descrição:** Criação e acompanhamento de pedidos/orçamentos comerciais.
- **Acesso:** Rota `/pedidos` (listagem) e `/pedidos/novo` (criação).
- **Funcionalidades:**
  - **Criação em duas etapas:**
    1. **Metadados:** Cliente, fabricante, vendedor, obra (condicional para construtoras), origem do lead, prazo de resposta, endereço de entrega, observações.
    2. **Itens:** Tabela com autocomplete da tabela de preços do fabricante, quantidade, preço unitário, cálculo automático de totais.
  - Agendamento de próximo contato (registrado automaticamente no histórico).
  - Listagem com filtros por etapa do pipeline.
  - Atualização de status via drag-and-drop no Kanban.
- **Limitações:**
  - Não há edição de pedidos já criados.
  - Não há funcionalidade de duplicar pedido.
  - Sem geração de PDF do orçamento.

---

### 1.6 Histórico de Contatos

- **Descrição:** Registro de interações com o cliente vinculadas a um pedido.
- **Acesso:** Dentro do detalhe do pedido.
- **Funcionalidades:**
  - Tipos: e-mail, telefone, WhatsApp, visita, automático.
  - Possibilidade de agendar próximo contato.
- **Limitações:** Não há lembretes/notificações automáticas para contatos agendados.

---

### 1.7 Dashboard Analítico

- **Descrição:** Painel com KPIs e gráficos de desempenho comercial.
- **Acesso:** Rota `/dashboard`.
- **Funcionalidades:**
  - **KPIs:** Faturamento do mês, taxa de conversão, ticket médio, pedidos fechados no mês.
  - **Gráficos:**
    - Faturamento mensal (barras).
    - Segmentação por ticket: alto (>100k), médio (30-100k), baixo (<30k) (pizza).
    - Conversão por vendedor (barras horizontais).
    - Velocidade de resposta por fabricante (linha).
- **Limitações:** Não há filtros por período. Os dados vêm de views SQL sem filtro de data dinâmico.

---

### 1.8 Fabricantes e Tabela de Preços

- **Descrição:** Cadastro de fabricantes e suas tabelas de preços vigentes.
- **Acesso:** Utilizado na criação de pedidos (autocomplete de itens).
- **Funcionalidades:**
  - Campos do fabricante: nome, CNPJ, contato, telefone, última atualização de preço.
  - Tabela de preços: descrição do material, referência, preço unitário, unidade, flag de vigente.
- **Limitações:** Não há página dedicada para gerenciar fabricantes/tabelas de preço na UI. Gestão é feita diretamente no backend.

---

### 1.9 Configurações

- **Descrição:** Página de configurações do sistema.
- **Acesso:** Rota `/configuracoes`.
- **Funcionalidades:** Tema claro/escuro.
- **Limitações:** Funcionalidades limitadas; não há gestão de usuários ou preferências avançadas.

---

### 1.10 Sidebar com Navegação

- **Descrição:** Menu lateral colapsável com navegação entre as seções do CRM.
- **Acesso:** Presente em todas as páginas autenticadas.
- **Funcionalidades:**
  - Expande ao passar o mouse, colapsa ao sair.
  - Logo da empresa no topo.
  - Links: Pipeline, Pedidos, Clientes, Dashboard, Configurações.
- **Limitações:** Não há indicador de notificações ou badges.

---

### 1.11 Logs de Automação

- **Descrição:** Tabela para registro de eventos automáticos do sistema.
- **Acesso:** Somente gestores (via RLS). Sem página dedicada na UI.
- **Funcionalidades:** Registra tipo, status, detalhes (JSON), cliente e pedido associados.
- **Limitações:** Sem visualização na interface. Apenas estrutura de dados.

---

## 2. Possíveis Melhorias e Novas Funcionalidades

### 2.1 Melhorias nas Funcionalidades Atuais

#### 2.1.1 Edição de Pedidos
- **Descrição:** Permitir editar metadados e itens de pedidos já criados.
- **Benefícios:** Reduz retrabalho; evita necessidade de excluir e recriar pedidos.
- **Desafios:** Controle de versionamento e auditoria de alterações.

#### 2.1.2 Filtros Avançados no Kanban
- **Descrição:** Adicionar filtros por vendedor, fabricante, faixa de valor e período.
- **Benefícios:** Facilita a gestão de pipelines grandes.
- **Desafios:** Manter performance com muitos filtros simultâneos.

#### 2.1.3 Filtros de Período no Dashboard
- **Descrição:** Permitir selecionar intervalo de datas para os KPIs e gráficos.
- **Benefícios:** Análises mais precisas e comparativas.
- **Desafios:** Requer refatoração das views SQL para aceitar parâmetros de data.

#### 2.1.4 Página de Gestão de Fabricantes
- **Descrição:** Criar CRUD completo para fabricantes e tabelas de preço na UI.
- **Benefícios:** Autonomia do gestor sem depender de acesso direto ao backend.
- **Desafios:** Upload de tabelas em massa (CSV/Excel).

#### 2.1.5 Recuperação de Senha
- **Descrição:** Implementar fluxo de "esqueci minha senha" com envio de e-mail.
- **Benefícios:** Melhor experiência do usuário.
- **Desafios:** Configuração de templates de e-mail.

---

### 2.2 Novas Funcionalidades Propostas

#### 2.2.1 Geração de PDF de Orçamento
- **Descrição:** Gerar documento PDF do orçamento com layout profissional, logo da empresa, itens e condições comerciais.
- **Benefícios:** Agiliza o envio de propostas ao cliente; padroniza a comunicação.
- **Desafios:** Definir template visual; lidar com itens longos e paginação.

#### 2.2.2 Notificações e Lembretes
- **Descrição:** Sistema de notificações para contatos agendados, pedidos parados e prazos vencidos.
- **Benefícios:** Evita perda de oportunidades; melhora o follow-up.
- **Desafios:** Pode requerer serviço de background (Edge Functions agendadas) ou integração com e-mail/WhatsApp.

#### 2.2.3 Integração com WhatsApp
- **Descrição:** Envio de mensagens e orçamentos via WhatsApp diretamente do CRM.
- **Benefícios:** Canal de comunicação preferido no Brasil; agilidade no contato.
- **Desafios:** Requer API do WhatsApp Business; custos associados.

#### 2.2.4 Relatórios Exportáveis
- **Descrição:** Exportação de dados (pedidos, clientes, faturamento) em CSV ou Excel.
- **Benefícios:** Permite análises externas e compartilhamento com diretoria.
- **Desafios:** Formatação adequada de dados e performance para grandes volumes.

#### 2.2.5 Gestão de Vendedores na UI
- **Descrição:** Página para o gestor cadastrar, editar, ativar/desativar vendedores e vincular ao usuário de autenticação.
- **Benefícios:** Autonomia total do gestor na administração da equipe.
- **Desafios:** Sincronização entre tabela de vendedores e usuários de autenticação.

#### 2.2.6 Duplicação de Pedidos
- **Descrição:** Permitir duplicar um pedido existente como base para novo orçamento.
- **Benefícios:** Economia de tempo em pedidos recorrentes ou similares.
- **Desafios:** Garantir que o novo pedido tenha status inicial e nova data.

#### 2.2.7 Mapa de Obras
- **Descrição:** Visualização geográfica das obras cadastradas em um mapa interativo.
- **Benefícios:** Planejamento logístico; visão territorial da carteira.
- **Desafios:** Geocodificação de endereços; integração com API de mapas.

#### 2.2.8 Painel de Atividades Recentes
- **Descrição:** Feed de atividades recentes (novos pedidos, mudanças de status, contatos realizados) na página inicial.
- **Benefícios:** Visão rápida do que está acontecendo na operação.
- **Desafios:** Pode impactar performance se não bem indexado.

#### 2.2.9 Meta de Vendas por Vendedor
- **Descrição:** Definir metas mensais de faturamento por vendedor com acompanhamento visual de progresso.
- **Benefícios:** Gamificação; motivação da equipe; gestão por resultados.
- **Desafios:** Definição de critérios de meta e período de apuração.

#### 2.2.10 Importação de Clientes via Planilha
- **Descrição:** Upload de arquivo CSV/Excel para cadastro em massa de clientes.
- **Benefícios:** Migração de dados de outros sistemas; cadastro rápido.
- **Desafios:** Validação de dados, tratamento de duplicatas, mapeamento de colunas.

---

## 3. Resumo Técnico

| Aspecto | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| Estado | TanStack React Query |
| Backend | Lovable Cloud (Supabase) |
| Banco de Dados | PostgreSQL com RLS |
| Autenticação | Lovable Cloud Auth |
| Gráficos | Recharts |
| Drag & Drop | @hello-pangea/dnd |
| Validações | Zod + React Hook Form |

---

*Relatório gerado em Março/2026 — MD Representações CRM*
