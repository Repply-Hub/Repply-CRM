# Relatório Detalhado — MD Representações (CRM) v1.2

---

## 1. Introdução

O **MD Representações** é um CRM (Customer Relationship Management) especializado em **representação comercial de materiais de construção**. O sistema foi projetado para centralizar toda a operação de vendas — desde a captação de leads até o fechamento de pedidos — oferecendo uma visão completa do pipeline comercial, gestão de clientes, obras, fabricantes e equipe de vendas.

**Objetivo principal:** Digitalizar e agilizar o processo de gestão comercial de representações, eliminando planilhas e controles manuais, proporcionando visibilidade total sobre o funil de vendas e desempenho da equipe.

---

## 2. Funcionalidades Principais

### 2.1 Autenticação e Controle de Acesso

**Descrição:** Sistema de autenticação completo com login por e-mail e senha, suportando dois perfis de usuário: **Vendedor** e **Gestor**.

**Benefícios:**
- Segurança dos dados comerciais com acesso restrito por perfil.
- Vendedores visualizam apenas seus próprios clientes e pedidos, garantindo privacidade entre a equipe.
- Gestores têm visão total para supervisão e tomada de decisão.

**Fluxo de trabalho:**
1. O usuário acessa a rota `/login`.
2. Insere e-mail e senha (ou realiza cadastro na aba "Cadastrar").
3. Após autenticação, é redirecionado para a página inicial (Pipeline).
4. Todas as rotas são protegidas — usuários não autenticados são redirecionados ao login.

**Detalhes técnicos:**
- Funções de banco de dados `get_my_vendedor_id()` e `is_gestor()` controlam o acesso via RLS (Row Level Security).
- Sessão persistida no localStorage com auto-refresh de token.
- Cadastro requer confirmação de e-mail antes do primeiro acesso.

---

### 2.2 Pipeline de Vendas (Kanban)

**Descrição:** Visualização interativa de pedidos em formato Kanban com 5 etapas do funil de vendas:
1. **Novo Lead** — Primeiro contato recebido.
2. **Elaboração de Orçamento** — Preparando a proposta.
3. **Orçamento Enviado** — Proposta encaminhada ao cliente.
4. **Negociação** — Ajustes e contrapropostas.
5. **Fechamento** — Pedido confirmado.

**Benefícios:**
- Visão instantânea de todo o funil de vendas.
- Agilidade na atualização de status via drag-and-drop.
- Alertas visuais para pedidos parados há muitos dias, evitando perda de oportunidades.

**Exemplo de uso:** Um vendedor recebe um novo contato e cria o pedido (aparece em "Novo Lead"). Ao elaborar a proposta, arrasta o card para "Elaboração de Orçamento". Quando envia ao cliente, move para "Orçamento Enviado", e assim sucessivamente.

**Fluxo de trabalho:**
1. Acesse a página inicial (`/`).
2. Visualize os cards organizados por coluna/etapa.
3. Arraste um card entre colunas para atualizar o status.
4. Observe o valor total do pipeline e a contagem de pedidos no topo.

**Detalhes dos cards:**
- Nome do cliente, obra associada, fabricante, valor do pedido.
- Dias no estágio atual com alertas visuais (highlight quando excede o limite configurado).
- Nome do vendedor responsável.

---

### 2.3 Gestão de Clientes

**Descrição:** Módulo completo de cadastro e gerenciamento de clientes, com distinção por tipo: **Construtora**, **Loja** ou **Pessoa Física**.

**Benefícios:**
- Centralização de toda a base de clientes em um único lugar.
- Validações automáticas de CNPJ e CEP reduzem erros de cadastro.
- Preenchimento automático de dados acelera o processo de registro.

**Exemplo de uso:** Ao cadastrar uma construtora, o vendedor insere o CNPJ. O sistema consulta a BrasilAPI e preenche automaticamente a Razão Social. Ao inserir o CEP, o endereço completo é preenchido via ViaCEP.

**Fluxo de trabalho:**
1. Acesse `/clientes` para ver a listagem com filtros por tipo.
2. Clique em "Novo Cliente" para abrir o formulário de cadastro.
3. Preencha os campos obrigatórios (nome fantasia, tipo).
4. Opcionalmente insira CNPJ (validação automática) e CEP (preenchimento automático).
5. Salve o cliente.
6. Acesse `/clientes/:id` para ver o perfil detalhado, incluindo obras vinculadas.

**Campos disponíveis:**
- Nome Fantasia (empresa), Razão Social, CNPJ/CPF, E-mail, Telefone, Nome do Contato.
- Endereço completo (CEP, logradouro, cidade, estado).
- Obras vinculadas (para construtoras).

