# Documentação da Integração de E-mail

O sistema utiliza a API do **Resend** para envio e recebimento de e-mails, integrada via **Supabase Edge Functions**.

## 1. Arquitetura da Integração

- **Provedor de E-mail:** [Resend](https://resend.com/)
- **Backend (Envio):** Edge Function `send-email`
- **Backend (Recebimento):** Edge Function `resend-inbound-webhook`
- **Frontend:** Página de E-mails (`src/pages/Emails.tsx`)
- **Armazenamento de Dados:** 
  - Tabela `emails`: Histórico de mensagens enviadas.
  - Tabela `emails_recebidos`: Mensagens recebidas via Inbound.
  - Tabela `user_integrations`: API Key e remetente por usuário.
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
- **Envio:** `invoke("send-email")`
- **Recebimento:** Webhook público em `/functions/v1/resend-inbound-webhook` (processa apenas eventos `email.received`).
- **Segurança:** 
  - O envio exige autenticação do usuário.
  - O recebimento é protegido por lógica de evento específica e RLS para visualização.

