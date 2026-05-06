# Documentação da Integração de E-mail

O sistema utiliza a API do **Gmail** para envio e recebimento de e-mails, integrada via **Supabase Edge Functions**.

## 1. Arquitetura da Integração

- **Provedor de E-mail:** [Google Gmail API](https://developers.google.com/gmail/api)
- **Backend (Envio):** Edge Function `gmail-send`
- **Backend (Sincronização):** Edge Function `gmail-sync-inbox` (executada via pg_cron a cada 2 minutos)
- **Frontend:** Página de E-mails (`src/pages/Emails.tsx`)
- **Armazenamento de Dados:** 
  - Tabela `emails`: Histórico de mensagens enviadas.
  - Tabela `emails_recebidos`: Mensagens recebidas e sincronizadas da Inbox.
  - Tabela `gmail_tokens`: Tokens OAuth (Access e Refresh) por usuário.
  - Tabela `usuarios`: Assinatura personalizada.

## 2. Configurações Necessárias

### Conexão Gmail
Cada usuário conecta sua conta Google em **Configurações > Perfil**:
- **OAuth 2.0:** Fluxo seguro de autorização.
- **Tokens:** Armazenados de forma segura e renovados automaticamente.

### Sincronização
A sincronização ocorre em segundo plano:
1. Uma função cron (`pg_cron`) chama a Edge Function `gmail-sync-inbox` a cada 2 minutos.
2. A função busca as últimas 20 mensagens da Inbox de cada usuário conectado.
3. Mensagens novas são salvas na tabela `emails_recebidos`.

## 3. Funcionalidades de Envio
O envio é feito através da interface de e-mail do sistema, permitindo anexar assinaturas personalizadas e logotipos da MD Representações.

## 4. Endpoints e Segurança
- **Envio:** `invoke("gmail-send")`
- **Sincronização:** Edge Function `gmail-sync-inbox` processa as mensagens da Inbox.
- **Segurança:** 
  - O envio exige autenticação do usuário.
  - RLS (Row Level Security) garante que cada usuário veja apenas seus próprios e-mails.
