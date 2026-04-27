# Documentação da Funcionalidade de E-mail

Esta documentação detalha a implementação atual da funcionalidade de envio de e-mails via Supabase Edge Functions e Resend.

## 1. Infraestrutura de Backend

### Supabase Edge Function: `send-email`
Uma função em Deno implantada no Supabase que atua como ponte entre a aplicação e a API da Resend.
- **Endpoint**: `/functions/v1/send-email`
- **Segurança**: Utiliza variável de ambiente `RESEND_API_KEY` configurada no Supabase.
- **CORS**: Configurado para permitir chamadas do frontend da aplicação.

### Configuração Atual (Modo Sandbox)
Para fins de teste e validação da conexão, a função está configurada com valores fixos:
- **Remetente (From)**: `onboarding@resend.dev` (Padrão da Resend para domínios não verificados).
- **Destinatário (To)**: `viniciusgodoy.pj@gmail.com` (E-mail verificado da conta Resend).
- **Assunto**: "Teste de Conexão CRM".

## 2. Banco de Dados

### Tabela: `user_domains`
Criada para gerenciar os domínios customizados dos usuários (Whitelabel).
- **Colunas**: `id`, `user_id`, `domain_name`, `status`, `created_at`.
- **Status possíveis**: `pending`, `verified`.

## 3. Fluxo de Execução

1. O frontend faz uma requisição POST para a Edge Function `send-email`.
2. A função verifica a presença da `RESEND_API_KEY`.
3. A função executa uma chamada `fetch` diretamente para `https://api.resend.com/emails`.
4. A Resend processa o envio e retorna o status.
5. A função retorna o sucesso ou o erro detalhado para o frontend.

## 4. Próximos Passos (Produção)

- **Verificação de Domínio**: Configurar os registros DNS (SPF, DKIM) na Resend para remover o limite de sandbox.
- **Dinamicidade**: Atualizar a função para aceitar `to`, `subject` e `html` dinamicamente através do corpo da requisição (body).
- **Logs de Auditoria**: Implementar uma tabela de `email_logs` para rastrear todos os disparos feitos pelo sistema.
