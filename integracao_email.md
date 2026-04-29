# Documentação da Integração de E-mail

O sistema utiliza a API do **Resend** para o envio de e-mails, integrada via **Supabase Edge Functions**. Abaixo estão os detalhes técnicos e as funcionalidades disponíveis.

## 1. Arquitetura da Integração

- **Provedor de E-mail:** [Resend](https://resend.com/)
- **Backend:** Supabase Edge Function (`send-email`)
- **Frontend:** Página de E-mails (`src/pages/Emails.tsx`)
- **Armazenamento de Dados:** 
  - Tabela `emails`: Histórico de mensagens enviadas.
  - Tabela `user_integrations`: Armazena a API Key e o remetente configurado por cada usuário.
  - Tabela `usuarios`: Armazena a assinatura personalizada do usuário.

## 2. Configurações Necessárias

Cada usuário pode configurar sua própria integração no menu **E-mails > Configurações**:
- **Resend API Key:** Chave pessoal do Resend (deve começar com `re_`).
- **E-mail do Remetente:** Endereço de e-mail que aparecerá como remetente (deve ser um domínio verificado no painel do Resend do usuário).

## 3. Funcionalidades de Envio

### Envio Manual
Na página de E-mails, é possível compor uma nova mensagem definindo:
- **Destinatário:** E-mail de destino.
- **Assunto:** Título do e-mail.
- **Mensagem:** Conteúdo do corpo do e-mail.
- **URL do Logotipo:** Possibilidade de personalizar o logo que aparece no topo do e-mail.

### Templates e Assinatura
Os e-mails enviados utilizam um template HTML profissional que inclui:
- **Header:** Logotipo personalizado.
- **Corpo:** Conteúdo digitado pelo usuário.
- **Footer:** Assinatura do usuário (nome e texto de assinatura configurados no perfil).

## 4. Histórico e Monitoramento
- **Enviados:** Lista completa de e-mails disparados, com status (Enviado/Erro), data, assunto e prévia do conteúdo.
- **Detalhes:** Ao clicar em um e-mail enviado, é possível visualizar o conteúdo completo e o status do envio.

## 5. Endpoints e Segurança
- **Edge Function:** `invoke("send-email")`
- **Segurança:** O sistema utiliza `auth.getUser()` para garantir que apenas usuários autenticados possam disparar e-mails e que utilizem suas próprias credenciais configuradas na tabela `user_integrations`.
