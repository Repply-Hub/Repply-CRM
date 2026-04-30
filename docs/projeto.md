# Documentação do Projeto

Este documento fornece uma visão geral técnica e funcional do projeto, descrevendo suas principais funcionalidades, arquitetura e tecnologias utilizadas.

## 🚀 Visão Geral

O projeto é uma plataforma de gestão empresarial (CRM/ERP) focada no setor de construção e vendas, integrando funcionalidades de pipeline de vendas, gestão de clientes, controle de obras, catálogo de fabricantes e automações de e-mail.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React + TypeScript + Vite
- **Estilização:** Tailwind CSS + Shadcn UI
- **Gerenciamento de Estado & Dados:** TanStack Query (React Query)
- **Roteamento:** React Router DOM
- **Backend/Infra:** Supabase (Auth, Database, Edge Functions)
- **Mapas:** Google Maps API & Leaflet
- **Gráficos:** Recharts
- **Utilitários:** Date-fns, Zod, React Hook Form, Lucide React

## 📂 Estrutura de Pastas

- `src/components`: Componentes reutilizáveis da interface.
- `src/hooks`: Hooks customizados para lógica de negócios e integração com Supabase.
- `src/pages`: Telas principais da aplicação.
- `src/integrations`: Configurações de integração (Supabase, etc.).
- `supabase/functions`: Edge Functions para automações e integrações externas.

## 📋 Funcionalidades Principais

### 1. Gestão de Negócios (CRM)
- Visualização em Pipeline (Kanban) para acompanhar o progresso das vendas.
- Gestão de pedidos e orçamentos.

### 2. Clientes e Contatos
- Cadastro detalhado de clientes e seus respectivos contatos.
- Histórico de interações e detalhamento por slug.

### 3. Gestão de Obras
- Mapa interativo para visualização de obras.
- Filtros por endereço e localização.

### 4. Portal e Automações
- Scraping de dados e processamento de PDFs (via Edge Functions).
- Integração com e-mail (Resend) para envio e recebimento.

### 5. Dashboard e Relatórios
- Indicadores de faturamento mensal.
- Gráficos de conversão por vendedor/responsável.
- Filtros temporais e por colaborador.

### 6. Ferramentas de Produtividade
- Calendário de atividades.
- Gestão de tarefas.
- Chat interno para comunicação.

## ⚙️ Configuração e Instalação

1.  **Dependências:** `npm install`
2.  **Ambiente:** Configure as variáveis do Supabase no arquivo `.env`.
3.  **Execução:** `npm run dev`
4.  **Testes:** `npm run test`

---
*Este documento foi gerado automaticamente para explicar a estrutura e o propósito do projeto.*