**Regras de exibição:**
- Razão Social como título principal no perfil.
- Campos não preenchidos exibem "Não informado".
- Card de endereço minimizável.
- Botão de exclusão visível apenas para gestores, posicionado ao final da página.

---

### 2.4 Gestão de Obras

**Descrição:** Cadastro de obras vinculadas a clientes, especialmente construtoras. Cada obra possui endereço de entrega, CNPJ da SPE e status.

**Benefícios:**
- Rastreabilidade de entregas por obra específica.
- Controle de status (em andamento, concluída, parada).
- Preenchimento automático do endereço de entrega ao selecionar uma obra no pedido.

**Exemplo de uso:** Uma construtora possui 3 obras simultâneas. Ao criar um pedido, o vendedor seleciona a obra específica, e o sistema preenche automaticamente o endereço de entrega e exibe o CNPJ da SPE para conferência.

**Fluxo de trabalho:**
1. Acesse o perfil do cliente (`/clientes/:id`).
2. Na seção de obras, cadastre uma nova obra com nome, endereço, CNPJ SPE e status.
3. As obras aparecem como opção na criação de pedidos para aquele cliente.

**Campos:**
- Nome da obra, endereço de entrega, CNPJ da SPE, status (em andamento / concluída / parada).

---

### 2.5 Gestão de Pedidos

**Descrição:** Módulo central de criação e acompanhamento de pedidos/orçamentos comerciais, com fluxo estruturado em duas etapas.

**Benefícios:**
- Processo padronizado de criação de orçamentos.
- Autocomplete de itens a partir da tabela de preços do fabricante.
- Cálculo automático de totais.
- Agendamento de próximo contato integrado ao histórico.

**Fluxo de trabalho (criação):**

**Etapa 1 — Metadados:**
1. Acesse `/pedidos/novo`.
2. Selecione o cliente (obrigatório).
3. Se o cliente for construtora, selecione a obra (o endereço de entrega é preenchido automaticamente).
4. Selecione o fabricante.
5. O vendedor responsável é pré-selecionado (editável apenas por gestores).
6. Preencha opcionalmente: origem do lead, prazo de resposta, endereço de entrega manual, observações.

**Etapa 2 — Itens:**
1. Adicione itens ao pedido usando autocomplete vinculado à tabela de preços do fabricante.
2. Insira quantidade e preço unitário (preenchido automaticamente pelo autocomplete).
3. O sistema calcula automaticamente o preço total de cada item e o valor total do pedido.
4. Opcionalmente, agende o próximo contato (registrado automaticamente no histórico).

**Fluxo de trabalho (listagem):**
1. Acesse `/pedidos` para ver todos os pedidos.
2. Filtre por etapa do pipeline.
3. Clique em um pedido para ver detalhes e histórico de contatos.

**Edição de pedidos:**
- Pedidos já criados podem ser editados em `/pedidos/:id/editar`, permitindo atualizar metadados e itens.

---

### 2.6 Dashboard Analítico

**Descrição:** Painel com KPIs e gráficos interativos para análise do desempenho comercial, com filtro por período.

**Benefícios:**
- Visão consolidada de métricas-chave para tomada de decisão.
- Comparação de desempenho entre vendedores e fabricantes.
- Filtro por período permite análises temporais precisas.

**KPIs exibidos:**
| Indicador | Descrição |
|---|---|
| **Faturamento Total** | Soma do faturamento no período, com variação percentual vs. mês anterior |
| **Taxa de Conversão** | Percentual de pedidos fechados sobre o total |
| **Ticket Médio** | Valor médio dos pedidos fechados |
| **Pedidos Fechados** | Quantidade de pedidos com status "fechamento" |

**Gráficos:**
1. **Faturamento Mensal** (barras) — Evolução mensal do faturamento.
2. **Segmentação por Ticket** (pizza) — Distribuição de pedidos por faixa de valor: Alto (>100k), Médio (30-100k), Baixo (<30k).
3. **Conversão por Vendedor** (barras horizontais) — Taxa de fechamento individual de cada vendedor.
4. **Velocidade de Resposta por Fábrica** (linha) — Tempo médio (em dias) até a elaboração do orçamento por fabricante.

**Fluxo de trabalho:**
1. Acesse `/dashboard`.
2. Use o DateRangePicker no canto superior para selecionar o período desejado.
3. Os KPIs e gráficos se atualizam automaticamente com os dados filtrados.

---

### 2.7 Gestão de Fabricantes

**Descrição:** Cadastro de fabricantes e suas tabelas de preços vigentes, utilizados como base para a criação de pedidos.

**Benefícios:**
- Base de preços centralizada e sempre atualizada.
- Autocomplete na criação de pedidos agiliza o processo.
- Controle de vigência da tabela de preços.

