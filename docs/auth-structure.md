# Estrutura de Autenticação e Hierarquia de Contas - MD Representações

Este documento descreve como funciona o fluxo de registro, os diferentes níveis de acesso e a relação entre usuários e empresas no sistema.

## 1. Fluxo de Registro de Usuários
O registro de novos usuários no sistema segue o seguinte fluxo:
1. **Cadastro via Interface**: O usuário acessa a tela de Login e preenche o formulário de cadastro com nome, e-mail e senha.
2. **Supabase Auth**: O sistema utiliza o `supabase.auth.signUp` para criar um registro na tabela de autenticação nativa do Supabase (`auth.users`).
3. **Criação de Perfil (Vendedor)**: Após a autenticação, é criada uma entrada na tabela pública `vendedores`. Esta tabela atua como o perfil do usuário na aplicação, armazenando seu nome, e-mail de contato e, crucialmente, seu papel (role).
4. **Papel Padrão**: Por padrão, novos usuários recebem o papel de `vendedor`, a menos que sejam promovidos manualmente através da interface por um **Gestor** ou via script de banco de dados.

## 2. Tipos de Conta (Roles)
O sistema foi concebido para suportar três níveis principais de hierarquia:

### 👤 Admin (Administrador Geral) - *Em Desenvolvimento*
*   **Status**: Este papel ainda não está disponível na interface atual (Configurações).
*   **Responsabilidade Planejada**: Gestão total do ecossistema MD Representações.
*   **Capacidades Futuras**:
    *   Visualizar e gerenciar todos os gestores e vendedores de todas as empresas.
    *   Acesso a auditorias globais de permissões.
    *   Configuração de módulos críticos do sistema.

### 💼 Gestor (Responsável pela Empresa)
*   **Responsabilidade**: Gestão de uma unidade de negócio ou representação específica.
*   **Capacidades**:
    *   Cadastrar e gerenciar novos vendedores em sua equipe.
    *   Definir permissões granulares (Ver, Criar, Editar, Excluir) por módulo para cada vendedor.
    *   Visualizar relatórios consolidados e dados de todos os vendedores sob sua gestão.
    *   Filtrar vendedores e dados por empresa associada.

### 🤝 Vendedor (Funcionário da Empresa)
*   **Responsabilidade**: Atendimento direto a clientes e gestão de pedidos.
*   **Capacidades**:
    *   Acesso limitado aos seus próprios clientes, obras e pedidos.
    *   As ações disponíveis dependem estritamente das permissões concedidas pelo Gestor através das configurações.

## 3. Relação com a Empresa
Atualmente, o vínculo de um vendedor com uma empresa específica é estabelecido de forma dinâmica e indireta:
*   **Vínculo via Clientes**: O sistema associa vendedores às empresas através dos registros de `clientes` que eles gerenciam. Cada cliente possui um campo `empresa` (texto).
*   **Filtragem**: Na tela de configurações, um Gestor pode utilizar o filtro de empresas para segmentar sua equipe de acordo com as empresas que eles atendem.
*   **Futuro**: O sistema permite a transição para uma tabela formal de `empresas` caso a necessidade de multi-tenancy (multi-inquilino) rígido aumente.

## 4. Controle de Permissões (RLS)
O controle de acesso é reforçado tanto no Frontend (UI) quanto no Backend (Banco de Dados):
*   **RLS (Row Level Security)**: O Supabase garante que as consultas retornem apenas os dados permitidos. Por exemplo, um vendedor só pode "Ver" (`SELECT`) pedidos onde seu `vendedor_id` esteja vinculado, a menos que as políticas globais permitam visão ampliada ao Gestor.
*   **Funções de Helper**:
    *   `is_gestor()`: Função SQL que valida rapidamente se o usuário logado possui privilégios administrativos.
    *   `get_my_vendedor_id()`: Retorna o ID de perfil vinculado ao usuário autenticado.

---
*Última atualização: 25 de Março de 2024*
