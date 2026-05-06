# Documentação da Funcionalidade de E-mail

Esta documentação detalha a implementação atual da funcionalidade de e-mail via Gmail API.

## 1. Infraestrutura de Backend

### Supabase Edge Function: `gmail-send`
Função responsável pelo envio de e-mails utilizando a conta Gmail conectada do usuário.
- **Endpoint**: `/functions/v1/gmail-send`
- **Segurança**: Exige autenticação e tokens válidos na tabela `gmail_tokens`.

### Supabase Edge Function: `gmail-sync-inbox`
Função que sincroniza as mensagens recebidas da caixa de entrada do Gmail.
- **Frequência**: Executada a cada 2 minutos via `pg_cron`.
- **Limites**: Sincroniza as últimas 20 mensagens por execução para cada usuário ativo.

## 2. Banco de Dados

### Tabela: `gmail_tokens`
Armazena as credenciais OAuth dos usuários.
- **Colunas**: `id`, `user_id`, `email`, `access_token`, `refresh_token`, `expires_at`.

### Tabela: `emails_recebidos`
Armazena as mensagens sincronizadas via Gmail API.

## 3. Fluxo de Envio

1. O frontend chama a função `sendEmail` do hook `useGmail`.
2. O hook invoca a Edge Function `gmail-send`.
3. A função renova o token se necessário e dispara o e-mail via Gmail API.
4. O histórico é salvo na tabela `emails`.