**Campos do fabricante:**
- Nome, CNPJ, nome do contato, telefone, data da última atualização de preço.

**Campos da tabela de preços:**
- Descrição do material, referência, preço unitário, unidade, flag de vigente.

**Acesso:** Rota `/fabricantes` para gestão na UI.

---

## 3. Funcionalidades Secundárias

### 3.1 Histórico de Contatos

**Descrição:** Registro cronológico de todas as interações com o cliente vinculadas a um pedido específico.

**Interação com funcionalidades principais:** Alimenta o pipeline com informações de follow-up. Permite rastrear o histórico de negociação e acompanhar prazos de retorno.

**Tipos de contato:** E-mail, Telefone, WhatsApp, Visita, Automático (gerado pelo sistema).

**Exemplo:** Ao criar um pedido com próximo contato agendado, o sistema registra automaticamente uma entrada do tipo "automático" no histórico com a data programada.

---

### 3.2 Sistema de Permissões Granulares

**Descrição:** Controle de acesso por módulo e ação (ver, criar, editar, excluir) para cada vendedor individualmente.

**Interação com funcionalidades principais:** Permite que gestores definam exatamente quais funcionalidades cada vendedor pode acessar, oferecendo controle fino sobre a operação.

**Módulos configuráveis:**
- Dashboard, Pipeline, Clientes, Obras, Pedidos, Fabricantes, Configurações.

**Exemplo:** Um gestor pode permitir que um vendedor júnior veja o dashboard mas não crie pedidos diretamente, ou que um vendedor sênior tenha acesso total exceto exclusão de clientes.

---

### 3.3 Gestão de Vendedores

**Descrição:** CRUD completo para cadastro, edição e exclusão de vendedores, com atribuição de perfil (vendedor ou gestor).

**Interação com funcionalidades principais:** Define quem pode operar no sistema e com qual nível de acesso. Vendedores cadastrados são vinculados a clientes e pedidos.

**Acesso:** Aba "Vendedores" dentro de `/configuracoes`.

**Campos:** Nome, e-mail, telefone, perfil (vendedor/gestor).

---

### 3.4 Temas (Claro/Escuro/Sistema)

**Descrição:** Personalização da aparência da interface com suporte a tema claro, escuro ou automático (segue preferência do sistema operacional).

**Interação com funcionalidades principais:** Aplica-se globalmente a todas as páginas e componentes.

**Acesso:** Aba "Aparência" dentro de `/configuracoes`.

---

### 3.5 Configuração de Alertas de Inatividade

**Descrição:** Definição do número de dias máximo que um pedido pode permanecer parado em uma etapa antes de disparar alerta visual.

**Interação com funcionalidades principais:** Alimenta os alertas visuais exibidos nos cards do Kanban, destacando pedidos que precisam de atenção.

**Acesso:** Aba "Automação" dentro de `/configuracoes`.

---

### 3.6 Sidebar com Navegação Contextual

**Descrição:** Menu lateral colapsável que expande ao passar o mouse e recolhe ao sair, com logo da empresa e links para todas as seções.

**Links disponíveis:** Pipeline, Pedidos, Clientes, Dashboard, Fabricantes, Obras, Configurações.

---

### 3.7 Logs de Automação

**Descrição:** Tabela de backend para registro de eventos automáticos do sistema (alertas, mudanças de status automáticas, etc.).

**Interação com funcionalidades principais:** Permite auditoria de ações automáticas. Registra tipo, status, detalhes (JSON), cliente e pedido associados.

**Nota:** Atualmente sem visualização dedicada na interface — apenas estrutura de dados acessível por gestores.

---

### 3.8 Validação de CNPJ e CEP

**Descrição:** Integração com APIs externas para validação e preenchimento automático de dados.

- **CNPJ:** Consulta a BrasilAPI para validar o CNPJ e preencher automaticamente a Razão Social.
- **CEP:** Consulta a ViaCEP para preencher automaticamente logradouro, bairro, cidade e estado.

**Interação com funcionalidades principais:** Utilizado nos formulários de clientes e obras, reduzindo erros e acelerando o cadastro.

---

## 4. Tecnologias Utilizadas

