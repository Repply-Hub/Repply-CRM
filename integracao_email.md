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

### Envio
Cada usuário configura sua integração em **E-mails > Configurações**:
- **Resend API Key:** Chave pessoal (começa com `re_`).
- **E-mail do Remetente:** Domínio verificado no Resend.

### Recebimento (Inbound)
Para receber e-mails no sistema:
1. No painel do Resend, vá em **Receiving** e obtenha seu endereço `.resend.app` ou configure um domínio próprio.
2. Em **Webhooks**, adicione um novo webhook:
   - **URL:** `https://cvbgrjauqjawrsyknhyj.supabase.co/functions/v1/resend-inbound-webhook`
   - **Eventos:** Selecione `email.received`.
3. Todo e-mail enviado para seu endereço cadastrado será salvo automaticamente na tabela `emails_recebidos`.

## 3. Funcionalidades de Envio
... keep existing code
## 5. Endpoints e Segurança
- **Envio:** `invoke("gmail-send")`
- **Sincronização:** Edge Function `gmail-sync-inbox` processa as mensagens da Inbox.
- **Segurança:** 
  - O envio exige autenticação do usuário.
  - O recebimento é protegido por lógica de evento específica e RLS para visualização.