| Tecnologia | Papel no Projeto |
|---|---|
| **React 18** | Framework de UI — componentização e renderização reativa |
| **TypeScript** | Tipagem estática para maior segurança e manutenibilidade do código |
| **Vite** | Bundler e dev server — build rápido e HMR instantâneo |
| **Tailwind CSS** | Estilização utilitária com design system baseado em tokens semânticos |
| **shadcn/ui** | Biblioteca de componentes acessíveis (Dialog, Table, Tabs, Form, etc.) |
| **TanStack React Query** | Gerenciamento de estado assíncrono — cache, refetch, invalidação |
| **Lovable Cloud (Supabase)** | Backend completo: banco PostgreSQL, autenticação, RLS, Edge Functions |
| **Recharts** | Biblioteca de gráficos para o Dashboard (barras, pizza, linha) |
| **@hello-pangea/dnd** | Drag-and-drop para o Kanban do pipeline de vendas |
| **React Hook Form + Zod** | Formulários com validação declarativa e type-safe |
| **React Router DOM** | Roteamento SPA com rotas protegidas e redirecionamento |
| **date-fns** | Manipulação e formatação de datas |
| **jsPDF + jspdf-autotable** | Geração de documentos PDF (orçamentos) |
| **Lucide React** | Ícones consistentes e leves |
| **Sonner** | Notificações toast elegantes |
| **next-themes** | Gerenciamento de tema claro/escuro |

---

## 5. Desafios e Soluções

### 5.1 Controle de Acesso Granular (RLS)

**Desafio:** Garantir que vendedores acessem apenas seus próprios dados sem impactar a experiência de gestores.

**Solução:** Implementação de Row Level Security (RLS) no PostgreSQL com funções `get_my_vendedor_id()` e `is_gestor()` como security definers. Políticas RLS aplicadas em todas as tabelas principais garantem isolamento de dados por vendedor, enquanto gestores bypass essas restrições.

### 5.2 Pipeline Drag-and-Drop com Persistência

**Desafio:** Manter a experiência de drag-and-drop fluida enquanto persiste as mudanças no banco de dados.

**Solução:** Uso do `@hello-pangea/dnd` para interação no frontend, com mutation otimista via React Query — o card move visualmente de imediato enquanto a atualização de status é enviada ao backend em background.

### 5.3 Formulário de Pedido em Múltiplas Etapas

**Desafio:** Gerenciar um formulário complexo com dependências entre campos (ex.: obras só aparecem para construtoras, tabela de preços depende do fabricante selecionado).

**Solução:** Divisão em duas etapas com estado local. Queries condicionais (`enabled: !!clienteId`) garantem que dados dependentes são carregados apenas quando necessário. Autocomplete de itens vinculado à tabela de preços do fabricante selecionado.

### 5.4 Dashboard com Filtro de Período

**Desafio:** As views SQL do dashboard não aceitavam parâmetros de data, limitando a análise a dados estáticos.

**Solução:** Implementação de filtro client-side com `date-fns` usando `isWithinInterval` sobre os dados já carregados. O componente `DateRangePicker` permite seleção de intervalo personalizado, e os KPIs/gráficos recalculam automaticamente via `useMemo`.

### 5.5 Permissões por Módulo

**Desafio:** Criar um sistema de permissões flexível que não exigisse alteração de código a cada novo módulo.

**Solução:** Tabela `permissoes_vendedor` com colunas booleanas por ação (ver, criar, editar, excluir) e coluna de módulo. Função `has_permission()` no banco permite verificar permissões de forma genérica. Interface de gestão com checkboxes por módulo/ação.

---

## 6. Conclusão

### Pontos Principais

O MD Representações CRM é uma solução completa e funcional para gestão de representação comercial, cobrindo todo o ciclo de vendas:

- **Pipeline visual** com drag-and-drop para acompanhamento ágil do funil.
- **Gestão integrada** de clientes, obras, fabricantes e pedidos com validações automáticas.
- **Dashboard analítico** com KPIs e gráficos filtráveis por período.
- **Controle de acesso** robusto com RLS e permissões granulares por módulo.
- **Gestão de equipe** com CRUD de vendedores e atribuição de perfis.

### Possíveis Melhorias Futuras

1. **Geração de PDF de Orçamento** — Documento profissional com logo, itens e condições comerciais para envio direto ao cliente.
2. **Notificações e Lembretes** — Alertas automáticos para contatos agendados, pedidos parados e prazos vencidos (via Edge Functions ou integração com e-mail).
3. **Integração com WhatsApp** — Envio de mensagens e orçamentos diretamente do CRM via WhatsApp Business API.
4. **Relatórios Exportáveis** — Exportação de dados em CSV/Excel para análises externas.
5. **Importação de Clientes via Planilha** — Upload de CSV/Excel para cadastro em massa.
6. **Duplicação de Pedidos** — Replicar pedidos existentes como base para novos orçamentos.
7. **Mapa de Obras** — Visualização geográfica das obras com geocodificação.
8. **Meta de Vendas** — Definição e acompanhamento de metas mensais por vendedor.
9. **Painel de Atividades Recentes** — Feed em tempo real com eventos do sistema.
10. **Recuperação de Senha** — Fluxo completo de "esqueci minha senha" com envio de e-mail.

---

*Relatório v1.2 — Março/2026 — MD Representações CRM*
